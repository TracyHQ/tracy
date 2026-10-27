/**
 * Site changes V2 in a real browser (plan `tasks/todo-site-changes-v2.md` §3, §4.1; mockup
 * `site-changes-v2`, approved by Brian 02/10 with "Description gets the room").
 *
 * Pinned here, each a failure that would otherwise be silent:
 *   - the read: `version=2&filter=all` first, the Source picked after;
 *   - one vertical timeline: a row's title and meta line do not move when it opens or closes, every
 *     row shows a chevron, and its actions sit in one right-hand column whose right edge is the
 *     same for change and backup rows, always on screen (no hover needed), no … where it is empty;
 *   - a narrow pane (by the PANE's width, not the window's) drops the actions under the meta line
 *     and never scrolls sideways;
 *   - Undo counts the commit's files from `undo-scope`, sends an `idemKey`, and an answer that proves
 *     nothing reads "not confirmed", never "Nothing was changed"; asking again reuses the key;
 *   - a mixed event undone reads "Files undone · Content changes not undone…", not struck through;
 *   - Enter and Space open a row; the filter menu works from the keyboard;
 *   - EmDash: never "0 files", the untracked areas said in words.
 *
 * Harness rules as in `tab-loading.test.mjs`: `playwright` from apps/tracy-host, `react-dom` from
 * @tracy/core, and a missing dependency or browser FAILS instead of skipping.
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tst-changes-v2-'))
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
      '#panel{position:relative;box-sizing:border-box;width:900px;height:860px;margin:20px;overflow:auto}' +
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
  page = await browser.newPage({ viewport: { width: 1000, height: 920 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message, e.stack?.slice(0, 600)))
  await page.route(/gravatar\.com/, (route) => route.abort())
  await page.goto(`http://127.0.0.1:${server.address().port}/demo.tracy.site/`)
  await page.waitForFunction(() => Boolean(window.__tabs?.['tracy:changes']), null, { timeout: 8000 })
  assert.deepEqual(errors, [], 'the fixture page boots without errors')
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Mount the tab in a pane `width` px wide, playing `kind` of server; wait for its list. */
async function mount({ width = 900, kind = 'v2', dark = false } = {}) {
  await page.mouse.move(1, 1)
  await page.evaluate(
    ({ width, kind, dark }) => {
      document.body.toggleAttribute('data-ds-dark-theme', dark)
      document.getElementById('panel').style.width = `${width}px`
      window.__server = kind
      window.__holdActivity = false
      window.__releaseActivity = () => undefined
      window.__holdBackups = window.__nextHoldBackups ?? false
      window.__nextHoldBackups = false
      window.__releaseBackups = () => undefined
      window.__backupRows = window.__nextBackups ?? null
      window.__nextBackups = null
      window.__backupMay = window.__nextMay ?? null
      window.__nextMay = null
      window.__backupsStatus = window.__nextBackupsStatus ?? null
      window.__nextBackupsStatus = null
      window.__backupPost = null
      window.__dropFiltered = false
      // The site list is the page's shared answer: drop it so the platform of this server is read.
      window.dispatchEvent(new Event('tracy:sites-changed'))
      window.__restore = {
        status: 200,
        body: { ok: true, files: 7, head: 'abc', operationId: 'op-1', status: 'succeeded' }
      }
      window.__mount()
    },
    { width, kind, dark }
  )
  await page.waitForSelector('#panel [data-site-changes-v2]', { timeout: 5000 })
}

const activityRequests = () =>
  page.evaluate(() => window.__requests.filter((r) => r.url.includes('/activity')).map((r) => r.url))

const row = (id) => `#panel [data-event="${id}"]`

/**
 * "Show" on the hidden line: from the default People and Tracy (06/10/2026) to the full list, Type:
 * All, as it read before — for a test that is about every Source.
 */
async function showAll() {
  await page.click('#panel [data-show-automatic]')
  await page.waitForFunction(
    () =>
      document.querySelector('#panel .tv-activity-filter')?.textContent?.includes('All') &&
      !document.querySelector('#panel [data-reading]') &&
      document.querySelector('#panel [data-hidden-automatic]') === null
  )
}

/** Left edges of a row's Time, Source and By cells, and of the header's columns. */
function cells(id) {
  return page.evaluate((sel) => {
    const r = document.querySelector(sel)
    const x = (el) => Math.round(el.getBoundingClientRect().left)
    const y = (el) => Math.round(el.getBoundingClientRect().top)
    return {
      time: x(r.querySelector('[data-cell="time"]')),
      source: x(r.querySelector('[data-cell="source"]')),
      by: x(r.querySelector('[data-cell="by"]')),
      top: y(r.querySelector('[data-cell="time"]'))
    }
  }, row(id))
}

test('the list reads version=2: People and Tracy first, then the Source picked', async () => {
  await mount()
  const first = await activityRequests()
  assert.equal(first.length, 1)
  assert.match(first[0], /version=2/)
  // The default view, filtered by the server (06/10/2026): every Source but Automatic.
  assert.match(first[0], /filter=people/)
  await page.click('#panel .tv-activity-filter')
  await page.waitForSelector('[role=menu] [role=menuitemradio]')
  const labels = await page.$$eval('[role=menu] [role=menuitemradio] [data-label]', (els) =>
    els.map((e) => e.textContent)
  )
  assert.deepEqual(labels, [
    'People and Tracy',
    'All',
    'Chat',
    'Comment',
    'Design system',
    'Tracy setup',
    'API',
    'CMS admin',
    'Automatic',
    'Tracy update',
    'Restore',
    'Unknown'
  ])
  await page.click('[role=menu] [role=menuitemradio]:has-text("CMS admin")')
  await page.waitForFunction(() =>
    document.querySelector('#panel .tv-activity-filter')?.textContent?.includes('CMS admin')
  )
  const after = await activityRequests()
  assert.match(after.at(-1), /version=2/)
  assert.match(after.at(-1), /filter=cms-admin/)
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#panel [data-event]')].every(
      (r) => r.getAttribute('data-source') === 'cms-admin'
    )
  )
  assert.equal(await page.textContent('#panel [data-total]'), '1 recorded event')
})

for (const dark of [false, true]) {
  test(`the timeline row: chevron, title and meta line, unmoved by opening and closing a row (${dark ? 'dark' : 'light'})`, async () => {
    await mount({ dark })
    const before = await cells('s-1:1')
    // The meta line sits under the title, and who, type and when read in that order.
    const shape = await page.evaluate((sel) => {
      const r = document.querySelector(sel)
      const top = (q) => Math.round(r.querySelector(q).getBoundingClientRect().top)
      return { title: top('[data-cell="description"]'), meta: top('[data-meta]') }
    }, row('s-1:1'))
    assert.ok(shape.meta > shape.title, 'the meta line sits under the title')
    assert.ok(before.by < before.source && before.source < before.time, 'who, then type, then when')
    await page.click(`${row('s-1:1')} button[aria-expanded]`)
    await page.waitForSelector(`${row('s-1:1')} [data-detail]`)
    assert.deepEqual(await cells('s-1:1'), before, 'opening moves nothing on the first lines')
    const order = await page.$$eval(`${row('s-1:1')} [data-block]`, (els) =>
      els.map((e) => e.getAttribute('data-block'))
    )
    assert.deepEqual(order, ['result', 'identity', 'request', 'reply', 'effects', 'technical', 'actions'])
    const who = await page.textContent(`${row('s-1:1')} .tv-activity-identity-who`)
    assert.match(who, /Requested by Mai Tran · Applied by Tracy/)
    // Opened, the row and its detail are one box: a hairline around both.
    const box = await page.$eval(`${row('s-1:1')} .tv-row-box`, (b) => ({
      border: getComputedStyle(b).borderTopWidth,
      holdsDetail: Boolean(b.querySelector('[data-detail]'))
    }))
    assert.deepEqual(box, { border: '1px', holdsDetail: true })
    await page.click(`${row('s-1:1')} button[aria-expanded]`)
    await page.waitForSelector(`${row('s-1:1')} [data-detail]`, { state: 'detached' })
    assert.deepEqual(await cells('s-1:1'), before, 'closing puts it back')
    const scrolls = await page.evaluate(() => {
      const p = document.getElementById('panel')
      return p.scrollWidth - p.clientWidth
    })
    assert.ok(scrolls <= 1, 'no sideways scroll')
  })
}

test('the actions column: one right edge for change and backup rows in a 1440px pane', async () => {
  await page.setViewportSize({ width: 1500, height: 920 })
  try {
    // The reset server: a restore and a change Tracy made with no chat behind it (Undo file changes…
    // on the row), beside backups an Owner may download.
    await mountBackups(BACKUPS, {
      width: 1440,
      kind: 'reset',
      may: { restoreFiles: true, restoreEverything: true, export: true }
    })
    const edges = await page.$$eval('#panel li[data-event]', (rows) =>
      rows.map((r) => {
        const a = r.querySelector('.tv-row-actions')
        const t = r.querySelector('[data-cell="description"]').getBoundingClientRect()
        const last = a.lastElementChild.getBoundingClientRect()
        return {
          id: r.getAttribute('data-event'),
          backup: r.hasAttribute('data-backup'),
          right: Math.round(last.right),
          // Top-aligned to the title line: the buttons sit within its height.
          onTitle: Math.abs(last.top + last.height / 2 - (t.top + t.height / 2)) <= 3
        }
      })
    )
    assert.ok(edges.some((e) => e.backup) && edges.some((e) => !e.backup), 'change and backup rows')
    assert.equal(new Set(edges.map((e) => e.right)).size, 1, JSON.stringify(edges))
    assert.deepEqual(
      edges.filter((e) => !e.onTitle).map((e) => e.id),
      [],
      'actions on the title line'
    )
    // The buttons do not follow the title: a long and a short title put Undo at the same x.
    const undo = await page.$$eval('#panel [data-row-undo]', (els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().right))
    )
    const download = await page.$$eval('#panel [data-row-download]', (els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().right))
    )
    assert.ok(undo.length > 0 && download.length > 0)
    // Undo on a change row and Download on a backup row are the last button before the … place.
    assert.equal(new Set([...undo, ...download]).size, 1, `Undo ${undo}, Download ${download}`)
  } finally {
    await page.setViewportSize({ width: 1000, height: 920 })
  }
})

test('every row shows a chevron before it is opened, and pressing the row toggles aria-expanded', async () => {
  await mountBackups()
  await showAll()
  const rows = await page.$$eval('#panel li[data-event]', (els) =>
    els.map((r) => [r.getAttribute('data-event'), Boolean(r.querySelector('.tv-row-chevron'))])
  )
  assert.ok(rows.length > 5)
  assert.deepEqual(
    rows.filter(([, chevron]) => !chevron),
    [],
    'a chevron on every row'
  )
  for (const id of ['s-1:1', 'backup-4']) {
    const toggle = `${row(id)} button[aria-expanded]`
    const turn = () => page.$eval(`${row(id)} .tv-row-chevron`, (c) => getComputedStyle(c).transform)
    assert.equal(await page.getAttribute(toggle, 'aria-expanded'), 'false')
    const closed = await turn()
    await page.click(`${row(id)} .tv-row-chevron`)
    assert.equal(await page.getAttribute(toggle, 'aria-expanded'), 'true')
    await page.waitForFunction(
      ([sel, was]) => getComputedStyle(document.querySelector(sel)).transform !== was,
      [`${row(id)} .tv-row-chevron`, closed]
    )
    await page.click(toggle)
    assert.equal(await page.getAttribute(toggle, 'aria-expanded'), 'false')
  }
})

test('no … button on a row whose menu would be empty; Undo is on screen without hover', async () => {
  await mountBackups()
  await showAll()
  await page.mouse.move(1, 1)
  // A CMS admin edit has no commit to copy, and a backup has nothing left for a menu.
  for (const id of ['wordpress-tracy-log:91', 'backup-4']) {
    assert.equal(await page.$(`${row(id)} button[aria-label="More"]`), null, `${id}: no …`)
    assert.ok(await page.$(`${row(id)} .tv-row-more-slot`), `${id}: its place kept`)
  }
  // A commit row keeps its … (Copy the commit id), and nothing else is in it.
  await page.click(`${row('s-1:1')} button[aria-label="More"]`)
  const items = await page.$$eval('[role=menu] [role=menuitem]', (els) =>
    els.map((e) => e.textContent.trim())
  )
  assert.deepEqual(items, ['Copy the commit id'])
  await page.keyboard.press('Escape')
  // Undo, Restore and Download read without the pointer anywhere near the row.
  await mountBackups(BACKUPS, {
    kind: 'reset',
    may: { restoreFiles: true, restoreEverything: true, export: true }
  })
  await page.mouse.move(1, 1)
  const undoRow = 's-r:1'
  for (const sel of [
    `${row(undoRow)} [data-row-undo]`,
    `${row('backup-4')} [data-row-restore]`,
    `${row('backup-4')} [data-row-download]`
  ]) {
    const seen = await page.$eval(sel, (b) => {
      const s = getComputedStyle(b)
      const r = b.getBoundingClientRect()
      return s.visibility === 'visible' && Number(s.opacity) === 1 && r.width > 0 && r.height > 0
    })
    assert.ok(seen, `${sel} on screen at rest`)
  }
  assert.match(await page.textContent(`${row(undoRow)} [data-row-undo]`), /^Undo file changes…$/)
  // Its press opens the same dialog as the detail's.
  await page.click(`${row(undoRow)} [data-row-undo]`)
  await page.waitForSelector('[role=dialog]')
  await page.keyboard.press('Escape')
})

test('the main list: scope line, Source as words + icon, Detected time, By of four kinds', async () => {
  await mount()
  // People and Tracy (the default): the automatic event is held back behind one line.
  assert.equal(await page.textContent('#panel [data-total]'), '8 changes by people and Tracy')
  assert.match(await page.textContent('#panel [data-hidden-automatic]'), /^1 automatic update hidden·Show$/)
  assert.equal(await page.$(row('wordpress-tracy-log:92')), null)
  await showAll()
  assert.equal(await page.textContent('#panel [data-total]'), '9 recorded events')
  // A Chat row: its title is the request, unquoted; the result moves to the line under it.
  assert.equal(await page.textContent(`${row('s-1:1')} [data-scope]`), 'Updated 1 page and 2 files')
  assert.equal(
    await page.textContent(`${row('s-1:1')} .tv-activity-desc-text`),
    'Make the About us heading say “Baked fresh since 1998” and warm up the hero colours.'
  )
  // Only a Chat row: a Comment row keeps its Description as the title.
  assert.equal(await page.$(`${row('s-2:1')} [data-request-title]`), null)
  assert.match(await page.textContent(`${row('e5e5e5e5')} [data-cell="time"]`), /Detected 3h ago/)
  const sources = await page.$$eval('#panel [data-cell="source"]', (els) =>
    els.map((e) => ({
      text: e.querySelector('.tv-activity-cell-text')?.textContent,
      icon: Boolean(e.querySelector('svg'))
    }))
  )
  assert.ok(
    sources.every((s) => s.icon),
    'every Source carries an icon'
  )
  assert.deepEqual([...new Set(sources.map((s) => s.text))].sort(), [
    'Automatic',
    'CMS admin',
    'Chat',
    'Comment',
    'Restore',
    'Tracy update',
    'Unknown'
  ])
  const by = (id) => page.textContent(`${row(id)} [data-cell="by"] .tv-activity-cell-text`)
  assert.equal(await by('wordpress-tracy-log:91'), 'minh')
  assert.equal(
    await page.getAttribute(`${row('wordpress-tracy-log:91')} [data-cell="by"]`, 'title'),
    'WordPress account minh (ID 7)'
  )
  // A Tracy update: By is Tracy, the Description names what Tracy updated (Brian, option a).
  assert.equal(await by('d3d3d3d3'), 'Tracy')
  assert.equal(
    await page.textContent(`${row('d3d3d3d3')} .tv-activity-desc-text`),
    'Tracy updated its connector on this site'
  )
  assert.equal(await by('e5e5e5e5'), 'Unknown')
  // Only the request is known: the Request chip, the request as the Description.
  assert.equal(await page.textContent(`${row('s-0:1')} .tv-activity-chip`), 'Request')
})

test('the opened rows say what the records say: request cut, legacy request, deployment, conflicting', async () => {
  await mount()
  // The automatic WP-Cron row is under Type: All (the default holds it back).
  await showAll()
  for (const id of ['s-2:1', 's-0:1', 'd3d3d3d3', 'wordpress-tracy-log:92'])
    await page.click(`${row(id)} button[aria-expanded]`)
  const text = (id) => page.textContent(`${row(id)} [data-detail]`)
  const comment = await text('s-2:1')
  assert.match(comment, /Original request incomplete/)
  assert.match(comment, /Comment by Jo Reyes on \/menu\//)
  assert.match(comment, /Content changes can’t be undone from here yet\./)
  assert.equal(await page.$(`${row('s-2:1')} [data-row-undo]`), null)
  const legacy = await text('s-0:1')
  assert.match(legacy, /Full original request unavailable/)
  // Only a request cut on save ends in "…"; an unknown one is shown as stored (O1).
  assert.equal(
    await page.textContent(`${row('s-0:1')} .tv-activity-request`),
    'Translate the footer into Vietnamese'
  )
  assert.match(await page.textContent(`${row('s-2:1')} .tv-activity-request`), / …$/)
  assert.match(legacy, /The records of this change disagree/)
  const deploy = await text('d3d3d3d3')
  // First the reassurance; the tag, who started it and the files live in Technical details.
  assert.match(
    await page.textContent(`${row('d3d3d3d3')} .tv-activity-identity-who`),
    /^Tracy\. Your content and settings were not touched\.$/
  )
  assert.doesNotMatch(
    await page.textContent(`${row('d3d3d3d3')} [data-block="identity"]`),
    /manual|Started by/
  )
  assert.equal(await page.$(`${row('d3d3d3d3')} [data-group="files"]`), null, 'no Files block up front')
  const tech = await page.textContent(`${row('d3d3d3d3')} [data-block="technical"]`)
  assert.match(tech, /Tagmanual/)
  assert.match(tech, /Started byUnknown/)
  assert.ok(await page.$(`${row('d3d3d3d3')} [data-block="technical"] [data-deploy-files]`))
  // A Tracy update is Tracy's own change: its own no-undo sentence, never "changes Tracy didn't make".
  assert.match(
    deploy,
    /Undo isn’t offered for Tracy updates\. Ask Tracy in the chat if you need the previous version back\./
  )
  assert.doesNotMatch(deploy, /changes Tracy didn’t make/)
  assert.match(await text('wordpress-tracy-log:92'), /WP-Cron was running/)
})

test('a mixed event undone: files undone, content not — the Description is not struck through', async () => {
  await mount()
  const status = await page.textContent(`${row('s-3:1')} [data-scope]`)
  assert.equal(status, 'Files undone · Content changes not undone by this action')
  const deco = await page.$eval(
    `${row('s-3:1')} .tv-activity-desc-text`,
    (e) => getComputedStyle(e).textDecorationLine
  )
  assert.equal(deco, 'none')
  // The undo event links back to its target, and opens it.
  await page.click(`${row('op-9')} button[aria-expanded]`)
  assert.match(
    await page.textContent(`${row('op-9')} [data-detail]`),
    /Sam Ortiz pressed Undo file changes in Site changes\./
  )
  await page.click(`${row('op-9')} button:has-text("Show the event")`)
  await page.waitForSelector(`${row('s-3:1')} [data-detail]`)
  assert.equal(await page.$(`${row('s-3:1')} [data-row-undo]`), null)
})

test('one Undo file changes per row: in the actions column, never repeated in the opened detail; opening a chat row brings it on screen', async () => {
  await mount()
  await page.mouse.move(1, 1)
  // A chat row: its Undo waits for the undo engine, which nothing has asked yet (no pointer, no focus).
  assert.equal(await page.$(`${row('s-1:1')} [data-row-undo]`), null, 'not asked yet')
  // Opened without the pointer or the keyboard reaching it: opening is enough to ask.
  await page.$eval(`${row('s-1:1')} button[aria-expanded]`, (b) => b.click())
  await page.waitForSelector(`${row('s-1:1')} [data-detail]`)
  await page.waitForSelector(`${row('s-1:1')} .tv-row-actions [data-row-undo]`)
  assert.equal(await page.$$eval(`${row('s-1:1')} [data-row-undo]`, (b) => b.length), 1)
  assert.equal(
    await page.$(`${row('s-1:1')} [data-detail] button:has-text("Undo file changes")`),
    null,
    'the detail does not repeat it'
  )
  // The detail keeps what only it offers.
  assert.ok(await page.$(`${row('s-1:1')} [data-detail] [data-ask-revert]`), 'Ask Tracy to revert stays')
})

test('Undo counts the commit from undo-scope, sends an idemKey, and settles on success', async () => {
  await mount()
  await page.click(`${row('s-1:1')} button[aria-expanded]`)
  await page.click(`${row('s-1:1')} [data-row-undo]`)
  await page.waitForSelector('[role=dialog]')
  await page.waitForFunction(() =>
    document.querySelector('[data-undo-count]')?.textContent?.includes('7 files')
  )
  // 7 from the commit's own scope — not the turn's 2.
  assert.equal(
    await page.textContent('[data-undo-count]'),
    '7 files go back to how they were before commit 7c1e0a9.'
  )
  assert.match(await page.textContent('[data-not-undone]'), /Updated page 12/)
  await page.click('[role=dialog] button:has-text("Undo 7 files")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
  const post = await page.evaluate(() => window.__requests.find((r) => r.method === 'POST'))
  assert.equal(post.body.mode, 'undo')
  assert.equal(post.body.sha, '7c1e0a94d2b8aaaabbbbccccddddeeeeffff0000')
  assert.match(post.body.idemKey, /^[A-Za-z0-9._:-]{8,128}$/)
})

test('an answer that proves nothing reads "not confirmed", never "Nothing was changed"; asking again reuses the key', async () => {
  await mount()
  await page.evaluate(() => {
    window.__restore = {
      status: 502,
      body: { code: 'FLEET_JOB_FAILED', reason: 'timeout', operationId: 'op-2', status: 'unknown' }
    }
  })
  await page.click(`${row('s-1:1')} button[aria-expanded]`)
  await page.click(`${row('s-1:1')} [data-row-undo]`)
  await page.waitForFunction(() =>
    document.querySelector('[data-undo-count]')?.textContent?.includes('7 files')
  )
  await page.click('[role=dialog] button:has-text("Undo 7 files")')
  await page.waitForSelector('[data-undo-outcome="unknown"]')
  const words = await page.textContent('[role=dialog]')
  assert.match(words, /Result not confirmed yet/)
  assert.doesNotMatch(words, /Nothing was changed/i)
  await page.click('[role=dialog] button:has-text("Check again")')
  await page.waitForFunction(() => window.__requests.filter((r) => r.method === 'POST').length === 2)
  const keys = await page.evaluate(() =>
    window.__requests.filter((r) => r.method === 'POST').map((r) => r.body.idemKey)
  )
  assert.equal(keys[0], keys[1], 'the same press, the same key')
  await page.click('[role=dialog] button:has-text("Close")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
})

test('succeeded_noop says there was nothing to undo', async () => {
  await mount()
  await page.evaluate(() => {
    window.__restore = {
      status: 200,
      body: { ok: true, files: 0, head: null, operationId: 'op-3', status: 'succeeded_noop' }
    }
  })
  await page.click(`${row('s-1:1')} button[aria-expanded]`)
  await page.click(`${row('s-1:1')} [data-row-undo]`)
  await page.waitForFunction(() =>
    document.querySelector('[data-undo-count]')?.textContent?.includes('7 files')
  )
  await page.click('[role=dialog] button:has-text("Undo 7 files")')
  await page.waitForSelector('[data-undo-outcome="succeeded_noop"]')
  assert.match(await page.textContent('[role=dialog]'), /Nothing to undo/)
  await page.keyboard.press('Escape')
})

test('keyboard: Enter and Space open a row; the filter menu walks with arrows and Escape returns focus', async () => {
  await mount()
  await page.focus(`${row('s-1:1')} button[aria-expanded]`)
  await page.keyboard.press('Enter')
  assert.equal(await page.getAttribute(`${row('s-1:1')} button[aria-expanded]`, 'aria-expanded'), 'true')
  await page.keyboard.press('Space')
  assert.equal(await page.getAttribute(`${row('s-1:1')} button[aria-expanded]`, 'aria-expanded'), 'false')
  const ring = await page.$eval(
    `${row('s-1:1')} .tv-activity-event-main`,
    (e) => getComputedStyle(e).outlineStyle
  )
  assert.equal(ring, 'solid', 'the focused row shows a ring')
  await page.focus('#panel .tv-activity-filter')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role=menu] [role=menuitemradio]')
  const focused = () =>
    page.evaluate(() => document.activeElement?.querySelector('[data-label]')?.textContent ?? null)
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitemradio')
  assert.equal(await focused(), 'People and Tracy', 'the chosen item (the default) takes focus')
  await page.keyboard.press('ArrowDown')
  assert.equal(await focused(), 'All')
  await page.keyboard.press('ArrowDown')
  assert.equal(await focused(), 'Chat')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role=menu]', { state: 'detached' })
  assert.equal(
    await page.evaluate(() => document.activeElement?.classList.contains('tv-activity-filter')),
    true
  )
})

for (const width of [360, 600]) {
  test(`a ${width}px pane: the meta line under the title, the actions under it, no sideways scroll`, async () => {
    await mount({ width })
    const shape = await page.evaluate((sel) => {
      const p = document.getElementById('panel')
      const r = document.querySelector(sel)
      const desc = r.querySelector('[data-cell="description"]').getBoundingClientRect()
      const time = r.querySelector('[data-cell="time"]').getBoundingClientRect()
      // A row with actions (a commit to copy): the comment row has none.
      const actions = document
        .querySelector('#panel [data-event="d3d3d3d3"] .tv-row-actions')
        .getBoundingClientRect()
      const ownMeta = document
        .querySelector('#panel [data-event="d3d3d3d3"] [data-meta]')
        .getBoundingClientRect()
      return {
        scroll: p.scrollWidth - p.clientWidth,
        below: time.top >= desc.bottom - 1,
        actionsBelow: actions.top >= ownMeta.bottom - 1,
        meta: r.querySelector('[data-meta]').textContent
      }
    }, row('s-2:1'))
    assert.ok(shape.scroll <= 1, `sideways scroll ${shape.scroll}px`)
    assert.ok(shape.below, 'the meta line sits under the title')
    // Under 520px of pane the actions drop under the meta line; at 600 they stay beside the row.
    assert.equal(shape.actionsBelow, width < 520, 'actions under the meta line in a narrow pane only')
    assert.match(shape.meta, /Sam Ortiz.*Comment.*ago/)
    await page.click(`${row('s-2:1')} button[aria-expanded]`)
    const scroll = await page.evaluate(() => {
      const p = document.getElementById('panel')
      return p.scrollWidth - p.clientWidth
    })
    assert.ok(scroll <= 1, 'opened, still no sideways scroll')
  })
}

test('counts incomplete: "At least N", and the reason is reachable by keyboard', async () => {
  await mount({ kind: 'floor' })
  // People and Tracy: 226 events, the one automatic held back; still "At least".
  assert.match(await page.textContent('#panel [data-total]'), /^At least 225 changes by people and Tracy/)
  const hint = await page.getAttribute('#panel .tv-activity-hint', 'aria-label')
  assert.match(hint, /newest 200 moments/)
  await page.focus('#panel .tv-activity-hint')
  assert.equal(
    await page.evaluate(() => document.activeElement?.classList.contains('tv-activity-hint')),
    true
  )
  assert.match(await page.textContent('#panel [data-coverage]'), /Older history not shown/)
})

test('EmDash: never "0 files"; what is not tracked is said in words', async () => {
  await mount({ kind: 'emdash' })
  await page.click(`${row('em-1:1')} button[aria-expanded]`)
  const all = await page.textContent('#panel')
  assert.doesNotMatch(all, /\b0 files?\b/)
  const detail = await page.textContent(`${row('em-1:1')} [data-detail]`)
  assert.match(detail, /Not tracked on EmDash/)
  // A content edit says content can't be undone — the EmDash file sentence never hides it (EM-1).
  assert.match(detail, /Content changes can’t be undone from here yet\./)
  // A concurrent turn on a site with no file tracking speaks of changes, not files (EM-4).
  assert.match(detail, /some of the changes listed may be from it/)
  assert.doesNotMatch(detail, /some files may be from it/)
  assert.match(await page.textContent('#panel [data-coverage]'), /What this list cannot see on EmDash/)
})

test('a reset names the commit it put the files back to, never "Undid", and marks nothing undone', async () => {
  await mount({ kind: 'reset' })
  await page.click(`${row('op-r')} button[aria-expanded]`)
  const detail = await page.textContent(`${row('op-r')} [data-detail]`)
  assert.match(detail, /Sam Ortiz put the site files back to an earlier point from Site changes\./)
  assert.match(detail, /Files put back to Commit r1r1r1r/)
  assert.doesNotMatch(detail, /Undid/)
  assert.equal(
    await page.textContent(`${row('op-r')} .tv-activity-desc-text`),
    'Put the site files back to commit r1r1r1r'
  )
  // The event made at that point is not undone by the reset: no status, its Undo still offered.
  assert.equal(await page.$(`${row('s-r:1')} [data-scope][data-status]`), null)
  await page.click(`${row('op-r')} button:has-text("Show that point")`)
  await page.waitForSelector(`${row('s-r:1')} [data-detail]`)
  assert.ok(await page.$(`${row('s-r:1')} [data-row-undo]`))
})

test('BUG-L4-1: a re-read under the same Source keeps the rows on screen while the answer is out', async () => {
  await mount()
  const before = await page.$$eval('#panel [data-event]', (rows) => rows.length)
  // An undo that succeeded re-reads the list; that read hangs.
  await page.evaluate(() => {
    window.__holdActivity = true
  })
  await page.click(`${row('s-1:1')} button[aria-expanded]`)
  await page.click(`${row('s-1:1')} [data-row-undo]`)
  await page.waitForFunction(() =>
    document.querySelector('[data-undo-count]')?.textContent?.includes('7 files')
  )
  await page.click('[role=dialog] button:has-text("Undo 7 files")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
  await page.waitForFunction(() => window.__requests.filter((r) => r.url.includes('/activity')).length === 2)
  await page.waitForTimeout(300)
  assert.equal(await page.$$eval('#panel [data-event]', (rows) => rows.length), before, 'the rows stay')
  assert.equal(await page.$('#panel [data-reading]'), null)
  await page.evaluate(() => {
    window.__holdActivity = false
    window.__releaseActivity()
  })
})

test('BUG-L4-1: picking another Source while its read hangs says it reads, never an empty or stale pane', async () => {
  await mount()
  await page.evaluate(() => {
    window.__holdActivity = true
  })
  await page.click('#panel .tv-activity-filter')
  await page.click('[role=menu] [role=menuitemradio]:has-text("CMS admin")')
  await page.waitForSelector('#panel [data-reading]')
  assert.equal(await page.textContent('#panel [data-reading]'), 'Reading events for Type: CMS admin…')
  assert.equal(
    await page.$$eval('#panel [data-event]', (rows) => rows.length),
    0,
    'no rows of the old Source'
  )
  // The frame stays: the filter names the new Source, the server's total is already its count.
  assert.match(await page.textContent('#panel .tv-activity-filter'), /Type: CMS admin/)
  assert.equal(await page.textContent('#panel [data-total]'), '1 recorded event')
  await page.evaluate(() => {
    window.__holdActivity = false
    window.__releaseActivity()
  })
  await page.waitForSelector('#panel [data-reading]', { state: 'detached' })
  assert.deepEqual(
    await page.$$eval('#panel [data-event]', (rows) => rows.map((r) => r.getAttribute('data-source'))),
    ['cms-admin']
  )
})

// ── Backups as milestones (ADR 0024; mockup `site-changes-backup`) ───────────────────────────────

const FULL = { state: 'full', engine: 'mariadb', sha256: 'ab'.repeat(32), size: 1880000 }
const at = (minutes) => Math.floor((Date.now() - minutes * 60_000) / 1000)
const SAM_ACTOR = { kind: 'person', name: 'Sam Ortiz', email: 'sam@example.test' }
const point = (version, minutes, over = {}) => ({
  kind: 'backup',
  version,
  sha: `${version}`.repeat(7),
  title: `Point ${version}`,
  notes: null,
  at: at(minutes),
  by: SAM_ACTOR,
  files: version,
  ...over
})
const BACKUPS = [
  point(1, 60 * 40, { database: FULL, title: 'Initial release' }),
  point(2, 60 * 25, { database: { state: 'none', engine: null, sha256: null, size: null } }),
  point(3, 100, {
    database: { state: 'missing', engine: 'mariadb', sha256: null, size: null, reason: 'mismatch' }
  }),
  point(4, 65, { database: FULL, title: 'Before the menu', notes: 'Hero colours\nMenu' }),
  point(5, 20, { database: FULL, auto: 'pre-restore', title: 'Before restore to Backup 4' })
]

async function mountBackups(rows = BACKUPS, opts = {}) {
  await page.evaluate(
    ({ rows, may }) => {
      window.__nextBackups = rows
      window.__nextMay = may
    },
    { rows, may: opts.may ?? null }
  )
  await mount(opts)
  await page.waitForSelector('#panel [data-backup], #panel [data-backup-divider]', { timeout: 5000 })
}

test('backups are milestones: named, badged from the point itself, no Source, not counted', async () => {
  await mountBackups()
  // People and Tracy holds an automatic update back: a backup row then says its files, never a
  // count that leaves the hidden update out.
  assert.match(await page.textContent(`${row('backup-2')} [data-scope]`), /^2 files changed since Backup 1$/)
  // Only a backup that is not a full one says what it is, in words beside the line.
  assert.equal(await page.textContent(`${row('backup-2')} .tv-backup-badge`), 'File backup (no database)')
  // Its count is every recorded change, read under Type: All, where nothing is held back.
  await showAll()
  const marks = await page.$$eval('#panel [data-backup]', (els) =>
    els.map((el) => [
      el.getAttribute('data-backup'),
      el.querySelector('[data-name]').textContent,
      el.getAttribute('data-capability'),
      el.querySelector('[data-scope]').textContent,
      el.querySelector('[data-meta] .tv-backup-badge')?.textContent ?? null
    ])
  )
  assert.deepEqual(
    marks.map(([v, , cap]) => [v, cap]),
    [
      ['5', 'full'],
      ['4', 'full'],
      ['3', 'db-missing'],
      ['2', 'files-only'],
      ['1', 'full']
    ]
  )
  const byVersion = Object.fromEntries(marks.map(([v, name, , line, badge]) => [v, { name, line, badge }]))
  assert.equal(byVersion['5'].name, 'Backup 5 · Before restore to Backup 4')
  assert.equal(byVersion['4'].name, 'Backup 4 · Before the menu')
  assert.equal(byVersion['1'].name, 'Initial backup — site as built')
  assert.match(
    byVersion['3'].line,
    /^Database copy does not match what was saved · only the files can go back$/
  )
  assert.equal(byVersion['3'].badge, 'DB ✗')
  assert.match(byVersion['2'].line, /^1 change since Backup 1$/)
  assert.equal(byVersion['2'].badge, 'File backup (no database)')
  assert.equal(byVersion['4'].badge, null, 'a full backup carries no badge on its line')
  // Not counted: the total is the events' alone.
  assert.equal(await page.textContent('#panel [data-total]'), '9 recorded events')
  // No Source: a backup is a milestone on the line (a filled node), not a kind of change.
  assert.equal(await page.$(`${row('backup-4')} [data-cell="source"]`), null)
  // Its who and when read as on every row, in the same meta line.
  const c = await page.$eval(row('backup-4'), (r) => ({
    by: r.querySelector('[data-meta] [data-cell="by"]').getBoundingClientRect().left,
    time: r.querySelector('[data-meta] [data-cell="time"]').getBoundingClientRect().left
  }))
  assert.ok(c.by < c.time)
  // Nothing recorded since Backup 5, but the database changes without a row (an order, a CLI write;
  // QA-I04/I07): the button stays live and says only what the list knows.
  const create = '#panel [data-create-backup]'
  assert.equal(await page.isDisabled(create), false)
  assert.match(
    await page.getAttribute(create, 'title'),
    /^Nothing recorded in Site changes since Backup 5\. The database can still have changed/
  )
  await page.click(create)
  await page.waitForSelector('[role=dialog] [data-draft]')
  assert.match(await page.textContent('[role=dialog]'), /Create backup 6 of demo\.tracy\.site/)
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
})

test('under a Source filter a backup folds to a divider, also when the Source holds nothing', async () => {
  await mountBackups()
  await page.evaluate(() => {
    window.__dropFiltered = true
  })
  await page.click('#panel .tv-activity-filter')
  await page.click('[role=menu] [role=menuitemradio]:has-text("CMS admin")')
  await page.waitForSelector('#panel [data-backup-divider]')
  assert.equal(await page.$('#panel [data-backup]'), null, 'no full milestone under a Source')
  const dividers = await page.$$eval('#panel [data-backup-divider]', (els) =>
    els.map((e) => e.getAttribute('data-backup-divider'))
  )
  assert.deepEqual(dividers, ['5', '4', '3', '2', '1'])
  assert.match(await page.textContent('#panel [data-backup-divider="4"]'), /Backup 4 · /)
  assert.equal(await page.$$eval('#panel [data-event]:not([data-backup])', (els) => els.length), 0)
})

test('Jump to backup brings the point into view and lights it', async () => {
  await mountBackups()
  await page.click('#panel [data-jump]')
  await page.click('[role=menu] [role=menuitem]:has-text("Initial backup — site as built")')
  await page.waitForSelector('#panel [data-backup="1"][data-flash]', { timeout: 2000 })
})

test('after a Restore everything its Before-restore backup is its return point, not a row above it (Brian 03/10)', async () => {
  // Backup 5 is the host's Before-restore point of a restore to Backup 4 a moment after it.
  await page.evaluate(() => window.__recordRestoreEverything(4, 5, 19))
  try {
    await mountBackups()
    const restore = row('op-everything-4')
    await page.waitForSelector(restore)
    assert.equal(await page.$('#panel [data-backup="5"]'), null, 'no separate Before-restore row')
    assert.match(
      await page.textContent(`${restore} [data-cell="description"]`),
      /^Restored everything to Backup 4 · Return point: Backup 5/
    )
    // One click back: Restore… on the restore row opens the restore dialog of Backup 5.
    await page.click(`${restore} button[aria-expanded]`)
    await page.click(`${restore} [data-detail] [data-restore-return="5"]`)
    await page.waitForSelector('[role=dialog] [data-confirm-word]')
    assert.match(await page.textContent('[role=dialog]'), /to Backup 5 · Before restore to Backup 4\?/)
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role=dialog]', { state: 'detached' })
    // Still chosen like any backup: Jump to backup lists it and lands on its restore row.
    await page.click('#panel [data-jump]')
    await page.click('[role=menu] [role=menuitem]:has-text("Before restore to Backup 4")')
    await page.waitForSelector(`${restore}[data-flash]`, { timeout: 2000 })
  } finally {
    await page.evaluate(() => {
      window.__newItems = []
    })
  }
})

test('a restore settled before the link was kept leaves its Before-restore backup where its time puts it', async () => {
  await page.evaluate(() => window.__recordRestoreEverything(4, null, 21))
  try {
    await mountBackups()
    await page.waitForSelector(row('op-everything-4'))
    assert.ok(await page.$('#panel [data-backup="5"]'), 'nothing guessed by time')
  } finally {
    await page.evaluate(() => {
      window.__newItems = []
    })
  }
})

test('a backup row counts every recorded change since the previous backup, not only files (Brian 03/10)', async () => {
  await mountBackups()
  // Backup 4 (65 min ago) to Backup 5 (20 min ago): the fixed list's events of that stretch.
  const five = await page.textContent(`${row('backup-5')} [data-scope]`)
  // People and Tracy holds one automatic update back, so no count there (it would leave it out)…
  assert.doesNotMatch(five, /changes? since Backup 4$/)
  // …and under Type: All, every recorded change of the stretch is counted.
  await showAll()
  const all = await page.textContent(`${row('backup-5')} [data-scope]`)
  assert.match(all, /\d+ changes? since Backup 4$/)
  assert.doesNotMatch(all, /files? changed/)
})

test('an opened backup: what it keeps, and the verbs by risk', async () => {
  await mountBackups()
  await page.click(`${row('backup-4')} button[aria-expanded]`)
  const four = await page.textContent(`${row('backup-4')} [data-detail]`)
  assert.match(four, /Files and the site’s database: posts, pages/)
  assert.match(four, /Backed up by Sam Ortiz/)
  assert.match(four, /Hero colours\nMenu|Hero colours/)
  // One Restore… (Brian 03/10); the scope is chosen in its dialog.
  assert.equal(await page.$$eval(`${row('backup-4')} [data-detail] [data-restore]`, (els) => els.length), 1)
  assert.equal(
    (await page.textContent(`${row('backup-4')} [data-detail] [data-restore="backup"]`)).trim(),
    'Restore…'
  )
  for (const [id, words] of [
    ['backup-2', /Restore everything isn’t offered: this backup has no copy of the database\./],
    ['backup-3', /Restore everything isn’t offered: the database copy of this backup can’t be trusted\./]
  ]) {
    await page.click(`${row(id)} button[aria-expanded]`)
    assert.ok(await page.$(`${row(id)} [data-detail] [data-restore="backup"]`), 'files can still go back')
    assert.match(await page.textContent(`${row(id)} [data-detail]`), words)
  }
  await page.click(`${row('backup-5')} button[aria-expanded]`)
  assert.match(
    await page.textContent(`${row('backup-5')} [data-detail]`),
    /Taken by Tracy just before everything was restored to Backup 4/
  )
  await page.click(`${row('backup-1')} button[aria-expanded]`)
  assert.match(await page.textContent(`${row('backup-1')} [data-detail]`), /factory reset/)
})

test('a seat that may not restore: the verbs stay, disabled, with why; no dialog opens (QA-I14)', async () => {
  // An editor: `/restore` refuses both verbs (FORBIDDEN_WRITE), so the tab never opens their dialogs.
  await mountBackups(BACKUPS, { may: { restoreFiles: false, restoreEverything: false } })
  await page.click(`${row('backup-4')} button[aria-expanded]`)
  const detail = `${row('backup-4')} [data-detail]`
  assert.equal(await page.isDisabled(`${detail} [data-restore="backup"]`), true)
  const why = await page.$$eval(`${detail} [data-forbidden]`, (els) => els.map((e) => e.textContent))
  assert.deepEqual(why, [
    'Your role on this site can see backups but not put files back.',
    'Only an Owner or an Editor of this site can restore everything. Ask one of them to restore it.'
  ])
  await page.click(`${detail} [data-restore="backup"]`, { force: true })
  // The row's own Restore…, on screen in the actions column: disabled too, and no … menu.
  assert.equal((await page.textContent(`${row('backup-4')} [data-row-restore]`)).trim(), 'Restore…')
  assert.equal(await page.isDisabled(`${row('backup-4')} [data-row-restore]`), true)
  assert.equal(await page.$(`${row('backup-4')} button[aria-label="More"]`), null)
  await page.click(`${row('backup-4')} [data-row-restore]`, { force: true })
  assert.equal(await page.$('[role=dialog]'), null, 'no restore dialog for a seat the door refuses')

  // A developer: files yes, everything no — Restore… opens on Files only, says so and why.
  await mountBackups(BACKUPS, { may: { restoreFiles: true, restoreEverything: false } })
  await page.click(`${row('backup-4')} button[aria-expanded]`)
  assert.equal(await page.isDisabled(`${detail} [data-restore="backup"]`), false)
  assert.equal(await page.$$eval(`${detail} [data-forbidden]`, (els) => els.length), 1)
  await page.click(`${detail} [data-restore="backup"]`)
  await page.waitForSelector('[role=dialog] [data-scope-only="files"]')
  assert.equal(await page.$('[role=dialog] [data-scope-choice]'), null, 'no choice with one scope')
  assert.match(
    await page.textContent('[role=dialog] [data-scope-only]'),
    /Restore: Files only.*Images uploaded after this backup are removed.*Only an Owner or an Editor of this site can restore everything./
  )
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
})

test('Restore files… names the backup and says only files go back, at that backup', async () => {
  await mountBackups()
  await page.click(`${row('backup-4')} button[aria-expanded]`)
  await page.click(`${row('backup-4')} [data-restore="backup"]`)
  await page.click('[role=dialog] [data-scope-option="files"] input')
  await page.waitForSelector('[role=dialog] button:has-text("Restore the files")')
  const dialog = await page.textContent('[role=dialog]')
  assert.match(dialog, /Put the files of demo\.tracy\.site back to Backup 4 · Before the menu\?/)
  assert.match(dialog, /go back to how they were at that backup/)
  await page.keyboard.press('Escape')
})

const NOOP = {
  status: 200,
  body: { ok: true, files: 0, head: null, operationId: 'op-n', status: 'succeeded_noop' }
}

/** Open backup `version`'s "Restore files…" dialog, the server answering `restore`. */
async function openRestoreFiles(version, restore) {
  await mountBackups()
  await page.evaluate((r) => {
    window.__restore = r
  }, restore)
  await page.click(`${row(`backup-${version}`)} button[aria-expanded]`)
  await page.click(`${row(`backup-${version}`)} [data-restore="backup"]`)
  await page.waitForSelector('[role=dialog]')
  // Backup 4 can take both scopes: Files only is the second choice.
  await page.click('[role=dialog] [data-scope-option="files"] input')
  await page.waitForSelector('[role=dialog] button:has-text("Restore the files")')
}

const restorePosts = () =>
  page.evaluate(() =>
    window.__requests.filter((r) => r.method === 'POST' && r.url.endsWith('/restore')).map((r) => r.body)
  )

test('Restore files… puts the files back to the backup\'s commit, and a no-op answers "Nothing to restore"', async () => {
  await openRestoreFiles(4, NOOP)
  const body = await page.textContent('[role=dialog]')
  assert.match(body, /Content and settings kept in the database are not changed/)
  assert.doesNotMatch(body, /Anything added since leaves the site/)
  await page.click('[role=dialog] button:has-text("Restore the files")')
  await page.waitForSelector('[data-restore-outcome="succeeded_noop"]')
  assert.match(await page.textContent('[role=dialog]'), /Nothing to restore/)
  assert.match(await page.textContent('[role=dialog]'), /already as they were at Backup 4 · Before the menu/)
  const [post] = await restorePosts()
  assert.equal(post.mode, 'reset')
  assert.equal(post.sha, '4444444', "the backup's own commit")
  assert.match(post.idemKey, /^[A-Za-z0-9._:-]{8,128}$/)
  await page.click('[role=dialog] button:has-text("Close")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
})

for (const [label, restore] of [
  [
    'status unknown',
    {
      status: 502,
      body: { code: 'FLEET_JOB_FAILED', reason: 'timeout', operationId: 'op-u', status: 'unknown' }
    }
  ],
  ['no answer at all', { status: 0, body: null }]
]) {
  test(`Restore files…, ${label}: "not confirmed", never "Nothing was changed"; asking again reuses the key`, async () => {
    await openRestoreFiles(4, restore)
    await page.click('[role=dialog] button:has-text("Restore the files")')
    await page.waitForSelector('[data-restore-outcome="unknown"]')
    const words = await page.textContent('[role=dialog]')
    assert.match(words, /could not confirm the result yet/)
    assert.doesNotMatch(words, /Nothing was changed/i)
    await page.click('[role=dialog] button:has-text("Check again")')
    await page.waitForFunction(
      () => window.__requests.filter((r) => r.method === 'POST' && r.url.endsWith('/restore')).length === 2
    )
    const keys = (await restorePosts()).map((b) => b.idemKey)
    assert.match(keys[0], /^[A-Za-z0-9._:-]{8,128}$/)
    assert.equal(keys[0], keys[1], 'the same press, the same key')
    await page.click('[role=dialog] button:has-text("Close")')
    await page.waitForSelector('[role=dialog]', { state: 'detached' })
  })
}

async function openEverything(version = 4) {
  await page.click(`${row(`backup-${version}`)} button[aria-expanded]`)
  await page.click(`${row(`backup-${version}`)} [data-restore="backup"]`)
  // Everything is the scope Restore… opens on.
  await page.waitForSelector('[role=dialog] [data-confirm-word]')
}

test('Restore everything waits for the word Restore, says what is deleted, and sends the word', async () => {
  await mountBackups()
  await openEverything(4)
  const dialog = await page.textContent('[role=dialog]')
  assert.match(dialog, /Restore everything on demo\.tracy\.site to Backup 4 · Before the menu\?/)
  assert.match(dialog, /is deleted:Posts and pagesOrdersForm entriesUsersCommentsSettings/)
  assert.match(dialog, /“Before restore” backup first/)
  // As My Sites' delete (Brian 03/10): a fixed English word, not the site address; Cancel has the focus.
  assert.match(dialog, /Type “Restore” to confirm/)
  const word = '[role=dialog] [data-confirm-word]'
  assert.equal(await page.getAttribute(word, 'placeholder'), 'Restore')
  assert.equal(await page.getAttribute(word, 'autocomplete'), 'off')
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent?.trim()),
    'Cancel',
    'the destructive button is never the focused one'
  )
  const confirm = '[role=dialog] [data-confirm-everything]'
  assert.equal(await page.isDisabled(confirm), true)
  await page.fill(word, 'demo.tracy.site')
  assert.equal(await page.isDisabled(confirm), true, 'the site address is not the word')
  await page.fill(word, 'Restor')
  assert.equal(await page.isDisabled(confirm), true, 'a part of the word is not the word')
  await page.fill(word, '  restore ')
  assert.equal(await page.isDisabled(confirm), false, 'any case, spaces around it ignored')
  await page.click(confirm)
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
  const post = await page.evaluate(() =>
    window.__requests.find((r) => r.method === 'POST' && r.url.endsWith('/restore'))
  )
  assert.equal(post.body.mode, 'everything')
  assert.equal(post.body.version, 4)
  assert.equal(post.body.confirm, 'restore')
  assert.equal('confirmSiteKey' in post.body, false)
  assert.match(post.body.idemKey, /^[A-Za-z0-9._:-]{8,128}$/)
  // The list and the backups are read again.
  await page.waitForFunction(() => window.__requests.filter((r) => r.url.endsWith('/backups')).length >= 2)
})

for (const [status, body, words] of [
  [400, { code: 'CONFIRM_MISMATCH' }, 'The site refused this restore.'],
  [
    409,
    { code: 'BACKUP_NOT_FULL', version: 4 },
    'This backup has no usable copy of the database, so only its files can be put back.'
  ],
  [404, { code: 'BACKUP_UNKNOWN' }, 'This backup is no longer on the site.'],
  [
    403,
    { code: 'FORBIDDEN_WRITE', toolset: 'site', role: 'viewer' },
    'Only an Owner or an Editor of this site can restore everything. Ask one of them to restore it.'
  ],
  [409, { code: 'RESTORE_REFUSED', reason: 'TABLE_COUNT' }, 'The site refused this restore.']
]) {
  test(`Restore everything refused ${body.code}: its own words, the dialog stays`, async () => {
    await mountBackups()
    await page.evaluate(
      (r) => {
        window.__restore = r
      },
      { status, body }
    )
    await openEverything(4)
    await page.fill('[role=dialog] [data-confirm-word]', 'Restore')
    await page.click('[role=dialog] [data-confirm-everything]')
    await page.waitForSelector(`[role=dialog] [data-refusal="${body.code}"]`)
    assert.equal(await page.textContent(`[role=dialog] [data-refusal="${body.code}"]`), words)
    await page.keyboard.press('Escape')
  })
}

// #1403 item 9: a host that failed the restore read "The undo did not go through" — the files undo's
// words, under a dialog about the whole site.
test('Restore everything failed on the host: its own words, not the undo’s', async () => {
  await mountBackups()
  await page.evaluate(() => {
    window.__restore = {
      status: 502,
      body: { code: 'FLEET_JOB_FAILED', reason: 'failed', operationId: 'op-f', status: 'failed' }
    }
  })
  await openEverything(4)
  await page.fill('[role=dialog] [data-confirm-word]', 'Restore')
  await page.click('[role=dialog] [data-confirm-everything]')
  await page.waitForSelector('[role=dialog] [data-refusal="failed"]')
  assert.equal(
    await page.textContent('[role=dialog] [data-refusal="failed"]'),
    'The restore did not go through. Try again shortly.'
  )
  await page.keyboard.press('Escape')
})

test('Restore everything not confirmed: says so, never "Nothing was changed"; asking again reuses the key', async () => {
  await mountBackups()
  await page.evaluate(() => {
    window.__restore = {
      status: 202,
      body: { code: 'OPERATION_UNKNOWN', operationId: 'op-e', status: 'unknown' }
    }
  })
  await openEverything(4)
  await page.fill('[role=dialog] [data-confirm-word]', 'Restore')
  await page.click('[role=dialog] [data-confirm-everything]')
  await page.waitForSelector('[data-everything-outcome="unknown"]')
  const words = await page.textContent('[role=dialog]')
  assert.match(words, /could not confirm the result yet/)
  assert.doesNotMatch(words, /Nothing was changed/i)
  await page.click('[role=dialog] button:has-text("Check again")')
  await page.waitForFunction(
    () => window.__requests.filter((r) => r.method === 'POST' && r.url.endsWith('/restore')).length === 2
  )
  const keys = await page.evaluate(() =>
    window.__requests
      .filter((r) => r.method === 'POST' && r.url.endsWith('/restore'))
      .map((r) => r.body.idemKey)
  )
  assert.equal(keys[0], keys[1])
  await page.click('[role=dialog] button:has-text("Close")')
})

test('Create a backup: says files and database are kept, drafts notes a person reads, a blank title is named by time', async () => {
  // The newest entry is an event, so there is something new to keep.
  await mountBackups([point(1, 60 * 40, { database: FULL }), point(2, 60 * 25, { database: FULL })])
  const create = '#panel [data-create-backup]'
  assert.equal(await page.isDisabled(create), false)
  assert.equal((await page.textContent(create)).trim(), 'Create a backup')
  await page.click(create)
  await page.waitForSelector('[role=dialog] [data-draft]')
  assert.match(await page.textContent('[role=dialog]'), /Create backup 3 of demo\.tracy\.site/)
  assert.doesNotMatch(
    await page.textContent('[role=dialog]'),
    /Files and the site’s database are both kept|Saves the site as it is now/
  )
  // The title is a field holding the date and time; the number sits before it, fixed.
  assert.equal((await page.textContent('[role=dialog] [data-title-prefix]')).trim(), 'Backup 3 ·')
  assert.match(await page.inputValue('[role=dialog] #tracy-backup-title'), /\d/)
  // Notes for a person (Brian 02/10): one line per change since Backup 2, in Site changes' own words,
  // oldest first — never the raw request a change was made from.
  await page.waitForFunction(() => document.querySelector('[role=dialog] [data-draft]')?.value.includes('· '))
  const draft = await page.$eval('[role=dialog] [data-draft]', (el) => el.value)
  const lines = draft.split('\n')
  assert.equal(lines.length, 8, draft)
  assert.equal(lines[0], '· Files changed; source unknown — Unknown')
  assert.ok(lines.includes('· Updated 1 page and 2 files — Chat, Mai Tran'), draft)
  assert.ok(lines.includes('· Updated setting “Site tagline” — CMS admin, minh'), draft)
  assert.doesNotMatch(draft, /Make the About us heading|Translate the footer/, 'no raw request')
  assert.match(
    await page.textContent('[role=dialog]'),
    /Drafted from the 8 changes since Backup 2\. Edit freely\./
  )
  await page.click('[role=dialog] button:has-text("Create backup")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
  const post = await page.evaluate(() =>
    window.__requests.find((r) => r.method === 'POST' && r.url.endsWith('/backup'))
  )
  assert.ok(post.body.title.length > 0, 'the door gets a title: the date and time')
})

// #1403 item 9: the door's wait ran out while the host went on; the dialog said "The backup could
// not be made. Nothing on the site was changed." and the person pressed again — two backups.
test('Create a backup still being made (202): says so, never "Nothing on the site was changed"; the list watches for it', async () => {
  await mountBackups([point(1, 60 * 40, { database: FULL }), point(2, 60 * 25, { database: FULL })])
  await page.evaluate(() => {
    window.__backupPost = { status: 202, body: { code: 'BACKUP_PENDING' } }
  })
  await page.click('#panel [data-create-backup]')
  await page.waitForSelector('[role=dialog] [data-draft]')
  await page.click('[role=dialog] button:has-text("Create backup")')
  await page.waitForSelector('[data-backup-outcome="pending"]')
  const words = await page.textContent('[role=dialog]')
  assert.match(words, /Still making the backup/)
  assert.match(words, /It shows in the list once it is made\./)
  assert.doesNotMatch(words, /Nothing on the site was changed/)
  await page.click('[role=dialog] button:has-text("Close")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
})

test('Create a backup with no answer that proves anything (a proxy’s 504): not confirmed, never "Nothing was changed"', async () => {
  await mountBackups([point(1, 60 * 40, { database: FULL })])
  await page.evaluate(() => {
    window.__backupPost = { status: 504, body: '<html>Gateway Timeout</html>' }
  })
  await page.click('#panel [data-create-backup]')
  await page.waitForSelector('[role=dialog] [data-draft]')
  await page.click('[role=dialog] button:has-text("Create backup")')
  await page.waitForSelector('[data-backup-outcome="unconfirmed"]')
  const words = await page.textContent('[role=dialog]')
  assert.match(words, /Result not confirmed yet/)
  assert.match(words, /could not confirm the backup yet/)
  assert.doesNotMatch(words, /Nothing on the site was changed/)
  await page.click('[role=dialog] button:has-text("Close")')
})

test('Create a backup the host failed: "could not be made", the dialog stays', async () => {
  await mountBackups([point(1, 60 * 40, { database: FULL })])
  await page.evaluate(() => {
    window.__backupPost = { status: 502, body: { code: 'FLEET_JOB_FAILED', reason: 'disk full' } }
  })
  await page.click('#panel [data-create-backup]')
  await page.waitForSelector('[role=dialog] [data-draft]')
  await page.click('[role=dialog] button:has-text("Create backup")')
  await page.waitForSelector('[role=dialog] [role=alert]')
  assert.equal(
    (await page.textContent('[role=dialog] [role=alert]')).trim(),
    'The backup could not be made. Nothing on the site was changed.'
  )
  await page.keyboard.press('Escape')
})

test('the backups could not be read: the list says so above everything, instead of showing a site with no backup', async () => {
  await page.evaluate(() => {
    window.__nextBackupsStatus = 502
  })
  await mount()
  await page.waitForSelector('#panel [data-backups-failed]', { timeout: 8000 })
  assert.equal(
    (await page.textContent('#panel [data-backups-failed]')).trim(),
    'Tracy could not read this site’s backups just now, so none are shown in this list.'
  )
  assert.equal(await page.locator('#panel [data-backup], #panel [data-backup-divider]').count(), 0)
})

test('no backups door (404): no milestones and nothing said, as before', async () => {
  await mount()
  await page.waitForFunction(() => window.__requests.some((r) => r.url.endsWith('/backups')))
  await page.waitForTimeout(300)
  assert.equal(await page.locator('#panel [data-backups-failed]').count(), 0)
})

/**
 * Mount with `rows` as the backups, their answer held back, and press Create a backup once the list is
 * in and the backups are out — the ~2.5 s a stand's host takes to answer `/backups` (REG-018).
 */
async function createWhileBackupsLoad(rows) {
  await page.evaluate((rows) => {
    window.__nextBackups = rows
    window.__nextHoldBackups = true
  }, rows)
  await mount()
  await page.waitForFunction(() => window.__requests.some((r) => r.url.endsWith('/backups')), null, {
    polling: 100
  })
  await page.click('#panel [data-create-backup]')
  await page.waitForSelector('[role=dialog] [data-draft]')
}
const dialogText = () => page.textContent('[role=dialog]')
const draftValue = () => page.$eval('[role=dialog] [data-draft]', (el) => el.value)
const backupPosts = () =>
  page.evaluate(
    () => window.__requests.filter((r) => r.method === 'POST' && r.url.endsWith('/backup')).length
  )
const releaseBackups = () =>
  page.evaluate(() => {
    window.__holdBackups = false
    window.__releaseBackups()
  })
// Backup 2 was taken a minute ago: every event of the fixed list is older.
const FRESH = () => [point(1, 60 * 40, { database: FULL }), point(2, 1, { database: FULL })]

test('Create a backup before the backups answer: nothing drafted, counted or numbered — then nothing new stays empty (REG-018)', async () => {
  await createWhileBackupsLoad(FRESH())
  // The list is in, the backups are not: an incomplete picture, so the dialog says it is reading.
  assert.match(await dialogText(), /Reading what changed since the last backup…/)
  assert.doesNotMatch(await dialogText(), /Drafted from/)
  assert.match(await dialogText(), /Create a backup of demo\.tracy\.site/, 'no number before the backups')
  assert.equal(await draftValue(), '', 'nothing drafted "since the start"')
  // The prefix says it is reading — no guessed number — and the title field is usable meanwhile.
  assert.equal(
    (await page.textContent('[role=dialog] [data-title-prefix="pending"]')).trim(),
    'Reading the backups…'
  )
  assert.equal(await page.isEditable('[role=dialog] #tracy-backup-title'), true)
  await releaseBackups()
  await page.waitForFunction(
    () =>
      document
        .querySelector('[role=dialog]')
        ?.textContent.includes('Drafted from the 0 changes since Backup 2.'),
    null,
    { polling: 100 }
  )
  // An untouched textarea follows the draft — to nothing: stale notes used to stay and be saved.
  assert.equal(await draftValue(), '')
  assert.match(await dialogText(), /Create backup 3 of demo\.tracy\.site/)
  assert.equal((await page.textContent('[role=dialog] [data-title-prefix="number"]')).trim(), 'Backup 3 ·')
  await page.click('[role=dialog] button:has-text("Cancel")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
  assert.equal(await backupPosts(), 0, 'closed, never confirmed')
})

test('Create a backup before the backups answer: one change after the newest backup drafts exactly that line (REG-018)', async () => {
  await page.evaluate(() => window.__recordTurn('s-17:1'))
  try {
    await createWhileBackupsLoad(FRESH())
    assert.match(await dialogText(), /Reading what changed since the last backup…/)
    assert.equal(await draftValue(), '')
    await releaseBackups()
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role=dialog]')
          ?.textContent.includes('Drafted from the 1 changes since Backup 2.'),
      null,
      { polling: 100 }
    )
    assert.equal(await draftValue(), '· Updated 1 page and 2 files — Chat, Mai Tran')
    await page.click('[role=dialog] button:has-text("Cancel")')
    await page.waitForSelector('[role=dialog]', { state: 'detached' })
  } finally {
    await page.evaluate(() => {
      window.__newItems = []
    })
  }
})

test("Create a backup: notes typed before the draft arrives are the person's, and stay", async () => {
  await createWhileBackupsLoad(FRESH())
  await page.fill('[role=dialog] [data-draft]', 'My own words')
  await releaseBackups()
  await page.waitForFunction(
    () =>
      document
        .querySelector('[role=dialog]')
        ?.textContent.includes('Drafted from the 0 changes since Backup 2.'),
    null,
    { polling: 100 }
  )
  assert.equal(await draftValue(), 'My own words')
  await page.click('[role=dialog] button:has-text("Cancel")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
})

test('EmDash: a content backup offers Restore content only, and says the files are not tracked', async () => {
  const sqlite = { state: 'full', engine: 'sqlite', sha256: 'cd'.repeat(32), size: 5540000 }
  await mountBackups([point(1, 60 * 40, { database: sqlite }), point(2, 5, { database: sqlite, files: 0 })], {
    kind: 'emdash'
  })
  assert.equal(await page.getAttribute(row('backup-2'), 'data-capability'), 'content')
  assert.match(
    await page.textContent(`${row('backup-2')} [data-scope]`),
    // Every recorded change since Backup 1 (Brian 03/10), as on a WordPress or Joomla backup.
    /^1 change since Backup 1$/
  )
  assert.equal(await page.textContent(`${row('backup-2')} [data-meta] .tv-backup-badge`), 'Content backup')
  // The row's own action says Restore content… too.
  assert.equal((await page.textContent(`${row('backup-2')} [data-row-restore]`)).trim(), 'Restore content…')
  await page.click(`${row('backup-2')} button[aria-expanded]`)
  assert.equal(await page.$(`${row('backup-2')} [data-restore="backup"]`), null)
  assert.equal(
    (await page.textContent(`${row('backup-2')} [data-restore="content"]`)).trim(),
    'Restore content…'
  )
  assert.match(
    await page.textContent(`${row('backup-2')} [data-detail]`),
    /Restore files isn’t offered on EmDash/
  )
  await page.click(`${row('backup-2')} [data-restore="content"]`)
  await page.waitForSelector('[role=dialog] [data-confirm-word]')
  const dialog = await page.textContent('[role=dialog]')
  assert.match(dialog, /Restore the content of demo\.tracy\.site to Backup 2/)
  assert.equal(
    await page.$('[role=dialog] [data-scope-choice], [role=dialog] [data-scope-only]'),
    null,
    'no scope step'
  )
  assert.match(dialog, /offline for a few seconds/)
  await page.keyboard.press('Escape')
})

test('Restore everything at 360px, dark: the dialog and its Close stay inside the viewport (QA-I15)', async () => {
  await page.setViewportSize({ width: 360, height: 800 })
  try {
    await mountBackups(BACKUPS, { width: 340, dark: true })
    await openEverything(4)
    const geo = await page.evaluate(() => {
      const d = document.querySelector('[role=dialog]')
      const box = (el) => {
        const b = el.getBoundingClientRect()
        return { left: b.left, right: b.right }
      }
      return {
        vw: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        dialog: box(d),
        close: box(d.querySelector('[data-slot="dialog-close"]')),
        confirm: box(d.querySelector('[data-confirm-everything]'))
      }
    })
    assert.equal(geo.scroll, geo.vw, 'no sideways scroll')
    for (const [name, b] of Object.entries({ dialog: geo.dialog, close: geo.close, confirm: geo.confirm })) {
      assert.ok(b.left >= 0 && b.right <= geo.vw, `${name} inside the viewport: ${JSON.stringify(b)}`)
    }
    // The gutter tracy-ui draws (max-w calc(100% - 2rem)) survives the dialog's own width.
    assert.ok(geo.dialog.left >= 15 && geo.vw - geo.dialog.right >= 15, JSON.stringify(geo.dialog))
  } finally {
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1000, height: 920 })
  }
})
test('Open chat inside Tracy (W-F3): dsh switches the main view to that session, then the message is scrolled to and marked', async () => {
  await page.evaluate(() => {
    window.__mainSession = 's-main'
    window.__sessions = ['s-1']
    window.__switched = []
    window.__opened = []
    window.open = (url) => {
      window.__opened.push(url)
      return null
    }
    window.__services.uiWorkspace = {
      openSession: (id) => {
        window.__switched.push(id)
        // dsh's switch: the main view now shows `id`, and its chat draws a beat later.
        window.__sessions = [window.__mainSession]
        window.__mainSession = id
        setTimeout(() => {
          const n = document.createElement('div')
          n.style.height = '40px'
          n.dataset.chatNodeKey = '13:input-messaged6bf0971-4d24-4919-8451-2d7519f0da7a'
          document.body.appendChild(n)
          window.__msgNode = n
        }, 300)
      }
    }
  })
  try {
    await mount()
    // The old conversation's chat is still in the page: nothing of it may be marked.
    await page.evaluate(() => {
      const old = document.createElement('div')
      old.dataset.chatNodeKey = '14:assistant-step-old'
      document.body.appendChild(old)
    })
    await page.click(`${row('s-1:1')} button[aria-expanded]`)
    await page.click(`${row('s-1:1')} [data-open-conversation]`)
    assert.deepEqual(await page.evaluate(() => window.__switched), ['s-1'], 'openSession(sessionId), once')
    assert.deepEqual(await page.evaluate(() => window.__opened), [], 'no new window')
    await page.waitForSelector('[data-tracy-msg-flash]', { state: 'attached', timeout: 8000 })
    assert.equal(
      await page.getAttribute('[data-tracy-msg-flash]', 'data-chat-node-key'),
      '13:input-messaged6bf0971-4d24-4919-8451-2d7519f0da7a'
    )
    // Already on screen: no second switch, the scroll again (the quick-open arrow of the same row).
    await page.waitForSelector('[data-tracy-msg-flash]', { state: 'detached', timeout: 5000 })
    await page.click(`${row('s-1:1')} [data-quick-open]`)
    assert.deepEqual(await page.evaluate(() => window.__switched), ['s-1'])
    await page.waitForSelector('[data-tracy-msg-flash]', { state: 'attached', timeout: 5000 })
    assert.deepEqual(await page.evaluate(() => window.__opened), [])
  } finally {
    await page.evaluate(() => {
      window.__msgNode?.remove()
      document.querySelectorAll('[data-chat-node-key]').forEach((n) => n.remove())
      window.__mainSession = undefined
      window.__sessions = undefined
      delete window.__services.uiWorkspace
    })
  }
})

test('Open chat falls back to a new window only where dsh cannot switch: no uiWorkspace, or a session it does not list', async () => {
  await page.evaluate(() => {
    window.__services.uiWorkspace = { openSession: () => window.__switched.push('called') }
    window.__switched = []
    window.__mainSession = 's-main'
  })
  try {
    await mount()
    await page.evaluate(() => {
      window.__opened = []
      window.open = (url, target, features) => {
        window.__opened.push([url, target, features])
        return null
      }
    })
    await page.click(`${row('s-1:1')} button[aria-expanded]`)
    // s-1 is not in dsh's list (archived, another browser's): the address, in a new window.
    await page.click(`${row('s-1:1')} [data-open-conversation]`)
    assert.deepEqual(await page.evaluate(() => window.__switched), [])
    assert.equal(await page.evaluate(() => window.__opened.length), 1)
  } finally {
    await page.evaluate(() => {
      delete window.__services.uiWorkspace
      window.__mainSession = undefined
    })
  }
})

test('Open chat with no uiWorkspace: mine opens a new window on that message; not mine is dimmed and says whose; none, no button', async () => {
  await mount()
  await page.evaluate(() => {
    window.__opened = []
    window.open = (url, target, features) => {
      window.__opened.push([url, target, features])
      return null
    }
  })
  await page.click(`${row('s-1:1')} button[aria-expanded]`)
  await page.click(`${row('s-1:1')} [data-open-conversation]`)
  assert.deepEqual(await page.evaluate(() => window.__opened), [
    [
      '/demo.tracy.site/s/s-1?open=browser&mode=edit&tracy-msg=d6bf0971-4d24-4919-8451-2d7519f0da7a',
      '_blank',
      'noopener'
    ]
  ])
  await page.click(`${row('s-2:1')} button[aria-expanded]`)
  const off = `${row('s-2:1')} [data-open-conversation="off"]`
  assert.equal(await page.getAttribute(off, 'aria-disabled'), 'true')
  assert.equal(await page.getAttribute(off, 'data-hint'), 'Only Sam Ortiz can open this chat')
  await page.click(off, { force: true })
  assert.equal(await page.evaluate(() => window.__opened.length), 1, 'a dimmed button opens nothing')
  // Keyboard: it takes focus, and its reason is drawn on focus.
  await page.focus(off)
  const hint = await page.$eval(off, (el) => getComputedStyle(el, '::after').content)
  assert.match(hint, /Only Sam Ortiz can open this chat/)
  await page.click(`${row('s-3:1')} button[aria-expanded]`)
  assert.equal(await page.$(`${row('s-3:1')} [data-open-conversation]`), null)
})

const COMMENT_LINK =
  '/demo.tracy.site/?open=browser&page=%2Fmenu%2F%3Flang%3Dvi&mode=edit&comment=6f1c2a3b-0000-4000-8000-00000000c0de'

/** Play the Browser tab of the conversation on screen: answer `list` acts, record `reveal` acts. */
async function playBrowserTab(p, { url, thread = null }) {
  await p.evaluate(
    ({ url, thread, id }) => {
      window.__reveals = []
      window.__tabState = { url, thread }
      const tell = () =>
        window.dispatchEvent(
          new CustomEvent('tracy:comment-list', {
            detail: {
              sessionId: 's-main',
              tabId: 'tab2',
              active: true,
              url: window.__tabState.url,
              thread: window.__tabState.thread,
              comments: [{ id, url: 'http://demo.localhost:8080/menu/?lang=vi', replyCount: 0 }]
            }
          })
        )
      window.__tellList = tell
      window.addEventListener('tracy:comment-act', (e) => {
        const d = e.detail
        if (d.kind === 'list' && d.sessionId === 's-main') tell()
        if (d.kind === 'reveal') {
          window.__reveals.push(d)
          // The overlay opens the thread card at the pin.
          window.__tabState.thread = d.ids[0]
          setTimeout(tell, 50)
        }
      })
    },
    { url, thread, id: COMMENT_ID }
  )
}

const COMMENT_ID = '6f1c2a3b-0000-4000-8000-00000000c0de'

test('Open comment inside Tracy (W-F3): the Browser tab on its page in Edit, then the thread is opened once the overlay lists it (W-F2)', async () => {
  await page.evaluate(() => {
    window.__mainSession = 's-main'
    window.__openedTabs = []
    window.__opened = []
    window.open = (url) => {
      window.__opened.push(url)
      return null
    }
  })
  try {
    await mount()
    await page.click(`${row('s-2:1')} button[aria-expanded]`)
    await page.click(`${row('s-2:1')} [data-open-comment]`)
    await page.waitForFunction(() => window.__openedTabs.length > 0)
    assert.deepEqual(await page.evaluate(() => window.__openedTabs), [
      { type: 'tracy:browser', url: 'http://demo.localhost:8080/menu/?lang=vi&mode=edit' }
    ])
    assert.deepEqual(await page.evaluate(() => window.__opened), [], 'no new window')
    // Nothing is asked of the overlay before it has listed the comments (the race of W-F2) ...
    await page.waitForTimeout(300)
    assert.equal(await page.evaluate(() => window.__reveals?.length ?? 0), 0)
    // ... then the tab mounts on the comment's page and lists: one reveal, to that tab.
    await playBrowserTab(page, { url: 'http://demo.localhost:8080/menu/?lang=vi' })
    await page.waitForFunction(() => window.__reveals.length > 0, null, { timeout: 4000 })
    assert.deepEqual(await page.evaluate(() => window.__reveals), [
      { tabId: 'tab2', sessionId: 's-main', kind: 'reveal', ids: [COMMENT_ID] }
    ])
    // The thread is open: no further reveal.
    await page.waitForTimeout(2500)
    assert.equal(await page.evaluate(() => window.__reveals.length), 1)
  } finally {
    await page.evaluate(() => {
      window.__mainSession = undefined
    })
  }
})

test('a link with comment=<id> (new window, pasted, Copy link): the address loses it, the tab opens on its page, the thread is opened', async () => {
  const p = await browser.newPage({ viewport: { width: 900, height: 600 } })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.route(/gravatar\.com/, (route) => route.abort())
  // The main session is known before the plugin applies, as on a page dsh restored.
  await p.addInitScript(() => {
    window.__mainSession = 's-main'
  })
  await p.goto(`http://127.0.0.1:${server.address().port}${COMMENT_LINK}`)
  await p.waitForFunction(() => Boolean(window.__tabs?.['tracy:changes']))
  assert.equal(await p.evaluate(() => location.search), '', 'open, page, mode and comment all taken off')
  await p.waitForFunction(() => window.__openedTabs.length > 0, null, { timeout: 5000 })
  assert.equal(
    await p.evaluate(() => window.__openedTabs[0].url),
    'http://demo.localhost:8080/menu/?lang=vi&mode=edit'
  )
  // The tab lists while still on the site's home (the link's page is loading): no reveal yet.
  await playBrowserTab(p, { url: 'http://demo.localhost:8080/' })
  await p.waitForTimeout(1500)
  assert.equal(await p.evaluate(() => window.__reveals.length), 0, 'the load is left alone')
  // The page arrives: the thread is opened.
  await p.evaluate(() => {
    window.__tabState.url = 'http://demo.localhost:8080/menu/?lang=vi'
    window.__tellList()
  })
  await p.waitForFunction(() => window.__reveals.length === 1, null, { timeout: 4000 })
  assert.deepEqual(errors, [])
  await p.close()
})

test('Open comment with no conversation on screen: the Browser tab deep link with comment=<id>, in a new window, from the row', async () => {
  await mount()
  await page.click(`${row('s-2:1')} button[aria-expanded]`)
  assert.equal(await page.getAttribute(`${row('s-2:1')} [data-open-comment]`, 'href'), COMMENT_LINK)
  assert.equal(await page.getAttribute(`${row('s-2:1')} [data-open-comment]`, 'target'), '_blank')
  // No … repeats it: the row's own comment link (the Source's arrow) does, and with no commit to
  // copy this row has no … at all.
  assert.equal(await page.$(`${row('s-2:1')} button[aria-label="More"]`), null)
  // The arrow is a plain link to the same place, in a new window, opened by the browser itself.
  const quick = `${row('s-2:1')} [data-quick-open="comment"]`
  assert.equal(await page.getAttribute(quick, 'href'), COMMENT_LINK)
  assert.equal(await page.getAttribute(quick, 'target'), '_blank')
  assert.equal(await page.getAttribute(quick, 'rel'), 'noopener')
})

test('a deleted comment: no Open comment anywhere, who and where kept, said as deleted', async () => {
  await page.evaluate(() => {
    window.__commentDeleted = true
  })
  try {
    await mount()
    await page.click(`${row('s-2:1')} button[aria-expanded]`)
    assert.equal(await page.$(`${row('s-2:1')} [data-open-comment]`), null)
    const line = await page.textContent(`${row('s-2:1')} .tv-activity-identity`)
    assert.match(line, /Comment by Jo Reyes on \/menu\/ · comment deleted/)
    // Its menu holds only Copy the commit id now: Open comment is gone from it either way.
    assert.equal(await page.$(`${row('s-2:1')} [data-quick-open]`), null)
  } finally {
    await page.evaluate(() => {
      window.__commentDeleted = false
    })
  }
})

test('Tracy replied: the stored reply as text, cut marked; no block where none was kept', async () => {
  await mount()
  await page.click(`${row('s-2:1')} button[aria-expanded]`)
  await page.click(`${row('s-1:1')} button[aria-expanded]`)
  const block = `${row('s-2:1')} [data-block="reply"]`
  assert.match(await page.textContent(`${block} h4`), /Tracy replied/)
  assert.equal(
    await page.textContent(`${block} [data-reply]`),
    'Fixed the typo <img src=x onerror="window.__xss=1"> in the menu & footer. …'
  )
  assert.equal(await page.$(`${block} img`), null, 'markup in a reply is never drawn')
  assert.equal(await page.evaluate(() => window.__xss), undefined)
  assert.match(await page.textContent(block), /This reply was cut when it was saved\./)
  const order = await page.$$eval(`${row('s-2:1')} [data-block]`, (els) =>
    els.map((e) => e.getAttribute('data-block'))
  )
  assert.deepEqual(order.slice(0, 4), ['result', 'identity', 'request', 'reply'])
  // Interrupted: said as such, with its line breaks kept as text.
  const stopped = `${row('s-1:1')} [data-block="reply"]`
  assert.equal(await page.textContent(`${stopped} [data-reply]`), 'Updating the heading now.\nThen the hero')
  assert.match(
    await page.textContent(stopped),
    /This turn stopped partway; this is what Tracy had said by then\./
  )
  assert.doesNotMatch(await page.textContent(stopped), /cut when it was saved/)
  // No reply kept (an older turn): no block, no "none" line.
  await page.click(`${row('s-3:1')} button[aria-expanded]`)
  assert.equal(await page.$(`${row('s-3:1')} [data-block="reply"]`), null)
})

/** A page opened by "Open conversation": the handler reads `tracy-msg` once and finds the message. */
async function conversationPage(search, setup) {
  const p = await browser.newPage({ viewport: { width: 900, height: 600 } })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await p.route(/gravatar\.com/, (route) => route.abort())
  await p.goto(`http://127.0.0.1:${server.address().port}/demo.tracy.site/s/s-1${search}`)
  await p.waitForFunction(() => Boolean(window.__tabs?.['tracy:changes']))
  await p.evaluate(setup)
  return { p, errors }
}

const MSG = 'd6bf0971-4d24-4919-8451-2d7519f0da7a'

test('the conversation page scrolls to the message and marks it, then takes tracy-msg off the address', async () => {
  const { p, errors } = await conversationPage(`?tracy-msg=${MSG}`, () => {
    const list = document.createElement('div')
    list.style.cssText = 'height:300px;overflow:auto'
    for (let i = 0; i < 40; i++) {
      const n = document.createElement('div')
      n.style.height = '60px'
      n.dataset.chatNodeKey =
        i === 3 ? `13:input-message${'d6bf0971-4d24-4919-8451-2d7519f0da7a'}` : `14:assistant-step${i}`
      list.appendChild(n)
    }
    document.body.appendChild(list)
    list.scrollTop = list.scrollHeight
  })
  assert.doesNotMatch(await p.evaluate(() => location.search), /tracy-msg/)
  await p.waitForSelector('[data-tracy-msg-flash]', { timeout: 5000 })
  const key = await p.getAttribute('[data-tracy-msg-flash]', 'data-chat-node-key')
  assert.equal(key, `13:input-message${MSG}`)
  // In view once the (smooth) scroll has run.
  await p.waitForFunction(
    () => {
      const el = document.querySelector('[data-tracy-msg-flash]')
      if (!el) return false
      const r = el.getBoundingClientRect()
      const box = el.parentElement.getBoundingClientRect()
      return r.top >= box.top - 1 && r.bottom <= box.bottom + 1
    },
    null,
    { timeout: 3000 }
  )
  await p.waitForSelector('[data-tracy-msg-flash]', { state: 'detached', timeout: 5000 })
  assert.deepEqual(errors, [])
  await p.close()
})

test('an older message: history is paged in through loadOlder until it appears', async () => {
  const { p, errors } = await conversationPage(`?tracy-msg=${MSG}`, () => {
    const list = document.createElement('div')
    list.id = 'chat'
    const n = document.createElement('div')
    n.dataset.chatNodeKey = '14:assistant-step-last'
    list.appendChild(n)
    document.body.appendChild(list)
    window.__loads = 0
    window.__loadOlder = () => {
      window.__loads += 1
      if (window.__loads === 2) {
        const old = document.createElement('div')
        old.dataset.chatNodeKey = '13:input-messaged6bf0971-4d24-4919-8451-2d7519f0da7a'
        list.prepend(old)
      }
    }
  })
  await p.waitForSelector('[data-tracy-msg-flash]', { state: 'attached', timeout: 15000 })
  assert.equal(await p.evaluate(() => window.__loads), 2)
  assert.deepEqual(errors, [])
  await p.close()
})

test('a message that is nowhere: paging stops when history ends, the page stays, no console error', async () => {
  const { p, errors } = await conversationPage(`?tracy-msg=${MSG}`, () => {
    const n = document.createElement('div')
    n.dataset.chatNodeKey = '14:assistant-step-last'
    document.body.appendChild(n)
    window.__loads = 0
    window.__loadOlder = () => {
      window.__loads += 1
      if (window.__loads >= 2) window.__hasMore = false
    }
  })
  await p.waitForFunction(() => window.__loads >= 2 && window.__hasMore === false)
  await p.waitForTimeout(3500)
  assert.equal(await p.evaluate(() => window.__loads), 2, 'no paging past the start of history')
  assert.equal(await p.$('[data-tracy-msg-flash]'), null)
  assert.deepEqual(errors, [])
  await p.close()
})

const CHAT_LINK =
  '/demo.tracy.site/s/s-1?open=browser&mode=edit&tracy-msg=d6bf0971-4d24-4919-8451-2d7519f0da7a'

/** Clicks on a quick-open arrow, recorded and kept from opening a window (capture runs first). */
async function recordQuickClicks() {
  await page.evaluate(() => {
    window.__quick = []
    if (window.__quickHooked) return
    window.__quickHooked = true
    window.addEventListener(
      'click',
      (e) => {
        const a = e.target instanceof Element ? e.target.closest('a[data-quick-open]') : null
        if (!a) return
        e.preventDefault()
        window.__quick.push([a.getAttribute('href'), a.getAttribute('target')])
      },
      true
    )
  })
}

test('quick-open arrow beside Source: own chat and a live comment only; opens without opening the row', async () => {
  await mount()
  await recordQuickClicks()
  const arrows = await page.$$eval('#panel [data-quick-open]', (els) =>
    els.map((a) => [a.closest('[data-event]').getAttribute('data-event'), a.getAttribute('data-quick-open')])
  )
  // Own chat (s-1:1) and the comment (s-2:1); no chat without a conversation (s-3:1), no other Source.
  assert.deepEqual(arrows, [
    ['s-1:1', 'chat'],
    ['s-2:1', 'comment']
  ])
  const chat = `${row('s-1:1')} [data-quick-open]`
  assert.equal(await page.getAttribute(chat, 'aria-label'), 'Open chat')
  assert.equal(await page.getAttribute(chat, 'href'), CHAT_LINK)
  assert.equal(await page.getAttribute(`${row('s-2:1')} [data-quick-open]`, 'aria-label'), 'Open comment')
  assert.equal(await page.getAttribute(`${row('s-2:1')} [data-quick-open]`, 'href'), COMMENT_LINK)
  // It sits beside the Source, in the meta line.
  const inSource = await page.$eval(chat, (a) => a.closest('[data-cell]').getAttribute('data-cell'))
  assert.equal(inSource, 'source')
  // A press opens the chat and leaves the row closed.
  await page.click(chat)
  assert.deepEqual(await page.evaluate(() => window.__quick), [[CHAT_LINK, '_blank']])
  assert.equal(await page.getAttribute(`${row('s-1:1')} button[aria-expanded]`, 'aria-expanded'), 'false')
  // Keyboard: it takes focus and opens with Enter, the row still closed.
  await page.focus(`${row('s-2:1')} [data-quick-open]`)
  await page.keyboard.press('Enter')
  assert.deepEqual((await page.evaluate(() => window.__quick)).at(-1), [COMMENT_LINK, '_blank'])
  assert.equal(await page.getAttribute(`${row('s-2:1')} button[aria-expanded]`, 'aria-expanded'), 'false')
  // A press elsewhere on the line still opens the row.
  await page.click(`${row('wordpress-tracy-log:91')} [data-cell="by"]`)
  assert.equal(
    await page.getAttribute(`${row('wordpress-tracy-log:91')} button[aria-expanded]`, 'aria-expanded'),
    'true'
  )
})

test('quick-open arrow: none on a chat someone else typed, none on a deleted comment', async () => {
  await page.evaluate(() => {
    window.__chatNotMine = true
    window.__commentDeleted = true
  })
  try {
    await mount()
    assert.equal(await page.$('#panel [data-quick-open]'), null)
  } finally {
    await page.evaluate(() => {
      window.__chatNotMine = false
      window.__commentDeleted = false
    })
  }
})

/** Play dsh's `conversation` service: every `sendSession` recorded; `__sendKind` decides the answer. */
async function playConversation(p = page) {
  await p.evaluate(() => {
    window.__sent = []
    window.__sendKind = 'success'
    window.__services.conversation = {
      sendSession: (session, text, attachments, mode) => {
        window.__sent.push({ sessionId: session.sessionId, text, attachments, mode })
        return new Promise((resolve) => setTimeout(() => resolve({ kind: window.__sendKind }), 150))
      }
    }
  })
}

test('Ask Tracy to revert: one press SENDS one message — the person’s sentence and a chip carrying the whole record', async () => {
  await page.evaluate(() => {
    window.__mainSession = 's-main'
  })
  await playConversation()
  try {
    await mount()
    await page.click(`${row('s-1:1')} button[aria-expanded]`)
    const button = `${row('s-1:1')} [data-ask-revert]`
    assert.equal((await page.textContent(button)).trim(), 'Ask Tracy to revert')
    await page.click(button)
    // On its way: said, and a second press cannot send it twice.
    assert.equal(await page.textContent(`${row('s-1:1')} [data-ask-revert-result]`), 'Sending to Tracy…')
    assert.equal(await page.getAttribute(button, 'disabled'), '')
    await page.waitForSelector(`${row('s-1:1')} [data-ask-revert-result="sent"]`)
    assert.equal(await page.textContent(`${row('s-1:1')} [data-ask-revert-result]`), 'Sent to Tracy')
    const sent = await page.evaluate(() => window.__sent)
    assert.equal(sent.length, 1, 'exactly one message')
    const [{ sessionId, text, attachments, mode }] = sent
    assert.equal(sessionId, 's-main', 'to the conversation on screen')
    assert.deepEqual(attachments, [])
    assert.equal(mode, 'queue', 'never interrupts a running turn')
    // The sentence the person reads, then ONE fenced block holding the machine part, whole.
    // A Chat row's title is its request in quotation marks (06/10/2026): the sentence quotes the same words.
    const description = (await page.textContent(`${row('s-1:1')} .tv-activity-desc-text`))
      .trim()
      .replace(/^“|”$/g, '')
    assert.ok(
      text.startsWith(`Revert “${description}” — only this change.\n\n\`\`\`tracy-revert\n`),
      text.slice(0, 120)
    )
    assert.ok(text.endsWith('\n```'))
    assert.match(text, /\nPlease revert one recorded change on the site demo\.tracy\.site/)
    assert.match(text, /commit 7c1e0a94d2b8/)
    assert.match(text, /- page 12 \(updated\)/)
    assert.match(text, /\nWhere earlier values may still be kept:/)
    assert.match(text, /\nScope: only these items/)
    assert.match(
      text,
      /\*\*If you cannot find an earlier value in a revision, the Trash, the site’s Git history, or a value the Tracy plugin recorded when it made the change, ask me for it\. Never guess an earlier value\.\*\*/
    )
    assert.match(
      text,
      /suggest one only if one of those sources records a change whose new value is exactly what the site holds now/
    )
    // The chat draws that block as a chip: dsh's fold for `tracy-revert` answers one, with the record
    // as its hover text; the wire text above is what the model reads.
    const chip = await page.evaluate((t) => {
      const fold = window.__folds.find((f) => f.fence === 'tracy-revert')
      const c = fold?.fold(t.slice(t.indexOf('```')), '')
      return c && { label: c.label, title: c.title, icon: c.icon != null }
    }, text)
    assert.equal(chip.label, 'Revert details')
    assert.match(chip.title, /^Recorded: made /)
    assert.equal(chip.icon, true)
    // The old prefill words are gone.
    assert.doesNotMatch(await page.textContent(row('s-1:1')), /Added to the chat box/)
  } finally {
    await page.evaluate(() => {
      window.__mainSession = undefined
      delete window.__services.conversation
    })
  }
})

test('Ask Tracy to revert: refused by dsh says so; Undo file changes still opens its dialog and sends nothing', async () => {
  await page.evaluate(() => {
    window.__mainSession = 's-main'
  })
  await playConversation()
  try {
    await page.evaluate(() => {
      window.__sendKind = 'error'
    })
    await mount()
    await page.click(`${row('s-1:1')} button[aria-expanded]`)
    await page.click(`${row('s-1:1')} [data-ask-revert]`)
    await page.waitForSelector(`${row('s-1:1')} [data-ask-revert-result="failed"]`)
    assert.equal(
      await page.textContent(`${row('s-1:1')} [data-ask-revert-result]`),
      'Tracy did not take the request. Try again.'
    )
    // Restore files is unchanged: a confirm dialog over the server's door, no chat message.
    const before = await page.evaluate(() => window.__sent.length)
    await page.click(`${row('s-1:1')} [data-row-undo]`)
    await page.waitForSelector('[role=dialog]')
    await page.waitForFunction(() =>
      document.querySelector('[data-undo-count]')?.textContent?.includes('7 files')
    )
    await page.click('[role=dialog] button:has-text("Undo 7 files")')
    await page.waitForSelector('[role=dialog]', { state: 'detached' })
    assert.ok(
      await page.evaluate(() =>
        window.__requests.some((r) => r.method === 'POST' && r.url.endsWith('/restore'))
      ),
      'Undo goes to the server’s door'
    )
    assert.equal(await page.evaluate(() => window.__sent.length), before, 'Undo sends no chat message')
  } finally {
    await page.evaluate(() => {
      window.__mainSession = undefined
      delete window.__services.conversation
    })
  }
})

test('Ask Tracy to revert: no conversation on screen says so; never on an undo; never on a row with nothing to put back', async () => {
  await playConversation()
  await mount()
  await page.click(`${row('s-2:1')} button[aria-expanded]`)
  await page.click(`${row('s-2:1')} [data-ask-revert]`)
  await page.waitForSelector(`${row('s-2:1')} [data-ask-revert-result="no-chat"]`)
  assert.equal(
    await page.textContent(`${row('s-2:1')} [data-ask-revert-result]`),
    'Open a chat on this site first, then ask again.'
  )
  assert.deepEqual(await page.evaluate(() => window.__sent), [], 'nothing sent')
  await page.evaluate(() => {
    delete window.__services.conversation
  })
  // The undo event itself: no revert offered.
  await page.click(`${row('op-9')} button[aria-expanded]`)
  assert.equal(await page.$(`${row('op-9')} [data-ask-revert]`), null)
  // A request-only legacy turn recorded no change: nothing to revert.
  await page.click(`${row('s-0:1')} button[aria-expanded]`)
  assert.equal(await page.$(`${row('s-0:1')} [data-ask-revert]`), null)
  // A CMS admin edit is offered (content and settings are asked for, not undone).
  await page.click(`${row('wordpress-tracy-log:91')} button[aria-expanded]`)
  assert.ok(await page.$(`${row('wordpress-tracy-log:91')} [data-ask-revert]`))
})

test('the boot cover still up: the message is marked only once the cover lifts (wave r1 B1)', async () => {
  const { p, errors } = await conversationPage(`?tracy-msg=${MSG}`, () => {
    const cover = document.createElement('div')
    cover.className = 'tracy-boot-cover'
    document.body.appendChild(cover)
    const n = document.createElement('div')
    n.dataset.chatNodeKey = '13:input-messaged6bf0971-4d24-4919-8451-2d7519f0da7a'
    document.body.appendChild(n)
    window.__flashSeenAt = null
    window.__coverGoneAt = null
    new MutationObserver(() => {
      if (window.__flashSeenAt === null && document.querySelector('[data-tracy-msg-flash]'))
        window.__flashSeenAt = performance.now()
    }).observe(document.body, { subtree: true, attributes: true })
    setTimeout(() => {
      window.__coverGoneAt = performance.now()
      cover.remove()
    }, 1500)
  })
  await p.waitForSelector('[data-tracy-msg-flash]', { state: 'attached', timeout: 8000 })
  const { flash, gone } = await p.evaluate(() => ({
    flash: window.__flashSeenAt,
    gone: window.__coverGoneAt
  }))
  assert.ok(gone !== null && flash !== null && flash >= gone, `marked at ${flash}, cover gone at ${gone}`)
  assert.deepEqual(errors, [])
  await p.close()
})

test('Restore… on a backup: one dialog, Everything chosen first, Files only with what it breaks (Brian 03/10)', async () => {
  await mountBackups()
  await page.click(`${row('backup-4')} button[aria-expanded]`)
  await page.click(`${row('backup-4')} [data-restore="backup"]`)
  await page.waitForSelector('[role=dialog] [data-scope-choice]')
  const options = await page.$$eval('[role=dialog] [data-scope-option]', (els) =>
    els.map((e) => [e.getAttribute('data-scope-option'), e.querySelector('input').checked, e.textContent])
  )
  assert.deepEqual(
    options.map(([s, checked]) => [s, checked]),
    [
      ['everything', true],
      ['files', false]
    ]
  )
  assert.match(options[0][2], /^Everything$/)
  assert.equal(
    options[1][2],
    'Files onlyImages uploaded after this backup are removed; posts that use them will show broken images.'
  )
  // Everything is the heavy dialog; Files only swaps the content in the same window.
  assert.ok(await page.$('[role=dialog] [data-confirm-word]'))
  await page.click('[role=dialog] [data-scope-option="files"] input')
  await page.waitForSelector('[role=dialog] button:has-text("Restore the files")')
  assert.equal(await page.$('[role=dialog] [data-confirm-word]'), null)
  assert.equal(await page.$$eval('[role=dialog]', (els) => els.length), 1)
  await page.click('[role=dialog] [data-scope-option="everything"] input')
  await page.waitForSelector('[role=dialog] [data-confirm-word]')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
  assert.equal(await restorePosts().then((p) => p.length), 0, 'closed, nothing restored')

  // A backup without its database: Files only, stated, with why — no choice.
  await page.click(`${row('backup-2')} button[aria-expanded]`)
  await page.click(`${row('backup-2')} [data-restore="backup"]`)
  await page.waitForSelector('[role=dialog] [data-scope-only="files"]')
  assert.match(
    await page.textContent('[role=dialog] [data-scope-only]'),
    /Restore: Files only.*Images uploaded after this backup are removed.*Restore everything isn’t offered: this backup has no copy of the database\./
  )
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
})

test('Create a backup with long notes: the notes scroll inside a capped field, the dialog fits, its footer stays', async () => {
  await page.setViewportSize({ width: 1000, height: 600 })
  try {
    await mountBackups([point(1, 60 * 40, { database: FULL })])
    await page.click('#panel [data-create-backup]')
    await page.waitForSelector('[role=dialog] [data-draft]')
    const long = Array.from(
      { length: 24 },
      (_, i) =>
        `· Change ${i + 1}: updated the page heading and the hero image on the About us page — Chat, Mai Tran`
    ).join('\n')
    await page.fill('[role=dialog] [data-draft]', long)
    const geo = await page.evaluate(() => {
      const notes = document.querySelector('[role=dialog] [data-draft]')
      const dialog = document.querySelector('[role=dialog]').getBoundingClientRect()
      const create = [...document.querySelectorAll('[role=dialog] button')]
        .find((b) => b.textContent.includes('Create backup'))
        .getBoundingClientRect()
      const line = Number.parseFloat(getComputedStyle(notes).lineHeight)
      return {
        vh: window.innerHeight,
        notes: notes.getBoundingClientRect().height,
        scrolls: notes.scrollHeight > notes.clientHeight,
        overflowY: getComputedStyle(notes).overflowY,
        line,
        dialogTop: dialog.top,
        dialogBottom: dialog.bottom,
        createBottom: create.bottom,
        createTop: create.top
      }
    })
    assert.ok(geo.notes <= geo.vh * 0.4 + 1, `notes at most 40% of the window: ${JSON.stringify(geo)}`)
    assert.ok(geo.notes <= geo.line * 11 + 20, `notes at most about ten lines: ${JSON.stringify(geo)}`)
    assert.ok(geo.scrolls && geo.overflowY === 'auto', `the notes scroll themselves: ${JSON.stringify(geo)}`)
    assert.ok(geo.dialogTop >= 0 && geo.dialogBottom <= geo.vh, `the dialog fits: ${JSON.stringify(geo)}`)
    assert.ok(
      geo.createTop >= 0 && geo.createBottom <= geo.vh,
      `Create backup is on screen: ${JSON.stringify(geo)}`
    )
    // A window too short for the dialog: its body scrolls, header and footer stay on screen.
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role=dialog]', { state: 'detached' })
    await page.setViewportSize({ width: 1000, height: 380 })
    await page.click('#panel [data-create-backup]')
    await page.waitForSelector('[role=dialog] [data-draft]')
    await page.fill('[role=dialog] [data-draft]', long)
    const short = await page.evaluate(() => {
      const dialog = document.querySelector('[role=dialog]').getBoundingClientRect()
      const title = document.querySelector('[role=dialog] h2').getBoundingClientRect()
      const create = [...document.querySelectorAll('[role=dialog] button')]
        .find((b) => b.textContent.includes('Create backup'))
        .getBoundingClientRect()
      return {
        vh: window.innerHeight,
        top: dialog.top,
        bottom: dialog.bottom,
        title: title.top,
        create: create.bottom
      }
    })
    assert.ok(
      short.top >= 0 && short.bottom <= short.vh,
      `the dialog fits a short window: ${JSON.stringify(short)}`
    )
    assert.ok(
      short.title >= 0 && short.create <= short.vh,
      `header and footer on screen: ${JSON.stringify(short)}`
    )
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role=dialog]', { state: 'detached' })
  } finally {
    await page.setViewportSize({ width: 1000, height: 920 })
  }
})
const backupPost = () =>
  page.evaluate(() => window.__requests.find((r) => r.method === 'POST' && r.url.endsWith('/backup')))

test('Create a backup: the title is a field from the start — a fixed "Backup N ·" before it, the date and time in it', async () => {
  await mountBackups([point(1, 60 * 40, { database: FULL }), point(2, 60 * 25, { database: FULL })])
  await page.click('#panel [data-create-backup]')
  await page.waitForSelector('[role=dialog] [data-title-prefix="number"]')
  // The number is not part of the field: it cannot be edited, so the list never reads it twice.
  assert.equal((await page.textContent('[role=dialog] [data-title-prefix]')).trim(), 'Backup 3 ·')
  const field = '[role=dialog] #tracy-backup-title'
  const value = await page.inputValue(field)
  assert.match(value, /\d/, 'the date and time')
  assert.doesNotMatch(value, /Backup/)
  assert.equal(await page.isEditable(field), true)
  // No modes: no Edit link, no Save or Cancel of its own.
  assert.equal(await page.$('[role=dialog] [data-title-edit], [role=dialog] [data-title-save]'), null)
  assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).count(), 1, 'the dialog’s own')
  await page.fill(field, 'Before the menu')
  await page.click('[role=dialog] button:has-text("Create backup")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
  assert.equal((await backupPost()).body.title, 'Before the menu', 'stored without "Backup 3 · "')
})

test('Create a backup: a title typed with its number is stored once; an emptied one is the date and time', async () => {
  await mountBackups([point(1, 60 * 40, { database: FULL }), point(2, 60 * 25, { database: FULL })])
  await page.click('#panel [data-create-backup]')
  await page.waitForSelector('[role=dialog] [data-title-prefix="number"]')
  await page.fill('[role=dialog] #tracy-backup-title', 'Backup 3 · Before the menu')
  await page.click('[role=dialog] button:has-text("Create backup")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
  assert.equal((await backupPost()).body.title, 'Before the menu')

  await mountBackups([point(1, 60 * 40, { database: FULL })])
  await page.click('#panel [data-create-backup]')
  await page.waitForSelector('[role=dialog] [data-title-prefix="number"]')
  await page.fill('[role=dialog] #tracy-backup-title', '  ')
  await page.click('[role=dialog] button:has-text("Create backup")')
  await page.waitForSelector('[role=dialog]', { state: 'detached' })
  const title = (await backupPost()).body.title
  assert.match(title, /\d/, 'the date and time, not an empty title')
  assert.doesNotMatch(title, /^Backup/)
})

/** Every interface language's words for this plugin (`packages/locale`), keyed by language. */
function siteTabsWords() {
  const locales = path.join(repoRoot, 'packages/locale')
  const files = {
    vi: path.join(locales, 'tracy-locale-vi/vi/tracy-site-tabs.json'),
    ...Object.fromEntries(
      ['de', 'es', 'fr', 'it', 'nl', 'zh'].map((l) => [
        l,
        path.join(locales, `tracy-locales/${l}/tracy-site-tabs.json`)
      ])
    )
  }
  return Object.fromEntries(Object.entries(files).map(([l, f]) => [l, JSON.parse(readFileSync(f, 'utf8'))]))
}

test('E10.2: a translated Source label is never cut in the meta line', async () => {
  try {
    for (const [language, words] of Object.entries(siteTabsWords())) {
      await page.evaluate((w) => (window.__strings = w), words)
      await mount({ width: 900 })
      const cut = await page.$$eval('#panel [data-cell="source"] .tv-activity-cell-text', (els) =>
        els
          .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
          .map((el) => el.textContent)
      )
      assert.deepEqual(cut, [], `${language}: no Source label is cut`)
    }
  } finally {
    await page.evaluate(() => (window.__strings = null))
  }
})

test('E10.2: a long restore title wraps clear of the dialog Close (vi, de, and every other language)', async () => {
  try {
    for (const [language, words] of Object.entries(siteTabsWords())) {
      await page.evaluate((w) => (window.__strings = w), words)
      await mountBackups()
      await openEverything(4)
      const clash = await page.evaluate(() => {
        const d = document.querySelector('[role=dialog]')
        const close = d.querySelector('[data-slot="dialog-close"]').getBoundingClientRect()
        const title = d.querySelector('[data-slot="dialog-title"]')
        const range = document.createRange()
        range.selectNodeContents(title)
        const lines = [...range.getClientRects()]
        const hits = lines.filter(
          (r) => r.right > close.left && r.left < close.right && r.bottom > close.top && r.top < close.bottom
        )
        // Wrapped lines must not overlap each other either (a leading-none title stacked them).
        const sorted = [...lines].sort((a, b) => a.top - b.top)
        const stacked = sorted.some(
          (r, i) => i > 0 && r.top < sorted[i - 1].bottom - 1 && r.top !== sorted[i - 1].top
        )
        return { hits: hits.length, stacked, lines: lines.length, text: title.textContent }
      })
      assert.equal(clash.hits, 0, `${language}: the title runs under Close: ${clash.text}`)
      assert.equal(clash.stacked, false, `${language}: wrapped title lines overlap: ${clash.text}`)
      await page.keyboard.press('Escape')
      await page.waitForSelector('[role=dialog]', { state: 'detached' })
    }
  } finally {
    await page.evaluate(() => (window.__strings = null))
  }
})
