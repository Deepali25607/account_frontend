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
      <div className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-700 to-brand-950 p-10 text-white md:flex">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 font-extrabold">L</div>
          <span className="text-lg font-extrabold">LedgerFlow</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Accounting & inventory that grows with you.</h1>
          <p className="mt-4 max-w-md text-brand-100">One platform — Basic to Premium. Track purchases, sales and stock today; unlock accounting, GST and manufacturing planning as you scale.</p>
          <ul className="mt-6 space-y-2 text-sm text-brand-50">
            {["Real-time stock & valuation", "GST-ready invoicing (Standard+)", "BOM-driven MRP (Premium)"].map((f) => (
              <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4" /> {f}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-200">© 2026 LedgerFlow SaaS</p>
      </div>

      {/* form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 font-extrabold text-white">L</div>
            <span className="text-lg font-extrabold text-slate-800">LedgerFlow</span>
          </div>

          <div className="mb-6 inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            {["login", "register"].map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-lg px-4 py-1.5 capitalize ${mode === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"}`}>
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

            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}

            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button onClick={useDemo} className="mt-4 w-full text-center text-sm text-slate-500 hover:text-brand-600">
            Use demo account (owner@demo.com / demo1234)
          </button>
        </div>
      </div>
    </div>
  );
}
