import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme } from "../theme";
import PageHead from "../components/PageHead";

const MODES = [
  { id: "light", label: "Light", icon: Sun, desc: "Bright, default look" },
  { id: "dark", label: "Dark", icon: Moon, desc: "Easy on the eyes" },
  { id: "system", label: "System", icon: Monitor, desc: "Match your device" },
];

export default function Appearance() {
  const { mode, accent, setMode, setAccent, accents } = useTheme();

  return (
    <>
      <PageHead title="Theme & Appearance" subtitle="Personalize how LedgerFlow looks. Saved on this device." />

      <div className="space-y-6">
        <section className="card p-5">
          <h3 className="mb-1 font-bold text-slate-800">Theme</h3>
          <p className="mb-4 text-sm text-slate-500">Choose light, dark, or follow your system setting.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${active ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`}>
                  <span className={`grid h-10 w-10 place-items-center rounded-lg ${active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}><m.icon className="h-5 w-5" /></span>
                  <span className="flex-1">
                    <span className="block font-semibold text-slate-800">{m.label}</span>
                    <span className="block text-xs text-slate-500">{m.desc}</span>
                  </span>
                  {active && <Check className="h-5 w-5 text-brand-600" />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-1 font-bold text-slate-800">Accent color</h3>
          <p className="mb-4 text-sm text-slate-500">Recolors buttons, highlights and active items across the app.</p>
          <div className="flex flex-wrap gap-3">
            {accents.map((a) => {
              const active = accent === a.id;
              const rgb = a.rgb[6]; // 600 shade
              return (
                <button key={a.id} onClick={() => setAccent(a.id)} title={a.label}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition ${active ? "border-slate-300 bg-slate-50" : "border-transparent hover:bg-slate-50"}`}>
                  <span className="grid h-10 w-10 place-items-center rounded-full text-white shadow-sm" style={{ backgroundColor: `rgb(${rgb})` }}>
                    {active && <Check className="h-5 w-5" />}
                  </span>
                  <span className="text-xs font-medium text-slate-600">{a.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-3 font-bold text-slate-800">Preview</h3>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary">Primary action</button>
            <button className="btn-ghost">Secondary</button>
            <span className="badge bg-brand-100 text-brand-700">Accent badge</span>
            <span className="badge bg-emerald-100 text-emerald-700">Success</span>
            <span className="badge bg-rose-100 text-rose-700">Alert</span>
          </div>
        </section>
      </div>
    </>
  );
}
