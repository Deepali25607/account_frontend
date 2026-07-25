import { useState } from "react";
import { Barcode, Eye, ScanLine } from "lucide-react";
import api from "../api";
import { Modal, Field, useToast, apiError, Spinner } from "../ui";
import BarcodeScanner from "./BarcodeScanner";
import BarcodeView from "./BarcodeView";
import { MATERIAL_TYPES, SKU_PREFIX, genBarcode } from "../itemMaster";

/*
 * The single item create/edit form, shared by the Inventory page and the
 * quick-add inside a purchase bill so both always present identical fields.
 * Saving goes through POST/PUT /items; the saved item is passed to onSaved so
 * bill callers can slot it straight into a line.
 */

export default function ItemFormModal({ item, onClose, onSaved, canGst }) {
  const toast = useToast();
  const [f, setF] = useState(item);
  const [busy, setBusy] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [scanCam, setScanCam] = useState(false); // camera open to capture a barcode for this item
  const isNew = !item.id;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await (isNew ? api.post("/items", f) : api.put(`/items/${item.id}`, f));
      toast.success(isNew ? "Item created" : "Item updated");
      onSaved(data);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title={isNew ? "New item" : "Edit item"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field></div>
        <Field label="Unit of measure"><input className="input" value={f.uom} onChange={set("uom")} /></Field>
        <Field label="Alternate unit (optional)"><input className="input" value={f.alt_uom || ""} onChange={set("alt_uom")} placeholder="e.g. box" /></Field>
        {(f.alt_uom || "").trim() && (
          <Field label={`1 ${f.alt_uom.trim()} = ? ${f.uom || "unit"}`}>
            <input type="number" min="0" className="input" value={f.alt_uom_factor ?? ""} onChange={set("alt_uom_factor")} placeholder="e.g. 12" />
          </Field>
        )}
        <Field label="SKU (optional)">
          <input className="input" value={f.sku} onChange={set("sku")} disabled={!isNew} placeholder={isNew ? `Auto e.g. ${SKU_PREFIX[f.material_type] || "IT"}-00001` : ""} />
          {isNew && !f.sku && <p className="mt-1 text-xs text-slate-400">Leave blank to auto-generate as <b>{SKU_PREFIX[f.material_type] || "IT"}-…</b></p>}
        </Field>
        <div className="col-span-2"><Field label="Barcode (generate or type — optional)">
          <div className="flex gap-2">
            <input className="input" value={f.barcode || ""} onChange={set("barcode")} placeholder="e.g. 8901234567890" autoComplete="off" />
            {f.barcode ? (
              <button type="button" onClick={() => setShowBarcode(true)} className="btn-ghost shrink-0" title="View, download or print the barcode">
                <Eye className="h-4 w-4" /> View Barcode
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setF((x) => ({ ...x, barcode: genBarcode() }))} className="btn-ghost shrink-0" title="Generate a barcode">
                  <Barcode className="h-4 w-4" /> Generate
                </button>
                <button type="button" onClick={() => setScanCam(true)} className="btn-ghost shrink-0" title="Scan a barcode with the camera">
                  <ScanLine className="h-4 w-4" /> Add Barcode
                </button>
              </>
            )}
          </div>
        </Field></div>
        <Field label="Material type">
          <select className="input" value={f.material_type || "finished"} onChange={set("material_type")}>
            {MATERIAL_TYPES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Category"><input className="input" value={f.category || ""} onChange={set("category")} /></Field>
        {canGst && <Field label="HSN / SAC code"><input className="input" value={f.hsn || ""} onChange={set("hsn")} placeholder="e.g. 9401" autoComplete="off" /></Field>}
        {canGst && <Field label="GST %"><input type="number" className="input" value={f.tax_rate} onChange={set("tax_rate")} /></Field>}
        <Field label="Cost price"><input type="number" className="input" value={f.cost_price} onChange={set("cost_price")} /></Field>
        <Field label="Sale price"><input type="number" className="input" value={f.sale_price} onChange={set("sale_price")} /></Field>
        {isNew && <Field label="Opening stock"><input type="number" className="input" value={f.stock_qty} onChange={set("stock_qty")} /></Field>}
        <Field label="Reorder level"><input type="number" className="input" value={f.reorder_lvl} onChange={set("reorder_lvl")} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !String(f.name || "").trim()} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Save</button>
      </div>
      <BarcodeScanner open={scanCam} onClose={() => setScanCam(false)} onDetect={(code) => { setScanCam(false); setF((x) => ({ ...x, barcode: code })); toast.success("Barcode captured"); }} />
      <BarcodeView open={showBarcode} value={f.barcode} name={f.name} onClose={() => setShowBarcode(false)} />
    </Modal>
  );
}
