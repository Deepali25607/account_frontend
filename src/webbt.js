// Web Bluetooth (BLE) transport for thermal printers — lets browsers print
// directly, where the native Capacitor plugin isn't available. Works in
// Chrome/Edge (desktop + Android); Safari/Firefox have no Web Bluetooth.
//
// Limits vs the native path: the browser can only reach printers that speak
// Bluetooth LE (most modern receipt printers do; classic-SPP-only models need
// the Android app), and the device chooser is the browser's own dialog.

const KEY = "lf_webbt_printer"; // { id, name } — id is Chrome's per-origin device id

// Known BLE print channels as [service, write characteristic], tried in this
// order — these are the "serial bridges" the common ESC/POS printers use.
const CHANNELS = [
  [0x18f0, 0x2af1],                                                                   // generic printer service — Xprinter & many clones
  ["49535343-fe7d-4ae5-8fa9-9fafd205e455", "49535343-8841-43f4-a8d4-ecbe34729bb3"],   // ISSC transparent UART
  ["e7810a71-73ae-499d-8c15-faa9aef0c3f2", "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f"],   // Microchip transparent UART
  ["6e400001-b5a3-f393-e0a9-e50e24dcca9e", "6e400002-b5a3-f393-e0a9-e50e24dcca9e"],   // Nordic UART service
  ["0000ff00-0000-1000-8000-00805f9b34fb", "0000ff02-0000-1000-8000-00805f9b34fb"],   // vendor serial on several cheap printers
];
const SERVICES = CHANNELS.map(([svc]) => svc);

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
  // Prefer the known print channels — a printer can expose other writable
  // characteristics (config, OTA) that happily swallow bytes without printing.
  for (const [svcId, chId] of CHANNELS) {
    try {
      const ch = await (await server.getPrimaryService(svcId)).getCharacteristic(chId);
      if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
    } catch { /* this service isn't on this printer — try the next */ }
  }
  // Fallback: scan everything, preferring write-without-response — the mode
  // these printer bridges are built around.
  let writable = null;
  for (const svc of await server.getPrimaryServices()) {
    for (const ch of await svc.getCharacteristics()) {
      if (ch.properties.writeWithoutResponse) return ch;
      if (ch.properties.write && !writable) writable = ch;
    }
  }
  if (writable) return writable;
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
  // 20-byte chunks: the write payload limit at the default BLE MTU. Anything
  // bigger relies on GATT long writes, which cheap printer firmware often
  // ACKs and then drops — the classic "paper feeds but prints blank" failure.
  for (let i = 0; i < bytes.length; i += 20) {
    const part = bytes.slice(i, i + 20);
    if (char.properties.writeWithoutResponse) {
      await char.writeValueWithoutResponse(part);
      await new Promise((r) => setTimeout(r, 12)); // let the printer's buffer drain
    } else {
      await char.writeValueWithResponse(part);    // the response ack is our flow control
    }
  }
}
