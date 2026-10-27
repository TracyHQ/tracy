#!/usr/bin/env node
/**
 * "Design system" in the Add site form (U1 A + U7 A, Akemi 12/10/2026): the card under Customize your site, the sheet
 * it opens, and no card at all for a template build that cannot wear a system (Akemi, 15/10/2026: no dead button). Same fixture and harness as
 * `create-brief-sheet.test.mjs` (`fixtures/create-platform-entry.tsx`; only `window.fetch` is mocked).
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
import { currentStep, goToStep, submitCreate } from './wizard-navigation.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(here, '..', '..', '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const { PREVIEW_WAIT_MS } = await import(
  pathToFileURL(path.join(pkgRoot, 'src/client/design-system-pick.mjs')).href
)
// The live page's own script, as tracy-web lays it into the demo (the popup reads the side the page shows from it).
const { frameScriptOf, frameSidesOf } = await import(
  pathToFileURL(path.join(repoRoot, 'apps/tracy-web/src/sites/design-system-live-page.js')).href
)
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
    // The live demo, served at another origin (localhost, the popup is on 127.0.0.1): a two-mode template whose own
    // pre-paint script opens its default side, light, whatever the system declares, with Tracy's frame script in it.
    if (req.url.split('?')[0] === '/demo') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(
        '<!doctype html><html data-theme="light"><head><style>[data-theme="dark"] body{background:#111;color:#eee}</style>' +
          '</head><body><h1 id="demo">Live demo</h1>' +
          frameScriptOf(base, 'T.K', frameSidesOf({ hook: '', auto: false })) +
          '</body></html>'
      )
      return
    }
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

/** The wizard's form is in sight and its start card has landed. */
async function formReady(page) {
  await goToStep(page, 'design')
  await page.locator('[data-start-template-gallery="1"]').waitFor({ timeout: 5000 })
}

async function dsState(page) {
  await goToStep(page, 'system')
  await page.locator('[data-design-system-page="1"] [data-design-system]').first().waitFor({ timeout: 5000 })
}
/** The Joomla build of Tracy Business (the wizard's start template) is the one the support door says yes to. */
const supported = (tags) => ({
  prepare: (context) =>
    context.addInitScript((list) => {
      window.__dsSupported = list
    }, tags)
})

/** The support door answered for `call` (`<tag>|<platform>`) and the form settled: then no card is on screen. */
async function noCardAfter(page, call) {
  await page.waitForFunction((c) => window.__harness.dsSupportCalls.includes(c), call, { timeout: 5000 })
  await page.waitForTimeout(300)
  assert.equal(
    await page.locator('[data-wizard-goto="system"]').count(),
    0,
    'unsupported design systems have no wizard step'
  )
}

test('a template that cannot wear a system shows no Design system card at all', async () => {
  await withPage('', async (page) => {
    await formReady(page)
    await noCardAfter(page, 'tracy-business/joomla-6|joomla')
    assert.equal(await page.getByText(/Pick a design system/).count(), 0, 'no dead entry')
  })
})

test('Design system follows starting design as an optional inline page', async () => {
  await withPage(
    '',
    async (page) => {
      await formReady(page)
      await page.locator('[data-wizard-continue]').click()
      await page.locator('[data-wizard-current="system"]').waitFor()
      assert.equal(await currentStep(page), 'system')
      assert.equal(await page.locator('[data-design-system-page="1"]').isVisible(), true)
      assert.equal(await page.locator('[data-wizard-skip]').isVisible(), true)
      await page.locator('[data-wizard-back]').click()
      assert.equal(await currentStep(page), 'design')
      await page.locator('[data-wizard-continue]').click()
      await page.locator('[data-wizard-current="system"]').waitFor()
      await page.locator('[data-wizard-skip]').click()
      assert.equal(await currentStep(page), 'address')
    },
    supported(['tracy-business/joomla-6'])
  )
})

for (const supportsSystem of [true, false]) {
  test(`create order, entry and Review use the selected template (systems: ${supportsSystem})`, async () => {
    await withPage(
      'start=press&prior=tracy-business:joomla',
      async (page) => {
        const entry = supportsSystem ? 'system' : 'address'
        await page.locator(`[data-wizard-current="${entry}"]`).waitFor()
        const ids = [
          'source',
          'platform',
          'design',
          ...(supportsSystem ? ['system'] : []),
          'address',
          'customize',
          'review'
        ]
        assert.deepEqual(
          await page
            .locator('[data-wizard-goto]')
            .evaluateAll((all) => all.map((node) => node.getAttribute('data-wizard-goto'))),
          ids
        )
        assert.match(await page.locator('.tas-wizard-position').innerText(), supportsSystem ? /4.*7/ : /4.*6/)
        for (const id of ['source', 'platform', 'design']) {
          assert.equal(await page.locator(`[data-wizard-goto="${id}"]`).isEnabled(), true)
        }
        if (supportsSystem) {
          await page.locator('[data-wizard-skip]').click()
          assert.equal(await currentStep(page), 'address')
          await page.locator('[data-wizard-back]').click()
          assert.equal(await currentStep(page), 'system')
          await page.locator('[data-wizard-continue]').click()
        }
        await goToStep(page, 'review')
        assert.deepEqual(
          await page
            .locator('[data-wizard-review-row]')
            .evaluateAll((all) => all.map((node) => node.getAttribute('data-wizard-review-row'))),
          ids.filter((id) => id !== 'source' && id !== 'review')
        )
        await page.locator('[data-wizard-review-row="design"] button').click()
        assert.equal(await currentStep(page), 'design')
        await page.locator('[data-wizard-continue]').click()
        assert.equal(await currentStep(page), 'review')
        if (supportsSystem) {
          await page.locator('[data-wizard-review-row="system"] button').click()
          await page.locator('[data-wizard-continue]').click()
          assert.equal(await currentStep(page), 'review')
        }
      },
      supported(supportsSystem ? ['tracy-business/joomla-6'] : [])
    )
  })
}

test('changing templates keeps a supported system and resets an unsupported one', async () => {
  await withPage(
    '',
    async (page) => {
      await dsState(page)
      await page.locator('[data-design-system="stripe"]').click()
      await page
        .locator('[data-design-system-preview="stripe"]')
        .getByRole('button', { name: 'Use Stripe' })
        .click()
      await goToStep(page, 'design')
      await page.locator('[data-start-template="tracy"]').getByText('Tracy Base', { exact: true }).click()
      await dsState(page)
      assert.equal(await page.locator('[data-design-system="stripe"]').getAttribute('aria-pressed'), 'true')
      await page.locator('[data-design-system="editorial"]').click()
      await page
        .locator('[data-design-system-preview="editorial"]')
        .getByRole('button', { name: 'Use Editorial' })
        .click()
      assert.ok(
        (await page.evaluate(() => window.__harness.dsPreviewCalls)).includes(
          'tracy-base/joomla-6|joomla|editorial'
        )
      )
      await goToStep(page, 'design')
      await page
        .locator('[data-start-template="local-ja-kinetic"]')
        .getByText('ja_kinetic (local)', { exact: true })
        .click()
      await page.locator('[data-wizard-continue]').click()
      await page.locator('[data-wizard-current="address"]').waitFor()
      assert.equal(await page.locator('[data-wizard-goto="system"]').count(), 0)
      await goToStep(page, 'design')
      await page
        .locator('[data-start-template="tracy-business"]')
        .getByText('Tracy Business', { exact: true })
        .click()
      await dsState(page)
      assert.equal(await page.locator('[data-design-system="default"]').getAttribute('aria-pressed'), 'true')
    },
    supported(['tracy-business/joomla-6', 'tracy-base/joomla-6'])
  )
})

test('pick a system in the sheet: it closes and the card names it; another platform without support clears it', async () => {
  await withPage(
    '',
    async (page) => {
      await formReady(page)
      await dsState(page, 'ready')
      const sheet = page.locator('[data-design-system-page="1"]')
      await sheet.waitFor({ timeout: 5000 })
      assert.equal(await page.getByRole('heading', { name: 'Pick a design system', exact: true }).count(), 1)
      assert.match(await sheet.innerText(), /Showing all 2 design systems/)
      const cards = sheet.locator('[data-design-system]')
      assert.deepEqual(
        await cards.evaluateAll((all) => all.map((c) => c.getAttribute('data-design-system'))),
        ['default', 'stripe', 'editorial']
      )
      assert.equal(await sheet.locator('[data-design-system="default"]').getAttribute('aria-pressed'), 'true')
      // Each system's own palette, as the library sends it: hex only, each once, at most four; none when it has none.
      assert.deepEqual(
        await sheet
          .locator('[data-design-system="stripe"] .tas-ds-dot')
          .evaluateAll((all) => all.map((d) => getComputedStyle(d).backgroundColor)),
        ['rgb(99, 91, 255)', 'rgb(255, 255, 255)', 'rgb(10, 37, 64)', 'rgb(66, 84, 102)']
      )
      assert.equal(await sheet.locator('[data-design-system="editorial"] .tas-ds-dot').count(), 0)
      // The library's own picture of the system is its card's picture; a system with none draws its "Aa" in its font.
      assert.equal(
        await sheet.locator('[data-design-system="stripe"] img').getAttribute('src'),
        '/brand-screenshot.jpg'
      )
      assert.equal(await sheet.locator('[data-design-system="editorial"] img').count(), 0)
      assert.match(
        await sheet
          .locator('[data-design-system="editorial"] .tas-ds-aa')
          .evaluate((e) => e.style.fontFamily),
        /Georgia/
      )
      // The grid renders no template: nothing is previewed until a popup opens.
      assert.deepEqual(await page.evaluate(() => window.__harness.dsPreviewCalls), [])
      await sheet.locator('[data-design-system="stripe"]').click()
      const popup = page.locator('[data-design-system-preview="stripe"]')
      await popup.waitFor({ timeout: 5000 })
      await page
        .locator('[data-design-system-preview="stripe"][data-preview-state="ready"]')
        .waitFor({ timeout: 5000 })
      const frame = popup.locator('iframe[data-design-system-preview-frame="1"]')
      // No script, no form; a click inside carries the seat cookie (same origin) and a link elsewhere opens a tab.
      assert.equal(
        await frame.getAttribute('sandbox'),
        'allow-same-origin allow-popups allow-popups-to-escape-sandbox',
        'the page runs nothing'
      )
      assert.match((await frame.getAttribute('srcdoc')) ?? '', /Demo wearing stripe/)
      assert.deepEqual(await page.evaluate(() => window.__harness.dsPreviewCalls), [
        'tracy-business/joomla-6|joomla|stripe'
      ])
      // The desktop frame fills its room with no sideways scroll (a 2 px overflow before, #1311).
      assert.deepEqual(
        await popup.locator('[data-design-system-preview-body="1"]').evaluate((e) => ({
          over: e.scrollWidth - e.clientWidth,
          frameOver:
            (e.firstElementChild?.firstElementChild?.scrollWidth ?? 0) -
            (e.firstElementChild?.firstElementChild?.clientWidth ?? 0)
        })),
        { over: 0, frameOver: 0 }
      )
      assert.match(await popup.innerText(), /Stripe\nOn the Tracy Business demo/)
      // A two-mode template's page (the door's header): Light | Dark beside Desktop | Mobile, opening light, and a press
      // puts the side on the framed page's root (#1352 left the Add site popup without it, measured 14/10/2026).
      const themes = popup.locator('[data-theme-switch]')
      assert.equal(await themes.count(), 1)
      assert.equal(await themes.locator('[data-preview-theme="light"]').getAttribute('aria-pressed'), 'true')
      const root = () =>
        frame.evaluate((f) =>
          /** @type {HTMLIFrameElement} */ (f).contentDocument?.documentElement?.getAttribute('data-theme')
        )
      await page.waitForFunction(
        () =>
          /** @type {HTMLIFrameElement | null} */ (
            document.querySelector('iframe[data-design-system-preview-frame="1"]')
          )?.contentDocument?.documentElement?.getAttribute('data-theme') === 'light',
        null,
        { timeout: 3000 }
      )
      await themes.locator('[data-preview-theme="dark"]').click()
      assert.equal(await root(), 'dark')
      assert.equal(await themes.locator('[data-preview-theme="dark"]').getAttribute('aria-pressed'), 'true')
      // Escape closes the popup only; the sheet stays and focus is back on the card that opened it.
      await page.keyboard.press('Escape')
      await popup.waitFor({ state: 'detached', timeout: 5000 })
      assert.equal(await sheet.isVisible(), true)
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('data-design-system') === 'stripe',
        null,
        { timeout: 3000 }
      )
      // Enter on the card opens it again. One header row: the pager steps through the sheet's cards and wraps, and
      // there is no footer; the dialog's X closes it the same way Escape does.
      await page.keyboard.press('Enter')
      await popup.waitFor({ timeout: 5000 })
      assert.equal(await popup.locator('[data-design-system-back="1"]').count(), 0)
      const pager = popup.locator('[data-preview-pager]')
      assert.match(await pager.innerText(), /1 of 2/)
      await pager.getByRole('button', { name: 'Next design system' }).click()
      await page.locator('[data-design-system-preview="editorial"]').waitFor({ timeout: 5000 })
      // Editorial's page has no header: one look, no Light | Dark once its own page is in.
      await page.waitForFunction(
        () => {
          const pop = document.querySelector('[data-design-system-preview="editorial"]')
          const doc =
            pop?.querySelector('iframe[data-design-system-preview-frame="1"]')?.getAttribute('srcdoc') ?? ''
          return doc.includes('Demo wearing editorial') && pop?.querySelector('[data-theme-switch]') === null
        },
        null,
        { timeout: 5000 }
      )
      await page.getByRole('button', { name: 'Previous design system' }).click()
      await popup.waitFor({ timeout: 5000 })
      await popup.getByRole('button', { name: 'Close' }).click()
      await popup.waitFor({ state: 'detached', timeout: 5000 })
      assert.equal(await sheet.isVisible(), true)
      // Use closes the modal and keeps the selected system on this step.
      await sheet.locator('[data-design-system="stripe"]').click()
      await popup.getByRole('button', { name: 'Use Stripe' }).click()
      await popup.waitFor({ state: 'detached', timeout: 5000 })
      assert.equal(await currentStep(page), 'system')
      assert.equal(await sheet.locator('[data-design-system="stripe"]').getAttribute('aria-pressed'), 'true')
      await goToStep(page, 'design')
      const picture = page.locator('[data-start-template="tracy-business"] img')
      assert.match(await picture.getAttribute('src'), /business-home\.png\?w=720$/)
      assert.equal(
        await page.locator('[data-start-worn-frame]').count(),
        0,
        'the gallery keeps the template home shot'
      )
      const asked = (await page.evaluate(() => window.__harness.dsPreviewCalls)).length
      const shots = process.env.TRACY_TEST_ARTIFACT_DIR ?? outDir
      await page.screenshot({ path: path.join(shots, 'add-site-design-system-light.png'), fullPage: true })
      await page.evaluate(() => document.documentElement.setAttribute('data-ds-dark-theme', ''))
      await page.screenshot({ path: path.join(shots, 'add-site-design-system-dark.png'), fullPage: true })
      await page.evaluate(() => document.documentElement.removeAttribute('data-ds-dark-theme'))
      await goToStep(page, 'system')
      assert.equal(await sheet.locator('[data-design-system="stripe"]').getAttribute('aria-pressed'), 'true')
      await sheet.locator('[data-design-system="default"]').click()
      assert.equal(await sheet.locator('[data-design-system="default"]').getAttribute('aria-pressed'), 'true')
      await goToStep(page, 'design')
      assert.match(await picture.getAttribute('src'), /business-home\.png\?w=720$/)
      assert.equal((await page.evaluate(() => window.__harness.dsPreviewCalls)).length, asked)
      // A platform that cannot wear the choice removes the step and clears the choice.
      await goToStep(page, 'system')
      await sheet.locator('[data-design-system="stripe"]').click()
      await popup.getByRole('button', { name: 'Use Stripe' }).click()
      await goToStep(page, 'platform')
      await page.getByRole('button', { name: 'EmDash', exact: true }).click()
      await noCardAfter(page, 'tracy-business/emdash-0.x|emdash')
      await goToStep(page, 'platform')
      await page.getByRole('button', { name: 'Joomla', exact: true }).click()
      await dsState(page)
      assert.equal(await sheet.locator('[data-design-system="default"]').getAttribute('aria-pressed'), 'true')
    },
    supported(['tracy-business/joomla-6'])
  )
})

test('live frame: Light | Dark lights the side the page shows, not the side the system declares; a press switches it', async () => {
  const port = new URL(base).port
  await withPage(
    '',
    async (page) => {
      await formReady(page)
      await dsState(page, 'ready')
      const sheet = page.locator('[data-design-system-page="1"]')
      await sheet.waitFor({ timeout: 5000 })
      await sheet.locator('[data-design-system="stripe"]').click()
      const popup = page.locator('[data-design-system-preview="stripe"][data-preview-state="ready"]')
      await popup.waitFor({ timeout: 5000 })
      const frameEl = popup.locator('iframe[data-design-system-preview-frame="1"]')
      assert.match((await frameEl.getAttribute('src')) ?? '', /^http:\/\/localhost:\d+\/demo\?/)
      const frame = page.frameLocator('iframe[data-design-system-preview-frame="1"]')
      await frame.locator('#demo').waitFor({ timeout: 5000 })
      const lit = () =>
        popup
          .locator('[data-preview-theme][aria-pressed="true"]')
          .evaluateAll((all) => all.map((b) => b.getAttribute('data-preview-theme')))
      const shows = () => frame.locator('html').getAttribute('data-theme')
      const litIs = (side) =>
        page.waitForFunction(
          (s) =>
            [...document.querySelectorAll('[data-preview-theme][aria-pressed="true"]')]
              .map((b) => b.getAttribute('data-preview-theme'))
              .join() === s,
          side,
          { timeout: 3000 }
        )
      // The door says the system is dark, the page opens light (its template's default): the switch says light.
      await litIs('light')
      assert.equal(await shows(), 'light')
      assert.deepEqual(await lit(), ['light'])
      // The page's own switch (the template's moon in its header) turns it dark: the popup's switch follows.
      await frame.locator('html').evaluate((r) => r.setAttribute('data-theme', 'dark'))
      await litIs('dark')
      // A press switches the page, and the switch lights what the page then shows.
      await popup.locator('[data-preview-theme="light"]').click()
      await litIs('light')
      assert.equal(await shows(), 'light')
      await popup.locator('[data-preview-theme="dark"]').click()
      await litIs('dark')
      assert.equal(await shows(), 'dark')
    },
    {
      prepare: async (context) => {
        await supported(['tracy-business/joomla-6']).prepare(context)
        await context.addInitScript((src) => {
          window.__dsPreviewLive = src
        }, `http://localhost:${port}/demo?tracy_ds_preview=T.K`)
      }
    }
  )
})

test('no preview for the template: the popup says so, and the system can still be picked', async () => {
  await withPage(
    '',
    async (page) => {
      await formReady(page)
      await dsState(page, 'ready')
      const sheet = page.locator('[data-design-system-page="1"]')
      await sheet.waitFor({ timeout: 5000 })
      await sheet.locator('[data-design-system="editorial"]').click()
      const popup = page.locator('[data-design-system-preview="editorial"]')
      await popup.waitFor({ timeout: 5000 })
      await page.locator('[data-preview-unavailable="1"]').waitFor({ timeout: 5000 })
      assert.match(
        await popup.innerText(),
        /A preview is not available for Tracy Business on Joomla yet\. You can still pick this design system\./
      )
      assert.equal(await popup.locator('iframe').count(), 0, 'never a stand-in page')
      await popup.getByRole('button', { name: 'Use Editorial' }).click()
      await popup.waitFor({ state: 'detached', timeout: 5000 })
      assert.equal(
        await sheet.locator('[data-design-system="editorial"]').getAttribute('aria-pressed'),
        'true'
      )
    },
    {
      prepare: (context) =>
        context.addInitScript(() => {
          window.__dsSupported = ['tracy-business/joomla-6']
          window.__dsPreviewUnavailable = true
        })
    }
  )
})

/** Open the preview popup of the Editorial card, with the preview door answering `answer`. */
async function openEditorialPreview(page) {
  await formReady(page)
  await dsState(page, 'ready')
  const sheet = page.locator('[data-design-system-page="1"]')
  await sheet.waitFor({ timeout: 5000 })
  await sheet.locator('[data-design-system="editorial"]').click()
  const popup = page.locator('[data-design-system-preview="editorial"]')
  await popup.waitFor({ timeout: 5000 })
  return popup
}

const previewAnswer = (answer, clock = false) => ({
  prepare: async (context) => {
    await context.addInitScript((a) => {
      window.__dsSupported = ['tracy-business/joomla-6']
      window.__dsPreviewAnswer = a
    }, answer)
  },
  clock
})

test('a demo the server could not read (409 DEMO_UNREADABLE): the popup says not available, never stays loading', async () => {
  await withPage(
    '',
    async (page) => {
      const popup = await openEditorialPreview(page)
      await page
        .locator('[data-design-system-preview="editorial"][data-preview-state="unavailable"]')
        .waitFor({ timeout: 3000 })
      assert.match(await popup.innerText(), /A preview is not available for Tracy Business on Joomla yet\./)
    },
    previewAnswer('unreadable')
  )
})

test('any other refusal: the popup fails with Try again, which asks again', async () => {
  await withPage(
    '',
    async (page) => {
      const popup = await openEditorialPreview(page)
      await page
        .locator('[data-design-system-preview="editorial"][data-preview-state="failed"]')
        .waitFor({ timeout: 3000 })
      await popup.getByRole('button', { name: 'Try again' }).click()
      await page.waitForFunction(() => window.__harness.dsPreviewCalls.length === 2, null, { timeout: 3000 })
    },
    previewAnswer('error')
  )
})

test('a preview that never answers: the popup gives up after its wait and offers Try again', async () => {
  await withPage(
    '',
    async (page) => {
      const popup = await openEditorialPreview(page)
      assert.equal(await popup.getAttribute('data-preview-state'), 'loading')
      await page.clock.runFor(PREVIEW_WAIT_MS)
      await page
        .locator('[data-design-system-preview="editorial"][data-preview-state="failed"]')
        .waitFor({ timeout: 3000 })
      assert.equal(await popup.getByRole('button', { name: 'Try again' }).count(), 1)
    },
    previewAnswer('hang', true)
  )
})

test('a library of a thousand systems: the count is the whole library, the grid reveals thirty at a time', async () => {
  await withPage(
    '',
    async (page) => {
      await formReady(page)
      await dsState(page, 'ready')
      const sheet = page.locator('[data-design-system-page="1"]')
      await sheet.waitFor({ timeout: 5000 })
      assert.match(await sheet.innerText(), /Showing all 1,?000 design systems/)
      const systems = sheet.locator('[data-design-system]:not([data-design-system="default"])')
      // The first screenful only, every picture lazy.
      assert.equal(await systems.count(), 30)
      assert.deepEqual(
        [...new Set(await sheet.locator('img.tas-ds-pic').evaluateAll((all) => all.map((i) => i.loading)))],
        ['lazy']
      )
      // Scrolled to the end, thirty more come in; never the whole thousand at once.
      await sheet.locator('[data-design-system-more="1"]').scrollIntoViewIfNeeded()
      await page.waitForFunction(
        () => document.querySelectorAll('[data-design-system-page] [data-design-system]').length > 31,
        null,
        { timeout: 5000 }
      )
      const shown = await systems.count()
      assert.ok(shown >= 60 && shown < 1000, `${shown} cards in the page`)
      assert.equal(await sheet.locator('[data-design-system-more="1"]').count(), 1)
    },
    {
      prepare: (context) =>
        context.addInitScript(() => {
          window.__dsSupported = ['tracy-business/joomla-6']
          window.__dsLibraryCount = 1000
        })
    }
  )
})

test("the sheet's toolbar: search by name, Categories by industry, the gallery's count line; the reveal starts over", async () => {
  await withPage(
    '',
    async (page) => {
      await formReady(page)
      await dsState(page, 'ready')
      const sheet = page.locator('[data-design-system-page="1"]')
      await sheet.waitFor({ timeout: 5000 })
      const bar = sheet.locator('[data-design-system-filter="1"]')
      const countLine = bar.locator('[data-filter-count]')
      const systems = sheet.locator('[data-design-system]:not([data-design-system="default"])')
      assert.match(await countLine.innerText(), /^Showing all 1,?000 design systems$/)
      const search = bar.getByRole('textbox', { name: 'Search design systems' })
      assert.equal(await search.getAttribute('placeholder'), 'Search, e.g. System 0')
      // Scrolled once, so the reveal is past its first thirty; a search must start it over.
      await sheet.locator('[data-design-system-more="1"]').scrollIntoViewIfNeeded()
      await page.waitForFunction(
        () => document.querySelectorAll('[data-design-system-page] [data-design-system]').length > 31,
        null,
        { timeout: 5000 }
      )

      // Search narrows by name; Template default steps aside while anything narrows the list.
      await search.fill('system 1')
      assert.match(await countLine.innerText(), /^Showing 111 of 1,?000 design systems$/)
      assert.equal(await sheet.locator('[data-design-system="default"]').count(), 0)
      assert.equal(await systems.count(), 30, 'the reveal starts again at thirty')
      await search.fill('nothing like this')
      await sheet.locator('[data-design-system-empty="1"]').waitFor({ timeout: 3000 })
      assert.equal(
        await sheet.locator('[data-design-system-empty="1"]').innerText(),
        'No design systems match'
      )
      assert.equal(await systems.count(), 0)
      await bar.getByRole('button', { name: 'Clear' }).click()
      assert.equal(await search.inputValue(), '')
      assert.match(await countLine.innerText(), /^Showing all 1,?000 design systems$/)
      assert.equal(await sheet.locator('[data-design-system="default"]').count(), 1)
      assert.equal(await bar.getByRole('button', { name: 'Clear' }).count(), 0)

      // Categories, by keyboard: the menu opens on its first row, the counts are the whole library's, Other last.
      const trigger = bar.getByRole('button', { name: /Categories/ })
      await trigger.focus()
      await page.keyboard.press('ArrowDown')
      const menu = page.locator('[data-ds-categories]')
      await menu.waitFor({ timeout: 3000 })
      assert.deepEqual(
        await menu
          .locator('[data-ds-category]')
          .evaluateAll((all) => all.map((b) => b.innerText.replace(/\s+/g, ' '))),
        ['SaaS 880', 'Fintech 100', 'Other 20']
      )
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('data-ds-category') === 'saas',
        null,
        {
          timeout: 3000
        }
      )
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      assert.equal(await menu.locator('[data-ds-category="fintech"]').getAttribute('aria-checked'), 'true')
      assert.equal(await menu.isVisible(), true, 'the menu stays open while ticking')
      assert.match(await countLine.innerText(), /^Showing 100 of 1,?000 design systems$/)
      // Escape closes the menu only, focus back on its button; the sheet stays.
      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached', timeout: 3000 })
      assert.equal(await sheet.isVisible(), true)
      assert.equal(await trigger.evaluate((b) => b === document.activeElement), true)
      assert.match(await trigger.innerText(), /Categories\s*1/)
      // The pill says what is ticked; the card's count stays the whole library's.
      assert.equal(await bar.locator('[data-slot="badge"]', { hasText: 'Fintech' }).count(), 1)
      assert.equal(await systems.count(), 30)
      // Search and category together narrow the library.
      await search.fill('system 1')
      assert.match(await countLine.innerText(), /^Showing 11 of 1,?000 design systems$/)
      await page.locator('[data-wizard-back]').click()
      assert.equal(await currentStep(page), 'design')
    },
    {
      prepare: (context) =>
        context.addInitScript(() => {
          window.__dsSupported = ['tracy-business/joomla-6']
          window.__dsLibraryCount = 1000
        })
    }
  )
})

test('the pick travels with Create site; the server puts it on, and the tab never writes it', async () => {
  await withPage(
    '',
    async (page) => {
      await formReady(page)
      await dsState(page, 'ready')
      const sheet = page.locator('[data-design-system-page="1"]')
      await sheet.waitFor({ timeout: 5000 })
      await sheet.locator('[data-design-system="stripe"]').click()
      const popup = page.locator('[data-design-system-preview="stripe"]')
      await popup.getByRole('button', { name: 'Use Stripe' }).click()
      await popup.waitFor({ state: 'detached', timeout: 5000 })
      // While the server installs the site and then puts the pick on, the build screen says so.
      await page.evaluate(() => {
        window.__harness.jobAnswer = {
          state: 'running',
          step: 'applying your design system',
          output: '',
          designSystem: { id: 'stripe', name: 'Stripe', state: 'applying' }
        }
      })
      await submitCreate(page, 'picked-server')
      await page.waitForFunction(() => window.__harness.posts.length === 1, null, { timeout: 5000 })
      const sent = await page.evaluate(() => window.__harness.posts[0])
      assert.equal(sent.designSystem, 'stripe', 'the library id goes with the create request')
      const line = page.locator('[data-design-system-apply="running"]')
      await line.waitFor({ timeout: 8000 })
      assert.equal(await line.innerText(), 'Design system: Stripe')
      assert.deepEqual(
        await page.evaluate(() => window.__harness.dsApplies),
        [],
        'the tab writes nothing itself'
      )
    },
    supported(['tracy-business/joomla-6'])
  )
})

test('the template default sends no design system with Create site', async () => {
  await withPage(
    '',
    async (page) => {
      await formReady(page)
      await dsState(page, 'ready')
      await submitCreate(page, 'default-look')
      await page.waitForFunction(() => window.__harness.posts.length === 1, null, { timeout: 5000 })
      const sent = await page.evaluate(() => window.__harness.posts[0])
      assert.equal('designSystem' in sent, false)
    },
    supported(['tracy-business/joomla-6'])
  )
})

test('full-page wizard has no card frame or horizontal overflow and a responsive gallery in both themes', async () => {
  await withPage(
    '',
    async (page) => {
      for (const width of [390, 800, 1300, 360, 1600]) {
        await page.setViewportSize({ width, height: 800 })
        for (const theme of ['light', 'dark']) {
          await page.evaluate((dark) => {
            document.documentElement.toggleAttribute('data-ds-dark-theme', dark)
            document.documentElement.classList.toggle('dark', dark)
            document.body.toggleAttribute('data-ds-dark-theme', dark)
          }, theme === 'dark')
          await page.waitForTimeout(220)
          let headerTop
          for (const step of ['source', 'platform', 'design', 'address', 'customize', 'system', 'review']) {
            await goToStep(page, step)
            const layout = await page.locator(`[data-wizard-step="${step}"]`).evaluate((element) => {
              const root = element.closest('.tas-root')
              const frame = root.closest('[data-add-site-form]')
              const style = getComputedStyle(root)
              const boxes = [document.documentElement, frame, root, element]
              const firstCard = element.querySelector('[data-design-system], [data-start-template]')
              return {
                overflow: boxes.map((box) => box.scrollWidth - box.clientWidth),
                borders: [
                  style.borderTopWidth,
                  style.borderRightWidth,
                  style.borderBottomWidth,
                  style.borderLeftWidth
                ],
                radius: style.borderRadius,
                width: root.getBoundingClientRect().width,
                panelWidth: frame.getBoundingClientRect().width,
                gutter:
                  root.querySelector('.tas-wizard-steps').getBoundingClientRect().left -
                  root.getBoundingClientRect().left,
                headerTop:
                  element.querySelector('.tas-wizard-steps')?.getBoundingClientRect().top ??
                  root.querySelector('.tas-wizard-steps').getBoundingClientRect().top,
                columns: firstCard
                  ? getComputedStyle(firstCard.closest('.tas-ds-grid')).gridTemplateColumns.split(' ').length
                  : null
              }
            })
            assert.ok(
              layout.overflow.every((extra) => extra <= 1),
              `${width}px ${theme} ${step} has no horizontal overflow: ${layout.overflow}`
            )
            assert.deepEqual(
              layout.borders,
              ['0px', '0px', '0px', '0px'],
              `${width}px ${theme} ${step} has no wizard card border`
            )
            assert.equal(layout.radius, '0px', 'the wizard is a page without card corners')
            assert.ok(Math.abs(layout.width - layout.panelWidth) <= 1, 'the wizard fills the panel width')
            assert.equal(
              layout.gutter,
              layout.panelWidth >= 900 ? 32 : layout.panelWidth >= 600 ? 24 : 16,
              'gutters follow the panel width'
            )
            headerTop ??= layout.headerTop
            assert.ok(
              Math.abs(layout.headerTop - headerTop) <= 1,
              'the step header stays top-aligned between pages'
            )
            if (step === 'system') {
              assert.ok(
                width < 600
                  ? layout.columns === 1
                  : width === 800
                    ? [2, 3].includes(layout.columns)
                    : layout.columns >= 4,
                `${width}px gallery columns: ${layout.columns}`
              )
            }
            if (step !== 'source') {
              const footer = await page.locator('[data-wizard-footer]').boundingBox()
              assert.ok(
                footer.y >= 0 && footer.y + footer.height <= 801,
                `${width}px ${theme} ${step} footer visible`
              )
              await page.mouse.move(0, 0)
              await page.waitForTimeout(220)
              for (const button of await page.locator('[data-wizard-back], [data-wizard-skip]').all())
                assert.equal(
                  await button.evaluate((el) => {
                    const canvas = document.createElement('canvas')
                    canvas.width = canvas.height = 1
                    const paint = canvas.getContext('2d')
                    paint.fillStyle = getComputedStyle(el).backgroundColor
                    paint.fillRect(0, 0, 1, 1)
                    return paint.getImageData(0, 0, 1, 1).data[3]
                  }),
                  0,
                  `${theme} secondary action has no browser background`
                )
            }
            if (step === 'customize' || step === 'system') {
              const scrolling = await page.locator('.tas-wizard-card').evaluate((root) => {
                const scroller = root.closest('[data-add-site-form]')
                const previous = scroller.scrollTop
                scroller.scrollTop = scroller.scrollHeight
                const moved = scroller.scrollTop - previous
                const footer = root.querySelector('[data-wizard-footer]').getBoundingClientRect()
                const frame = scroller.getBoundingClientRect()
                scroller.scrollTop = 0
                return { moved, visible: footer.bottom <= frame.bottom + 1 && footer.top >= frame.top }
              })
              assert.equal(scrolling.visible, true, `${step} footer remains in the panel after scrolling`)
              if (step === 'system' && width === 390)
                assert.ok(scrolling.moved > 0, 'mobile gallery exercises a long scroller')
            }
            const folder = process.env.TRACY_TEST_ARTIFACT_DIR
            if (folder)
              await page.screenshot({
                path: path.join(folder, `wizard-${width}-${theme}-${step}.png`),
                fullPage: true
              })
          }
        }
      }
      // The right panel can be narrower than the browser; breakpoints must follow the panel.
      await page.setViewportSize({ width: 1300, height: 800 })
      await page.evaluate(() => {
        document.getElementById('root').style.width = '800px'
      })
      await goToStep(page, 'system')
      const narrow = await page.locator('.tas-wizard-card').evaluate((root) => ({
        width: root.getBoundingClientRect().width,
        gutter:
          root.querySelector('.tas-wizard-steps').getBoundingClientRect().left -
          root.getBoundingClientRect().left,
        columns: getComputedStyle(
          root.querySelector('[data-design-system]').closest('.tas-ds-grid')
        ).gridTemplateColumns.split(' ').length
      }))
      assert.equal(narrow.width, 800, 'the wizard fits the right panel within a wider browser')
      assert.equal(narrow.gutter, 24, '800px panel uses medium gutters inside a 1300px browser')
      assert.ok([2, 3].includes(narrow.columns), 'gallery columns follow the panel width')
    },
    {
      prepare: (context) =>
        context.addInitScript(() => {
          window.__dsSupported = ['tracy-business/joomla-6']
          window.__dsLibraryCount = 12
        })
    }
  )
})

// A deliberate platform or preview Use press already answers the page's question.
test('platform selection moves forward once, supports the keyboard and keeps Back editable', async () => {
  await withPage('', async (page) => {
    await goToStep(page, 'platform')
    const wordpress = page.getByRole('button', { name: 'WordPress', exact: true })
    await wordpress.focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await currentStep(page), 'platform', 'arrow keys never navigate')
    await wordpress.press('Enter')
    await page.locator('[data-wizard-current="design"]').waitFor({ timeout: 5000 })
    await page.waitForFunction(() => document.activeElement?.classList.contains('tas-wizard-title'))
    await page.locator('[data-wizard-back]').click()
    assert.equal(await currentStep(page), 'platform')
    assert.equal(await wordpress.getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: 'Joomla', exact: true }).click()
    await page.locator('[data-wizard-current="design"]').waitFor()
    assert.deepEqual(await page.evaluate(() => window.__harness.posts), [])
    const folder = process.env.TRACY_TEST_ARTIFACT_DIR
    if (folder)
      await page.screenshot({ path: path.join(folder, 'platform-select-and-continue.png'), fullPage: true })
  })
})

for (const supports of [true, false]) {
  test(`Use starting design advances without another Continue (support: ${supports})`, async () => {
    await withPage(
      '',
      async (page) => {
        await formReady(page)
        const card = page.locator('[data-start-template="tracy-business"]')
        await card.click({ position: { x: 12, y: 12 } })
        assert.equal(await currentStep(page), 'design', 'gallery picks remain available for comparison')
        await card
          .locator('..')
          .getByRole('button', { name: /preview/i })
          .click()
        await page.locator('[data-starting-design-use]').click()
        await page
          .locator(`[data-wizard-current="${supports ? 'system' : 'address'}"]`)
          .waitFor({ timeout: 5000 })
        await page.waitForFunction(() => document.activeElement?.classList.contains('tas-wizard-title'))
        const folder = process.env.TRACY_TEST_ARTIFACT_DIR
        if (folder)
          await page.screenshot({
            path: path.join(folder, `preview-use-support-${supports}.png`),
            fullPage: true
          })
        await page.locator('[data-wizard-back]').click()
        assert.equal(await currentStep(page), 'design')
        assert.equal(await card.getAttribute('aria-pressed'), 'true')
        assert.deepEqual(await page.evaluate(() => window.__harness.posts), [])
      },
      supported(supports ? ['tracy-business/joomla-6'] : [])
    )
  })
}

for (const nextSupported of [true, false]) {
  test(`Use another template waits for its own support answer (next supported: ${nextSupported})`, async () => {
    await withPage(
      '',
      async (page) => {
        await formReady(page)
        await page.waitForFunction(() =>
          window.__harness.dsSupportCalls.includes('tracy-business/joomla-6|joomla')
        )
        await page.evaluate(() => {
          const fetch = window.fetch
          window.fetch = async (input, init) => {
            const url = String(input)
            if (url.includes('/api/design-system/support') && url.includes('tracy-base')) {
              window.__supportHeld = true
              await new Promise((resolve) => {
                window.__releaseSupport = resolve
              })
            }
            return fetch(input, init)
          }
        })
        const card = page.locator('[data-start-template="tracy"]')
        await card
          .locator('..')
          .getByRole('button', { name: /preview/i })
          .click()
        await page.locator('[data-starting-design-use]').click()
        await page.waitForFunction(() => window.__supportHeld === true)
        assert.equal(await currentStep(page), 'design', 'the previous template never decides the next step')
        assert.equal(await page.locator('[data-wizard-continue]').isEnabled(), false)
        assert.equal(await page.locator('[data-wizard-step]').getAttribute('aria-busy'), 'true')
        await page.evaluate(() => window.__releaseSupport())
        await page
          .locator(`[data-wizard-current="${nextSupported ? 'system' : 'address'}"]`)
          .waitFor({ timeout: 5000 })
        assert.deepEqual(await page.evaluate(() => window.__harness.posts), [])
      },
      supported(nextSupported ? ['tracy-base/joomla-6'] : ['tracy-business/joomla-6'])
    )
  })
}

test('Use from Review edits the template and returns to Review without creating a site', async () => {
  await withPage(
    '',
    async (page) => {
      await goToStep(page, 'review')
      await page.locator('[data-wizard-review-row="design"] button').click()
      const card = page.locator('[data-start-template="tracy"]')
      await card
        .locator('..')
        .getByRole('button', { name: /preview/i })
        .click()
      await page.locator('[data-starting-design-use]').click()
      await page.locator('[data-wizard-current="review"]').waitFor({ timeout: 5000 })
      assert.match(await page.locator('[data-wizard-review-row="design"]').innerText(), /Tracy Base/)
      assert.deepEqual(await page.evaluate(() => window.__harness.posts), [])
    },
    supported(['tracy-business/joomla-6', 'tracy-base/joomla-6'])
  )
})
