#!/usr/bin/env node
/**
 * Browser test: the identity pages that are one card of text keep that text off the card's
 * border, in both themes, on a desktop and on a 360px viewport.
 *
 * `identity-pages-card.test.mjs` pins the markup (every word inside a padded card part); this pins
 * what markup alone cannot show: the measured distance between the card's edge and the text, that
 * nothing overflows sideways, that the page has one `<main>` once a browser has parsed it, and
 * that both themes paint. The sign-in page is the answer of the REAL callback to a sign-in the
 * person cancelled at the provider, so the page measured is the one that person gets.
 *
 * The pages follow `prefers-color-scheme`, which the browser context sets. Nothing is fetched:
 * every request is aborted, so the fonts are the system fallbacks and no CDN decides the result.
 *
 * `SIGNIN_EVIDENCE_DIR`: when set, one screenshot per page, theme and width is written to
 * `<dir>/screenshots/after/`; a screenshot that cannot be written fails the test.
 *
 * Playwright comes from where the repo declares it (apps/tracy-host). A missing dependency or a
 * browser that will not launch FAILS the test: there is no skip.
 */
import assert from 'node:assert/strict'
import { mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  desktopConfirmPage,
  deviceApprovedPage,
  deviceConfirmPage,
  deviceDeniedPage
} from '../../src/identity/pages.js'
import { identityRoutes } from '../../src/identity/route.js'
import { memoryIdentityStore } from '../../src/identity/store.js'
import { translate } from '../../src/lib/i18n/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..', '..')
const require = createRequire(import.meta.url)
const playwrightPath = require.resolve('playwright', { paths: [path.join(repoRoot, 'apps/tracy-host')] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

const ORIGIN = 'http://tracy.test'
const EMAIL = 'person@example.test'
/** The least room, in CSS pixels, between the card's edge and anything a person reads in it. */
const MIN_INSET = 16
const SCHEMES = ['light', 'dark']
const WIDTHS = [1280, 360]

const evidenceDir = process.env.SIGNIN_EVIDENCE_DIR
  ? path.join(process.env.SIGNIN_EVIDENCE_DIR, 'screenshots', 'after')
  : null

/** The page a person gets after cancelling at Google, from the real callback. */
async function cancelledPage() {
  const app = identityRoutes({
    config: {
      origin: ORIGIN,
      sessionSecret: 's'.repeat(32),
      sessionDomain: 'tracy.test',
      siteDomain: 'tracy.test',
      secure: false,
      defaultHost: 'local',
      oauth: { google: { id: 'fixture-id', secret: 'fixture-secret' } },
      beta: { enabled: false }
    },
    store: memoryIdentityStore(),
    mail: { send: async () => {}, signInCodeMail: () => ({ subject: '', text: '' }) },
    now: () => 1_700_000_000_000,
    beta: null,
    fetchImpl: async () => {
      throw new Error('a cancelled sign-in must not reach the provider')
    }
  })
  const started = await app.request(`${ORIGIN}/signin/google?next=%2Facme%2F`)
  const state = new URL(started.headers.get('location')).searchParams.get('state')
  const cookie = started.headers.getSetCookie()[0].split(';')[0]
  const response = await app.request(`${ORIGIN}/signin/google/callback?state=${state}&error=access_denied`, {
    headers: { accept: 'text/html', cookie }
  })
  assert.equal(response.status, 400)
  const html = await response.text()
  assert.ok(html.includes(translate('en', 'signin.cancelledBody', { provider: 'Google' })))
  return html
}

const PAGES = {
  'signin-failed': cancelledPage,
  'device-confirm': () =>
    deviceConfirmPage({ email: EMAIL, nonce: 'n'.repeat(64), device: 'Chrome on macOS' }),
  'device-confirm-unknown-device': () => deviceConfirmPage({ email: EMAIL, nonce: 'n'.repeat(64) }),
  'device-approved': () => deviceApprovedPage({ email: EMAIL }),
  'device-approved-error': () => deviceApprovedPage({ error: translate('en', 'device.linkGone') }),
  'desktop-confirm': () =>
    desktopConfirmPage({ email: EMAIL, nonce: 'n'.repeat(64), device: 'MacBook Pro', code: 'K7-QX-42' }),
  'desktop-confirm-unknown-device': () =>
    desktopConfirmPage({ email: EMAIL, nonce: 'n'.repeat(64), code: 'K7-QX-42' }),
  'desktop-approved': () => deviceApprovedPage({ email: EMAIL, desktop: true }),
  'device-denied': () => deviceDeniedPage()
}

/** What the browser laid out: runs in the page. */
function measure() {
  const card = document.querySelector('.card')
  if (!card) return null
  const box = card.getBoundingClientRect()
  const round = (n) => Math.round(n * 10) / 10
  const readable = [...card.querySelectorAll('h1, p, button, a')].map((el) => {
    // A block's own box spans the card part; the room that matters is around its text.
    const range = document.createRange()
    range.selectNodeContents(el)
    const rect = el.tagName === 'BUTTON' ? el.getBoundingClientRect() : range.getBoundingClientRect()
    return {
      tag: el.tagName.toLowerCase(),
      text: el.textContent.trim().slice(0, 40),
      width: round(rect.width),
      left: round(rect.left - box.left),
      right: round(box.right - rect.right),
      part: el.closest('.card-header, .card-content, .card-footer') !== null
    }
  })
  return {
    mains: document.querySelectorAll('main').length,
    cardInMain: card.parentElement?.tagName === 'MAIN',
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    background: getComputedStyle(document.body).backgroundColor,
    foreground: getComputedStyle(card).color,
    readable
  }
}

let browser

before(async () => {
  browser = await chromium.launch()
  if (evidenceDir) mkdirSync(evidenceDir, { recursive: true })
})

after(async () => {
  await browser?.close()
})

for (const [name, render] of Object.entries(PAGES)) {
  test(`${name}: text sits inside the card in both themes, at 1280px and 360px, with one main`, async () => {
    const html = await render()
    const painted = {}
    for (const scheme of SCHEMES) {
      for (const width of WIDTHS) {
        const where = `${name} ${scheme} ${String(width)}px`
        const context = await browser.newContext({ viewport: { width, height: 720 }, colorScheme: scheme })
        try {
          const page = await context.newPage()
          await page.route('**/*', (route) => route.abort())
          await page.setContent(html, { waitUntil: 'domcontentloaded' })
          const got = await page.evaluate(measure)
          assert.ok(got, `${where}: no .card on the page`)
          assert.equal(got.mains, 1, `${where}: one main landmark`)
          assert.ok(got.cardInMain, `${where}: the card is a child of the shell's main`)
          assert.ok(got.overflow <= 0, `${where}: overflows sideways by ${String(got.overflow)}px`)
          assert.ok(got.readable.length >= 2, `${where}: a heading and a sentence at least`)
          for (const el of got.readable) {
            const what = `${where}: <${el.tag}> "${el.text}"`
            assert.ok(el.width > 0, `${what} is not laid out`)
            assert.ok(el.part, `${what} is outside the card's padded parts`)
            assert.ok(el.left >= MIN_INSET, `${what} is ${String(el.left)}px from the left edge`)
            assert.ok(el.right >= MIN_INSET, `${what} is ${String(el.right)}px from the right edge`)
          }
          painted[scheme] = { background: got.background, foreground: got.foreground }
          if (evidenceDir) {
            const file = path.join(evidenceDir, `${name}-${scheme}-${String(width)}.png`)
            await page.screenshot({ path: file })
            assert.ok(statSync(file).size > 0, `${where}: the screenshot was not written`)
          }
        } finally {
          await context.close()
        }
      }
    }
    assert.notEqual(
      painted.light.background,
      painted.dark.background,
      `${name}: the themes share a background`
    )
    assert.notEqual(
      painted.light.foreground,
      painted.dark.foreground,
      `${name}: the themes share a text colour`
    )
  })
}
