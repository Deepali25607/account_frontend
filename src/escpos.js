// ESC/POS byte builder for Bluetooth thermal printers. Mirrors the layout of
// exportThermalReceipt() in pdf.js, but emits printer commands instead of a
// PDF so the receipt can go straight over the wire — no printer app involved.

import { pdfMoney, companyInfo } from "./pdf";

// Printable columns in Font A per roll width. Standard rolls use the exact
// print-head widths (58 mm → 32, 80 mm → 48, 104 mm → 64); custom widths are
// derived from ~8 dots/mm with 12-dot characters, slightly conservative so
// experimental sizes never overflow the paper.
export const colsFor = (mm) => {
  if (mm <= 58 && mm >= 55) return 32;
  if (mm <= 80 && mm >= 78) return 48;
  if (mm <= 104 && mm >= 100) return 64;
  return Math.max(20, Math.floor(((mm - 10) * 2) / 3));
};

// Thermal printers speak single-byte codepages — strip anything non-ASCII
// (₹ etc. would print as garbage; pdfMoney already falls back to "INR").
const clean = (s) => String(s ?? "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "");

/** Word-wrap `s` to `cols`, hard-breaking words longer than a line. */
const wrapText = (s, cols) => {
  const words = s.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= cols) cur += " " + w;
    else { lines.push(cur); cur = w; }
    while (cur.length > cols) { lines.push(cur.slice(0, cols)); cur = cur.slice(cols); }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
};

/** Build the full ESC/POS payload for a sale/purchase receipt. Same args as
 *  exportThermalReceipt(). Returns a Uint8Array ready to send to the printer. */
export function buildReceiptEscpos({
  company, currency, doc: txn, party, kind = "sale", paymentKey = "received",
  widthMm = 80, format = "modern", charsPerLine = null, encoding = "cp437",
  density = 3, feedLines = 4, autoCut = true, _trace = null, _unicode = false,
}) {
  // _unicode keeps non-ASCII text (used by the raster/image renderer, which
  // draws glyphs itself); byte output is meaningless in that mode.
  const cl = _unicode ? (s) => String(s ?? "") : clean;
  const cols = Number(charsPerLine) || colsFor(widthMm);
  // "old" is the compatibility mode for printers that mangle styling commands:
  // plain text only — centering via space padding, no bold/double-size/cut.
  const modern = format !== "old";
  const cur = currency || "INR";
  const money = (n) => clean(pdfMoney(n, cur));
  const isReturn = txn.doc_type === "return";
  const title = kind === "sale" ? (isReturn ? "CREDIT NOTE" : "TAX INVOICE") : (isReturn ? "DEBIT NOTE" : "PURCHASE");

  const out = [];
  const textLines = _trace || []; // plain-text mirror of the receipt, for preview/debug/validation
  let curAlign = 0; // tracked so "old" mode can center by padding instead of ESC a
  const raw = (...b) => { out.push(...b); };
  const line = (s = "") => {
    let t = cl(s);
    if (!modern && curAlign === 1 && t.length < cols) t = " ".repeat(Math.floor((cols - t.length) / 2)) + t;
    textLines.push(t);
    for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i));
    out.push(0x0a);
  };
  const align = (n) => { curAlign = n; if (modern) raw(0x1b, 0x61, n); }; // 0 left · 1 center · 2 right
  const bold = (on) => { if (modern) raw(0x1b, 0x45, on ? 1 : 0); };
  const dbl = (on) => { if (modern) raw(0x1d, 0x21, on ? 0x11 : 0x00); }; // double width+height
  const rule = () => line("-".repeat(cols));
  const wrap = (s) => wrapText(cl(s), cols).forEach((ln) => line(ln));
  const lr = (l, r) => {
    l = cl(l); r = cl(r);
    if (l.length + r.length + 1 > cols) { wrap(l); line(" ".repeat(Math.max(0, cols - r.length)) + r); }
    else line(l + " ".repeat(cols - l.length - r.length) + r);
  };

  raw(0x1b, 0x40); // reset
  if (modern) {
    // Codepage select (ESC t): 0 = CP437, 2 = CP850. "utf8" sends nothing —
    // content is already reduced to ASCII (clean()), which every page shares.
    if (encoding === "cp437") raw(0x1b, 0x74, 0);
    else if (encoding === "cp850") raw(0x1b, 0x74, 2);
    // Print density (DC2 # — the control used by common 58/80 mm boards).
    // Level 3 = printer default: send nothing, maximum compatibility.
    const d = Math.max(1, Math.min(5, Number(density) || 3));
    if (d !== 3) raw(0x12, 0x23, (1 << 5) | [7, 13, 19, 25, 31][d - 1]);
  }
  const co = companyInfo(company);
  align(1);
  bold(true); dbl(true);
  wrapText(cl(co.name || "LedgerFlow"), modern ? Math.floor(cols / 2) : cols).forEach((ln) => line(ln)); // double width halves the columns
  dbl(false); bold(false);
  co.lines.forEach(wrap);
  bold(true); line(title); bold(false);
  align(0);
  line(`No: ${txn.doc_no}`);
  line(`Date: ${txn.doc_date}`);
  wrap(`${kind === "sale" ? "Customer" : "Supplier"}: ${party || "-"}`);
  rule();
  (txn.lines || []).forEach((l) => {
    wrap(l.item_name || "");
    lr(`  ${l.qty} x ${money(l.unit_price)}`, money(l.line_total));
  });
  rule();
  lr("Subtotal", money(txn.subtotal));
  if (Number(txn.tax_total)) lr("Tax", money(txn.tax_total));
  if (Number(txn.discount)) lr("Discount", `-${money(txn.discount)}`);
  if (Number(txn.extra_charges)) lr("Charges", money(txn.extra_charges));
  if (Number(txn.round_off)) lr("Round off", `${txn.round_off > 0 ? "+" : "-"}${money(Math.abs(txn.round_off))}`);
  bold(true); lr("Total", money(txn.grand_total)); bold(false);
  const paidAmt = Number(txn[paymentKey] || 0);
  if (paidAmt > 0) {
    const acct = (txn.payment_account || "cash").replace(/^./, (c) => c.toUpperCase());
    lr(`${kind === "sale" ? "Received" : "Paid"} (${acct})`, money(paidAmt));
  }
  const due = Number(txn.grand_total || 0) - paidAmt;
  bold(true); lr(due > 0 ? "Balance due" : "Balance", money(due)); bold(false);
  rule();
  align(1); line("Thank you!");
  const feed = Math.max(0, Math.min(8, Number.isFinite(+feedLines) ? +feedLines : 4));
  if (modern) {
    if (feed) raw(0x1b, 0x64, feed);           // feed clear of the tear bar
    if (autoCut) raw(0x1d, 0x56, 0x42, 0x00);  // partial cut — harmlessly ignored by cutterless printers
  } else {
    // Old mode stays pure text to the last byte — some firmware mangles ESC d.
    for (let i = 0; i < feed; i++) line();
  }
  // Refuse to emit a content-free payload (would feed blank paper), and leave
  // an inspectable trace of exactly what the receipt says.
  if (!textLines.join("").trim()) throw new Error("Receipt came out empty — nothing to print");
  if (!_trace) console.debug(`[print] receipt text generated (${cols} cols, ${format}, ${out.length} bytes):\n${textLines.join("\n")}`);
  return new Uint8Array(out);
}

/** The receipt as plain text lines, exactly as the thermal printer will lay it
 *  out at the given width/format — used for on-screen print preview. */
export function receiptPreviewLines(args) {
  const trace = [];
  buildReceiptEscpos({ ...args, _trace: trace });
  return trace;
}
