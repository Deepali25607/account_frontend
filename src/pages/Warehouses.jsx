import { useEffect, useState } from "react";
import { Plus, Warehouse, ArrowLeftRight, Trash2 } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtNum, Modal, Field, useToast, apiError, Empty, Spinner } from "../ui";
import PageHead from "../components/PageHead";

export default function Warehouses() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [addLoc, setAddLoc] = useState(false);
  const [transfer, setTransfer] = useState(false);

  const load = () => {
    setData(null);
    api.get("/locations/stock").then((r) => { setData(r.data.items); setLocations(r.data.locations); });
  };
  useEffect(load, []);

  const delLoc = async (l) => {
    if (!confirm(`Delete warehouse "${l.name}"?`)) return;
    try { await api.delete(`/locations/${l.id}`); toast.success("Warehouse deleted"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <>
      <PageHead
        title="Warehouses"
        subtitle="Multi-location stock — track quantities per warehouse and transfer between them (IN-06)."
        action={<div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setTransfer(true)} disabled={locations.length < 2}><ArrowLeftRight className="h-4 w-4" /> Transfer</button>
          <button className="btn-primary" onClick={() => setAddLoc(true)}><Plus className="h-4 w-4" /> New warehouse</button>
        </div>}
      />

      {/* location chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {locations.map((l) => (
          <span key={l.id} className={`badge gap-1 ${l.is_default ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"}`}>
            <Warehouse className="h-3 w-3" /> {l.name}{l.is_default ? " (default)" : ""}
            {!l.is_default && <button onClick={() => delLoc(l)} className="ml-1 text-slate-400 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>}
          </span>
        ))}
      </div>

      <div className="card overflow-hidden">
        {data === null ? <div className="grid h-40 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
          : data.length === 0 ? <Empty icon={Warehouse} title="No items yet" />
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead><tr className="bg-slate-50">
                  <th className="th">Item</th>
                  {locations.map((l) => <th key={l.id} className="th text-right">{l.name}</th>)}
                  <th className="th text-right">Total</th>
                </tr></thead>
                <tbody>
                  {data.map((it) => {
                    const map = Object.fromEntries(it.byLocation.map((b) => [b.location_id, b.qty]));
                    return (
                      <tr key={it.item_id} className="hover:bg-slate-50/60">
                        <td className="td"><div className="font-semibold text-slate-800">{it.name}</div><div className="text-xs text-slate-400">{it.sku}</div></td>
                        {locations.map((l) => <td key={l.id} className="td text-right">{fmtNum(map[l.id] ?? 0)}</td>)}
                        <td className="td text-right font-bold">{fmtNum(it.total)} <span className="text-xs font-normal text-slate-400">{it.uom}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {addLoc && <AddLocation onClose={() => setAddLoc(false)} onSaved={() => { setAddLoc(false); load(); }} toast={toast} />}
      {transfer && <TransferModal items={data || []} locations={locations} onClose={() => setTransfer(false)} onSaved={() => { setTransfer(false); load(); }} toast={toast} />}
    </>
  );
}

function AddLocation({ onClose, onSaved, toast }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post("/locations", { name }); toast.success("Warehouse created"); onSaved(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title="New warehouse" onClose={onClose}>
      <Field label="Warehouse name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. East Depot" /></Field>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !name} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Create</button>
      </div>
    </Modal>
  );
}

function TransferModal({ items, locations, onClose, onSaved, toast }) {
  const [f, setF] = useState({ item_id: "", from_location_id: "", to_location_id: "", qty: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const selItem = items.find((i) => String(i.item_id) === String(f.item_id));
  const availAt = (locId) => selItem?.byLocation.find((b) => String(b.location_id) === String(locId))?.qty ?? 0;

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/locations/transfer", {
        item_id: Number(f.item_id), from_location_id: Number(f.from_location_id), to_location_id: Number(f.to_location_id), qty: Number(f.qty),
      });
      toast.success("Stock transferred"); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const valid = f.item_id && f.from_location_id && f.to_location_id && f.from_location_id !== f.to_location_id && Number(f.qty) > 0;

  return (
    <Modal open title="Transfer stock" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Item">
          <select className="input" value={f.item_id} onChange={set("item_id")}>
            <option value="">Select item…</option>
            {items.map((i) => <option key={i.item_id} value={i.item_id}>{i.name} ({i.sku})</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select className="input" value={f.from_location_id} onChange={set("from_location_id")}>
              <option value="">Select…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{f.item_id ? ` (${fmtNum(availAt(l.id))})` : ""}</option>)}
            </select>
          </Field>
          <Field label="To">
            <select className="input" value={f.to_location_id} onChange={set("to_location_id")}>
              <option value="">Select…</option>
              {locations.filter((l) => String(l.id) !== f.from_location_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Quantity"><input type="number" className="input" value={f.qty} onChange={set("qty")} /></Field>
        {selItem && f.from_location_id && <p className="text-xs text-slate-400">Available at source: {fmtNum(availAt(f.from_location_id))} {selItem.uom}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !valid} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Transfer</button>
      </div>
    </Modal>
  );
}
