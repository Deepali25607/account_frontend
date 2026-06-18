import { useEffect, useState } from "react";
import { Plus, Search, SlidersHorizontal, Package, Pencil, Trash2, Camera, Upload, FileDown, CheckCircle2, AlertTriangle } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, fmtNum, Modal, Field, useToast, apiError, Empty, Spinner, Pager, DetailModal } from "../ui";
import PageHead from "../components/PageHead";
import BarcodeScanner from "../components/BarcodeScanner";

// Kept in sync with MATERIAL_TYPES in account-backend/src/routes/masters.js
const MATERIAL_TYPES = [
  { id: "raw", label: "Raw Material" },
  { id: "semi_finished", label: "Semi-Finished" },
  { id: "finished", label: "Finished Good" },
  { id: "trading", label: "Trading Good" },
  { id: "consumable", label: "Consumable" },
  { id: "service", label: "Service" },
];
const MATERIAL_LABEL = Object.fromEntries(MATERIAL_TYPES.map((m) => [m.id, m.label]));
// Mirrors SKU_PREFIX in account-backend/src/routes/masters.js (display hint only).
const SKU_PREFIX = { raw: "RM", semi_finished: "SF", finished: "FG", trading: "TG", consumable: "CM", service: "SV" };
const MATERIAL_STYLE = {
  raw: "bg-amber-100 text-amber-700", semi_finished: "bg-orange-100 text-orange-700",
  finished: "bg-emerald-100 text-emerald-700", trading: "bg-brand-100 text-brand-700",
  consumable: "bg-slate-100 text-slate-600", service: "bg-violet-100 text-violet-700",
};

const blank = { sku: "", name: "", barcode: "", hsn: "", category: "", material_type: "trading", uom: "unit", cost_price: 0, sale_price: 0, tax_rate: 0, stock_qty: 0, reorder_lvl: 0 };
const PAGE_SIZE = 20;

// CSV import template + minimal RFC-4180-ish parser (handles quotes & embedded commas).
const IMPORT_COLUMNS = ["sku", "name", "material_type", "hsn", "barcode", "category", "uom", "cost_price", "sale_price", "tax_rate", "stock_qty", "reorder_lvl"];
const TEMPLATE_CSV =
  IMPORT_COLUMNS.join(",") + "\n" +
  "SAMPLE-001,Sample Widget,trading,8479,8901111000017,General,pcs,100,150,18,50,10\n" +
  "SAMPLE-002,Sample Raw Steel,raw,7208,,Metals,kg,40,0,18,500,100\n";

function parseCsv(text) {
  const rows = []; let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export default function Inventory() {
  const { me, can } = useAuth();
  const cur = me.tenant.currency;
  const isAdmin = me.user.role === "owner";
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [edit, setEdit] = useState(null);     // item being edited or blank for new
  const [adjust, setAdjust] = useState(null); // item being adjusted
  const [del, setDel] = useState(null);       // item pending delete
  const [importing, setImporting] = useState(false);
  const [viewing, setViewing] = useState(null);   // item being viewed
  const [movements, setMovements] = useState(null);

  const openItem = (it) => {
    setViewing(it); setMovements(null);
    api.get(`/items/${it.id}/movements`).then((r) => setMovements(r.data));
  };

  const load = () => {
    const params = { page, pageSize: PAGE_SIZE };
    if (search) params.search = search;
    if (lowOnly) params.lowStock = "true";
    api.get("/items", { params }).then((r) => { setItems(r.data.rows); setTotal(r.data.total); });
  };
  useEffect(load, [search, lowOnly, page]);
  useEffect(() => { setPage(1); }, [search, lowOnly]); // reset to first page on filter change

  return (
    <>
      <PageHead
        title="Inventory"
        subtitle="Item master, real-time stock levels & valuation"
        action={
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setImporting(true)}><Upload className="h-4 w-4" /> Import</button>
            <button className="btn-primary" onClick={() => setEdit({ ...blank })}><Plus className="h-4 w-4" /> New item</button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setLowOnly((v) => !v)} className={`btn-ghost ${lowOnly ? "border-rose-300 text-rose-600" : ""}`}>
          <SlidersHorizontal className="h-4 w-4" /> Low stock only
        </button>
      </div>

      <div className="card overflow-hidden">
        {items === null ? (
          <div className="grid h-40 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
        ) : items.length === 0 ? (
          <Empty icon={Package} title="No items yet" hint="Add your first stock item to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr className="bg-slate-50">
                <th className="th">Item</th><th className="th">Material type</th><th className="th">Stock</th>
                {can("gst") && <th className="th">GST</th>}
                <th className="th">Cost</th><th className="th">Valuation</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {items.map((it) => {
                  const low = it.stock_qty <= it.reorder_lvl;
                  return (
                    <tr key={it.id} onClick={() => openItem(it)} className="cursor-pointer hover:bg-slate-50/60">
                      <td className="td">
                        <div className="font-semibold text-slate-800">{it.name}</div>
                        <div className="text-xs text-slate-400">{it.sku}{it.category ? ` · ${it.category}` : ""}</div>
                      </td>
                      <td className="td">
                        <span className={`badge ${MATERIAL_STYLE[it.material_type] || "bg-slate-100 text-slate-600"}`}>
                          {MATERIAL_LABEL[it.material_type] || it.material_type}
                        </span>
                      </td>
                      <td className="td">
                        <span className={`badge ${low ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {fmtNum(it.stock_qty)} {it.uom}
                        </span>
                        {low && <div className="mt-0.5 text-[11px] text-rose-500">≤ reorder {fmtNum(it.reorder_lvl)}</div>}
                      </td>
                      {can("gst") && <td className="td">{it.tax_rate}%</td>}
                      <td className="td">{fmtMoney(it.cost_price, cur)}</td>
                      <td className="td font-medium">{fmtMoney(it.stock_qty * it.cost_price, cur)}</td>
                      <td className="td text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button className="btn-ghost btn-sm" onClick={() => setAdjust(it)}>Adjust</button>
                        <button className="btn-ghost btn-sm ml-1" onClick={() => setEdit(it)}><Pencil className="h-3.5 w-3.5" /></button>
                        {isAdmin && <button className="btn-ghost btn-sm ml-1 text-rose-600 hover:bg-rose-50" onClick={() => setDel(it)} title="Delete item"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {items && items.length > 0 && <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
      </div>

      {viewing && (
        <DetailModal
          open onClose={() => setViewing(null)}
          title={viewing.name}
          subtitle={`${viewing.sku}${viewing.category ? ` · ${viewing.category}` : ""}`}
          fields={[
            { label: "Material type", value: MATERIAL_LABEL[viewing.material_type] || viewing.material_type },
            viewing.barcode && { label: "Barcode", value: viewing.barcode },
            can("gst") && viewing.hsn && { label: "HSN / SAC", value: viewing.hsn },
            { label: "Unit", value: viewing.uom },
            { label: "Stock on hand", value: `${fmtNum(viewing.stock_qty)} ${viewing.uom}` },
            { label: "Reorder level", value: fmtNum(viewing.reorder_lvl) },
            can("gst") && { label: "GST", value: `${viewing.tax_rate}%` },
            { label: "Cost price", value: fmtMoney(viewing.cost_price, cur) },
            { label: "Sale price", value: fmtMoney(viewing.sale_price, cur) },
            { label: "Stock valuation", value: fmtMoney(viewing.stock_qty * viewing.cost_price, cur) },
          ]}
        >
          <div className="mt-5">
            <div className="mb-2 label">Recent stock movements</div>
            {movements === null ? <div className="grid h-20 place-items-center"><Spinner className="h-5 w-5 text-brand-500" /></div>
              : movements.length === 0 ? <p className="text-sm text-slate-400">No movements recorded.</p>
              : (
                <div className="max-h-64 overflow-auto rounded-xl border border-slate-100">
                  <table className="w-full"><thead><tr className="bg-slate-50"><th className="th">When</th><th className="th">Reason</th><th className="th text-right">Change</th></tr></thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id} className="border-t border-slate-100">
                          <td className="td text-slate-500">{m.created_at}</td>
                          <td className="td capitalize">{m.reason.replace(/_/g, " ")}{m.note ? ` · ${m.note}` : ""}</td>
                          <td className={`td text-right font-medium ${m.qty_delta < 0 ? "text-rose-600" : "text-emerald-600"}`}>{m.qty_delta > 0 ? "+" : ""}{fmtNum(m.qty_delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </DetailModal>
      )}

      {edit && <ItemModal item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} canGst={can("gst")} />}
      {adjust && <AdjustModal item={adjust} cur={cur} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); load(); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} reload={load} />}
      {del && <DeleteModal item={del} onClose={() => setDel(null)} onDeleted={() => { setDel(null); load(); }} />}
    </>
  );

  function ItemModal({ item, onClose, onSaved, canGst }) {
    const [f, setF] = useState(item);
    const [busy, setBusy] = useState(false);
    const [scanCam, setScanCam] = useState(false);
    const isNew = !item.id;
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const save = async () => {
      setBusy(true);
      try {
        if (isNew) await api.post("/items", f);
        else await api.put(`/items/${item.id}`, f);
        toast.success(isNew ? "Item created" : "Item updated");
        onSaved();
      } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
    };
    return (
      <Modal open title={isNew ? "New item" : "Edit item"} onClose={onClose}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU (optional)">
            <input className="input" value={f.sku} onChange={set("sku")} disabled={!isNew} placeholder={isNew ? `Auto e.g. ${SKU_PREFIX[f.material_type] || "IT"}-00001` : ""} />
            {isNew && !f.sku && <p className="mt-1 text-xs text-slate-400">Leave blank to auto-generate as <b>{SKU_PREFIX[f.material_type] || "IT"}-…</b></p>}
          </Field>
          <Field label="Unit of measure"><input className="input" value={f.uom} onChange={set("uom")} /></Field>
          <div className="col-span-2"><Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field></div>
          <div className="col-span-2"><Field label="Barcode (scan or type — optional)">
            <div className="flex gap-2">
              <input className="input" value={f.barcode || ""} onChange={set("barcode")} placeholder="e.g. 8901234567890" autoComplete="off" />
              <button type="button" onClick={() => setScanCam(true)} className="btn-ghost shrink-0" title="Scan with camera">
                <Camera className="h-4 w-4" /> Scan
              </button>
            </div>
          </Field></div>
          <Field label="Material type">
            <select className="input" value={f.material_type || "trading"} onChange={set("material_type")}>
              {MATERIAL_TYPES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Category"><input className="input" value={f.category || ""} onChange={set("category")} /></Field>
          {canGst && <Field label="HSN / SAC code"><input className="input" value={f.hsn || ""} onChange={set("hsn")} placeholder="e.g. 9401" autoComplete="off" /></Field>}
          {canGst && <Field label="GST %"><input type="number" className="input" value={f.tax_rate} onChange={set("tax_rate")} /></Field>}
          <Field label="Cost price"><input type="number" className="input" value={f.cost_price} onChange={set("cost_price")} /></Field>
          <Field label="Sale price"><input type="number" className="input" value={f.sale_price} onChange={set("sale_price")} /></Field>
          {isNew && <Field label="Opening stock"><input type="number" className="input" value={f.stock_qty} onChange={set("stock_qty")} /></Field>}
          <Field label="Reorder level"><input type="number" className="input" value={f.reorder_lvl} onChange={set("reorder_lvl")} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Save</button>
        </div>
        <BarcodeScanner open={scanCam} onClose={() => setScanCam(false)} onDetect={(code) => { setScanCam(false); setF((x) => ({ ...x, barcode: code })); toast.success("Barcode captured"); }} />
      </Modal>
    );
  }

  function DeleteModal({ item, onClose, onDeleted }) {
    const [busy, setBusy] = useState(false);
    const go = async () => {
      setBusy(true);
      try { await api.delete(`/items/${item.id}`); toast.success("Item deleted"); onDeleted(); }
      catch (e) { toast.error(apiError(e)); setBusy(false); }
    };
    return (
      <Modal open title="Delete item" onClose={onClose}>
        <p className="text-sm text-slate-600">Delete <b>{item.name}</b> <span className="text-slate-400">({item.sku})</span>? This also removes its stock history and can't be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary !bg-rose-600 hover:!bg-rose-700" disabled={busy} onClick={go}>{busy && <Spinner className="h-4 w-4" />} Delete</button>
        </div>
      </Modal>
    );
  }

  function ImportModal({ onClose, reload }) {
    const [rows, setRows] = useState(null);   // parsed item objects
    const [fileName, setFileName] = useState("");
    const [parseErr, setParseErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const downloadTemplate = () => {
      const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "item-import-template.csv"; a.click();
      URL.revokeObjectURL(url);
    };

    const onFile = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name); setResult(null); setParseErr(""); setRows(null);
      try {
        const grid = parseCsv(await file.text()).filter((r) => r.some((c) => c.trim() !== ""));
        if (grid.length < 2) throw new Error("The file has a header but no data rows.");
        const header = grid[0].map((h) => h.trim().toLowerCase());
        for (const req of ["sku", "name", "material_type"]) {
          if (!header.includes(req)) throw new Error(`Missing required column: "${req}". Use the sample template.`);
        }
        const items = grid.slice(1).map((cols) => {
          const o = {};
          header.forEach((h, i) => { o[h] = (cols[i] ?? "").trim(); });
          return o;
        });
        setRows(items);
      } catch (err) {
        setParseErr(err.message || "Could not read this file.");
      }
    };

    const doImport = async () => {
      setBusy(true);
      try {
        const { data } = await api.post("/items/bulk", { items: rows });
        setResult(data);
        if (data.created) toast.success(`${data.created} item${data.created === 1 ? "" : "s"} imported`);
        if (!data.failed.length) toast.success("All rows imported cleanly");
        reload();
      } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
    };

    return (
      <Modal open wide title="Import items" onClose={onClose}>
        {!result ? (
          <>
            <ol className="mb-4 space-y-1 text-sm text-slate-600">
              <li><b>1.</b> Download the sample CSV template.</li>
              <li><b>2.</b> Fill one item per row (keep the header row).</li>
              <li><b>3.</b> Upload it below to create all items at once.</li>
            </ol>
            <button className="btn-ghost mb-4" onClick={downloadTemplate}><FileDown className="h-4 w-4" /> Download sample template</button>

            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
              <input id="csvfile" type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
              <label htmlFor="csvfile" className="btn-primary cursor-pointer"><Upload className="h-4 w-4" /> Choose CSV file</label>
              {fileName && <p className="mt-2 text-sm text-slate-500">{fileName}</p>}
              {rows && <p className="mt-1 text-sm font-medium text-emerald-600">{rows.length} row{rows.length === 1 ? "" : "s"} ready to import</p>}
              {parseErr && <p className="mt-2 text-sm text-rose-600">{parseErr}</p>}
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Required columns: <b>sku</b>, <b>name</b>, <b>material_type</b> (one of: raw, semi_finished, finished, trading, consumable, service).
              Optional: hsn, barcode, category, uom, cost_price, sale_price, tax_rate, stock_qty, reorder_lvl.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={busy || !rows} onClick={doImport}>{busy && <Spinner className="h-4 w-4" />} Import {rows ? `${rows.length} items` : ""}</button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div>
                <div className="text-lg font-bold text-slate-800">{result.created} of {result.total} items created</div>
                {result.failed.length > 0 && <div className="text-sm text-rose-600">{result.failed.length} row{result.failed.length === 1 ? "" : "s"} skipped</div>}
              </div>
            </div>
            {result.failed.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-100">
                <table className="w-full">
                  <thead><tr className="bg-slate-50"><th className="th">Row</th><th className="th">SKU</th><th className="th">Problem</th></tr></thead>
                  <tbody>
                    {result.failed.map((f, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="td text-slate-500">{f.row}</td>
                        <td className="td">{f.sku || "—"}</td>
                        <td className="td text-rose-600"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{f.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              {result.failed.length > 0 && <button className="btn-ghost" onClick={() => { setResult(null); setRows(null); setFileName(""); }}>Import more</button>}
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </Modal>
    );
  }

  function AdjustModal({ item, cur, onClose, onSaved }) {
    const [delta, setDelta] = useState("");
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const save = async () => {
      setBusy(true);
      try {
        await api.post(`/items/${item.id}/adjust`, { qty_delta: Number(delta), reason });
        toast.success("Stock adjusted");
        onSaved();
      } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
    };
    return (
      <Modal open title={`Adjust stock — ${item.name}`} onClose={onClose}>
        <p className="mb-3 text-sm text-slate-500">Current: <b>{fmtNum(item.stock_qty)} {item.uom}</b> · valuation {fmtMoney(item.stock_qty * item.cost_price, cur)}</p>
        <Field label="Quantity change (+ in / − out)"><input type="number" className="input" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. -5 for wastage" /></Field>
        <div className="mt-3"><Field label="Reason (required)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damage, wastage, stock-count correction…" /></Field></div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !delta || !reason} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Apply</button>
        </div>
      </Modal>
    );
  }
}
