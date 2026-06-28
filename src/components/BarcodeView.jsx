import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Download, Printer } from "lucide-react";
import { Modal } from "../ui";

/**
 * Renders a barcode for the given value with Download (PNG) and Print actions.
 * Picks the most fitting symbology (EAN-13/8, UPC) and falls back to CODE128,
 * which encodes any ASCII string, so typed or generated codes always render.
 *
 * Props: open, value, name, onClose()
 */
function formatFor(value) {
  if (/^\d{13}$/.test(value)) return "EAN13";
  if (/^\d{12}$/.test(value)) return "UPC";
  if (/^\d{8}$/.test(value)) return "EAN8";
  return "CODE128";
}

export default function BarcodeView({ open, value, name, onClose }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!open || !svgRef.current || !value) return;
    const draw = (fmt) =>
      JsBarcode(svgRef.current, value, { format: fmt, displayValue: true, fontSize: 16, height: 70, margin: 10, textMargin: 4 });
    try { draw(formatFor(value)); } // EAN/UPC validates the check digit and throws if invalid…
    catch { try { draw("CODE128"); } catch { /* unrenderable value */ } } // …so fall back to CODE128.
  }, [open, value]);

  const fileBase = `barcode-${String(name || value || "item").replace(/[^\w-]+/g, "_")}`;
  const svgXml = () => (svgRef.current ? new XMLSerializer().serializeToString(svgRef.current) : "");

  const download = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const img = new Image();
    img.onload = () => {
      const scale = 3; // upscale so the printed/scanned PNG stays crisp
      const canvas = document.createElement("canvas");
      canvas.width = svg.width.baseVal.value * scale;
      canvas.height = svg.height.baseVal.value * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${fileBase}.png`;
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgXml())));
  };

  const print = () => {
    const xml = svgXml();
    if (!xml) return;
    const w = window.open("", "_blank", "width=480,height=360");
    if (!w) return;
    const heading = name ? `<div style="margin-bottom:8px;font-weight:600;font-family:sans-serif">${name}</div>` : "";
    w.document.write(`<!doctype html><title>${fileBase}</title><body style="margin:0;display:grid;place-items:center;height:100vh">${heading}${xml}</body>`);
    w.document.close();
    w.focus();
    // Give the new window a tick to lay out the SVG before printing.
    w.onload = () => w.print();
    setTimeout(() => { try { w.print(); } catch { /* user closed it */ } }, 300);
  };

  return (
    <Modal open={open} title="Barcode" onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <svg ref={svgRef} />
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={download}><Download className="h-4 w-4" /> Download</button>
          <button type="button" className="btn-primary" onClick={print}><Printer className="h-4 w-4" /> Print</button>
        </div>
      </div>
    </Modal>
  );
}
