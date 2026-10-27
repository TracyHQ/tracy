/**
 * Site changes keeps its header in place while the list loads (Akemi, 14/10/2026).
 *
 * In a wide panel the Site changes card is vertically centred (site-tabs-rules.css). Its loading
 * state used to be the header alone: centred, it sat mid-panel (y ~515 on a stand) for the ~1 s of
 * the first read, then jumped to the top when a list taller than the panel arrived. Now a first open
 * (height unknown) shows no card at all, only a quiet spinner in the middle of the panel, and draws
 * the card once, at its place, with the data; a later open draws placeholder rows at the height the
 * list had last time, so the centred card keeps its place. Either way, on every frame the header
 * is either absent or at its final position, long list or short.
 *
 * Same harness and fixture as `tab-loading.test.mjs` (`../fixtures/tab-loading-entry.tsx`), with a
 * 1100 x 900 tab body (past the 1008px threshold of the wide card) and a 30-event list.
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
const CHANGES_TAB = 'tracy:changes'

let outDir
let server
let base
let browser
let page

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tst-changes-place-'))
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
      '#panel{position:relative;box-sizing:border-box;width:1100px;height:900px;margin:40px;overflow:auto}' +
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
  page = await browser.newPage({ viewport: { width: 1300, height: 1100 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/${SITE}/`)
  await page.waitForFunction((n) => Object.keys(window.__tabs ?? {}).length >= n, 1, {
    timeout: 8000
  })
  assert.deepEqual(errors, [], 'the fixture page boots without errors')
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/**
 * Mount Site changes with `items` events answered after `delayMs` and log every frame: the header's
 * top (null while there is no header), which loading state shows, and whether the list is in.
 */
async function mountAndTrack(items, delayMs, waitMs) {
  await page.evaluate(
    ([id, site, items, delayMs]) => {
      window.__activityItems = items
      window.__delayMs = delayMs
      window.__frames = []
      window.__mount(id, { siteKey: site })
      const panel = document.getElementById('panel')
      const started = performance.now()
      const step = () => {
        const first = panel.querySelector('.tv-site-tabs-frame > :first-child')
        const head = first && !first.hasAttribute('data-changes-loading') ? first : null
        const loading =
          panel.querySelector('[data-changes-loading]')?.getAttribute('data-changes-loading') ?? false
        const loaded = panel.querySelector('[data-site-changes-v2]') !== null
        if (first) {
          window.__frames.push({
            at: Math.round(performance.now() - started),
            top: head
              ? Math.round(head.getBoundingClientRect().top - panel.getBoundingClientRect().top)
              : null,
            loading,
            loaded
          })
        }
        if (performance.now() - started < delayMs + 800) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    [CHANGES_TAB, SITE, items, delayMs]
  )
  await page.waitForTimeout(waitMs)
  return page.evaluate(() => window.__frames)
}

/** A fresh page: nothing remembered about any list, so the next mount is a first open. */
async function freshPage() {
  await page.goto(`${base}/${SITE}/`)
  await page.waitForFunction(() => Object.keys(window.__tabs ?? {}).length >= 1, null, { timeout: 8000 })
}

/** The first open's frames: spinner only until the data, then the header at one place. */
function assertFirstOpen(frames, what) {
  const waiting = frames.filter((f) => f.loading === 'none')
  const loaded = frames.filter((f) => f.loaded)
  assert.ok(waiting.length > 10, `${what}: frames with the spinner only: ${waiting.length}`)
  assert.ok(loaded.length > 5, `${what}: frames after the list arrived: ${loaded.length}`)
  assert.ok(
    waiting.every((f) => f.top === null),
    `${what}: no header while the spinner shows`
  )
  const tops = [...new Set(frames.filter((f) => f.top !== null).map((f) => f.top))]
  assert.deepEqual(
    tops,
    [loaded[0].top],
    `${what}: the header's top on every frame it shows: ${JSON.stringify(tops)}`
  )
  return loaded[0].top
}

test('first open, long list: a spinner only, then the card once at the top', async () => {
  await freshPage()
  const top = assertFirstOpen(await mountAndTrack(30, 1200, 2300), 'long list')
  assert.ok(top <= 24, `the loaded card starts at the top of the panel (top ${top})`)
})

test('first open, short list: a spinner only, then the page once at the top', async () => {
  await freshPage()
  const top = assertFirstOpen(await mountAndTrack(1, 1200, 2300), 'short list')
  assert.ok(top <= 24, `the short page starts at the top of the panel, not centred (top ${top})`)
})

test('the first open spinner is quiet: muted, centred across, no words, busy, hidden from screen readers', async () => {
  await freshPage()
  await mountAndTrack(1, 1500, 600)
  const look = await page.evaluate(() => {
    const panel = document.getElementById('panel').getBoundingClientRect()
    const box = document.querySelector('[data-changes-loading="none"]')
    const icon = box?.querySelector('.tv-changes-waiting-spinner')
    const r = icon?.getBoundingClientRect()
    return {
      text: box?.textContent ?? null,
      busy: box?.getAttribute('aria-busy') ?? null,
      hidden: icon?.getAttribute('aria-hidden') ?? null,
      opacity: icon ? getComputedStyle(icon).opacity : null,
      dx: r ? Math.round(r.left + r.width / 2 - (panel.left + panel.width / 2)) : null,
      // Site changes is a top-aligned page (24/10/2026): the spinner sits in the upper part, not the middle.
      dy: r ? Math.round(r.top + r.height / 2 - panel.top) : null,
      card: getComputedStyle(box).backgroundColor,
      // The tab's loading bar is the frame's second child here: it must stay a 2px line, not a card body.
      bar: Math.round(document.querySelector('.tv-tab-loading-bar')?.getBoundingClientRect().height ?? -1)
    }
  })
  await page.waitForTimeout(1400)
  assert.deepEqual(
    {
      text: look.text,
      busy: look.busy,
      hidden: look.hidden,
      opacity: look.opacity,
      card: look.card,
      bar: look.bar
    },
    { text: '', busy: 'true', hidden: 'true', opacity: '1', card: 'rgba(0, 0, 0, 0)', bar: 2 }
  )
  assert.ok(Math.abs(look.dx) <= 2, `centred across the panel (off by ${look.dx}px)`)
  assert.ok(look.dy >= 0 && look.dy <= 160, `in the upper part of the panel (${look.dy}px from its top)`)
})

test('a list opened again: placeholder rows at its last height, header at one place, no words', async () => {
  for (const items of [30, 1]) {
    await freshPage()
    await mountAndTrack(items, 200, 800)
    const frames = await mountAndTrack(items, 1200, 2300)
    const loading = frames.filter((f) => f.loading)
    const loaded = frames.filter((f) => f.loaded)
    assert.ok(
      loading.length > 10 && loading.every((f) => f.loading === 'sized'),
      `${items}: placeholder rows at the known height`
    )
    const tops = [...new Set(frames.map((f) => f.top))]
    assert.deepEqual(
      tops,
      [loaded[0].top],
      `${items}: the header's top on every frame: ${JSON.stringify(tops)}`
    )
  }
  await mountAndTrack(1, 1200, 400)
  const during = await page.evaluate(() => {
    const box = document.querySelector('[data-changes-loading]')
    return { text: box?.textContent ?? null, hidden: box?.getAttribute('aria-hidden') ?? null }
  })
  assert.deepEqual(during, { text: '', hidden: 'true' }, 'grey bars only, hidden from screen readers')
  await page.waitForTimeout(1600)
  assert.equal(
    await page.evaluate(() => document.querySelector('[data-changes-loading]')),
    null,
    'gone after load'
  )
})
