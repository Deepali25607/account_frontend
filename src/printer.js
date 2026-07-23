// Direct Bluetooth thermal printing. Two transports behind one API:
//   • Android app  — native ThermalPrinter Capacitor plugin (classic SPP),
//     lists paired devices, remembers { name, address }.
//   • Browsers     — Web Bluetooth LE (webbt.js) in Chrome/Edge,
//     remembers { name, id } from the browser's device chooser.
// Callers use canPrintDirect()/savedPrinter()/printDirect() without caring which.

import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./files";
import { buildReceiptEscpos } from "./escpos";
import { loadPrintSettings } from "./printSettings";
import { webBtSupported, savedWebPrinter, saveWebPrinter, forgetWebPrinter, printWebBt } from "./webbt";

const ThermalPrinter = registerPlugin("ThermalPrinter");
const KEY = "lf_thermal_printer";

/** True when this device can send bytes straight to a Bluetooth printer. */
export const canPrintDirect = () => isNativeApp() || webBtSupported();

export const savedPrinter = () => {
  if (!isNativeApp()) return savedWebPrinter();
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
export const savePrinter = (d) => isNativeApp()
  ? localStorage.setItem(KEY, JSON.stringify({ name: d.name, address: d.address }))
  : saveWebPrinter(d);
export const forgetPrinter = () => isNativeApp() ? localStorage.removeItem(KEY) : forgetWebPrinter();

/** Paired Bluetooth devices as [{name, address}] (Android app only). Rejects
 *  if Bluetooth is off, permission is denied, or the APK predates the plugin. */
export async function listPrinters() {
  const { devices } = await ThermalPrinter.listPrinters();
  return devices || [];
}

// The WebView runs the live site, so this JS can be newer than the installed
// binary — that surfaces as Capacitor's "not implemented" rejection.
export const isPluginMissing = (e) => /not implemented|plugin/i.test(String(e?.message || e));

const toB64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Send the receipt straight to `printer` — {name, address} in the app, or a
 *  BluetoothDevice / saved {id, name} in the browser. Throws on failure.
 *  The Modern/Old thermal format from Print Settings applies unless the caller
 *  passes an explicit `format`. */
export async function printDirect(printer, receiptArgs) {
  const bytes = buildReceiptEscpos({ format: loadPrintSettings().thermalFormat, ...receiptArgs });
  if (isNativeApp()) await ThermalPrinter.print({ address: printer.address, data: toB64(bytes) });
  else await printWebBt(printer, bytes);
}
