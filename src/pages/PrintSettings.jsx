import { useCallback, useEffect, useState } from "react";
import { Printer, Bluetooth, Check, RefreshCw, Info, Smartphone } from "lucide-react";
import PageHead from "../components/PageHead";
import { Spinner, useToast } from "../ui";
import { THERMAL_SIZES } from "../pdf";
import { loadPrintSettings, savePrintSettings } from "../printSettings";
import { canPrintDirect, savedPrinter, savePrinter, forgetPrinter, listPrinters, isPluginMissing } from "../printer";

const TYPES = [
  { id: "regular", label: "Regular printer", desc: "A4 or A5 size — system print dialog", icon: Printer },
  { id: "thermal", label: "Bluetooth thermal printer", desc: "Receipt rolls — 2, 3 or 4 inch", icon: Bluetooth },
];

const FORMATS = [
  { id: "modern", label: "Modern", desc: "Styled receipt: bold totals, big header, auto-cut" },
  { id: "old", label: "Old", desc: "Plain text — works with older printers" },
];

/** Pill-style option button used for page size and thermal format. */
function Chip({ active, onClick, children, title }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`rounded-full border px-5 py-2 text-sm font-semibold transition active:scale-95 ${
        active ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
      }`}>
      {children}
    </button>
  );
}

export default function PrintSettings() {
  const toast = useToast();
  const [s, setS] = useState(loadPrintSettings);
  const set = (patch) => setS(savePrintSettings(patch));

  // Bluetooth device management — only possible inside the Android app.
  const native = canPrintDirect();
  const [connected, setConnected] = useState(savedPrinter);
  const [devices, setDevices] = useState(null); // null = not loaded yet
  const [scanning, setScanning] = useState(false);
  const [btError, setBtError] = useState("");

  const refresh = useCallback(async () => {
    setScanning(true); setBtError("");
    try {
      setDevices(await listPrinters());
    } catch (e) {
      setDevices([]);
      setBtError(isPluginMissing(e)
        ? "Direct printing needs the latest app version — update the LedgerFlow app."
        : String(e?.message || e));
    } finally { setScanning(false); }
  }, []);

  useEffect(() => { if (native && s.printerType === "thermal") refresh(); }, [native, s.printerType, refresh]);

  const connect = (d) => { savePrinter(d); setConnected(d); toast.success(`${d.name} connected — receipts will print to it directly`); };
  const forget = () => { forgetPrinter(); setConnected(null); toast.success("Printer disconnected — the next print will ask which one to use"); };

  return (
    <>
      <PageHead title="Print Settings" subtitle="Choose your default printer and receipt style. Saved on this device." />

      <div className="space-y-6">
        {/* ── Printer type ── */}
        <section className="card p-5">
          <h3 className="mb-1 font-bold text-slate-800">Printer type</h3>
          <p className="mb-4 text-sm text-slate-500">Used as the default when you tap Print on a bill.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {TYPES.map((t) => {
              const active = s.printerType === t.id;
              return (
                <button key={t.id} onClick={() => set({ printerType: t.id })}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${active ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`}>
                  <span className={`grid h-10 w-10 place-items-center rounded-lg ${active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}><t.icon className="h-5 w-5" /></span>
                  <span className="flex-1">
                    <span className="block font-semibold text-slate-800">{t.label}</span>
                    <span className="block text-xs text-slate-500">{t.desc}</span>
                  </span>
                  {active && <Check className="h-5 w-5 text-brand-600" />}
                </button>
              );
            })}
          </div>
        </section>

        {s.printerType === "regular" && (
          <section className="card p-5">
            <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>Invoices print as A4 pages through your device's print dialog (or the share sheet on mobile), where you can also pick A5 paper.</span>
            </div>
          </section>
        )}

        {s.printerType === "thermal" && (
          <>
            {/* ── Bluetooth device ── */}
            <section className="card p-5">
              <h3 className="mb-1 font-bold text-slate-800">Available devices</h3>
              <p className="mb-4 text-sm text-slate-500">Bluetooth printers paired with this device. Tap one to connect it.</p>

              {!native ? (
                <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>Direct Bluetooth printing works in the <b>LedgerFlow Android app</b>. On this device, thermal receipts open as a PDF you can print or share instead.</span>
                </div>
              ) : (
                <>
                  {btError && (
                    <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" /><span>{btError}</span>
                    </div>
                  )}

                  {devices === null || scanning ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><Spinner className="h-4 w-4 text-brand-500" /> Looking for paired devices…</div>
                  ) : devices.length === 0 && !btError ? (
                    <p className="py-2 text-sm text-slate-500">No paired Bluetooth device found.</p>
                  ) : devices.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      {devices.map((d) => {
                        const isConnected = connected?.address === d.address;
                        return (
                          <button key={d.address} type="button" onClick={() => !isConnected && connect(d)}
                            className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-800">{d.name || "Unknown device"}</span>
                              <span className="block text-xs text-slate-400">{d.address}</span>
                            </span>
                            {isConnected
                              ? <span className="text-sm font-semibold text-emerald-600">Connected</span>
                              : <span className="text-sm font-medium text-brand-600">Connect</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button className="btn-ghost btn-sm" onClick={refresh} disabled={scanning}>
                      <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} /> Connect another device
                    </button>
                    {connected && <button className="btn-ghost btn-sm" onClick={forget}>Disconnect {connected.name}</button>}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">New printer? Pair it in Android Bluetooth settings first — it will then appear in this list.</p>
                </>
              )}
            </section>

            {/* ── Page size ── */}
            <section className="card p-5">
              <h3 className="mb-1 font-bold text-slate-800">Select page size</h3>
              <p className="mb-4 text-sm text-slate-500">Width of your receipt roll. Used as the default receipt size.</p>
              <div className="flex flex-wrap gap-3">
                {THERMAL_SIZES.map((z) => (
                  <Chip key={z.mm} active={s.widthMm === z.mm} onClick={() => set({ widthMm: z.mm })} title={`${z.mm} mm roll`}>
                    {z.label.replace('"', " inch")} <span className={s.widthMm === z.mm ? "text-brand-400" : "text-slate-400"}>· {z.mm} mm</span>
                  </Chip>
                ))}
              </div>
            </section>

            {/* ── Thermal format ── */}
            <section className="card p-5">
              <h3 className="mb-1 font-bold text-slate-800">Select thermal format</h3>
              <p className="mb-4 text-sm text-slate-500">How the receipt commands are sent to the printer.</p>
              <div className="flex flex-wrap gap-3">
                {FORMATS.map((f) => (
                  <Chip key={f.id} active={s.thermalFormat === f.id} onClick={() => set({ thermalFormat: f.id })} title={f.desc}>
                    {f.label}
                  </Chip>
                ))}
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>Please select <b>Old</b> format in case Modern doesn't work with your printer — it prints plain text without styling, which older printers handle better.</span>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
