import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The public Design inspiration page (ADR 0011). Served by cowork-web's static assets under
 * `/design-inspiration/`, so every URL the build emits is rooted there; the 152 systems' files are
 * copied into `public/systems/` by `scripts/build-assets.mjs` before Vite runs and travel as-is.
 *
 * Dev: `pnpm --filter @tracy/design-page dev` — the Worker's doors (`api/read`, `api/brand/*`) are
 * proxied to a running cowork-web when `VITE_API_UPSTREAM` is set; without it the read door answers
 * from a small in-process stand-in so the page can be looked at offline.
 */
const API_UPSTREAM = process.env.VITE_API_UPSTREAM?.trim() || null

export default defineConfig({
  base: '/design-inspiration/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5178,
    proxy: API_UPSTREAM ? { '/design-inspiration/api': { target: API_UPSTREAM, changeOrigin: true } } : {}
  },
  build: { outDir: 'dist', assetsDir: 'cw-assets', emptyOutDir: true }
})
