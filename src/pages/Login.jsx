import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Field, apiError, Spinner } from "../ui";
import { Check } from "lucide-react";

const TIERS = [
  { id: "basic", name: "Basic", note: "Purchases, Sales, Inventory, Reports" },
  { id: "standard", name: "Standard", note: "+ Multi-user, Accounting, GST" },
  { id: "premium", name: "Premium", note: "+ BOM, MRP, Manufacturing" },
];

export default function Login() {
  const { me, login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ company: "", name: "", email: "", password: "", tier: "basic" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (me) return <Navigate to="/" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form);
    } catch (e2) {
      setErr(apiError(e2));
    } finally {
      setBusy(false);
    }
  };

  const useDemo = () => { setMode("login"); setForm({ ...form, email: "owner@demo.com", password: "demo1234" }); };

  return (
    <div className="grid min-h-full md:grid-cols-2">
      {/* brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 to-brand-950 p-10 text-white md:flex">
        {/* animated ambient orbs */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl animate-float" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />
        <div className="relative flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 font-extrabold backdrop-blur">L</div>
          <span className="text-lg font-extrabold">LedgerFlow</span>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight">Accounting & inventory that grows with you.</h1>
          <p className="mt-4 max-w-md text-brand-100">One platform — Basic to Premium. Track purchases, sales and stock today; unlock accounting, GST and manufacturing planning as you scale.</p>
          <ul className="mt-6 space-y-2.5 text-sm text-brand-50">
            {["Real-time stock & valuation", "GST-ready invoicing (Standard+)", "BOM-driven MRP (Premium)"].map((f) => (
              <li key={f} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/15 backdrop-blur"><Check className="h-3 w-3" /></span> {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200">© 2026 LedgerFlow SaaS</p>
      </div>

      {/* form panel */}
      <div className="relative flex items-center justify-center overflow-hidden p-6">
        {/* mobile ambient glow (brand panel is hidden < md) */}
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-300/30 blur-3xl md:hidden" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl md:hidden" />
        <div className="relative w-full max-w-md animate-fade-up">
          <div className="mb-6 flex items-center gap-2.5 md:hidden">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 font-extrabold text-white shadow-glow-sm">L</div>
            <div>
              <div className="text-lg font-extrabold leading-tight text-slate-800">LedgerFlow</div>
              <div className="text-[11px] text-slate-400">Accounting & Inventory</div>
            </div>
          </div>

          <div className="glass-strong p-6 sm:p-7">
          <div className="mb-6 inline-flex rounded-2xl bg-slate-100/80 p-1 text-sm font-semibold backdrop-blur">
            {["login", "register"].map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-xl px-4 py-1.5 capitalize transition-all duration-200 active:scale-95 ${mode === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"}`}>
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <>
                <Field label="Company name"><input className="input" value={form.company} onChange={set("company")} placeholder="Acme Traders Pvt Ltd" required /></Field>
                <Field label="Your name"><input className="input" value={form.name} onChange={set("name")} placeholder="Jane Doe" required /></Field>
              </>
            )}
            <Field label="Email"><input type="email" className="input" value={form.email} onChange={set("email")} placeholder="you@company.com" required /></Field>
            <Field label="Password"><input type="password" className="input" value={form.password} onChange={set("password")} placeholder="••••••••" required /></Field>

            {mode === "register" && (
              <div>
                <span className="label">Choose a plan</span>
                <div className="grid gap-2">
                  {TIERS.map((t) => (
                    <button type="button" key={t.id} onClick={() => setForm({ ...form, tier: t.id })}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${form.tier === t.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <div>
                        <div className="font-semibold text-slate-800">{t.name}</div>
                        <div className="text-xs text-slate-500">{t.note}</div>
                      </div>
                      {form.tier === t.id && <Check className="h-5 w-5 text-brand-600" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {err && <p className="rounded-xl border border-rose-200/60 bg-rose-50/90 px-3 py-2 text-sm font-medium text-rose-600 animate-fade-up">{err}</p>}

            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button onClick={useDemo} className="mt-4 w-full text-center text-sm text-slate-500 transition hover:text-brand-600">
            Use demo account (owner@demo.com / demo1234)
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
