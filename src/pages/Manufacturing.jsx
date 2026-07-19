import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Factory, Layers, ClipboardList, Calculator, Sigma, ArrowRight } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, fmtNum, Modal, Field, LineCol, useToast, apiError, Empty, Spinner, DetailModal } from "../ui";
import PageHead from "../components/PageHead";

const TABS = [
  { id: "boms", label: "Bills of Materials", icon: Layers },
  { id: "calc", label: "Cost Calculator", icon: Sigma },
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
      {tab === "calc" && <CostCalculator />}
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
  const [editing, setEditing] = useState(null);
  const load = () => { setBoms(null); api.get("/manufacturing/boms").then((r) => setBoms(r.data)); };
  useEffect(load, []);

  const del = async (id) => {
    if (!confirm("Delete this BOM?")) return;
    try { await api.delete(`/manufacturing/boms/${id}`); toast.success("BOM deleted"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

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
                <div className="flex gap-1">
                  <button onClick={() => setEditing(b)} className="rounded-lg p-1 text-slate-300 hover:bg-brand-50 hover:text-brand-600" title="Edit BOM"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(b.id)} className="rounded-lg p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500" title="Delete BOM"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <ul className="mt-3 space-y-1">
                {b.lines.map((l) => (
                  <li key={l.id} className="flex justify-between text-sm text-slate-600"><span>{l.item_name} <span className="text-slate-400">({l.sku})</span></span><span className="font-medium">× {fmtNum(l.qty)}</span></li>
                ))}
                {(b.expenses || []).map((e) => (
                  <li key={`e${e.id}`} className="flex justify-between text-sm text-slate-500">
                    <span className="italic">{e.name}{e.basis === "labour" && e.hours_used ? <span className="not-italic text-slate-400"> · {fmtNum(e.hours_used)} h</span> : null}</span>
                    <span className="font-medium">{fmtMoney(e.amount, cur)}</span>
                  </li>
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
      {editing && <BomModal cur={cur} bom={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} toast={toast} />}
    </>
  );
}

function BomModal({ cur, bom, preset, onClose, onSaved, toast }) {
  const isEdit = !!bom;
  const init = bom || preset; // bom → edit an existing BOM; preset → new BOM prefilled (e.g. from the calculator)
  const [items, setItems] = useState([]);
  const [f, setF] = useState(
    init ? { item_id: init.item_id ?? "", name: init.name ?? "", output_qty: init.output_qty ?? 1, std_cost: init.std_cost ?? 0 }
         : { item_id: "", name: "", output_qty: 1, std_cost: 0 }
  );
  const [lines, setLines] = useState(init?.lines?.length ? init.lines.map((l) => ({ item_id: l.item_id, qty: l.qty })) : [{ item_id: "", qty: 1 }]);
  const [expenses, setExpenses] = useState(
    init?.expenses?.length
      ? init.expenses.map((e) => ({
          basis: e.basis || "fixed", name: e.name, amount: e.amount ?? "",
          monthly_salary: e.monthly_salary ?? "", monthly_hours: e.monthly_hours ?? "", hours_used: e.hours_used ?? "",
        }))
      : []
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/items").then((r) => setItems(r.data)); }, []);
  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setExp = (i, patch) => setExpenses((es) => es.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  // Material type drives manufacturability: only Finished/Semi-Finished can be produced.
  const outputItems = items.filter((it) => ["finished", "semi_finished"].includes(it.material_type));
  const componentItems = items.filter((it) => it.material_type !== "service");

  // Live cost roll-up from each component's stocked cost price.
  const itemById = (id) => items.find((x) => String(x.id) === String(id));
  const unitCostOf = (id) => Number(itemById(id)?.cost_price || 0);
  const lineCostOf = (l) => unitCostOf(l.item_id) * Number(l.qty || 0);
  const componentCost = lines.reduce((s, l) => s + lineCostOf(l), 0);
  // Labour rows derive their cost from salary & hours; fixed rows are entered directly.
  const hourlyRate = (e) => (Number(e.monthly_salary) > 0 && Number(e.monthly_hours) > 0 ? Number(e.monthly_salary) / Number(e.monthly_hours) : 0);
  const expAmount = (e) => (e.basis === "labour" ? hourlyRate(e) * Number(e.hours_used || 0) : Number(e.amount || 0));
  const expenseCost = expenses.reduce((s, e) => s + expAmount(e), 0);
  const totalCost = componentCost + expenseCost;
  const perUnit = (Number(f.output_qty) || 1) > 0 ? totalCost / (Number(f.output_qty) || 1) : totalCost;

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...f, item_id: Number(f.item_id),
        lines: lines.filter((l) => l.item_id).map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty) })),
        expenses: expenses
          .filter((e) => (e.name || "").trim() || Number(e.amount) || Number(e.monthly_salary) || Number(e.hours_used))
          .map((e) => ({
            basis: e.basis || "fixed", name: e.name, amount: Number(e.amount),
            monthly_salary: Number(e.monthly_salary), monthly_hours: Number(e.monthly_hours), hours_used: Number(e.hours_used),
          })),
      };
      if (isEdit) await api.put(`/manufacturing/boms/${bom.id}`, payload);
      else await api.post("/manufacturing/boms", payload);
      toast.success(isEdit ? "BOM updated" : "BOM created"); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const valid = f.item_id && f.name && lines.some((l) => l.item_id && Number(l.qty) > 0);

  return (
    <Modal open wide title={isEdit ? "Edit Bill of Materials" : "New Bill of Materials"} onClose={onClose}>
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
          <div key={i} className="grid grid-cols-12 items-end gap-2 sm:items-center">
            <LineCol label="Component" className="col-span-12 sm:col-span-5">
              <select className="input w-full" value={l.item_id} onChange={(e) => setLine(i, { item_id: e.target.value })}>
                <option value="">Select component…</option>
                {componentItems.map((it) => <option key={it.id} value={it.id}>{it.name} · {it.sku}</option>)}
              </select>
            </LineCol>
            <LineCol label="Qty" className="col-span-4 sm:col-span-2">
              <input type="number" className="input w-full" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="Qty" />
            </LineCol>
            <LineCol label="Unit cost" className="col-span-3 sm:col-span-2">
              <div className="text-sm text-slate-500 sm:text-right">{l.item_id ? fmtMoney(unitCostOf(l.item_id), cur) : "—"}</div>
            </LineCol>
            <LineCol label="Line cost" className="col-span-4 sm:col-span-2">
              <div className="text-sm font-medium text-slate-700 sm:text-right">{l.item_id ? fmtMoney(lineCostOf(l), cur) : "—"}</div>
            </LineCol>
            <button className="col-span-1 grid h-10 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} title="Remove component"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button className="btn-ghost btn-sm" onClick={() => setLines((ls) => [...ls, { item_id: "", qty: 1 }])}><Plus className="h-3.5 w-3.5" /> Add component</button>

        <div className="border-t border-slate-100 pt-3">
          <div className="mb-1 text-xs font-semibold text-slate-400">Additional expenses per build — labour, electricity, packaging, job work… (optional)</div>
          {expenses.map((e, i) => (
            <div key={i} className="mb-2 rounded-xl border border-slate-100 p-2">
              <div className="grid grid-cols-12 items-end gap-2 sm:items-center">
                <LineCol label="Type" className="col-span-12 sm:col-span-3">
                  <select className="input w-full" value={e.basis || "fixed"} onChange={(ev) => setExp(i, { basis: ev.target.value })}>
                    <option value="fixed">Fixed amount</option>
                    <option value="labour">Labour (hourly)</option>
                  </select>
                </LineCol>
                <LineCol label="Expense" className="col-span-12 sm:col-span-5">
                  <input className="input w-full" value={e.name} onChange={(ev) => setExp(i, { name: ev.target.value })} placeholder={e.basis === "labour" ? "e.g. Machine operator" : "e.g. Electricity"} />
                </LineCol>
                {e.basis === "labour" ? (
                  <LineCol label="Cost" className="col-span-11 sm:col-span-3">
                    <div className="grid h-10 items-center text-sm font-medium text-slate-700 sm:justify-end">{expAmount(e) > 0 ? fmtMoney(expAmount(e), cur) : "—"}</div>
                  </LineCol>
                ) : (
                  <LineCol label="Amount" className="col-span-11 sm:col-span-3">
                    <input type="number" min="0" className="input w-full" value={e.amount} onChange={(ev) => setExp(i, { amount: ev.target.value })} placeholder="0" />
                  </LineCol>
                )}
                <button className="col-span-1 grid h-10 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => setExpenses((es) => es.filter((_, idx) => idx !== i))} title="Remove expense"><Trash2 className="h-4 w-4" /></button>
              </div>
              {e.basis === "labour" && (
                <div className="mt-2 grid grid-cols-12 gap-2">
                  <LineCol label="Monthly salary" className="col-span-12 sm:col-span-4">
                    <input type="number" min="0" className="input w-full" value={e.monthly_salary || ""} onChange={(ev) => setExp(i, { monthly_salary: ev.target.value })} placeholder="e.g. 25000" />
                  </LineCol>
                  <LineCol label="Working hours / month" className="col-span-12 sm:col-span-4">
                    <input type="number" min="0" className="input w-full" value={e.monthly_hours || ""} onChange={(ev) => setExp(i, { monthly_hours: ev.target.value })} placeholder="e.g. 208" />
                  </LineCol>
                  <LineCol label="Hours for this build" className="col-span-12 sm:col-span-4">
                    <input type="number" min="0" className="input w-full" value={e.hours_used || ""} onChange={(ev) => setExp(i, { hours_used: ev.target.value })} placeholder="e.g. 3.5" />
                  </LineCol>
                  {hourlyRate(e) > 0 && (
                    <p className="col-span-12 text-xs text-slate-400">≈ {fmtMoney(hourlyRate(e), cur)}/hour{Number(e.hours_used) > 0 ? ` × ${fmtNum(e.hours_used)} h = ${fmtMoney(expAmount(e), cur)} per build` : ""}</p>
                  )}
                </div>
              )}
            </div>
          ))}
          <button className="btn-ghost btn-sm" onClick={() => setExpenses((es) => [...es, { basis: "fixed", name: "", amount: "" }])}><Plus className="h-3.5 w-3.5" /> Add expense</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
          <span className="text-xs text-slate-400">Costs use each component's current stocked cost; multi-level BOMs roll up on the server.</span>
          <span className="text-slate-500">Components <b className="text-slate-800">{fmtMoney(componentCost, cur)}</b> · Expenses <b className="text-slate-800">{fmtMoney(expenseCost, cur)}</b> · Per unit <b className="text-brand-700">{fmtMoney(perUnit, cur)}</b></span>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !valid} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Save BOM</button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── BOM cost calculator ─────────────────────────
   Scratch-pad to work out a finished good's cost (materials + labour +
   overheads) before committing to a BOM. Nothing here is saved — the
   "Create BOM" button hands the numbers to the normal New-BOM modal. */
function CostCalculator() {
  const { me } = useAuth();
  const cur = me.tenant.currency;
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [outQty, setOutQty] = useState(1);
  const [comps, setComps] = useState([{ item_id: "", qty: 1, unit_cost: "" }]);
  const [labours, setLabours] = useState([{ name: "", monthly_salary: "", monthly_hours: "", hours_used: "" }]);
  const [others, setOthers] = useState([]);
  const [creating, setCreating] = useState(false);
  useEffect(() => { api.get("/items").then((r) => setItems(r.data)); }, []);

  const itemById = (id) => items.find((x) => String(x.id) === String(id));
  const componentItems = items.filter((it) => it.material_type !== "service");
  const setComp = (i, patch) => setComps((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const setLab = (i, patch) => setLabours((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const setOther = (i, patch) => setOthers((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const pickItem = (i, id) => setComp(i, { item_id: id, unit_cost: itemById(id) ? itemById(id).cost_price : "" });

  const compCost = (c) => Number(c.qty || 0) * Number(c.unit_cost || 0);
  const rateOf = (l) => (Number(l.monthly_salary) > 0 && Number(l.monthly_hours) > 0 ? Number(l.monthly_salary) / Number(l.monthly_hours) : 0);
  const labCost = (l) => rateOf(l) * Number(l.hours_used || 0);
  const materialTotal = comps.reduce((s, c) => s + compCost(c), 0);
  const labourTotal = labours.reduce((s, l) => s + labCost(l), 0);
  const otherTotal = others.reduce((s, o) => s + Number(o.amount || 0), 0);
  const batchTotal = materialTotal + labourTotal + otherTotal;
  const oq = Number(outQty) > 0 ? Number(outQty) : 1;
  const perUnit = batchTotal / oq;

  // Hand-off to the New-BOM modal: item-backed components become lines; labour
  // and other expenses become additional expenses. Free-typed cost rows without
  // an inventory item can't become BOM lines, so we flag them.
  const preset = {
    output_qty: oq,
    lines: comps.filter((c) => c.item_id && Number(c.qty) > 0).map((c) => ({ item_id: c.item_id, qty: c.qty })),
    expenses: [
      ...labours.filter((l) => labCost(l) > 0).map((l) => ({
        basis: "labour", name: l.name || "Labour", monthly_salary: l.monthly_salary, monthly_hours: l.monthly_hours, hours_used: l.hours_used,
      })),
      ...others.filter((o) => (o.name || "").trim() || Number(o.amount)).map((o) => ({ basis: "fixed", name: o.name, amount: o.amount })),
    ],
  };
  const unlinkedComps = comps.filter((c) => !c.item_id && compCost(c) > 0).length;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div className="card p-4">
          <div className="mb-2 label">Build</div>
          <Field label="Output qty per build (finished units produced in one batch)">
            <input type="number" min="1" className="input" value={outQty} onChange={(e) => setOutQty(e.target.value)} />
          </Field>
        </div>

        <div className="card p-4">
          <div className="mb-2 label">Materials / components</div>
          {comps.map((c, i) => (
            <div key={i} className="mb-2 grid grid-cols-12 items-end gap-2 sm:items-center">
              <LineCol label="Component" className="col-span-12 sm:col-span-5">
                <select className="input w-full" value={c.item_id} onChange={(e) => pickItem(i, e.target.value)}>
                  <option value="">Custom / pick an item…</option>
                  {componentItems.map((it) => <option key={it.id} value={it.id}>{it.name} · {it.sku}</option>)}
                </select>
              </LineCol>
              <LineCol label="Qty" className="col-span-3 sm:col-span-2">
                <input type="number" min="0" className="input w-full" value={c.qty} onChange={(e) => setComp(i, { qty: e.target.value })} />
              </LineCol>
              <LineCol label="Unit cost" className="col-span-4 sm:col-span-2">
                <input type="number" min="0" className="input w-full" value={c.unit_cost} onChange={(e) => setComp(i, { unit_cost: e.target.value })} placeholder="0" />
              </LineCol>
              <LineCol label="Line cost" className="col-span-4 sm:col-span-2">
                <div className="text-sm font-medium text-slate-700 sm:text-right">{compCost(c) > 0 ? fmtMoney(compCost(c), cur) : "—"}</div>
              </LineCol>
              <button className="col-span-1 grid h-10 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => setComps((xs) => xs.filter((_, idx) => idx !== i))} title="Remove"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button className="btn-ghost btn-sm" onClick={() => setComps((xs) => [...xs, { item_id: "", qty: 1, unit_cost: "" }])}><Plus className="h-3.5 w-3.5" /> Add component</button>
        </div>

        <div className="card p-4">
          <div className="mb-2 label">Labour (from monthly salary)</div>
          {labours.map((l, i) => (
            <div key={i} className="mb-2 grid grid-cols-12 items-end gap-2 sm:items-center">
              <LineCol label="Worker / role" className="col-span-12 sm:col-span-3">
                <input className="input w-full" value={l.name} onChange={(e) => setLab(i, { name: e.target.value })} placeholder="e.g. Operator" />
              </LineCol>
              <LineCol label="Monthly salary" className="col-span-4 sm:col-span-3">
                <input type="number" min="0" className="input w-full" value={l.monthly_salary} onChange={(e) => setLab(i, { monthly_salary: e.target.value })} placeholder="25000" />
              </LineCol>
              <LineCol label="Hours / month" className="col-span-3 sm:col-span-2">
                <input type="number" min="0" className="input w-full" value={l.monthly_hours} onChange={(e) => setLab(i, { monthly_hours: e.target.value })} placeholder="208" />
              </LineCol>
              <LineCol label="Hours / build" className="col-span-4 sm:col-span-3">
                <input type="number" min="0" className="input w-full" value={l.hours_used} onChange={(e) => setLab(i, { hours_used: e.target.value })} placeholder="3.5" />
              </LineCol>
              <button className="col-span-1 grid h-10 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => setLabours((xs) => xs.filter((_, idx) => idx !== i))} title="Remove"><Trash2 className="h-4 w-4" /></button>
              {rateOf(l) > 0 && (
                <p className="col-span-12 -mt-1 text-xs text-slate-400">
                  {fmtMoney(l.monthly_salary, cur)} ÷ {fmtNum(l.monthly_hours)} h = <b>{fmtMoney(rateOf(l), cur)}/hour</b>
                  {Number(l.hours_used) > 0 && <> × {fmtNum(l.hours_used)} h = <b>{fmtMoney(labCost(l), cur)}</b> per build</>}
                </p>
              )}
            </div>
          ))}
          <button className="btn-ghost btn-sm" onClick={() => setLabours((xs) => [...xs, { name: "", monthly_salary: "", monthly_hours: "", hours_used: "" }])}><Plus className="h-3.5 w-3.5" /> Add worker</button>
        </div>

        <div className="card p-4">
          <div className="mb-2 label">Other expenses per build (electricity, packaging, job work…)</div>
          {others.map((o, i) => (
            <div key={i} className="mb-2 grid grid-cols-12 items-end gap-2 sm:items-center">
              <LineCol label="Expense" className="col-span-12 sm:col-span-7">
                <input className="input w-full" value={o.name} onChange={(e) => setOther(i, { name: e.target.value })} placeholder="e.g. Electricity" />
              </LineCol>
              <LineCol label="Amount" className="col-span-11 sm:col-span-4">
                <input type="number" min="0" className="input w-full" value={o.amount} onChange={(e) => setOther(i, { amount: e.target.value })} placeholder="0" />
              </LineCol>
              <button className="col-span-1 grid h-10 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => setOthers((xs) => xs.filter((_, idx) => idx !== i))} title="Remove"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button className="btn-ghost btn-sm" onClick={() => setOthers((xs) => [...xs, { name: "", amount: "" }])}><Plus className="h-3.5 w-3.5" /> Add expense</button>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="card sticky top-4 p-4">
          <div className="mb-3 label">Cost breakdown</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Materials</span><b>{fmtMoney(materialTotal, cur)}</b></div>
            <div className="flex justify-between text-slate-600"><span>Labour</span><b>{fmtMoney(labourTotal, cur)}</b></div>
            <div className="flex justify-between text-slate-600"><span>Other expenses</span><b>{fmtMoney(otherTotal, cur)}</b></div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-slate-700"><span>Cost per build ({fmtNum(oq)} unit{oq === 1 ? "" : "s"})</span><b>{fmtMoney(batchTotal, cur)}</b></div>
            <div className="flex justify-between text-base"><span className="font-semibold text-slate-700">Cost per finished unit</span><b className="text-brand-700">{fmtMoney(perUnit, cur)}</b></div>
          </div>
          {oq > 1 && batchTotal > 0 && (
            <p className="mt-2 text-xs text-slate-400">{fmtMoney(batchTotal, cur)} ÷ {fmtNum(oq)} units = {fmtMoney(perUnit, cur)} per unit</p>
          )}
          <button className="btn-primary mt-4 w-full justify-center" disabled={!preset.lines.length} onClick={() => setCreating(true)}>
            <ArrowRight className="h-4 w-4" /> Create BOM with these numbers
          </button>
          {!preset.lines.length && <p className="mt-2 text-xs text-slate-400">Pick at least one inventory item as a component to create a BOM.</p>}
          {unlinkedComps > 0 && <p className="mt-2 text-xs text-amber-600">{unlinkedComps} custom component row(s) aren't linked to an inventory item — they're included in the calculation above but will be left out of the BOM.</p>}
          <p className="mt-3 text-xs text-slate-400">The BOM itself uses each component's current stocked cost, so its rolled cost can differ if you overrode a unit cost here.</p>
        </div>
      </div>

      {creating && <BomModal cur={cur} preset={preset} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast.success("Open the Bills of Materials tab to see it"); }} toast={toast} />}
    </div>
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
