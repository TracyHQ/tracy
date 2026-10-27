/**
 * The site's Publish tab in a real browser (07/10/2026): "Publish" in a My Sites row's menu opens a
 * tab of its own — `tracy:site-publish` — and the Settings tab no longer carries the Domains section.
 *
 * The fixture (`../fixtures/site-publish-screen-entry.tsx`) runs this plugin's real `apply()`, mounts
 * the tabs it registers the way dsh's right column holds them (one tab of a type, retargeted by a
 * second open), and draws the real `MoreMenu` of My Sites beside them. Pinned here:
 *
 *   - the menu: `Settings`, and directly below it one line `Publish` — the same words for a draft, a
 *     live site and one being published — and each opens its own tab type;
 *   - Settings keeps the site head and the CMS's rows; Publish is the stepped wizard (23/10/2026):
 *     no site head, the site's state on its address card, titled after its site, and it follows a
 *     retarget;
 *   - the domain step: the Owner's alone, and gone when the `site-connect-domain` switch is off;
 *   - the DNS record rows of an own domain: every label shares a baseline with its value, the three
 *     rows keep one rhythm, `Record name` and `Record value` each have a copy button right after
 *     their text, and a long value wraps inside the box at a narrow width — in both themes;
 *   - focus is one 1px stroke, never a halo.
 *
 * Screenshots and the measurements are written to `TRACY_TEST_ARTIFACT_DIR` when it is set.
 *
 * Harness rules as in `tab-loading.test.mjs`: dependencies resolved from the packages that declare
 * them, and a missing dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const mySitesPkg = path.join(repoRoot, 'packages/site/tracy-my-sites')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

const SITE = 'acme.tracy.site'
const OTHER = 'harbor.tracy.site'
const SETTINGS = 'tracy:site-settings'
const PUBLISH = 'tracy:site-publish'
const DOMAIN = 'www.acme-studio.example'
const TOKEN = 'tracy-verify=4f9c1e7a2b8d4c6e9a0f3b5d7c1e2a4f6b8d0c2e4a6f8b0d'
const TARGET = 'sites.tracy.site'
/** Kept outside the tree when the runner names a place; otherwise nothing is kept. */
const EVIDENCE = process.env.TRACY_TEST_ARTIFACT_DIR
  ? path.join(process.env.TRACY_TEST_ARTIFACT_DIR, 'site-publish-screen')
  : null

/** An own domain waiting for its DNS records, as `apps/tracy-web` `addressChangeState` sends it. */
const PENDING = {
  name: DOMAIN,
  kind: 'custom',
  state: 'pending',
  verification: { type: 'TXT', name: `_tracy.${DOMAIN}`, value: TOKEN },
  routing: { type: 'CNAME', name: DOMAIN, value: TARGET },
  readiness: { ownership: false, routing: false, tls: false },
  checks: [
    {
      record: 'ownership',
      type: 'TXT',
      name: `_tracy.${DOMAIN}`,
      expected: TOKEN,
      status: 'unchecked',
      observed: []
    },
    { record: 'routing', type: 'CNAME', name: DOMAIN, expected: TARGET, status: 'unchecked', observed: [] }
  ]
}

let outDir
let server
let base
let browser
let page
const errors = []

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tst-site-publish-'))
  if (EVIDENCE) mkdirSync(EVIDENCE, { recursive: true })
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
    entryPoints: [path.join(here, '..', 'fixtures', 'site-publish-screen-entry.tsx')],
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
    nodePaths: [
      path.join(pkgRoot, 'node_modules'),
      path.join(corePkg, 'node_modules'),
      path.join(mySitesPkg, 'node_modules')
    ],
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
  // `#panel` is dsh's right column: a fixed-width box the test narrows; each open tab is a pane in it.
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif;' +
      'background:var(--background)}#menu{margin:16px}#panel{position:relative;box-sizing:border-box;' +
      'width:560px;margin:16px}.pane{position:relative;height:auto;margin-bottom:16px}' +
      '</style></head><body><div id="menu"></div><div id="panel"></div>' +
      '<script src="/app.js"></script></body></html>'
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
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/${SITE}/`)
  await page.waitForFunction(() => Object.keys(window.__tabs ?? {}).length >= 5, null, { timeout: 8000 })
  assert.deepEqual(errors, [], 'the fixture page boots without errors')
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Every test starts from no open tab, the light theme, a wide column and its own server state. */
beforeEach(async () => {
  await page.evaluate(() => {
    window.__close()
    window.__server = {}
    document.documentElement.classList.remove('dark')
    document.body.removeAttribute('data-ds-dark-theme')
    document.documentElement.removeAttribute('data-tracy-hide')
    document.getElementById('panel').style.width = '560px'
  })
})

/**
 * Put sites on the fake server, and say the list changed as the real page does: the page keeps one
 * `/api/sites` answer for 30 s, and a WordPress Owner's Publish tab waits for that list (it may sync).
 */
const serve = (sites) =>
  page.evaluate((sites) => {
    Object.assign(window.__server, sites)
    window.dispatchEvent(new Event('tracy:sites-changed'))
  }, sites)
const site = (over = {}) => ({ role: 'owner', publish: 'draft', operation: null, pending: null, ...over })
const pane = (type) => `[data-pane="${type}"]`
const wizard = `${pane(PUBLISH)} [data-publish-wizard]`
const stepNow = () => page.getAttribute(wizard, 'data-publish-step')

/**
 * Walk the Publish wizard to `target` the way a person does: on the first step choose "online" and
 * press Continue, then Continue (or a draft's way to its domain) on each step. Stops where the next
 * step is not offered.
 */
async function walk(target) {
  await page.waitForSelector(wizard)
  for (let i = 0; i < 5; i++) {
    const at = await stepNow()
    if (at === target) return
    if (at === 'kind') {
      await page.click(`${wizard} [data-publish-kinds] [role="radio"] >> nth=0`)
      await page.click(`${wizard} [data-wizard-continue]`)
    } else {
      const next = page.locator(`${wizard} [data-publish-next], ${wizard} [data-action="to-domain"]`)
      if ((await next.count()) === 0) return
      await next.first().click()
    }
    await page.waitForFunction(
      ([root, from]) => document.querySelector(root)?.getAttribute('data-publish-step') !== from,
      [wizard, at]
    )
  }
}

/** Draw the row's menu for `row`, open it, and say what it lists. */
async function openMenu(row) {
  await page.evaluate((row) => window.__row(row), { siteKey: SITE, ...row })
  await page.click('#menu button[aria-label="More"]')
  await page.waitForSelector('[role="menuitem"]')
  return page.$$eval('[role="menuitem"]', (items) =>
    items.map((item) => ({
      text: item.textContent.trim(),
      top: Math.round(item.getBoundingClientRect().top)
    }))
  )
}
async function pressMenu(row, line) {
  await openMenu(row)
  await page.click(`[role="menuitem"]:text-is("${line}")`)
}
const theme = (dark) =>
  page.evaluate((dark) => {
    document.documentElement.classList.toggle('dark', dark)
    if (dark) document.body.setAttribute('data-ds-dark-theme', '')
    else document.body.removeAttribute('data-ds-dark-theme')
  }, dark)
const shot = async (name) => {
  if (EVIDENCE) await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true })
}

test('the row menu: Settings, and directly below it one line "Publish" — the same for a draft, a live site and one being published', async () => {
  await serve({ [SITE]: site() })
  const rows = [
    { publish: 'draft' },
    { publish: 'published' },
    { publish: 'draft', publishing: 'live' },
    { publish: 'published', publishing: 'draft' },
    { publish: 'published', role: 'editor' },
    { publish: 'draft', role: 'viewer' }
  ]
  for (const row of rows) {
    const items = await openMenu(row)
    const texts = items.map((item) => item.text)
    const at = texts.indexOf('Site settings')
    assert.notEqual(at, -1, `${JSON.stringify(row)}: Site settings is listed`)
    assert.equal(texts[at + 1], 'Publish', `${JSON.stringify(row)}: the line after Site settings`)
    assert.ok(items[at + 1].top > items[at].top, 'drawn below Site settings')
    assert.equal(texts.filter((text) => /publish|domain/i.test(text)).length, 1, `one such line: ${texts}`)
    await page.keyboard.press('Escape')
  }
  // A row the list did not say the publish state of, and a pending invitation: no such line.
  for (const row of [{}, { status: 'invited', publish: 'draft' }]) {
    const texts = (await openMenu(row)).map((item) => item.text)
    assert.equal(texts.includes('Publish'), false, `${JSON.stringify(row)}: ${texts}`)
    await page.keyboard.press('Escape')
  }
})

test('"Publish" opens a tab of its own for that site; Settings is another tab and has no Domains section', async () => {
  await serve({ [SITE]: site() })
  await pressMenu({ publish: 'draft' }, 'Publish')
  await walk('address')
  await page.waitForSelector(`${wizard} [data-card="primary"] [data-status]`)
  assert.deepEqual(await page.evaluate(() => window.__opened), [{ type: PUBLISH, meta: { siteKey: SITE } }])
  await page.waitForSelector(`${pane(PUBLISH)}[data-pane-title="Publish · ${SITE}"]`)

  await pressMenu({ publish: 'draft' }, 'Site settings')
  await page.waitForSelector(`${pane(SETTINGS)} .tv-site-rows`)
  await page.waitForSelector(`${pane(SETTINGS)}[data-pane-title="Site settings · ${SITE}"]`)
  const drawn = await page.evaluate(
    ([settings, publish]) => {
      const read = (root) => ({
        head: root.querySelectorAll('.tv-site-head').length,
        chip:
          root
            .querySelector('.tv-site-head [data-status], [data-card="primary"] [data-status]')
            ?.getAttribute('data-status') ?? null,
        wizard: root.querySelectorAll('[data-publish-wizard]').length,
        domains: root.querySelectorAll('[data-section="domains"]').length,
        actions: [...root.querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action')),
        rows: root.querySelectorAll('.tv-site-rows').length,
        screen: root.querySelector('[data-site-screen]')?.getAttribute('data-site-screen') ?? null
      })
      return {
        settings: read(document.querySelector(settings)),
        publish: read(document.querySelector(publish)),
        panes: [...document.querySelectorAll('[data-pane]')].map((p) => p.getAttribute('data-pane'))
      }
    },
    [pane(SETTINGS), pane(PUBLISH)]
  )
  assert.deepEqual(drawn.panes, [PUBLISH, SETTINGS], 'two tabs, side by side')
  assert.deepEqual(drawn.settings, {
    head: 1,
    chip: 'draft',
    wizard: 0,
    domains: 0,
    actions: [],
    rows: 1,
    screen: 'settings'
  })
  assert.equal(drawn.publish.head, 0, 'the wizard draws no site head')
  assert.equal(drawn.publish.chip, 'draft', 'the state sits on the address card')
  assert.equal(drawn.publish.wizard, 1)
  assert.equal(drawn.publish.rows, 0, 'the CMS rows stay on Settings')
  // The Publish screen is the wizard itself, with no screen wrapper of its own.
  assert.equal(drawn.publish.screen, null)
  // A draft with no domain yet: publish it, or change its Tracy address. A new domain comes once live.
  assert.deepEqual(drawn.publish.actions.sort(), ['change-address', 'live'])
  await shot('publish-and-settings-light')
  await theme(true)
  await shot('publish-and-settings-dark')
  assert.deepEqual(errors, [])
})

test('a publish pressed on the Publish tab is followed by the chip of the Settings tab of the same site', async () => {
  await serve({ [SITE]: site() })
  await pressMenu({ publish: 'draft' }, 'Site settings')
  await pressMenu({ publish: 'draft' }, 'Publish')
  await walk('address')
  await page.waitForSelector(`${pane(PUBLISH)} [data-action="live"]`)
  await page.click(`${pane(PUBLISH)} [data-action="live"]`)
  await page.waitForSelector(`${wizard} [data-card="primary"] [data-status="live"]`)
  await page.waitForSelector(`${pane(SETTINGS)} .tv-site-head [data-status="live"]`)
  const posts = (await page.evaluate(() => window.__calls)).filter((call) => call.startsWith('POST'))
  assert.deepEqual(posts, [`POST /api/sites/${SITE}/go-live`], 'one press, one request')
})

test('the open Publish tab follows a retarget: another site, its own address and state, nothing of the first', async () => {
  await serve({ [SITE]: site(), [OTHER]: site({ publish: 'published', role: 'editor' }) })
  await pressMenu({ publish: 'draft' }, 'Publish')
  await walk('address')
  await page.waitForSelector(`${wizard} [data-card="primary"] [data-status="draft"]`)
  await pressMenu({ siteKey: OTHER, publish: 'published', role: 'editor' }, 'Publish')
  // An Editor has nothing to choose: the wizard opens on the Tracy address.
  await page.waitForSelector(
    `${wizard}[data-publish-step="address"] [data-card="primary"] [data-status="live"]`
  )
  await page.waitForSelector(`${pane(PUBLISH)}[data-pane-title="Publish · ${OTHER}"]`)
  const now = await page.evaluate((publish) => {
    const root = document.querySelector(publish)
    return {
      panes: document.querySelectorAll('[data-pane]').length,
      text: root.innerText,
      actions: [...root.querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action'))
    }
  }, pane(PUBLISH))
  assert.equal(now.panes, 1, 'the same tab, retargeted')
  assert.match(now.text, new RegExp(OTHER.replaceAll('.', '\\.')))
  assert.doesNotMatch(now.text, new RegExp(SITE.replaceAll('.', '\\.')))
  assert.deepEqual(now.actions, [], 'an Editor is offered no action')
  assert.deepEqual(
    (await page.evaluate(() => window.__calls)).filter((call) => call.startsWith('POST')),
    [],
    'opening and retargeting send nothing'
  )
})

/**
 * "Export site as ZIP" in the row menu lands on the ZIP flow (`publishEntry`, `site-actions.ts` →
 * `SiteTab` `arrival`). That landing belongs to that one press: a later plain "Publish" of another
 * site, or the header's site picker, opens the wizard at its start, never on the ZIP flow again.
 */
test('"Export site as ZIP" lands on the ZIP flow once; Publish of another site and the site picker start at the choice', async () => {
  await serve({ [SITE]: site(), [OTHER]: site() })
  // The page's shared sites answer is kept a while; the picker must list both sites served here.
  await page.evaluate(() => window.dispatchEvent(new Event('tracy:sites-changed')))
  await pressMenu({ publish: 'draft' }, 'Export site as ZIP')
  await page.waitForSelector(`${wizard}[data-publish-kind="zip"][data-publish-step="zip"]`)
  assert.deepEqual(await page.evaluate(() => window.__opened), [
    { type: PUBLISH, meta: { siteKey: SITE, publishEntry: 'zip' } }
  ])
  await pressMenu({ siteKey: OTHER, publish: 'draft' }, 'Publish')
  await page.waitForSelector(`${pane(PUBLISH)}[data-pane-title="Publish · ${OTHER}"]`)
  await page.waitForSelector(wizard)
  assert.equal(await stepNow(), 'kind', 'Publish of another site starts at the choice')
  assert.equal(await page.getAttribute(wizard, 'data-publish-kind'), null)

  // Again from the ZIP landing, then the header's picker: the other site opens at its start too.
  await pressMenu({ publish: 'draft' }, 'Export site as ZIP')
  await page.waitForSelector(`${pane(PUBLISH)}[data-pane-title="Publish · ${SITE}"]`)
  await page.waitForSelector(`${wizard}[data-publish-kind="zip"][data-publish-step="zip"]`)
  await page.click(`${pane(PUBLISH)} button[aria-haspopup="menu"]`)
  await page.click(`[role="menuitem"]:has-text("${OTHER}")`)
  await page.waitForSelector(`${pane(PUBLISH)}[data-pane-title="Publish · ${OTHER}"]`)
  await page.waitForSelector(wizard)
  assert.equal(await stepNow(), 'kind', 'the picker starts at the choice')
  assert.deepEqual(errors, [])
})

test('the domain step is the Owner’s alone, and the `site-connect-domain` switch takes it away', async () => {
  for (const role of ['owner', 'admin', 'developer', 'editor']) {
    await page.evaluate(() => window.__close())
    await serve({ [SITE]: site({ role, publish: 'published' }) })
    await pressMenu({ publish: 'published', role }, 'Publish')
    await walk('domain')
    // The Owner's field opens once the step is drawn; anyone else has no domain step to stand on.
    if (role === 'owner') await page.waitForSelector(`${pane(PUBLISH)} [data-own-domain-entry]`)
    else assert.equal(await stepNow(), 'address', role)
    const shown = await page.locator(`${pane(PUBLISH)} [data-own-domain-entry]`).count()
    assert.equal(shown, role === 'owner' ? 1 : 0, role)
  }
  await page.evaluate(() => window.__close())
  await serve({ [SITE]: site({ publish: 'published' }) })
  await pressMenu({ publish: 'published' }, 'Publish')
  await walk('domain')
  const entry = page.locator(`${pane(PUBLISH)} [data-own-domain-entry]`)
  await entry.waitFor()
  assert.equal(await entry.isVisible(), true)
  await page.evaluate(() => document.documentElement.setAttribute('data-tracy-hide', 'site-connect-domain'))
  await entry.waitFor({ state: 'detached' })
  // The step left the flow: the wizard goes back to where the flow starts, and no step names it.
  assert.equal(await stepNow(), 'kind')
  assert.equal(await page.locator(`${wizard} [data-wizard-goto="domain"]`).count(), 0)
})

/**
 * The record rows of the first own-domain card: for each row, the baseline of the label and of the
 * value (a zero-size inline box dropped at the start of each sits on its baseline), the row's
 * height, and where the copy button stands beside the text it copies.
 */
const measureRecords = () =>
  page.evaluate(() => {
    const baseline = (el) => {
      const probe = document.createElement('span')
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
      el.prepend(probe)
      const y = probe.getBoundingClientRect().bottom
      probe.remove()
      return y
    }
    return [...document.querySelectorAll('.tv-domain-record')].map((record) => {
      const box = record.getBoundingClientRect()
      const labels = [...record.querySelectorAll('dt')]
      return {
        record: record.getAttribute('data-record'),
        overflow: record.scrollWidth - record.clientWidth,
        rows: labels.map((dt) => {
          const dd = dt.nextElementSibling
          const text = dd.querySelector('[data-record-name], [data-record-value]') ?? dd
          const copy = dd.querySelector('[data-copy] button')
          // The lines of the text itself, whatever box holds it: the rects of its characters, by top.
          const range = document.createRange()
          range.selectNodeContents(text)
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0)
          const tops = [...new Set(rects.map((rect) => Math.round(rect.top)))].sort((a, b) => a - b)
          const first = rects.filter((rect) => Math.round(rect.top) === tops[0])
          const firstLine = {
            top: Math.min(...first.map((rect) => rect.top)),
            bottom: Math.max(...first.map((rect) => rect.bottom))
          }
          const textBox = text.getBoundingClientRect()
          const lines = tops.length
          const copyBox = copy?.getBoundingClientRect() ?? null
          return {
            label: dt.textContent,
            labelBaseline: baseline(dt),
            valueBaseline: baseline(text),
            labelSize: getComputedStyle(dt).fontSize,
            valueSize: getComputedStyle(text).fontSize,
            height:
              Math.max(dt.getBoundingClientRect().bottom, dd.getBoundingClientRect().bottom) -
              Math.min(dt.getBoundingClientRect().top, dd.getBoundingClientRect().top),
            lines,
            inside:
              textBox.right <= box.right + 0.5 && (copyBox === null || copyBox.right <= box.right + 0.5),
            copy: copy
              ? {
                  label: copy.getAttribute('aria-label'),
                  after: copyBox.left - textBox.right,
                  // Against the first line of the text it copies.
                  firstLine: Math.abs(
                    (copyBox.top + copyBox.bottom) / 2 - (firstLine.top + firstLine.bottom) / 2
                  )
                }
              : null
          }
        })
      }
    })
  })

test('DNS record rows: each label shares a baseline with its value, the rows keep one rhythm, and Record name and Record value each have a copy button right after their text — in both themes, and wrapped inside the box when narrow', async () => {
  await serve({ [SITE]: site({ pending: PENDING }) })
  await pressMenu({ publish: 'draft' }, 'Publish')
  await walk('domain')
  await page.waitForSelector(`${pane(PUBLISH)} .tv-domain-record`)
  // The footer under the records: the checked-at line, then the DNS only hint on its own line.
  const footer = await page.evaluate((root) => {
    const line = document.querySelector(`${root} [data-line="dns-only"]`)
    return {
      hint: line?.textContent,
      after: line?.previousElementSibling?.getAttribute('data-line'),
      routing: document.querySelector(`${root} [data-record="routing"]`)?.textContent
    }
  }, pane(PUBLISH))
  assert.equal(footer.hint, 'On Cloudflare, set the CNAME to DNS only (grey cloud).')
  assert.equal(footer.after, 'checked-at')
  assert.doesNotMatch(footer.routing ?? '', /DNS only/)
  const measured = {}
  for (const [name, dark, width] of [
    ['light', false, 560],
    ['dark', true, 560],
    ['narrow-light', false, 360],
    ['narrow-dark', true, 360]
  ]) {
    await theme(dark)
    await page.evaluate((width) => {
      document.getElementById('panel').style.width = `${width}px`
    }, width)
    measured[name] = await measureRecords()
    await shot(`dns-records-${name}`)
  }
  if (EVIDENCE)
    writeFileSync(path.join(EVIDENCE, 'dns-records.json'), `${JSON.stringify(measured, null, 2)}\n`)

  const failures = []
  for (const [name, records] of Object.entries(measured)) {
    assert.equal(records.length, 2, `${name}: the two records of a pending domain`)
    for (const record of records) {
      const where = `${name} ${record.record}`
      assert.deepEqual(
        record.rows.map((row) => row.label),
        ['Record type', 'Record name', 'Record value'],
        where
      )
      if (record.overflow > 0) failures.push(`${where}: overflows its box by ${record.overflow}px`)
      for (const row of record.rows) {
        const off = Math.abs(row.labelBaseline - row.valueBaseline)
        if (off > 0.5) failures.push(`${where} ${row.label}: baselines ${off.toFixed(2)}px apart`)
        if (row.labelSize !== row.valueSize)
          failures.push(`${where} ${row.label}: label ${row.labelSize}, value ${row.valueSize}`)
        if (!row.inside) failures.push(`${where} ${row.label}: drawn outside the box`)
      }
      const [type, recordName, value] = record.rows
      if (type.copy !== null) failures.push(`${where}: Record type has a copy button`)
      for (const [row, label] of [
        [recordName, `Copy ${record.record === 'ownership' ? 'TXT' : 'CNAME'} record name`],
        [value, `Copy ${record.record === 'ownership' ? 'TXT' : 'CNAME'} record value`]
      ]) {
        if (row.copy === null) {
          failures.push(`${where} ${row.label}: no copy button`)
          continue
        }
        if (row.copy.label !== label) failures.push(`${where} ${row.label}: button named ${row.copy.label}`)
        // Right after the text: on its first line, within the row's gap. A wrapped value fills the
        // column, and the button then stands at the column's end.
        if (row.copy.after < 0 || row.copy.after > 8)
          failures.push(`${where} ${row.label}: button ${row.copy.after.toFixed(1)}px from its text`)
        if (row.copy.firstLine > 1)
          failures.push(`${where} ${row.label}: button ${row.copy.firstLine.toFixed(1)}px off the first line`)
      }
      // One rhythm: rows of one line are the same height.
      const single = record.rows.filter((row) => row.lines === 1).map((row) => row.height)
      if (Math.max(...single) - Math.min(...single) > 0.5)
        failures.push(`${where}: one-line rows of ${single.map((h) => h.toFixed(1)).join(' / ')}px`)
    }
    if (name.startsWith('narrow')) {
      const wrapped = records.flatMap((record) => record.rows).filter((row) => row.lines > 1)
      if (wrapped.length === 0)
        failures.push(`${name}: no value wrapped at this width — the case is not exercised`)
    }
  }
  assert.deepEqual(failures, [])
})

test('the copy button of Record name writes the name, and the one of Record value writes the value', async () => {
  await serve({ [SITE]: site({ pending: PENDING }) })
  await pressMenu({ publish: 'draft' }, 'Publish')
  await walk('domain')
  const record = `${pane(PUBLISH)} .tv-domain-record[data-record="ownership"]`
  await page.waitForSelector(record)
  await page.click(`${record} button[aria-label="Copy TXT record name"]`)
  await page.waitForFunction((record) => /Copied/.test(document.querySelector(record).textContent), record)
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `_tracy.${DOMAIN}`)
  await page.click(`${record} button[aria-label="Copy TXT record value"]`)
  await page.waitForFunction((token) => navigator.clipboard.readText().then((text) => text === token), TOKEN)
})

test('focus on the Publish tab is one 1px stroke, never a halo — in both themes', async () => {
  await serve({ [SITE]: site({ pending: PENDING }) })
  await pressMenu({ publish: 'draft' }, 'Publish')
  await walk('domain')
  await page.waitForSelector(`${pane(PUBLISH)} .tv-domain-record`)
  const failures = []
  for (const dark of [false, true]) {
    await theme(dark)
    await page.focus(`${pane(PUBLISH)} button`)
    // Walk every control of the tab with the keyboard, so `:focus-visible` is what is read.
    const seen = new Set()
    for (let step = 0; step < 40; step++) {
      await page.keyboard.press('Tab')
      const at = await page.evaluate((publish) => {
        const el = document.activeElement
        if (!el || !document.querySelector(publish).contains(el)) return null
        const cs = getComputedStyle(el)
        return {
          what: `${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30)}`,
          outline: cs.outlineStyle === 'none' ? 0 : Number.parseFloat(cs.outlineWidth),
          shadow: cs.boxShadow
        }
      }, pane(PUBLISH))
      if (at === null) break
      if (seen.has(at.what)) continue
      seen.add(at.what)
      if (at.outline > 1) failures.push(`${dark ? 'dark' : 'light'} ${at.what}: outline ${at.outline}px`)
      // A ring is a shadow with no offset and no blur but a spread: `… 0px 0px 0px Npx`.
      for (const [, spread] of at.shadow.matchAll(/\b0px 0px 0px (\d+(?:\.\d+)?)px/g))
        if (Number(spread) > 1) failures.push(`${dark ? 'dark' : 'light'} ${at.what}: ring ${spread}px`)
    }
    assert.ok(seen.size >= 4, `the keyboard reached the tab's controls (${[...seen].join(', ')})`)
    if (!dark) await shot('publish-focus-light')
  }
  assert.deepEqual(failures, [])
})
