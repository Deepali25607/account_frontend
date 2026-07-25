// Item-master constants & helpers shared by the Inventory page, the shared
// ItemFormModal, and the in-bill quick-add.

// Kept in sync with MATERIAL_TYPES in account-backend/src/routes/masters.js
export const MATERIAL_TYPES = [
  { id: "raw", label: "Raw Material" },
  { id: "semi_finished", label: "Semi-Finished" },
  { id: "finished", label: "Finished Good" },
  { id: "trading", label: "Trading Good" },
  { id: "consumable", label: "Consumable" },
  { id: "service", label: "Service" },
];

// Mirrors SKU_PREFIX in account-backend/src/routes/masters.js (display hint only).
export const SKU_PREFIX = { raw: "RM", semi_finished: "SF", finished: "FG", trading: "TG", consumable: "CM", service: "SV" };

export const BLANK_ITEM = { sku: "", name: "", barcode: "", hsn: "", category: "", material_type: "finished", uom: "unit", alt_uom: "", alt_uom_factor: "", cost_price: 0, sale_price: 0, tax_rate: 0, stock_qty: 0, reorder_lvl: 0 };

// Generate a valid EAN-13 barcode for in-house items. Prefix "2" is reserved by
// GS1 for in-store/private numbering, so generated codes never collide with real
// manufacturer barcodes. Payload = "2" + time + randomness; the 13th is the EAN-13 check digit.
export function genBarcode() {
  const base = ("2" + String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 100)).padStart(2, "0")).slice(0, 12).padEnd(12, "0");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  return base + ((10 - (sum % 10)) % 10);
}
