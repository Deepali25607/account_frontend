// Build and read self-contained shareable invoice links, plus WhatsApp helpers.
//
// We have no backend storage for invoices, so a "shareable link" carries the
// whole invoice in the URL hash (`/i#d=<encoded>`). The public page at /i decodes
// it client-side and renders a read-only invoice with a Download PDF button — the
// data never reaches a server. We keep the payload keys short to keep URLs small.

import { BASENAME } from "./config";
import { isNativeApp } from "./files";

/**
 * Public base URL used to build customer-facing links.
 * On the web this is the current origin plus the deployment base path (the app
 * lives under e.g. `/account`, so origin alone would land on the company site).
 * In the Capacitor Android app the origin is `https://localhost`, which a
 * customer can't open — so that build must set VITE_PUBLIC_WEB_URL to the
 * deployed web app's URL (including its base path).
 */
export function publicBaseUrl() {
  const configured = import.meta.env.VITE_PUBLIC_WEB_URL;
  return (configured || window.location.origin + BASENAME).replace(/\/+$/, "");
}

/**
 * True only if the public base resolves to a real, internet-reachable domain.
 * localhost / 127.0.0.1 / capacitor origins produce links that WhatsApp won't
 * linkify and a customer's phone can't open — so the UI warns in that case.
 */
export function isPublicShareBase() {
  try {
    const u = new URL(publicBaseUrl());
    const h = u.hostname;
    if (!h || h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
    return h.includes("."); // a real domain has a dot/TLD; bare hostnames don't
  } catch { return false; }
}

// URL-safe base64 of a UTF-8 string (and back).
const toB64Url = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** Pack a sale into a compact, link-friendly shape. `company` may be the full
 *  company profile (name/address/GSTIN…) or a plain name string — the profile
 *  fields travel too (minus the logo, whose data-URL would blow up the link)
 *  so the public page and its PDF show a complete letterhead. */
function pack({ company, currency, doc, customer }) {
  const co = typeof company === "object" && company !== null ? company : { name: company || "" };
  const profile = { a: co.address || "", ci: co.city || "", st: co.state || "", z: co.pincode || "", ph: co.phone || "", em: co.email || "", g: co.gstin || "" };
  // Customer address/contact/GSTIN — present when the doc came from the full
  // GET /sales/:id fetch, which embeds the party row; travels so the public
  // page's Bill To block is complete too.
  const pt = doc.party && typeof doc.party === "object"
    ? { a: doc.party.address || "", ci: doc.party.city || "", st: doc.party.state || "", z: doc.party.pincode || "", ph: doc.party.phone || "", g: doc.party.tax_no || "" }
    : null;
  return {
    c: co.name || "",
    co: Object.values(profile).some(Boolean) ? profile : undefined,
    pp: pt && Object.values(pt).some(Boolean) ? pt : undefined,
    u: currency || "INR",
    n: doc.doc_no,
    d: doc.doc_date,
    ty: doc.doc_type || "sale",
    p: customer || "",
    pa: doc.payment_account || "cash",
    r: Number(doc.received || 0),
    s: Number(doc.subtotal || 0),
    t: Number(doc.tax_total || 0),
    di: Number(doc.discount || 0),
    dt: doc.discount_type || "amount",
    dv: Number(doc.discount_value || 0),
    ch: Number(doc.extra_charges || 0),
    cn: doc.extra_charges_note || "",
    g: Number(doc.grand_total || 0),
    ti: Number(doc.tax_inclusive || 0),
    l: (doc.lines || []).map((l) => [l.item_name, l.hsn || "", Number(l.qty || 0), Number(l.unit_price || 0), Number(l.tax_rate || 0), Number(l.line_total || 0)]),
  };
}

/** Reverse of pack() — returns { company, currency, doc, customer } as the PDF/render code expects. */
export function unpack(o) {
  return {
    company: o.co
      ? { name: o.c, address: o.co.a, city: o.co.ci, state: o.co.st, pincode: o.co.z, phone: o.co.ph, email: o.co.em, gstin: o.co.g }
      : o.c,
    currency: o.u,
    customer: o.p,
    doc: {
      party: o.pp
        ? { name: o.p, address: o.pp.a, city: o.pp.ci, state: o.pp.st, pincode: o.pp.z, phone: o.pp.ph, tax_no: o.pp.g }
        : undefined,
      doc_no: o.n,
      doc_date: o.d,
      doc_type: o.ty,
      payment_account: o.pa,
      received: o.r,
      subtotal: o.s,
      tax_total: o.t,
      discount: o.di || 0,
      discount_type: o.dt || "amount",
      discount_value: o.dv || 0,
      extra_charges: o.ch || 0,
      extra_charges_note: o.cn || "",
      grand_total: o.g,
      tax_inclusive: o.ti || 0,
      lines: (o.l || []).map(([item_name, hsn, qty, unit_price, tax_rate, line_total]) => ({ item_name, hsn, qty, unit_price, tax_rate, line_total })),
    },
  };
}

/** Absolute, self-contained link to the read-only public invoice page. */
export function buildInvoiceLink({ company, currency, doc, customer }) {
  const encoded = toB64Url(JSON.stringify(pack({ company, currency, doc, customer })));
  return `${publicBaseUrl()}/i#d=${encoded}`;
}

/** Decode the invoice carried in a `/i#d=…` URL hash; returns null if absent/corrupt. */
export function readInvoiceFromHash(hash = window.location.hash) {
  const m = /[#&]d=([^&]+)/.exec(hash || "");
  if (!m) return null;
  try { return unpack(JSON.parse(fromB64Url(m[1]))); }
  catch { return null; }
}

/**
 * Normalise a phone number to the bare international digits wa.me expects
 * (country code + subscriber number, no +, spaces or punctuation).
 */
export function normalizePhone(raw, cc = "91") {
  let d = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
  const ccDigits = String(cc || "").replace(/\D/g, "");
  if (ccDigits && d.length <= 10 && !d.startsWith(ccDigits)) d = ccDigits + d;
  return d;
}

/** WhatsApp click-to-chat URL: opens a chat with `phone`, message pre-filled. */
export function waUrl(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * Open the WhatsApp chat with `phone`, message pre-filled — used after the PDF
 * went out via a share sheet, because WhatsApp drops the text caption when a
 * document is attached, and the share sheet ignores the entered number anyway.
 * In the app, assigning location hands the external URL to the OS (Capacitor
 * intercepts non-app hosts and launches WhatsApp; the WebView stays put). In
 * browsers a popup can be blocked after the share's user-gesture is spent, so
 * fall back to same-tab navigation — wa.me bounces straight into WhatsApp.
 */
export function openWhatsAppChat(phone, text) {
  const url = waUrl(phone, text);
  if (isNativeApp()) { window.location.href = url; return; }
  const w = window.open(url, "_blank");
  if (!w) window.location.href = url;
}

/**
 * WhatsApp message body for an invoice: the key details (number, date, amounts)
 * that travel as the caption alongside the attached PDF. `paid`/`balance`/`link`
 * are optional — pass empty to omit their lines (e.g. no link on localhost).
 */
export function invoiceShareMessage({ company, customer, docNo, date, total, paid, balance, link }) {
  const hi = customer ? `Hi ${customer},` : "Hi,";
  return [
    hi,
    "",
    `Invoice ${docNo}${date ? ` · ${date}` : ""}${company ? ` from ${company}` : ""}`,
    `Total: ${total}`,
    ...(paid ? [`Received: ${paid}`] : []),
    ...(balance ? [`Balance due: ${balance}`] : []),
    "",
    "The invoice PDF is attached.",
    ...(link ? ["", `View online: ${link}`] : []),
    "",
    "Thank you!",
  ].join("\n");
}
