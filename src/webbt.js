// Web Bluetooth (BLE) transport for thermal printers — lets browsers print
// directly, where the native Capacitor plugin isn't available. Works in
// Chrome/Edge (desktop + Android); Safari/Firefox have no Web Bluetooth.
//
// Limits vs the native path: the browser can only reach printers that speak
// Bluetooth LE (most modern receipt printers do; classic-SPP-only models need
// the Android app), and the device chooser is the browser's own dialog.
//
// Printers differ in WHICH characteristic actually reaches the print head and
// which write mode their firmware honours — a wrong pick "prints" blank paper.
// We guess with a known-channels list, and Print Settings offers a Test print
// that probes every channel/mode; the user picks the number that printed and
// that exact channel is remembered for all future receipts.

const KEY = "lf_webbt_printer"; // { id, name, channel?: {service, char, mode} }

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

/** Pin the verified print channel ({service, char, mode}) after a Test print. */
export const saveWebPrinterChannel = (channel) => {
  const cur = savedWebPrinter();
  if (cur) localStorage.setItem(KEY, JSON.stringify({ ...cur, channel }));
  cached = null; // reconnect through the pinned channel next time
};

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

async function resolve(target) {
  if (target?.gatt) return target; // already a BluetoothDevice
  if (sessionDevices.has(target?.id)) return sessionDevices.get(target.id);
  const known = await listWebPrinters(); // may repopulate sessionDevices
  const device = known?.find((d) => d.id === target?.id);
  if (!device) throw new Error(RECONNECT_NEEDED);
  return device;
}

// ── channel discovery ──────────────────────────────────────────────────────

const chKey = (ch) => `${ch.service.uuid}|${ch.uuid}`;

/** Every writable characteristic, known print channels first. */
async function writableChannels(server) {
  const found = [];
  const seen = new Set();
  const add = (ch) => {
    if ((ch.properties.write || ch.properties.writeWithoutResponse) && !seen.has(chKey(ch))) { seen.add(chKey(ch)); found.push(ch); }
  };
  for (const [svcId, chId] of CHANNELS) {
    try { add(await (await server.getPrimaryService(svcId)).getCharacteristic(chId)); }
    catch { /* this service isn't on this printer — try the next */ }
  }
  try {
    for (const svc of await server.getPrimaryServices()) {
      for (const ch of await svc.getCharacteristics()) add(ch);
    }
  } catch { /* some stacks reject a full enumeration — known channels still count */ }
  return found;
}

async function pickChannel(server, device) {
  // A channel verified by Test print wins over guessing.
  const saved = savedWebPrinter();
  if (saved?.channel && saved.id === device.id) {
    try {
      const ch = await (await server.getPrimaryService(saved.channel.service)).getCharacteristic(saved.channel.char);
      return { char: ch, mode: saved.channel.mode };
    } catch { /* printer firmware changed? fall back to guessing */ }
  }
  const all = await writableChannels(server);
  if (!all.length) throw new Error("This printer doesn't expose a writable Bluetooth LE channel — use the Android app for classic-Bluetooth printers");
  const ch = all[0];
  return { char: ch, mode: ch.properties.writeWithoutResponse ? "noresp" : "resp" };
}

let cached = null; // { device, char, mode } — GATT connection reused across prints

async function connect(device) {
  if (cached?.device === device && device.gatt?.connected) return cached;
  const server = await device.gatt.connect();
  const { char, mode } = await pickChannel(server, device);
  device.addEventListener("gattserverdisconnected", () => { if (cached?.device === device) cached = null; }, { once: true });
  cached = { device, char, mode };
  return cached;
}

/** Connect and locate the print characteristic without sending anything —
 *  used by Print Settings to validate a newly picked device. */
export async function testWebPrinter(device) { await connect(device); }

// ── writing ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function writeOne(char, mode, part) {
  if (mode === "noresp" && char.properties.writeWithoutResponse) {
    await char.writeValueWithoutResponse(part);
    await sleep(24);  // let the printer's buffer drain
  } else {
    await char.writeValueWithResponse(part);
    await sleep(8);   // the ack paces us, but the bridge→head UART still needs air
  }
}

// Some BLE bridges swallow the first packet after a connection settles — seen
// as receipts printing with their opening bytes missing. Send a sacrificial
// init (ESC @, harmless if it does arrive) so real data never rides the first
// write, then give the link a beat.
async function warmUp(char, mode) {
  try { await writeOne(char, mode, Uint8Array.from([0x1b, 0x40])); } catch { /* ignore */ }
  await sleep(150);
}

// 20-byte chunks: the write payload limit at the default BLE MTU. Anything
// bigger relies on GATT long writes, which cheap printer firmware often ACKs
// and then drops — the classic "paper feeds but prints blank" failure.
async function writeAll(char, mode, bytes) {
  for (let i = 0; i < bytes.length; i += 20) await writeOne(char, mode, bytes.slice(i, i + 20));
}

/** Send ESC/POS `bytes` to `target` — a BluetoothDevice from pickWebPrinter(),
 *  or a saved { id, name }. Throws RECONNECT_NEEDED if the id can't be
 *  resolved (caller should re-run pickWebPrinter from a user gesture). */
export async function printWebBt(target, bytes) {
  const device = await resolve(target);
  const { char, mode } = await connect(device);
  await warmUp(char, mode);
  await writeAll(char, mode, bytes);
}

// ── test-print probe (Print Settings) ──────────────────────────────────────

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0x7f);

/**
 * Probe every writable channel/write-mode with a numbered plain-text line
 * ("LedgerFlow test #N"). Returns [{ n, service, char, mode, sent, error? }].
 * The user reports which number came out; pass that entry's {service, char,
 * mode} to saveWebPrinterChannel() to pin it.
 */
export async function probePrintChannels(target) {
  const device = await resolve(target);
  const server = await device.gatt.connect();
  const chans = await writableChannels(server);
  const attempts = [];
  for (const ch of chans) {
    for (const mode of ["noresp", "resp"]) {
      if (mode === "noresp" && !ch.properties.writeWithoutResponse) continue;
      if (mode === "resp" && !ch.properties.write) continue;
      attempts.push({ ch, mode });
    }
  }
  const results = [];
  for (let i = 0; i < attempts.length; i++) {
    const { ch, mode } = attempts[i];
    const n = i + 1;
    // Plain repeated text: survives dropped packets (the number appears three
    // times) and contains nothing a lossy stream could misread as a command.
    const payload = ascii(`\nTEST ${n}  TEST ${n}  TEST ${n}\n\n\n`);
    try {
      await warmUp(ch, mode);
      await writeAll(ch, mode, payload);
      results.push({ n, service: ch.service.uuid, char: ch.uuid, mode, sent: true });
    } catch (e) {
      results.push({ n, service: ch.service.uuid, char: ch.uuid, mode, sent: false, error: String(e?.message || e) });
    }
    await sleep(400); // keep the printouts visually separate
  }
  return results;
}
