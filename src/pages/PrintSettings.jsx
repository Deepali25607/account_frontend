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
import { colsFor } from "../escpos";

const TYPES = [
  { id: "regular", label: "Regular printer", desc: "A4 or A5 size — system print dialog", icon: Printer },
  { id: "thermal", label: "Bluetooth thermal printer", desc: "Receipt rolls — 2, 3 or 4 inch", icon: Bluetooth },
];

const FORMATS = [
  { id: "modern", label: "Modern", desc: "Styled receipt: bold totals, big header, auto-cut" },
  { id: "old", label: "Old", desc: "Plain text — works with older printers" },
];

const PRESET_MMS = THERMAL_SIZES.map((z) => z.mm);
const clampMm = (n) => Math.max(40, Math.min(120, Math.round(n)));

/** Page size picker: 2/3/4-inch presets plus a free custom width in mm.
 *  Any width flows through the ESC/POS engine (colsFor) and the PDF receipt. */
function PageSizeSection({ s, set }) {
  const isCustom = !PRESET_MMS.includes(s.widthMm);
  // Keep the raw input editable (typing "7" on the way to "70"), commit only valid values.
  const [customMm, setCustomMm] = useState(isCustom ? String(s.widthMm) : "70");
  const commitCustom = (raw) => {
    setCustomMm(raw);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 40 && n <= 120) set({ widthMm: clampMm(n) });
  };
  return (
    <section className="card p-5">
      <h3 className="mb-1 font-bold text-slate-800">Select page size</h3>
      <p className="mb-4 text-sm text-slate-500">Width of your receipt roll. Used as the default receipt size.</p>
      <div className="flex flex-wrap gap-3">
        {THERMAL_SIZES.map((z) => (
          <Chip key={z.mm} active={s.widthMm === z.mm} onClick={() => set({ widthMm: z.mm })}
            title={`${z.mm} mm roll · ${colsFor(z.mm)} characters per line`}>
            {z.label.replace('"', " inch")} <span className={s.widthMm === z.mm ? "text-brand-400" : "text-slate-400"}>· {z.mm} mm</span>
          </Chip>
        ))}
        <Chip active={isCustom} onClick={() => commitCustom(customMm)} title="Set any roll width between 40 and 120 mm">
          Custom{isCustom && <span className="text-brand-400"> · {s.widthMm} mm</span>}
        </Chip>
      </div>
      {isCustom && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <label className="label !mb-0" htmlFor="customMm">Roll width</label>
          <input id="customMm" type="number" min="40" max="120" step="1" value={customMm}
            onChange={(e) => commitCustom(e.target.value)}
            onBlur={() => setCustomMm(String(s.widthMm))}
            className="input w-24 text-center" />
          <span>mm</span>
          <span className="text-slate-400">≈ {colsFor(s.widthMm)} characters per line</span>
        </div>
      )}
    </section>
  );
}

/** Labelled checkbox row for the behaviour toggles. */
function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-3">
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{desc}</span>
      </span>
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

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

              {/* connection type — Bluetooth today, USB/Network reserved */}
              <div className="mb-4 flex flex-wrap gap-2">
                <Chip active onClick={() => {}} title={native ? "Classic Bluetooth (SPP)" : "Web Bluetooth in Chrome/Edge; classic Bluetooth in the Android app"}>
                  Bluetooth {native ? "Classic" : ""}
                </Chip>
                <span className="cursor-not-allowed rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-300" title="Coming soon">USB</span>
                <span className="cursor-not-allowed rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-300" title="Coming soon">Network</span>
              </div>

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
            <PageSizeSection s={s} set={set} />

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

            {/* ── Advanced output ── */}
            <section className="card p-5">
              <h3 className="mb-1 font-bold text-slate-800">Advanced output</h3>
              <p className="mb-4 text-sm text-slate-500">Leave these at their defaults unless receipts need tuning for your printer.</p>

              <p className="label">Characters per line</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {["auto", 32, 48, 64].map((c) => (
                  <Chip key={c} active={s.charsPerLine === c} onClick={() => set({ charsPerLine: c })}
                    title={c === "auto" ? `Derived from the page size (currently ${colsFor(s.widthMm)})` : `${c} columns`}>
                    {c === "auto" ? `Auto · ${colsFor(s.widthMm)}` : c}
                  </Chip>
                ))}
              </div>

              <p className="label mt-5">Encoding</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {[["cp437", "CP437"], ["cp850", "CP850"], ["utf8", "UTF-8"]].map(([id, label]) => (
                  <Chip key={id} active={s.encoding === id} onClick={() => set({ encoding: id })}
                    title={id === "utf8" ? "No codepage command — plain ASCII passthrough" : `Selects codepage ${label} on the printer (Modern format)`}>
                    {label}
                  </Chip>
                ))}
              </div>

              <p className="label mt-5">Print density</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((d) => (
                  <Chip key={d} active={s.density === d} onClick={() => set({ density: d })}
                    title={d === 3 ? "Printer default (no command sent)" : d < 3 ? "Lighter" : "Darker"}>
                    {d}
                  </Chip>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">3 = printer default. Only change if prints are too light or too dark; not all printers support it.</p>

              <p className="label mt-5">Feed lines after print</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                <input type="number" min="0" max="8" step="1" value={s.feedLines}
                  onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set({ feedLines: Math.max(0, Math.min(8, Math.round(n))) }); }}
                  className="input w-24 text-center" />
                <span className="text-slate-400">blank lines fed so the receipt clears the tear bar</span>
              </div>
            </section>

            {/* ── Behaviour ── */}
            <section className="card p-5">
              <h3 className="mb-1 font-bold text-slate-800">Printer behaviour</h3>
              <div className="divide-y divide-slate-100">
                <ToggleRow label="Auto cut" desc="Send the paper-cut command after each receipt (Modern format; ignored by cutterless printers)"
                  checked={s.autoCut} onChange={(v) => set({ autoCut: v })} />
                <ToggleRow label="Remember printer" desc="Keep the connected printer saved on this device"
                  checked={s.rememberPrinter} onChange={(v) => { set({ rememberPrinter: v }); if (!v) { forgetPrinter(); setConnected(null); } }} />
                <ToggleRow label="Auto connect" desc="Print straight to the remembered printer — turn off to be asked every time"
                  checked={s.autoConnect} onChange={(v) => set({ autoConnect: v })} />
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
