import { useMemo, useState } from "react";
import { Printer, FileText, Settings2 } from "lucide-react";
import { Modal } from "../ui";
import { THERMAL_SIZES } from "../pdf";
import { receiptPreviewLines } from "../escpos";
import { loadPrintSettings } from "../printSettings";

/**
 * Print preview: shows the bill exactly as the thermal receipt will lay it out
 * (live — re-rendered when the size changes), and only prints after the user
 * confirms. The primary button follows the Print Settings printer type.
 */
export default function PrintPreview({ company, currency, doc, party, kind, paymentKey, onClose, onThermal, onA4, onPdf, onSettings }) {
  const ps = loadPrintSettings();
  const [widthMm, setWidthMm] = useState(ps.widthMm);
  const preferThermal = ps.printerType !== "regular";

  const lines = useMemo(() => {
    try {
      return receiptPreviewLines({
        company, currency, doc, party, kind, paymentKey, widthMm,
        format: ps.thermalFormat,
        charsPerLine: ps.charsPerLine === "auto" ? null : ps.charsPerLine,
        feedLines: 0, // don't render trailing feed as blank preview lines
      });
    } catch (e) {
      return [String(e?.message || "Nothing to print")];
    }
  }, [company, currency, doc, party, kind, paymentKey, widthMm, ps.thermalFormat, ps.charsPerLine]);

  return (
    <Modal open onClose={onClose} title={`Print ${doc.doc_no}`}>
      <p className="mb-3 text-sm text-slate-500">Review the bill, pick a size, then print.</p>

      {/* paper-style live preview of the actual receipt layout */}
      <div className="flex justify-center rounded-xl bg-slate-100 p-4">
        <div className="max-h-[45vh] max-w-full overflow-auto rounded-md bg-white px-4 py-3 shadow-md">
          <pre className="font-mono text-[11px] leading-[1.4] text-slate-800">{lines.join("\n")}</pre>
        </div>
      </div>

      <div className="mt-4">
        <p className="label">Receipt size</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {/* Custom width from Print Settings appears as its own option */}
          {[...THERMAL_SIZES, ...(THERMAL_SIZES.some((z) => z.mm === ps.widthMm) ? [] : [{ label: `${ps.widthMm} mm`, mm: ps.widthMm, custom: true }])].map((z) => (
            <button key={z.mm} type="button" onClick={() => setWidthMm(z.mm)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition active:scale-95 ${
                widthMm === z.mm ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}>
              {z.custom ? `Custom · ${z.mm} mm` : z.label.replace('"', " inch")}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button className="btn-ghost btn-sm" onClick={onSettings} title="Open print settings">
          <Settings2 className="h-3.5 w-3.5" /> Settings
        </button>
        <span className="flex-1" />
        <button className="btn-ghost btn-sm" onClick={onPdf} title="Download the A4 invoice PDF">
          <FileText className="h-3.5 w-3.5" /> A4 PDF
        </button>
        <button className={preferThermal ? "btn-ghost btn-sm" : "btn-primary btn-sm"} onClick={onA4} title="Print the A4 invoice">
          <Printer className="h-3.5 w-3.5" /> Print A4
        </button>
        <button className={preferThermal ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => onThermal(widthMm)} title="Print the thermal receipt">
          <Printer className="h-3.5 w-3.5" /> Print receipt
        </button>
      </div>
    </Modal>
  );
}
