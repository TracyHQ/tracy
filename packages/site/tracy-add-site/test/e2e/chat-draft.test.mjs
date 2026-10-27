#!/usr/bin/env node
/** Chat draft handoff through the actual tab bridge and wizard, with read-only API fixtures. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { goToStep } from './wizard-navigation.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(here, '..', '..', '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwrightPath = require.resolve('playwright', { paths: [hostPkg] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

let outDir
let server
let base
let browser

before(async () => {
  // A task that keeps its scratch files beside its logs names the folder; otherwise the system's.
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tas-create-platform-'))
  // The plugin's real stylesheet, built the way `scripts/build-client.mjs` builds it. The questions
  // sheet is an absolute overlay over the panel: with no CSS it is not an overlay at all.
  const cssFile = path.join(outDir, 'add-site.css')
  execFileSync(
    process.execPath,
    [
      path.join(pkgRoot, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
      '--input',
      path.join(pkgRoot, 'src', 'client', 'add-site.css'),
      '--output',
      cssFile
    ],
    { cwd: pkgRoot, stdio: ['ignore', 'ignore', 'inherit'] }
  )
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'create-platform-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    // `.module.css` too: the `via=sidebar` fixture bundles better-sidebar's real service, whose diff
    // view imports a CSS module the tab under test never renders.
    loader: { '.css': 'empty', '.module.css': 'empty' },
    // `apply()` injects this stylesheet, as it does in dsh.
    define: { __TAILWIND_CSS__: JSON.stringify(readFileSync(cssFile, 'utf8')) },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
  // The creation workspace, where every press lands (`/new/`).
  writeFileSync(
    path.join(outDir, 'page.html'),
    // The side pane in dsh has the height of the window, and the Add site tab fills it: so does the fixture's root here,
    // or the panel grows with its content and the sheet, sized to the panel, could not be measured against the window.
    '<!doctype html><html><head><meta charset="utf-8"><base href="/new/">' +
      '<style>html,body{height:100%;margin:0}body{font-family:Arial,sans-serif}#root{height:100%}</style></head>' +
      '<body><div id="root"></div><script src="/app.js"></script></body></html>'
  )
  server = http.createServer((req, res) => {
    const name = req.url.split('?')[0] === '/app.js' ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/**
 * Open the fixture page on `path` (default `/new/s/<session>`) with `query`, wait for the Add site
 * tab type to register, run `prepare` before load (cookies, storage), then `run`.
 */
async function withPage(query, run, { prepare, path: at = '/new/s/fixture-session', clock = false } = {}) {
  const context = await browser.newContext()
  try {
    if (prepare) await prepare(context)
    const page = await context.newPage()
    // Playwright's fake page clock, for a test that waits out a timer (`page.clock.runFor`).
    if (clock) await page.clock.install()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    await page.goto(`${base}${at}${query ? `?${query}` : ''}`)
    await page
      .waitForFunction(() => window.__harness?.registered === true, null, { timeout: 8000 })
      .catch((error) => {
        throw new Error(`${error.message}; page errors: ${pageErrors.join('; ')}`)
      })
    await run(page)
    assert.deepEqual(pageErrors, [], 'no uncaught errors in the page')
  } finally {
    await context.close()
  }
}

const draft = {
  version: 1,
  sourceRevision: '12',
  intent: 'create',
  platform: 'joomla',
  answersByFeed: {
    'site.name': 'Hoa Mai',
    'copy.about': 'Bakery in Da Nang; green; Vietnamese and English requested'
  }
}

test('chat details survive template choice, manual edits, deliberate clears without creating a site', async () => {
  await withPage('start=empty', async (page) => {
    await page.evaluate((d) => window.__harness.fromChat(d, 'joomla'), draft)
    await page.locator('[data-wizard-current="design"]').waitFor()
    await goToStep(page, 'customize')
    const name = page.getByRole('textbox', { name: 'Company name', exact: true })
    const about = page.getByRole('textbox', { name: 'What does the company do?', exact: true })
    assert.equal(await name.inputValue(), 'Hoa Mai')
    assert.match(await about.inputValue(), /Da Nang.*green.*Vietnamese and English/)
    if (process.env.TRACY_TEST_ARTIFACT_DIR)
      await page.screenshot({
        path: path.join(process.env.TRACY_TEST_ARTIFACT_DIR, 'chat-draft-prefilled.png')
      })
    await goToStep(page, 'design')
    await page.evaluate(
      (d) =>
        window.__harness.fromChat(
          {
            ...d,
            sourceRevision: '13',
            answersByFeed: { ...d.answersByFeed, 'site.name': 'Hoa Mai corrected' }
          },
          'joomla'
        ),
      draft
    )
    await goToStep(page, 'customize')
    assert.equal(
      await name.inputValue(),
      'Hoa Mai corrected',
      'an untouched auto-filled name follows the correction in chat'
    )
    await name.fill('Hoa Mai edited')
    await about.fill('')
    await goToStep(page, 'design')
    await page.evaluate(() => window.__harness.fromChat(undefined, undefined, 'templates'))
    await page.locator('[data-wizard-current]').waitFor({ state: 'detached' })
    await page.evaluate((d) => window.__harness.fromChat({ ...d, sourceRevision: '13' }, 'joomla'), draft)
    await goToStep(page, 'customize')
    assert.equal(await name.inputValue(), 'Hoa Mai edited')
    assert.equal(await about.inputValue(), '')
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    }
    assert.deepEqual(await page.evaluate(() => window.__harness.posts), [])
    if (process.env.TRACY_TEST_ARTIFACT_DIR)
      await page.screenshot({ path: path.join(process.env.TRACY_TEST_ARTIFACT_DIR, 'chat-draft-mobile.png') })
  })
})

test('an import URL from chat updates untouched input and preserves a deliberate clear', async () => {
  await withPage('start=empty', async (page) => {
    const imported = {
      ...draft,
      intent: 'import',
      importUrl: 'https://first.example.test',
      answersByFeed: {}
    }
    await page.evaluate((d) => window.__harness.fromChat(d, undefined, 'import'), imported)
    const address = page.getByRole('textbox', { name: 'Site address', exact: true })
    await address.waitFor()
    assert.equal(await address.inputValue(), imported.importUrl)
    await page.evaluate(
      (d) =>
        window.__harness.fromChat(
          { ...d, sourceRevision: '13', importUrl: 'https://second.example.test' },
          undefined,
          'import'
        ),
      imported
    )
    await page.waitForFunction(
      () =>
        document.querySelector('input[placeholder="yoursite.com"]')?.value === 'https://second.example.test'
    )
    await address.fill('')
    await page.evaluate(
      (d) => window.__harness.fromChat({ ...d, sourceRevision: '14' }, undefined, 'import'),
      imported
    )
    await page.waitForTimeout(300)
    assert.equal(await address.inputValue(), '')
    assert.deepEqual(await page.evaluate(() => window.__harness.posts), [])
  })
})

test('a new import draft discards a previously confirmed address and requires a fresh check', async () => {
  await withPage('start=empty', async (page) => {
    await page.route('**/api/tracy-add-site/detect', (route) =>
      route.fulfill({ json: { reachable: true, secure: true, blocked: false, platform: 'joomla' } })
    )
    await page.route('**/api/sites/import-address?*', (route) =>
      route.fulfill({ json: { ownership: 'available' } })
    )
    const imported = {
      ...draft,
      intent: 'import',
      importUrl: 'https://first.example.test',
      answersByFeed: {}
    }
    await page.evaluate((d) => window.__harness.fromChat(d, undefined, 'import'), imported)
    await page.locator('[data-wizard-continue]:visible').click()
    await page.getByRole('heading', { name: 'Confirm the platform', exact: true }).waitFor()
    await page.evaluate(
      (d) =>
        window.__harness.fromChat(
          { ...d, sourceRevision: '13', importUrl: 'https://second.example.test' },
          undefined,
          'import'
        ),
      imported
    )
    const address = page.getByRole('textbox', { name: 'Site address', exact: true })
    await address.waitFor()
    assert.equal(await address.inputValue(), 'https://second.example.test')
    assert.equal(await page.getByRole('heading', { name: 'Confirm the platform', exact: true }).count(), 0)
    assert.deepEqual(await page.evaluate(() => window.__harness.posts), [])
  })
})
