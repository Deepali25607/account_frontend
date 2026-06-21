import { useEffect, useState } from "react";
import { Plus, Trash2, Factory, Layers, ClipboardList, Calculator, ArrowRight } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, fmtNum, Modal, Field, useToast, apiError, Empty, Spinner, DetailModal } from "../ui";
import PageHead from "../components/PageHead";

const TABS = [
  { id: "boms", label: "Bills of Materials", icon: Layers },
  { id: "orders", label: "Production Orders", icon: ClipboardList },
  { id: "mrp", label: "MRP & Shortages", icon: Calculator },
];

export default function Manufacturing() {
  const [tab, setTab] = useState("boms");
  return (
    <>
      <PageHead title="Manufacturing" subtitle="BOMs, production planning & BOM-driven MRP (Premium)." />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t.id ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === "boms" && <Boms />}
      {tab === "orders" && <Orders />}
      {tab === "mrp" && <Mrp />}
    </>
  );
}

/* ───────────────────────── BOMs ───────────────────────── */
function Boms() {
  const { me } = useAuth();
  const cur = me.tenant.currency;
  const toast = useToast();
  const [boms, setBoms] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => { setBoms(null); api.get("/manufacturing/boms").then((r) => setBoms(r.data)); };
  useEffect(load, []);

  const del = async (id) => { if (!confirm("Delete this BOM?")) return; await api.delete(`/manufacturing/boms/${id}`); toast.success("BOM deleted"); load(); };

  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New BOM</button></div>
      {boms === null ? <Loading /> : boms.length === 0 ? <div className="card"><Empty icon={Layers} title="No BOMs yet" hint="Define what components make up a finished product." /></div> : (
        <div className="grid gap-3 md:grid-cols-2">
          {boms.map((b) => (
            <div key={b.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-slate-800">{b.item_name}</div>
                  <div className="text-xs text-slate-400">{b.name} · output {fmtNum(b.output_qty)}</div>
                </div>
                <button onClick={() => del(b.id)} className="rounded-lg p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
              </div>
              <ul className="mt-3 space-y-1">
                {b.lines.map((l) => (
                  <li key={l.id} className="flex justify-between text-sm text-slate-600"><span>{l.item_name} <span className="text-slate-400">({l.sku})</span></span><span className="font-medium">× {fmtNum(l.qty)}</span></li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">Rolled cost <b className="text-slate-800">{fmtMoney(b.rolled_cost, cur)}</b></span>
                <span className="text-slate-500">Std <b className="text-slate-800">{fmtMoney(b.std_cost, cur)}</b></span>
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && <BomModal cur={cur} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} toast={toast} />}
    </>
  );
}

function BomModal({ cur, onClose, onSaved, toast }) {
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ item_id: "", name: "", output_qty: 1, std_cost: 0 });
  const [lines, setLines] = useState([{ item_id: "", qty: 1 }]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/items").then((r) => setItems(r.data)); }, []);
  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  // Material type drives manufacturability: only Finished/Semi-Finished can be produced.
  const outputItems = items.filter((it) => ["finished", "semi_finished"].includes(it.material_type));
  const componentItems = items.filter((it) => it.material_type !== "service");

  // Live cost roll-up from each component's stocked cost price.
  const itemById = (id) => items.find((x) => String(x.id) === String(id));
  const unitCostOf = (id) => Number(itemById(id)?.cost_price || 0);
  const lineCostOf = (l) => unitCostOf(l.item_id) * Number(l.qty || 0);
  const totalCost = lines.reduce((s, l) => s + lineCostOf(l), 0);
  const perUnit = (Number(f.output_qty) || 1) > 0 ? totalCost / (Number(f.output_qty) || 1) : totalCost;

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/manufacturing/boms", { ...f, item_id: Number(f.item_id), lines: lines.filter((l) => l.item_id).map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty) })) });
      toast.success("BOM created"); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const valid = f.item_id && f.name && lines.some((l) => l.item_id && Number(l.qty) > 0);

  return (
    <Modal open wide title="New Bill of Materials" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Output (finished / semi-finished) item">
          <select className="input" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}>
            <option value="">Select item to produce…</option>
            {outputItems.map((it) => <option key={it.id} value={it.id}>{it.name} · {it.sku}</option>)}
          </select>
          {outputItems.length === 0 && <p className="mt-1 text-xs text-amber-600">No Finished/Semi-Finished items yet — set an item's Material Type in Inventory first.</p>}
        </Field>
        <Field label="BOM name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Standard build" /></Field>
        <Field label="Output qty per build"><input type="number" className="input" value={f.output_qty} onChange={(e) => setF({ ...f, output_qty: e.target.value })} /></Field>
        <Field label="Standard cost (optional)">
          <input type="number" className="input" value={f.std_cost} onChange={(e) => setF({ ...f, std_cost: e.target.value })} />
          {perUnit > 0 && <button type="button" className="mt-1 text-xs font-semibold text-brand-600" onClick={() => setF({ ...f, std_cost: Math.round(perUnit * 100) / 100 })}>Use computed {fmtMoney(perUnit, cur)}</button>}
        </Field>
      </div>
      <div className="mt-4 space-y-2">
        <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-semibold text-slate-400 sm:grid">
          <div className="col-span-5">Component</div><div className="col-span-2">Qty</div>
          <div className="col-span-2 text-right">Unit cost</div><div className="col-span-2 text-right">Line cost</div><div />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <select className="input col-span-12 sm:col-span-5" value={l.item_id} onChange={(e) => setLine(i, { item_id: e.target.value })}>
              <option value="">Select component…</option>
              {componentItems.map((it) => <option key={it.id} value={it.id}>{it.name} · {it.sku}</option>)}
            </select>
            <input type="number" className="input col-span-4 sm:col-span-2" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="Qty" />
            <div className="col-span-3 text-right text-sm text-slate-500 sm:col-span-2">{l.item_id ? fmtMoney(unitCostOf(l.item_id), cur) : "—"}</div>
            <div className="col-span-4 text-right text-sm font-medium text-slate-700 sm:col-span-2">{l.item_id ? fmtMoney(lineCostOf(l), cur) : "—"}</div>
            <button className="col-span-1 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button className="btn-ghost btn-sm" onClick={() => setLines((ls) => [...ls, { item_id: "", qty: 1 }])}><Plus className="h-3.5 w-3.5" /> Add component</button>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
          <span className="text-xs text-slate-400">Costs use each component's current stocked cost; multi-level BOMs roll up on the server.</span>
          <span className="text-slate-500">Total components <b className="text-slate-800">{fmtMoney(totalCost, cur)}</b> · Per unit <b className="text-brand-700">{fmtMoney(perUnit, cur)}</b></span>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !valid} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Save BOM</button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Production orders ───────────────────────── */
const STATUS_STYLE = {
  planned: "bg-slate-100 text-slate-600", in_progress: "bg-brand-100 text-brand-700",
  completed: "bg-emerald-100 text-emerald-700", closed: "bg-slate-200 text-slate-500",
};
function Orders() {
  const toast = useToast();
  const [orders, setOrders] = useState(null);
  const [boms, setBoms] = useState([]);
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [viewing, setViewing] = useState(null);
  const load = () => { setOrders(null); api.get("/manufacturing/production-orders").then((r) => setOrders(r.data)); };
  useEffect(() => { load(); api.get("/manufacturing/boms").then((r) => setBoms(r.data)); }, []);

  const setStatus = async (po, status) => {
    try { await api.patch(`/manufacturing/production-orders/${po.id}/status`, { status }); toast.success(`Order ${status.replace("_", " ")}`); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setAdding(true)} disabled={!boms.length}><Plus className="h-4 w-4" /> New production order</button></div>
      {orders === null ? <Loading /> : orders.length === 0 ? <div className="card"><Empty icon={Factory} title="No production orders" hint={boms.length ? "Plan a production run." : "Create a BOM first."} /></div> : (
        <div className="card overflow-hidden">
          <table className="w-full min-w-[680px]">
            <thead><tr className="bg-slate-50"><th className="th">Order</th><th className="th">Item</th><th className="th">Progress</th><th className="th">Planned</th><th className="th">Status</th><th className="th"></th></tr></thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id} onClick={() => setViewing(po)} className="cursor-pointer hover:bg-slate-50/60">
                  <td className="td font-semibold text-slate-800">PRD-{String(po.id).padStart(4, "0")}</td>
                  <td className="td">{po.item_name}</td>
                  <td className="td">{fmtNum(po.completed_qty)} / {fmtNum(po.qty)}</td>
                  <td className="td">{po.planned_date || "—"}</td>
                  <td className="td"><span className={`badge capitalize ${STATUS_STYLE[po.status]}`}>{po.status.replace("_", " ")}</span></td>
                  <td className="td text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {po.status === "planned" && <button className="btn-ghost btn-sm" onClick={() => setStatus(po, "in_progress")}>Start</button>}
                    {(po.status === "planned" || po.status === "in_progress") && <button className="btn-primary btn-sm ml-1" onClick={() => setCompleting(po)}>Complete</button>}
                    {po.status === "completed" && <button className="btn-ghost btn-sm" onClick={() => setStatus(po, "closed")}>Close</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <OrderModal boms={boms} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} toast={toast} />}
      {completing && <CompleteModal po={completing} onClose={() => setCompleting(null)} onSaved={() => { setCompleting(null); load(); }} toast={toast} />}
      {viewing && (
        <DetailModal
          open onClose={() => setViewing(null)}
          title={`PRD-${String(viewing.id).padStart(4, "0")}`}
          subtitle={`${viewing.item_name} · ${viewing.bom_name}`}
          fields={[
            { label: "Output item", value: viewing.item_name },
            { label: "BOM", value: viewing.bom_name },
            { label: "Planned qty", value: fmtNum(viewing.qty) },
            { label: "Completed", value: fmtNum(viewing.completed_qty) },
            { label: "Remaining", value: fmtNum(viewing.qty - viewing.completed_qty) },
            { label: "Status", value: viewing.status.replace("_", " ") },
            { label: "Planned date", value: viewing.planned_date },
            { label: "Created", value: viewing.created_at },
          ]}
        />
      )}
    </>
  );
}

function CompleteModal({ po, onClose, onSaved, toast }) {
  const remaining = po.qty - po.completed_qty;
  const [qty, setQty] = useState(remaining);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post(`/manufacturing/production-orders/${po.id}/complete`, { qty: Number(qty) }); toast.success("Completed — stock updated"); onSaved(); }
    catch (e) {
      const data = e?.response?.data;
      if (data?.shortfalls) toast.error(`${data.error}: ` + data.shortfalls.map((s) => `${s.item} need ${s.need}, have ${s.have}`).join("; "));
      else toast.error(apiError(e));
    } finally { setBusy(false); }
  };
  return (
    <Modal open title={`Complete production — ${po.item_name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">{fmtNum(po.completed_qty)} of {fmtNum(po.qty)} done · <b>{fmtNum(remaining)}</b> remaining.</p>
      <Field label="Quantity to complete now (partial allowed)"><input type="number" className="input" value={qty} max={remaining} onChange={(e) => setQty(e.target.value)} /></Field>
      <p className="mt-2 text-xs text-slate-400">Components are consumed and finished goods added for this quantity. The order stays in progress until fully complete.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !(Number(qty) > 0) || Number(qty) > remaining} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Complete</button>
      </div>
    </Modal>
  );
}

function OrderModal({ boms, onClose, onSaved, toast }) {
  const [f, setF] = useState({ bom_id: "", qty: 1, planned_date: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post("/manufacturing/production-orders", { ...f, bom_id: Number(f.bom_id), qty: Number(f.qty) }); toast.success("Production order created"); onSaved(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title="New production order" onClose={onClose}>
      <Field label="Bill of Materials">
        <select className="input" value={f.bom_id} onChange={(e) => setF({ ...f, bom_id: e.target.value })}>
          <option value="">Select BOM…</option>
          {boms.map((b) => <option key={b.id} value={b.id}>{b.item_name} — {b.name}</option>)}
        </select>
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Quantity to produce"><input type="number" className="input" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Planned date"><input type="date" className="input" value={f.planned_date} onChange={(e) => setF({ ...f, planned_date: e.target.value })} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !f.bom_id || !(Number(f.qty) > 0)} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Create</button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── MRP ───────────────────────── */
function Mrp() {
  const { me } = useAuth();
  const cur = me.tenant.currency;
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [sel, setSel] = useState("");
  const [mrp, setMrp] = useState(null);
  const [report, setReport] = useState(null);
  const [vendor, setVendor] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/manufacturing/production-orders").then((r) => setOrders(r.data.filter((o) => ["planned", "in_progress"].includes(o.status))));
    api.get("/vendors").then((r) => setVendors(r.data));
    api.get("/manufacturing/reports/shortages").then((r) => setReport(r.data));
  }, []);

  const run = async (id) => { setSel(id); setMrp(null); if (!id) return; const { data } = await api.get(`/manufacturing/production-orders/${id}/mrp`); setMrp(data); };
  const draftPo = async () => {
    if (!vendor) return toast.error("Pick a supplier first");
    setBusy(true);
    try { const { data } = await api.post(`/manufacturing/production-orders/${sel}/draft-po`, { vendor_id: Number(vendor) }); toast.success(`Draft ${data.doc_no} created in Purchases`); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const Cols = ({ rows, kind }) => (
    <table className="w-full"><thead><tr className="bg-slate-50"><th className="th">Item</th><th className="th text-right">On hand</th><th className="th text-right">Required</th><th className="th text-right">{kind === "buy" ? "To purchase" : "To produce"}</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.item_id}><td className="td font-medium">{r.name} <span className="text-slate-400">({r.sku})</span></td>
          <td className="td text-right">{fmtNum(r.on_hand)}</td><td className="td text-right">{fmtNum(r.gross)}</td>
          <td className={`td text-right font-bold ${r.net > 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmtNum(r.net)}</td></tr>
      ))}</tbody></table>
  );

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[220px] text-sm"><span className="label">Run MRP for a production order</span>
            <select className="input" value={sel} onChange={(e) => run(e.target.value)}>
              <option value="">Select planned order…</option>
              {orders.map((o) => <option key={o.id} value={o.id}>PRD-{String(o.id).padStart(4, "0")} · {o.item_name} × {o.qty}</option>)}
            </select>
          </label>
        </div>
        {sel && mrp === null && <div className="py-6"><Loading /></div>}
        {mrp && (
          <div className="mt-4 space-y-4">
            {mrp.purchase.length > 0 && (
              <div><h4 className="mb-2 font-bold text-slate-700">Materials to purchase</h4>
                <div className="overflow-hidden rounded-xl border border-slate-100"><Cols rows={mrp.purchase} kind="buy" /></div></div>
            )}
            {mrp.produce.length > 0 && (
              <div><h4 className="mb-2 font-bold text-slate-700">Sub-assemblies to produce</h4>
                <div className="overflow-hidden rounded-xl border border-slate-100"><Cols rows={mrp.produce} kind="make" /></div></div>
            )}
            {mrp.purchase.some((p) => p.net > 0) && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 p-3">
                <span className="text-sm text-slate-600">Convert shortages into a draft PO (MF-05):</span>
                <select className="input w-auto" value={vendor} onChange={(e) => setVendor(e.target.value)}>
                  <option value="">Supplier…</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <button className="btn-primary btn-sm" disabled={busy} onClick={draftPo}>{busy && <Spinner className="h-4 w-4" />} Create draft PO <ArrowRight className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="mb-1 font-bold text-slate-800">MRP exception report</h3>
        <p className="mb-3 text-xs text-slate-400">Net shortages across all {report?.plannedOrders ?? 0} planned/in-progress orders (MF-08).</p>
        {!report ? <Loading /> : report.shortages.length === 0 ? <p className="text-sm text-slate-400">No material shortages 🎉</p> : (
          <div className="overflow-hidden rounded-xl border border-slate-100"><Cols rows={report.shortages} kind="buy" /></div>
        )}
      </div>
    </div>
  );
}

const Loading = () => <div className="grid h-32 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>;
