import { useState } from "react";
import { Modal, useToast } from "../ui";
import { exportThermalReceipt } from "../pdf";
import { canPrintDirect, savedPrinter, savePrinter, forgetPrinter, listPrinters, printDirect, isPluginMissing } from "../printer";

/**
 * Thermal printing with one-tap direct Bluetooth output.
 *
 * In the Android app the receipt goes straight to the remembered Bluetooth
 * printer as ESC/POS bytes — no share sheet, no printer app. The first print
 * shows a one-time picker of paired devices. Everywhere else (and on APKs that
 * predate the native plugin) it falls back to the PDF share/print flow.
 *
 * Usage: const { printThermal, printerPicker, changePrinter } = useThermalPrint();
 * Call printThermal(args) with the same args as exportThermalReceipt(), and
 * render {printerPicker} anywhere in the tree.
 */
export default function useThermalPrint() {
  const toast = useToast();
  const [pick, setPick] = useState(null); // { devices, resume } | null

  const go = async (printer, args) => {
    try {
      await printDirect(printer, args);
      toast.success(`Receipt sent to ${printer.name}`);
    } catch (e) {
      if (isPluginMissing(e)) {
        toast.error("Direct printing needs the latest app version — opening share instead");
        exportThermalReceipt(args);
      } else {
        toast.error(`${printer.name}: ${e?.message || e}`);
      }
    }
  };

  const printThermal = async (args) => {
    if (!canPrintDirect()) return exportThermalReceipt(args);
    const saved = savedPrinter();
    if (saved) return go(saved, args);
    try {
      const devices = await listPrinters();
      if (!devices.length) {
        toast.error("No paired Bluetooth device found — pair your printer in Android Bluetooth settings first");
        return;
      }
      setPick({ devices, resume: (d) => go(d, args) });
    } catch (e) {
      if (isPluginMissing(e)) { exportThermalReceipt(args); return; } // old APK — share sheet still works
      toast.error(String(e?.message || e));
    }
  };

  // Forget the remembered printer; the next print asks again.
  const changePrinter = () => { forgetPrinter(); toast.success("Printer cleared — the next print will ask which one to use"); };

  const printerPicker = pick ? (
    <Modal open onClose={() => setPick(null)} title="Choose Bluetooth printer">
      <p className="mb-3 text-sm text-slate-500">
        Pick your thermal printer once — after this, Print sends receipts straight to it.
        Only devices already paired in Android Bluetooth settings appear here.
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        {pick.devices.map((d) => (
          <button key={d.address} type="button"
            className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-slate-50"
            onClick={() => { const { resume } = pick; savePrinter(d); setPick(null); resume(d); }}>
            <span className="font-medium text-slate-800">{d.name}</span>
            <span className="text-xs text-slate-400">{d.address}</span>
          </button>
        ))}
      </div>
    </Modal>
  ) : null;

  return { printThermal, printerPicker, changePrinter };
}
