import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

import { defineConfig, type ProxyOptions } from 'vite'

/**
 * The harness surface used to be served by `workers/harness` from `dist/`, at the root of
 * harness.tracy.ai — not under a prefix like cowork's `/cw-assets/`, because nothing else lived
 * on that hostname to collide with.
 *
 * Plan 4 Task 2 moves it into `tracy-web`, at `/ops` — a path on an origin that ALSO serves
 * `/api/sites`, `/login`, the customer bar, and (Task 3) `/design-inspiration`. `base: '/ops/'`
 * is the one change that move needs here: every asset URL the build emits (script src, css href)
 * is now written relative to `/ops/` instead of `/`, matching where
 * `apps/tracy-web/Dockerfile` COPYs this `dist/` to (`/opt/tracy-web/static/ops`) and where
 * `apps/tracy-web/src/ops/route.js` serves it from.
 */
/**
 * ONE ENTRY AGAIN (19/09). `/ops/cms` arrived as a second html entry so the task that added it could
 * leave `/ops` untouched; that constraint is gone and `src/App.tsx` routes both areas. The cms area is
 * `lazy()`-loaded from there, so it is still its own chunk — `/ops` does not download it until a cms
 * screen is opened — without a second entry to keep in step.
 */
/**
 * `pnpm --filter @tracy/harness-web dev` serves only this bundle — the doors it reads (`/api/ops/*`,
 * `/auth/*`) belong to `tracy-web`. Without the proxy below, every one of them 404s and the page
 * paints as if the viewer were nobody and the build had published no environments: a surface that
 * LOOKS like a bug in this code. `TRACY_DEV_API` points at whatever origin is answering locally
 * (the compose stand's `tracy-web`, `http://tracy.test:8080` by default).
 *
 * 🔒 THE HOST MATTERS, NOT JUST THE PORT. The session cookie is scoped to `SESSION_DOMAIN`
 * (`tracy.test`), and a cookie's domain ignores the port — so a browser at `tracy.test:5200` sends
 * the session it got at `tracy.test:8080`, and `localhost:5200` sends nothing at all. Open the dev
 * server by name, not on loopback, or the footer will be empty for a reason that is not this code.
 */
const DEV_API = process.env.TRACY_DEV_API ?? 'http://tracy.test:8080'
/**
 * What the backend calls ITSELF — `TRACY_ORIGIN` over there, which its write doors compare every
 * `Origin` header against. Usually the same as where we send the request, but not always: a
 * backend run by hand on a spare port still declares the origin the deployment really answers on.
 */
const DEV_ORIGIN = process.env.TRACY_DEV_ORIGIN ?? DEV_API

/**
 * How the dev server forwards a door to the backend.
 *
 * 🔒 IT REWRITES `Origin` TO THE BACKEND'S OWN. Every write door on `/ops` refuses a request whose
 * `Origin` is not `config.origin`, and from here the browser sends `http://tracy.test:5200`, which
 * is not it. The refusal is `403` with an EMPTY body, so it read as a silent no-op — measured
 * 22/09, a bulk teardown reported success and changed nothing. Only the dev server needs this: a
 * real deployment serves the SPA from the same origin as the doors.
 */
const devDoor: ProxyOptions = {
  target: DEV_API,
  changeOrigin: false,
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.setHeader('origin', DEV_ORIGIN)
    })
  }
}

export default defineConfig({
  base: '/ops/',
  plugins: [react(), tailwindcss()],
  server: {
    host: 'tracy.test',
    proxy: {
      '/api': devDoor,
      '/auth': devDoor,
      '/login': devDoor
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, 'index.html') }
    }
  }
})
