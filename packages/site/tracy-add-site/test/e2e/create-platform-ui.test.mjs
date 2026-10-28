#!/usr/bin/env node
/**
 * "Create with <CMS>" opens the Add site wizard on THAT card and THAT platform, whether the Add site
 * tab was closed, open from the `+` menu, open from a press of another card, or restored with the
 * session — driven in a real browser through the real openers (#381, #386).
 *
 * #381, measured on cowork.tracy.site (develop a9d1885b0): Create with WordPress on Tracy Base opened
 * Add site with the right template and the Platform pill on Joomla. Two places lost the press:
 * the Add site descriptor's component took only `store`, so the wizard never saw `tab.meta`; and
 * with the tab already open, `tracy:add-site` is `single: true`, so better-sidebar's `openTab` only
 * focused that tab under its own id and the openers patched an id that did not exist. Since
 * better-sidebar 0.21.1 the same holds in dsh's native right column (one tab per kind, ids minted
 * there, `meta` untouched by a navigation), and the openers patch the tab the open landed on.
 * #386, measured by QC on develop 1bec87a9e: with Add site already open, a press of Tracy Base kept
 * "Starts from Tracy Business" and created from it — the same lost press, plus a wizard that read
 * its template once at mount.
 * #392, found by the #391 worker: a press made in a SITE's workspace navigates to
 * `/new/?inspiration=…&platform=…`; when tracy-web forwards that address as it stands,
 * `tracy-tab-link` read the intent off it and opened the CMS's Build tab, not Add site.
 *
 * The fixture (`fixtures/create-platform-entry.tsx`) bundles better-sidebar's real store, service
 * and native write face, this plugin's `apply()`, `tracy-tab-link`'s `apply()` and
 * `tracy-design-inspiration`'s `landBuildTab`, over a double of dsh's right column that keeps its
 * page rules; the wizard gets whatever record `openTab`/`updateTab` left. Only `window.fetch` is
 * mocked.
 *
 * The rules that decide WHICH card and platform a press lands on (start, a later press, a repeat of
 * one, an operator-disabled pick) are unit-tested in `../press-state.test.mjs`; what stays here is
 * what only a browser shows — the openers, better-sidebar's tab records and the React wiring.
 *
 * Same harness rules as `build-poll-ui.test.mjs`: dependencies resolved from the packages that
 * declare them, and a missing dependency or browser FAILS (no skip).
 */
import assert from 'node:assert/strict'
import { currentStep, goToStep, submitCreate } from './wizard-navigation.mjs'
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
    '<!doctype html><html><head><meta charset="utf-8"><base href="/new/"></head>' +
      '<body><div id="root"></div><script src="/app.js"></script></body></html>'
  )
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/template-demo')) {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!doctype html><html><body>Template demo</body></html>')
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
async function withPage(query, run, { prepare, path: at = '/new/s/fixture-session' } = {}) {
  const context = await browser.newContext()
  try {
    if (prepare) await prepare(context)
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    await page.goto(`${base}${at}${query ? `?${query}` : ''}`)
    await page.waitForFunction(() => window.__harness?.registered === true, null, { timeout: 8000 })
    await run(page)
    assert.deepEqual(pageErrors, [], 'no uncaught errors in the page')
  } finally {
    await context.close()
  }
}

const IMAGE = { tracy: 'base.png', 'tracy-business': 'business-home.png?w=720' }
const LABEL = { wordpress: 'WordPress', emdash: 'EmDash', joomla: 'Joomla' }

/** The wizard's form is in sight and its start card has landed. */
async function formReady(page) {
  await goToStep(page, 'design')
  await page.locator('[data-start-template-gallery="1"]').waitFor({ timeout: 5000 })
}

/** The label of the one pressed Platform pill. */
async function selected(page) {
  await goToStep(page, 'platform')
  const pills = page.locator('button[data-selected="1"]')
  assert.equal(await pills.count(), 1, 'exactly one platform is selected')
  return (await pills.innerText()).trim()
}

/** Wait until the pill reads `label` and the "Starts from" card is `card`'s. */
async function shows(page, card, label) {
  await goToStep(page, 'platform')
  await page.waitForFunction(
    (want) => document.querySelector('button[data-selected="1"]')?.textContent?.trim() === want,
    label,
    { timeout: 5000 }
  )
  assert.equal(await selected(page), label)
  await goToStep(page, 'design')
  // `attached`: the fixture serves no image, so the lazy `<img>` never paints.
  await page
    .locator(`[data-start-template="${card}"][aria-pressed="true"] img[src$="/${IMAGE[card]}"]`)
    .waitFor({ state: 'attached', timeout: 5000 })
}

/** Type a name, press Create site (no question asked: they are optional), and return the body the create door received. */
async function create(page, label) {
  await submitCreate(page, label)
  await page.waitForFunction(() => window.__harness.posts.length === 1, null, { timeout: 5000 })
  const payload = await page.evaluate(() => window.__harness.posts[0])
  assert.match(payload.buildId, /^[0-9a-f-]{36}$/)
  // The opening of the form this press came from (usage, #1415): one id per opening, sent with Create.
  assert.match(payload.wizardId, /^[0-9a-f-]{36}$/)
  const { buildId: _buildId, wizardId: _wizardId, ...fields } = payload
  return fields
}

/** Press a card the way `buildOpener` does. */
const press = async (page, card, platform, opts) => {
  const building = (await page.locator('[data-wizard-step]').count()) === 0
  await page.evaluate(([c, p, o]) => window.__harness.press(c, p, o), [card, platform, opts ?? {}])
  if (!building && !opts?.sessionId)
    await page.locator('[data-wizard-current="address"]').waitFor({ timeout: 5000 })
}

/** The Add site tabs the layout holds — always exactly one. */
async function oneTab(page) {
  const tabs = await page.evaluate(() => window.__harness.addSiteTabs())
  assert.equal(tabs.length, 1, 'Add site stays a single tab')
  return tabs[0]
}

/** The cookie `tracy-web` sets when it sends a press to its session (`intentCookie`). */
const intentCookie = (intent) => async (context) => {
  await context.addCookies([
    {
      name: 'tracy_intent',
      value: encodeURIComponent(new URLSearchParams(intent).toString()),
      domain: '127.0.0.1',
      path: '/new'
    }
  ])
}

const PRESSES = [['tracy-business', 'emdash']]

test('segmented step bar preserves accessible navigation and approved geometry in both themes', async () => {
  await withPage('start=press&prior=tracy-business:wordpress', async (page) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.locator('[data-wizard-current="address"]').waitFor()
    const segments = page.locator('.tas-wizard-segment')
    const total = await segments.count()
    assert.ok(total > 4, 'the bar includes the remaining wizard steps')
    assert.equal(await page.locator('.tas-wizard-position b').innerText(), `Step 4 of ${total}`)
    assert.equal(
      await page.locator('.tas-wizard-position > span').innerText(),
      await page.locator('[aria-current="step"]').getAttribute('aria-label')
    )
    for (const dark of [false, true]) {
      const measured = await page.evaluate((dark) => {
        document.body.toggleAttribute('data-ds-dark-theme', dark)
        const header = document.querySelector('.tas-wizard-steps')
        const row = header.querySelector('.tas-wizard-segments')
        const meta = header.querySelector('.tas-wizard-position')
        const title = document.querySelector('.tas-wizard-title')
        const buttons = [...row.querySelectorAll('button')]
        const tokenColor = (element, value) => {
          const probe = document.createElement('i')
          probe.style.backgroundColor = value
          element.append(probe)
          const color = getComputedStyle(probe).backgroundColor
          probe.remove()
          return color
        }
        return {
          display: getComputedStyle(row).display,
          gap: getComputedStyle(row).gap,
          divider: getComputedStyle(header).borderBottomWidth,
          metaGap: getComputedStyle(meta).gap,
          metaFont: getComputedStyle(meta).fontSize,
          metaLine: getComputedStyle(meta).lineHeight,
          metaWeight: getComputedStyle(meta.querySelector('b')).fontWeight,
          barToMeta:
            meta.getBoundingClientRect().top - buttons[0].firstElementChild.getBoundingClientRect().bottom,
          metaToTitle: title.getBoundingClientRect().top - meta.getBoundingClientRect().bottom,
          segments: buttons.map((button) => {
            const bar = button.firstElementChild
            return {
              width: button.getBoundingClientRect().width,
              hitHeight: button.getBoundingClientRect().height,
              barHeight: bar.getBoundingClientRect().height,
              radius: getComputedStyle(bar).borderRadius,
              active: button.hasAttribute('data-active'),
              color: getComputedStyle(bar).backgroundColor,
              expected: tokenColor(
                bar,
                button.hasAttribute('data-active')
                  ? 'var(--primary)'
                  : `color-mix(in oklab, var(--foreground) ${dark ? 14 : 10}%, transparent)`
              ),
              label: button.getAttribute('aria-label')
            }
          })
        }
      }, dark)
      assert.equal(measured.display, 'flex')
      assert.equal(measured.gap, '4px')
      assert.equal(measured.divider, '0px')
      assert.equal(measured.metaGap, '8px')
      assert.equal(measured.metaFont, '12px')
      assert.equal(measured.metaLine, '16px')
      assert.equal(measured.metaWeight, '500')
      assert.equal(measured.barToMeta, 10)
      assert.ok(
        Math.abs(measured.metaToTitle - 18) <= 1,
        `title sits about 18px below metadata, measured ${measured.metaToTitle}px`
      )
      for (const [index, segment] of measured.segments.entries()) {
        assert.ok(Math.abs(segment.width - measured.segments[0].width) < 1, 'segments have equal widths')
        assert.ok(segment.hitHeight >= 16, 'each segment has a usable hit area')
        assert.equal(segment.barHeight, 4)
        assert.equal(segment.radius, '999px')
        assert.equal(segment.active, index <= 3, 'only steps through the current step are active')
        assert.equal(
          segment.color,
          segment.expected,
          `segment ${index + 1} uses the ${dark ? 'dark' : 'light'} token color`
        )
        assert.ok(segment.label, 'each segment retains its step label for screen readers')
      }
      if (process.env.TRACY_TEST_ARTIFACT_DIR) {
        await page.screenshot({
          path: path.join(
            process.env.TRACY_TEST_ARTIFACT_DIR,
            `segmented-stepbar-${dark ? 'dark' : 'light'}.png`
          ),
          fullPage: true
        })
      }
    }
    const completed = page.locator('[data-wizard-goto="platform"]')
    assert.equal(await completed.isEnabled(), true)
    assert.equal(await page.locator('[aria-current="step"]').isDisabled(), true)
    assert.equal(await segments.last().isDisabled(), true)
    await page.keyboard.press('Tab')
    await completed.focus()
    const focus = await completed.evaluate((button) => ({
      visible: button.matches(':focus-visible'),
      outline: getComputedStyle(button).outlineWidth,
      shadow: getComputedStyle(button).boxShadow
    }))
    assert.equal(focus.visible, true)
    assert.equal(focus.outline, '1px')
    assert.equal(focus.shadow, 'none')
    await page.keyboard.press('Enter')
    assert.equal(await currentStep(page), 'platform')
    assert.equal(await selected(page), 'WordPress', 'going back preserves the selected platform')
    assert.equal(await page.locator('.tas-wizard-position b').innerText(), `Step 2 of ${total}`)
    assert.equal(await page.locator('.tas-wizard-segment[data-active]').count(), 2)
  })
})

test('Import fills the panel with responsive gutters and a visible footer on every step', async () => {
  await withPage('start=plus', async (page) => {
    // Keep this layout fixture's API doubles, adding the same import reads as handover-entry.tsx.
    await page.evaluate(() => {
      const fetch = window.fetch
      window.fetch = async (input, init) => {
        const address = typeof input === 'string' ? input : input.url
        const pathname = new URL(address, location.href).pathname
        const json = (body) =>
          new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
        if (pathname === '/api/sites/import-address') return json({ ownership: 'available' })
        if (pathname.endsWith('/api/tracy-add-site/detect'))
          return json({
            platform: 'joomla',
            reachable: true,
            secure: true,
            blocked: false,
            admin: { signInFound: true, locked: false, basicAuthRequired: false }
          })
        return fetch(input, init)
      }
    })
    await page.getByText('Import existing site', { exact: true }).click()
    for (const step of ['address', 'platform', 'access', 'details', 'review']) {
      await page.locator(`[data-import-page="${step}"]`).waitFor()
      for (const width of [1300, 800, 390]) {
        await page.setViewportSize({ width, height: 800 })
        await page.evaluate(() => {
          document.getElementById('root').style.height = '700px'
        })
        const geometry = await page.locator(`[data-import-page="${step}"]`).evaluate((frame) => {
          const panel = frame.closest('[data-add-site-form]')
          const style = getComputedStyle(frame)
          return {
            width: frame.getBoundingClientRect().width,
            panel: panel.getBoundingClientRect().width,
            gutter:
              frame.querySelector('.tas-wizard-steps').getBoundingClientRect().left -
              frame.getBoundingClientRect().left,
            overflow: [document.documentElement, panel, frame].map((el) => el.scrollWidth - el.clientWidth),
            borders: [
              style.borderTopWidth,
              style.borderRightWidth,
              style.borderBottomWidth,
              style.borderLeftWidth
            ]
          }
        })
        assert.ok(Math.abs(geometry.width - geometry.panel) <= 1, `${step} fills the available panel`)
        assert.equal(
          geometry.gutter,
          geometry.panel >= 900 ? 32 : geometry.panel >= 600 ? 24 : 16,
          `${width}px ${step} uses the panel gutter`
        )
        assert.deepEqual(geometry.borders, ['0px', '0px', '0px', '0px'], 'Import has no card frame')
        assert.ok(
          geometry.overflow.every((extra) => extra <= 1),
          `${step} has no horizontal overflow`
        )
        const footer = await page.locator('[data-import-page] [data-wizard-footer]').boundingBox()
        assert.ok(footer && footer.y + footer.height <= 800, `${step} footer remains visible`)
      }
      if (step === 'address') await page.getByPlaceholder('yoursite.com').fill('layout.example')
      if (step === 'details') {
        await page.getByLabel('Username').fill('admin')
        await page.getByLabel('Password', { exact: true }).fill('secret')
      }
      if (step !== 'review') await page.locator(`[data-import-page="${step}"] [data-wizard-continue]`).click()
    }
  })
})

// 1. Add site not open yet: the press opens it.
for (const [card, platform] of PRESSES) {
  test(`Add site closed: Create with ${LABEL[platform]} on ${card} opens it on that card and platform`, async () => {
    await withPage('start=empty', async (page) => {
      assert.equal((await page.evaluate(() => window.__harness.addSiteTabs())).length, 0)
      await press(page, card, platform)
      await formReady(page)
      await shows(page, card, LABEL[platform])
      await oneTab(page)
      assert.deepEqual(await create(page, `fresh-${platform}`), {
        label: `fresh-${platform}`,
        platform,
        design: card
      })
    })
  })
}

// 2. Add site already open from the `+` menu (#381's second half, #386).
for (const [card, platform] of [['tracy-business', 'emdash']]) {
  test(`Add site open from the + menu: Create with ${LABEL[platform]} on ${card} lands on that tab`, async () => {
    await withPage('start=plus', async (page) => {
      await formReady(page)
      assert.equal(await selected(page), 'Joomla', 'the + menu opens the tab bare, on the default')
      if (platform === 'joomla') await page.getByRole('button', { name: 'WordPress', exact: true }).click()
      await press(page, card, platform)
      await shows(page, card, LABEL[platform])
      await oneTab(page)
      assert.deepEqual(await create(page, `plus-${platform}`), {
        label: `plus-${platform}`,
        platform,
        design: card
      })
    })
  })
}

// 3. Add site already open from a press of ANOTHER card (#386: Business → Base kept Business).
for (const [prior, card, platform] of [['tracy-business:emdash', 'tracy', 'joomla']]) {
  test(`Add site open for ${prior}: Create with ${LABEL[platform]} on ${card} moves card and platform`, async () => {
    await withPage(`start=press&prior=${prior}`, async (page) => {
      await formReady(page)
      const [priorCard, priorPlatform] = prior.split(':')
      await shows(page, priorCard, LABEL[priorPlatform])
      await press(page, card, platform)
      await shows(page, card, LABEL[platform])
      await oneTab(page)
      assert.deepEqual(await create(page, `other-${platform}`), {
        label: `other-${platform}`,
        platform,
        design: card
      })
    })
  })
}

// 4. The layout restored with the session still holds an Add site tab — without the meta it had:
// dsh restores a tab's record, never its navigation params (`tab-domain.ts` `sync`).
test('Add site restored with the session: a new press moves card and platform', async () => {
  await withPage('start=restored', async (page) => {
    await formReady(page)
    assert.equal(await selected(page), 'Joomla', 'a restored tab carries no press')
    await press(page, 'tracy', 'joomla')
    await shows(page, 'tracy', 'Joomla')
    await oneTab(page)
    assert.deepEqual(await create(page, 'restored'), {
      label: 'restored',
      platform: 'joomla',
      design: 'tracy'
    })
  })
})

// 5. The press that arrives from outside the creation workspace: `tracy-web` redirects to
// `/new/s/<id>?tab=tracy:add-site&design=<id>` with the intent in a cookie, and `tracy-tab-link`
// opens the tab.
for (const [start, card, platform] of [
  ['start=empty', 'tracy-business', 'emdash'],
  ['start=restored', 'tracy', 'wordpress']
]) {
  test(`tracy-tab-link, intent cookie (${start}): ${card} on ${LABEL[platform]}`, async () => {
    await withPage(
      `${start}&tab=tracy:add-site&design=${card}`,
      async (page) => {
        await formReady(page)
        await shows(page, card, LABEL[platform])
        const tab = await oneTab(page)
        assert.equal(tab.meta.platform, platform)
        assert.equal(tab.meta.id, card)
        assert.deepEqual(await create(page, `link-${platform}`), {
          label: `link-${platform}`,
          platform,
          design: card
        })
      },
      { prepare: intentCookie({ inspiration: card, platform }) }
    )
  })
}

// 6. The press from outside the creation workspace, arriving as `buildOpener` sent it —
// `onboardingBuildUrl(…)`, `/new/?inspiration=…&platform=…` — because tracy-web forwarded the address
// as it stood (dsh did not answer ahead), or a `/new/s/<id>?inspiration=…` link. #392: this road
// opened the Build tab of the CMS; it must land on Add site exactly as the redirect and the
// in-workspace press do.
for (const [card, platform] of [['tracy-business', 'emdash']]) {
  test(`tracy-tab-link, intent on /new/ (#392): ${card} on ${LABEL[platform]} opens Add site in a fresh session`, async () => {
    await withPage(
      `start=empty&workspace=fresh&inspiration=${card}&platform=${platform}`,
      async (page) => {
        await formReady(page)
        assert.equal(await page.evaluate(() => window.__harness.started), 1, 'one session for the press')
        assert.equal(
          await page.evaluate(() => window.__harness.session()),
          'fresh-session',
          'opened in the new session, not the one the page loaded on'
        )
        await shows(page, card, LABEL[platform])
        const tab = await oneTab(page)
        assert.equal(tab.meta.platform, platform)
        assert.equal(tab.meta.id, card)
        const address = await page.evaluate(() => location.search)
        assert.doesNotMatch(address, /inspiration|platform/, 'the intent is spent and off the address')
        assert.equal(await page.evaluate(() => sessionStorage.getItem('tracy-tab-link:intent')), null)
        assert.equal(await page.evaluate(() => window.__harness.posts.length), 0, 'opening is not creating')
        assert.deepEqual(await create(page, `new-${platform}`), {
          label: `new-${platform}`,
          platform,
          design: card
        })
      },
      { path: '/new/' }
    )
  })
}

// The Add site tab already open is the one the session restored: since better-sidebar 0.21.1 dsh
// restores it without the meta an earlier press gave it (`tab-domain.ts` `sync`), under the id its
// right column minted — the press lands on that tab, not on a second one.
for (const [card, platform] of [['tracy', 'wordpress']]) {
  test(`tracy-tab-link, intent on /new/s/<id> (#392), Add site already open: ${card} on ${LABEL[platform]}`, async () => {
    await withPage(`start=restored&inspiration=${card}&platform=${platform}`, async (page) => {
      await formReady(page)
      await shows(page, card, LABEL[platform])
      const tab = await oneTab(page)
      assert.equal(tab.id, 'tab-restored', 'the open tab took the press')
      assert.equal(tab.meta.platform, platform)
      assert.equal(tab.meta.id, card)
      assert.deepEqual(await create(page, `open-${platform}`), {
        label: `open-${platform}`,
        platform,
        design: card
      })
    })
  })
}

test('tracy-tab-link, intent stash after a reload: the press still lands on the open tab', async () => {
  await withPage(
    'start=restored&tab=tracy:add-site&design=tracy-business',
    async (page) => {
      await formReady(page)
      await shows(page, 'tracy-business', 'EmDash')
      await oneTab(page)
      assert.equal(await page.evaluate(() => sessionStorage.getItem('tracy-tab-link:intent')), null)
    },
    {
      prepare: (context) =>
        context.addInitScript(() =>
          sessionStorage.setItem(
            'tracy-tab-link:intent',
            JSON.stringify({ inspiration: 'tracy-business', platform: 'emdash' })
          )
        )
    }
  )
})

test('a plain link to Add site lands on the tab already open and writes nothing onto it', async () => {
  await withPage('start=press&prior=tracy-business:emdash&tab=tracy:add-site', async (page) => {
    await formReady(page)
    await shows(page, 'tracy-business', 'EmDash')
    const tab = await oneTab(page)
    assert.equal(tab.meta.pressedAt, 1, 'the link wrote nothing onto the tab')
  })
})

test('a pressed platform the operator switched off is not offered; the first enabled one is', async () => {
  await withPage('start=plus&off=wordpress', async (page) => {
    await formReady(page)
    await press(page, 'tracy', 'wordpress')
    await goToStep(page, 'design')
    await page
      .locator('[data-start-template="tracy"][aria-pressed="true"] img[src$="/base.png"]')
      .waitFor({ state: 'attached', timeout: 5000 })
    assert.equal(await page.getByRole('button', { name: 'WordPress', exact: true }).count(), 0)
    assert.equal(await selected(page), 'Joomla')
  })
})

test('a press landed in another session does not rewrite the tab in sight', async () => {
  await withPage('start=press&prior=tracy-business:emdash', async (page) => {
    await formReady(page)
    await shows(page, 'tracy-business', 'EmDash')
    await press(page, 'tracy', 'wordpress', { sessionId: 'another-session' })
    const tab = await oneTab(page)
    assert.equal(tab.meta.design, 'tracy-business')
    assert.equal(tab.meta.platform, 'emdash')
    await page.waitForTimeout(300)
    assert.equal(await selected(page), 'EmDash')
  })
})

test('a new incoming selection reuses the catalogue and reaches the create request', async () => {
  await withPage('start=press&prior=tracy-business:emdash', async (page) => {
    await formReady(page)
    const calls = await page.evaluate(() => window.__harness.templateCalls)
    await press(page, 'tracy', 'wordpress')
    await shows(page, 'tracy', 'WordPress')
    assert.equal(
      await page.evaluate(() => window.__harness.templateCalls),
      calls,
      'the wizard reuses its catalogue read'
    )
    assert.deepEqual(await create(page, 'cached-catalogue'), {
      label: 'cached-catalogue',
      platform: 'wordpress',
      design: 'tracy'
    })
  })
})

test('repeated incoming selections keep the latest template with the same catalogue read', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    const calls = await page.evaluate(() => window.__harness.templateCalls)
    await press(page, 'tracy-business', 'emdash')
    await press(page, 'tracy', 'wordpress')
    await shows(page, 'tracy', 'WordPress')
    assert.equal(
      await page.locator('[data-start-template="tracy-business"]').getAttribute('aria-pressed'),
      'false'
    )
    assert.equal(await page.evaluate(() => window.__harness.templateCalls), calls)
    assert.deepEqual(await create(page, 'latest-selection'), {
      label: 'latest-selection',
      platform: 'wordpress',
      design: 'tracy'
    })
  })
})

test('a press while a build is running leaves that build on screen', async () => {
  await withPage('start=press&prior=tracy-business:emdash', async (page) => {
    await formReady(page)
    await create(page, 'running-build')
    await page.locator('[data-stage="building"]').waitFor({ timeout: 5000 })
    await press(page, 'tracy', 'wordpress')
    await page.waitForTimeout(500)
    assert.equal(
      await page.locator('[data-wizard-step]').count(),
      0,
      'the form stays closed while the build remains in sight'
    )
    assert.equal(await page.locator('[data-wizard-goto="create"]').isDisabled(), true)
    assert.equal(await page.locator('[data-wizard-goto="create"]').getAttribute('data-step-state'), 'running')
    assert.equal(await page.evaluate(() => window.__harness.posts.length), 1, 'no second site is created')
  })
})

// The gallery is the template choice itself: no separate Design inspiration navigation.
async function chosenName(page, text) {
  await goToStep(page, 'design')
  const selected = page.locator('[data-start-template][aria-pressed="true"]')
  await selected.waitFor({ timeout: 5000 })
  assert.match(await selected.innerText(), new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

test('the gallery names an incoming template without a usable picture and sends its selection', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await press(page, 'tracy-business', 'wordpress')
    await shows(page, 'tracy-business', 'WordPress')
    await chosenName(page, 'Tracy Business')
    await press(page, 'local-ja-kinetic', 'joomla')
    await chosenName(page, 'ja_kinetic (local)')
    assert.equal(await selected(page), 'Joomla')
    await goToStep(page, 'design')
    const card = page.locator('[data-start-template="local-ja-kinetic"]')
    assert.equal(await card.locator('img').count(), 0, 'a bare image file uses the placeholder')
    assert.equal(await card.locator('[data-start-placeholder]').count(), 1)
    assert.deepEqual(await create(page, 'kinetic-named'), {
      label: 'kinetic-named',
      platform: 'joomla',
      design: 'local-ja-kinetic'
    })
  })
})

test('changing platform preserves a supported pick and falls back to Tracy Business for an unsupported pick', async () => {
  await withPage('start=press&prior=tracy:joomla', async (page) => {
    await formReady(page)
    await goToStep(page, 'platform')
    await page.getByRole('button', { name: 'WordPress', exact: true }).click()
    await page.locator('[data-wizard-continue]').click()
    await chosenName(page, 'Tracy Base')
    await goToStep(page, 'platform')
    await page.getByRole('button', { name: 'EmDash', exact: true }).click()
    await page.locator('[data-wizard-continue]').click()
    await chosenName(page, 'Tracy Business')
    assert.equal(await page.locator('[data-start-template="tracy"]').count(), 0)
    assert.equal(await page.locator('[data-wizard-continue]').isEnabled(), true)
    assert.deepEqual(await create(page, 'platform-fallback'), {
      label: 'platform-fallback',
      platform: 'emdash',
      design: 'tracy-business'
    })
  })
})

test('a taken domain is explained, keeps the form, and another address can be submitted', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await create(page, 'taken-domain')
    await page.getByText('That site address is already in use.', { exact: true }).waitFor()
    assert.equal(await currentStep(page), 'address')
    assert.equal(
      await page.getByRole('textbox', { name: 'Site address', exact: true }).inputValue(),
      'taken-domain'
    )
    await submitCreate(page, 'free-domain')
    await page.waitForFunction(() => window.__harness.posts.length === 2)
    assert.equal(await page.evaluate(() => window.__harness.posts[1].label), 'free-domain')
    await page
      .getByRole('button', { name: 'Create site', exact: true })
      .and(page.locator('[data-wizard-continue]'))
      .waitFor({ state: 'detached' })
  })
})

test('a repeated create press keeps its build id through reload, while changing the address starts a new build', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    await create(page, 'taken-domain')
    await page.getByText('That site address is already in use.', { exact: true }).waitFor()
    const firstId = await page.evaluate(() => window.__harness.posts[0].buildId)
    await page.reload()
    await formReady(page)
    await create(page, 'taken-domain')
    await page.getByText('That site address is already in use.', { exact: true }).waitFor()
    const repeatedId = await page.evaluate(() => window.__harness.posts[0].buildId)
    assert.equal(repeatedId, firstId)
    await submitCreate(page, 'free-domain')
    await page.waitForFunction(() => window.__harness.posts.length === 2)
    const nextId = await page.evaluate(() => window.__harness.posts[1].buildId)
    assert.notEqual(nextId, firstId)
  })
})

test('bare entry starts with Adding, choice cards advance, and Back keeps the platform', async () => {
  await withPage('start=plus', async (page) => {
    await page.locator('[data-wizard-current="source"]').waitFor()
    assert.equal(await page.locator('[data-wizard-continue]').count(), 0)
    await page.getByText('Create a new site', { exact: true }).click()
    assert.equal(await currentStep(page), 'platform')
    // A platform card is a choice card too: the press itself moves on, no Continue needed.
    await page.getByRole('button', { name: 'WordPress', exact: true }).click()
    await page.locator('[data-wizard-current="design"]').waitFor()
    assert.equal(await currentStep(page), 'design')
    await page.locator('[data-wizard-back]').click()
    assert.equal(await selected(page), 'WordPress')
    await page.locator('[data-wizard-continue]').click()
    await page.locator('[data-wizard-continue]').click()
    assert.equal(await currentStep(page), 'address')
    const next = page.locator('[data-wizard-continue]')
    assert.equal(await next.isDisabled(), true)
    await page.getByRole('textbox', { name: 'Site address', exact: true }).fill('no')
    assert.equal(await next.isDisabled(), true)
    await page.getByRole('textbox', { name: 'Site address', exact: true }).fill('valid-address')
    assert.equal(await next.isEnabled(), true)
    await next.click()
    assert.equal(await currentStep(page), 'customize')
    await page.locator('[data-wizard-skip]').click()
    assert.equal(await currentStep(page), 'review')
    assert.equal(await page.locator('[data-wizard-goto="system"]').count(), 0)
    assert.match(
      await page.locator('[data-wizard-review-row="customize"]').innerText(),
      /Skipped|Not answered/
    )
    assert.equal(await page.evaluate(() => window.__harness.posts.length), 0)
  })
})

test('a template entry lands on address and editing Review returns there directly', async () => {
  await withPage('start=press&prior=tracy-business:wordpress', async (page) => {
    await page.locator('[data-wizard-current="address"]').waitFor()
    for (const id of ['source', 'platform', 'design'])
      assert.equal(await page.locator(`[data-wizard-goto="${id}"]`).isEnabled(), true)
    await goToStep(page, 'review')
    await page.locator('[data-wizard-review-row="address"]').getByRole('button').click()
    assert.equal(await currentStep(page), 'address')
    await page.getByRole('textbox', { name: 'Site address', exact: true }).fill('edited-address')
    await page.locator('[data-wizard-continue]').click()
    assert.equal(await currentStep(page), 'review')
    assert.match(await page.locator('[data-wizard-review-row="address"]').innerText(), /edited-address/)
    await page.locator('[data-wizard-review-row="platform"]').getByRole('button').click()
    // The platform card advances by itself, and from a Review edit that is straight back to Review.
    await page.getByRole('button', { name: 'Joomla', exact: true }).click()
    await page.locator('[data-wizard-current="review"]').waitFor()
    assert.equal(await currentStep(page), 'review')
    assert.match(await page.locator('[data-wizard-review-row="platform"]').innerText(), /Joomla/)
    assert.equal(await page.evaluate(() => window.__harness.posts.length), 0)
  })
})

test('the gallery preselects Tracy Business first and filters by search and categories', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    const gallery = page.locator('[data-start-template-gallery="1"]')
    const cards = gallery.locator('[data-start-template]')
    assert.deepEqual(
      await cards.evaluateAll((all) => all.map((c) => c.getAttribute('data-start-template'))),
      ['tracy-business', 'tracy', 'unsealed-demo', 'long-languages', 'local-ja-kinetic']
    )
    assert.equal(await cards.first().getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('[data-wizard-continue]').isEnabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Change design', exact: true }).count(), 0)
    assert.match(await gallery.innerText(), /Showing all 5 designs/)
    const search = gallery.getByPlaceholder('Search, e.g. JA Impact')
    await search.fill('  TRACY  ')
    assert.equal(await cards.count(), 2)
    assert.match(await gallery.innerText(), /Showing 2 of 5 designs/)
    await search.fill('no such template')
    assert.equal(await cards.count(), 0)
    await gallery.getByText('No designs match', { exact: true }).waitFor()
    assert.equal(
      await page.locator('[data-wizard-continue]').isEnabled(),
      true,
      'filtering preserves selection'
    )
    await search.fill('')
    await gallery.getByRole('button', { name: 'Categories', exact: true }).click()
    await page.getByRole('menuitemcheckbox', { name: /Portfolio/ }).click()
    await page.keyboard.press('Escape')
    assert.deepEqual(
      await cards.evaluateAll((all) => all.map((c) => c.getAttribute('data-start-template'))),
      ['tracy', 'local-ja-kinetic']
    )
    await search.fill('kinetic')
    assert.equal(await cards.count(), 1, 'search and categories are combined')
    await gallery
      .locator('[data-start-template="local-ja-kinetic"]')
      .getByText('ja_kinetic (local)', { exact: true })
      .click()
    assert.equal(await cards.first().getAttribute('aria-pressed'), 'true')
    await goToStep(page, 'review')
    assert.match(await page.locator('[data-wizard-review-row="design"]').innerText(), /ja_kinetic \(local\)/)
    assert.deepEqual(await create(page, 'gallery-selection'), {
      label: 'gallery-selection',
      platform: 'joomla',
      design: 'local-ja-kinetic'
    })
  })
})

test('an incoming template is selected and shown first in its platform gallery', async () => {
  await withPage('start=press&prior=tracy:wordpress', async (page) => {
    await formReady(page)
    const first = page.locator('[data-start-template-gallery="1"] [data-start-template]').first()
    assert.equal(await first.getAttribute('data-start-template'), 'tracy')
    assert.equal(await first.getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('[data-start-template="local-ja-kinetic"]').count(), 0)
    assert.match(await page.locator('[data-start-template-gallery="1"]').innerText(), /Showing all 3 designs/)
  })
})

test('a failed catalogue shows an empty gallery with no separate Change design action', async () => {
  await withPage('start=plus&catalogue-failed=1', async (page) => {
    await goToStep(page, 'design')
    await page.getByText('No designs match', { exact: true }).waitFor()
    assert.equal(await page.locator('[data-start-template]').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Change design', exact: true }).count(), 0)
    assert.equal(await page.locator('[data-wizard-continue]').isDisabled(), true)
  })
})

test('the starting gallery requests thumbnails without loading a full desktop shot', async () => {
  await withPage('start=plus', async (page) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const images = []
    page.on('request', (request) => {
      if (request.resourceType() === 'image') images.push(request.url())
    })
    await formReady(page)
    const img = page.locator('[data-start-template="tracy-business"] img')
    assert.match(await img.getAttribute('src'), /business-home\.png\?w=720$/)
    assert.equal(await img.getAttribute('loading'), 'lazy')
    assert.equal(await img.getAttribute('decoding'), 'async')
    await img.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    assert.ok(images.some((url) => url.endsWith('business-home.png?w=720')))
    assert.equal(
      images.some((url) => url.endsWith('/business-home.png')),
      false
    )
  })
})

test('Open preview stays in the wizard, frames the demo and Use selects and closes', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    const active = await page.evaluate(() => window.__harness.activeTab())
    const card = page.locator('[data-start-template="tracy-business"]')
    await card.locator('[title]').hover()
    await card.locator('..').getByRole('button', { name: 'Open preview', exact: true }).click()
    const popup = page.locator('[role="dialog"][data-start-template-preview="tracy-business"]')
    await popup.waitFor()
    await popup.locator('iframe').waitFor()
    assert.match(await popup.locator('iframe').getAttribute('src'), /template-demo/)
    await popup.getByRole('button', { name: 'Mobile', exact: true }).click()
    assert.equal(await popup.locator('[data-phone-frame]').count(), 1)
    assert.deepEqual(await page.evaluate(() => window.__harness.activeTab()), active)
    assert.equal(page.context().pages().length, 1)
    await popup.getByRole('button', { name: 'Use Tracy Business', exact: true }).click()
    await popup.waitFor({ state: 'detached' })
    // Use confirms the design and moves on once its support is known (`confirmedDesign` in wizard.tsx);
    // back on Design, it is the pick.
    await page.locator('[data-wizard-current="address"]').waitFor()
    await goToStep(page, 'design')
    assert.equal(await card.getAttribute('aria-pressed'), 'true')
  })
})

test('a two-mode template preview offers Light | Dark beside Desktop | Mobile and reloads the demo on that side', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    const card = page.locator('[data-start-template="tracy-business"]')
    await card.locator('[title]').hover()
    await card.locator('..').getByRole('button', { name: 'Open preview', exact: true }).click()
    const popup = page.locator('[role="dialog"][data-start-template-preview="tracy-business"]')
    await popup.locator('iframe').waitFor()
    const themes = popup.getByRole('group', { name: 'Theme', exact: true })
    await themes.waitFor()
    const light = themes.getByRole('button', { name: 'Light', exact: true })
    const dark = themes.getByRole('button', { name: 'Dark', exact: true })
    assert.equal(await light.getAttribute('aria-pressed'), 'true')
    assert.match(await popup.locator('iframe').getAttribute('src'), /[?&]theme=light\b/)
    await dark.click()
    assert.equal(await dark.getAttribute('aria-pressed'), 'true')
    await popup.locator('iframe[src*="theme=dark"]').waitFor()
    await popup.getByRole('button', { name: 'Mobile', exact: true }).click()
    assert.match(
      await popup.locator('iframe').getAttribute('src'),
      /[?&]theme=dark\b/,
      'the side survives a device switch'
    )
    await light.click()
    await popup.locator('iframe[src*="theme=light"]').waitFor()
  })
})

test('a template whose demo has no dark mode shows no Light | Dark switch', async () => {
  await withPage('start=plus&template-light-only=1', async (page) => {
    await formReady(page)
    const card = page.locator('[data-start-template="tracy-business"]')
    await card.locator('[title]').hover()
    await card.locator('..').getByRole('button', { name: 'Open preview', exact: true }).click()
    const popup = page.locator('[role="dialog"][data-start-template-preview="tracy-business"]')
    await popup.locator('iframe').waitFor()
    await popup.getByRole('button', { name: 'Mobile', exact: true }).waitFor()
    assert.equal(await popup.locator('[data-theme-switch]').count(), 0)
    assert.match(await popup.locator('iframe').getAttribute('src'), /[?&]theme=light\b/)
  })
})

test('preview pager walks only the filtered designs and Use selects and moves on to the address', async () => {
  await withPage('start=plus', async (page) => {
    await formReady(page)
    const gallery = page.locator('[data-start-template-gallery]')
    await gallery.getByPlaceholder('Search, e.g. JA Impact').fill('Tracy')
    const card = gallery.locator('[data-start-template="tracy"]')
    await card.locator('[title]').hover()
    await card.locator('..').getByRole('button', { name: 'Open preview', exact: true }).click()
    const popup = page.getByRole('dialog')
    assert.equal(await popup.getAttribute('data-start-template-preview'), 'tracy')
    await popup.getByRole('button', { name: 'Next starting design', exact: true }).click()
    assert.equal(await popup.getAttribute('data-start-template-preview'), 'tracy-business')
    await popup.getByRole('button', { name: 'Previous starting design', exact: true }).click()
    assert.equal(await popup.getAttribute('data-start-template-preview'), 'tracy')
    await popup.getByRole('button', { name: 'Use Tracy Base', exact: true }).click()
    await popup.waitFor({ state: 'detached' })
    // Use confirms the design and moves on once its support is known (`confirmedDesign` in wizard.tsx);
    // back on Design, it is the pick.
    await page.locator('[data-wizard-current="address"]').waitFor()
    await goToStep(page, 'design')
    assert.equal(await card.getAttribute('aria-pressed'), 'true')
    assert.deepEqual(await create(page, 'draft-selection'), {
      label: 'draft-selection',
      platform: 'joomla',
      design: 'tracy'
    })
  })
})

test('a demo that refuses framing shows its full desktop shot only in the popup', async () => {
  await withPage('start=plus&template-unframable=1', async (page) => {
    await formReady(page)
    const card = page.locator('[data-start-template="tracy-business"]')
    await card.locator('[title]').hover()
    await card.locator('..').getByRole('button', { name: 'Open preview', exact: true }).click()
    const popup = page.getByRole('dialog')
    const image = popup.locator('img')
    await image.waitFor()
    assert.match(await image.getAttribute('src'), /business-home\.png$/)
    assert.equal(await popup.locator('iframe').count(), 0)
    assert.equal(
      await image.evaluate((img) => {
        let el = img.parentElement
        while (el) {
          if (['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) return true
          el = el.parentElement
        }
        return false
      }),
      true
    )
    await popup.getByRole('button', { name: 'Close', exact: true }).click()
    await popup.waitFor({ state: 'detached' })
    assert.equal(await card.getAttribute('aria-pressed'), 'true')
  })
})
