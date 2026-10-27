import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// UI-only mockup — no worker, no backend, no deploy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // strictPort: a busy port fails loudly instead of quietly drifting to another port — same rule as
  // apps/web (where the desktop shell points at 5173 and a drifted port is a blank window).
  server: { port: 5199, strictPort: true }
})
