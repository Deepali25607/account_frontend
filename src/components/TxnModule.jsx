import { useEffect, useState } from "react";
import { Plus, Trash2, FileText, ScanLine, Camera } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, Modal, Field, useToast, apiError, Empty, Spinner, Pager, DetailModal } from "../ui";
import { exportInvoicePdf } from "../pdf";
import PageHead from "./PageHead";
import BarcodeScanner from "./BarcodeScanner";

const PAGE_SIZE = 20;

/** One figure in the document money summary. `strong` = bold total, `accent` = brand colour. */
function Sum({ label, value, strong, accent }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`text-sm ${strong ? "font-bold text-slate-900" : accent ? "font-bold text-brand-700" : "font-medium text-slate-800"}`}>{value}</dd>
    </div>
  );
}

/**
 * Generic purchase/sale document module. cfg supplies the differences:
 *  kind: "purchase" | "sale"
 *  endpoint, partyResource, partyKey, partyLabel, paymentKey, paymentLabel, returnLabel
 */
export default function TxnModule({ cfg }) {
  const { me, can } = useAuth();
  const cur = me.tenant.currency;
  const toast = useToast();
  const [docs, setDocs] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);

  const openDoc = async (d) => {
    try { const { data } = await api.get(`/${cfg.endpoint}/${d.id}`); setViewing({ ...data, _party: d[cfg.partyNameKey] }); }
    catch (e) { toast.error(apiError(e)); }
  };

  const load = () => {
    setDocs(null);
    api.get(`/${cfg.endpoint}`, { params: { page, pageSize: PAGE_SIZE } }).then((r) => { setDocs(r.data.rows); setTotal(r.data.total); });
  };
  useEffect(load, [cfg.endpoint, page]);

  const act = async (id, action) => {
    try { await api.post(`/${cfg.endpoint}/${id}/${action}`); toast.success(action === "confirm" ? "Purchase approved — stock updated" : "Draft cancelled"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const STATUS = { confirmed: "bg-emerald-100 text-emerald-700", draft: "bg-amber-100 text-amber-700", cancelled: "bg-slate-200 text-slate-500" };

  const downloadInvoice = async (d) => {
    try {
      const { data } = await api.get(`/sales/${d.id}`);
      exportInvoicePdf({ company: me.tenant.name, currency: cur, doc: data, customer: d[cfg.partyNameKey] });
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <>
      <PageHead
        title={cfg.title}
        subtitle={cfg.subtitle}
        action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> {cfg.newLabel}</button>}
      />

      <div className="card overflow-hidden">
        {docs === null ? (
          <div className="grid h-40 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
        ) : docs.length === 0 ? (
          <Empty icon={FileText} title={`No ${cfg.endpoint} yet`} hint={`Create your first ${cfg.kind}.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead><tr className="bg-slate-50">
                <th className="th">Doc #</th><th className="th">Date</th><th className="th">{cfg.partyLabel}</th>
                <th className="th">Type</th><th className="th">Status</th>{can("gst") && <th className="th">Tax</th>}<th className="th text-right">Total</th>
                <th className="th"></th>
              </tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} onClick={() => openDoc(d)} className="cursor-pointer hover:bg-slate-50/60">
                    <td className="td font-semibold text-slate-800">{d.doc_no}</td>
                    <td className="td">{d.doc_date}</td>
                    <td className="td">{d[cfg.partyNameKey]}</td>
                    <td className="td">
                      <span className={`badge ${d.doc_type === "return" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                        {d.doc_type === "return" ? cfg.returnLabel : cfg.kind}
                      </span>
                    </td>
                    <td className="td"><span className={`badge capitalize ${STATUS[d.status] || "bg-slate-100 text-slate-600"}`}>{d.status}</span></td>
                    {can("gst") && <td className="td">{fmtMoney(d.tax_total, cur)}</td>}
                    <td className="td text-right font-bold">{fmtMoney(d.grand_total, cur)}</td>
                    <td className="td text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {cfg.kind === "purchase" && d.status === "draft" && (
                        <>
                          <button className="btn-primary btn-sm" onClick={() => act(d.id, "confirm")}>Approve</button>
                          <button className="btn-ghost btn-sm ml-1" onClick={() => act(d.id, "cancel")}>Cancel</button>
                        </>
                      )}
                      {cfg.kind === "sale" && d.status === "confirmed" && (
                        <button className="btn-ghost btn-sm" onClick={() => downloadInvoice(d)}><FileText className="h-3.5 w-3.5" /> PDF</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {docs && docs.length > 0 && <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
      </div>

      {viewing && (
        <DetailModal
          open onClose={() => setViewing(null)}
          title={`${viewing.doc_no}`}
          subtitle={`${cfg.partyLabel}: ${viewing._party || "—"}`}
          fields={[
            { label: "Date", value: viewing.doc_date },
            { label: "Type", value: viewing.doc_type === "return" ? cfg.returnLabel : cfg.kind },
            { label: "Status", value: viewing.status },
            viewing.notes && { label: "Notes", value: viewing.notes },
          ]}
        >
          {/* Money summary — Total and Amount received/paid sit side by side */}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
            <Sum label="Subtotal" value={fmtMoney(viewing.subtotal, cur)} />
            {can("gst") && <Sum label="Tax" value={fmtMoney(viewing.tax_total, cur)} />}
            <Sum label="Total amount" value={fmtMoney(viewing.grand_total, cur)} strong />
            <Sum label={cfg.kind === "sale" ? "Amount received" : "Amount paid"} value={fmtMoney(viewing[cfg.paymentKey], cur)} accent />
            {viewing[cfg.paymentKey] > 0 && (
              <Sum label={cfg.kind === "sale" ? "Received in" : "Paid from"} value={(viewing.payment_account || "cash").replace(/^./, (c) => c.toUpperCase())} />
            )}
            <Sum label="Outstanding" value={fmtMoney(viewing.grand_total - viewing[cfg.paymentKey], cur)} />
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full">
              <thead><tr className="bg-slate-50"><th className="th">Item</th>{can("gst") && <th className="th">HSN/SAC</th>}<th className="th text-right">Qty</th><th className="th text-right">Price</th>{can("gst") && <th className="th text-right">Tax%</th>}<th className="th text-right">Line total</th></tr></thead>
              <tbody>
                {(viewing.lines || []).map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="td">{l.item_name} <span className="text-xs text-slate-400">{l.sku}</span></td>
                    {can("gst") && <td className="td text-slate-500">{l.hsn || "—"}</td>}
                    <td className="td text-right">{l.qty}</td>
                    <td className="td text-right">{fmtMoney(l.unit_price, cur)}</td>
                    {can("gst") && <td className="td text-right">{l.tax_rate}%</td>}
                    <td className="td text-right font-medium">{fmtMoney(l.line_total, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DetailModal>
      )}

      {creating && <CreateDoc cfg={cfg} cur={cur} canGst={can("gst")} canLoc={can("multi_location")} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setPage(1); load(); }} toast={toast} />}
    </>
  );
}

function CreateDoc({ cfg, cur, canGst, canLoc, onClose, onSaved, toast }) {
  const [parties, setParties] = useState([]);
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [docType, setDocType] = useState(cfg.kind);
  const [paid, setPaid] = useState(0);
  const [payAccount, setPayAccount] = useState("cash");
  const [lines, setLines] = useState([{ item_id: "", qty: 1, unit_price: 0, tax_rate: 0 }]);
  const [override, setOverride] = useState(false);
  const [scan, setScan] = useState("");
  const [scanCam, setScanCam] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/${cfg.partyResource}`).then((r) => setParties(r.data));
    api.get("/items").then((r) => setItems(r.data));
    if (canLoc) api.get("/locations").then((r) => { setLocations(r.data); const d = r.data.find((l) => l.is_default); if (d) setLocationId(String(d.id)); });
  }, []);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { item_id: "", qty: 1, unit_price: 0, tax_rate: 0 }]);
  const delLine = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const onItemPick = (i, itemId) => {
    const it = items.find((x) => String(x.id) === String(itemId));
    setLine(i, {
      item_id: itemId,
      unit_price: it ? (cfg.kind === "sale" ? it.sale_price : it.cost_price) : 0,
      tax_rate: it ? it.tax_rate : 0,
    });
  };

  // Resolve a barcode/SKU against loaded items, then add or bump a line.
  // Shared by the hardware reader (keyboard), manual entry, and the camera.
  const addByCode = (raw) => {
    const code = (raw || "").trim();
    if (!code) return false;
    const it = items.find((x) => (x.barcode && x.barcode === code) || x.sku === code);
    if (!it) { toast.error(`No item with barcode/SKU "${code}"`); return false; }
    setLines((ls) => {
      const existing = ls.findIndex((l) => String(l.item_id) === String(it.id));
      if (existing >= 0) return ls.map((l, i) => (i === existing ? { ...l, qty: Number(l.qty || 0) + 1 } : l));
      const line = { item_id: String(it.id), qty: 1, unit_price: cfg.kind === "sale" ? it.sale_price : it.cost_price, tax_rate: it.tax_rate || 0 };
      const blankIdx = ls.findIndex((l) => !l.item_id);
      return blankIdx >= 0 ? ls.map((l, i) => (i === blankIdx ? line : l)) : [...ls, line];
    });
    toast.success(`Added ${it.name}`);
    return true;
  };
  const onScan = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addByCode(scan);
    setScan("");
  };

  const totals = lines.reduce((acc, l) => {
    const base = Number(l.qty || 0) * Number(l.unit_price || 0);
    const tax = canGst ? base * Number(l.tax_rate || 0) / 100 : 0;
    acc.sub += base; acc.tax += tax; return acc;
  }, { sub: 0, tax: 0 });
  const grand = totals.sub + totals.tax;

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        [cfg.partyKey]: Number(partyId),
        doc_type: docType,
        [cfg.paymentKey]: Number(paid),
        payment_account: payAccount,
        lines: lines.filter((l) => l.item_id).map((l) => ({
          item_id: Number(l.item_id), qty: Number(l.qty), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate),
        })),
      };
      if (cfg.kind === "sale") payload.allowOverride = override;
      if (canLoc && locationId) payload.location_id = Number(locationId);
      await api.post(`/${cfg.endpoint}`, payload);
      toast.success(`${cfg.kind === "sale" ? "Sale" : "Purchase"} recorded`);
      onSaved();
    } catch (e) {
      const msg = apiError(e);
      toast.error(msg);
      if (/Insufficient stock/i.test(msg) && cfg.kind === "sale") setOverride(true); // surface override
    } finally { setBusy(false); }
  };

  const valid = partyId && lines.some((l) => l.item_id && Number(l.qty) > 0);

  return (
    <Modal open wide title={cfg.newLabel} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={cfg.partyLabel}>
          <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">Select…</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Document type">
          <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value={cfg.kind}>{cfg.kind === "sale" ? "Sale invoice" : "Purchase"}</option>
            <option value="return">{cfg.returnLabel}</option>
          </select>
        </Field>
        <Field label={
          <span className="flex w-full items-center justify-between">
            <span>{cfg.paymentLabel}</span>
            {grand > 0 && Number(paid) !== grand && (
              <button type="button" onClick={() => setPaid(grand)} className="text-[11px] font-semibold normal-case text-brand-600 hover:underline">
                {cfg.kind === "sale" ? "Received" : "Paid"} in full
              </button>
            )}
          </span>
        }>
          <div className="flex gap-2">
            <input type="number" min="0" className="input" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" />
            <select className="input !w-28" value={payAccount} onChange={(e) => setPayAccount(e.target.value)} title={cfg.kind === "sale" ? "Received in" : "Paid from"}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </div>
        </Field>
        {canLoc && locations.length > 0 && (
          <Field label={cfg.kind === "sale" ? "Issue from warehouse" : "Receive into warehouse"}>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
        <ScanLine className="h-5 w-5 shrink-0 text-brand-500" />
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Scan with a reader or type a barcode/SKU, then press Enter"
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={onScan}
          autoComplete="off"
        />
        <button type="button" onClick={() => setScanCam(true)} className="btn-ghost btn-sm shrink-0" title="Scan with camera">
          <Camera className="h-4 w-4" /> Camera
        </button>
      </div>

      <BarcodeScanner open={scanCam} onClose={() => setScanCam(false)} onDetect={(code) => { setScanCam(false); addByCode(code); }} />

      <div className="mt-3 space-y-2">
        <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-semibold text-slate-400 sm:grid">
          <div className="col-span-5">Item</div><div className="col-span-2">Qty</div>
          <div className="col-span-2">Price</div>{canGst ? <div className="col-span-2">GST%</div> : <div className="col-span-2" />}<div />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <select className="input col-span-12 sm:col-span-5" value={l.item_id} onChange={(e) => onItemPick(i, e.target.value)}>
              <option value="">Select item…</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.name} · {it.sku} (stock {it.stock_qty})</option>)}
            </select>
            <input type="number" className="input col-span-4 sm:col-span-2" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="Qty" />
            <input type="number" className="input col-span-4 sm:col-span-2" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} placeholder="Price" />
            {canGst
              ? <input type="number" className="input col-span-3 sm:col-span-2" value={l.tax_rate} onChange={(e) => setLine(i, { tax_rate: e.target.value })} placeholder="GST%" />
              : <div className="hidden sm:block sm:col-span-2" />}
            <button className="col-span-1 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => delLine(i)}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button className="btn-ghost btn-sm" onClick={addLine}><Plus className="h-3.5 w-3.5" /> Add line</button>
      </div>

      {cfg.kind === "sale" && (
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          Allow overselling beyond available stock (authorized override)
        </label>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="text-sm text-slate-500">
          Subtotal <b className="text-slate-800">{fmtMoney(totals.sub, cur)}</b>
          {canGst && <> · Tax <b className="text-slate-800">{fmtMoney(totals.tax, cur)}</b></>}
          {" "}· Total <b className="text-brand-700">{fmtMoney(grand, cur)}</b>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !valid} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Save</button>
        </div>
      </div>
    </Modal>
  );
}
