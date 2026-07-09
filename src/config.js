// Single source of truth for the app's deployment base path.
//
// Vite injects `import.meta.env.BASE_URL` at build time — it always equals the
// `base` from vite.config.js and always has a leading & trailing slash
// (e.g. "/", "/account/", "/school/"). Everything path-related derives from it,
// so the app can be deployed under ANY base path without editing source.

const rawBase = import.meta.env.BASE_URL || "/";

// React Router's `basename` wants NO trailing slash ("" for the root).
export const BASENAME = rawBase.replace(/\/+$/, "");

// The API lives behind the same base path — nginx proxies `${base}api` → backend
// (for "/account/" that is `/account/api`). An explicit VITE_API_URL always wins
// (used by the Android APK and any cross-origin build); otherwise we stay
// same-origin and base-path-relative.
const explicitApi = import.meta.env.VITE_API_URL?.replace(/\/+$/, "");
export const API_BASE_URL = explicitApi ? `${explicitApi}/api` : `${BASENAME}/api`;

// Resolve a static file in the public/ folder against the deployment base path,
// e.g. asset("LedgerFlow-1.1.0.apk") → "/account/LedgerFlow-1.1.0.apk". Use this
// for plain <a href>/<img src> to files that Vite copies verbatim from public/
// (React Router links don't need it — they prepend the basename themselves).
export const asset = (path) => rawBase + String(path).replace(/^\/+/, "");
