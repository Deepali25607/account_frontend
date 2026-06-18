import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND = [37, 71, 233]; // brand-600

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
  const money = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR" }).format(Number(n || 0));
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
