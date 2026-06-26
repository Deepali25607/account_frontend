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

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function PayModal({ kind, K, cur, parties, toast, onClose, onSaved }) {
  const [f, setF] = useState({ party_id: "", account: "bank", amount: "", note: "", pay_date: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [bills, setBills] = useState([]);       // open bills for the selected party
  const [billMode, setBillMode] = useState(false); // settle specific bills vs lump-sum
  const [alloc, setAlloc] = useState({});       // doc_id -> amount allocated

  const selected = parties.find((p) => String(p.id) === String(f.party_id));
  const outstanding = selected ? Number(selected.outstanding || 0) : 0;

  // Load the party's open bills so the user can allocate against them. Resets on
  // party change happen in the select's onChange (keeps this effect side-effect
  // free until the async result lands).
  useEffect(() => {
    if (!f.party_id) return;
    let active = true;
    api.get("/payments/bills", { params: { kind, party_id: f.party_id } })
      .then((r) => { if (active) setBills(r.data); })
      .catch(() => { if (active) setBills([]); });
    return () => { active = false; };
  }, [f.party_id, kind]);

  const pickParty = (party_id) => { setF((s) => ({ ...s, party_id })); setBills([]); setAlloc({}); setBillMode(false); };

  const allocTotal = round2(bills.reduce((s, b) => s + (Number(alloc[b.id]) || 0), 0));
  const amt = billMode ? allocTotal : round2(f.amount);
  const surplus = !billMode && selected && amt > outstanding ? round2(amt - outstanding) : 0;

  const setBillAmt = (b, val) => {
    const v = Math.max(0, Math.min(round2(val), Number(b.outstanding)));
    setAlloc((a) => ({ ...a, [b.id]: v }));
  };
  const toggleBill = (b) => setAlloc((a) => ({ ...a, [b.id]: Number(a[b.id]) > 0 ? 0 : Number(b.outstanding) }));
  const selectAllBills = () => setAlloc(Object.fromEntries(bills.map((b) => [b.id, Number(b.outstanding)])));

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        kind, party_id: Number(f.party_id), account: f.account,
        amount: amt, pay_date: f.pay_date, note: f.note,
      };
      if (billMode) {
        payload.allocations = bills
          .map((b) => ({ doc_id: b.id, amount: Number(alloc[b.id]) || 0 }))
          .filter((x) => x.amount > 0);
      }
      const { data } = await api.post("/payments", payload);
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
            <select className="input" value={f.party_id} onChange={(e) => pickParty(e.target.value)}>
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
            {!billMode && outstanding > 0 && (
              <button type="button" onClick={() => setF({ ...f, amount: String(outstanding) })}
                className="text-xs font-semibold text-brand-600 hover:underline">Pay full</button>
            )}
          </div>
        )}

        {/* Bill-wise allocation — settle chosen invoices/bills instead of a lump sum. */}
        {selected && bills.length > 0 && (
          <div className="col-span-2 rounded-lg border border-slate-200">
            <label className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <input type="checkbox" checked={billMode} onChange={(e) => { setBillMode(e.target.checked); setAlloc({}); }} />
                Settle specific bills ({bills.length} open)
              </span>
              {billMode && (
                <button type="button" onClick={selectAllBills} className="text-xs font-semibold text-brand-600 hover:underline">Select all</button>
              )}
            </label>
            {billMode && (
              <div className="max-h-56 overflow-auto border-t border-slate-100">
                {bills.map((b) => {
                  const on = Number(alloc[b.id]) > 0;
                  return (
                    <div key={b.id} className="flex items-center gap-2 border-b border-slate-50 px-3 py-2 text-sm last:border-0">
                      <input type="checkbox" checked={on} onChange={() => toggleBill(b)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-700">{b.doc_no}</div>
                        <div className="text-xs text-slate-400">{b.doc_date} · open {fmtMoney(b.outstanding, cur)}</div>
                      </div>
                      <input type="number" min="0" step="0.01" max={b.outstanding}
                        className="input w-28 text-right" placeholder="0"
                        value={alloc[b.id] ?? ""} onChange={(e) => setBillAmt(b, e.target.value)} />
                    </div>
                  );
                })}
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-sm font-semibold">
                  <span className="text-slate-500">Allocated</span>
                  <span className={K.amt}>{fmtMoney(allocTotal, cur)}</span>
                </div>
              </div>
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
            {billMode ? (
              <input type="number" className="input bg-slate-50" value={allocTotal} readOnly title="Sum of the bills you've allocated" />
            ) : (
              <input type="number" min="0" step="0.01" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            )}
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
