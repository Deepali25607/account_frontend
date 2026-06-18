import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API requests are proxied to the Express backend during dev.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
