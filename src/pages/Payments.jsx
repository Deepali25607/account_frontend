import { useEffect, useState } from "react";
import { Plus, ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, Spinner, Empty, Modal, Field, useToast, apiError } from "../ui";
import PageHead from "../components/PageHead";

// Full class strings (Tailwind can't see dynamically-built names).
const KINDS = {
  receipt: {
    id: "receipt", label: "Payment In", sub: "Money received from customers",
    party: "Customer", balLabel: "receivable", icon: ArrowDownLeft,
    amt: "text-emerald-600", tabBadge: "bg-emerald-100 text-emerald-700",
  },
  payment: {
    id: "payment", label: "Payment Out", sub: "Money paid to suppliers",
    party: "Supplier", balLabel: "payable", icon: ArrowUpRight,
    amt: "text-violet-600", tabBadge: "bg-violet-100 text-violet-700",
  },
};

export default function Payments() {
  const { me } = useAuth();
  const cur = me.tenant.currency;
  const toast = useToast();
  const [kind, setKind] = useState("receipt");
  const [rows, setRows] = useState(null);
  const [parties, setParties] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => {
    setRows(null);
    api.get("/payments", { params: { kind } }).then((r) => setRows(r.data)).catch((e) => { toast.error(apiError(e)); setRows([]); });
    api.get("/payments/parties", { params: { kind } }).then((r) => setParties(r.data)).catch(() => setParties([]));
  };
  useEffect(load, [kind]);

  const K = KINDS[kind];
  const totalOutstanding = parties.reduce((s, p) => s + Number(p.outstanding || 0), 0);
  const withBalance = parties.filter((p) => Number(p.outstanding) > 0).length;

  return (
    <>
      <PageHead title="Payments" subtitle="Record money received from customers and paid to suppliers — amounts auto-settle against open invoices and bills." />

      {/* In / Out toggle */}
      <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {Object.values(KINDS).map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 transition ${kind === k.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <k.icon className="h-4 w-4" /> {k.label}
          </button>
        ))}
      </div>

      {/* summary + action */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4 sm:col-span-2">
          <div className="text-sm text-slate-500">Total open {K.balLabel}</div>
          <div className={`mt-1 text-2xl font-extrabold ${K.amt}`}>{fmtMoney(totalOutstanding, cur)}</div>
          <div className="text-xs text-slate-400">{withBalance} {K.party.toLowerCase()}{withBalance === 1 ? "" : "s"} with an open balance</div>
        </div>
        <button className="btn-primary sm:h-auto" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Record {K.label}
        </button>
      </div>

      {/* history */}
      <div className="card overflow-hidden">
        {rows === null ? (
          <div className="grid h-32 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
        ) : !rows.length ? (
          <Empty icon={Wallet} title={`No ${K.label} records yet`} hint={K.sub} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="th">Date</th><th className="th">{K.party}</th>
                  <th className="th">Account</th><th className="th">Note</th>
                  <th className="th text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="td text-slate-500">{p.pay_date}</td>
                    <td className="td font-medium">{p.party_name}</td>
                    <td className="td capitalize">{p.account}</td>
                    <td className="td text-slate-500">{p.note || "—"}</td>
                    <td className={`td text-right font-bold ${K.amt}`}>{fmtMoney(p.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <PayModal kind={kind} K={K} cur={cur} parties={parties} toast={toast}
          onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />
      )}
    </>
  );
}

function PayModal({ kind, K, cur, parties, toast, onClose, onSaved }) {
  const [f, setF] = useState({ party_id: "", account: "bank", amount: "", note: "", pay_date: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const selected = parties.find((p) => String(p.id) === String(f.party_id));
  const outstanding = selected ? Number(selected.outstanding || 0) : 0;
  const amt = Number(f.amount);
  const surplus = selected && amt > outstanding ? amt - outstanding : 0;

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/payments", {
        kind, party_id: Number(f.party_id), account: f.account,
        amount: amt, pay_date: f.pay_date, note: f.note,
      });
      let msg = `${K.label} of ${fmtMoney(amt, cur)} recorded`;
      if (data.unallocated > 0) msg += ` · ${fmtMoney(data.unallocated, cur)} kept as advance`;
      toast.success(msg);
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open title={`Record ${K.label}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label={K.party}>
            <select className="input" value={f.party_id} onChange={(e) => setF({ ...f, party_id: e.target.value })}>
              <option value="">Select…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{Number(p.outstanding) > 0 ? ` — ${fmtMoney(p.outstanding, cur)} open` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {selected && (
          <div className="col-span-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">Open {K.balLabel}: <span className={`font-bold ${K.amt}`}>{fmtMoney(outstanding, cur)}</span></span>
            {outstanding > 0 && (
              <button type="button" onClick={() => setF({ ...f, amount: String(outstanding) })}
                className="text-xs font-semibold text-brand-600 hover:underline">Pay full</button>
            )}
          </div>
        )}

        <Field label="Account">
          <select className="input" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>
            <option value="bank">Bank</option><option value="cash">Cash</option>
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={f.pay_date} onChange={(e) => setF({ ...f, pay_date: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Field label="Amount">
            <input type="number" min="0" step="0.01" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Note (optional)">
            <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Cheque no., UPI ref, etc." />
          </Field>
        </div>
      </div>

      {surplus > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Amount exceeds the open {K.balLabel} by {fmtMoney(surplus, cur)} — the surplus will be kept as an advance.
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !f.party_id || !(amt > 0)} onClick={save}>
          {busy && <Spinner className="h-4 w-4" />} Record {K.label}
        </button>
      </div>
    </Modal>
  );
}
