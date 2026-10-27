/**
 * Settings › Connected apps: the account-level apps connected through the device flow
 * (`/api/me/connected-apps`), each with what it may do and a Disconnect button; an empty line when
 * there are none. Bundled with esbuild the same way `notifications-section.test.mjs` is.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(here, '..', 'src', 'client')
const coreModules = path.resolve(here, '..', '..', '..', 'core', 'tracy-core', 'node_modules')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'ts-connected-apps-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { ConnectedAppsList, withoutApp } from './connected-apps-section'
        import { en } from './strings'
        const t = (key, params) => (en[key] ?? key).replace(/\\{(\\w+)\\}/g, (_, k) => String(params?.[k] ?? ''))
        export { withoutApp }
        export function list(apps, failed = false) {
          return renderToStaticMarkup(createElement(ConnectedAppsList, { t, apps, failed, onDisconnect: () => {} }))
        }
      `,
      resolveDir: clientDir,
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    nodePaths: [coreModules],
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const WO = {
  id: 'g'.repeat(43),
  clientId: 'website-opportunities',
  name: 'Website Opportunities',
  scopes: ['demos'],
  createdAt: '2026-10-24T10:00:00.000Z',
  lastUsedAt: null,
  expiresAt: '2026-11-23T10:00:00.000Z'
}

test('each connected app is named with what it may do and a Disconnect button', () => {
  const html = lib.list([WO])
  assert.match(html, /data-connected-app="website-opportunities"/)
  assert.match(html, />Website Opportunities</)
  assert.match(html, />Create demo sites</)
  assert.match(html, /<button[^>]*>Disconnect<\/button>/)
})

test('no apps says so, and a failed load says so instead of an empty list', () => {
  assert.match(lib.list([]), />No apps are connected to your account\.</)
  assert.match(lib.list(null, true), /role="alert"[^>]*>Connected apps could not be loaded/)
})

test('a disconnected app leaves the list at once', () => {
  assert.deepEqual(
    lib.withoutApp([WO, { ...WO, id: 'h'.repeat(43) }], WO.id).map((a) => a.id),
    ['h'.repeat(43)]
  )
})
