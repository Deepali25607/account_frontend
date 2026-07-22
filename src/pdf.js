import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { isNativeApp, isMobileBrowser, outputFile } from "./files";

const BRAND = [37, 71, 233]; // brand-600

/**
 * Normalize the `company` argument, which may be a plain name (legacy callers,
 * shared public invoices) or the full company-profile object from me.tenant.
 * Returns { name, lines[] } where lines are the address/contact/GSTIN rows to
 * print under the company name on documents.
 */
export function companyInfo(company) {
  if (!company) return { name: "", lines: [], logo: "" };
  if (typeof company === "string") return { name: company, lines: [], logo: "" };
  const c = company;
  // The address comes from a textarea, so collapse any line breaks into ", " —
  // otherwise the raw newlines confuse line-height math in the PDF header.
  const street = String(c.address || "").replace(/\s*\n\s*/g, ", ").replace(/\s+/g, " ").trim();
  const addr = [street, [c.city, c.state, c.pincode].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const contact = [c.phone && `Ph: ${c.phone}`, c.email].filter(Boolean).join("  ·  ");
  const lines = [addr, contact, c.gstin && `GSTIN: ${c.gstin}`].filter(Boolean);
  return { name: c.name || "", lines, logo: c.logo || "" };
}

/** Draw the company logo (data-URL) top-right, scaled to fit a box, preserving
 *  aspect ratio. Never throws — a bad image just skips rendering. */
function drawLogo(doc, logo) {
  if (!logo) return;
  try {
    const props = doc.getImageProperties(logo);
    const boxW = 34, boxH = 20, rightX = 196, topY = 12; // mm
    const scale = Math.min(boxW / props.width, boxH / props.height);
    const w = props.width * scale, h = props.height * scale;
    doc.addImage(logo, rightX - w, topY, w, h);
  } catch { /* unsupported/corrupt image — render the document without it */ }
}

/**
 * Format money for PDFs using jsPDF's built-in Helvetica, which only has Latin-1
 * glyphs. Symbols inside Latin-1 ($, £, ¥) render fine; ones outside it (₹ U+20B9,
 * € U+20AC) come out as blank/garbled boxes and break right-aligned width measuring.
 * For those we fall back to the ISO code prefix, e.g. "INR 1,180.00".
 */
export function pdfMoney(n, cur = "INR") {
  const opts = { style: "currency", currency: cur || "INR" };
  const sym = new Intl.NumberFormat("en-IN", opts).format(Number(n || 0));
  if ([...sym].every((c) => c.codePointAt(0) <= 0xff)) return sym;
  return new Intl.NumberFormat("en-IN", { ...opts, currencyDisplay: "code" }).format(Number(n || 0));
}

/** Shared header for every exported document. Returns the Y of the title line so
 *  callers can position content below a header that grows with the address block. */
function header(doc, title, company, subtitle) {
  const { name, lines, logo } = companyInfo(company);
  drawLogo(doc, logo);
  doc.setFontSize(16); doc.setTextColor(30, 45, 137); doc.setFont(undefined, "bold");
  doc.text("LedgerFlow", 14, 16);
  let y = 22;
  // Wrap company text to a width that clears the top-right logo, advancing y by
  // each rendered sub-line so long/multi-line addresses never overlap.
  const MAXW = 144; // mm: from the 14mm left margin to just before the logo box
  const writeBlock = (text, size, lineH) => {
    doc.setFontSize(size);
    doc.splitTextToSize(String(text), MAXW).forEach((sub) => { doc.text(sub, 14, y); y += lineH; });
  };
  doc.setTextColor(60); doc.setFont(undefined, "normal");
  if (name) writeBlock(name, 11, 5);
  doc.setTextColor(110);
  lines.forEach((ln) => writeBlock(ln, 8, 4));
  const titleY = Math.max(32, y + 4);
  doc.setFontSize(13); doc.setTextColor(20); doc.setFont(undefined, "bold");
  doc.text(title, 14, titleY);
  if (subtitle) { doc.setFontSize(9); doc.setTextColor(120); doc.setFont(undefined, "normal"); doc.text(subtitle, 14, titleY + 5); }
  return titleY;
}

/** Export an array of objects as a titled PDF table. `shareText` (optional)
 *  becomes the message alongside the file when a native share sheet is used.
 *  `mode: "print"` opens the print dialog instead of downloading (on mobile
 *  both routes go through the share sheet, where printer apps live). */
export function exportTablePdf({ title, company, subtitle, columns, rows, fileName, shareText, mode = "save" }) {
  const doc = new jsPDF();
  const titleY = header(doc, title, company, subtitle);
  autoTable(doc, {
    startY: titleY + (subtitle ? 10 : 6),
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => (c.format ? c.format(r[c.key], r) : r[c.key] ?? ""))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND, textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });
  const y = doc.lastAutoTable.finalY || 50;
  doc.setFontSize(8); doc.setTextColor(150);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, y + 8);
  const name = fileName || `${title.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  return mode === "print" ? printPdf(doc, name) : savePdf(doc, name, shareText);
}

// ── Amount in words (Indian numbering: crore / lakh / thousand) ─────────────
const W_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const W_TENS = ["", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const wTwo = (n) => n < 20 ? W_ONES[n] : `${W_TENS[Math.floor(n / 10)]}${n % 10 ? " " + W_ONES[n % 10] : ""}`;
const wThree = (n) => [Math.floor(n / 100) ? `${W_ONES[Math.floor(n / 100)]} Hundred` : "", wTwo(n % 100)].filter(Boolean).join(" ");
function numToWords(n) {
  if (!n) return "Zero";
  const parts = [];
  if (n >= 1e7) { parts.push(`${numToWords(Math.floor(n / 1e7))} Crore`); n %= 1e7; }
  if (n >= 1e5) { parts.push(`${wTwo(Math.floor(n / 1e5))} Lakh`); n %= 1e5; }
  if (n >= 1000) { parts.push(`${wTwo(Math.floor(n / 1000))} Thousand`); n %= 1000; }
  if (n) parts.push(wThree(n));
  return parts.join(" ");
}

/** "Rupees One Thousand One Hundred Eighty Only" — INR gets Rupees/Paise words,
 *  other currencies fall back to the ISO code and a NN/100 fraction. */
export function amountInWords(n, cur = "INR") {
  const v = Math.abs(Number(n || 0));
  let whole = Math.floor(v);
  let frac = Math.round((v - whole) * 100);
  if (frac === 100) { whole += 1; frac = 0; }
  if (cur === "INR") return `Rupees ${numToWords(whole)}${frac ? ` and ${numToWords(frac)} Paise` : ""} Only`;
  return `${cur || ""} ${numToWords(whole)}${frac ? ` and ${String(frac).padStart(2, "0")}/100` : ""} Only`.trim();
}

/**
 * Export a single document as an A4 PDF invoice/bill. Works for both sales
 * (default) and purchases — `kind` switches the title, party label and which
 * payment field is shown. `party` is the supplier/customer name (legacy callers
 * may still pass `customer`). `mode: "print"` opens the print dialog instead of
 * downloading (on mobile both routes go through the share sheet).
 */
export function exportInvoicePdf({ company, currency, doc, customer, party, kind = "sale", paymentKey, mode = "save", shareText }) {
  const isPurchase = kind === "purchase";
  const partyName = party ?? customer ?? "";
  const payKey = paymentKey || (isPurchase ? "paid" : "received");
  const isReturn = doc.doc_type === "return";
  const title = isReturn ? (isPurchase ? "DEBIT NOTE" : "CREDIT NOTE") : (isPurchase ? "PURCHASE INVOICE" : "TAX INVOICE");
  const money = (n) => pdfMoney(n, currency);
  const L = 14, R = 196; // A4 content edges (210mm − 14mm margins)
  const SLATE = [100, 116, 139], DARK = [15, 23, 42], LINE = [226, 232, 240];

  const pdf = new jsPDF();
  const co = companyInfo(company);

  // ── Header: company identity left, logo top-right, brand rule under both ──
  drawLogo(pdf, co.logo);
  let y = 18;
  const MAXW = 144; // clears the logo box on the right
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(...DARK);
  pdf.splitTextToSize(co.name || "Invoice", MAXW).forEach((ln) => { pdf.text(ln, L, y); y += 6.5; });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(...SLATE);
  co.lines.forEach((ln) => pdf.splitTextToSize(ln, MAXW).forEach((sub) => { pdf.text(sub, L, y); y += 4; }));
  y = Math.max(y, 34); // never rule through the logo (its box ends at y≈32)
  pdf.setDrawColor(...BRAND); pdf.setLineWidth(0.7); pdf.line(L, y, R, y);
  y += 9;

  // ── Title left · document meta right ──
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.setTextColor(...BRAND);
  pdf.text(title, L, y);
  const metaRow = (label, value, yy) => {
    pdf.setFontSize(9); pdf.setFont("helvetica", "bold"); pdf.setTextColor(...DARK);
    pdf.text(String(value), R, yy, { align: "right" });
    const vw = pdf.getTextWidth(String(value));
    pdf.setFont("helvetica", "normal"); pdf.setTextColor(...SLATE);
    pdf.text(label, R - vw - 2, yy, { align: "right" });
  };
  metaRow(`${isReturn ? "Note" : "Invoice"} No:`, doc.doc_no, y - 4);
  metaRow("Date:", doc.doc_date, y + 1);

  // ── Party block ──
  y += 9;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(...SLATE);
  pdf.text(isPurchase ? "SUPPLIER" : "BILL TO", L, y);
  y += 5;
  pdf.setFontSize(11); pdf.setTextColor(...DARK);
  pdf.text(partyName || "—", L, y);

  // ── Items table ──
  // Only surface the per-line discount column when at least one line carries one.
  const hasDisc = (doc.lines || []).some((l) => Number(l.discount) > 0);
  const discCell = (l) => Number(l.discount) > 0 ? `- ${money(l.discount)}${l.discount_type === "percent" ? ` (${l.discount_value}%)` : ""}` : "—";
  // Tax-inclusive sales store the GST-in price in unit_price — print the ex-tax
  // rate instead, so Rate + Tax % reconciles with Amount and the subtotal.
  const rateOf = (l) => Number(doc.tax_inclusive) && Number(l.tax_rate) > 0 ? l.unit_price / (1 + l.tax_rate / 100) : l.unit_price;
  const head = ["#", "Item", "HSN/SAC", "Qty", "Rate", ...(hasDisc ? ["Disc"] : []), "Tax %", "Amount"];
  const rightCols = head.map((h, i) => ["Qty", "Rate", "Disc", "Tax %", "Amount"].includes(h) ? i : -1).filter((i) => i >= 0);
  autoTable(pdf, {
    startY: y + 6,
    head: [head],
    body: (doc.lines || []).map((l, i) => [i + 1, l.item_name, l.hsn || "—", l.qty, money(rateOf(l)), ...(hasDisc ? [discCell(l)] : []), `${l.tax_rate}%`, money(l.line_total)]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.6, lineColor: LINE, lineWidth: 0.15, textColor: 50 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", lineWidth: 0 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "center", cellWidth: 9 },
      ...Object.fromEntries(rightCols.map((i) => [i, { halign: "right" }])),
    },
    margin: { left: L, right: 14 },
  });

  // ── Totals panel (right) · amount in words (left) ──
  let ty = pdf.lastAutoTable.finalY + 8;
  if (ty > 232) { pdf.addPage(); ty = 24; } // keep totals + signature together
  const wordsTopY = ty;
  const TX = 126; // totals block left edge
  const trow = (label, value, { bold = false, fill = false, top = false } = {}) => {
    if (fill) { pdf.setFillColor(...BRAND); pdf.rect(TX - 3, ty - 4.6, R - TX + 6, 6.8, "F"); }
    if (top) { pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.line(TX - 3, ty - 4.6, R + 3, ty - 4.6); }
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...(fill ? [255, 255, 255] : bold ? DARK : SLATE));
    pdf.text(label, TX, ty);
    pdf.setTextColor(...(fill ? [255, 255, 255] : DARK));
    pdf.text(value, R, ty, { align: "right" });
    ty += 6.8;
  };
  trow("Subtotal", money(doc.subtotal));
  trow("Tax", money(doc.tax_total));
  if (Number(doc.discount)) trow(doc.discount_type === "percent" ? `Discount (${doc.discount_value}%)` : "Discount", `- ${money(doc.discount)}`);
  if (Number(doc.extra_charges)) trow(doc.extra_charges_note ? `Charges (${doc.extra_charges_note})` : "Additional charges", money(doc.extra_charges));
  if (Number(doc.round_off)) trow("Round off", `${doc.round_off > 0 ? "+ " : "- "}${money(Math.abs(doc.round_off))}`);
  trow("Total Amount", money(doc.grand_total), { bold: true, fill: true });
  const paidAmt = Number(doc[payKey] || 0);
  if (paidAmt > 0) {
    const acct = (doc.payment_account || "cash").replace(/^./, (c) => c.toUpperCase());
    trow(`${isReturn ? "Amount refunded" : isPurchase ? "Amount paid" : "Amount received"} (${acct})`, money(paidAmt));
  }
  const due = Number(doc.grand_total || 0) - paidAmt;
  trow(due > 0 ? "Balance Due" : "Balance", money(due), { bold: true, top: true });

  // Amount in words — beside the totals, wrapped inside the left column.
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(...SLATE);
  pdf.text("AMOUNT IN WORDS", L, wordsTopY);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...DARK);
  let wy = wordsTopY + 5;
  pdf.splitTextToSize(amountInWords(doc.grand_total, currency), TX - L - 10).forEach((ln) => { pdf.text(ln, L, wy); wy += 4.5; });

  // ── Signature block ──
  let sy = Math.max(ty, wy) + 16;
  if (sy > 268) { pdf.addPage(); sy = 40; }
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(...DARK);
  if (co.name) pdf.text(`For ${co.name}`, R, sy, { align: "right" });
  pdf.setDrawColor(120); pdf.setLineWidth(0.2); pdf.line(R - 48, sy + 16, R, sy + 16);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...SLATE);
  pdf.text("Authorised Signatory", R - 24, sy + 20.5, { align: "center" });

  // ── Footer on every page: rule, generation note, page numbers ──
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.line(L, 284, R, 284);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(150);
    pdf.text(`This is a computer-generated document · Generated by LedgerFlow on ${new Date().toLocaleDateString()}`, L, 289);
    if (pages > 1) pdf.text(`Page ${p} of ${pages}`, R, 289, { align: "right" });
  }

  return mode === "print" ? printPdf(pdf, `${doc.doc_no}.pdf`) : savePdf(pdf, `${doc.doc_no}.pdf`, shareText);
}

/** Standard thermal roll widths, labelled by their nominal inch size. */
export const THERMAL_SIZES = [
  { label: '2"', mm: 58 },
  { label: '3"', mm: 80 },
  { label: '4"', mm: 104 },
];

// ---------------------------------------------------------------------------
// PDF output routing (see files.js for the platform rules). In the Android/iOS
// app neither window.print() nor blob downloads work in the WebView, so both
// "print" and "download PDF" route through the native share sheet — from there
// the user reaches every printing path Android has (system Print service,
// thermal-printer vendor apps, Bluetooth print services like RawBT) as well as
// WhatsApp/Drive/email. Desktop keeps the hidden-iframe print dialog.
// ---------------------------------------------------------------------------

/** Save/export a finished PDF the way the current platform supports.
 *  `text` (optional) becomes the share message when a share sheet is used. */
export function savePdf(pdf, fileName, text) {
  return outputFile({ blob: pdf.output("blob"), fileName, mimeType: "application/pdf", text });
}

/** Print a finished PDF the way the current platform supports. */
async function printPdf(pdf, fileName) {
  if (isNativeApp() || isMobileBrowser()) {
    // Share sheet (or download fallback) — printing happens in the print-service app.
    return outputFile({ blob: pdf.output("blob"), fileName, mimeType: "application/pdf" });
  }
  // Desktop: hidden iframe → OS print dialog (instead of downloading).
  const url = URL.createObjectURL(pdf.output("blob"));
  const prev = document.getElementById("__receipt_print_frame");
  if (prev) prev.remove();
  const frame = document.createElement("iframe");
  frame.id = "__receipt_print_frame";
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch { window.open(url, "_blank"); } // popup fallback if the iframe can't be printed
  };
  frame.src = url;
  document.body.appendChild(frame);
}

/**
 * Export a sale or purchase as a thermal-printer receipt.
 * Renders a continuous roll sized to the chosen width (58/80/104 mm) with the
 * height trimmed to fit the content, so there's no wasted paper feed.
 */
export function exportThermalReceipt({ company, currency, doc: txn, party, kind = "sale", paymentKey = "received", widthMm = 80 }) {
  const isReturn = txn.doc_type === "return";
  const title = kind === "sale" ? (isReturn ? "Credit Note" : "Tax Invoice") : (isReturn ? "Debit Note" : "Purchase");
  const cur = currency || "INR";
  // jsPDF's built-in Helvetica has no glyph for ₹ (and other non-Latin currency
  // symbols), which would render as a blank box and break right-aligned width
  // measurement. pdfMoney() keeps Latin-1 symbols ($, £) but prints the ISO code
  // ("INR 1,180.00") for the rest, so amounts show their currency and still fit.
  const money = (n) => pdfMoney(n, cur);
  const W = widthMm;
  const M = W <= 58 ? 3 : 4;           // side margin
  const RX = W - M;                    // right edge for right-aligned text
  const innerW = W - 2 * M;
  const fs = W <= 58 ? 7 : W <= 80 ? 8 : 9; // base font size scales with roll width

  // Draw the whole receipt onto `pdf` and return the final Y. We run this twice:
  // once on a scratch doc to measure the height, then on a roll cut to that height.
  const draw = (pdf) => {
    let y = 5;
    const adv = (size) => { y += size * 0.42 + 1.4; };
    const center = (text, size, bold = false) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size);
      pdf.splitTextToSize(String(text), innerW).forEach((ln) => { pdf.text(ln, W / 2, y, { align: "center" }); adv(size); });
    };
    const left = (text, bold = false, size = fs) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size);
      pdf.splitTextToSize(String(text), innerW).forEach((ln) => { pdf.text(ln, M, y); adv(size); });
    };
    const lr = (l, r, bold = false, size = fs) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size);
      pdf.text(String(l), M, y); pdf.text(String(r), RX, y, { align: "right" }); adv(size);
    };
    const rule = () => { pdf.setLineWidth(0.2); pdf.setDrawColor(160); pdf.line(M, y, RX, y); y += 2.5; };
    // Centered logo at the top, scaled to fit the roll. Max height grows with the
    // roll width (2"/3"/4") so the logo stays proportionate and legible; never throws.
    const centerImage = (dataUrl) => {
      if (!dataUrl) return;
      try {
        const props = pdf.getImageProperties(dataUrl);
        const maxH = W <= 58 ? 12 : W <= 80 ? 16 : 20;
        const scale = Math.min(innerW / props.width, maxH / props.height);
        const w = props.width * scale, h = props.height * scale;
        pdf.addImage(dataUrl, (W - w) / 2, y, w, h);
        // The following text is positioned by its baseline, so its capitals rise
        // ~0.75·fontSize above y. Clear the tallest following line (the company
        // name at fs+3) plus a small gap so the logo and name never overlap.
        y += h + (fs + 3) * 0.42 + 1.4;
      } catch { /* unsupported/corrupt image — skip it */ }
    };

    const co = companyInfo(company);
    centerImage(co.logo);
    center(co.name || "LedgerFlow", fs + 3, true);
    co.lines.forEach((ln) => center(ln, fs - 1));
    center(title, fs, true);
    y += 1;
    left(`No: ${txn.doc_no}`);
    left(`Date: ${txn.doc_date}`);
    left(`${kind === "sale" ? "Customer" : "Supplier"}: ${party || "-"}`);
    rule();
    (txn.lines || []).forEach((l) => {
      left(l.item_name || "");
      lr(`  ${l.qty} x ${money(l.unit_price)}`, money(l.line_total));
    });
    rule();
    lr("Subtotal", money(txn.subtotal));
    if (Number(txn.tax_total)) lr("Tax", money(txn.tax_total));
    if (Number(txn.discount)) lr("Discount", `-${money(txn.discount)}`);
    if (Number(txn.extra_charges)) lr("Charges", money(txn.extra_charges));
    if (Number(txn.round_off)) lr("Round off", `${txn.round_off > 0 ? "+" : "-"}${money(Math.abs(txn.round_off))}`);
    lr("Total", money(txn.grand_total), true, fs + 1);
    const paidAmt = Number(txn[paymentKey] || 0);
    if (paidAmt > 0) {
      const acct = (txn.payment_account || "cash").replace(/^./, (c) => c.toUpperCase());
      lr(`${kind === "sale" ? "Received" : "Paid"} (${acct})`, money(paidAmt));
    }
    const due = Number(txn.grand_total || 0) - paidAmt;
    lr(due > 0 ? "Balance due" : "Balance", money(due), true);
    rule();
    center("Thank you!", fs);
    return y + 4;
  };

  // Pass 1 — measure on a scratch roll of the same width so text wrapping matches.
  const height = Math.max(60, draw(new jsPDF({ unit: "mm", format: [W, 800] })));
  // Pass 2 — render onto a roll cut to the measured height. jsPDF normalises the
  // page to the requested orientation, so for a short wide roll (e.g. 4"/104mm with
  // little content) a "portrait" page would swap to height-wide and push the
  // right-aligned totals off the page. Pick the orientation that preserves width=W.
  const pdf = new jsPDF({ unit: "mm", format: [W, height], orientation: height >= W ? "portrait" : "landscape" });
  draw(pdf);
  printPdf(pdf, `${txn.doc_no || "receipt"}-${W}mm.pdf`);
}
