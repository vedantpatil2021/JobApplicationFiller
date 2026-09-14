import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readToken(): string {
  // Same repo-root profile/ the server uses (see @jaf/server resolveDataDir).
  const p = resolve(__dirname, '../../profile/.token')
  try { return readFileSync(p, 'utf8').trim() }
  catch { console.warn(`[jaf] no token at ${p} — start @jaf/server first`); return '' }
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4321',
        changeOrigin: false,
        configure(proxy) {
          // The browser never holds the token; the dev server adds it here.
          proxy.on('proxyReq', req => req.setHeader('X-JAF-Token', readToken()))
        },
      },
    },
  },
})
