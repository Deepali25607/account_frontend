// Platform-aware output for generated files (PDF receipts/invoices, Excel/CSV
// reports). Where a finished file goes depends on where the app is running:
//
//   • Android/iOS app (Capacitor) — the WebView has no blob-download handling,
//     so a plain <a download> silently does nothing. We write the file to the
//     app cache and open the native share sheet instead: from there the user
//     reaches WhatsApp, email, SMS, printer services and every other installed
//     app — or just saves the file.
//   • Mobile browser — same share-sheet experience via the Web Share API with
//     the file attached, falling back to a normal download.
//   • Desktop browser — a normal download.

import { Capacitor } from "@capacitor/core";

export const isNativeApp = () => Capacitor?.isNativePlatform?.();
export const isMobileBrowser = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1]);
  r.onerror = reject;
  r.readAsDataURL(blob);
});

/** App only: write the file into the app's cache dir and open the OS share sheet. */
async function shareFileNative({ blob, fileName, text }) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  await Share.share({ title: fileName, ...(text ? { text } : {}), files: [uri] });
}

/** True when the error is just the user closing the share sheet, not a failure. */
const isShareCancel = (e) => e?.name === "AbortError" || /cancel/i.test(String(e?.message || e));

/** Mobile web: share the file via the Web Share API.
 *  Returns "shared" | "cancelled", or false when unsupported/failed (→ fall back). */
async function shareFileWeb({ blob, fileName, mimeType, text }) {
  const file = new File([blob], fileName, { type: mimeType });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: fileName, ...(text ? { text } : {}) });
    return "shared";
  } catch (e) {
    return e?.name === "AbortError" ? "cancelled" : false; // cancelled = done, don't fall back
  }
}

/** Trigger a plain browser download of the blob. */
export function downloadFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Deliver a generated file the way the current platform supports: native share
 * sheet in the app, Web Share on mobile browsers, download on desktop.
 * `text` (optional) becomes the share message/caption alongside the file.
 * Returns "shared" | "cancelled" | "error" | "downloaded"; never throws.
 */
export async function outputFile({ blob, fileName, mimeType, text }) {
  // File paths choke on separators/reserved chars a doc number might contain.
  const safeName = String(fileName).replace(/[^\w.-]+/g, "_");
  if (isNativeApp()) {
    // No download fallback here: the WebView ignores blob downloads, so a swallowed
    // failure looks like a dead button. Tell the user what went wrong instead.
    // The WebView loads the live site (capacitor server.url), so this JS can be
    // newer than the installed binary — a missing-plugin error means an old APK.
    try { await shareFileNative({ blob, fileName: safeName, text }); return "shared"; }
    catch (e) {
      if (isShareCancel(e)) return "cancelled";
      const outdated = /not implemented|plugin/i.test(String(e?.message || e));
      window.alert(outdated
        ? "Sharing needs a newer version of the LedgerFlow app. Please download the latest app from the website (Login page → Download Android app) and install it, then try again."
        : `Could not open the share dialog: ${e?.message || e}`);
      return "error";
    }
  }
  try {
    if (isMobileBrowser()) {
      const r = await shareFileWeb({ blob, fileName: safeName, mimeType, text });
      if (r) return r;
    }
  } catch { /* Web Share unavailable — fall through to download */ }
  downloadFile(blob, safeName);
  return "downloaded";
}
