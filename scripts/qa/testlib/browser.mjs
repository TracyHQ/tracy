/**
 * The lane's Chrome over raw CDP (plan §4.6, seam 2): no Playwright, Node's own WebSocket, so it runs
 * inside the `test` fence. One browser context per test, closed when the test is done.
 *
 * Every page of a context sends the lane's key and PR (`Network.setExtraHTTPHeaders`), which the QA
 * gate consumes before forwarding. Console errors, uncaught exceptions and browser log errors are
 * kept on the context (`errors`) and appended to `$QA_RESULTS/console.jsonl` when it closes.
 *
 * Env: QA_CDP_PORT (default by lane: sonnet 9236, sol 9237, verify 9238), QA_RESULTS, plus the
 * stand env of `stand.mjs` (TRACY_ORIGIN, QA_LANE, QA_LANE_KEY_FILE, QA_PR).
 *
 * Exports:
 *   CDP_PORTS
 *   Cdp.open(wsUrl): Promise<Cdp>    send(method, params?, sessionId?) · on(fn) · waitFor(pred, ms) · close()
 *   connect({ port? }): Promise<Browser>
 *   openContext({ config?, port?, cookies?, testName?, resultsDir? }): Promise<Context>
 *   withContext(fn, opts?): Promise<result of fn(ctx)>      // always closes the context
 * Browser: { cdp, version, close() }
 * Context: { browserContextId, errors, newPage(): Promise<Page>, setCookie(name, value, { domain?, path? }),
 *            close(): Promise<void> }
 * Page: { sessionId, targetId, goto(url, { timeoutMs? }), url(), evaluate(expr), text(selector?),
 *         exists(selector), click(selector), type(selector, text), waitFor(expr, { timeoutMs? }),
 *         screenshot(): Promise<Buffer>, close() }
 *   `url` given to goto may be a path: it is resolved against TRACY_ORIGIN.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { standConfig } from './stand.mjs'

export const CDP_PORTS = { sonnet: 9236, sol: 9237, verify: 9238 }

export class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = new Set()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result)
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg)
      }
    })
    ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('cdp socket closed'))
      this.pending.clear()
    })
  }
  static async open(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error(`cdp websocket failed: ${url}`)), { once: true })
    })
    return new Cdp(ws)
  }
  send(method, params = {}, sessionId, timeoutMs = 30_000) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`cdp timeout: ${method}`))
      }, timeoutMs).unref()
    })
  }
  on(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  waitFor(pred, ms) {
    return new Promise((resolve) => {
      const off = this.on((msg) => {
        if (pred(msg)) {
          off()
          resolve(msg)
        }
      })
      setTimeout(() => {
        off()
        resolve(null)
      }, ms).unref()
    })
  }
  close() {
    try {
      this.ws.close()
    } catch {}
  }
}

export async function connect({ port } = {}) {
  const p = Number(port ?? process.env.QA_CDP_PORT ?? CDP_PORTS[process.env.QA_LANE])
  if (!p) throw new Error('no CDP port: set QA_CDP_PORT or QA_LANE')
  const version = await (await fetch(`http://127.0.0.1:${p}/json/version`)).json()
  const cdp = await Cdp.open(version.webSocketDebuggerUrl)
  return { cdp, version, close: () => cdp.close() }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function describeError(msg) {
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    return { kind: 'exception', text: d.exception?.description ?? d.text, url: d.url ?? null }
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
    return { kind: 'console.error', text, url: msg.params.stackTrace?.callFrames?.[0]?.url ?? null }
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    return { kind: 'log', text: msg.params.entry.text, url: msg.params.entry.url ?? null }
  }
  return null
}

export async function openContext({
  config = standConfig(),
  port,
  testName = process.env.QA_TEST_NAME ?? null,
  resultsDir = process.env.QA_RESULTS ?? null
} = {}) {
  const browser = await connect({ port })
  const { cdp } = browser
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true })
  const errors = []
  const sessions = new Set()
  const offErrors = cdp.on((msg) => {
    if (!msg.sessionId || !sessions.has(msg.sessionId)) return
    const e = describeError(msg)
    if (e) errors.push({ ...e, at: new Date().toISOString() })
  })
  const extra = {}
  if (config.laneKey) extra['x-qa-lane'] = config.laneKey
  if (config.pr !== null && config.pr !== undefined) extra['x-qa-pr'] = String(config.pr)
  const pages = new Set()
  const abs = (url) => new URL(url, `${config.origin}/`).href

  async function newPage() {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    sessions.add(sessionId)
    const s = (method, params) => cdp.send(method, params, sessionId)
    await s('Page.enable')
    await s('Runtime.enable')
    await s('Log.enable')
    await s('Network.enable')
    await s('Network.setExtraHTTPHeaders', { headers: extra })

    const evaluate = async (expression) => {
      const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails)
        throw new Error(
          `evaluate failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`
        )
      return r.result.value
    }
    const sel = (selector) => JSON.stringify(String(selector))
    const page = {
      sessionId,
      targetId,
      async goto(url, { timeoutMs = 30_000 } = {}) {
        const loaded = cdp.waitFor(
          (m) => m.sessionId === sessionId && m.method === 'Page.loadEventFired',
          timeoutMs
        )
        const r = await s('Page.navigate', { url: abs(url) })
        if (r.errorText) throw new Error(`navigate ${url}: ${r.errorText}`)
        if (!(await loaded)) throw new Error(`navigate ${url}: no load event within ${timeoutMs} ms`)
        return page
      },
      url: () => evaluate('location.href'),
      evaluate,
      text: (selector) =>
        evaluate(
          selector
            ? `(document.querySelector(${sel(selector)})?.innerText ?? null)`
            : 'document.body ? document.body.innerText : ""'
        ),
      exists: (selector) => evaluate(`document.querySelector(${sel(selector)}) !== null`),
      async click(selector) {
        const ok = await evaluate(
          `(() => { const el = document.querySelector(${sel(selector)}); if (!el) return false; el.click(); return true })()`
        )
        if (!ok) throw new Error(`click: no element ${selector}`)
      },
      async type(selector, text) {
        const ok = await evaluate(`(() => { const el = document.querySelector(${sel(selector)});
          if (!el) return false; el.focus(); return true })()`)
        if (!ok) throw new Error(`type: no element ${selector}`)
        await s('Input.insertText', { text: String(text) })
      },
      async waitFor(expression, { timeoutMs = 15_000, pollMs = 100 } = {}) {
        const until = Date.now() + timeoutMs
        for (;;) {
          const v = await evaluate(expression).catch(() => null)
          if (v) return v
          if (Date.now() > until) throw new Error(`waitFor timed out after ${timeoutMs} ms: ${expression}`)
          await sleep(pollMs)
        }
      },
      async screenshot() {
        const { data } = await s('Page.captureScreenshot', { format: 'png' })
        return Buffer.from(data, 'base64')
      },
      async close() {
        pages.delete(page)
        sessions.delete(sessionId)
        await cdp.send('Target.closeTarget', { targetId }).catch(() => {})
      }
    }
    pages.add(page)
    return page
  }

  let closed = false
  return {
    browserContextId,
    errors,
    newPage,
    async setCookie(name, value, { domain = config.domain, path = '/' } = {}) {
      await cdp.send('Storage.setCookies', {
        browserContextId,
        cookies: [{ name, value, domain, path, httpOnly: true, sameSite: 'Lax' }]
      })
    },
    async close() {
      if (closed) return
      closed = true
      for (const p of Array.from(pages)) await p.close()
      offErrors()
      await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {})
      browser.close()
      if (resultsDir && errors.length) {
        mkdirSync(resultsDir, { recursive: true })
        const lines = errors.map((e) =>
          JSON.stringify({ test: testName, lane: config.lane, pr: config.pr, ...e })
        )
        appendFileSync(join(resultsDir, 'console.jsonl'), `${lines.join('\n')}\n`)
      }
    }
  }
}

export async function withContext(fn, opts) {
  const ctx = await openContext(opts)
  try {
    return await fn(ctx)
  } finally {
    await ctx.close()
  }
}
