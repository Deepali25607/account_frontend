// Web Bluetooth (BLE) transport for thermal printers — lets browsers print
// directly, where the native Capacitor plugin isn't available. Works in
// Chrome/Edge (desktop + Android); Safari/Firefox have no Web Bluetooth.
//
// Limits vs the native path: the browser can only reach printers that speak
// Bluetooth LE (most modern receipt printers do; classic-SPP-only models need
// the Android app), and the device chooser is the browser's own dialog.

const KEY = "lf_webbt_printer"; // { id, name } — id is Chrome's per-origin device id

// BLE "serial bridge" services used by ESC/POS printers. We request access to
// all of them, then simply use the first writable characteristic we find.
const SERVICES = [
  0x18f0,                                   // generic printer service (+ 0x2af1 write char) — Xprinter & many clones
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",   // ISSC/Microchip transparent UART
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",   // ISSC transparent UART (older variant)
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",   // Nordic UART service
  "0000ff00-0000-1000-8000-00805f9b34fb",   // vendor serial used by several cheap printers
];

export const webBtSupported = () =>
  typeof navigator !== "undefined" && !!navigator.bluetooth?.requestDevice;

export const savedWebPrinter = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
export const saveWebPrinter = (d) => localStorage.setItem(KEY, JSON.stringify({ id: d.id, name: d.name || "Bluetooth printer" }));
export const forgetWebPrinter = () => localStorage.removeItem(KEY);

// Thrown when a saved device id can't be resolved in this browser session —
// the caller should show the chooser again (needs a user gesture).
export const RECONNECT_NEEDED = "webbt-reconnect-needed";

// Live BluetoothDevice objects seen this session (chooser picks + getDevices
// results), keyed by id. localStorage only holds {id, name} — without this,
// printing after connecting in Print Settings would depend on getDevices(),
// which not every browser exposes.
const sessionDevices = new Map();

/** Browser device chooser (must be called from a user gesture, e.g. a click).
 *  Returns the picked BluetoothDevice (also remembered), or null on cancel. */
export async function pickWebPrinter() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      // Many printers don't advertise their serial service, so filtering by
      // service would hide them — show everything and let the user pick.
      acceptAllDevices: true,
      optionalServices: SERVICES,
    });
    sessionDevices.set(device.id, device);
    saveWebPrinter(device);
    return device;
  } catch (e) {
    if (e?.name === "NotFoundError") return null; // user closed the chooser
    throw e;
  }
}

/** Devices this site was already granted access to ([BluetoothDevice]), or
 *  null when the browser doesn't expose getDevices(). */
export async function listWebPrinters() {
  if (!navigator.bluetooth?.getDevices) return null;
  try {
    const devices = await navigator.bluetooth.getDevices();
    devices.forEach((d) => sessionDevices.set(d.id, d));
    return devices;
  } catch { return null; }
}

let cached = null; // { device, char } — GATT connection reused across prints

async function findWritable(server) {
  for (const svc of await server.getPrimaryServices()) {
    for (const ch of await svc.getCharacteristics()) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
    }
  }
  throw new Error("This printer doesn't expose a writable Bluetooth LE channel — use the Android app for classic-Bluetooth printers");
}

async function connect(device) {
  if (cached?.device === device && device.gatt?.connected) return cached.char;
  const server = await device.gatt.connect();
  const char = await findWritable(server);
  device.addEventListener("gattserverdisconnected", () => { if (cached?.device === device) cached = null; }, { once: true });
  cached = { device, char };
  return char;
}

/** Connect and locate the print characteristic without sending anything —
 *  used by Print Settings to validate a newly picked device. */
export async function testWebPrinter(device) { await connect(device); }

async function resolve(target) {
  if (target?.gatt) return target; // already a BluetoothDevice
  if (sessionDevices.has(target?.id)) return sessionDevices.get(target.id);
  const known = await listWebPrinters(); // may repopulate sessionDevices
  const device = known?.find((d) => d.id === target?.id);
  if (!device) throw new Error(RECONNECT_NEEDED);
  return device;
}

/** Send ESC/POS `bytes` to `target` — a BluetoothDevice from pickWebPrinter(),
 *  or a saved { id, name }. Throws RECONNECT_NEEDED if the id can't be
 *  resolved (caller should re-run pickWebPrinter from a user gesture). */
export async function printWebBt(target, bytes) {
  const device = await resolve(target);
  const char = await connect(device);
  if (char.properties.write) {
    // Write-with-response gives us flow control — safe at larger chunks.
    for (let i = 0; i < bytes.length; i += 240) await char.writeValueWithResponse(bytes.slice(i, i + 240));
  } else {
    // No response channel: small chunks + a breather so the buffer keeps up.
    for (let i = 0; i < bytes.length; i += 20) {
      await char.writeValueWithoutResponse(bytes.slice(i, i + 20));
      await new Promise((r) => setTimeout(r, 15));
    }
  }
}
