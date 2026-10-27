/**
 * The web page beside the API: static files from one folder (`UI_DIR`, or the package's `ui/public/`).
 * A path that is no file falls back to `index.html`, so a client-side route reloads; API and health paths never do.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'

const NOT_UI = /^\/(api|healthz)(\/|$)/

/**
 * Mounts the page on `app` after every other route. @param {import('hono').Hono} app @param {string} dir
 * @returns {boolean} false when `dir` has no `index.html` (nothing mounted).
 */
export function serveUi(app, dir) {
  if (!dir || !existsSync(join(dir, 'index.html'))) return false
  const files = serveStatic({ root: dir })
  const index = serveStatic({ root: dir, path: 'index.html' })
  app.get('*', async (c, next) => (NOT_UI.test(c.req.path) ? next() : files(c, next)))
  app.get('*', async (c, next) => (NOT_UI.test(c.req.path) ? next() : index(c, next)))
  return true
}
