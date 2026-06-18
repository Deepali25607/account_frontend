import { useEffect, useState } from "react";
import {
  Building2, Users, ShieldCheck, ShieldOff, LogOut, Sun, Moon,
  RefreshCw, Tags, Save, Ticket, Plus, Trash2, Power,
  ClipboardList, Upload, QrCode, BadgeCheck,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { useTheme } from "../theme";
import { fmtNum, fmtMoney, Spinner, Empty, apiError, useToast, Modal, Field } from "../ui";

const TIERS = ["basic", "standard", "premium"];
const TIER_STYLE = {
  basic: "bg-emerald-100 text-emerald-700",
  standard: "bg-brand-100 text-brand-700",
  premium: "bg-amber-100 text-amber-700",
};

function Stat({ icon: Icon, label, value, tone = "text-slate-800" }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
      <div>
        <div className={`text-xl font-extrabold ${tone}`}>{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { me, logout } = useAuth();
  const { dark, toggleMode } = useTheme();
  const toast = useToast();
  const [orgs, setOrgs] = useState(null);
  const [stats, setStats] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const [o, s, p] = await Promise.all([api.get("/platform/orgs"), api.get("/platform/stats"), api.get("/platform/pricing")]);
      setOrgs(o.data);
      setStats(s.data);
      setPricing(p.data);
    } catch (e) {
      toast.error(apiError(e));
      setOrgs([]);
    }
  };
  useEffect(() => { load(); }, []);

  const changeTier = async (org, tier) => {
    if (tier === org.tier) return;
    setBusyId(org.id);
    try {
      await api.patch(`/platform/orgs/${org.id}/tier`, { tier });
      toast.success(`${org.name} → ${tier} plan`);
      await load();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusyId(null); }
  };

  const toggleStatus = async (org) => {
    setBusyId(org.id);
    try {
      await api.patch(`/platform/orgs/${org.id}/status`, { active: !org.active });
      toast.success(`${org.name} ${org.active ? "suspended" : "restored"}`);
      await load();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="min-h-full bg-slate-50">
      {/* top bar */}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 font-extrabold text-white">L</div>
        <div className="min-w-0">
          <div className="font-extrabold tracking-tight text-slate-800">LedgerFlow · Platform Admin</div>
          <div className="text-xs text-slate-400">{me?.user?.name} · super-admin</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={load} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Refresh"><RefreshCw className="h-[18px] w-[18px]" /></button>
          <button onClick={toggleMode} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Toggle light/dark">
            {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          <button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Log out"><LogOut className="h-[18px] w-[18px]" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-800">Organizations</h1>
          <p className="text-sm text-slate-500">Manage every organization on the platform — control plan access and suspend or restore accounts.</p>
        </div>

        {/* stats */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={Building2} label="Organizations" value={fmtNum(stats.orgs)} />
            <Stat icon={ShieldCheck} label="Active" value={fmtNum(stats.active)} tone="text-emerald-600" />
            <Stat icon={ShieldOff} label="Suspended" value={fmtNum(stats.suspended)} tone="text-rose-600" />
            <Stat icon={Users} label="Total users" value={fmtNum(stats.users)} />
          </div>
        )}

        {/* org table */}
        <div className="card overflow-hidden">
          {!orgs ? (
            <div className="grid place-items-center py-16"><Spinner className="h-7 w-7 text-brand-500" /></div>
          ) : !orgs.length ? (
            <Empty icon={Building2} title="No organizations yet" hint="Organizations appear here as companies sign up." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="th">Organization</th>
                    <th className="th">Users</th>
                    <th className="th">Items</th>
                    <th className="th">Purch.</th>
                    <th className="th">Sales</th>
                    <th className="th">Plan</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.id} className={`hover:bg-slate-50/60 ${!o.active ? "opacity-60" : ""}`}>
                      <td className="td">
                        <div className="font-semibold text-slate-800">{o.name}</div>
                        <div className="text-xs text-slate-400">#{o.id} · since {String(o.createdAt).slice(0, 10)}</div>
                      </td>
                      <td className="td">{fmtNum(o.users)}<span className="text-slate-400"> / {o.userLimit}</span></td>
                      <td className="td">{fmtNum(o.items)}</td>
                      <td className="td">{fmtNum(o.purchases)}</td>
                      <td className="td">{fmtNum(o.sales)}</td>
                      <td className="td">
                        <select
                          className="input !py-1.5 !w-32"
                          value={o.tier}
                          disabled={busyId === o.id}
                          onChange={(e) => changeTier(o, e.target.value)}
                        >
                          {TIERS.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                        </select>
                      </td>
                      <td className="td">
                        <span className={`badge ${o.active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                          {o.active ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td className="td text-right">
                        <button
                          onClick={() => toggleStatus(o)}
                          disabled={busyId === o.id}
                          className={`btn btn-sm ${o.active ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                        >
                          {busyId === o.id ? <Spinner className="h-3.5 w-3.5" /> : o.active ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                          {o.active ? "Suspend" : "Restore"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Changing a plan instantly grants or revokes that organization's feature access. Suspending blocks all of its users from signing in until restored.
        </p>

        {/* Plan pricing */}
        <div className="mt-10">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-800"><Tags className="h-5 w-5 text-brand-600" /> Plan pricing</h2>
          <p className="mb-4 text-sm text-slate-500">Set the subscription price for each plan. Tenants see these on their billing screen.</p>
          {!pricing ? (
            <div className="card grid h-28 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {pricing.map((p) => <PricingCard key={p.tier} plan={p} onSaved={load} toast={toast} />)}
            </div>
          )}
        </div>

        <PlanRequests toast={toast} onActivated={load} />
        <PaymentSettings toast={toast} />
        <Coupons toast={toast} />
      </main>
    </div>
  );
}

function ReqStatusBadge({ status }) {
  const map = {
    pending: ["bg-amber-100 text-amber-700", "Pending"],
    awaiting_payment: ["bg-blue-100 text-blue-700", "Awaiting payment"],
    payment_reported: ["bg-violet-100 text-violet-700", "Payment reported"],
    activated: ["bg-emerald-100 text-emerald-700", "Activated"],
    rejected: ["bg-rose-100 text-rose-700", "Rejected"],
    cancelled: ["bg-slate-200 text-slate-500", "Cancelled"],
  };
  const [cls, label] = map[status] || ["bg-slate-100 text-slate-600", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function PlanRequests({ toast, onActivated }) {
  const [rows, setRows] = useState(null);
  const [approve, setApprove] = useState(null);
  const [reject, setReject] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => { setRows(null); api.get("/platform/plan-requests").then((r) => setRows(r.data)).catch(() => setRows([])); };
  useEffect(load, []);

  const activate = async (r) => {
    setBusyId(r.id);
    try { await api.post(`/platform/plan-requests/${r.id}/activate`); toast.success(`${r.tenant_name} activated on ${r.requested_tier}`); load(); onActivated?.(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusyId(null); }
  };

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-800"><ClipboardList className="h-5 w-5 text-brand-600" /> Upgrade requests</h2>
      <p className="mb-4 text-sm text-slate-500">Review plan-change requests, share payment details, then verify payment to activate.</p>
      <div className="card overflow-hidden">
        {rows === null ? <div className="grid h-24 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
          : !rows.length ? <Empty icon={ClipboardList} title="No requests" hint="Plan-change requests from organizations appear here." />
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead><tr className="bg-slate-50">
                  <th className="th">Organization</th><th className="th">Change</th><th className="th">Status</th>
                  <th className="th">Amount</th><th className="th">Payment ref</th><th className="th text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="td font-semibold text-slate-800">{r.tenant_name}{r.note && <div className="text-xs font-normal text-slate-400">“{r.note}”</div>}</td>
                      <td className="td capitalize">{r.current_tier} → <b>{r.requested_tier}</b></td>
                      <td className="td"><ReqStatusBadge status={r.status} /></td>
                      <td className="td">{r.amount != null ? fmtMoney(r.amount, r.currency || "INR") : "—"}</td>
                      <td className="td text-slate-500">{r.payment_reference || "—"}</td>
                      <td className="td text-right whitespace-nowrap">
                        {r.status === "pending" && (
                          <>
                            <button className="btn-primary btn-sm" onClick={() => setApprove(r)}>Approve</button>
                            <button className="btn-ghost btn-sm ml-1 text-rose-600" onClick={() => setReject(r)}>Reject</button>
                          </>
                        )}
                        {(r.status === "payment_reported" || r.status === "awaiting_payment") && (
                          <>
                            <button className="btn-primary btn-sm" disabled={busyId === r.id} onClick={() => activate(r)}>{busyId === r.id ? <Spinner className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />} Verify & activate</button>
                            <button className="btn-ghost btn-sm ml-1 text-rose-600" onClick={() => setReject(r)}>Reject</button>
                          </>
                        )}
                        {["activated", "rejected", "cancelled"].includes(r.status) && <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
      {approve && <ApproveModal req={approve} onClose={() => setApprove(null)} onSaved={() => { setApprove(null); load(); }} toast={toast} />}
      {reject && <RejectModal req={reject} onClose={() => setReject(null)} onSaved={() => { setReject(null); load(); }} toast={toast} />}
    </div>
  );
}

function ApproveModal({ req, onClose, onSaved, toast }) {
  const [amount, setAmount] = useState(req.amount ?? "");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/platform/plan-requests/${req.id}/approve`, { amount: amount === "" ? undefined : Number(amount), payment_instructions: instructions });
      toast.success("Approved — payment instructions shared");
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title={`Approve · ${req.tenant_name} → ${req.requested_tier}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Amount (blank = plan's monthly price)"><input type="number" min="0" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Auto from pricing" /></Field>
        <Field label="Payment instructions (blank = use saved payment settings)">
          <textarea className="input min-h-[90px]" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="UPI ID, payee, steps… Leave blank to use the saved Payment settings + QR below." />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Approve & share payment</button>
      </div>
    </Modal>
  );
}

function RejectModal({ req, onClose, onSaved, toast }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post(`/platform/plan-requests/${req.id}/reject`, { review_note: reason }); toast.success("Request rejected"); onSaved(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title={`Reject · ${req.tenant_name}`} onClose={onClose}>
      <Field label="Reason (shown to the organization)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Payment not received" /></Field>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary !bg-rose-600 hover:!bg-rose-700" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Reject</button>
      </div>
    </Modal>
  );
}

function PaymentSettings({ toast }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/platform/payment-settings").then((r) => setF({ upi_id: "", payee_name: "", instructions: "", qr_image: "", ...r.data })).catch(() => setF({ upi_id: "", payee_name: "", instructions: "", qr_image: "" })); }, []);

  const onQr = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { toast.error("QR image too large (max ~1.5 MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setF((x) => ({ ...x, qr_image: reader.result }));
    reader.readAsDataURL(file);
  };
  const save = async () => {
    setBusy(true);
    try { await api.put("/platform/payment-settings", f); toast.success("Payment settings saved"); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  if (!f) return null;
  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-800"><QrCode className="h-5 w-5 text-brand-600" /> Payment settings</h2>
      <p className="mb-4 text-sm text-slate-500">Default UPI / QR details shared with organizations when you approve a request.</p>
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-3">
          <Field label="UPI ID"><input className="input" value={f.upi_id || ""} onChange={(e) => setF({ ...f, upi_id: e.target.value })} placeholder="business@upi" /></Field>
          <Field label="Payee name"><input className="input" value={f.payee_name || ""} onChange={(e) => setF({ ...f, payee_name: e.target.value })} placeholder="Your Company Pvt Ltd" /></Field>
          <Field label="Instructions"><textarea className="input min-h-[90px]" value={f.instructions || ""} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="Pay via any UPI app and share the UTR." /></Field>
        </div>
        <div>
          <span className="label">Payment QR image</span>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            {f.qr_image ? <img src={f.qr_image} alt="QR" className="max-h-44 rounded-lg" /> : <QrCode className="h-12 w-12 text-slate-300" />}
            <div className="flex gap-2">
              <input id="qrfile" type="file" accept="image/*" className="hidden" onChange={onQr} />
              <label htmlFor="qrfile" className="btn-ghost btn-sm cursor-pointer"><Upload className="h-4 w-4" /> {f.qr_image ? "Replace" : "Upload"} QR</label>
              {f.qr_image && <button className="btn-ghost btn-sm text-rose-600" onClick={() => setF({ ...f, qr_image: "" })}>Remove</button>}
            </div>
          </div>
        </div>
      </div>
      <button className="btn-primary mt-4" disabled={busy} onClick={save}>{busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save payment settings</button>
    </div>
  );
}

function Coupons({ toast }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = () => { setRows(null); api.get("/platform/coupons").then((r) => setRows(r.data)).catch(() => setRows([])); };
  useEffect(load, []);

  const toggle = async (c) => {
    setBusyId(c.id);
    try { await api.patch(`/platform/coupons/${c.id}`, { active: !c.active }); load(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusyId(null); }
  };
  const remove = async (c) => {
    setBusyId(c.id);
    try { await api.delete(`/platform/coupons/${c.id}`); toast.success(`Coupon ${c.code} deleted`); load(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusyId(null); }
  };

  const fmtDisc = (c) => c.discount_type === "percent" ? `${c.discount_value}% off` : `${c.discount_value} off`;

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-800"><Ticket className="h-5 w-5 text-brand-600" /> Coupons</h2>
          <p className="text-sm text-slate-500">Create discount codes tenants can apply to a plan.</p>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New coupon</button>
      </div>

      <div className="card overflow-hidden">
        {rows === null ? <div className="grid h-24 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
          : !rows.length ? <Empty icon={Ticket} title="No coupons yet" hint="Create a discount code to get started." />
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead><tr className="bg-slate-50">
                  <th className="th">Code</th><th className="th">Discount</th><th className="th">Applies to</th>
                  <th className="th">Uses</th><th className="th">Expires</th><th className="th">Status</th><th className="th text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className={`hover:bg-slate-50/60 ${!c.active ? "opacity-60" : ""}`}>
                      <td className="td"><span className="font-mono font-bold text-slate-800">{c.code}</span>{c.description && <div className="text-xs text-slate-400">{c.description}</div>}</td>
                      <td className="td font-medium">{fmtDisc(c)}</td>
                      <td className="td capitalize">{c.applies_to === "all" ? "All plans" : c.applies_to}</td>
                      <td className="td">{c.times_redeemed}{c.max_redemptions > 0 ? ` / ${c.max_redemptions}` : ""}</td>
                      <td className="td text-slate-500">{c.expires_at || "—"}</td>
                      <td className="td"><span className={`badge ${c.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{c.active ? "Active" : "Inactive"}</span></td>
                      <td className="td text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button className="btn-ghost btn-sm" disabled={busyId === c.id} onClick={() => toggle(c)} title={c.active ? "Deactivate" : "Activate"}><Power className="h-3.5 w-3.5" /></button>
                        <button className="btn-ghost btn-sm ml-1 text-rose-600 hover:bg-rose-50" disabled={busyId === c.id} onClick={() => remove(c)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {adding && <CouponModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} toast={toast} />}
    </div>
  );
}

function CouponModal({ onClose, onSaved, toast }) {
  const [f, setF] = useState({ code: "", description: "", discount_type: "percent", discount_value: "", applies_to: "all", max_redemptions: "", expires_at: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      await api.post("/platform/coupons", { ...f, discount_value: Number(f.discount_value), max_redemptions: Number(f.max_redemptions) || 0 });
      toast.success("Coupon created");
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title="New coupon" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Code"><input className="input font-mono uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" /></Field></div>
        <div className="col-span-2"><Field label="Description (optional)"><input className="input" value={f.description} onChange={set("description")} placeholder="Launch offer" /></Field></div>
        <Field label="Discount type"><select className="input" value={f.discount_type} onChange={set("discount_type")}><option value="percent">Percentage (%)</option><option value="amount">Fixed amount</option></select></Field>
        <Field label={f.discount_type === "percent" ? "Percent off" : "Amount off"}><input type="number" min="0" className="input" value={f.discount_value} onChange={set("discount_value")} /></Field>
        <Field label="Applies to"><select className="input" value={f.applies_to} onChange={set("applies_to")}><option value="all">All plans</option><option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Premium</option></select></Field>
        <Field label="Max redemptions (0 = unlimited)"><input type="number" min="0" className="input" value={f.max_redemptions} onChange={set("max_redemptions")} placeholder="0" /></Field>
        <div className="col-span-2"><Field label="Expires on (optional)"><input type="date" className="input" value={f.expires_at} onChange={set("expires_at")} /></Field></div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !f.code || !(Number(f.discount_value) > 0)} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Create coupon</button>
      </div>
    </Modal>
  );
}

function PricingCard({ plan, onSaved, toast }) {
  const [monthly, setMonthly] = useState(plan.price_monthly);
  const [yearly, setYearly] = useState(plan.price_yearly);
  const [currency, setCurrency] = useState(plan.currency);
  const [busy, setBusy] = useState(false);
  const dirty = Number(monthly) !== plan.price_monthly || Number(yearly) !== plan.price_yearly || currency !== plan.currency;

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/platform/pricing/${plan.tier}`, { price_monthly: Number(monthly), price_yearly: Number(yearly), currency });
      toast.success(`${plan.tier[0].toUpperCase() + plan.tier.slice(1)} price updated`);
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className={`badge capitalize ${TIER_STYLE[plan.tier]}`}>{plan.tier}</span>
        <span className="text-xs text-slate-400">/{currency}</span>
      </div>
      <label className="label">Currency</label>
      <input className="input mb-3" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={4} />
      <label className="label">Price / month</label>
      <input type="number" min="0" className="input mb-3" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
      <label className="label">Price / year</label>
      <input type="number" min="0" className="input" value={yearly} onChange={(e) => setYearly(e.target.value)} />
      <button className="btn-primary mt-4 w-full" disabled={busy || !dirty} onClick={save}>
        {busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save
      </button>
    </div>
  );
}
