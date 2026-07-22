// Direct Bluetooth thermal printing (Android app only). Wraps the native
// ThermalPrinter Capacitor plugin (see ThermalPrinterPlugin.java) and remembers
// the chosen printer so printing is one tap after the first pick.

import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./files";
import { buildReceiptEscpos } from "./escpos";
import { loadPrintSettings } from "./printSettings";

const ThermalPrinter = registerPlugin("ThermalPrinter");
const KEY = "lf_thermal_printer";

/** Direct printing is only possible inside the Android app. */
export const canPrintDirect = () => isNativeApp();

export const savedPrinter = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
export const savePrinter = (d) => localStorage.setItem(KEY, JSON.stringify({ name: d.name, address: d.address }));
export const forgetPrinter = () => localStorage.removeItem(KEY);

/** Paired Bluetooth devices as [{name, address}]. Rejects if Bluetooth is off,
 *  permission is denied, or the installed APK predates the plugin. */
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

/** Send the receipt straight to `printer` ({name, address}). Throws on failure.
 *  The Modern/Old thermal format from Print Settings applies unless the caller
 *  passes an explicit `format`. */
export async function printDirect(printer, receiptArgs) {
  const bytes = buildReceiptEscpos({ format: loadPrintSettings().thermalFormat, ...receiptArgs });
  await ThermalPrinter.print({ address: printer.address, data: toB64(bytes) });
}
