// Browser measurements are observations, not expectations copied into reports.
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { casesFor } from './qa-contract.mjs'

// Which Chromium draws the evidence is decided ONCE, from the environment, and every report says
// which one it was (`browserIdentity`). The default is the build Playwright ships for the version
// pnpm-lock.yaml pins (1.63.0 → Chromium 153.0.8010.12), so two runs a week apart render with the
// same binary and a difference between them is the site, not the browser. The machine's own Google
// Chrome used to come first — render-source.mjs keeps the reason, "avoid a 150 MB browser download
// on a machine that already has one" — but that Chrome updates itself: measured 2026-09-15, the
// system Chrome was 152.0.7977.84 while the lockfile's Chromium was 153.0.8010.12, and nothing in
// visual.json said which of the two had drawn the pictures. The download saving is still available,
// as a choice that leaves a trace in the report rather than a default nobody chose:
//   RENDER_CHROME_PATH=<executable>   an explicit binary (qa.test.mjs points it at a missing file
//                                      to prove the browser gate blocks instead of passing)
//   RENDER_CHROME_CHANNEL=chrome       the installed Google Chrome (or msedge, chrome-beta, …)
// No branch falls back to another: an opt-in that cannot launch fails the run, because a quiet
// fallback renders with a browser nobody asked for and the pin then exists only on paper. The child
// process visual-qa spawns for mega-hover inherits the environment, so it makes the same choice.
// It is only the same CHOICE, not a checked one: this template's visual-qa records its own
// `browserIdentity()` in the report and does not compare the version the child reports against it.
export function browserChoice(env = process.env) {
  if (env.RENDER_CHROME_PATH) return { launch: 'executable', executablePath: env.RENDER_CHROME_PATH }
  if (env.RENDER_CHROME_CHANNEL) return { launch: 'channel', channel: env.RENDER_CHROME_CHANNEL }
  return { launch: 'bundled' }
}
export async function launchBrowser() {
  const { chromium } = await import('playwright')
  const { launch: _launch, ...options } = browserChoice()
  return chromium.launch(options)
}
/** What actually rendered: the running binary's own version, how it was chosen, and the Playwright that chose it. */
export function browserIdentity(browser) {
  const { launch, ...options } = browserChoice()
  return {
    engine: browser.browserType().name(),
    version: browser.version(),
    launch,
    ...options,
    playwright: createRequire(import.meta.url)('playwright/package.json').version
  }
}
const normalize = (s) => s.replace(/\s+/g, ' ').trim()
// A design contract names the family that must render first; the rest of the stack is fallback
// policy and is reviewed under `fonts.allowed`. Pixel values tolerate sub-pixel rounding.
// Astro's font pipeline renames a family to `<name>-<hash>`; the hash is not part of the design.
const firstFamily = (v) =>
  String(v)
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/-[0-9a-f]{12,}$/i, '')
    .toLowerCase()
export function compareStyle(property, expected, actual) {
  if (property === 'font-family') return firstFamily(expected) === firstFamily(actual)
  if (expected.endsWith('px') && actual.endsWith('px'))
    return Math.abs(parseFloat(expected) - parseFloat(actual)) <= 0.1
  return expected === actual
}
export async function collectBrowser(contract, base, out, options = {}) {
  const browser = await launchBrowser()
  const observations = []
  mkdirSync(out, { recursive: true })
  try {
    for (const test of casesFor(contract)) {
      const spec = contract.pages.find((p) => p.id === test.page)
      const variant = contract.variants.find((v) => v.id === test.variant)
      const context = await browser.newContext({
        viewport: { width: variant.width, height: variant.height },
        deviceScaleFactor: 1,
        reducedMotion: variant.reducedMotion,
        ...(options.storageState ? { storageState: options.storageState } : {})
      })
      const page = await context.newPage()
      const shotOnFail = async () => {
        observation.screenshot = `${test.id.replaceAll('/', '--')}.png`
        await page.screenshot({ path: path.join(out, observation.screenshot), fullPage: true }).catch(() => {
          observation.screenshot = null
        })
      }
      const errors = [],
        resources = [],
        assertions = [],
        findings = []
      const observation = {
        ...test,
        capturedAt: new Date().toISOString(),
        viewport: { width: variant.width, height: variant.height },
        findings,
        assertions,
        resources,
        errors
      }
      page.on('pageerror', (e) => errors.push(e.message))
      // The document's own status on an expected-404 page logs "Failed to load resource"; sub-resource
      // failures are asserted from `resources` (with their URL) instead of from that text.
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text())
      })
      page.on('requestfailed', (r) => errors.push(`${r.url()}: ${r.failure()?.errorText}`))
      page.on('response', (r) => {
        if (r.request().resourceType() !== 'document')
          resources.push({ url: r.url(), status: r.status(), mime: r.headers()['content-type'] ?? '' })
      })
      const assert = (ok, issue) => {
        assertions.push({ issue, pass: Boolean(ok) })
        if (!ok) findings.push(issue)
      }
      try {
        const theme = contract.design.theme
        if (theme.storageKey)
          await context.addInitScript(
            ({ key, value }) => {
              value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)
            },
            { key: theme.storageKey, value: theme.values[variant.theme] ?? null }
          )
        const response = await page.goto(new URL(spec.path, base).href, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        observation.url = page.url()
        observation.status = response?.status()
        assert(response?.status() === spec.status, `HTTP status must be ${spec.status}`)
        assert(
          page.url() === new URL(spec.expectedPath ?? spec.path, base).href,
          `final URL matches the contract (observed ${page.url()})`
        )
        assert((await page.locator(spec.identity).count()) > 0, 'page identity selector matches')
        observation.lang = await page.locator('html').getAttribute('lang')
        assert(observation.lang === spec.locale, 'document language matches')
        observation.theme = await page.locator(theme.selector).getAttribute(theme.attribute)
        assert(
          observation.theme === (theme.values[variant.theme] ?? null),
          `observed theme matches requested theme (${variant.theme})`
        )
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
            window.scrollTo(0, y)
            await new Promise((r) => setTimeout(r, 50))
          }
          window.scrollTo(0, 0)
        })
        await page.waitForLoadState('networkidle')
        if (test.state !== 'default') {
          const interaction = contract.interactions[test.state]
          const trigger = page.locator(interaction.trigger)
          if (interaction.open === 'hover') await trigger.hover()
          else await trigger.click()
          await page.locator(interaction.panel).waitFor({ state: 'visible' })
          const triggerBox = await trigger.boundingBox(),
            panelBox = await page.locator(interaction.panel).boundingBox()
          if (triggerBox && panelBox) {
            await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2)
            await page.mouse.move(
              panelBox.x + panelBox.width / 2,
              panelBox.y + Math.min(12, panelBox.height / 2),
              { steps: 12 }
            )
          }
          assert(await page.locator(interaction.panel).isVisible(), 'panel reachable by real pointer')
          observation.panel = panelBox
          if (interaction.fullWidth) {
            assert(
              panelBox && Math.abs(panelBox.x) <= 1 && Math.abs(panelBox.width - variant.width) <= 1,
              'panel spans viewport width'
            )
          }
          if (interaction.inner) {
            const inner = await page.locator(interaction.inner).boundingBox()
            observation.inner = inner
            assert(
              inner &&
                inner.width <= interaction.maxInnerWidth + 1 &&
                Math.abs(inner.x * 2 + inner.width - variant.width) <= 2,
              'inner grid is centered and bounded'
            )
          }
        }
        observation.layout = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          islands: document.querySelectorAll('astro-island').length,
          hydrated: document.querySelectorAll('astro-island:not([ssr])').length
        }))
        assert(observation.layout.scrollWidth <= observation.layout.width, 'no page horizontal overflow')
        assert(
          observation.layout.islands === observation.layout.hydrated,
          'all visible-page islands hydrated after scrolling'
        )
        observation.images = await page.locator('img').evaluateAll(async (images) => {
          const visible = images.filter(
            (img) => img.getClientRects().length && getComputedStyle(img).visibility !== 'hidden'
          )
          return Promise.all(
            visible.map(async (img) => {
              try {
                await img.decode()
              } catch {}
              return {
                src: img.getAttribute('src'),
                currentSrc: img.currentSrc,
                complete: img.complete,
                width: img.naturalWidth,
                alt: img.getAttribute('alt')
              }
            })
          )
        })
        for (const img of observation.images) {
          assert(img.complete && img.width > 0, `image decodes: ${img.currentSrc || img.src}`)
          assert(img.alt !== null, `image has alt attribute: ${img.src}`)
          if (img.currentSrc?.includes('/_emdash/api/media/file/'))
            assert(
              new URL(img.currentSrc).origin === new URL(base).origin,
              `local media uses viewing origin: ${img.currentSrc}`
            )
        }
        // Capture CSS images and explicit static assets, including those not requested by headless Chrome.
        const referenced = await page.evaluate(() => {
          const urls = new Set()
          for (const e of document.querySelectorAll('*')) {
            for (const m of getComputedStyle(e).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g))
              urls.add(m[1])
          }
          for (const e of document.querySelectorAll('link[rel~="icon"],a[download],a[href$=".pdf"]'))
            urls.add(e.href)
          return [...urls]
        })
        observation.assets = []
        for (const url of referenced.filter((u) => !u.startsWith('data:'))) {
          const result = await context.request.get(new URL(url, page.url()).href)
          const mime = result.headers()['content-type'] ?? ''
          observation.assets.push({ url, status: result.status(), mime })
          assert(result.ok() && !mime.includes('text/html'), `static asset response: ${url}`)
        }
        // innerText is what the visitor reads: a <br> becomes whitespace, hidden text is dropped.
        observation.content = []
        for (const field of spec.content) {
          const elements = page.locator(field.selector),
            count = await elements.count()
          assert(count > 0, `content selector matches: ${field.id}`)
          const values =
            field.attribute === 'text'
              ? await elements.allInnerTexts()
              : await elements.evaluateAll(
                  (els, attr) => els.map((e) => e.getAttribute(attr)),
                  field.attribute
                )
          observation.content.push({ id: field.id, count, values })
          assert(
            values.length > 0 &&
              values.every((v) => typeof v === 'string' && normalize(v) === normalize(field.expected)),
            `content matches source: ${field.id}`
          )
        }
        observation.styles = []
        for (const id of spec.rules) {
          const rule = contract.design.rules.find((r) => r.id === id),
            expected = rule.styles[variant.id]
          const values = await page.locator(rule.selector).evaluateAll(
            (els, properties) =>
              els
                .filter((e) => e.getClientRects().length)
                .map((e) => {
                  const style = getComputedStyle(e),
                    rect = e.getBoundingClientRect()
                  return {
                    styles: Object.fromEntries(properties.map((p) => [p, style.getPropertyValue(p)])),
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                  }
                }),
            Object.keys(expected)
          )
          // `optional` rules describe a role a page may not carry (chips, h3); only a required rule must match.
          if (!values.length && rule.optional) {
            observation.styles.push({ id, values, optional: true })
            continue
          }
          assert(values.length > 0, `design selector matches: ${id}`)
          observation.styles.push({ id, values })
          for (const item of values)
            for (const [property, value] of Object.entries(expected)) {
              const actual = item.styles[property]
              const equal = compareStyle(property, value, actual)
              assert(equal, `design ${id}.${property}: expected ${value}, observed ${actual}`)
            }
        }
        // CDP reports the platform fonts supplying glyphs; computed font-family does not.
        const cdp = await context.newCDPSession(page)
        await cdp.send('DOM.enable')
        await cdp.send('CSS.enable')
        const { root } = await cdp.send('DOM.getDocument')
        // `fonts.allowed[locale]` names the families approved for that locale (bundled or an explicitly
        // accepted system fallback); any other family rendering a glyph is a silent substitution.
        observation.fonts = []
        const allowed = contract.fonts?.allowed?.[spec.locale]
        for (const selector of contract.fonts?.selectors ?? ['h1', 'p']) {
          const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })
          for (const nodeId of nodeIds) {
            const result = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
            observation.fonts.push({ selector, nodeId, fonts: result.fonts })
            if (allowed)
              for (const f of result.fonts)
                assert(
                  allowed.includes(f.familyName),
                  `font ${f.familyName} (${f.glyphCount} glyphs in ${selector}) is not in the allowed list for ${spec.locale}`
                )
          }
        }
        // A picture only when the case FAILS, to look at the failure: the visual gate takes the pictures
        // people review (site + source per axis); a second full-page shot per case here was 400 files
        // nobody opened (measured 2026-09-14, 128 MB per run).
        observation.screenshot = null
        if (test.state !== 'default') {
          const interaction = contract.interactions[test.state]
          const link = page.locator(interaction.link).first()
          const href = await link.getAttribute('href')
          assert(Boolean(href) && href !== '#', 'panel link has a real destination')
          // Radix closes and returns focus after its exit animation: poll, bounded, instead of asking once.
          await page.keyboard.press('Escape')
          const closed = await page
            .locator(interaction.panel)
            .waitFor({ state: 'hidden', timeout: 2000 })
            .then(
              () => true,
              () => false
            )
          assert(closed, 'Escape closes panel')
          const refocused = await page.locator(interaction.trigger).evaluate(
            (e) =>
              new Promise((resolve) => {
                const started = Date.now()
                const tick = () => {
                  if (document.activeElement === e) return resolve(true)
                  if (Date.now() - started > 2000) return resolve(false)
                  setTimeout(tick, 50)
                }
                tick()
              })
          )
          assert(refocused, 'Escape restores trigger focus')
          if (interaction.open === 'hover') await page.locator(interaction.trigger).hover()
          else await page.locator(interaction.trigger).click()
          await page.locator(interaction.panel).waitFor({ state: 'visible' })
          await link.click()
          await page.waitForLoadState('networkidle')
          assert(page.url() === new URL(href, base).href, 'real panel link navigates')
        }
        for (const r of resources) assert(r.status < 400, `resource HTTP ${r.status}: ${r.url}`)
        for (const error of errors) findings.push(`browser: ${error}`)
      } catch (error) {
        findings.push(error.message)
      } finally {
        if (findings.length && !page.isClosed()) await shotOnFail()
        await context.close()
      }
      observation.status = findings.length ? 'fail' : 'pass'
      observations.push(observation)
      options.onCase?.(observation)
    }
  } finally {
    await browser.close()
  }
  return observations
}
