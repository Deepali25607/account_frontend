// ESC/POS byte builder for Bluetooth thermal printers. Mirrors the layout of
// exportThermalReceipt() in pdf.js, but emits printer commands instead of a
// PDF so the receipt can go straight over the wire — no printer app involved.

import { pdfMoney, companyInfo } from "./pdf";

// Printable columns in Font A per roll width: 58 mm → 32, 80 mm → 48, 104 mm → 64.
const colsFor = (mm) => (mm <= 58 ? 32 : mm <= 80 ? 48 : 64);

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
export function buildReceiptEscpos({ company, currency, doc: txn, party, kind = "sale", paymentKey = "received", widthMm = 80, format = "modern" }) {
  const cols = colsFor(widthMm);
  // "old" is the compatibility mode for printers that mangle styling commands:
  // plain text only — centering via space padding, no bold/double-size/cut.
  const modern = format !== "old";
  const cur = currency || "INR";
  const money = (n) => clean(pdfMoney(n, cur));
  const isReturn = txn.doc_type === "return";
  const title = kind === "sale" ? (isReturn ? "CREDIT NOTE" : "TAX INVOICE") : (isReturn ? "DEBIT NOTE" : "PURCHASE");

  const out = [];
  const textLines = []; // plain-text mirror of the receipt, for debug/validation
  let curAlign = 0; // tracked so "old" mode can center by padding instead of ESC a
  const raw = (...b) => { out.push(...b); };
  const line = (s = "") => {
    let t = clean(s);
    if (!modern && curAlign === 1 && t.length < cols) t = " ".repeat(Math.floor((cols - t.length) / 2)) + t;
    textLines.push(t);
    for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i));
    out.push(0x0a);
  };
  const align = (n) => { curAlign = n; if (modern) raw(0x1b, 0x61, n); }; // 0 left · 1 center · 2 right
  const bold = (on) => { if (modern) raw(0x1b, 0x45, on ? 1 : 0); };
  const dbl = (on) => { if (modern) raw(0x1d, 0x21, on ? 0x11 : 0x00); }; // double width+height
  const rule = () => line("-".repeat(cols));
  const wrap = (s) => wrapText(clean(s), cols).forEach((ln) => line(ln));
  const lr = (l, r) => {
    l = clean(l); r = clean(r);
    if (l.length + r.length + 1 > cols) { wrap(l); line(" ".repeat(Math.max(0, cols - r.length)) + r); }
    else line(l + " ".repeat(cols - l.length - r.length) + r);
  };

  raw(0x1b, 0x40); // reset
  const co = companyInfo(company);
  align(1);
  bold(true); dbl(true);
  wrapText(clean(co.name || "LedgerFlow"), modern ? Math.floor(cols / 2) : cols).forEach((ln) => line(ln)); // double width halves the columns
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
  if (modern) {
    raw(0x1b, 0x64, 4);          // feed clear of the tear bar
    raw(0x1d, 0x56, 0x42, 0x00); // partial cut — harmlessly ignored by cutterless printers
  } else {
    // Old mode stays pure text to the last byte — some firmware mangles ESC d.
    line(); line(); line(); line();
  }
  // Refuse to emit a content-free payload (would feed blank paper), and leave
  // an inspectable trace of exactly what the receipt says.
  if (!textLines.join("").trim()) throw new Error("Receipt came out empty — nothing to print");
  console.debug(`[print] receipt text generated (${cols} cols, ${format}, ${out.length} bytes):\n${textLines.join("\n")}`);
  return new Uint8Array(out);
}
