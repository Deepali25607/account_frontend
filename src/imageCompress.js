/**
 * Client-side image compression. Resizes large uploads and re-encodes them so
 * the stored data-URL is small (fast to upload, store and ship in JSON) while
 * keeping visual quality high. Returns a Promise<dataURL string>.
 *
 * - PNG sources stay PNG (lossless — preserves transparency & crisp graphics
 *   such as QR codes); other formats are encoded as JPEG for strong photo
 *   compression. Pass `mime` to force a format.
 * - Never returns something larger than the original (falls back to it).
 */
export async function compressImage(file, opts = {}) {
  const { maxDim = 1280, quality = 0.85, mime } = opts;
  const original = await fileToDataUrl(file);
  let img;
  try { img = await loadImage(original); }
  catch { return original; } // unreadable by the canvas — keep the raw upload

  const longest = Math.max(img.width, img.height) || 1;
  const scale = Math.min(1, maxDim / longest);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  // Keep PNG lossless (transparency / sharp edges); use JPEG for photos.
  const outMime = mime || (file.type === "image/png" ? "image/png" : "image/jpeg");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (outMime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); } // flatten alpha
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  let out;
  try { out = canvas.toDataURL(outMime, quality); }
  catch { return original; }
  return out && out.length < original.length ? out : original;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}
