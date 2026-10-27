#!/usr/bin/env node
/**
 * The `preset-picker` operator switch (/ops › User Interface, off by default, Lee 13/10/2026) governs
 * every preset chooser this plugin draws: the composer's role chip (Designer / Developer / Writer /
 * SEO/GEO) and the hero seat's Mode / Platform pills. Driven in a real browser against the real
 * `@tracy/core/ui-switches` read of `/api/ui`, answered by this file's server:
 *
 *   - the door unreachable (404): the code default holds — neither chooser is drawn;
 *   - the door lists `preset-picker` as hidden: neither chooser is drawn;
 *   - the door hides nothing (an operator turned it on): both are drawn.
 *
 * The page sits at `/<siteKey>/` so the role chip's own "a site's workspace" rule is met, and
 * `start-cards` is shown in every case, so the switch is the only thing that changes.
 * Harness rules as in `role-menu-check-only.test.mjs`: `playwright` from apps/tracy-host,
 * `react-dom` from @tracy/core, and a missing dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

/** What the fake `/api/ui` door answers: a status and, for 200, the hidden ids. */
let door = { status: 404, hidden: [] }
let outDir
let server
let browser

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tmp-preset-switch-'))
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'preset-switch-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2022'],
    outdir: outDir,
    loader: { '.css': 'css', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty' },
    define: {
      'process.env.NODE_ENV': '"production"',
      __PLATFORM_COUNTS__: JSON.stringify(
        Object.fromEntries(['wordpress', 'joomla', 'emdash'].map((p) => [p, { tools: 1, skills: 1 }]))
      )
    },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  for (const file of built.outputFiles)
    writeFileSync(
      path.join(outDir, path.basename(file.path).replace(/^preset-switch-entry/, 'app')),
      file.text
    )
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><base href="/demo.tracy.test/">' +
      '<link rel="stylesheet" href="/app.css"></head>' +
      '<body><div id="root"></div><script src="/app.js"></script></body></html>'
  )
  server = http.createServer((req, res) => {
    const url = req.url.split('?')[0]
    if (url === '/api/ui') {
      res.writeHead(door.status, { 'content-type': 'application/json' })
      res.end(door.status === 200 ? JSON.stringify({ hidden: door.hidden }) : '{}')
      return
    }
    const name = url.endsWith('/app.js') ? 'app.js' : url.endsWith('/app.css') ? 'app.css' : 'page.html'
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'
    let body = ''
    try {
      body = readFileSync(path.join(outDir, name))
    } catch {
      // No stylesheet emitted: serve an empty one.
    }
    res.writeHead(200, { 'content-type': type })
    res.end(body)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Loads the fixture with the door answering as given, waits for that answer, and counts the choosers. */
async function measure(answer) {
  door = answer
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const read = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/ui', { timeout: 8000 })
  await page.goto(`http://127.0.0.1:${server.address().port}/demo.tracy.test/`)
  await read
  await page
    .waitForFunction(() => document.querySelector('[data-fixture="seat"]') !== null, null, { timeout: 5000 })
    .catch(() => assert.fail(`the fixture did not render: ${errors.join(' | ')}`))
  // One more frame after the door's answer so a subscribed re-render has painted.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const counts = await page.evaluate(() => ({
    seat: document.querySelectorAll('[data-fixture="seat"] .tv-mode-picker').length,
    roleChip: document.querySelectorAll('[data-fixture="role-chip"] .tv-role-chip').length
  }))
  await page.close()
  assert.deepEqual(errors, [], 'the fixture page runs without errors')
  return counts
}

test('the door unreachable: the default (off) holds, no preset chooser is drawn', async () => {
  assert.deepEqual(await measure({ status: 404, hidden: [] }), { seat: 0, roleChip: 0 })
})

test('preset-picker hidden by the operator: no preset chooser is drawn', async () => {
  assert.deepEqual(await measure({ status: 200, hidden: ['preset-picker'] }), { seat: 0, roleChip: 0 })
})

test('preset-picker turned on: both the hero seat and the composer role chip are drawn', async () => {
  assert.deepEqual(await measure({ status: 200, hidden: [] }), { seat: 1, roleChip: 1 })
})
