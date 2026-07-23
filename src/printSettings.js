// Device-local print preferences, persisted like the theme (theme.jsx):
// default printer type, thermal roll width, and ESC/POS compatibility format.
// The remembered Bluetooth printer itself lives in printer.js (lf_thermal_printer).

const KEY = "lf_print_settings";

export const PRINT_DEFAULTS = {
  printerType: "thermal", // "regular" (A4/A5 via system print) | "thermal" (Bluetooth receipt)
  widthMm: 80,            // default thermal roll width — see THERMAL_SIZES in pdf.js
  thermalFormat: "modern", // "modern" (styled ESC/POS) | "old" (plain text for older printers)
  charsPerLine: "auto",   // "auto" (derived from widthMm) | 32 | 48 | 64
  encoding: "cp437",      // "cp437" | "cp850" | "utf8" — ESC t codepage (Modern format only)
  density: 3,             // 1..5 print darkness; 3 = printer default (no command sent)
  feedLines: 4,           // blank lines fed after each receipt (0..8)
  autoCut: true,          // send the partial-cut command (Modern format only)
  rememberPrinter: true,  // persist the chosen printer on this device
  autoConnect: true,      // print straight to the remembered printer without asking
};

export const loadPrintSettings = () => {
  try { return { ...PRINT_DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
  catch { return { ...PRINT_DEFAULTS }; }
};

/** Merge `patch` into the saved settings and return the result. */
export const savePrintSettings = (patch) => {
  const next = { ...loadPrintSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
};
