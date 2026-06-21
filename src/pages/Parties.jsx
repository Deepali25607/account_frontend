import { useEffect, useState } from "react";
import { Plus, Users, Truck, Pencil, Trash2 } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { Modal, Field, useToast, apiError, Empty, Spinner, DetailModal } from "../ui";
import PageHead from "../components/PageHead";

export default function Parties() {
  const { can, me } = useAuth();
  const isAdmin = me.user.role === "owner";
  const [tab, setTab] = useState("customers");
  const resource = tab; // "customers" | "vendors"
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);   // null | {} (new) | party (edit)
  const [del, setDel] = useState(null);      // party pending delete
  const [viewing, setViewing] = useState(null);
  const toast = useToast();

  const load = () => { setRows(null); api.get(`/${resource}`).then((r) => setRows(r.data)); };
  useEffect(load, [resource]);

  return (
    <>
      <PageHead
        title="Suppliers & Customers"
        subtitle="Master records with contact, payment terms & tax details"
        action={<button className="btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" /> New {resource === "customers" ? "customer" : "supplier"}</button>}
      />

      <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        <Tab id="customers" cur={tab} set={setTab} icon={Users}>Customers</Tab>
        <Tab id="vendors" cur={tab} set={setTab} icon={Truck}>Suppliers</Tab>
      </div>

      <div className="card overflow-hidden">
        {rows === null ? (
          <div className="grid h-40 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
        ) : rows.length === 0 ? (
          <Empty icon={resource === "customers" ? Users : Truck} title={`No ${resource === "customers" ? "customers" : "suppliers"} yet`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr className="bg-slate-50"><th className="th">Name</th><th className="th">Contact</th>{can("gst") && <th className="th">Tax / GSTIN</th>}<th className="th">Terms</th><th className="th"></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setViewing(r)} className="cursor-pointer hover:bg-slate-50/60">
                    <td className="td font-semibold text-slate-800">{r.name}</td>
                    <td className="td">{r.email || "—"}<div className="text-xs text-slate-400">{r.phone || ""}</div></td>
                    {can("gst") && <td className="td">{r.tax_no || "—"}</td>}
                    <td className="td">{r.payment_terms || "—"}</td>
                    <td className="td text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button className="btn-ghost btn-sm" onClick={() => setForm(r)}><Pencil className="h-3.5 w-3.5" /></button>
                      {isAdmin && <button className="btn-ghost btn-sm ml-1 text-rose-600 hover:bg-rose-50" onClick={() => setDel(r)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && <PartyModal resource={resource} party={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} canGst={can("gst")} />}
      {del && <PartyDeleteModal resource={resource} party={del} onClose={() => setDel(null)} onDeleted={() => { setDel(null); load(); }} toast={toast} />}
      {viewing && (
        <DetailModal
          open onClose={() => setViewing(null)}
          title={viewing.name}
          subtitle={resource === "customers" ? "Customer" : "Supplier"}
          fields={[
            { label: "Email", value: viewing.email },
            { label: "Phone", value: viewing.phone },
            can("gst") && { label: "Tax / GSTIN", value: viewing.tax_no },
            { label: "Payment terms", value: viewing.payment_terms },
            { label: "Added", value: viewing.created_at },
          ]}
        />
      )}
    </>
  );

  function PartyModal({ resource, party, onClose, onSaved, canGst }) {
    const isNew = !party.id;
    const [f, setF] = useState({
      name: party.name || "", email: party.email || "", phone: party.phone || "",
      tax_no: party.tax_no || "", payment_terms: party.payment_terms || "",
    });
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const noun = resource === "customers" ? "customer" : "supplier";
    const save = async () => {
      setBusy(true);
      try {
        if (isNew) await api.post(`/${resource}`, f);
        else await api.put(`/${resource}/${party.id}`, f);
        toast.success(isNew ? "Saved" : "Updated");
        onSaved();
      } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
    };
    return (
      <Modal open title={isNew ? `New ${noun}` : `Edit ${noun}`} onClose={onClose}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field></div>
          <Field label="Email"><input className="input" value={f.email} onChange={set("email")} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} /></Field>
          {canGst && <Field label="Tax / GSTIN"><input className="input" value={f.tax_no} onChange={set("tax_no")} /></Field>}
          <Field label="Payment terms"><input className="input" value={f.payment_terms} onChange={set("payment_terms")} placeholder="e.g. Net 30" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !f.name} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Save</button>
        </div>
      </Modal>
    );
  }
}

function PartyDeleteModal({ resource, party, onClose, onDeleted, toast }) {
  const [busy, setBusy] = useState(false);
  const noun = resource === "customers" ? "customer" : "supplier";
  const go = async () => {
    setBusy(true);
    try { await api.delete(`/${resource}/${party.id}`); toast.success(`${noun[0].toUpperCase() + noun.slice(1)} deleted`); onDeleted(); }
    catch (e) { toast.error(apiError(e)); setBusy(false); }
  };
  return (
    <Modal open title={`Delete ${noun}`} onClose={onClose}>
      <p className="text-sm text-slate-600">Delete <b>{party.name}</b>? This can't be undone.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary !bg-rose-600 hover:!bg-rose-700" disabled={busy} onClick={go}>{busy && <Spinner className="h-4 w-4" />} Delete</button>
      </div>
    </Modal>
  );
}

const Tab = ({ id, cur, set, icon: Icon, children }) => (
  <button onClick={() => set(id)} className={`flex items-center gap-2 rounded-lg px-4 py-1.5 ${cur === id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"}`}>
    <Icon className="h-4 w-4" /> {children}
  </button>
);
