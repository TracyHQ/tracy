#!/usr/bin/env node
/**
 * Browser test: the share page of a Website Opportunities demo with "See another look"
 * (`opportunities-build/demo-look-page.js`), under its real Content-Security-Policy (`pageSecurityHeaders` with the
 * demo's origin as `frame-src`), in a real Chromium.
 *
 * What markup alone cannot show: the control appears only once the looks door answers; choosing a look puts the
 * look's preview ticket on the frame's address and keeps the page the owner browsed to (the frame says where it is,
 * `tracy-ds-at`, as the live preview's script does); the radio group answers the arrow keys; "I like this look" posts
 * `{id}` from Tracy's own page (`Sec-Fetch-Site: same-origin`) and says what the door answered; Escape closes and
 * gives the focus back; focus is a 1px border that changes colour, never a halo; nothing overflows a 360px phone and
 * the control keeps a 16px gutter; both themes paint; the policy refuses nothing the page needs.
 *
 * Nothing leaves the machine: Tracy's origin, the demo and the font hosts are answered by `page.route`. Playwright
 * comes from where the repo declares it (apps/tracy-host). A missing dependency or a browser that will not launch
 * FAILS the test: there is no skip.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { translator } from '../../src/lib/i18n/index.js'
import { pageSecurityHeaders } from '../../src/lib/security-headers.js'
import { demoLookPage } from '../../src/opportunities-build/demo-look-page.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..', '..')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(repoRoot, 'apps/tracy-host')] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

const TRACY = 'http://tracy.test'
const DEMO = 'http://demo.test'
const TOKEN = 'A'.repeat(32)
const SYSTEMS = [1, 2, 3, 4].map((n) => ({
  id: `refero:00000000-0000-4000-8000-00000000000${n}`,
  n,
  colors: ['#1d4ed8', '#fafaf9', '#111827'],
  ticket: `tk${n}.sig`
}))
const WORDS = ['open', 'current', 'numbered', 'note', 'like', 'sent', 'own', 'failed', 'close', 'frameTitle']

/** The share page as the door renders it, in `lang`. */
function sharePage(lang) {
  const t = translator(lang)
  return demoLookPage({
    htmlLang: t.htmlLang,
    title: 'Pho Ba',
    target: `${DEMO}/menu?lang=vi`,
    systemsUrl: `/api/demo-links/${TOKEN}/systems`,
    pickUrl: `/api/demo-links/${TOKEN}/systems/pick`,
    words: /** @type {any} */ (Object.fromEntries(WORDS.map((w) => [w, t(`demoLooks.${w}`)])))
  })
}

/**
 * A demo page: says which look it wears, and tells Tracy's origin where it is, as the live preview's frame script
 * does on a page carrying a ticket (`design-system-live-page.js` `frameScriptOf`).
 */
const demoPage = (url) => {
  const ticket = new URL(url).searchParams.get('tracy_ds_preview')
  const tell = ticket
    ? `<script>parent.postMessage({type:'tracy-ds-at',href:location.href,theme:'light'},${JSON.stringify(TRACY)})</script>`
    : ''
  return `<!doctype html><html><head><title>Demo</title></head><body style="margin:0;height:2000px;background:${ticket ? '#dbeafe' : '#fef3c7'}"><h1 id="wears">${ticket ?? 'as built'}</h1>${tell}</body></html>`
}

let browser
before(async () => {
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
})

/** One page on the share link, with every request answered here. */
async function openShare({
  lang = 'en',
  width = 1280,
  height = 800,
  scheme = 'light',
  pickAnswers = []
} = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme })
  const page = await context.newPage()
  const picks = []
  const csp = []
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text())
  })
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.origin === TRACY && url.pathname === `/d/${TOKEN}`) {
      return route.fulfill({
        status: 200,
        headers: {
          ...pageSecurityHeaders({ frameSrc: DEMO }),
          'content-type': 'text/html; charset=utf-8'
        },
        body: sharePage(lang)
      })
    }
    if (url.origin === TRACY && url.pathname === `/api/demo-links/${TOKEN}/systems`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ origin: DEMO, param: 'tracy_ds_preview', systems: SYSTEMS })
      })
    }
    if (url.origin === TRACY && url.pathname === `/api/demo-links/${TOKEN}/systems/pick`) {
      const headers = await req.allHeaders()
      picks.push({ method: req.method(), body: req.postDataJSON(), headers })
      const reply = pickAnswers[picks.length - 1] ?? { counted: true }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) })
    }
    if (url.origin === DEMO) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: demoPage(req.url()) })
    }
    return route.abort()
  })
  await page.goto(`${TRACY}/d/${TOKEN}`)
  return { context, page, picks, csp }
}

const frameUrl = async (page) => new URL(await page.locator('#dl-frame').getAttribute('src'))
const demoFrame = (page) => page.frames().find((f) => f.url().startsWith(DEMO))

test('the control shows once the looks load, previews a look by its ticket, keeps the page, and sends the pick', async () => {
  const { context, page, picks, csp } = await openShare({
    pickAnswers: [{ counted: true }, { counted: false, reason: 'OWN' }]
  })
  try {
    const opener = page.locator('#dl-open')
    await opener.waitFor({ state: 'visible' })
    assert.equal(await opener.textContent(), 'See another look')
    assert.equal((await frameUrl(page)).href, `${DEMO}/menu?lang=vi`, 'the demo as built, at the asked page')

    await opener.click()
    const panel = page.locator('#dl-panel')
    await panel.waitFor({ state: 'visible' })
    assert.equal(await opener.isVisible(), false)
    const options = page.locator('.dl-opt')
    assert.deepEqual(await options.allTextContents(), [
      'Current look',
      'Look 1',
      'Look 2',
      'Look 3',
      'Look 4'
    ])
    assert.equal(await page.locator('.dl-opt[aria-checked="true"]').textContent(), 'Current look')
    assert.equal(
      await page.locator('.dl-opt').nth(2).locator('.dl-sw i').count(),
      3,
      'the palette, as swatches'
    )
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('data-look')),
      'current',
      'the open panel focuses the chosen look'
    )

    // Look 2: its ticket on the frame's address, same page and query.
    await options.nth(2).click()
    let at = await frameUrl(page)
    assert.equal(at.pathname, '/menu')
    assert.equal(at.searchParams.get('lang'), 'vi')
    assert.equal(at.searchParams.get('tracy_ds_preview'), 'tk2.sig')
    await page.waitForFunction(() => document.querySelector('#dl-frame')?.contentWindow?.length !== undefined)
    await page.waitForTimeout(200)
    assert.equal(await demoFrame(page)?.locator('#wears').textContent(), 'tk2.sig')

    // The owner browses inside the look; the frame says where it is; the next look opens on that page.
    await demoFrame(page).goto(`${DEMO}/about?tracy_ds_preview=tk2.sig`)
    await page.waitForTimeout(200)
    await options.nth(0).click()
    at = await frameUrl(page)
    assert.equal(at.href, `${DEMO}/about`, 'Current look: the same page, no ticket')

    // The arrow keys move the choice, and the frame follows.
    await options.nth(0).focus()
    await page.keyboard.press('ArrowDown')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Look 1')
    assert.equal((await frameUrl(page)).searchParams.get('tracy_ds_preview'), 'tk1.sig')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Look 4')

    // I like this look: `{id}` of the chosen look, from Tracy's own page; the answer is said.
    const like = page.locator('#dl-like')
    await like.click()
    await page.locator('#dl-status', { hasText: 'Thanks. Your choice was sent.' }).waitFor()
    assert.equal(picks.length, 1)
    assert.deepEqual(picks[0].body, { id: SYSTEMS[3].id })
    assert.equal(picks[0].method, 'POST')
    // A plain-http origin gets no Fetch Metadata from Chromium; the door then reads `Origin`, Tracy's own here.
    assert.ok([undefined, 'same-origin'].includes(picks[0].headers['sec-fetch-site']))
    assert.equal(picks[0].headers.origin, TRACY)
    assert.match(picks[0].headers['content-type'], /application\/json/)
    assert.equal(await like.isDisabled(), true, 'one press per look')
    await options.nth(1).click()
    assert.equal(await page.locator('#dl-status').textContent(), '', 'a new look clears the line')
    await like.click()
    await page.locator('#dl-status', { hasText: 'Not counted: this is your own demo.' }).waitFor()
    assert.deepEqual(picks[1].body, { id: SYSTEMS[0].id })

    // Escape closes and gives the focus back to the control.
    await options.nth(1).focus()
    await page.keyboard.press('Escape')
    assert.equal(await panel.isVisible(), false)
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'dl-open')
    assert.deepEqual(csp, [], 'the policy refuses nothing the page needs')
  } finally {
    await context.close()
  }
})

test('focus is a 1px border that changes colour, never a halo', async () => {
  const { context, page } = await openShare()
  try {
    await page.locator('#dl-open').waitFor({ state: 'visible' })
    const style = (sel) =>
      page.evaluate((s) => {
        const cs = getComputedStyle(document.querySelector(s))
        return {
          border: cs.borderTopColor,
          width: cs.borderTopWidth,
          outline: cs.outlineStyle,
          shadow: cs.boxShadow
        }
      }, sel)
    const before = await style('#dl-open')
    // The control is the first stop of the keyboard, before every link of the demo.
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'dl-open')
    const focused = await style('#dl-open')
    assert.notEqual(focused.border, before.border, 'the border changes colour')
    assert.equal(focused.width, '1px')
    assert.equal(focused.outline, 'none')
    assert.equal(focused.shadow, before.shadow, 'no shadow is added on focus')
    await page.keyboard.press('Enter')
    const option = await style('.dl-opt[aria-checked="true"]')
    assert.equal(option.width, '1px')
    assert.equal(option.outline, 'none')
    assert.equal(option.shadow, 'none')
  } finally {
    await context.close()
  }
})

for (const scheme of ['light', 'dark'])
  test(`on a 360px phone (${scheme}): nothing overflows, the control keeps its gutter, the theme paints`, async () => {
    const { context, page, csp } = await openShare({ lang: 'vi', width: 360, height: 740, scheme })
    try {
      const opener = page.locator('#dl-open')
      await opener.waitFor({ state: 'visible' })
      assert.equal(await opener.textContent(), translator('vi')('demoLooks.open'))
      await opener.click()
      const box = await page.locator('#dl-panel').boundingBox()
      assert.ok(box.x >= 16 - 0.5, `left gutter ${box.x}`)
      assert.ok(box.x + box.width <= 360 - 16 + 0.5, `right gutter ${box.x + box.width}`)
      assert.ok(
        box.y >= 0 && box.y + box.height <= 740 - 16 + 0.5,
        `inside the screen ${JSON.stringify(box)}`
      )
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        panel:
          document.querySelector('#dl-panel').scrollWidth - document.querySelector('#dl-panel').clientWidth
      }))
      assert.ok(overflow.doc <= 360, `page ${overflow.doc}px wide`)
      assert.equal(overflow.panel, 0, 'no sideways scroll in the panel')
      const card = await page.evaluate(
        () => getComputedStyle(document.querySelector('#dl-panel')).backgroundColor
      )
      const light = scheme === 'light'
      // oklch(1 0 0) is white; the dark card is oklch(0.195 0 0).
      assert.ok(
        light
          ? /oklch\(1 0 0\)|rgb\(255, 255, 255\)/.test(card)
          : !/oklch\(1 0 0\)|rgb\(255, 255, 255\)/.test(card),
        card
      )
      assert.deepEqual(csp, [])
    } finally {
      await context.close()
    }
  })
