/**
 * The Site changes tab's side of the undo guard and of hidden configuration files (plan
 * `tasks/todo-site-changes.md` Q1), driven in a real browser over the real tabs:
 *
 *   - a row Tracy did not make (outside) has no Undo file changes: no button in it, no item in its
 *     "…" menu;
 *   - an undo the host refused says why: 409 CONFLICT lists the files that changed since, 403 says
 *     the role cannot change files, 409 NOT_UNDOABLE says Tracy did not make the change — and each
 *     keeps the dialog open with only a Close button;
 *   - the Diff tab of a configuration file says its contents are not shown.
 *
 * Harness as in `tab-loading.test.mjs`: `playwright` from apps/tracy-host, `react-dom` from
 * @tracy/core; a missing dependency or browser FAILS instead of skipping.
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

let outDir
let server
let browser
let page
const errors = []

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tst-undo-guard-'))
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
    entryPoints: [path.join(here, '..', 'fixtures', 'undo-guard-entry.tsx')],
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
      '#panel{position:relative;box-sizing:border-box;width:600px;height:700px;margin:40px;overflow:auto}' +
      '</style></head><body><div id="panel"></div><script src="/app.js"></script></body></html>'
  )
  server = http.createServer((req, res) => {
    const name = req.url.split('?')[0].endsWith('/app.js') ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/${SITE}/`)
  await page.waitForFunction(() => Boolean(window.__tabs?.['tracy:changes']), null, { timeout: 8000 })
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  assert.deepEqual(errors, [], 'no page errors')
})

/**
 * Mount the Site changes tab. `edit(base)` gets a copy of the fixture's `/activity` and
 * `/moments/:sha/files` answers and changes it in place (dev round 02/10 cases).
 */
async function mountChanges(restore, edit = null) {
  const base = await page.evaluate(() => window.__base)
  if (edit) edit(base)
  await page.evaluate(
    ([site, restore, base]) => {
      window.__activity = base.activity
      window.__files = base.files
      window.__restore = restore
      window.__posts = []
      window.__mount('tracy:changes', { siteKey: site })
    },
    [SITE, restore, base]
  )
  await page.getByText('Use the darker brown').waitFor()
}

const OK = { status: 200, body: { ok: true, files: 1, head: 'd4', operationId: 'op-1', status: 'succeeded' } }

const row = (id) => page.locator(`#panel [data-event="${id}"]`)

/** Open a row in place, and wait for its files. */
async function open(id) {
  await row(id).locator('button[aria-expanded]').first().click()
  await row(id).locator('[data-detail]').getByText('wp-content/themes/x/style.css').waitFor()
}

/** The row's "…" menu, open; its items' names. */
async function menuOf(id) {
  await row(id).hover()
  await row(id).getByRole('button', { name: 'More' }).click()
  const menu = page.getByRole('menu')
  await menu.waitFor()
  return menu
}

test('an outside row has no Undo file changes: not in the opened row, not in its menu', async () => {
  await mountChanges(OK)
  await open('c3c3c3c')
  const outside = row('c3c3c3c')
  assert.equal(await outside.getByRole('button', { name: /Undo/ }).count(), 0)
  assert.match(await outside.innerText(), /Undo isn’t offered for changes Tracy didn’t make/)
  const menu = await menuOf('c3c3c3c')
  assert.equal(await menu.getByRole('menuitem', { name: /Undo/ }).count(), 0)
  assert.equal(await menu.getByRole('menuitem', { name: /Copy the commit id/ }).count(), 1)
  await page.keyboard.press('Escape')
  // A commit Tracy made has its one Undo on the row, always on screen; the opened detail does not repeat it.
  await open('s-1:2')
  assert.equal(await row('s-1:2').locator('[data-row-undo]').count(), 1)
  assert.equal(
    await row('s-1:2').locator('[data-detail]').getByRole('button', { name: 'Undo file changes…' }).count(),
    0
  )
})

async function refusedUndo(restore) {
  await mountChanges(restore)
  await open('s-1:2')
  await row('s-1:2').locator('[data-row-undo]').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Undo 1 file' }).click()
  // The refusal replaces the question: no confirm button, no "Undoing…", a Close in the footer.
  await page.waitForFunction(() => {
    const text = document.querySelector('[role="dialog"]')?.textContent ?? ''
    return text !== '' && !/Undo 1 file|Undoing…/.test(text)
  })
  assert.equal(await dialog.getByRole('button', { name: 'Cancel' }).count(), 0)
  // One press, one POST, carrying a key that names the press: a retry replays it.
  const posts = await page.evaluate(() => window.__posts)
  assert.equal(posts.length, 1)
  assert.deepEqual({ sha: posts[0].sha, mode: posts[0].mode }, { sha: 'b2b2b2b', mode: 'undo' })
  assert.match(posts[0].idemKey, /^[A-Za-z0-9._:-]{8,128}$/)
  return dialog
}

test('409 CONFLICT: the dialog says nothing was changed and lists the files that changed since', async () => {
  const dialog = await refusedUndo({
    status: 409,
    body: { code: 'CONFLICT', files: ['wp-content/themes/x/style.css', 'wp-content/themes/x/header.php'] }
  })
  const text = await dialog.innerText()
  assert.match(text, /Can’t undo these file changes/)
  assert.match(text, /These files changed after this moment\. .*nothing was changed\./)
  const files = dialog.getByRole('list', { name: 'Files changed since' })
  assert.deepEqual(await files.getByRole('listitem').allInnerTexts(), [
    'wp-content/themes/x/style.css',
    'wp-content/themes/x/header.php'
  ])
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await dialog.waitFor({ state: 'detached' })
})

test('403 FORBIDDEN_WRITE: the dialog says the role cannot change files', async () => {
  const dialog = await refusedUndo({
    status: 403,
    body: { code: 'FORBIDDEN_WRITE', toolset: 'code', role: 'editor' }
  })
  const text = await dialog.innerText()
  assert.match(text, /You can’t undo changes on this site/)
  assert.match(text, /Your role here can see changes but not change files\. Nothing was changed\./)
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await dialog.waitFor({ state: 'detached' })
})

test('409 NOT_UNDOABLE: the dialog says Tracy did not make this change', async () => {
  const dialog = await refusedUndo({ status: 409, body: { code: 'NOT_UNDOABLE' } })
  const text = await dialog.innerText()
  assert.match(text, /Can’t undo these file changes/)
  assert.match(text, /Undo isn’t offered for changes Tracy didn’t make/)
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await dialog.waitFor({ state: 'detached' })
})

test('the Diff tab of a configuration file says its contents are not shown', async () => {
  await page.evaluate((site) => {
    window.__diff = {
      status: 200,
      body: { path: 'wp-config.php', blocked: true, reason: 'configuration-file' }
    }
    window.__mount('tracy:diff', { siteKey: site, path: 'wp-config.php' })
  }, SITE)
  await page.getByText('Configuration file, contents not shown.').waitFor()
  const text = await page.locator('#panel').innerText()
  assert.doesNotMatch(text, /No text changes in this file/)
})

// ── Dev round 02/10 ─────────────────────────────────────────────────────────────────────────────

test('a seat that may not write files sees no Undo file changes: not in the opened row, not in its menu', async () => {
  await mountChanges(OK, (base) => {
    for (const item of base.activity.items)
      item.capabilities = { canDiff: true, canUndoFiles: false, reasons: ['forbidden'] }
  })
  await open('s-1:2')
  const agent = row('s-1:2')
  assert.equal(await agent.getByRole('button', { name: /Undo/ }).count(), 0)
  assert.match(await agent.innerText(), /Your role on this site can see changes but not undo them\./)
  const menu = await menuOf('s-1:2')
  assert.equal(await menu.getByRole('menuitem', { name: /Undo/ }).count(), 0)
  assert.equal(await menu.getByRole('menuitem', { name: /Copy the commit id/ }).count(), 1)
  await page.keyboard.press('Escape')
})

test('a moment past the host cap says how many of its files are listed, never shows the cut list as all', async () => {
  await mountChanges(OK, (base) => {
    base.activity.items[1].effects.files.count = 1277
    base.files.truncated = true
  })
  await open('s-1:2')
  assert.match(await row('s-1:2').innerText(), /Showing 1 of 1277 files\./)
  // Not cut: no such line.
  await mountChanges(OK)
  await open('s-1:2')
  assert.doesNotMatch(await row('s-1:2').innerText(), /Showing|not listed/)
})

test('an EmDash site: the foot says what the list cannot see; WordPress says its admin edits are tracked', async () => {
  await mountChanges(OK, (base) => {
    base.activity.coverage = {
      git: 'read',
      gitTruncated: false,
      since: null,
      fileHistory: false,
      cmsLog: {
        source: 'emdash-audit-log',
        limits: ['menus', 'settings', 'media'],
        enabled: true,
        reason: null,
        lastPulledAt: null,
        lastError: null
      }
    }
  })
  const foot = page.locator('[data-coverage]')
  await foot.waitFor()
  const text = await foot.innerText()
  assert.match(text, /What this list cannot see on EmDash/)
  assert.match(text, /its admin log does not cover menus, settings or media/)
  // Said once, in the block: the line under it does not repeat the limits.
  assert.match(text, /^EmDash admin edits are tracked\.$/m)
  // WordPress keeps both promises as they were.
  await mountChanges(OK, (base) => {
    base.activity.coverage = {
      git: 'read',
      gitTruncated: false,
      since: null,
      fileHistory: true,
      cmsLog: {
        source: 'wordpress-tracy-log',
        limits: [],
        enabled: true,
        reason: null,
        lastPulledAt: null,
        lastError: null
      }
    }
  })
  const wp = await page.locator('[data-coverage]').innerText()
  assert.match(wp, /WordPress admin edits are tracked\./)
  assert.doesNotMatch(wp, /What this list cannot see/)
})
