/**
 * The Site changes tab follows the site without a reload (Brian's report 03/10, evidence
 * `tasks/evidence/bug-0310-leemood/issue3/`): the row of a turn the agent just answered used to show
 * only after F5, because the tab read its list once, when it mounted.
 *
 * Pinned here, each a failure that would otherwise be silent:
 *   - a turn ending in the conversation on screen (the `turn/end` the Browser tab's reload already
 *     follows) re-reads the list and shows the new row;
 *   - while that read is out the rows on screen stay (no blank pane), an opened row stays open, the
 *     scroll position holds, the Source picked is the one asked again, and the pages "Show more"
 *     read are not dropped;
 *   - the pane shown again (the side card's tab picked again, the browser tab back in front) re-reads;
 *   - two signals at once make ONE request.
 *
 * Harness as in `changes-v2.test.mjs` (same fixture page): `playwright` from apps/tracy-host,
 * `react-dom` from @tracy/core, and a missing dependency or browser FAILS instead of skipping.
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

let outDir
let server
let browser
let page

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tst-changes-refresh-'))
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
    entryPoints: [path.join(here, '..', 'fixtures', 'changes-v2-entry.tsx')],
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
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif}' +
      '#panel{position:relative;box-sizing:border-box;width:900px;height:600px;margin:20px;overflow:auto}' +
      '</style></head><body><div id="panel"></div><script src="/app.js"></script></body></html>'
  )
  server = http.createServer((req, res) => {
    const name = req.url.split('?')[0].endsWith('/app.js') ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/gravatar\.com/, (route) => route.abort())
  await page.goto(`http://127.0.0.1:${server.address().port}/demo.tracy.site/`)
  await page.waitForFunction(() => Boolean(window.__tabs?.['tracy:changes']), null, { timeout: 8000 })
  assert.deepEqual(errors, [], 'the fixture page boots without errors')
  // The conversation on screen: its `turn/end` is what the tab follows.
  await page.evaluate(() => {
    window.__mainSession = 's-main'
    window.__listChanged()
  })
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Mount the tab over a V2 server; `pageSize` answers the list in two pages. */
async function mount({ pageSize = null } = {}) {
  await page.evaluate(
    ({ pageSize }) => {
      window.__server = 'v2'
      window.__newItems = []
      window.__pageSize = pageSize
      window.__holdActivity = false
      window.__releaseActivity = () => undefined
      window.__backupRows = null
      window.__mount()
    },
    { pageSize }
  )
  await page.waitForSelector('#panel [data-site-changes-v2] [data-event]', { timeout: 5000 })
}

const activityRequests = () =>
  page.evaluate(() => window.__requests.filter((r) => r.url.includes('/activity')).map((r) => r.url))
const waitForReads = (n) =>
  page.waitForFunction((n) => window.__requests.filter((r) => r.url.includes('/activity')).length >= n, n, {
    timeout: 5000
  })
const row = (id) => `#panel [data-event="${id}"]`
const eventIds = () =>
  page.$$eval('#panel [data-event]', (els) => els.map((e) => e.getAttribute('data-event')))
/** The tab's scrollport: its own root (the side card's body clips). */
const scroller = '#panel .tracy-site-tabs'

test('a turn ending re-reads the list and shows the new row; the rows, an opened row and the scroll stay meanwhile', async () => {
  await mount()
  assert.equal((await activityRequests()).length, 1)
  await page.click(`${row('s-2:1')} button[aria-expanded]`)
  await page.waitForSelector(`${row('s-2:1')} [data-detail]`)
  await page.$eval(scroller, (el) => {
    el.scrollTop = 120
  })
  const anchorBefore = await page.$eval(row('s-2:1'), (el) => Math.round(el.getBoundingClientRect().top))

  await page.evaluate(() => {
    window.__holdActivity = true
    window.__recordTurn('s-9:1')
    window.__turnEnd()
  })
  await waitForReads(2)
  // The read is out: the list on screen stays, nothing reads as empty or "reading".
  assert.equal(await page.$(`#panel [data-reading]`), null, 'no reading placeholder')
  assert.ok(await page.$(row('s-1:1')), 'the old rows stay on screen while the list is read again')
  assert.equal(await page.$(row('s-9:1')), null)

  await page.evaluate(() => window.__releaseActivity())
  await page.waitForSelector(row('s-9:1'), { timeout: 5000 })
  // The default view is People and Tracy (06/10/2026): the one automatic event of ten is held back.
  assert.equal(await page.textContent('#panel [data-total]'), '9 changes by people and Tracy')
  assert.ok(await page.$(`${row('s-2:1')} [data-detail]`), 'the opened row stays open')
  const anchorAfter = await page.$eval(row('s-2:1'), (el) => Math.round(el.getBoundingClientRect().top))
  assert.ok(
    Math.abs(anchorAfter - anchorBefore) <= 2,
    `the row being read stays where it was (${anchorBefore}px → ${anchorAfter}px)`
  )
  const url = (await activityRequests()).at(-1)
  assert.match(url, /version=2/)
  assert.doesNotMatch(url, /cursor=/, 'the re-read asks the newest page')
})

test('a turn ending asks again under the Source picked, and keeps it', async () => {
  await mount()
  await page.click('#panel .tv-activity-filter')
  await page.click('[role=menu] [role=menuitemradio]:has-text("Chat")')
  await page.waitForFunction(() =>
    document.querySelector('#panel .tv-activity-filter')?.textContent?.includes('Chat')
  )
  await waitForReads(2)
  await page.waitForFunction(() => !document.querySelector('#panel [data-reading]'))
  await page.evaluate(() => {
    window.__recordTurn('s-9:2')
    window.__turnEnd()
  })
  await page.waitForSelector(row('s-9:2'), { timeout: 5000 })
  const urls = await activityRequests()
  assert.equal(urls.length, 3)
  assert.match(urls.at(-1), /filter=chat/)
  assert.match(await page.textContent('#panel .tv-activity-filter'), /Chat/)
})

test('a turn ending keeps the pages "Show more" read: every event once, no second "Show more"', async () => {
  await mount({ pageSize: 4 })
  assert.equal((await eventIds()).length, 4)
  await page.click('#panel .tv-activity-more button')
  // People and Tracy (the default): eight events, the automatic one held back by the server.
  await page.waitForFunction(() => document.querySelectorAll('#panel [data-event]').length === 8)
  await page.evaluate(() => {
    window.__recordTurn('s-9:3')
    window.__turnEnd()
  })
  await page.waitForSelector(row('s-9:3'), { timeout: 5000 })
  const ids = await eventIds()
  assert.equal(ids.length, 9, `nine events, not the first page alone: ${ids.join(', ')}`)
  assert.equal(new Set(ids).size, ids.length, 'no event twice')
  assert.equal(ids[0], 's-9:3')
  assert.equal(await page.$('#panel .tv-activity-more'), null, 'the last page was already read')
})

test('the pane shown again re-reads: the side card tab picked again, the browser tab back in front', async () => {
  await mount()
  await page.waitForTimeout(400)
  assert.equal((await activityRequests()).length, 1)
  // The side card hides a tab it is not showing.
  await page.evaluate(() => {
    document.getElementById('panel').style.display = 'none'
  })
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    window.__recordTurn('s-9:4')
    document.getElementById('panel').style.display = ''
  })
  await page.waitForSelector(row('s-9:4'), { timeout: 5000 })
  assert.equal((await activityRequests()).length, 2)

  // The browser tab goes to the back and comes forward again.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(400)
  assert.equal((await activityRequests()).length, 2, 'going to the back reads nothing')
  await page.evaluate(() => {
    window.__recordTurn('s-9:5')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForSelector(row('s-9:5'), { timeout: 5000 })
  assert.equal((await activityRequests()).length, 3)
})

test('two signals at once make one request', async () => {
  await mount()
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    window.__recordTurn('s-9:6')
    window.__turnEnd()
    document.dispatchEvent(new Event('visibilitychange'))
    window.__turnEnd()
  })
  await page.waitForSelector(row('s-9:6'), { timeout: 5000 })
  await page.waitForTimeout(1000)
  assert.equal((await activityRequests()).length, 2, 'one re-read for three signals')
})
