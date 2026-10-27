/**
 * What every browser case under `specs/` shares: where the stand is, how a seat signs in without a
 * mailed code, and the Chrome the specs drive.
 *
 * - `TRACY_STAND` (set by `run.mjs` from `--stand`) is the stand's origin. There is no default: a
 *   spec that guessed a stand would judge a different deployment than the one the runner named.
 * - `TRACY_STAND_ENV` is the stand's env file, read only for `SESSION_SECRET`
 *   (default `~/TCH-local/scv2/.env`). The secret and the cookies minted with it are never printed.
 * - `REG_CDP` is the chrome-watch endpoint (default `http://127.0.0.1:9222`). The specs connect to
 *   that Chrome and never launch their own, and they never close a page, a context or the browser:
 *   the person watching keeps what the spec opened, and the contexts go when the process exits.
 *
 * Seats are named by letter, as in `tests/regression/README.md` § Common setup: seat `a` of the
 * stand `scv2` is `scv2-a@example.test`. A full address works too (a fresh invitee, say).
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test as base } from '@playwright/test'
import { mintSession, SESSION_COOKIE } from '../../../apps/tracy-web/src/lib/session.js'

/** The stand's origin, without a trailing slash. */
export const ORIGIN = (() => {
  const raw = process.env.TRACY_STAND
  if (!raw)
    throw new Error(
      'TRACY_STAND is not set: run through tests/regression/run.mjs --stand <origin>, or export it'
    )
  return new URL(raw).origin
})()

/** Domain of the `tracy_sess` cookie: the stand's host and every site under it. */
export const COOKIE_DOMAIN = `.${new URL(ORIGIN).hostname}`

/** The stand's name: the first label of its host (`scv2` for `scv2.tracy.test`). */
export const STAND_NAME = new URL(ORIGIN).hostname.split('.')[0]

/** The stand's domain, the part a site key adds its label to (`scv2.tracy.test`). */
export const STAND_DOMAIN = new URL(ORIGIN).hostname

/**
 * A test site's key on this stand.
 * @param {'wp' | 'jo' | 'em'} cms - which test site.
 * @returns {string} e.g. `scv2wp.scv2.tracy.test`.
 */
export const siteKey = (cms) => `${STAND_NAME}${cms}.${STAND_DOMAIN}`

const ENV_FILE = process.env.TRACY_STAND_ENV ?? join(homedir(), 'TCH-local', STAND_NAME, '.env')

let secret = /** @type {string | null} */ (null)
function sessionSecret() {
  if (secret) return secret
  const line = readFileSync(ENV_FILE, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('SESSION_SECRET='))
  if (!line) throw new Error(`no SESSION_SECRET in ${ENV_FILE}`)
  secret = line.slice('SESSION_SECRET='.length).trim()
  return secret
}

/**
 * A seat's address: a letter is the stand's seat (`a` → `scv2-a@example.test`), anything with an
 * `@` is taken as it is.
 * @param {string} seat - letter or address.
 * @returns {string} the address.
 */
export const seatEmail = (seat) => (seat.includes('@') ? seat : `${STAND_NAME}-${seat}@example.test`)

const minted = new Map()

/**
 * The seat's session cookie value, minted with the stand's secret. Never print it.
 * @param {string} seat - letter or address.
 * @returns {Promise<string>} the `tracy_sess` value.
 */
export async function mint(seat) {
  const email = seatEmail(seat)
  if (!minted.has(email)) minted.set(email, await mintSession(email, sessionSecret()))
  return minted.get(email)
}

/**
 * Call a stand door as a seat, the way the browser would (same Origin, the seat's cookie).
 * @param {string} seat - letter or address.
 * @param {string} method - HTTP method.
 * @param {string} path - path on the stand, starting with `/`.
 * @param {unknown} [body] - JSON body.
 * @param {{accept?: string, redirect?: RequestRedirect}} [o] - request options.
 * @returns {Promise<{status: number, location: string | null, json: any, text: string}>} the answer.
 */
export async function api(seat, method, path, body, o = {}) {
  const r = await fetch(`${ORIGIN}${path}`, {
    method,
    redirect: o.redirect ?? 'follow',
    headers: {
      Cookie: `${SESSION_COOKIE}=${await mint(seat)}`,
      Origin: ORIGIN,
      Accept: o.accept ?? 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(300_000)
  })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // not JSON: the caller reads `text`
  }
  return { status: r.status, location: r.headers.get('location'), json, text }
}

/**
 * A fresh context signed in as the seat. A new context per seat, because the shared Chrome keeps
 * other sessions' cookies in its default one. Never closed here.
 * @param {import('@playwright/test').Browser} browser - the chrome-watch Chrome.
 * @param {string} seat - letter or address.
 * @param {import('@playwright/test').BrowserContextOptions} [options] - locale, viewport…
 * @returns {Promise<import('@playwright/test').BrowserContext>} the context.
 */
export async function seatContext(browser, seat, options = {}) {
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1400, height: 900 },
    ...options
  })
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: await mint(seat),
      domain: COOKIE_DOMAIN,
      path: '/',
      httpOnly: true
    }
  ])
  ours.push(context)
  if (artifacts.trace !== 'off') await context.tracing.start({ screenshots: true, snapshots: true })
  return context
}

/**
 * The contexts this test made, the only ones its trace and failure screenshots may record.
 * Playwright's own `trace`/`screenshot` options record EVERY context of the browser, and over CDP
 * that includes the shared Chrome's default context: other sessions' pages (measured 06/10/2026:
 * 58 screenshots for one failed spec, an unrelated shop page as its "page snapshot").
 * @type {import('@playwright/test').BrowserContext[]}
 */
const ours = []
/** This test's trace policy, from the config's `seatTrace`. */
const artifacts = { trace: 'off' }

/**
 * Playwright's `test` with `browser` taken from chrome-watch over CDP instead of launched. The
 * fixture never closes it: closing a CDP-connected browser would clear contexts the person
 * watching may still be using. Specs make their own contexts with `seatContext`; the built-in
 * `context` and `page` fixtures are not for these specs. `seatArtifacts` keeps a trace and failure
 * screenshots of those contexts only (`seatTrace`, `seatScreenshot` in the config).
 */
export const test = base.extend({
  seatTrace: ['retain-on-failure', { option: true }],
  seatScreenshot: ['only-on-failure', { option: true }],
  seatArtifacts: [
    async ({ seatTrace, seatScreenshot }, use, testInfo) => {
      ours.length = 0
      artifacts.trace = seatTrace
      await use(undefined)
      const failed = testInfo.errors.length > 0 || testInfo.status !== testInfo.expectedStatus
      for (const [i, context] of ours.entries()) {
        if (failed && seatScreenshot !== 'off') {
          for (const [j, page] of context.pages().entries()) {
            const path = testInfo.outputPath(`seat-${i}-page-${j}.png`)
            try {
              await page.screenshot({ path, timeout: 5_000 })
              await testInfo.attach(`seat-${i}-page-${j}`, { path, contentType: 'image/png' })
            } catch {
              // a page that cannot be shot (closed, crashed) leaves no image, not a second error
            }
          }
        }
        if (seatTrace !== 'off') {
          const path = failed ? testInfo.outputPath(`seat-${i}-trace.zip`) : undefined
          await context.tracing.stop(path ? { path } : {}).catch(() => {})
          if (path) await testInfo.attach(`seat-${i}-trace`, { path, contentType: 'application/zip' })
        }
      }
    },
    { auto: true }
  ],
  browser: [
    async ({ playwright }, use) => {
      const browser = await playwright.chromium.connectOverCDP(process.env.REG_CDP ?? 'http://127.0.0.1:9222')
      await use(browser)
    },
    { scope: 'worker' }
  ]
})

export { expect } from '@playwright/test'
