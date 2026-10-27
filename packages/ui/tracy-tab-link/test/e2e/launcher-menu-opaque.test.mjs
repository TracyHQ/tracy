#!/usr/bin/env node
/**
 * The right column's `+` menu (Add site / My Sites / Design templates) is opaque in light and
 * dark (Akemi, 02/10): dsh paints its menus on a translucent, blurred material, and in light the
 * start cards showed through this one.
 *
 * The fixture (`../fixtures/launcher-menu-entry.tsx`) mounts the fork's own `Launcher` over the
 * fork's own token sheets, next to an unrelated dsh menu, with this plugin's
 * `installLauncherMenuOpaque` installed. The test opens each menu and reads the colour its material
 * layer paints, the blur behind it, and the surface's radius and elevation.
 *
 * Same harness rules as `strip-fill-reset.test.mjs`: a missing dependency or browser FAILS.
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
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

/** One React for the launcher, the menu and the fixture: two copies break every hook. */
const reactDir = path.dirname(
  require.resolve('react/package.json', { paths: [path.join(forkClient, 'ui-sidebar-right')] })
)
const reactDomDir = path.dirname(
  require.resolve('react-dom/package.json', {
    paths: [path.join(forkClient, 'ui-sidebar-right'), path.join(forkClient, 'web')]
  })
)

let outDir
let server
let browser
let page

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'ttl-launcher-menu-'))
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'launcher-menu-entry.tsx')],
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
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
    logLevel: 'silent'
  })
  for (const file of built.outputFiles)
    writeFileSync(
      path.join(outDir, path.basename(file.path).replace(/^launcher-menu-entry/, 'app')),
      file.text
    )
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css">' +
      '<style>body{margin:0;font-family:sans-serif}' +
      '#cards{display:grid;grid-template-columns:repeat(4,120px);gap:8px;padding:40px}' +
      '.card{height:80px;background:#d9472b}.card:nth-child(2n){background:#2b6fd9}' +
      '#strip{position:fixed;top:48px;left:48px;display:flex;gap:8px}</style>' +
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
  page = await browser.newPage({ viewport: { width: 900, height: 600 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForSelector('[data-sidebar-right-launcher]', { timeout: 8000 })
  assert.deepEqual(errors, [], 'the fixture page boots without errors')
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Opens a menu by its trigger in the given theme, reads its surface, then closes it. */
async function readMenu(trigger, dark) {
  await page.evaluate((dark) => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
  await page.click(trigger)
  await page.waitForSelector('body > [data-menu-material][role=menu]', { timeout: 5000 })
  const read = await page.evaluate(() => {
    const surface = document.querySelector('body > [data-menu-material][role=menu]')
    const material = surface.querySelector(':scope > div[aria-hidden="true"]')
    const fill = getComputedStyle(material)
    const box = getComputedStyle(surface)
    const rgba = fill.backgroundColor.match(/[\d.]+/g).map(Number)
    return {
      labels: [...surface.querySelectorAll('[role=menuitem]')].map((row) => row.textContent.trim()),
      alpha: rgba.length === 4 ? rgba[3] : 1,
      fill: fill.backgroundColor,
      blur: fill.backdropFilter,
      radius: box.borderTopLeftRadius,
      shadow: box.boxShadow
    }
  })
  await page.keyboard.press('Escape')
  await page.waitForSelector('body > [data-menu-material][role=menu]', { state: 'detached', timeout: 5000 })
  return read
}

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'

  test(`the + menu paints an opaque surface (${theme})`, async () => {
    const menu = await readMenu('[data-sidebar-right-launcher]', dark)
    assert.deepEqual(menu.labels, ['Add site', 'My Sites', 'Design templates'])
    assert.equal(menu.alpha, 1, `the + menu's fill is opaque (got ${menu.fill})`)
    assert.equal(menu.blur, 'none', 'nothing behind an opaque fill needs blurring')
  })

  test(`the rule reaches the + menu only; its radius and elevation stay dsh's (${theme})`, async () => {
    const other = await readMenu('#other', dark)
    const launcher = await readMenu('[data-sidebar-right-launcher]', dark)
    assert.deepEqual(other.labels, ['Rename'])
    assert.ok(other.alpha < 1, `an unrelated dsh menu keeps dsh's translucent material (got ${other.fill})`)
    assert.equal(launcher.radius, other.radius, 'same corner radius as any dsh compact menu')
    assert.equal(launcher.shadow, other.shadow, 'same stroke and elevation as any dsh menu')
  })
}
