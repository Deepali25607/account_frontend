import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, FileText, ScanLine, Camera, Barcode, Eye, Printer, CheckCircle2, Pencil, MessageCircle, UserPlus } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, Modal, Field, LineCol, useToast, apiError, Empty, Spinner, Pager, DetailModal } from "../ui";
import { exportInvoicePdf, exportThermalReceipt, THERMAL_SIZES } from "../pdf";
import { buildInvoiceLink, invoiceMessage, normalizePhone, waUrl, isPublicShareBase } from "../share";
import PageHead from "./PageHead";
import BarcodeScanner from "./BarcodeScanner";
import BarcodeView from "./BarcodeView";
import ItemPicker from "./ItemPicker";

const PAGE_SIZE = 20;
const todayStr = () => new Date().toISOString().slice(0, 10); // matches the backend's default doc_date

// Item material types — kept in sync with MATERIAL_TYPES in account-backend/src/routes/masters.js
// (also mirrored in Inventory.jsx). Used by the inline "new item" quick-add.
const MATERIAL_TYPES = [
  { id: "raw", label: "Raw Material" },
  { id: "semi_finished", label: "Semi-Finished" },
  { id: "finished", label: "Finished Good" },
  { id: "trading", label: "Trading Good" },
  { id: "consumable", label: "Consumable" },
  { id: "service", label: "Service" },
];
// Mirrors SKU_PREFIX in account-backend/src/routes/masters.js (display hint only).
const SKU_PREFIX = { raw: "RM", semi_finished: "SF", finished: "FG", trading: "TG", consumable: "CM", service: "SV" };
// A blank item for the inline quick-add — mirrors `blank` in Inventory.jsx so the
// in-bill form can capture every field the full item master supports.
const BLANK_ITEM = { sku: "", name: "", barcode: "", hsn: "", category: "", material_type: "finished", uom: "unit", cost_price: 0, sale_price: 0, tax_rate: 0, stock_qty: 0, reorder_lvl: 0 };

// Generate a valid EAN-13 barcode for in-house items (mirrors genBarcode in
// Inventory.jsx). Prefix "2" is reserved by GS1 for in-store/private numbering,
// so generated codes never collide with real manufacturer barcodes.
function genBarcode() {
  const base = ("2" + String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 100)).padStart(2, "0")).slice(0, 12).padEnd(12, "0");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  return base + ((10 - (sum % 10)) % 10);
}

/** One figure in the document money summary. `strong` = bold total, `accent` = brand colour. */
function Sum({ label, value, strong, accent }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`text-sm ${strong ? "font-bold text-slate-900" : accent ? "font-bold text-brand-700" : "font-medium text-slate-800"}`}>{value}</dd>
    </div>
  );
}

/**
 * Compact "Print" control for a table row: opens a small 2"/3"/4" size menu.
 * The menu is positioned with fixed viewport coordinates so it isn't clipped by
 * the table's overflow containers.
 */
function ReceiptMenu({ onPick }) {
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null); // {top, right} when open, else null
  const toggle = () => {
    if (pos) return setPos(null);
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };
  return (
    <span className="ml-1 inline-block align-middle">
      <button ref={btnRef} className="btn-ghost btn-sm" onClick={toggle} title="Print thermal receipt">
        <Printer className="h-3.5 w-3.5" /> Print
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
          <div className="fixed z-50 w-36 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg" style={{ top: pos.top, right: pos.right }}>
            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Receipt size</div>
            {THERMAL_SIZES.map((s) => (
              <button key={s.mm} className="block w-full px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => { setPos(null); onPick(s.mm); }}>
                {s.label} <span className="text-slate-400">({s.mm} mm)</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/**
 * Post-sale "Share via WhatsApp" control. Pre-fills the customer's mobile (editable),
 * then opens a WhatsApp chat with that number carrying an invoice summary and a
 * self-contained link to a public read-only invoice (with a Download PDF button).
 */
function ShareWhatsApp({ company, currency, doc, customer, phone }) {
  const [cc, setCc] = useState("91");
  const [num, setNum] = useState(() => String(phone || "").replace(/\D/g, "").replace(/^0+/, ""));
  const valid = normalizePhone(num, cc).length >= 10;
  const send = () => {
    if (!valid) return;
    const link = buildInvoiceLink({ company, currency, doc, customer });
    const text = invoiceMessage({ company, customer, docNo: doc.doc_no, total: fmtMoney(doc.grand_total, currency), link });
    window.open(waUrl(normalizePhone(num, cc), text), "_blank");
  };
  return (
    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
      <p className="label flex items-center gap-1.5"><MessageCircle className="h-4 w-4 text-emerald-600" /> Share via WhatsApp</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Code</span>
          <input className="input !w-16" value={cc} onChange={(e) => setCc(e.target.value)} inputMode="numeric" />
        </label>
        <label className="block min-w-[150px] flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Customer mobile</span>
          <input className="input" value={num} onChange={(e) => setNum(e.target.value)} placeholder="Mobile number" inputMode="tel"
            onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        </label>
        <button className="btn-primary" disabled={!valid} onClick={send}><MessageCircle className="h-4 w-4" /> Send</button>
      </div>
      {isPublicShareBase()
        ? <p className="mt-2 text-[11px] text-slate-400">Opens WhatsApp with the invoice summary and a link to view / download the PDF.</p>
        : <p className="mt-2 text-[11px] text-amber-600">⚠ The link points at <b>localhost</b>, so it won't open on the customer's phone. Set <code>VITE_PUBLIC_WEB_URL</code> to your deployed app URL.</p>}
    </div>
  );
}

/**
 * Compact "WhatsApp" control for a table row: a small popover to confirm/enter the
 * number, then share. The list row has no line items, so `fetchFull` loads the full
 * document before building the shareable link. Positioned with fixed viewport
 * coordinates so it isn't clipped by the table's overflow containers.
 */
function WhatsAppRowButton({ company, currency, partyName, phone, fetchFull, toast }) {
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null); // {top, right} when open, else null
  const [cc, setCc] = useState("91");
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = normalizePhone(num, cc).length >= 10;
  const toggle = () => {
    if (pos) return setPos(null);
    setNum(String(phone || "").replace(/\D/g, "").replace(/^0+/, ""));
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };
  const send = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const doc = await fetchFull();
      const link = buildInvoiceLink({ company, currency, doc, customer: partyName });
      const text = invoiceMessage({ company, customer: partyName, docNo: doc.doc_no, total: fmtMoney(doc.grand_total, currency), link });
      window.open(waUrl(normalizePhone(num, cc), text), "_blank");
      setPos(null);
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };
  return (
    <span className="ml-1 inline-block align-middle">
      <button ref={btnRef} className="btn-ghost btn-sm" onClick={toggle} title="Share via WhatsApp">
        <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
          <div className="fixed z-50 w-60 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg" style={{ top: pos.top, right: pos.right }}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Send invoice to</div>
            <div className="flex items-center gap-2">
              <input className="input !w-14" value={cc} onChange={(e) => setCc(e.target.value)} inputMode="numeric" title="Country code" />
              <input className="input" value={num} onChange={(e) => setNum(e.target.value)} placeholder="Mobile number" inputMode="tel" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
            </div>
            <button className="btn-primary mt-2 w-full justify-center" disabled={!valid || busy} onClick={send}>
              {busy ? <Spinner className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />} Send
            </button>
            {!isPublicShareBase() && (
              <p className="mt-2 text-[11px] text-amber-600">⚠ Link points at <b>localhost</b> — set <code>VITE_PUBLIC_WEB_URL</code> to your deployed URL so it opens on the customer's phone.</p>
            )}
          </div>
        </>
      )}
    </span>
  );
}

/**
 * Generic purchase/sale document module. cfg supplies the differences:
 *  kind: "purchase" | "sale"
 *  endpoint, partyResource, partyKey, partyLabel, paymentKey, paymentLabel, returnLabel
 */
export default function TxnModule({ cfg }) {
  const { me, can } = useAuth();
  const cur = me.tenant.currency;
  const isAdmin = me.user.role === "owner"; // only the admin/owner may edit posted bills
  const toast = useToast();
  const [docs, setDocs] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  // customer_id → phone, used to pre-fill the WhatsApp share number (sales only).
  const [partyPhones, setPartyPhones] = useState({});
  useEffect(() => {
    if (cfg.kind !== "sale") return;
    api.get(`/${cfg.partyResource}`).then((r) => {
      const m = {};
      r.data.forEach((p) => { if (p.phone) m[p.id] = p.phone; });
      setPartyPhones(m);
    }).catch(() => {});
  }, [cfg.kind, cfg.partyResource]);

  const openDoc = async (d) => {
    try { const { data } = await api.get(`/${cfg.endpoint}/${d.id}`); setViewing({ ...data, _party: d[cfg.partyNameKey] }); }
    catch (e) { toast.error(apiError(e)); }
  };

  const openEdit = async (d) => {
    try { const { data } = await api.get(`/${cfg.endpoint}/${d.id}`); setEditing(data); }
    catch (e) { toast.error(apiError(e)); }
  };

  const load = () => {
    setDocs(null);
    api.get(`/${cfg.endpoint}`, { params: { page, pageSize: PAGE_SIZE } }).then((r) => { setDocs(r.data.rows); setTotal(r.data.total); });
  };
  useEffect(load, [cfg.endpoint, page]);

  const act = async (id, action) => {
    try { await api.post(`/${cfg.endpoint}/${id}/${action}`); toast.success(action === "confirm" ? "Purchase approved — stock updated" : "Draft cancelled"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const STATUS = { confirmed: "bg-emerald-100 text-emerald-700", draft: "bg-amber-100 text-amber-700", cancelled: "bg-slate-200 text-slate-500" };

  // A4 PDF (Tax Invoice / Purchase Invoice) for a list row — fetch the full doc
  // (list rows omit line items) first. Works for both sales and purchases.
  const downloadInvoice = async (d) => {
    try {
      const { data } = await api.get(`/${cfg.endpoint}/${d.id}`);
      exportInvoicePdf({ company: me.tenant, currency: cur, doc: data, party: d[cfg.partyNameKey], kind: cfg.kind, paymentKey: cfg.paymentKey });
    } catch (e) { toast.error(apiError(e)); }
  };

  // Thermal receipt for the currently-viewed sale/purchase, sized for 2"/3"/4" rolls.
  const printReceipt = (widthMm) => exportThermalReceipt({
    company: me.tenant, currency: cur, doc: viewing, party: viewing._party,
    kind: cfg.kind, paymentKey: cfg.paymentKey, widthMm,
  });

  // Same, straight from a table row — fetch the full document (list rows omit line items) first.
  const printRowReceipt = async (d, widthMm) => {
    try {
      const { data } = await api.get(`/${cfg.endpoint}/${d.id}`);
      exportThermalReceipt({
        company: me.tenant, currency: cur, doc: data, party: d[cfg.partyNameKey],
        kind: cfg.kind, paymentKey: cfg.paymentKey, widthMm,
      });
    } catch (e) { toast.error(apiError(e)); }
  };

  // Show a per-line discount column in the detail view only when the doc has one.
  const viewingHasDisc = !!viewing && (viewing.lines || []).some((l) => Number(l.discount) > 0);

  return (
    <>
      <PageHead
        title={cfg.title}
        subtitle={cfg.subtitle}
        action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> {cfg.newLabel}</button>}
      />

      <div className="card overflow-hidden">
        {docs === null ? (
          <div className="grid h-40 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
        ) : docs.length === 0 ? (
          <Empty icon={FileText} title={`No ${cfg.endpoint} yet`} hint={`Create your first ${cfg.kind}.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead><tr className="bg-slate-50">
                <th className="th">Doc #</th><th className="th">Date</th><th className="th">{cfg.partyLabel}</th>
                <th className="th">Type</th><th className="th">Status</th>{can("gst") && <th className="th">Tax</th>}<th className="th text-right">Total</th>
                <th className="th"></th>
              </tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} onClick={() => openDoc(d)} className="cursor-pointer hover:bg-slate-50/60">
                    <td className="td font-semibold text-slate-800">{d.doc_no}</td>
                    <td className="td">{d.doc_date}</td>
                    <td className="td">{d[cfg.partyNameKey]}</td>
                    <td className="td">
                      <span className={`badge ${d.doc_type === "return" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                        {d.doc_type === "return" ? cfg.returnLabel : cfg.kind}
                      </span>
                    </td>
                    <td className="td"><span className={`badge capitalize ${STATUS[d.status] || "bg-slate-100 text-slate-600"}`}>{d.status}</span></td>
                    {can("gst") && <td className="td">{fmtMoney(d.tax_total, cur)}</td>}
                    <td className="td text-right font-bold">{fmtMoney(d.grand_total, cur)}</td>
                    <td className="td text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {cfg.kind === "purchase" && d.status === "draft" && (
                        <>
                          <button className="btn-primary btn-sm" onClick={() => act(d.id, "confirm")}>Approve</button>
                          <button className="btn-ghost btn-sm ml-1" onClick={() => act(d.id, "cancel")}>Cancel</button>
                        </>
                      )}
                      {cfg.kind === "purchase" && d.status === "confirmed" && (
                        <button className="btn-ghost btn-sm" onClick={() => downloadInvoice(d)}><FileText className="h-3.5 w-3.5" /> PDF</button>
                      )}
                      {cfg.kind === "sale" && d.status === "confirmed" && (
                        <>
                          <button className="btn-ghost btn-sm" onClick={() => downloadInvoice(d)}><FileText className="h-3.5 w-3.5" /> PDF</button>
                          <WhatsAppRowButton
                            company={me.tenant.name} currency={cur} partyName={d[cfg.partyNameKey]} phone={partyPhones[d.customer_id]}
                            fetchFull={async () => (await api.get(`/${cfg.endpoint}/${d.id}`)).data} toast={toast}
                          />
                        </>
                      )}
                      {isAdmin && d.status !== "cancelled" && (
                        <button className="btn-ghost btn-sm ml-1" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      )}
                      <ReceiptMenu onPick={(mm) => printRowReceipt(d, mm)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {docs && docs.length > 0 && <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
      </div>

      {viewing && (
        <DetailModal
          open onClose={() => setViewing(null)}
          title={`${viewing.doc_no}`}
          subtitle={`${cfg.partyLabel}: ${viewing._party || "—"}`}
          fields={[
            { label: "Date", value: viewing.doc_date },
            { label: "Type", value: viewing.doc_type === "return" ? cfg.returnLabel : cfg.kind },
            { label: "Status", value: viewing.status },
            viewing.notes && { label: "Notes", value: viewing.notes },
          ]}
        >
          {/* Money summary — Total and Amount received/paid sit side by side */}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
            <Sum label="Subtotal" value={fmtMoney(viewing.subtotal, cur)} />
            {can("gst") && <Sum label={Number(viewing.tax_inclusive) ? "Tax (incl.)" : "Tax"} value={fmtMoney(viewing.tax_total, cur)} />}
            {viewing.discount > 0 && <Sum label={viewing.discount_type === "percent" ? `Discount (${viewing.discount_value}%)` : "Discount"} value={`−${fmtMoney(viewing.discount, cur)}`} />}
            {viewing.extra_charges > 0 && <Sum label={viewing.extra_charges_note ? `Additional charges (${viewing.extra_charges_note})` : "Additional charges"} value={`+${fmtMoney(viewing.extra_charges, cur)}`} />}
            {Number(viewing.round_off) !== 0 && <Sum label="Round off" value={`${viewing.round_off > 0 ? "+" : "−"}${fmtMoney(Math.abs(viewing.round_off), cur)}`} />}
            <Sum label="Total amount" value={fmtMoney(viewing.grand_total, cur)} strong />
            <Sum label={cfg.kind === "sale" ? "Amount received" : "Amount paid"} value={fmtMoney(viewing[cfg.paymentKey], cur)} accent />
            {viewing[cfg.paymentKey] > 0 && (
              <Sum label={cfg.kind === "sale" ? "Received in" : "Paid from"} value={(viewing.payment_account || "cash").replace(/^./, (c) => c.toUpperCase())} />
            )}
            <Sum label="Outstanding" value={fmtMoney(viewing.grand_total - viewing[cfg.paymentKey], cur)} />
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full">
              <thead><tr className="bg-slate-50"><th className="th">Item</th>{can("gst") && <th className="th">HSN/SAC</th>}<th className="th text-right">Qty</th><th className="th text-right">Price</th>{viewingHasDisc && <th className="th text-right">Disc</th>}{can("gst") && <th className="th text-right">Tax%</th>}<th className="th text-right">Line total</th></tr></thead>
              <tbody>
                {(viewing.lines || []).map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="td">{l.item_name} <span className="text-xs text-slate-400">{l.sku}</span></td>
                    {can("gst") && <td className="td text-slate-500">{l.hsn || "—"}</td>}
                    <td className="td text-right">{l.qty}</td>
                    <td className="td text-right">{fmtMoney(l.unit_price, cur)}</td>
                    {viewingHasDisc && <td className="td text-right text-rose-600">{Number(l.discount) > 0 ? `−${fmtMoney(l.discount, cur)}${l.discount_type === "percent" ? ` (${l.discount_value}%)` : ""}` : "—"}</td>}
                    {can("gst") && <td className="td text-right">{l.tax_rate}%</td>}
                    <td className="td text-right font-medium">{fmtMoney(l.line_total, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Print / download — A4 PDF and thermal receipt, for both sales and purchases */}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="label !mb-0 flex items-center gap-1.5"><FileText className="h-4 w-4 text-slate-400" /> Invoice</span>
            <button className="btn-ghost btn-sm" onClick={() => exportInvoicePdf({ company: me.tenant, currency: cur, doc: viewing, party: viewing._party, kind: cfg.kind, paymentKey: cfg.paymentKey })}>
              <FileText className="h-3.5 w-3.5" /> A4 PDF
            </button>
            <span className="label !mb-0 ml-2 flex items-center gap-1.5"><Printer className="h-4 w-4 text-slate-400" /> Thermal receipt</span>
            {THERMAL_SIZES.map((s) => (
              <button key={s.mm} className="btn-ghost btn-sm" onClick={() => printReceipt(s.mm)} title={`${s.label} roll (${s.mm} mm)`}>
                {s.label}
              </button>
            ))}
          </div>

          {cfg.kind === "sale" && (
            <ShareWhatsApp company={me.tenant.name} currency={cur} doc={viewing} customer={viewing._party} phone={partyPhones[viewing.customer_id]} />
          )}
        </DetailModal>
      )}

      {creating && <CreateDoc cfg={cfg} cur={cur} company={me.tenant.name} companyInfo={me.tenant} canGst={can("gst")} canLoc={can("multi_location")} onClose={() => setCreating(false)} onSaved={() => { setPage(1); load(); }} toast={toast} />}

      {editing && <CreateDoc cfg={cfg} cur={cur} company={me.tenant.name} companyInfo={me.tenant} canGst={can("gst")} canLoc={can("multi_location")} editDoc={editing} onClose={() => setEditing(null)} onSaved={load} toast={toast} />}
    </>
  );
}

function CreateDoc({ cfg, cur, company, companyInfo, canGst, canLoc, editDoc = null, onClose, onSaved, toast }) {
  const isEdit = !!editDoc;
  const [parties, setParties] = useState([]);
  const [saved, setSaved] = useState(null); // set after a sale is recorded → shows the print step
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState(editDoc?.location_id ? String(editDoc.location_id) : "");
  const [partyId, setPartyId] = useState(editDoc ? String(editDoc[cfg.partyKey] ?? "") : "");
  const [newParty, setNewParty] = useState(null); // null | {name,email,phone,tax_no,payment_terms} when quick-adding
  const [savingParty, setSavingParty] = useState(false);
  const [docType, setDocType] = useState(editDoc ? editDoc.doc_type : cfg.kind);
  const [docDate, setDocDate] = useState(editDoc?.doc_date || todayStr());
  const [paid, setPaid] = useState(editDoc ? (editDoc[cfg.paymentKey] ?? 0) : 0);
  const [payAccount, setPayAccount] = useState(editDoc?.payment_account || "cash");
  const [discount, setDiscount] = useState(editDoc?.discount_value ?? 0);
  const [discountType, setDiscountType] = useState(editDoc?.discount_type || "amount");
  const [extraCharges, setExtraCharges] = useState(editDoc?.extra_charges ?? 0);
  const [extraChargesNote, setExtraChargesNote] = useState(editDoc?.extra_charges_note || "");
  const [roundOff, setRoundOff] = useState(!!Number(editDoc?.round_off)); // round the grand total to a whole number
  const [taxInclusive, setTaxInclusive] = useState(!!Number(editDoc?.tax_inclusive)); // sale only: prices include GST
  const [lines, setLines] = useState(
    editDoc?.lines?.length
      ? editDoc.lines.map((l) => ({ item_id: String(l.item_id), qty: l.qty, unit_price: l.unit_price, tax_rate: l.tax_rate, discount: l.discount_value ?? 0, discount_type: l.discount_type || "amount" }))
      : [{ item_id: "", qty: 1, unit_price: 0, tax_rate: 0, discount: 0, discount_type: "amount" }]
  );
  const [override, setOverride] = useState(false);
  const [scan, setScan] = useState("");
  const [scanCam, setScanCam] = useState(false);
  const [newItem, setNewItem] = useState(null); // null | full item draft (see BLANK_ITEM) when quick-adding
  const [savingItem, setSavingItem] = useState(false);
  const [itemScanCam, setItemScanCam] = useState(false); // camera scan for the new-item barcode field
  const [showItemBarcode, setShowItemBarcode] = useState(false); // view/print the new-item barcode
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/${cfg.partyResource}`).then((r) => setParties(r.data));
    api.get("/items").then((r) => setItems(r.data));
    // Keep an edited doc's own location; otherwise default to the tenant's Main store.
    if (canLoc) api.get("/locations").then((r) => { setLocations(r.data); const d = r.data.find((l) => l.is_default); if (d) setLocationId((prev) => prev || String(d.id)); });
  }, []);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { item_id: "", qty: 1, unit_price: 0, tax_rate: 0, discount: 0, discount_type: "amount" }]);
  const delLine = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  // Quick-add a supplier/customer without leaving the bill form. On success the
  // new party is added to the dropdown, selected, and the inline panel collapses.
  const setNewPartyField = (k) => (e) => setNewParty((p) => ({ ...p, [k]: e.target.value }));
  const saveParty = async () => {
    const name = String(newParty?.name || "").trim();
    if (!name) return toast.error("Name is required");
    setSavingParty(true);
    try {
      const { data: created } = await api.post(`/${cfg.partyResource}`, { ...newParty, name });
      setParties((ps) => [...ps, created].sort((a, b) => a.name.localeCompare(b.name)));
      setPartyId(String(created.id));
      setNewParty(null);
      toast.success(`${cfg.partyLabel} added`);
    } catch (e) { toast.error(apiError(e)); }
    finally { setSavingParty(false); }
  };

  // Quick-add a new inventory item from the bill (purchase). On success the item
  // is added to inventory, the item list, and slotted into a line on this bill.
  const setNewItemField = (k) => (e) => setNewItem((it) => ({ ...it, [k]: e.target.value }));
  const saveItem = async () => {
    const name = String(newItem?.name || "").trim();
    if (!name) return toast.error("Item name is required");
    setSavingItem(true);
    try {
      const { data: created } = await api.post("/items", {
        name,
        sku: String(newItem.sku || "").trim(), // blank → backend auto-generates
        barcode: String(newItem.barcode || "").trim(),
        material_type: newItem.material_type || "finished",
        uom: String(newItem.uom || "").trim() || "unit",
        category: String(newItem.category || "").trim(),
        hsn: newItem.hsn || "",
        cost_price: Number(newItem.cost_price) || 0,
        sale_price: Number(newItem.sale_price) || 0,
        tax_rate: Number(newItem.tax_rate) || 0,
        stock_qty: Number(newItem.stock_qty) || 0,
        reorder_lvl: Number(newItem.reorder_lvl) || 0,
      });
      setItems((xs) => [...xs, created].sort((a, b) => a.name.localeCompare(b.name)));
      const line = { item_id: String(created.id), qty: 1, unit_price: cfg.kind === "sale" ? created.sale_price : created.cost_price, tax_rate: created.tax_rate || 0, discount: 0, discount_type: "amount" };
      setLines((ls) => {
        const blankIdx = ls.findIndex((l) => !l.item_id);
        return blankIdx >= 0 ? ls.map((l, i) => (i === blankIdx ? line : l)) : [...ls, line];
      });
      setNewItem(null);
      toast.success(`Added ${created.name}`);
    } catch (e) { toast.error(apiError(e)); }
    finally { setSavingItem(false); }
  };

  const onItemPick = (i, itemId) => {
    const it = items.find((x) => String(x.id) === String(itemId));
    setLine(i, {
      item_id: itemId,
      unit_price: it ? (cfg.kind === "sale" ? it.sale_price : it.cost_price) : 0,
      tax_rate: it ? it.tax_rate : 0,
    });
  };

  // Resolve a barcode/SKU against loaded items, then add or bump a line.
  // Shared by the hardware reader (keyboard), manual entry, and the camera.
  const addByCode = (raw) => {
    const code = (raw || "").trim();
    if (!code) return false;
    const it = items.find((x) => (x.barcode && x.barcode === code) || x.sku === code);
    if (!it) { toast.error(`No item with barcode/SKU "${code}"`); return false; }
    setLines((ls) => {
      const existing = ls.findIndex((l) => String(l.item_id) === String(it.id));
      if (existing >= 0) return ls.map((l, i) => (i === existing ? { ...l, qty: Number(l.qty || 0) + 1 } : l));
      const line = { item_id: String(it.id), qty: 1, unit_price: cfg.kind === "sale" ? it.sale_price : it.cost_price, tax_rate: it.tax_rate || 0, discount: 0, discount_type: "amount" };
      const blankIdx = ls.findIndex((l) => !l.item_id);
      return blankIdx >= 0 ? ls.map((l, i) => (i === blankIdx ? line : l)) : [...ls, line];
    });
    toast.success(`Added ${it.name}`);
    return true;
  };
  const onScan = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addByCode(scan);
    setScan("");
  };

  // Item-wise (line-level) discount is offered on purchase bills.
  const showLineDisc = cfg.kind === "purchase";
  // Resolve a line's item-wise discount (flat amount or % of the line base),
  // clamped to the base — mirrors the backend's computeTotals.
  const lineDiscountOf = (l) => {
    const base = Number(l.qty || 0) * Number(l.unit_price || 0);
    const val = Math.max(0, Number(l.discount || 0));
    const raw = l.discount_type === "percent" ? base * Math.min(val, 100) / 100 : val;
    return Math.min(raw, base);
  };
  // Sale invoices can be entered GST-inclusive (price embeds tax, so we back it
  // out) or exclusive (tax added on top). Mirrors the backend's computeTotals.
  const incl = cfg.kind === "sale" && taxInclusive;
  const totals = lines.reduce((acc, l) => {
    const base = Number(l.qty || 0) * Number(l.unit_price || 0);
    const net = base - lineDiscountOf(l);
    const rate = canGst ? Number(l.tax_rate || 0) : 0;
    let taxableNet, tax;
    if (incl && rate > 0) { tax = net - net / (1 + rate / 100); taxableNet = net - tax; }
    else { tax = net * rate / 100; taxableNet = net; }
    acc.sub += taxableNet; acc.tax += tax; acc.lineDisc += base - net; return acc;
  }, { sub: 0, tax: 0, lineDisc: 0 });
  // Document-level extras applied after tax (matches the backend's computeTotals).
  // Discount can be a flat amount or a % of subtotal; resolve then clamp it.
  const chargesNum = Math.max(0, Number(extraCharges || 0));
  const discountInput = Math.max(0, Number(discount || 0));
  const discountResolved = discountType === "percent"
    ? totals.sub * Math.min(discountInput, 100) / 100
    : discountInput;
  const discountAmt = Math.min(discountResolved, totals.sub + totals.tax + chargesNum);
  const rawGrand = Math.max(0, totals.sub + totals.tax - discountAmt + chargesNum);
  // Optional round-off mirrors the backend: snap to the nearest whole unit and
  // surface the signed adjustment so the user sees how the total was cleaned up.
  const roundOffAmt = roundOff ? Math.round(rawGrand) - rawGrand : 0;
  const grand = Math.round((rawGrand + roundOffAmt) * 100) / 100;

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        [cfg.partyKey]: Number(partyId),
        doc_type: docType,
        doc_date: docDate,
        [cfg.paymentKey]: Number(paid),
        payment_account: payAccount,
        discount_type: discountType,
        discount_value: discountInput,
        extra_charges: chargesNum,
        extra_charges_note: extraChargesNote,
        round_off: roundOff,
        lines: lines.filter((l) => l.item_id).map((l) => ({
          item_id: Number(l.item_id), qty: Number(l.qty), unit_price: Number(l.unit_price), tax_rate: Number(l.tax_rate),
          discount_type: l.discount_type === "percent" ? "percent" : "amount", discount_value: Number(l.discount) || 0,
        })),
      };
      if (cfg.kind === "sale") { payload.allowOverride = override; payload.tax_inclusive = taxInclusive; }
      if (canLoc && locationId) payload.location_id = Number(locationId);

      if (isEdit) {
        await api.put(`/${cfg.endpoint}/${editDoc.id}`, payload);
        toast.success(`${cfg.kind === "sale" ? "Sale" : "Purchase"} updated`);
        onSaved();
        onClose();
        return;
      }

      const { data: created } = await api.post(`/${cfg.endpoint}`, payload);
      toast.success(`${cfg.kind === "sale" ? "Sale" : "Purchase"} recorded`);
      onSaved(); // refresh the list behind the modal

      if (cfg.kind === "sale") {
        // Keep the modal open on a print step. The create response is only the
        // header row, so fetch the full document (with line items) for printing.
        const party = parties.find((p) => String(p.id) === String(partyId));
        const partyName = party?.name || "";
        const partyPhone = party?.phone || "";
        try {
          const { data: full } = await api.get(`/${cfg.endpoint}/${created.id}`);
          setSaved({ ...full, _party: partyName, _phone: partyPhone });
        } catch { setSaved({ ...created, _party: partyName, _phone: partyPhone, lines: [] }); }
      } else {
        onClose();
      }
    } catch (e) {
      const msg = apiError(e);
      toast.error(msg);
      if (/Insufficient stock/i.test(msg) && cfg.kind === "sale") setOverride(true); // surface override
    } finally { setBusy(false); }
  };

  const valid = partyId && lines.some((l) => l.item_id && Number(l.qty) > 0);

  // ── Print step (sales): shown after save instead of closing the modal ──
  const printReceipt = (mm) => exportThermalReceipt({ company: companyInfo || company, currency: cur, doc: saved, party: saved._party, kind: cfg.kind, paymentKey: cfg.paymentKey, widthMm: mm });
  const printA4 = () => exportInvoicePdf({ company: companyInfo || company, currency: cur, doc: saved, customer: saved._party });
  const startAnother = () => {
    setSaved(null); setPartyId(""); setDocType(cfg.kind); setDocDate(todayStr()); setPaid(0); setPayAccount("cash");
    setLines([{ item_id: "", qty: 1, unit_price: 0, tax_rate: 0, discount: 0, discount_type: "amount" }]); setOverride(false); setScan("");
    setDiscount(0); setDiscountType("amount"); setExtraCharges(0); setExtraChargesNote(""); setRoundOff(false); setTaxInclusive(false);
  };

  if (saved) {
    return (
      <Modal open title="Sale recorded" onClose={onClose}>
        <div className="flex flex-col items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div>
          <p className="mt-3 font-bold text-slate-800">{saved.doc_no}</p>
          <p className="text-sm text-slate-500">{saved._party || "—"} · {fmtMoney(saved.grand_total, cur)}</p>
        </div>

        <div className="mt-5 rounded-xl border border-slate-100 p-4">
          <p className="label flex items-center gap-1.5"><Printer className="h-4 w-4 text-slate-400" /> Print thermal receipt</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {THERMAL_SIZES.map((s) => (
              <button key={s.mm} className="btn-ghost btn-sm" onClick={() => printReceipt(s.mm)} title={`${s.label} roll (${s.mm} mm)`}>{s.label}</button>
            ))}
            <button className="btn-ghost btn-sm" onClick={printA4}><FileText className="h-3.5 w-3.5" /> A4 PDF</button>
          </div>
        </div>

        {cfg.kind === "sale" && (
          <ShareWhatsApp company={company} currency={cur} doc={saved} customer={saved._party} phone={saved._phone} />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={startAnother}><Plus className="h-4 w-4" /> {cfg.newLabel}</button>
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open wide title={isEdit ? `Edit ${editDoc.doc_no}` : cfg.newLabel} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={
          <span className="flex w-full items-center justify-between">
            <span>{cfg.partyLabel}</span>
            <button type="button" onClick={() => setNewParty((p) => (p ? null : {}))}
              className="text-[11px] font-semibold normal-case text-brand-600 hover:underline">
              {newParty ? "Cancel" : `+ New ${cfg.partyLabel.toLowerCase()}`}
            </button>
          </span>
        }>
          <select className="input" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">Select…</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Document type">
          <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value={cfg.kind}>{cfg.kind === "sale" ? "Sale invoice" : "Purchase"}</option>
            <option value="return">{cfg.returnLabel}</option>
          </select>
        </Field>
        <Field label={cfg.kind === "sale" ? "Invoice date" : "Bill date"}>
          <input type="date" className="input" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
        </Field>
        {canLoc && locations.length > 0 && (
          <Field label={cfg.kind === "sale" ? "Issue from warehouse" : "Receive into warehouse"}>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        )}
      </div>

      {/* Distinct popup for adding a party — emerald "create a record" identity so
          it's clearly a different surface from the indigo invoice form behind it. */}
      {newParty && (
        <Modal
          open
          onClose={() => { if (!savingParty) setNewParty(null); }}
          title={
            <span className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_14px_-4px_rgba(16,185,129,.55)]">
                <UserPlus className="h-[18px] w-[18px]" />
              </span>
              <span>New {cfg.partyLabel.toLowerCase()}</span>
            </span>
          }
        >
          {/* full-bleed context banner — different colour from the invoice form */}
          <div className="-mx-5 -mt-5 mb-5 border-b border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50/60 px-5 py-3">
            <p className="text-sm font-semibold text-emerald-800">Add a new {cfg.partyLabel.toLowerCase()} to your records</p>
            <p className="text-xs text-emerald-600/90">Saved to your {cfg.partyLabel.toLowerCase()} list and selected on this {cfg.kind}.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Name"><input className="input" autoFocus value={newParty.name || ""} onChange={setNewPartyField("name")} placeholder="Required" /></Field></div>
            <Field label="Contact person"><input className="input" value={newParty.contact_person || ""} onChange={setNewPartyField("contact_person")} placeholder="e.g. Jane Doe" /></Field>
            <Field label="Phone"><input className="input" value={newParty.phone || ""} onChange={setNewPartyField("phone")} /></Field>
            <Field label="Email"><input className="input" value={newParty.email || ""} onChange={setNewPartyField("email")} /></Field>
            {canGst && <Field label="Tax / GSTIN"><input className="input" value={newParty.tax_no || ""} onChange={setNewPartyField("tax_no")} /></Field>}
            <Field label="Payment terms"><input className="input" value={newParty.payment_terms || ""} onChange={setNewPartyField("payment_terms")} placeholder="e.g. Net 30" /></Field>
            <div className="sm:col-span-2"><Field label="Address"><textarea className="input" rows={2} value={newParty.address || ""} onChange={setNewPartyField("address")} placeholder="Street, area, landmark" /></Field></div>
            <Field label="City"><input className="input" value={newParty.city || ""} onChange={setNewPartyField("city")} /></Field>
            <Field label="State"><input className="input" value={newParty.state || ""} onChange={setNewPartyField("state")} /></Field>
            <Field label="Pincode"><input className="input" value={newParty.pincode || ""} onChange={setNewPartyField("pincode")} inputMode="numeric" /></Field>
          </div>

          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="btn-ghost" onClick={() => setNewParty(null)}>Cancel</button>
            <button
              className="btn bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_14px_-4px_rgba(16,185,129,.5)] hover:from-emerald-600 hover:to-teal-700"
              disabled={savingParty || !String(newParty.name || "").trim()}
              onClick={saveParty}
            >
              {savingParty && <Spinner className="h-4 w-4" />} Save {cfg.partyLabel.toLowerCase()}
            </button>
          </div>
        </Modal>
      )}

      {cfg.kind === "sale" && canGst && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Item prices are</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm font-semibold">
            <button type="button" onClick={() => setTaxInclusive(false)}
              className={`rounded-md px-3 py-1.5 transition ${!taxInclusive ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              Exclusive of GST
            </button>
            <button type="button" onClick={() => setTaxInclusive(true)}
              className={`rounded-md px-3 py-1.5 transition ${taxInclusive ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              Inclusive of GST
            </button>
          </div>
          <span className="text-xs text-slate-400">{taxInclusive ? "GST is backed out of the entered price" : "GST is added on top of the entered price"}</span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
        <ScanLine className="h-5 w-5 shrink-0 text-brand-500" />
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Scan with a reader or type a barcode/SKU, then press Enter"
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={onScan}
          autoComplete="off"
        />
        <button type="button" onClick={() => setScanCam(true)} className="btn-ghost btn-sm shrink-0" title="Scan with camera">
          <Camera className="h-4 w-4" /> Camera
        </button>
      </div>

      <BarcodeScanner open={scanCam} onClose={() => setScanCam(false)} onDetect={(code) => { setScanCam(false); addByCode(code); }} />

      <div className="mt-3 space-y-2">
        {showLineDisc ? (
          // Purchases carry an extra item-wise discount control. A rigid 12-col
          // grid squeezes the numeric fields too small, so lay the row out with
          // flex: the item select grows and every other field keeps a fixed,
          // readable width (wrapping to a new line on narrow screens).
          <>
            <div className="hidden items-center gap-2 px-1 text-xs font-semibold text-slate-400 sm:flex">
              <div className="min-w-[150px] flex-1">Item</div>
              <div className="w-16">Qty</div>
              <div className="w-20">Price</div>
              <div className="w-[136px]">Discount</div>
              {canGst && <div className="w-16">GST%</div>}
              <div className="w-9" />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <LineCol label="Item" className="w-full shrink-0 sm:w-auto sm:flex-1">
                  <ItemPicker items={items} value={l.item_id} onPick={(id) => onItemPick(i, id)} className="min-w-[150px]" />
                </LineCol>
                <LineCol label="Qty" className="shrink-0">
                  <input type="number" className="input w-16" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="Qty" />
                </LineCol>
                <LineCol label="Price" className="shrink-0">
                  <input type="number" className="input w-20" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} placeholder="Price" />
                </LineCol>
                <LineCol label="Discount" className="shrink-0">
                  <div className="flex gap-1">
                    <input type="number" min="0" className="input w-[74px]" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} placeholder="0" title="Item-wise discount (before tax)" />
                    <select className="input w-[58px] !px-1.5" value={l.discount_type} onChange={(e) => setLine(i, { discount_type: e.target.value })} title="Discount type">
                      <option value="amount">Amt</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </LineCol>
                {canGst && (
                  <LineCol label="GST%" className="shrink-0">
                    <input type="number" className="input w-16" value={l.tax_rate} onChange={(e) => setLine(i, { tax_rate: e.target.value })} placeholder="GST%" title="Defaults from item master — editable" />
                  </LineCol>
                )}
                <button className="grid h-10 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => delLine(i)} title="Remove line"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-semibold text-slate-400 sm:grid">
              <div className="col-span-5">Item</div><div className="col-span-2">Qty</div>
              <div className="col-span-2">Price</div>{canGst ? <div className="col-span-2">GST%</div> : <div className="col-span-2" />}<div />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <LineCol label="Item" className="col-span-12 sm:col-span-5">
                  <ItemPicker items={items} value={l.item_id} onPick={(id) => onItemPick(i, id)} />
                </LineCol>
                <LineCol label="Qty" className="col-span-4 sm:col-span-2">
                  <input type="number" className="input w-full" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="Qty" />
                </LineCol>
                <LineCol label="Price" className="col-span-4 sm:col-span-2">
                  <input type="number" className="input w-full" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} placeholder="Price" />
                </LineCol>
                {canGst
                  ? <LineCol label="GST%" className="col-span-3 sm:col-span-2">
                      <input type="number" className="input w-full" value={l.tax_rate} onChange={(e) => setLine(i, { tax_rate: e.target.value })} placeholder="GST%" title="Defaults from item master — editable" />
                    </LineCol>
                  : <div className="hidden sm:block sm:col-span-2" />}
                <button className="col-span-1 grid h-10 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => delLine(i)} title="Remove line"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost btn-sm" onClick={addLine}><Plus className="h-3.5 w-3.5" /> Add line</button>
          {cfg.kind === "purchase" && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setNewItem((x) => (x ? null : { ...BLANK_ITEM }))}>
              <Plus className="h-3.5 w-3.5" /> {newItem ? "Cancel new item" : "New item"}
            </button>
          )}
        </div>
      </div>

      {cfg.kind === "purchase" && newItem && (
        <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <p className="label !mb-2">New item</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><Field label="Name"><input className="input" autoFocus value={newItem.name || ""} onChange={setNewItemField("name")} placeholder="Required" /></Field></div>
            <Field label="Unit of measure"><input className="input" value={newItem.uom || ""} onChange={setNewItemField("uom")} placeholder="unit" /></Field>
            <Field label="SKU (optional)">
              <input className="input" value={newItem.sku || ""} onChange={setNewItemField("sku")} placeholder={`Auto e.g. ${SKU_PREFIX[newItem.material_type] || "IT"}-00001`} autoComplete="off" />
            </Field>
            <Field label="Material type">
              <select className="input" value={newItem.material_type || "finished"} onChange={setNewItemField("material_type")}>
                {MATERIAL_TYPES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Category"><input className="input" value={newItem.category || ""} onChange={setNewItemField("category")} /></Field>
            <div className="sm:col-span-3"><Field label="Barcode (generate or type — optional)">
              <div className="flex gap-2">
                <input className="input" value={newItem.barcode || ""} onChange={setNewItemField("barcode")} placeholder="e.g. 8901234567890" autoComplete="off" />
                {newItem.barcode ? (
                  <button type="button" onClick={() => setShowItemBarcode(true)} className="btn-ghost shrink-0" title="View, download or print the barcode">
                    <Eye className="h-4 w-4" /> View Barcode
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => setNewItem((it) => ({ ...it, barcode: genBarcode() }))} className="btn-ghost shrink-0" title="Generate a barcode">
                      <Barcode className="h-4 w-4" /> Generate
                    </button>
                    <button type="button" onClick={() => setItemScanCam(true)} className="btn-ghost shrink-0" title="Scan a barcode with the camera">
                      <ScanLine className="h-4 w-4" /> Add Barcode
                    </button>
                  </>
                )}
              </div>
            </Field></div>
            {canGst && <Field label="HSN/SAC"><input className="input" value={newItem.hsn || ""} onChange={setNewItemField("hsn")} placeholder="e.g. 9401" autoComplete="off" /></Field>}
            {canGst && <Field label="GST %"><input type="number" min="0" className="input" value={newItem.tax_rate || ""} onChange={setNewItemField("tax_rate")} placeholder="0" /></Field>}
            <Field label="Cost price"><input type="number" min="0" className="input" value={newItem.cost_price || ""} onChange={setNewItemField("cost_price")} placeholder="0" /></Field>
            <Field label="Sale price"><input type="number" min="0" className="input" value={newItem.sale_price || ""} onChange={setNewItemField("sale_price")} placeholder="0" /></Field>
            <Field label="Opening stock"><input type="number" className="input" value={newItem.stock_qty || ""} onChange={setNewItemField("stock_qty")} placeholder="0" /></Field>
            <Field label="Reorder level"><input type="number" className="input" value={newItem.reorder_lvl || ""} onChange={setNewItemField("reorder_lvl")} placeholder="0" /></Field>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Leave SKU blank to auto-generate (<b>{SKU_PREFIX[newItem.material_type] || "IT"}-…</b>). Saving adds the item to your inventory and to this bill.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setNewItem(null)}>Cancel</button>
            <button className="btn-primary btn-sm" disabled={savingItem || !String(newItem.name || "").trim()} onClick={saveItem}>
              {savingItem && <Spinner className="h-4 w-4" />} Save item
            </button>
          </div>
          <BarcodeScanner open={itemScanCam} onClose={() => setItemScanCam(false)} onDetect={(code) => { setItemScanCam(false); setNewItem((it) => ({ ...it, barcode: code })); toast.success("Barcode captured"); }} />
          <BarcodeView open={showItemBarcode} value={newItem.barcode} name={newItem.name} onClose={() => setShowItemBarcode(false)} />
        </div>
      )}

      {cfg.kind === "sale" && (
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          Allow overselling beyond available stock (authorized override)
        </label>
      )}

      <div className="mt-4 grid gap-3 sm:max-w-md sm:grid-cols-2">
        <Field label="Additional discount">
          <div className="flex gap-2">
            <input type="number" min="0" className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            <select className="input !w-28" value={discountType} onChange={(e) => setDiscountType(e.target.value)} title="Discount type">
              <option value="amount">Amount</option>
              <option value="percent">%</option>
            </select>
          </div>
        </Field>
        <Field label="Additional charges">
          <input type="number" min="0" className="input" value={extraCharges} onChange={(e) => setExtraCharges(e.target.value)} placeholder="0" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Additional charges note">
            <input type="text" className="input" value={extraChargesNote} onChange={(e) => setExtraChargesNote(e.target.value)} placeholder="e.g. Freight, Packing, Insurance" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
          <input type="checkbox" checked={roundOff} onChange={(e) => setRoundOff(e.target.checked)} />
          Round off total{roundOff && Math.abs(roundOffAmt) > 0.0001 && (
            <span className="text-slate-400">({roundOffAmt > 0 ? "+" : "−"}{fmtMoney(Math.abs(roundOffAmt), cur)})</span>
          )}
        </label>
      </div>

      <div className="mt-4 sm:max-w-xs">
        <Field label={
          <span className="flex w-full items-center justify-between">
            <span>{cfg.paymentLabel}</span>
            {grand > 0 && Number(paid) !== grand && (
              <button type="button" onClick={() => setPaid(grand)} className="text-[11px] font-semibold normal-case text-brand-600 hover:underline">
                {cfg.kind === "sale" ? "Received" : "Paid"} in full
              </button>
            )}
          </span>
        }>
          <div className="flex gap-2">
            <input type="number" min="0" className="input" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" />
            <select className="input !w-28" value={payAccount} onChange={(e) => setPayAccount(e.target.value)} title={cfg.kind === "sale" ? "Received in" : "Paid from"}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </div>
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="text-sm text-slate-500">
          {totals.lineDisc > 0 && <>Item discount <b className="text-slate-800">−{fmtMoney(totals.lineDisc, cur)}</b> · </>}
          Subtotal <b className="text-slate-800">{fmtMoney(totals.sub, cur)}</b>
          {canGst && <> · Tax <b className="text-slate-800">{fmtMoney(totals.tax, cur)}</b></>}
          {discountAmt > 0 && <> · Discount <b className="text-slate-800">−{fmtMoney(discountAmt, cur)}{discountType === "percent" ? ` (${discountInput}%)` : ""}</b></>}
          {chargesNum > 0 && <> · Charges <b className="text-slate-800">+{fmtMoney(chargesNum, cur)}</b></>}
          {Math.abs(roundOffAmt) > 0.0001 && <> · Round off <b className="text-slate-800">{roundOffAmt > 0 ? "+" : "−"}{fmtMoney(Math.abs(roundOffAmt), cur)}</b></>}
          {" "}· Total <b className="text-brand-700">{fmtMoney(grand, cur)}</b>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !valid} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Save</button>
        </div>
      </div>
    </Modal>
  );
}
