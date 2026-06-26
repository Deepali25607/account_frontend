import { useMemo } from "react";
import { FileText, Download, AlertTriangle } from "lucide-react";
import { fmtMoney } from "../ui";
import { exportInvoicePdf } from "../pdf";
import { readInvoiceFromHash } from "../share";

/**
 * Public, no-login read-only invoice. The invoice is carried entirely in the URL
 * hash (see share.js) so this page makes no API calls and works for a customer
 * who received the link over WhatsApp. It mirrors the A4 PDF layout and lets the
 * customer download that PDF.
 */
export default function PublicInvoice() {
  const data = useMemo(() => readInvoiceFromHash(), []);

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
        <div>
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
          <p className="mt-3 font-semibold text-slate-700">Invoice link is invalid or incomplete</p>
          <p className="mt-1 text-sm text-slate-400">Please ask the sender for a fresh link.</p>
        </div>
      </div>
    );
  }

  const { company, currency, customer, doc } = data;
  const cur = currency || "INR";
  const isReturn = doc.doc_type === "return";
  const received = Number(doc.received || 0);
  const due = Number(doc.grand_total || 0) - received;
  const acct = (doc.payment_account || "cash").replace(/^./, (c) => c.toUpperCase());
  const download = () => exportInvoicePdf({ company, currency: cur, doc, customer });

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
            <div>
              <p className="text-lg font-bold text-brand-700">LedgerFlow</p>
              {company && <p className="text-sm text-slate-500">{company}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800">{isReturn ? "Credit Note" : "Tax Invoice"}</p>
              <p className="text-sm text-slate-500">{doc.doc_no}</p>
              <p className="text-xs text-slate-400">{doc.doc_date}</p>
            </div>
          </div>

          <div className="px-6 py-5">
            {customer && <p className="mb-4 text-sm text-slate-600">Bill to: <span className="font-medium text-slate-800">{customer}</span></p>}

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Tax%</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(doc.lines || []).map((l, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{l.item_name}</td>
                      <td className="px-3 py-2 text-right">{l.qty}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(l.unit_price, cur)}</td>
                      <td className="px-3 py-2 text-right">{l.tax_rate}%</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtMoney(l.line_total, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{fmtMoney(doc.subtotal, cur)}</span></div>
              <div className="flex justify-between text-slate-600"><span>Tax</span><span>{fmtMoney(doc.tax_total, cur)}</span></div>
              {Number(doc.discount) > 0 && (
                <div className="flex justify-between text-slate-600"><span>{doc.discount_type === "percent" ? `Discount (${doc.discount_value}%)` : "Discount"}</span><span>−{fmtMoney(doc.discount, cur)}</span></div>
              )}
              {Number(doc.extra_charges) > 0 && (
                <div className="flex justify-between text-slate-600"><span>{doc.extra_charges_note ? `Additional charges (${doc.extra_charges_note})` : "Additional charges"}</span><span>{fmtMoney(doc.extra_charges, cur)}</span></div>
              )}
              {Number(doc.round_off) !== 0 && (
                <div className="flex justify-between text-slate-600"><span>Round off</span><span>{doc.round_off > 0 ? "+" : "−"}{fmtMoney(Math.abs(doc.round_off), cur)}</span></div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-slate-900"><span>Total</span><span>{fmtMoney(doc.grand_total, cur)}</span></div>
              {received > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>{isReturn ? `Refunded (${acct})` : `Received (${acct})`}</span><span>{fmtMoney(received, cur)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-slate-800"><span>{due > 0 ? "Balance due" : "Balance"}</span><span>{fmtMoney(due, cur)}</span></div>
            </div>

            <button onClick={download} className="btn-primary mt-6 w-full justify-center">
              <Download className="h-4 w-4" /> Download PDF
            </button>
          </div>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <FileText className="h-3.5 w-3.5" /> Generated with LedgerFlow
        </p>
      </div>
    </div>
  );
}
