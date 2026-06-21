import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND = [37, 71, 233]; // brand-600

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

/** Shared header for every exported document. */
function header(doc, title, company, subtitle) {
  doc.setFontSize(16); doc.setTextColor(30, 45, 137); doc.setFont(undefined, "bold");
  doc.text("LedgerFlow", 14, 16);
  doc.setFontSize(11); doc.setTextColor(60); doc.setFont(undefined, "normal");
  doc.text(company || "", 14, 22);
  doc.setFontSize(13); doc.setTextColor(20); doc.setFont(undefined, "bold");
  doc.text(title, 14, 32);
  if (subtitle) { doc.setFontSize(9); doc.setTextColor(120); doc.setFont(undefined, "normal"); doc.text(subtitle, 14, 37); }
}

/** Export an array of objects as a titled PDF table. */
export function exportTablePdf({ title, company, subtitle, columns, rows, fileName }) {
  const doc = new jsPDF();
  header(doc, title, company, subtitle);
  autoTable(doc, {
    startY: subtitle ? 42 : 38,
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
  doc.save(fileName || `${title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

/** Export a single sale as a tax invoice PDF. */
export function exportInvoicePdf({ company, currency, doc: sale, customer }) {
  const pdf = new jsPDF();
  header(pdf, sale.doc_type === "return" ? "Credit Note" : "Tax Invoice", company, `${sale.doc_no} · ${sale.doc_date}`);
  pdf.setFontSize(10); pdf.setTextColor(40);
  pdf.text(`Bill to: ${customer || ""}`, 14, 46);
  const money = (n) => pdfMoney(n, currency);
  autoTable(pdf, {
    startY: 52,
    head: [["Item", "HSN/SAC", "Qty", "Rate", "Tax %", "Amount"]],
    body: (sale.lines || []).map((l) => [l.item_name, l.hsn || "—", l.qty, money(l.unit_price), `${l.tax_rate}%`, money(l.line_total)]),
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND, textColor: 255 }, margin: { left: 14, right: 14 },
  });
  let y = pdf.lastAutoTable.finalY + 8;
  const RX = 196; // right edge for the totals column (page width 210 − 14 margin)
  const row = (label, value, bold) => {
    pdf.setFont(undefined, bold ? "bold" : "normal");
    pdf.text(label, 140, y);
    pdf.text(value, RX, y, { align: "right" });
    y += 6;
  };
  pdf.setFontSize(10); pdf.setTextColor(40);
  row("Subtotal", money(sale.subtotal));
  row("Tax", money(sale.tax_total));
  if (Number(sale.discount)) row(sale.discount_type === "percent" ? `Discount (${sale.discount_value}%)` : "Discount", `- ${money(sale.discount)}`);
  if (Number(sale.extra_charges)) row(sale.extra_charges_note ? `Charges (${sale.extra_charges_note})` : "Additional charges", money(sale.extra_charges));
  row("Total amount", money(sale.grand_total), true);

  const received = Number(sale.received || 0);
  if (received > 0) {
    const acct = (sale.payment_account || "cash").replace(/^./, (c) => c.toUpperCase());
    row(sale.doc_type === "return" ? `Amount refunded (${acct})` : `Amount received (${acct})`, money(received));
  }
  const due = Number(sale.grand_total || 0) - received;
  row(due > 0 ? "Balance due" : "Balance", money(due), true);

  pdf.save(`${sale.doc_no}.pdf`);
}

/** Standard thermal roll widths, labelled by their nominal inch size. */
export const THERMAL_SIZES = [
  { label: '2"', mm: 58 },
  { label: '3"', mm: 80 },
  { label: '4"', mm: 104 },
];

/** Open the OS/browser print dialog for a generated jsPDF doc (instead of downloading). */
function printPdf(pdf) {
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

    center(company || "LedgerFlow", fs + 3, true);
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
  printPdf(pdf);
}
