import { defineConfig } from 'vite'
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
  const base = mode === 'android' ? '/' : (process.env.BASE_PATH || '/account/')
  const apiTarget = 'http://localhost:5000'
  const basedApiPath = `${base.replace(/\/+$/, '')}/api` // e.g. /account/api

  return {
    base,
    plugins: [react()],
    server: {
      proxy: {
        // Match production: the app calls `${base}api`, proxied to the backend.
        [basedApiPath]: apiTarget,
        // Bare "/api" fallback (root base, or direct calls).
        '/api': apiTarget,
      },
    },
  }
})
