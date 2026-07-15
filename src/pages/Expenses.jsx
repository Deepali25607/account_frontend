import { useEffect, useState } from "react";
import { Plus, ReceiptText, Trash2 } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, Spinner, Empty, Modal, Field, useToast, apiError } from "../ui";
import PageHead from "../components/PageHead";

export default function Expenses() {
  const { me } = useAuth();
  const cur = me.tenant.currency;
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => {
    setRows(null);
    api.get("/expenses").then((r) => setRows(r.data)).catch((e) => { toast.error(apiError(e)); setRows([]); });
    api.get("/expenses/categories").then((r) => setCats(r.data)).catch(() => setCats([]));
  };
  useEffect(load, []);

  const del = async (x) => {
    if (!confirm(`Delete this ${x.category} expense of ${fmtMoney(x.amount, cur)}?`)) return;
    try { await api.delete(`/expenses/${x.id}`); toast.success("Expense deleted"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const month = new Date().toISOString().slice(0, 7);
  const monthRows = (rows || []).filter((x) => x.expense_date.startsWith(month));
  const monthTotal = monthRows.reduce((s, x) => s + Number(x.amount || 0), 0);

  return (
    <>
      <PageHead title="Expenses" subtitle="Track business spending — rent, salaries, utilities and other running costs." />

      {/* summary + action */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4 sm:col-span-2">
          <div className="text-sm text-slate-500">Spent this month</div>
          <div className="mt-1 text-2xl font-extrabold text-rose-600">{fmtMoney(monthTotal, cur)}</div>
          <div className="text-xs text-slate-400">{monthRows.length} expense{monthRows.length === 1 ? "" : "s"} recorded this month</div>
        </div>
        <button className="btn-primary sm:h-auto" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add Expense
        </button>
      </div>

      {/* history */}
      <div className="card overflow-hidden">
        {rows === null ? (
          <div className="grid h-32 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
        ) : !rows.length ? (
          <Empty icon={ReceiptText} title="No expenses yet" hint="Record rent, salaries, utilities and other business costs here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="th">Date</th><th className="th">Category</th>
                  <th className="th">Paid to</th><th className="th">Account</th>
                  <th className="th">Note</th><th className="th text-right">Amount</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} className="hover:bg-slate-50/60">
                    <td className="td text-slate-500">{x.expense_date}</td>
                    <td className="td font-medium">{x.category}</td>
                    <td className="td text-slate-500">{x.paid_to || "—"}</td>
                    <td className="td capitalize">{x.account}</td>
                    <td className="td text-slate-500">{x.note || "—"}</td>
                    <td className="td text-right font-bold text-rose-600">{fmtMoney(x.amount, cur)}</td>
                    <td className="td text-right">
                      <button onClick={() => del(x)} title="Delete expense"
                        className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <ExpenseModal cur={cur} cats={cats} toast={toast}
          onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />
      )}
    </>
  );
}

function ExpenseModal({ cur, cats, toast, onClose, onSaved }) {
  const [f, setF] = useState({
    category: "", amount: "", account: "cash", paid_to: "", note: "",
    expense_date: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Category picker with an inline "create new" mode.
  const [catList, setCatList] = useState(cats);
  const [newCat, setNewCat] = useState(null);   // null = picking, string = typing a new one
  const [catBusy, setCatBusy] = useState(false);

  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    setCatBusy(true);
    try {
      const { data } = await api.post("/expenses/categories", { name });
      setCatList(data.categories);
      setF((s) => ({ ...s, category: data.name }));
      setNewCat(null);
      toast.success(`Category "${data.name}" added`);
    } catch (e) { toast.error(apiError(e)); } finally { setCatBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/expenses", { ...f, amount: Number(f.amount) });
      toast.success(`Expense of ${fmtMoney(Number(f.amount), cur)} recorded`);
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open title="Add Expense" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Category">
            {newCat === null ? (
              <select className="input" value={f.category}
                onChange={(e) => e.target.value === "__new__" ? setNewCat("") : setF({ ...f, category: e.target.value })}>
                <option value="">Select…</option>
                {catList.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">＋ New category…</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input className="input flex-1" autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="Category name" />
                <button type="button" className="btn-primary" disabled={catBusy || !newCat.trim()} onClick={addCategory}>
                  {catBusy ? <Spinner className="h-4 w-4" /> : "Add"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setNewCat(null)}>Cancel</button>
              </div>
            )}
          </Field>
        </div>
        <Field label="Amount">
          <input type="number" min="0" step="0.01" className="input" value={f.amount} onChange={set("amount")} />
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={f.expense_date} onChange={set("expense_date")} />
        </Field>
        <Field label="Paid from">
          <select className="input" value={f.account} onChange={set("account")}>
            <option value="cash">Cash</option><option value="bank">Bank</option>
          </select>
        </Field>
        <Field label="Paid to (optional)">
          <input className="input" value={f.paid_to} onChange={set("paid_to")} placeholder="Landlord, staff, vendor…" />
        </Field>
        <div className="col-span-2">
          <Field label="Note (optional)">
            <input className="input" value={f.note} onChange={set("note")} placeholder="Bill no., month, remarks…" />
          </Field>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !f.category.trim() || !(Number(f.amount) > 0)} onClick={save}>
          {busy && <Spinner className="h-4 w-4" />} Add Expense
        </button>
      </div>
    </Modal>
  );
}
