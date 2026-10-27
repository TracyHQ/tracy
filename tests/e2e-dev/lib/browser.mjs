// A thin Playwright layer: one Chrome of the suite's own (headless, launched here — the
// chrome-watch exception approved for this suite, plan §5 Q5), one context per role, and every
// browser error collected with the frame and URL it came from, for `errors.mjs` to judge.
//
// Playwright is not a root dependency. The workspace already installs it for `apps/tracy-host`,
// so it is resolved from there instead of adding a second copy (and a lockfile change).

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENV } from './env.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** @returns {typeof import('playwright')} */
function loadPlaywright() {
  for (const anchor of ['package.json', 'apps/tracy-host/package.json']) {
    try {
      return createRequire(join(REPO, anchor))('playwright')
    } catch {
      // try the next anchor
    }
  }
  throw new Error(
    'playwright is not installed in this checkout (expected via apps/tracy-host); run pnpm install'
  )
}

/**
 * Launch the suite's own headless Chrome.
 * @returns {Promise<import('playwright').Browser>}
 */
export async function launch() {
  const { chromium } = loadPlaywright()
  return chromium.launch({ headless: true })
}

/**
 * @typedef {import('./errors.mjs').BrowserEvent & { at: number, step: string }} RecordedEvent
 */

/**
 * One role's browser context: its own cookie jar (the role's session, or none for a stranger), and
 * an event log every page opened in it writes to. `step` names what the journey is doing, so the
 * error judge knows whether a site error belongs to the step under test.
 * @param {import('playwright').Browser} browser
 * @param {{ name: string, token?: string | null }} role
 */
export async function roleContext(browser, { name, token = null }) {
  const context = await browser.newContext({
    userAgent: ENV.userAgent,
    viewport: { width: 1440, height: 900 }
  })
  if (token) {
    await context.addCookies([
      {
        name: ENV.sessionCookie,
        value: token,
        domain: ENV.cookieDomain,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax'
      }
    ])
  }
  /** @type {RecordedEvent[]} */
  const events = []
  /** @type {{ url: string, at: number, closed?: number, frames: number }[]} */
  const sockets = []
  const state = { step: 'start' }

  const record = (e) => events.push({ ...e, at: Date.now(), step: state.step })
  context.on('page', (page) => watch(page))
  function watch(page) {
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const loc = msg.location()
      record({
        type: 'console',
        message: msg.text().slice(0, 2000),
        url: loc?.url || undefined,
        frameUrl: page.url()
      })
    })
    page.on('pageerror', (error) => {
      const stack = String(error.stack ?? '')
      // The script that threw, from the first stack frame: what the error judge attributes by.
      const thrower = /\bat (?:.*?\()?(https?:\/\/[^\s)]+?):\d+:\d+\)?/.exec(stack)?.[1]
      record({
        type: 'pageerror',
        message: String(error.message).slice(0, 2000),
        stack: stack.slice(0, 2000),
        ...(thrower ? { url: thrower } : {}),
        frameUrl: page.url()
      })
    })
    page.on('requestfailed', (req) => {
      record({
        type: 'requestfailed',
        url: req.url(),
        message: req.failure()?.errorText ?? 'failed',
        frameUrl: req.frame()?.url()
      })
    })
    page.on('response', (res) => {
      if (res.status() < 400) return
      record({
        type: 'response',
        url: res.url(),
        status: res.status(),
        message: `HTTP ${res.status()}`,
        frameUrl: res.frame()?.url()
      })
    })
    // Observed from outside: wrapping `window.WebSocket` in the page breaks dsh (memory
    // `probe-must-not-wrap-websocket`), Playwright's event does not touch it.
    page.on('websocket', (ws) => {
      const s = { url: ws.url(), at: Date.now(), frames: 0 }
      sockets.push(s)
      ws.on('framereceived', () => {
        s.frames++
      })
      ws.on('close', () => {
        s.closed = Date.now()
      })
    })
  }

  return {
    name,
    context,
    events,
    sockets,
    /** Name the step that is running; events are tagged with it. */
    step(label) {
      state.step = label
    },
    /** Events recorded during one step. */
    eventsOf(label) {
      return events.filter((e) => e.step === label)
    },
    async newPage() {
      return context.newPage()
    },
    async close() {
      await context.close().catch(() => {})
    }
  }
}
