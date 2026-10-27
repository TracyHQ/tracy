// The place-profile journeys look at pages through the user's watchable headless Chrome (`chrome-watch`,
// ~/.claude/CLAUDE.md "Headless Chrome"), never a Chrome of their own: raw CDP over the browser socket, one browser
// context per role (its own cookie jar, so the run's session never lands in another agent's tabs), created with
// `disposeOnDetach: false` so the page stays open for the user after the journey ends. Nothing here closes a page.
//
// Errors are read from chrome-watch's own log (`chrome-watch --errors --since … --json`), before and after a step.

import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ENV } from './env.mjs'

const run = promisify(execFile)
const CDP = process.env.E2E_CDP_ORIGIN ?? 'http://127.0.0.1:9222'

/** Desktop and mobile, the two viewports every demo is judged in (§7 E13). */
export const VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }),
  mobile: Object.freeze({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
})

/** Start (or reuse) chrome-watch. */
export async function ensureChromeWatch() {
  await run('chrome-watch', [], { timeout: 60_000 })
}

/** The time `chrome-watch --since` takes: local wall-clock, no zone. */
export function localStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * The errors chrome-watch logged since `since` for pages whose URL contains `page`.
 * @param {{ since: string, page?: string }} q
 * @returns {Promise<any[]>}
 */
export async function chromeWatchErrors({ since, page }) {
  const args = ['--errors', '--since', since, '--json', ...(page ? ['--page', page] : [])]
  const { stdout } = await run('chrome-watch', args, { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 })
  const text = stdout.trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : (parsed.errors ?? [])
  } catch {
    return text
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return { raw: l }
        }
      })
  }
}

class Cdp {
  /** @param {WebSocket} ws */
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    /** @type {Map<number, { resolve: Function, reject: Function }>} */
    this.waiting = new Map()
    /** @type {Set<(msg: any) => void>} */
    this.listeners = new Set()
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(String(e.data))
      if (msg.id && this.waiting.has(msg.id)) {
        const w = this.waiting.get(msg.id)
        this.waiting.delete(msg.id)
        if (msg.error) w.reject(new Error(`${msg.error.message} (${msg.error.code})`))
        else w.resolve(msg.result)
      } else for (const l of this.listeners) l(msg)
    })
  }

  /** @param {string} method @param {any} [params] @param {string} [sessionId] */
  send(method, params = {}, sessionId) {
    const id = ++this.seq
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.waiting.delete(id)) reject(new Error(`CDP ${method} timed out`))
      }, 120_000).unref()
    })
  }

  /** Resolve on the first event `method` of `sessionId`, or after `ms`. */
  once(method, sessionId, ms) {
    return new Promise((resolve) => {
      const done = (v) => {
        this.listeners.delete(on)
        resolve(v)
      }
      const on = (msg) => {
        if (msg.method === method && msg.sessionId === sessionId) done(msg.params)
      }
      this.listeners.add(on)
      setTimeout(() => done(null), ms).unref()
    })
  }
}

/**
 * Connect to chrome-watch and open one role's context, with the session cookie when there is one.
 * @param {{ name: string, token?: string | null }} role
 */
export async function watchedRole({ name, token = null }) {
  await ensureChromeWatch()
  const version = await (await fetch(`${CDP}/json/version`)).json()
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error(`cannot reach chrome-watch at ${CDP}`)), {
      once: true
    })
  })
  const cdp = new Cdp(ws)
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: false })
  if (token)
    await cdp.send('Storage.setCookies', {
      browserContextId,
      cookies: [
        {
          name: ENV.sessionCookie,
          value: token,
          domain: ENV.cookieDomain,
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'Lax'
        }
      ]
    })
  // Opened blank, then navigated: a page opened with its URL can lose its first requests to the error log.
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId,
    background: true
  })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Network.setUserAgentOverride', { userAgent: ENV.userAgent }, sessionId)

  return {
    name,
    targetId,
    /** @param {keyof typeof VIEWPORTS} vp */
    async viewport(vp) {
      await cdp.send('Emulation.setDeviceMetricsOverride', VIEWPORTS[vp], sessionId)
    },
    /** Navigate and wait for load plus a settle for client-side drawing. */
    async goto(url, { settleMs = 2500, timeoutMs = 90_000 } = {}) {
      const loaded = cdp.once('Page.loadEventFired', sessionId, timeoutMs)
      const nav = await cdp.send('Page.navigate', { url }, sessionId)
      if (nav.errorText) throw new Error(`navigate ${url}: ${nav.errorText}`)
      await loaded
      await new Promise((r) => setTimeout(r, settleMs))
    },
    /** Evaluate an expression in the page and return its value. */
    async evaluate(expression) {
      const r = await cdp.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true, userGesture: true },
        sessionId
      )
      if (r.exceptionDetails)
        throw new Error(`page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
      return r.result?.value
    },
    /** Full-page screenshot into `<runDir>/shots/<file>.png`; returns the path. */
    async shot(runDir, file) {
      const dir = join(runDir, 'shots')
      mkdirSync(dir, { recursive: true })
      const { data } = await cdp.send(
        'Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: false },
        sessionId
      )
      const path = join(dir, `${file}.png`)
      writeFileSync(path, Buffer.from(data, 'base64'))
      return path
    },
    /** Let go of the socket; the context and its page stay open for the user. */
    detach() {
      ws.close()
    }
  }
}
