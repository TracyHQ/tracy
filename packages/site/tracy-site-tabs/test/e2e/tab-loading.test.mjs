/**
 * The site tabs' one loading state, driven in a real browser: a 2px terracotta bar under the tab
 * strip, and no sentence (Akemi, 30/09, option D of the tab-loading options page).
 *
 * The fixture (`../fixtures/tab-loading-entry.tsx`) runs this plugin's real `apply()`, mounts the tab it
 * registers into a box standing in for dsh's tab body, and delays every answer by a number the test
 * sets. Pinned here:
 *
 *   - anti-flash: an answer inside 250 ms never shows the bar; a slow one shows it after 250 ms,
 *     keeps it at least 400 ms, then fades it (150 ms) and removes it;
 *   - every site tab (Team, Site changes, Settings, Publish, Diff) shows ONE bar while it loads, keeps its
 *     header, and shows no "Reading…" words;
 *   - the bar is named for screen readers ("Loading", a progressbar), painted in `--primary`
 *     (terracotta) and sits at the top of the tab body, 2px tall and full width.
 *
 * Harness rules as in tracy-my-sites' e2e test: dependencies resolved from the packages that declare
 * them (`playwright` from apps/tracy-host, `react-dom` from @tracy/core), and a missing dependency or
 * browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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

const SITE = 'demo.tracy.site'
const TABS = {
  team: 'tracy:team',
  changes: 'tracy:changes',
  settings: 'tracy:site-settings',
  publish: 'tracy:site-publish',
  diff: 'tracy:diff'
}

let outDir
let server
let base
let browser
let page

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tst-tab-loading-'))
  const cssFile = path.join(outDir, 'site-tabs.css')
  execFileSync(
    process.execPath,
    [
      path.join(pkgRoot, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
      '--input',
      path.join(pkgRoot, 'src', 'client', 'site-tabs.css'),
      '--output',
      cssFile,
      '--minify'
    ],
    { cwd: pkgRoot, stdio: ['ignore', 'ignore', 'inherit'] }
  )
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'tab-loading-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    loader: { '.css': 'empty' },
    define: {
      __TAILWIND_CSS__: JSON.stringify(readFileSync(cssFile, 'utf8')),
      'process.env.NODE_ENV': '"production"'
    },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
  // `#panel` is dsh's tab body: positioned, fixed size, the plugin's root inside it.
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif}' +
      '#panel{position:relative;box-sizing:border-box;width:600px;height:700px;margin:40px;overflow:auto}' +
      '</style></head><body><div id="panel"></div><script src="/app.js"></script></body></html>'
  )
  server = http.createServer((req, res) => {
    const name = req.url.split('?')[0].endsWith('/app.js') ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/${SITE}/`)
  await page.waitForFunction((n) => Object.keys(window.__tabs ?? {}).length >= n, Object.keys(TABS).length, {
    timeout: 8000
  })
  assert.deepEqual(errors, [], 'the fixture page boots without errors')
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Mount one tab with every answer delayed `delayMs`, and wait `waitMs`. */
async function mount(kind, delayMs, waitMs) {
  const meta = kind === 'diff' ? { siteKey: SITE, path: 'wp-content/themes/x/header.php' } : { siteKey: SITE }
  await page.evaluate(
    ([id, meta, delayMs]) => {
      window.__delayMs = delayMs
      window.__mount(id, meta)
    },
    [TABS[kind], meta, delayMs]
  )
  await page.waitForTimeout(waitMs)
}

const events = () => page.evaluate(() => window.__events)

/** What the tab shows right now: the bar, the words, the header. */
const look = () =>
  page.evaluate(() => {
    const panel = document.getElementById('panel')
    const bars = [...panel.querySelectorAll('[data-tab-loading-bar]')]
    const bar = bars[0] ?? null
    const probe = document.createElement('span')
    probe.style.color = 'var(--primary)'
    panel.append(probe)
    const primary = getComputedStyle(probe).color
    probe.remove()
    const box = bar?.getBoundingClientRect()
    const body = panel.getBoundingClientRect()
    return {
      bars: bars.length,
      role: bar?.getAttribute('role') ?? null,
      label: bar?.getAttribute('aria-label') ?? null,
      paint: bar ? getComputedStyle(bar, '::before').backgroundColor : null,
      primary,
      place: box
        ? { top: box.top - body.top, left: box.left - body.left, width: box.width, height: box.height }
        : null,
      bodyWidth: panel.clientWidth,
      text: panel.innerText,
      // The sticky header the site tabs keep while loading: its site picker button.
      header: panel.querySelector('button')?.textContent ?? null
    }
  })

test('a tab whose data arrives inside 250 ms never shows the bar', async () => {
  // Warm-up mount first: on a busy CI runner the very first mount of the page spends ~150 ms
  // compiling and rendering, which pushed a 120 ms answer past the 250 ms threshold (PR #659).
  // The claim under test is the threshold, not the cold start.
  await mount('changes', 0, 400)
  await mount('changes', 60, 900)
  assert.deepEqual(await events(), [], 'no bar at any moment')
  const now = await look()
  assert.match(now.text, /Edited the header|header\.php/, 'the data is on screen')
})

test('a slow tab shows the bar after 250 ms, keeps it while loading, then fades it out', async () => {
  await mount('changes', 1200, 700)
  const loading = await look()
  assert.equal(loading.bars, 1, 'one bar while loading')
  assert.equal(loading.role, 'progressbar')
  assert.equal(loading.label, 'Loading')
  assert.doesNotMatch(loading.text, /Reading/, 'no loading sentence')
  assert.equal(loading.header, SITE, 'the header (site picker) stays while loading')
  assert.equal(loading.text.trim(), SITE, 'under the header, nothing')
  assert.equal(loading.paint, loading.primary, 'painted in --primary')
  assert.match(loading.primary, /oklch\(0\.565 0\.136 37\.4\)|rgb\(183, 84, 54\)/, '--primary is terracotta')
  assert.deepEqual(
    {
      top: loading.place.top,
      left: loading.place.left,
      height: loading.place.height,
      width: loading.place.width
    },
    { top: 0, left: 0, height: 2, width: loading.bodyWidth },
    'a 2px line across the top of the tab body'
  )
  await page.waitForTimeout(1000)
  const ev = await events()
  assert.deepEqual(
    ev.map((e) => e.what),
    ['in', 'leaving', 'out'],
    `appears, fades, leaves: ${JSON.stringify(ev)}`
  )
  const [shown, leaving, gone] = ev
  assert.ok(shown.at >= 240 && shown.at <= 400, `appears after the 250 ms wait (at ${shown.at} ms)`)
  assert.ok(leaving.at >= 1190, `still there until the data arrives at 1200 ms (fades at ${leaving.at} ms)`)
  assert.ok(
    gone.at - leaving.at >= 140 && gone.at - leaving.at <= 300,
    `fades ~150 ms (${gone.at - leaving.at} ms)`
  )
  assert.match((await look()).text, /Edited the header|header\.php/, 'then the data')
})

test('a bar that appears just before the data still stays 400 ms, so it never blinks', async () => {
  await mount('changes', 320, 1100)
  const ev = await events()
  assert.deepEqual(
    ev.map((e) => e.what),
    ['in', 'leaving', 'out'],
    JSON.stringify(ev)
  )
  const [shown, leaving] = ev
  assert.ok(leaving.at - shown.at >= 390, `shown ${leaving.at - shown.at} ms, at least 400`)
})

test('every site tab shows one bar and no loading words', async () => {
  const failures = []
  for (const kind of Object.keys(TABS)) {
    await mount(kind, 1500, 600)
    const now = await look()
    if (now.bars !== 1) failures.push(`${kind}: ${now.bars} bars`)
    if (/Reading|Preparing/.test(now.text)) failures.push(`${kind}: says ${JSON.stringify(now.text)}`)
    if (now.header !== SITE) failures.push(`${kind}: header ${JSON.stringify(now.header)}`)
    await page.waitForTimeout(1300)
    const after = await look()
    if (after.bars !== 0) failures.push(`${kind}: bar still there after the data`)
    const ev = (await events()).map((e) => e.what).join(',')
    if (ev !== 'in,leaving,out') failures.push(`${kind}: bar life ${ev}`)
  }
  assert.deepEqual(failures, [])
})

test('reduced motion: the bar stops sliding and pulses in place across the full width', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount('team', 1500, 600)
  const still = await page.evaluate(() => {
    const bar = document.querySelector('[data-tab-loading-bar]')
    const cs = getComputedStyle(bar, '::before')
    return { name: cs.animationName, left: cs.left, width: cs.width, barWidth: bar.clientWidth }
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  assert.equal(still.name, 'tv-tab-loading-pulse')
  assert.equal(still.left, '0px')
  assert.equal(still.width, `${still.barWidth}px`)
  await page.waitForTimeout(1300)
})
