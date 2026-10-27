/**
 * The Comments tab, layout B (Akemi 01/10/2026; cards since redesign A, L1), driven in a real browser: a
 * folded page card opens on a click and folds again; "Start commenting" asks for Edit mode — from the
 * bottom row, and from the empty block.
 *
 * Seam: the real CommentsView and its bottom row (CommentsView.tsx) mounted with react-dom in system
 * Chrome, their state's two Browser verbs (`openPage`, `startCommenting`) recorded on the page. Harness
 * rules as in `hero-placeholder.test.mjs`: `playwright` from apps/tracy-host, system Chrome, and a
 * missing dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
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

const ORIGIN = 'https://kineticakemi.tracy.site'
const AKEMI = { accountId: 'a1', email: 'akemi@example.com', name: 'Akemi', initial: 'A' }
let seq = 0
const comment = (url) => ({
  id: `c${++seq}`,
  url,
  text: `note ${seq}`,
  status: 'pending',
  createdAt: Date.now() - seq * 60_000,
  element: { url, selector: `p:nth-of-type(${seq})`, text: `words ${seq}`, tag: 'p' },
  author: AKEMI,
  can: { edit: true, delete: true }
})
const list = (comments) => ({
  sessionId: 's1',
  tabId: 'tab1',
  siteKey: 'kineticakemi.tracy.site',
  host: 'kineticakemi.tracy.site',
  active: true,
  url: `${ORIGIN}/`,
  comments
})
const SITE = [comment(`${ORIGIN}/`), comment(`${ORIGIN}/pricing/`), comment(`${ORIGIN}/pricing/`)]

let outDir = ''
let script = ''
let browser

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-by-page-e2e-'))
  const outfile = path.join(outDir, 'page.js')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { createRoot } from 'react-dom/client'
        import { createCommentsState, makeCommentsFooter, makeCommentsView } from './CommentsView'
        import { CSS } from './styles'
        window.mount = (list) => {
          window.calls = { open: [], start: 0 }
          const state = createCommentsState({
            storage: null,
            target: null,
            openPage: (url) => window.calls.open.push(url),
            startCommenting: () => { window.calls.start += 1 }
          })
          state.lists.accept(list)
          state.lists.focus('s1')
          state.setFilter('all')
          const style = document.createElement('style')
          style.textContent = CSS
          document.head.appendChild(style)
          createRoot(document.getElementById('view')).render(createElement(makeCommentsView(state), {}))
          createRoot(document.getElementById('seat')).render(createElement(makeCommentsFooter(state), {}))
        }`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    nodePaths: [path.join(corePkg, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  script = outfile
  // System Chrome on a dev machine; the bundled Chromium on CI runners, which have no Chrome.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

async function open(comments) {
  const page = await browser.newPage({ viewport: { width: 420, height: 700 } })
  await page.setContent('<!doctype html><html><body><div id="view"></div><div id="seat"></div></body></html>')
  await page.addScriptTag({ path: script })
  await page.evaluate((l) => window.mount(l), list(comments))
  await page.waitForSelector('[data-tracy-comments]')
  return page
}

test('a folded page opens on a click and folds again; the current page starts open', async () => {
  const page = await open(SITE)
  const toggles = page.locator('button.tv-cv-card-head')
  assert.equal(await toggles.count(), 2)
  assert.equal(await toggles.nth(0).getAttribute('aria-expanded'), 'true')
  assert.equal(await toggles.nth(1).getAttribute('aria-expanded'), 'false')
  assert.equal(await page.locator('[data-comment]').count(), 1)
  await toggles.nth(1).click()
  assert.equal(await toggles.nth(1).getAttribute('aria-expanded'), 'true')
  assert.equal(await page.locator('[data-comment]').count(), 3)
  await toggles.nth(1).click()
  assert.equal(await page.locator('[data-comment]').count(), 1)
  await page.close()
})

test('"Start commenting" asks for Edit mode — the bottom row, and the empty block', async () => {
  const page = await open(SITE)
  await page.locator('[data-tracy-comments-footer] [data-tracy-start-commenting]').click()
  assert.equal(await page.evaluate(() => window.calls.start), 1)
  await page.close()
  const empty = await open([])
  assert.equal(await empty.locator('[data-tracy-comments-footer]').count(), 0, 'no bottom row while empty')
  await empty.locator('[data-tracy-empty] [data-tracy-start-commenting]').click()
  assert.equal(await empty.evaluate(() => window.calls.start), 1)
  await empty.close()
})
