import { useEffect, useState } from "react";
import { Check, Crown, Clock, BadgeCheck, IndianRupee } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { useToast, apiError, Spinner, fmtMoney, Modal, Field } from "../ui";
import PageHead from "../components/PageHead";

const TIERS = [
  { id: "basic", name: "Basic", tagline: "Core trading operations",
    features: ["Purchase management", "Sales management", "Inventory & stock valuation", "Standard reports", "Single user"] },
  { id: "standard", name: "Standard", tagline: "Multi-user + proper books",
    features: ["Everything in Basic", "Multi-user with roles", "Accounting ledger & trial balance", "GST / tax-compliant invoicing", "Tax return-ready reports"] },
  { id: "premium", name: "Premium", tagline: "Manufacturing & planning",
    features: ["Everything in Standard", "Bill of Materials (multi-level)", "Production planning", "MRP based on BOM", "Manufacturing reports"] },
];
const RANK = { basic: 1, standard: 2, premium: 3 };
const OPEN = ["pending", "awaiting_payment", "payment_reported"];

export default function Billing() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [prices, setPrices] = useState({});
  const [requests, setRequests] = useState([]);
  const [ask, setAsk] = useState(null);   // tier being requested
  const current = me.tenant.tier;
  const isOwner = me.user.role === "owner";

  const load = () => {
    api.get("/auth/pricing").then((r) => setPrices(Object.fromEntries(r.data.map((p) => [p.tier, p])))).catch(() => {});
    api.get("/plan-requests").then((r) => setRequests(r.data)).catch(() => setRequests([]));
  };
  useEffect(load, []);

  const openReq = requests.find((r) => OPEN.includes(r.status));
  const priceOf = (tier) => prices[tier] ? fmtMoney(prices[tier].price_monthly, prices[tier].currency) : null;

  return (
    <>
      <PageHead title="Plans & billing" subtitle="Plan changes are reviewed and activated by the platform team after payment." />

      {!isOwner && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">Only the account owner can request a plan change.</p>}

      {openReq && <RequestStatus req={openReq} onChanged={() => { load(); refresh(); }} toast={toast} isOwner={isOwner} />}

      <div className="grid gap-4 lg:grid-cols-3">
        {TIERS.map((t) => {
          const isCurrent = t.id === current;
          const direction = RANK[t.id] > RANK[current] ? "Request upgrade" : "Request downgrade";
          const highlight = t.id === "premium";
          return (
            <div key={t.id} className={`card relative flex flex-col p-6 ${isCurrent ? "ring-2 ring-brand-500" : ""}`}>
              {highlight && <span className="absolute -top-3 left-6 badge bg-amber-100 text-amber-700"><Crown className="mr-1 h-3 w-3" /> Most capable</span>}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-slate-900">{t.name}</h3>
                {isCurrent && <span className="badge bg-brand-100 text-brand-700">Active</span>}
              </div>
              <p className="text-sm text-slate-500">{t.tagline}</p>
              {priceOf(t.id) && (
                <div className="mt-3">
                  <span className="text-3xl font-extrabold text-slate-900">{priceOf(t.id)}</span>
                  <span className="text-sm text-slate-400"> / month</span>
                  {prices[t.id].price_yearly > 0 && <div className="text-xs text-slate-400">or {fmtMoney(prices[t.id].price_yearly, prices[t.id].currency)} / year</div>}
                </div>
              )}
              <ul className="mt-4 flex-1 space-y-2">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-600"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {f}</li>
                ))}
              </ul>
              <button
                disabled={isCurrent || !isOwner || !!openReq}
                onClick={() => setAsk(t.id)}
                className={`mt-6 ${isCurrent ? "btn-ghost" : "btn-primary"} w-full`}
              >
                {isCurrent ? "Current plan" : direction}
              </button>
            </div>
          );
        })}
      </div>

      {openReq && <p className="mt-4 text-center text-xs text-slate-400">You have a request in progress — finish or cancel it before requesting another plan.</p>}

      {/* history */}
      {requests.some((r) => !OPEN.includes(r.status)) && (
        <div className="mt-8">
          <h3 className="mb-2 font-bold text-slate-700">Request history</h3>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead><tr className="bg-slate-50"><th className="th">Requested</th><th className="th">Plan</th><th className="th">Status</th><th className="th">Note</th></tr></thead>
              <tbody>
                {requests.filter((r) => !OPEN.includes(r.status)).map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="td text-slate-500">{String(r.created_at).slice(0, 10)}</td>
                    <td className="td capitalize font-medium">{r.requested_tier}</td>
                    <td className="td"><StatusBadge status={r.status} /></td>
                    <td className="td text-slate-500">{r.review_note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ask && <RequestModal tier={ask} price={priceOf(ask)} onClose={() => setAsk(null)} onSaved={() => { setAsk(null); load(); }} toast={toast} />}
    </>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: ["bg-amber-100 text-amber-700", "Pending review"],
    awaiting_payment: ["bg-blue-100 text-blue-700", "Awaiting payment"],
    payment_reported: ["bg-violet-100 text-violet-700", "Verifying payment"],
    activated: ["bg-emerald-100 text-emerald-700", "Activated"],
    rejected: ["bg-rose-100 text-rose-700", "Rejected"],
    cancelled: ["bg-slate-200 text-slate-500", "Cancelled"],
  };
  const [cls, label] = map[status] || ["bg-slate-100 text-slate-600", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function RequestStatus({ req, onChanged, toast, isOwner }) {
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState("");

  const reportPaid = async () => {
    if (!ref.trim()) return;
    setBusy(true);
    try { await api.post(`/plan-requests/${req.id}/report-payment`, { reference: ref }); toast.success("Payment details submitted for verification"); onChanged(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await api.post(`/plan-requests/${req.id}/cancel`); toast.success("Request cancelled"); onChanged(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card mb-6 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {req.status === "pending" && <Clock className="h-5 w-5 text-amber-500" />}
          {req.status === "awaiting_payment" && <IndianRupee className="h-5 w-5 text-blue-500" />}
          {req.status === "payment_reported" && <BadgeCheck className="h-5 w-5 text-violet-500" />}
          <h3 className="font-bold text-slate-800">Request to switch to <span className="capitalize">{req.requested_tier}</span></h3>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {req.status === "pending" && <p className="text-sm text-slate-500">Your request is awaiting review by the platform team. You'll see payment instructions here once it's approved.</p>}

      {req.status === "awaiting_payment" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-slate-600">Amount due: <b className="text-slate-900">{fmtMoney(req.amount, req.currency)}</b></p>
            {req.payment_instructions && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{req.payment_instructions}</pre>}
            {isOwner && (
              <div className="mt-3">
                <Field label="Payment reference / UTR"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 401234567890" /></Field>
                <div className="mt-3 flex gap-2">
                  <button className="btn-primary" disabled={busy || !ref.trim()} onClick={reportPaid}>{busy && <Spinner className="h-4 w-4" />} I've paid — submit</button>
                  <button className="btn-ghost" disabled={busy} onClick={cancel}>Cancel request</button>
                </div>
              </div>
            )}
          </div>
          {req.payment_qr && (
            <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 p-3">
              <img src={req.payment_qr} alt="Payment QR" className="max-h-48 rounded-lg" />
              <span className="mt-2 text-xs text-slate-400">Scan to pay</span>
            </div>
          )}
        </div>
      )}

      {req.status === "payment_reported" && (
        <p className="text-sm text-slate-500">Payment reference <b className="text-slate-700">{req.payment_reference}</b> submitted. The platform team will verify and activate your plan shortly.</p>
      )}
    </div>
  );
}

function RequestModal({ tier, price, onClose, onSaved, toast }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await api.post("/plan-requests", { requested_tier: tier, note }); toast.success("Upgrade request submitted"); onSaved(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title={`Request ${tier} plan`} onClose={onClose}>
      <p className="text-sm text-slate-600">
        Submit a request to switch to the <b className="capitalize">{tier}</b> plan{price ? ` (${price}/month)` : ""}. The platform team will review it and share payment instructions. Your plan changes only after payment is verified.
      </p>
      <div className="mt-4"><Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the reviewer should know" /></Field></div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy && <Spinner className="h-4 w-4" />} Submit request</button>
      </div>
    </Modal>
  );
}
