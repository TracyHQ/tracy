import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The sign-in-free Find page. tracy-web serves `dist` under `/find/` (`public/wo-find-page.js`), so
 * every URL the build emits is rooted there; its doors are `/find/api/*`.
 *
 * Dev: `pnpm --filter @tracy/wo-find-page dev`, with `VITE_API_UPSTREAM` pointing at a running
 * tracy-web for the doors.
 */
const API_UPSTREAM = process.env.VITE_API_UPSTREAM?.trim() || null

export default defineConfig({
  base: '/find/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5179,
    proxy: API_UPSTREAM ? { '/find/api': { target: API_UPSTREAM, changeOrigin: true } } : {}
  },
  build: { outDir: 'dist', assetsDir: 'find-assets', emptyOutDir: true }
})
