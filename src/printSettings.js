// Device-local print preferences, persisted like the theme (theme.jsx):
// default printer type, thermal roll width, and ESC/POS compatibility format.
// The remembered Bluetooth printer itself lives in printer.js (lf_thermal_printer).

const KEY = "lf_print_settings";

export const PRINT_DEFAULTS = {
  printerType: "thermal", // "regular" (A4/A5 via system print) | "thermal" (Bluetooth receipt)
  widthMm: 80,            // default thermal roll width — see THERMAL_SIZES in pdf.js
  thermalFormat: "modern", // "modern" (styled ESC/POS) | "old" (plain text for older printers)
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
