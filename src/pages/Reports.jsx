import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, Spinner, Empty } from "../ui";
import { exportTablePdf } from "../pdf";
import PageHead from "../components/PageHead";

const REPORTS = [
  { id: "stock-summary", label: "Stock Summary" },
  { id: "sales-register", label: "Sales Register" },
  { id: "purchase-register", label: "Purchase Register" },
  { id: "stock-movement", label: "Stock Movement" },
  { id: "supplier-by-item", label: "Supplier Report By Item" },
  { id: "profit-estimate", label: "Profit Estimate" },
  { id: "outstanding", label: "Receivables / Payables" },
  { id: "supplier-outstanding", label: "Supplier Wise Outstanding" },
];

// Reports that are a point-in-time snapshot (no date range applies).
const SNAPSHOT = new Set(["stock-summary", "outstanding", "supplier-outstanding"]);

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };

export default function Reports() {
  const { me } = useAuth();
  const cur = me.tenant.currency;
  const [active, setActive] = useState("stock-summary");
  const [from, setFrom] = useState(monthsAgo(6));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  // Header controls for the generic table (lifted so export reflects the view).
  const [sort, setSort] = useState({ col: null, dir: "asc" });
  const [filters, setFilters] = useState({});

  useEffect(() => {
    setData(null);
    api.get(`/reports/${active}`, { params: { from, to } }).then((r) => setData(r.data));
  }, [active, from, to]);

  // Switch report: reset data + header sort/filter (columns differ per report).
  const selectReport = (id) => { setData(null); setSort({ col: null, dir: "asc" }); setFilters({}); setActive(id); };

  // Columns come from the full dataset so headers/inputs survive a 0-match filter.
  const cols = Array.isArray(data) && data.length
    ? Object.keys(data[0]).filter((c) => c !== "id" && c !== "low_stock") : [];
  const viewRows = Array.isArray(data) ? sortRows(filterRows(data, filters), sort) : data;

  const toggleSort = (col) =>
    setSort((s) => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  const setFilter = (col, val) => setFilters((f) => ({ ...f, [col]: val }));

  const rowsFor = () => active === "profit-estimate" ? [data] : Array.isArray(data) ? viewRows : flattenOutstanding(data);

  const exportCsv = () => {
    const rows = rowsFor();
    if (!rows?.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${active}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const rows = rowsFor();
    if (!rows?.length) return;
    const cols = Object.keys(rows[0]).filter((c) => c !== "id" && c !== "low_stock").map((c) => ({ key: c, label: label(c) }));
    exportTablePdf({
      title: REPORTS.find((r) => r.id === active).label,
      company: me.tenant.name,
      subtitle: SNAPSHOT.has(active) ? "" : `${from} to ${to}`,
      columns: cols, rows, fileName: `${active}.pdf`,
    });
  };

  return (
    <>
      <PageHead
        title="Reports"
        subtitle="Standard business reports — export to CSV, Excel or PDF"
        action={<div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</button>
          <button className="btn-ghost" onClick={exportPdf}><FileText className="h-4 w-4" /> PDF</button>
        </div>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button key={r.id} onClick={() => selectReport(r.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${active === r.id ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {r.label}
          </button>
        ))}
      </div>

      {!SNAPSHOT.has(active) && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="label">From</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm"><span className="label">To</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}

      <div className="card overflow-hidden">
        {data === null ? <div className="grid h-40 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
          : active === "profit-estimate" ? <Profit data={data} cur={cur} />
          : active === "outstanding" ? <Outstanding data={data} cur={cur} />
          : <Table rows={viewRows} cols={cols} total={Array.isArray(data) ? data.length : 0}
              cur={cur} sort={sort} onSort={toggleSort} filters={filters} onFilter={setFilter} />}
      </div>
    </>
  );
}

function Profit({ data, cur }) {
  const cards = [
    ["Sales value", data.sales_value, "text-slate-900"],
    ["Cost of goods", data.cost_value, "text-slate-900"],
    ["Gross profit", data.gross_profit, data.gross_profit >= 0 ? "text-emerald-600" : "text-rose-600"],
  ];
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-3">
      {cards.map(([l, v, c]) => (
        <div key={l} className="rounded-xl bg-slate-50 p-4">
          <div className="text-sm text-slate-500">{l}</div>
          <div className={`mt-1 text-2xl font-extrabold ${c}`}>{fmtMoney(v, cur)}</div>
        </div>
      ))}
      <div className="sm:col-span-3 text-sm text-slate-500">Gross margin: <b className="text-slate-800">{data.margin_pct}%</b></div>
    </div>
  );
}

function Outstanding({ data, cur }) {
  const Block = ({ title, rows }) => (
    <div>
      <h3 className="mb-2 px-1 font-bold text-slate-700">{title}</h3>
      {rows.length === 0 ? <p className="px-1 text-sm text-slate-400">None outstanding</p> : (
        <table className="w-full"><tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100"><td className="td">{r.name}</td><td className="td text-right font-semibold">{fmtMoney(r.outstanding, cur)}</td></tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
  return (
    <div className="grid gap-6 p-5 sm:grid-cols-2">
      <Block title="Receivables (from customers)" rows={data?.receivables || []} />
      <Block title="Payables (to suppliers)" rows={data?.payables || []} />
    </div>
  );
}

const MONEY_COLS = new Set(["subtotal", "tax_total", "grand_total", "paid", "received", "valuation", "cost_price", "avg_price", "value", "total_billed", "outstanding"]);

function Table({ rows, cols, total, cur, sort, onSort, filters, onFilter }) {
  if (!cols.length) return <Empty title="No data for this period" />;
  const hidden = total - rows.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          {/* Click a header to sort (toggles asc/desc). */}
          <tr className="bg-slate-50">
            {cols.map((c) => {
              const on = sort.col === c;
              return (
                <th key={c} className={`th ${MONEY_COLS.has(c) ? "text-right" : ""}`}>
                  <button type="button" onClick={() => onSort(c)} title="Sort by this column"
                    className={`inline-flex items-center gap-1 hover:text-brand-600 ${MONEY_COLS.has(c) ? "flex-row-reverse" : ""} ${on ? "text-brand-600" : ""}`}>
                    <span>{label(c)}</span>
                    <span className="text-[10px] leading-none">{on ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                  </button>
                </th>
              );
            })}
          </tr>
          {/* Type to filter rows where the column contains the text. */}
          <tr className="bg-slate-50">
            {cols.map((c) => (
              <th key={c} className="px-3 pb-2">
                <input value={filters[c] || ""} onChange={(e) => onFilter(c, e.target.value)} placeholder="Filter…"
                  className="w-full min-w-[80px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-normal text-slate-700 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} className="td text-center text-slate-400">No rows match the filters</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              {cols.map((c) => <td key={c} className={`td ${MONEY_COLS.has(c) ? "text-right" : ""}`}>{MONEY_COLS.has(c) ? fmtMoney(r[c], cur) : String(r[c] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">Showing {rows.length} of {total} rows</div>
      )}
    </div>
  );
}

const label = (c) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// Substring filter across all active column inputs (case-insensitive, AND-combined).
const filterRows = (rows, filters) => {
  const active = Object.entries(filters).filter(([, v]) => String(v).trim());
  if (!active.length) return rows;
  return rows.filter((r) => active.every(([c, v]) => String(r[c] ?? "").toLowerCase().includes(String(v).toLowerCase())));
};
// Numeric-aware sort; nulls sink to the bottom regardless of direction.
const sortRows = (rows, { col, dir }) => {
  if (!col) return rows;
  const s = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[col], y = b[col];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * s;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) * s;
  });
};
const flattenOutstanding = (d) => [
  ...(d.receivables || []).map((r) => ({ type: "receivable", ...r })),
  ...(d.payables || []).map((r) => ({ type: "payable", ...r })),
];
