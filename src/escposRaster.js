// Raster ("Image") receipt output — renders the bill text onto a canvas and
// sends it as GS v 0 bitmap bands. This is how mainstream billing apps (incl.
// MyBillBook's Modern mode) print: the printer's fonts, codepages and text
// engine are never used, so it works on units whose text mode misbehaves.
// Trade-off: bigger payloads (~30-40 KB per receipt), so it's slower over
// Web Bluetooth; over classic SPP in the app it takes a few seconds.

import { receiptPreviewLines, colsFor } from "./escpos";

// Print-head dots per roll: 58 mm → 384, 80 mm → 576, 104 mm → 832 (203 dpi).
const dotsFor = (mm) => (mm <= 58 ? 384 : mm <= 80 ? 576 : mm <= 104 ? 832 : Math.round(mm) * 8);

/** Build the full raster payload for a receipt. Same args as
 *  buildReceiptEscpos(). Async because it renders through a canvas. */
export async function buildReceiptRaster(args) {
  const { widthMm = 58, feedLines = 4, autoCut = true } = args;
  // Text layout comes from the same engine as the preview — "old" mode gives
  // pure text with space-centering. _unicode keeps Hindi/₹/etc. intact: the
  // canvas draws every script, unlike the printer's text mode.
  const lines = receiptPreviewLines({ ...args, format: "old", feedLines: 0, _unicode: true });
  const width = dotsFor(widthMm);
  const cols = Number(args.charsPerLine) || colsFor(widthMm);
  const charW = width / cols;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const fontFor = (px) => `bold ${px}px "Courier New", Consolas, monospace`;
  // Calibrate the font size so one monospace advance equals exactly one grid
  // column — whole lines can then be drawn in a single run (crisper than
  // per-char placement) with columns still aligned.
  let fontSize = Math.floor(charW * 1.7);
  ctx.font = fontFor(fontSize);
  const adv = ctx.measureText("M").width || charW * 0.6;
  fontSize = Math.max(8, Math.floor(fontSize * (charW / adv)));
  const lineH = Math.ceil(fontSize * 1.3);
  const marginTop = 4, marginBottom = 32; // tight header, breathing room at the tear
  const height = lines.length * lineH + marginTop + marginBottom;

  canvas.width = width;
  canvas.height = height; // (re)sizing resets context state — set styles after
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.font = fontFor(fontSize);
  ctx.textBaseline = "top";
  lines.forEach((ln, row) => { if (ln.trim()) ctx.fillText(ln, 0, marginTop + row * lineH); });

  // Threshold to 1-bit. 110 keeps solid strokes and drops the grey
  // anti-aliasing fringe that otherwise prints as speckled dots.
  const THRESHOLD = 110;
  const img = ctx.getImageData(0, 0, width, height).data;
  const widthBytes = width / 8;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const rb = new Uint8Array(widthBytes);
    let any = 0;
    for (let bx = 0; bx < widthBytes; bx++) {
      let b = 0;
      for (let bit = 0; bit < 8; bit++) {
        const p = (y * width + bx * 8 + bit) * 4;
        const lum = 0.299 * img[p] + 0.587 * img[p + 1] + 0.114 * img[p + 2];
        if (lum < THRESHOLD) b |= 0x80 >> bit;
      }
      rb[bx] = b;
      any |= b;
    }
    rows.push({ rb, blank: !any });
  }

  // Keep short blank runs (inter-line gaps) inside the bitmap — ESC J feed
  // units vary between firmwares, and converting small gaps to feeds squashed
  // lines together on the 4B-2043PB. Only long runs (margins) become feeds.
  const MIN_FEED_RUN = 32;
  for (let y0 = 0; y0 < height; ) {
    if (!rows[y0].blank) { y0++; continue; }
    let end = y0;
    while (end < height && rows[end].blank) end++;
    if (end - y0 < MIN_FEED_RUN) for (let r = y0; r < end; r++) rows[r].blank = false;
    y0 = end;
  }

  // Emit: content rows as GS v 0 bands (≤128 rows — suits tiny buffers),
  // long blank runs as ESC J dot-feeds.
  const out = [0x1b, 0x40]; // initialize
  let y = 0;
  while (y < height) {
    if (rows[y].blank) {
      let n = 0;
      while (y < height && rows[y].blank) { y++; n++; }
      while (n > 0) { const f = Math.min(255, n); out.push(0x1b, 0x4a, f); n -= f; } // ESC J f — feed f dots
    } else {
      const start = y;
      let n = 0;
      while (y < height && !rows[y].blank && n < 128) { y++; n++; }
      out.push(0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, n & 0xff, (n >> 8) & 0xff);
      for (let r = start; r < y; r++) out.push(...rows[r].rb);
    }
  }
  const feed = Math.max(0, Math.min(8, Number.isFinite(+feedLines) ? +feedLines : 4));
  for (let i = 0; i < feed; i++) out.push(0x0a);
  if (autoCut) out.push(0x1d, 0x56, 0x42, 0x00);
  console.debug(`[print] raster receipt: ${width}x${height}px, ${out.length} bytes`);
  return new Uint8Array(out);
}
