/**
 * The Site changes Source filter marks its choice with a check mark, driven in a real browser in
 * light and dark (Akemi, 01/10).
 *
 * The menu (People and Tracy — the default since 06/10/2026 — All, then the nine Sources, a count on
 * the right) used to mark the chosen row with a
 * faint tint and bold text, the same tint the pointer paints on hover, so the choice and the hovered
 * row looked alike. A single-choice menu marks its choice with a check mark, the same lucide Check
 * the role menu on the composer shows. Pinned here, in both themes:
 *
 *   - every row is a menuitemradio; only the chosen row is aria-checked="true";
 *   - only the chosen row shows a check mark, in a column LEFT of the label (the count holds the
 *     right), and every Source's label starts at the same x, so the empty column keeps them aligned;
 *   - the chosen row's background equals an unchosen, unhovered row's: background is for hover only;
 *   - the chosen row's text weight equals the others' (the role menu does not bold its choice);
 *   - picking another row moves the mark there.
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tst-changes-filter-menu-'))
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
    entryPoints: [path.join(here, '..', 'fixtures', 'changes-filter-menu-entry.tsx')],
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
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
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

/** Mounts the tab, opens the filter menu with the pointer parked away from it, and reads its rows. */
async function openMenu(dark) {
  await page.mouse.move(1, 1)
  await page.evaluate((dark) => {
    document.body.toggleAttribute('data-ds-dark-theme', dark)
    window.__mountChanges()
  }, dark)
  await page.waitForSelector('#panel .tv-changes-filter', { timeout: 5000 })
  // A real pointer press, as a person opens it: the menu then puts the keyboard focus on the chosen
  // row (`MenuKeys`) without the focus ring a key press would draw.
  await page.click('#panel .tv-changes-filter')
  await page.waitForSelector('[role=menu] [role=menuitemradio]', { timeout: 5000 })
  await page.mouse.move(1, 1)
  return readRows()
}

function readRows() {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role=menu] [role=menuitemradio]')].map((row) => {
      const check = row.querySelector('svg.lucide-check')
      const shown = check !== null && getComputedStyle(check).visibility !== 'hidden'
      const label = row.querySelector('[data-label]')
      const style = getComputedStyle(row)
      return {
        text: label?.textContent ?? '',
        checked: row.getAttribute('aria-checked'),
        check: shown,
        checkLeft: check?.getBoundingClientRect().left ?? null,
        labelLeft: label?.getBoundingClientRect().left ?? null,
        background: style.backgroundColor,
        weight: getComputedStyle(label ?? row).fontWeight
      }
    })
  )
}

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'

  test(`the chosen filter carries a check mark and aria-checked, not a tint (${theme})`, async () => {
    const rows = await openMenu(dark)
    assert.deepEqual(
      rows.map((r) => r.text),
      [
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
      ],
      'People and Tracy (the default), All and the nine Sources, each with its label'
    )
    const [chosen, ...others] = rows
    assert.equal(chosen.checked, 'true', 'the chosen row is aria-checked="true"')
    assert.equal(chosen.check, true, 'the chosen row shows a check mark')
    assert.ok(chosen.checkLeft < chosen.labelLeft, 'the check mark sits left of the label')
    for (const r of others) {
      assert.equal(r.checked, 'false', `${r.text}: aria-checked="false"`)
      assert.equal(r.check, false, `${r.text}: no visible check mark`)
      assert.equal(r.background, others[0].background, `${r.text}: same background as the other unchosen row`)
    }
    assert.equal(chosen.background, others[0].background, 'the chosen row has no tint of its own')
    assert.equal(chosen.weight, others[0].weight, 'the chosen row is not bolder than the others')
    // The Sources carry their glyph before the label; People and Tracy and All carry none.
    const lefts = new Set(others.slice(1).map((r) => Math.round(r.labelLeft)))
    assert.equal(lefts.size, 1, `every Source label starts at the same x (got ${[...lefts].join(', ')})`)
  })

  test(`picking another filter moves the check mark there (${theme})`, async () => {
    await openMenu(dark)
    await page.evaluate(() => document.querySelectorAll('[role=menu] [role=menuitemradio]')[2].click())
    await page.click('#panel .tv-changes-filter')
    await page.waitForSelector('[role=menu] [role=menuitemradio]', { timeout: 5000 })
    await page.mouse.move(1, 1)
    const rows = await readRows()
    assert.deepEqual(
      rows.slice(0, 4).map((r) => [r.text, r.checked, r.check]),
      [
        ['People and Tracy', 'false', false],
        ['All', 'false', false],
        ['Chat', 'true', true],
        ['Comment', 'false', false]
      ]
    )
    assert.deepEqual(
      rows.filter((r) => r.checked === 'true').map((r) => r.text),
      ['Chat'],
      'one row chosen'
    )
    await page.keyboard.press('Escape')
  })
}

/**
 * The filter button sits at the right edge of the summary row, which ends at the page's right gutter
 * (Site changes draws the Publish and Team page shell since 24/10/2026, so it no longer lines up under
 * the header's Create a backup button). In a narrow pane the summary wraps; the button neither moves
 * nor overlaps it.
 */
async function summaryRow(width, dark) {
  await page.mouse.move(1, 1)
  await page.evaluate(
    ({ width, dark }) => {
      document.body.toggleAttribute('data-ds-dark-theme', dark)
      document.getElementById('panel').style.width = `${width}px`
      window.__mountChanges()
    },
    { width, dark }
  )
  await page.waitForSelector('#panel .tv-changes-filter', { timeout: 5000 })
  return page.evaluate(() => {
    const box = (el) => el.getBoundingClientRect()
    const create = document.querySelector('#panel [data-create-backup]')
    const filter = document.querySelector('#panel .tv-changes-filter')
    const text = document.querySelector('#panel .tv-changes-summary > span')
    const lineHeight = Number.parseFloat(getComputedStyle(text).lineHeight) || 16
    const content = document.querySelector('#panel .tv-changes-page > div:last-child')
    return {
      create: box(create).right,
      content: box(content).right,
      filter: { left: box(filter).left, right: box(filter).right, top: box(filter).top },
      text: {
        right: box(text).right,
        bottom: box(text).bottom,
        lines: Math.round(box(text).height / lineHeight)
      }
    }
  })
}

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'
  for (const width of [860, 380, 260]) {
    test(`the filter button ends at the page gutter at ${width}px (${theme})`, async () => {
      const row = await summaryRow(width, dark)
      assert.ok(
        // The list is pulled out by its own row padding, so the button ends on the page gutter.
        Math.abs(row.filter.right - row.content) <= 1,
        `filter right ${row.filter.right} vs page content right ${row.content}`
      )
      assert.ok(
        // Beside the total, or (a narrow panel) on the line under it.
        row.text.right <= row.filter.left || row.filter.top >= row.text.bottom - 1,
        `summary ends (${row.text.right}) before the button (${row.filter.left}) or above it`
      )
      // The total ("2 recorded events") fits one line even at 260px; what must hold at any width
      // is the two checks above.
    })
  }
}
