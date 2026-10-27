#!/usr/bin/env node
/**
 * A double-click on the empty gap of the right panel's tab strip puts the panel back at its default
 * width (beside a 300px conversation since the fork's tracy.48) — the same reset a double-click on
 * the divider does (Akemi, 30/09: the divider
 * is an 8px handle nobody finds; the strip gap is big and obvious).
 *
 * The fixture (`../fixtures/strip-fill-reset-entry.tsx`) mounts dsh's real frame (`ui-layout`
 * `AppFrame` and its store) with dockkit's real `DockSurface` in the right panel, and installs this
 * plugin's `installStripFillReset`. The test drags the divider to a custom width, then
 * double-clicks a tab, a chrome control, and the strip gap, and reads the panel's width each time.
 *
 * It also reads the three markers the reset relies on from the fork's SHIPPED client code, so a
 * rename upstream fails here instead of silently turning the gesture off.
 *
 * Same harness rules as tracy-my-sites' e2e tests: a missing dependency or browser FAILS (no skip).
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
const forkClient = path.join(repoRoot, 'vendor/tracy/deepseek-harness/packages/client')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwrightPath = require.resolve('playwright', { paths: [hostPkg] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

/** One React for the frame, the dock and the fixture: two copies break every hook. */
const reactDir = path.dirname(
  require.resolve('react/package.json', { paths: [path.join(forkClient, 'ui-layout')] })
)
const reactDomDir = path.dirname(
  require.resolve('react-dom/package.json', {
    paths: [path.join(forkClient, 'ui-dockkit'), path.join(forkClient, 'web')]
  })
)

const VIEWPORT = { width: 1600, height: 900 }
/**
 * My Sites' width (`LIST_PANEL_WIDTH`), passed as the tab's preferred width. Since the fork's
 * `0.2.0-rc.2-tracy.48` the frame records it but opens every tab beside a 300px conversation, so
 * the width the reset restores is that default, not this number.
 */
const DECLARED = 720
/** The fork's default conversation width beside a right panel tab (`ui-layout` chat-width.ts). */
const CHAT_DEFAULT = 300

let outDir
let server
let base
let browser

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'ttl-strip-reset-'))
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'strip-fill-reset-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2022'],
    outdir: outDir,
    loader: {
      '.module.css': 'local-css',
      '.css': 'css',
      '.svg': 'dataurl',
      '.woff': 'empty',
      '.woff2': 'empty',
      '.ttf': 'empty',
      '.eot': 'empty',
      '.png': 'empty'
    },
    alias: { react: reactDir, 'react-dom': reactDomDir },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.DSH_CLIENT_TITLE': '"Tracy"' },
    write: false,
    logLevel: 'silent'
  })
  for (const file of built.outputFiles)
    writeFileSync(
      path.join(outDir, path.basename(file.path).replace(/^strip-fill-reset-entry/, 'app')),
      file.text
    )
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css">' +
      "<style>html,body,#root{margin:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}</style>" +
      '</head><body><div id="root"></div><script src="/app.js"></script></body></html>'
  )
  server = http.createServer((req, res) => {
    const url = req.url.split('?')[0]
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
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** The right panel's width, after the frame has settled. */
async function panelWidth(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
  // The frame eases a width change; wait until two reads a frame apart agree.
  return page.evaluate(async () => {
    const read = () => document.querySelector('[data-sidebar-right-panel]').getBoundingClientRect().width
    let last = -1
    for (let i = 0; i < 120; i += 1) {
      const now = read()
      if (Math.abs(now - last) < 0.5) return Math.round(now)
      last = now
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
    return Math.round(read())
  })
}

/** The text a double-click left selected, if any. */
function selected(page) {
  return page.evaluate(() => String(window.getSelection()))
}

/** Double-click the centre of an element. */
async function dblclickAt(page, selector) {
  const box = await page.locator(selector).first().boundingBox()
  assert.ok(box, `${selector} is on screen`)
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
}

/**
 * Double-click the strip gap where a person does: across the fill's run, at the strip's middle.
 * dockkit's fill is a zero-height flex item (the strip centres its items), so the element under
 * the pointer there is the strip row itself; the test asserts that before clicking.
 */
async function dblclickGap(page) {
  const point = await page.evaluate(() => {
    const fill = document.querySelector('[data-sidebar-right-panel] [data-dockkit-strip-fill]')
    const strip = fill.closest('[data-dockkit-strip]')
    const f = fill.getBoundingClientRect()
    const s = strip.getBoundingClientRect()
    const x = f.left + f.width / 2
    const y = s.top + s.height / 2
    const hit = document.elementFromPoint(x, y)
    return { x, y, hit: hit === strip || hit === fill }
  })
  assert.ok(point.hit, 'the gap hits the strip row or its fill, nothing drawn on top')
  await page.mouse.dblclick(point.x, point.y)
}

test('the three markers the reset relies on are still in the shipped dsh client', () => {
  const dock = readFileSync(path.join(forkClient, 'ui-dockkit/lib/index.js'), 'utf8')
  const shell = readFileSync(path.join(forkClient, 'ui-sidebar-right/lib/client.js'), 'utf8')
  const frame = readFileSync(path.join(forkClient, 'ui-layout/lib/client.js'), 'utf8')
  assert.match(dock, /data-dockkit-strip-fill/, 'dockkit marks the strip gap')
  assert.match(dock, /"data-dockkit-strip"/, 'dockkit marks the strip row')
  assert.match(shell, /data-sidebar-right-panel/, 'the right-panel shell marks its panel')
  assert.match(frame, /"data-side"/, 'the frame marks its divider with its side')
  assert.match(frame, /onDoubleClick/, 'the divider resets on a double-click')
})

test('a double-click on the strip gap restores the default width; tabs and chrome do not', async () => {
  const page = await browser.newPage({ viewport: VIEWPORT })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/`)
  await page.waitForFunction(() => window.__harness?.ready === true, null, { timeout: 8000 })
  await page.evaluate((w) => window.__harness.open(w), DECLARED)
  await page.waitForSelector('[data-sidebar-right-panel] [data-dockkit-strip-fill]', {
    state: 'attached',
    timeout: 8000
  })
  const opened = await panelWidth(page)
  assert.ok(
    opened > DECLARED,
    `the panel takes the room beside a ${CHAT_DEFAULT}px conversation (${opened}px)`
  )
  assert.equal(await page.evaluate(() => window.__harness.chat()), null, 'no dragged width yet')

  // Drag the divider 200px to the right: the panel narrows to a custom width.
  const divider = await page.locator('[role="separator"][data-side="rightbar"]').boundingBox()
  assert.ok(divider, 'the divider is on screen')
  const x = divider.x + divider.width / 2
  const y = divider.y + divider.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(x + step * 20, y)
  await page.mouse.up()
  const dragged = await panelWidth(page)
  assert.ok(dragged < opened - 150, `the drag narrowed the panel (${dragged}px)`)
  assert.notEqual(await page.evaluate(() => window.__harness.chat()), null, 'the frame holds a dragged width')

  // A double-click on a tab or on a chrome control is not the gap: the width stays.
  await dblclickAt(page, '[data-sidebar-right-panel] [data-dockkit-tab]')
  assert.equal(await panelWidth(page), dragged, 'a tab double-click keeps the dragged width')
  await dblclickAt(page, '[data-testid="chrome-fullscreen"]')
  assert.equal(await panelWidth(page), dragged, 'a chrome double-click keeps the dragged width')
  await page.evaluate(() => window.getSelection()?.removeAllRanges())

  // The gap: back to the default width, nothing selected, the dragged width forgotten.
  await dblclickGap(page)
  assert.equal(await panelWidth(page), opened, 'a gap double-click restores the default width')
  assert.equal(await page.evaluate(() => window.__harness.chat()), null, 'the dragged width is forgotten')
  assert.equal(await selected(page), '', 'a gap double-click selects no text')

  assert.deepEqual(errors, [], 'no uncaught errors in the page')
  await page.close()
})
