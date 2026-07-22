import { useEffect, useState } from "react";
import { Download, FileText, FileSpreadsheet, Printer, Share2, Users, Truck, X, Search, Receipt, Package, TrendingUp, Wallet, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, Spinner, Empty, Modal, useToast, apiError, SkeletonRows } from "../ui";
import { exportTablePdf } from "../pdf";
import { outputFile } from "../files";
import { waUrl, normalizePhone } from "../share";
import PageHead from "../components/PageHead";
import DateRangeFilter, { presetRange } from "../components/DateRangeFilter";

// Reports grouped into modules — the page shows a module picker, then one card
// per report in that module (click a card to open the report).
const MODULES = [
  { label: "Sales", icon: Receipt, reports: [
    { id: "sales-register", label: "Sales Register", desc: "Every sale invoice and credit note in the period." },
  ]},
  { label: "Purchase", icon: Truck, reports: [
    { id: "purchase-register", label: "Purchase Register", desc: "Every purchase bill and debit note in the period." },
    { id: "supplier-by-item", label: "Supplier Report By Item", desc: "Qty and value purchased per item, by supplier." },
  ]},
  { label: "Inventory", icon: Package, reports: [
    { id: "stock-summary", label: "Stock Summary", desc: "Current quantity and valuation of every item." },
    { id: "stock-movement", label: "Stock Movement", desc: "Every stock in and out over the period." },
  ]},
  { label: "Profit", icon: TrendingUp, reports: [
    { id: "profit-estimate", label: "Profit Estimate", desc: "Sales, cost of goods and gross margin for the period." },
    { id: "bill-profit", label: "Bill Wise Profit", desc: "Gross profit earned on each sale invoice." },
    { id: "category-profit", label: "Category Wise Profit", desc: "Sales, cost and profit rolled up by item category." },
  ]},
  { label: "Outstanding", icon: Wallet, reports: [
    { id: "outstanding", label: "Receivables / Payables", desc: "Who owes you and whom you owe, right now." },
    { id: "supplier-outstanding", label: "Supplier Wise Outstanding", desc: "Unpaid balance per supplier, with ageing." },
    { id: "customer-outstanding", label: "Customer Wise Outstanding", desc: "Unpaid balance per customer, with ageing." },
  ]},
];
const REPORTS = MODULES.flatMap((m) => m.reports);

// Reports that are a point-in-time snapshot (no date range applies).
const SNAPSHOT = new Set(["stock-summary", "outstanding", "supplier-outstanding", "customer-outstanding"]);
// Reports rendered as custom layouts rather than the generic sortable table.
const CUSTOM_VIEW = new Set(["profit-estimate", "outstanding"]);

export default function Reports() {
  const { me } = useAuth();
  const cur = me.tenant.currency;
  const [modIdx, setModIdx] = useState(0);
  const [active, setActive] = useState(null); // null = show the module's report cards
  const [preset, setPreset] = useState("last365");
  const [range, setRange] = useState(() => presetRange("last365"));
  const [data, setData] = useState(null);
  // Header controls for the generic table (lifted so export reflects the view).
  const [sort, setSort] = useState({ col: null, dir: "asc" });
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!active) return;
    setData(null);
    api.get(`/reports/${active}`, { params: { from: range.from, to: range.to } }).then((r) => setData(r.data));
  }, [active, range.from, range.to]);

  // Open a report: reset header sort/search (columns differ per report).
  const selectReport = (id) => { setData(null); setSort({ col: null, dir: "asc" }); setQ(""); setActive(id); };
  // Switch module (or press Back): return to that module's card list.
  const pickModule = (i) => { setModIdx(i); setData(null); setActive(null); };
  const pickPreset = (id) => { setPreset(id); if (id !== "custom") setRange(presetRange(id)); };
  const mod = MODULES[modIdx];

  // Columns come from the full dataset so headers survive a 0-match search.
  const cols = Array.isArray(data) && data.length
    ? Object.keys(data[0]).filter((c) => c !== "id" && c !== "low_stock") : [];
  const viewRows = Array.isArray(data) ? sortRows(filterRows(data, q), sort) : data;

  const toggleSort = (col) =>
    setSort((s) => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });

  const rowsFor = () => data == null ? [] : active === "profit-estimate" ? [data] : Array.isArray(data) ? viewRows : flattenOutstanding(data);

  const [shareOpen, setShareOpen] = useState(false);
  const toast = useToast();
  const reportLabel = active ? REPORTS.find((r) => r.id === active).label : "";
  const period = SNAPSHOT.has(active) || !range.from ? "" : `${range.from} to ${range.to}`;
  const exportCols = (rows) => Object.keys(rows[0]).filter((c) => c !== "id" && c !== "low_stock");

  // Each export returns "shared" | "downloaded" (see files.js) — in the mobile
  // app / mobile browsers the native share sheet opens right after the file is
  // generated, so it can go straight to WhatsApp / email / SMS / any app.
  const exportCsv = (shareText) => {
    const rows = rowsFor();
    if (!rows?.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
    return outputFile({ blob: new Blob([csv], { type: "text/csv" }), fileName: `${active}.csv`, mimeType: "text/csv", text: shareText });
  };

  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const exportExcel = async (shareText) => {
    const rows = rowsFor();
    if (!rows?.length) return;
    const cols = exportCols(rows);
    const XLSX = await import("xlsx"); // code-split: loaded on first Excel export
    const ws = XLSX.utils.aoa_to_sheet([cols.map(label), ...rows.map((r) => cols.map((c) => r[c] ?? ""))]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportLabel.slice(0, 31)); // sheet names cap at 31 chars
    const blob = new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: XLSX_MIME });
    return outputFile({ blob, fileName: `${active}.xlsx`, mimeType: XLSX_MIME, text: shareText });
  };

  const exportPdf = (shareText, mode = "save") => {
    const rows = rowsFor();
    if (!rows?.length) return;
    const cols = exportCols(rows).map((c) => ({ key: c, label: label(c) }));
    return exportTablePdf({
      title: reportLabel,
      company: me.tenant.name,
      subtitle: period,
      columns: cols, rows, fileName: `${active}.pdf`, shareText, mode,
    });
  };

  return (
    <>
      <PageHead
        title="Reports"
        subtitle="Choose a module to see its reports — each report has filters and CSV / Excel / PDF export"
        action={active && <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => exportCsv()}><Download className="h-4 w-4" /> CSV</button>
          <button className="btn-ghost" onClick={() => exportExcel()}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
          <button className="btn-ghost" onClick={() => exportPdf()}><FileText className="h-4 w-4" /> PDF</button>
          <button className="btn-ghost" onClick={() => exportPdf(undefined, "print")}><Printer className="h-4 w-4" /> Print</button>
          <button className="btn-primary" onClick={() => setShareOpen(true)}><Share2 className="h-4 w-4" /> Share</button>
        </div>}
      />

      <ShareReportModal
        open={shareOpen} onClose={() => setShareOpen(false)} toast={toast}
        reportLabel={reportLabel} period={period} company={me.tenant.name}
        hasData={!!rowsFor()?.length}
        onShare={(format, message) => format === "excel" ? exportExcel(message) : exportPdf(message)}
      />

      <div className="mb-4">
        <ModulePicker modules={MODULES} value={modIdx} onPick={pickModule} />
      </div>

      {!active ? (
        /* Card per report in the chosen module — click to open. */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mod.reports.map((r) => (
            <button key={r.id} onClick={() => selectReport(r.id)}
              className="card flex items-center gap-3 p-4 text-left transition-shadow hover:shadow-md">
              <div>
                <div className="font-bold text-slate-800">{r.label}</div>
                <div className="mt-0.5 text-sm text-slate-500">{r.desc}</div>
              </div>
              <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-slate-400" />
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={() => pickModule(modIdx)}><ArrowLeft className="h-4 w-4" /> Back</button>
            <span className="font-bold text-slate-800">{reportLabel}</span>
          </div>

          {(!SNAPSHOT.has(active) || !CUSTOM_VIEW.has(active)) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {!SNAPSHOT.has(active) && (
                <DateRangeFilter preset={preset} range={range} onPreset={pickPreset} onCustom={(patch) => setRange((r) => ({ ...r, ...patch }))} />
              )}
              {!CUSTOM_VIEW.has(active) && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className="input w-56 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this report…" />
                </div>
              )}
            </div>
          )}

          <div className="card overflow-hidden">
            {data === null ? <div className="p-4"><SkeletonRows rows={6} /></div>
              : active === "profit-estimate" ? <Profit data={data} cur={cur} />
              : active === "outstanding" ? <Outstanding data={data} cur={cur} />
              : <Table rows={viewRows} cols={cols} total={Array.isArray(data) ? data.length : 0}
                  cur={cur} sort={sort} onSort={toggleSort} searching={!!q.trim()} />}
          </div>
        </>
      )}
    </>
  );
}

/** "Module" dropdown: icon + name + report count per module, like the reference
 *  design. A transparent full-screen backdrop closes it on any outside click. */
function ModulePicker({ modules, value, onPick }) {
  const [open, setOpen] = useState(false);
  const mod = modules[value];
  const Icon = mod.icon;
  const Badge = ({ n }) => <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{n}</span>;
  return (
    <div className="relative inline-block">
      <span className="label">Module</span>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-64 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50">
        <Icon className="h-4 w-4 text-brand-600" />
        <span>{mod.label}</span>
        <Badge n={mod.reports.length} />
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {modules.map((m, i) => {
              const MIcon = m.icon;
              return (
                <button key={m.label} type="button" onClick={() => { onPick(i); setOpen(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-slate-50 ${i === value ? "bg-brand-50 text-brand-700" : "text-slate-700"}`}>
                  <MIcon className={`h-4 w-4 ${i === value ? "text-brand-600" : "text-slate-400"}`} />
                  <span>{m.label}</span>
                  <Badge n={m.reports.length} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
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

const MONEY_COLS = new Set(["subtotal", "tax_total", "grand_total", "paid", "received", "valuation", "cost_price", "avg_price", "value", "total_billed", "outstanding", "0-30", "31-60", "61-90", "90+", "sales_value", "cost_value", "gross_profit"]);

function Table({ rows, cols, total, cur, sort, onSort, searching }) {
  if (!cols.length) return <Empty title="No data for this period" />;
  const hidden = total - rows.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          {/* Click a header to sort (toggles asc/desc); the arrow shows only on the active column. */}
          <tr className="bg-slate-50">
            {cols.map((c) => {
              const on = sort.col === c;
              return (
                <th key={c} className={`th ${MONEY_COLS.has(c) ? "text-right" : ""}`}>
                  <button type="button" onClick={() => onSort(c)} title="Sort by this column"
                    className={`inline-flex items-center gap-1 transition-colors hover:text-brand-600 ${MONEY_COLS.has(c) ? "flex-row-reverse" : ""} ${on ? "text-brand-600" : ""}`}>
                    <span>{label(c)}</span>
                    {on && <span className="text-[10px] leading-none">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} className="td text-center text-slate-400">{searching ? "No rows match your search" : "No rows in this period"}</td></tr>
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
// One search box for the whole table: keep rows where any column contains the text.
const filterRows = (rows, q) => {
  const needle = String(q).trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(needle)));
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

/**
 * "Share report" dialog: pick the format (PDF / Excel) and optionally a customer
 * or supplier — their name personalises the message that travels with the file.
 * On the mobile app / mobile browsers sharing opens the native share sheet
 * (WhatsApp, email, SMS, any installed app) with the report attached. On desktop
 * the file downloads and, if the chosen party has a phone number, WhatsApp opens
 * pre-addressed to them with the message so only the attachment is manual.
 */
function ShareReportModal({ open, onClose, reportLabel, period, company, hasData, onShare, toast }) {
  const [format, setFormat] = useState("pdf");
  const [parties, setParties] = useState(null); // null = not loaded yet
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  // WhatsApp destination — prefilled from the chosen party, but freely editable
  // so a report can go to any number even without a party on record.
  const [cc, setCc] = useState("91");
  const [num, setNum] = useState("");
  const waValid = normalizePhone(num, cc).length >= 10;

  // Load customers + suppliers once, on first open, so the picker is instant.
  useEffect(() => {
    if (!open || parties) return;
    Promise.all([api.get("/customers"), api.get("/vendors")])
      .then(([c, v]) => setParties([
        ...c.data.map((p) => ({ ...p, kind: "Customer" })),
        ...v.data.map((p) => ({ ...p, kind: "Supplier" })),
      ]))
      .catch(() => setParties([]));
  }, [open, parties]);

  const needle = q.trim().toLowerCase();
  const matches = needle
    ? (parties || []).filter((p) => `${p.name} ${p.phone || ""} ${p.email || ""}`.toLowerCase().includes(needle)).slice(0, 6)
    : [];

  const message = `${sel ? `Hi ${sel.name},` : "Hi,"}\n\nPlease find the ${reportLabel}${period ? ` (${period})` : ""} report from ${company}.\n\nThank you!`;

  const send = async () => {
    setBusy(true);
    try {
      const result = await onShare(format, message);
      if (result === "downloaded") {
        // Desktop: wa.me can't attach files — open the chat pre-addressed so
        // only attaching the just-downloaded report is manual.
        if (waValid) {
          window.open(waUrl(normalizePhone(num, cc), message), "_blank");
          toast.success("Report downloaded — attach it in the WhatsApp chat that just opened");
        } else toast.success("Report downloaded");
      }
      onClose();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Share report">
      <div className="space-y-4">
        <div>
          <span className="label">Format</span>
          <div className="flex gap-2">
            {[["pdf", "PDF", FileText], ["excel", "Excel", FileSpreadsheet]].map(([id, lbl, Icon]) => (
              <button key={id} onClick={() => setFormat(id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${format === id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <Icon className="h-4 w-4" /> {lbl}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Send to (optional)</span>
          {sel ? (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2">
              <div className="text-sm">
                <div className="font-semibold text-slate-800">{sel.name} <span className="text-xs font-normal text-slate-400">· {sel.kind}</span></div>
                <div className="text-xs text-slate-500">{[sel.phone, sel.email].filter(Boolean).join("  ·  ") || "No contact details on record"}</div>
              </div>
              <button className="btn-ghost btn-sm" onClick={() => setSel(null)} title="Clear"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={parties === null ? "Loading customers & suppliers…" : "Search customer or supplier…"} />
              {matches.length > 0 && (
                <div className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {matches.map((p) => (
                    <button key={`${p.kind}-${p.id}`} onClick={() => { setSel(p); setNum(String(p.phone || "").replace(/\D/g, "").replace(/^0+/, "")); setQ(""); }}
                      className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50">
                      {p.kind === "Customer" ? <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="ml-auto text-xs text-slate-400">{p.phone || p.email || ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {needle && parties !== null && matches.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">No customer or supplier matches “{q}”.</p>
              )}
            </>
          )}
        </div>

        <div>
          <span className="label">WhatsApp number (optional)</span>
          <div className="flex items-center gap-2">
            <input className="input !w-16" value={cc} onChange={(e) => setCc(e.target.value)} inputMode="numeric" title="Country code" />
            <input className="input" value={num} onChange={(e) => setNum(e.target.value)} placeholder="Mobile number" inputMode="tel" />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            On a phone the share sheet opens with the report attached — pick WhatsApp there. On desktop the report downloads and, with a number here, the WhatsApp chat opens ready for the attachment.
          </p>
        </div>

        <div>
          <span className="label">Message</span>
          <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{message}</p>
        </div>

        <button className="btn-primary w-full justify-center" disabled={!hasData || busy} onClick={send}>
          {busy ? <Spinner className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} Share {format === "pdf" ? "PDF" : "Excel"}
        </button>
        {!hasData && <p className="text-center text-xs text-slate-400">This report has no data to share yet.</p>}
      </div>
    </Modal>
  );
}
