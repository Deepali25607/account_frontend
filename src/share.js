// Build and read self-contained shareable invoice links, plus WhatsApp helpers.
//
// We have no backend storage for invoices, so a "shareable link" carries the
// whole invoice in the URL hash (`/i#d=<encoded>`). The public page at /i decodes
// it client-side and renders a read-only invoice with a Download PDF button — the
// data never reaches a server. We keep the payload keys short to keep URLs small.

/**
 * Public base URL used to build customer-facing links.
 * On the web this is just the current origin. In the Capacitor Android app the
 * origin is `https://localhost`, which a customer can't open — so that build must
 * set VITE_PUBLIC_WEB_URL to the deployed web app's URL.
 */
export function publicBaseUrl() {
  const configured = import.meta.env.VITE_PUBLIC_WEB_URL;
  return (configured || window.location.origin).replace(/\/+$/, "");
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

/** Pack a sale into a compact, link-friendly shape. */
function pack({ company, currency, doc, customer }) {
  return {
    c: company || "",
    u: currency || "INR",
    n: doc.doc_no,
    d: doc.doc_date,
    ty: doc.doc_type || "sale",
    p: customer || "",
    pa: doc.payment_account || "cash",
    r: Number(doc.received || 0),
    s: Number(doc.subtotal || 0),
    t: Number(doc.tax_total || 0),
    g: Number(doc.grand_total || 0),
    l: (doc.lines || []).map((l) => [l.item_name, l.hsn || "", Number(l.qty || 0), Number(l.unit_price || 0), Number(l.tax_rate || 0), Number(l.line_total || 0)]),
  };
}

/** Reverse of pack() — returns { company, currency, doc, customer } as the PDF/render code expects. */
export function unpack(o) {
  return {
    company: o.c,
    currency: o.u,
    customer: o.p,
    doc: {
      doc_no: o.n,
      doc_date: o.d,
      doc_type: o.ty,
      payment_account: o.pa,
      received: o.r,
      subtotal: o.s,
      tax_total: o.t,
      grand_total: o.g,
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

/** Default WhatsApp message body for an invoice. */
export function invoiceMessage({ company, customer, docNo, total, link }) {
  const hi = customer ? `Hi ${customer},` : "Hi,";
  return `${hi}\n\nHere is your invoice ${docNo} for ${total}${company ? ` from ${company}` : ""}.\n\nView / download: ${link}\n\nThank you!`;
}
