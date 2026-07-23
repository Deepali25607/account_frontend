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
  // pure text with space-centering, exactly what we want to draw.
  const lines = receiptPreviewLines({ ...args, format: "old", feedLines: 0 });
  const width = dotsFor(widthMm);
  const cols = Number(args.charsPerLine) || colsFor(widthMm);

  const charW = width / cols;
  const fontSize = Math.floor(charW * 1.7); // Courier glyphs are ~0.6 em wide
  const lineH = Math.ceil(fontSize * 1.25);
  const margin = 8;
  const height = lines.length * lineH + margin * 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.font = `bold ${fontSize}px "Courier New", monospace`; // bold = darker dots on thermal
  ctx.textBaseline = "top";
  // Char-by-char placement keeps the column grid exact regardless of font metrics.
  lines.forEach((ln, row) => {
    const y = margin + row * lineH;
    for (let i = 0; i < ln.length; i++) {
      if (ln[i] !== " ") ctx.fillText(ln[i], Math.round(i * charW + charW * 0.08), y);
    }
  });

  // Threshold to 1-bit and emit GS v 0 bands (small bands suit tiny buffers).
  const img = ctx.getImageData(0, 0, width, height).data;
  const widthBytes = width / 8;
  const out = [0x1b, 0x40]; // initialize
  const BAND = 128;
  for (let y0 = 0; y0 < height; y0 += BAND) {
    const rows = Math.min(BAND, height - y0);
    out.push(0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff);
    for (let y = y0; y < y0 + rows; y++) {
      for (let bx = 0; bx < widthBytes; bx++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) {
          const p = (y * width + bx * 8 + bit) * 4;
          const lum = 0.299 * img[p] + 0.587 * img[p + 1] + 0.114 * img[p + 2];
          if (lum < 160) b |= 0x80 >> bit;
        }
        out.push(b);
      }
    }
  }
  const feed = Math.max(0, Math.min(8, Number.isFinite(+feedLines) ? +feedLines : 4));
  for (let i = 0; i < feed; i++) out.push(0x0a);
  if (autoCut) out.push(0x1d, 0x56, 0x42, 0x00);
  console.debug(`[print] raster receipt: ${width}x${height}px, ${out.length} bytes`);
  return new Uint8Array(out);
}
