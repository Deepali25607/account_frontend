import { useCallback, useEffect, useState } from "react";
import { Printer, Bluetooth, Check, RefreshCw, Info, Smartphone } from "lucide-react";
import PageHead from "../components/PageHead";
import { Spinner, useToast } from "../ui";
import { THERMAL_SIZES } from "../pdf";
import { isNativeApp } from "../files";
import { loadPrintSettings, savePrintSettings } from "../printSettings";
import { savedPrinter, savePrinter, forgetPrinter, listPrinters, isPluginMissing, friendlyPrintError, printTestDirect, printDirect } from "../printer";
import { useAuth } from "../auth";
import { webBtSupported, pickWebPrinter, listWebPrinters, testWebPrinter, probePrintChannels, saveWebPrinterChannel, RECONNECT_NEEDED } from "../webbt";

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
  const { me } = useAuth();
  const [s, setS] = useState(loadPrintSettings);
  const set = (patch) => setS(savePrintSettings(patch));

  // Bluetooth device management: native plugin in the Android app, Web
  // Bluetooth (BLE) in Chrome/Edge, guidance elsewhere.
  const native = isNativeApp();
  const webBt = !native && webBtSupported();
  const [connected, setConnected] = useState(savedPrinter);
  const [devices, setDevices] = useState(null); // null = not loaded yet
  const [scanning, setScanning] = useState(false);
  const [btError, setBtError] = useState("");

  const refresh = useCallback(async () => {
    setScanning(true); setBtError("");
    try {
      if (native) {
        setDevices(await listPrinters());
      } else {
        // Previously authorised Web Bluetooth devices (Chrome's getDevices —
        // returns null where the API is unavailable; the chooser still works).
        const known = await listWebPrinters();
        setDevices(known ? known.map((d) => ({ name: d.name || "Bluetooth printer", id: d.id })) : []);
      }
    } catch (e) {
      setDevices([]);
      setBtError(native && isPluginMissing(e)
        ? "Direct printing needs the latest app version — update the LedgerFlow app."
        : friendlyPrintError(e));
    } finally { setScanning(false); }
  }, [native]);

  useEffect(() => { if ((native || webBt) && s.printerType === "thermal") refresh(); }, [native, webBt, s.printerType, refresh]);

  const connect = (d) => { savePrinter(d); setConnected(d); toast.success(`${d.name} connected — receipts will print to it directly`); };
  const forget = () => { forgetPrinter(); setConnected(null); toast.success("Printer disconnected — the next print will ask which one to use"); };

  // Test-print probe: sends a numbered line through every writable channel and
  // write mode; the user picks the number that actually printed and we pin
  // that channel for all future receipts.
  const [probe, setProbe] = useState(null); // null | "running" | [results]
  const runProbe = async (picked) => {
    setProbe("running"); setBtError("");
    try {
      const target = picked || savedPrinter();
      setProbe(await probePrintChannels(target));
    } catch (e) {
      setProbe(null);
      if (String(e?.message) === RECONNECT_NEEDED && !picked) {
        const d = await pickWebPrinter();
        if (d) return runProbe(d);
      } else {
        setBtError(friendlyPrintError(e));
      }
    }
  };
  const pinChannel = (r) => {
    saveWebPrinterChannel({ service: r.service, char: r.char, mode: r.mode });
    // The probe verified plain text — start receipts in the matching Old
    // format. Modern can be re-selected below if this printer handles it.
    set({ thermalFormat: "old" });
    setProbe(null);
    toast.success(`Print channel #${r.n} saved — thermal format set to Old (plain text) to match`);
  };

  // One-tap plain-text test line to the connected printer.
  const [testingNative, setTestingNative] = useState(false);
  const runNativeTest = async () => {
    setTestingNative(true); setBtError("");
    try {
      await printTestDirect(connected);
      toast.success("Test line sent — check the printer");
    } catch (e) {
      setBtError(isPluginMissing(e)
        ? "Direct printing needs the latest app version — update the LedgerFlow app."
        : friendlyPrintError(e));
    } finally { setTestingNative(false); }
  };

  // Short sample bill in a specific format — isolates "formatting the printer
  // can't digest" from connection problems: if the plain test line prints but
  // the Modern sample doesn't while Old does, pick Old above.
  const printSample = async (format) => {
    setTestingNative(true); setBtError("");
    try {
      await printDirect(connected, {
        company: me?.tenant, currency: me?.tenant?.currency,
        doc: {
          doc_no: "SAMPLE-001", doc_date: new Date().toISOString().slice(0, 10), doc_type: "sale",
          subtotal: 118, tax_total: 0, grand_total: 118, received: 118, payment_account: "cash",
          lines: [
            { item_name: "Sample Item", qty: 1, unit_price: 100, line_total: 100 },
            { item_name: "Item With A Much Longer Name", qty: 2, unit_price: 9, line_total: 18 },
          ],
        },
        party: "Format Test", kind: "sale", paymentKey: "received",
        widthMm: s.widthMm, format,
      });
      toast.success(`${format === "old" ? "Old" : "Modern"} sample sent — check the printer`);
    } catch (e) {
      setBtError(friendlyPrintError(e));
    } finally { setTestingNative(false); }
  };

  // Browser: open the Bluetooth chooser, remember the pick, and try a test
  // connection so unsupported (classic-only) printers are flagged right away.
  const connectWeb = async () => {
    setBtError("");
    try {
      const d = await pickWebPrinter();
      if (!d) return; // chooser cancelled
      setConnected({ id: d.id, name: d.name || "Bluetooth printer" });
      try {
        await testWebPrinter(d);
        toast.success(`${d.name || "Printer"} connected — receipts will print to it directly`);
      } catch (e) {
        const friendly = friendlyPrintError(e);
        if (friendly) toast.error(`${d.name || "Printer"}: ${friendly}`);
      }
      refresh();
    } catch (e) {
      setBtError(friendlyPrintError(e));
    }
  };

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

              {!native && !webBt ? (
                <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>This browser doesn't support Bluetooth. Use <b>Chrome or Edge</b> to connect a printer here, or the <b>LedgerFlow Android app</b> — thermal receipts on this device open as a PDF you can print or share instead.</span>
                </div>
              ) : (
                <>
                  {btError && (
                    <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" /><span>{btError}</span>
                    </div>
                  )}

                  {devices === null || scanning ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><Spinner className="h-4 w-4 text-brand-500" /> Looking for devices…</div>
                  ) : (() => {
                    // In browsers without getDevices() the list comes back empty —
                    // still show the remembered printer so "Connected" is visible.
                    const list = [...devices];
                    const idOf = (d) => native ? d.address : d.id;
                    if (connected && !list.some((d) => idOf(d) === idOf(connected))) list.unshift(connected);
                    return list.length === 0 ? (
                      !btError && <p className="py-2 text-sm text-slate-500">No printer connected yet.</p>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        {list.map((d) => {
                          const isConnected = connected && idOf(connected) === idOf(d);
                          return (
                            <button key={idOf(d)} type="button" onClick={() => !isConnected && connect(d)}
                              className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50">
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-800">{d.name || "Unknown device"}</span>
                                {native && <span className="block text-xs text-slate-400">{d.address}</span>}
                              </span>
                              {isConnected
                                ? <span className="text-sm font-semibold text-emerald-600">Connected</span>
                                : <span className="text-sm font-medium text-brand-600">Connect</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button className="btn-ghost btn-sm" onClick={native ? refresh : connectWeb} disabled={scanning}>
                      {native
                        ? <><RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} /> Connect another device</>
                        : <><Bluetooth className="h-3.5 w-3.5" /> Connect another device</>}
                    </button>
                    {connected && <button className="btn-ghost btn-sm" onClick={forget}>Disconnect {connected.name}</button>}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    {native
                      ? "New printer? Pair it in Android Bluetooth settings first — it will then appear in this list."
                      : "Turn the printer on and tap Connect — your browser will show nearby Bluetooth devices. Works with Bluetooth LE printers; for classic-Bluetooth-only models use the Android app."}
                  </p>

                  {/* App: connection + format tests over classic Bluetooth */}
                  {native && connected && (
                    <div className="mt-4 rounded-xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-800">Test your printer</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        "Test line" checks the connection with plain text. The sample bills check formatting —
                        if only the Old sample prints correctly, choose <b>Old</b> under thermal format below.
                      </p>
                      {testingNative ? (
                        <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Spinner className="h-4 w-4 text-brand-500" /> Sending…</div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="btn-ghost btn-sm" onClick={runNativeTest}><Printer className="h-3.5 w-3.5" /> Test line</button>
                          <button className="btn-ghost btn-sm" onClick={() => printSample("modern")}>Sample bill · Modern</button>
                          <button className="btn-ghost btn-sm" onClick={() => printSample("old")}>Sample bill · Old</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Browser only: probe for the channel that actually reaches the print head */}
                  {!native && connected && (
                    <div className="mt-4 rounded-xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-800">Connected but printing blank?</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Printers listen on different Bluetooth channels. Run a test — a few numbered lines are sent through every channel — then tap the number that came out on paper.
                      </p>
                      {probe === "running" ? (
                        <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Spinner className="h-4 w-4 text-brand-500" /> Sending test lines…</div>
                      ) : Array.isArray(probe) ? (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-slate-700">Which test number printed?</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {probe.filter((r) => r.sent).map((r) => (
                              <button key={r.n} className="btn-primary btn-sm" onClick={() => pinChannel(r)}>#{r.n}</button>
                            ))}
                            <button className="btn-ghost btn-sm" onClick={() => setProbe(null)}>None printed</button>
                          </div>
                          {probe.every((r) => !r.sent) && <p className="mt-2 text-xs text-rose-600">No channel accepted data — this printer may not support printing over Bluetooth LE. Use the Android app instead.</p>}
                          {probe.some((r) => r.sent) && <p className="mt-2 text-xs text-slate-400">If none printed, this printer's BLE side can't print — use the Android app (classic Bluetooth) instead.</p>}
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="btn-ghost btn-sm" onClick={() => runProbe()}><Printer className="h-3.5 w-3.5" /> Test print</button>
                          {testingNative
                            ? <span className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="h-4 w-4 text-brand-500" /> Sending…</span>
                            : <>
                                <button className="btn-ghost btn-sm" onClick={() => printSample("old")}>Sample bill · Old</button>
                                <button className="btn-ghost btn-sm" onClick={() => printSample("modern")}>Sample bill · Modern</button>
                              </>}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ── Page size ── */}
            <section className="card p-5">
              <h3 className="mb-1 font-bold text-slate-800">Select page size</h3>
              <p className="mb-4 text-sm text-slate-500">Width of your receipt roll. Used as the default receipt size.</p>
              <div className="flex flex-wrap gap-3">
                {THERMAL_SIZES.map((z) => (
                  <Chip key={z.mm} active={s.widthMm === z.mm} onClick={() => set({ widthMm: z.mm })}
                    title={`${z.mm} mm roll · ${z.mm <= 58 ? 32 : z.mm <= 80 ? 48 : 64} characters per line`}>
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
