#!/usr/bin/env node
/**
 * The role menu on the composer (Designer / Developer / Writer / SEO/GEO) marks its choice with the
 * check mark only, driven in a real browser in light and dark (Akemi, 02/10).
 *
 * The chosen row used to carry a tint as well as the check mark, and the tint's fallback is the hover
 * tint, so the choice read like the hovered row. The rule the Site changes filter already follows:
 * the check mark says "chosen", a background says "the pointer is here". Pinned here, in both themes:
 *
 *   - every row is a menuitemradio; only the chosen row is aria-checked="true";
 *   - only the chosen row shows the check mark;
 *   - the chosen row's background equals an unchosen, unhovered row's;
 *   - hovering a row still tints it (background stays the hover signal);
 *   - picking another row moves the mark there.
 *
 * The fixture (`../fixtures/role-menu-entry.tsx`) renders this plugin's own `PickerButton` with its
 * own stylesheet over the fork's real token sheet. Harness rules as in tracy-site-tabs'
 * `changes-filter-menu.test.mjs`: `playwright` from apps/tracy-host, `react-dom` from @tracy/core,
 * and a missing dependency or browser FAILS instead of skipping.
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

let outDir
let server
let browser
let page

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tmp-role-menu-'))
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'role-menu-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2022'],
    outdir: outDir,
    loader: { '.css': 'css', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"', __PLATFORM_COUNTS__: '{}' },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  for (const file of built.outputFiles)
    writeFileSync(path.join(outDir, path.basename(file.path).replace(/^role-menu-entry/, 'app')), file.text)
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css">' +
      '<style>body{margin:0;font-family:sans-serif}#root{position:fixed;left:40px;bottom:40px}</style>' +
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
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForSelector('.tv-role-chip', { timeout: 8000 })
  assert.deepEqual(errors, [], 'the fixture page boots without errors')
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Opens the menu in the given theme with the pointer parked away from it, and reads its rows. */
async function openMenu(dark) {
  await page.mouse.move(1, 1)
  await page.evaluate((dark) => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
  if ((await page.$('.tv-menu')) === null) await page.click('.tv-role-chip')
  await page.waitForSelector('.tv-menu .tv-menu-item', { timeout: 5000 })
  await page.mouse.move(1, 1)
  return readRows()
}

function readRows() {
  return page.evaluate(() =>
    [...document.querySelectorAll('.tv-menu .tv-menu-item')].map((row) => ({
      text: row.querySelector('.tv-menu-item-name')?.textContent ?? '',
      role: row.getAttribute('role'),
      checked: row.getAttribute('aria-checked'),
      check: row.querySelector('.tv-menu-item-check') !== null,
      background: getComputedStyle(row).backgroundColor
    }))
  )
}

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'

  test(`the chosen role carries the check mark and aria-checked, not a tint (${theme})`, async () => {
    const rows = await openMenu(dark)
    assert.deepEqual(
      rows.map((r) => r.text),
      ['Designer', 'Developer', 'Writer', 'SEO/GEO']
    )
    const [chosen, ...others] = rows
    assert.equal(chosen.background, others[0].background, 'the chosen row has no tint of its own')
    assert.equal(chosen.role, 'menuitemradio', 'the chosen row is a menuitemradio')
    assert.equal(chosen.checked, 'true', 'the chosen row is aria-checked="true"')
    assert.equal(chosen.check, true, 'the chosen row shows the check mark')
    for (const r of others) {
      assert.equal(r.role, 'menuitemradio', `${r.text}: a menuitemradio`)
      assert.equal(r.checked, 'false', `${r.text}: aria-checked="false"`)
      assert.equal(r.check, false, `${r.text}: no check mark`)
      assert.equal(
        r.background,
        others[0].background,
        `${r.text}: same background as the other unchosen rows`
      )
    }
  })

  test(`hovering a row still tints it (${theme})`, async () => {
    const [, idle] = await openMenu(dark)
    const box = await (await page.$$('.tv-menu .tv-menu-item'))[1].boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const hovered = await page.evaluate(
      () => getComputedStyle(document.querySelectorAll('.tv-menu .tv-menu-item')[1]).backgroundColor
    )
    assert.notEqual(hovered, idle.background, 'the hovered row is tinted')
    await page.mouse.move(1, 1)
  })

  test(`picking another role moves the check mark there (${theme})`, async () => {
    await openMenu(dark)
    await page.click('.tv-menu .tv-menu-item:nth-child(2)')
    await page.waitForSelector('.tv-menu', { state: 'detached', timeout: 5000 })
    const rows = await openMenu(dark)
    assert.deepEqual(
      rows.map((r) => [r.text, r.checked, r.check]),
      [
        ['Designer', 'false', false],
        ['Developer', 'true', true],
        ['Writer', 'false', false],
        ['SEO/GEO', 'false', false]
      ]
    )
    await page.click('.tv-menu .tv-menu-item:nth-child(1)')
    await page.waitForSelector('.tv-menu', { state: 'detached', timeout: 5000 })
  })
}
