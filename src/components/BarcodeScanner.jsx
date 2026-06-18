import { useEffect, useRef, useState } from "react";
import { X, CameraOff, Loader2 } from "lucide-react";

/**
 * Full-screen camera barcode scanner. Works in the browser and inside the
 * Capacitor Android WebView (needs CAMERA permission in the manifest). ZXing is
 * dynamically imported so it stays out of the main bundle until scanning is used.
 * Supports EAN-13/8, UPC-A/E, Code128/39, ITF, QR, etc.
 *
 * Props: open, onClose(), onDetect(code)
 */
export default function BarcodeScanner({ open, onClose, onDetect }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | scanning | error
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("starting"); setError("");

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } }, // prefer rear camera
          videoRef.current,
          (result, _err, ctrl) => {
            if (cancelled || !result) return;
            try { navigator.vibrate?.(80); } catch { /* no haptics */ }
            ctrl.stop();
            onDetect(result.getText());
          }
        );
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
        setStatus("scanning");
      } catch (e) {
        if (cancelled) return;
        const name = e?.name || "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera permission was denied. Allow camera access in your browser/app settings and try again."
            : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No camera was found on this device. Use a barcode reader or type the code instead."
            : "Couldn't start the camera. You can still use a barcode reader or type the code."
        );
        setStatus("error");
      }
    })();

    return () => { cancelled = true; try { controlsRef.current?.stop(); } catch { /* already stopped */ } };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-semibold">Scan barcode</span>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close scanner"><X className="h-6 w-6" /></button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {status === "error" ? (
          <div className="mx-6 flex flex-col items-center gap-3 text-center text-slate-200">
            <CameraOff className="h-10 w-10 text-slate-400" />
            <p className="max-w-sm text-sm">{error}</p>
            <button onClick={onClose} className="btn-primary">Close</button>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-72 max-w-[80vw] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
            </div>
            {status === "starting" && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
            )}
            <p className="absolute inset-x-0 bottom-6 text-center text-sm text-white/80">
              Point the camera at a barcode to scan
            </p>
          </>
        )}
      </div>
    </div>
  );
}
