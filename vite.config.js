import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The deployment base path is env-driven so the SAME source runs under "/",
// "/account/", "/school/", … without code changes:
//
//   • Web (default):   base = process.env.BASE_PATH || "/account/"
//                      e.g.  BASE_PATH=/school/ npm run build
//   • Android (Capacitor) is served from the device root, so `--mode android`
//     forces base = "/".
//
// Whatever base is chosen is exposed to the app at runtime as
// import.meta.env.BASE_URL, which src/config.js uses to derive both the router
// basename and the API base URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = mode === 'android' ? '/' : (process.env.BASE_PATH || '/account/')
  // Where the dev proxy forwards `${base}api/...`. Defaults to the backend's
  // canonical port 5000; override with DEV_API_TARGET (see .env.local) when that
  // host port is taken locally — e.g. a Docker container already binding 5000.
  const apiTarget = env.DEV_API_TARGET || 'http://localhost:5000'
  const basePrefix = base.replace(/\/+$/, '') // "" for root, "/account" otherwise
  const basedApiPath = `${basePrefix}/api`    // e.g. /account/api

  return {
    base,
    plugins: [react()],
    server: {
      proxy: {
        // The app calls `${base}api/...` (e.g. /account/api/auth/login). Strip the
        // base prefix before forwarding so it reaches the backend as /api/... —
        // this mirrors what nginx does in production (proxy_pass .../api/).
        [basedApiPath]: {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(new RegExp(`^${basePrefix}`), ''),
        },
        // Bare "/api" fallback (root base, or direct calls).
        '/api': apiTarget,
      },
    },
  }
})
