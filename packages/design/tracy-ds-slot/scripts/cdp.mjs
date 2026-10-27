/**
 * Chrome over CDP for the slot's measuring scripts: no dependency, Node's own WebSocket. Mac Chrome
 * by default ($CHROME otherwise); --proxy-server=direct:// because this Mac's PAC script stalls
 * every connection.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/**
 * Google's font files, kept on disk across pages, runs and lanes. The measuring Chrome reads every page
 * with its HTTP cache off, so each take fetched each face again from fonts.gstatic.com — thousands of
 * requests an hour across the lanes — and a take whose request failed measured a page without the
 * system's face (FONT-1 failed one take of 18 templates, 15/10/2026, the other width of the same system
 * loaded it). A gstatic URL names fixed bytes, so it is fetched once (Node, outside the browser) and
 * served from here; a URL that does not answer still fails the request, as it would for a visitor.
 */
const FONT_CACHE = join(tmpdir(), 'ds-font-cache')
const FONT_HOST = 'https://fonts.gstatic.com/'

/** @param {string} url @returns {Promise<{ body: Buffer, type: string } | null>} */
async function cachedFont(url) {
  const key = createHash('sha256').update(url).digest('hex')
  const file = join(FONT_CACHE, key)
  const meta = `${file}.type`
  if (existsSync(file) && existsSync(meta))
    return { body: readFileSync(file), type: readFileSync(meta, 'utf8') }
  const res = await fetch(url).catch(() => null)
  if (!res || !res.ok) return null
  const body = Buffer.from(await res.arrayBuffer())
  const type = res.headers.get('content-type') ?? 'font/woff2'
  mkdirSync(FONT_CACHE, { recursive: true })
  // written aside and renamed: lanes share the folder, and a half-written file is never read
  const part = `${file}.${process.pid}.${Date.now()}`
  writeFileSync(`${part}.type`, type)
  writeFileSync(part, body)
  renameSync(`${part}.type`, meta)
  renameSync(part, file)
  return { body, type }
}

/**
 * Every Chrome this process started and has not closed. Chrome is spawned detached (its own process group),
 * so it outlives a script that dies: a throw before close(), a SIGTERM from a lane, a Ctrl-C. Twelve such
 * Chromes, a few hundred MB each, were found alive 5-11 hours later on the two Macs (16/10/2026). Each one
 * left is killed with its group when the process exits, and a signal exits the process (128 + n) so that
 * this happens; SIGKILL cannot be caught, which is why lane.mjs kills its children's trees itself.
 * @type {Set<() => void>}
 */
const LIVE = new Set()
let reaping = false
const reapAll = () => {
  // a copy: each close() removes itself from the set
  for (const close of Array.from(LIVE)) close()
}
const watchExit = () => {
  if (reaping) return
  reaping = true
  process.on('exit', reapAll)
  for (const [sig, n] of [
    ['SIGINT', 2],
    ['SIGTERM', 15],
    ['SIGHUP', 1]
  ])
    process.on(sig, () => {
      reapAll()
      process.exit(128 + n)
    })
}

/**
 * @param {number} port
 * @param {{ block?: string[], starts?: number, wait?: number }} [opts] block: URL patterns the browser fails at
 *   once (a contract's `measureBlock`: a third-party script that stops the page's parser while its host does not
 *   answer); starts: Chromes launched at most; wait: ms each has to answer
 */
export async function browser(port, { block = [], starts = 3, wait = 60000 } = {}) {
  // a Chrome that does not answer within `wait` is killed and another started, `starts` times in all: on a
  // machine shared with other batches (21/10/2026, ~90 Chromes alive) a launch sometimes hangs at start in a
  // synchronous call to macOS LocalAuthentication (`LAContext` init, sampled) for one to three minutes, and the
  // single 30 s wait failed a whole preview step; a fresh launch once the hang clears answers in seconds
  for (let n = 0; n < starts; n++) {
    const started = await launch(wait)
    if (started) return connect(started.url, started.reap, block)
  }
  throw new Error('Chrome did not start')
}

/** One Chrome launched: its DevTools address and its reaper, or null (killed, its profile removed) when it did not answer in `wait` ms. */
async function launch(/** @type {number} */ wait) {
  // DS_CHROME_PROFILES: where the profile goes (lane.mjs gives each lane its own folder, so it can find and
  // kill exactly its Chromes when a child is killed with no chance to clean up)
  const dir = mkdtempSync(join(process.env.DS_CHROME_PROFILES ?? tmpdir(), 'ds-flow-'))
  // --proxy-server=direct:// — this Mac's PAC script stalls every connection otherwise.
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      '--proxy-server=direct://',
      // no keychain: every fresh profile otherwise asks macOS's keychain for its storage key, and with several
      // lanes launching a Chrome per page the keychain daemons (secd, ctkd) took the machine's CPU and pages
      // timed out (15/10/2026). A measure stores no secret
      '--use-mock-keychain',
      '--password-store=basic',
      // port 0: Chrome picks a free port and writes it to DevToolsActivePort in its own profile. A fixed port
      // connected to whatever already listened there: a Chrome left from the previous template, whose cache served
      // that template's pictures at the same 127.0.0.1:<port>/images/… paths (JA Smallbiz's sweep shots showed a
      // concert, 14/10/2026). `port` is kept for the callers; the instance is always this one
      '--remote-debugging-port=0',
      `--user-data-dir=${dir}`,
      'about:blank'
    ],
    { stdio: 'ignore', detached: true }
  )
  // killed with its group (Chrome's helpers and renderers) and its profile removed; once
  const reap = () => {
    if (!LIVE.delete(reap)) return
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {}
  }
  LIVE.add(reap)
  watchExit()
  let url = ''
  for (const end = Date.now() + wait; Date.now() < end && !url; ) {
    try {
      const [own] = readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n')
      url = (await (await fetch(`http://127.0.0.1:${Number(own)}/json/version`)).json()).webSocketDebuggerUrl
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  if (url) return { url, reap }
  reap()
  return null
}

/** The browser behind a DevTools address. */
async function connect(
  /** @type {string} */ url,
  /** @type {() => void} */ reap,
  /** @type {string[]} */ block
) {
  const ws = new WebSocket(url)
  await new Promise((ok, no) => {
    ws.onopen = ok
    ws.onerror = no
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    // a page's alert() or confirm() holds every script call until it is answered: answered at once
    if (m.method === 'Page.javascriptDialogOpening' && m.sessionId) {
      const n = ++id
      ws.send(
        JSON.stringify({
          id: n,
          method: 'Page.handleJavaScriptDialog',
          params: { accept: true },
          sessionId: m.sessionId
        })
      )
      return
    }
    // a page document while a rewrite is set (`rewriteDocuments`): its body handed to the rewrite, the
    // answer served in its place at the same address (preview-parity.mjs: the live popup's page)
    if (m.method === 'Fetch.requestPaused' && m.sessionId && m.params.responseStatusCode !== undefined) {
      const { requestId, request, responseStatusCode, responseHeaders = [] } = m.params
      ;(async () => {
        const fn = rewrite
        const html = (() => {
          const type = responseHeaders.find((h) => /^content-type$/i.test(h.name))?.value ?? ''
          return fn && responseStatusCode === 200 && /html/i.test(type)
        })()
        if (!html) return send('Fetch.continueRequest', { requestId }, m.sessionId)
        const b = await send('Fetch.getResponseBody', { requestId }, m.sessionId)
        const body = b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body
        const out = await fn(request.url, body)
        if (typeof out !== 'string') return send('Fetch.continueRequest', { requestId }, m.sessionId)
        return send(
          'Fetch.fulfillRequest',
          {
            requestId,
            responseCode: 200,
            responseHeaders: [
              { name: 'Content-Type', value: 'text/html; charset=utf-8' },
              { name: 'Cache-Control', value: 'no-store' }
            ],
            body: Buffer.from(out, 'utf8').toString('base64')
          },
          m.sessionId
        )
      })().catch(() => send('Fetch.continueRequest', { requestId }, m.sessionId).catch(() => {}))
      return
    }
    // a font file of Google's: served from the disk cache (FONT_CACHE)
    if (m.method === 'Fetch.requestPaused' && m.sessionId) {
      const { requestId, request } = m.params
      cachedFont(request.url)
        .then((font) =>
          font
            ? send(
                'Fetch.fulfillRequest',
                {
                  requestId,
                  responseCode: 200,
                  responseHeaders: [
                    { name: 'Content-Type', value: font.type },
                    { name: 'Access-Control-Allow-Origin', value: '*' },
                    { name: 'Cache-Control', value: 'public, max-age=31536000' }
                  ],
                  body: font.body.toString('base64')
                },
                m.sessionId
              )
            : send('Fetch.failRequest', { requestId, errorReason: 'Failed' }, m.sessionId)
        )
        .catch(() => {})
      return
    }
    const f = pending.get(m.id)
    if (!f) return
    pending.delete(m.id)
    m.error ? f.no(new Error(m.error.message)) : f.ok(m.result)
  }
  // a call Chrome never answers (its renderer died under memory pressure on the shared Mac, 11/10/2026:
  // the flow waited for hours on a target that was gone) fails after 10 minutes instead of hanging
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, no) => {
      const n = ++id
      const t = setTimeout(() => {
        pending.delete(n)
        no(new Error(`CDP ${method}: no answer in 10 minutes`))
      }, 600000)
      t.unref?.()
      pending.set(n, { ok: (v) => (clearTimeout(t), ok(v)), no: (e) => (clearTimeout(t), no(e)) })
      ws.send(JSON.stringify({ id: n, method, params, sessionId }))
    })
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const s = (m, p) => send(m, p, sessionId)
  await s('Page.enable')
  // no HTTP cache: every page load reads the stand it measures
  await s('Network.enable')
  await s('Network.setCacheDisabled', { cacheDisabled: true })
  const FONT_PATTERN = { urlPattern: `${FONT_HOST}*`, requestStage: 'Request' }
  await s('Fetch.enable', { patterns: [FONT_PATTERN] })
  /** @type {((url: string, html: string) => Promise<string | null> | string | null) | null} */
  let rewrite = null
  if (block.length) await s('Network.setBlockedURLs', { urls: block })
  // one page's whole measure is bounded: a step stuck 40 minutes on GK Appetit (13/10/2026) held
  // the sweep; a page that takes longer fails its step instead
  const bounded = (p, ms, what) =>
    Promise.race([
      p,
      new Promise((_, no) => {
        const t = setTimeout(() => no(new Error(`${what}: over ${Math.round(ms / 60000)} minutes`)), ms)
        t.unref?.()
      })
    ])
  return {
    open(href, width, opts = {}) {
      return bounded(this.openPage(href, width, opts), 8 * 60000, `open ${href} at ${width}`)
    },
    async openPage(href, width, { freeze = false, still = false, scheme = 'light' } = {}) {
      await s('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 600
      })
      // reduced motion: a template that reveals sections on scroll shows them at once (a measure
      // of a page whose sections are still invisible measures nothing)
      await s('Emulation.setEmulatedMedia', {
        features: [
          // the visitor's own light or dark (a theme whose presets are light-dark() pairs shows either)
          { name: 'prefers-color-scheme', value: scheme === 'dark' ? 'dark' : 'light' },
          { name: 'prefers-reduced-motion', value: 'reduce' }
        ]
      })
      await s('Page.navigate', { url: href })
      // the page's own load first (up to 3 min): on a loaded Docker VM a Joomla page took 2 min
      // (11/10/2026), and a measure taken before its stylesheets arrive measures the browser's defaults
      for (let i = 0; i < 360; i++) {
        const r = await s('Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true
        }).catch(() => null)
        if (r?.result?.value === 'complete') break
        await new Promise((ok) => setTimeout(ok, 500))
      }
      await new Promise((r) => setTimeout(r, 1800))
      // every stylesheet in: on a loaded stand the HTML commits long before its sheets arrive, and a
      // probe run then measures the page half-styled (bounded, so a page that never finishes still
      // gets measured)
      await s('Runtime.evaluate', {
        expression: `new Promise((r) => { if (document.readyState === 'complete') return r(1); addEventListener('load', () => r(1)); setTimeout(() => r(0), 240000) })`,
        awaitPromise: true
      })
      // and walk down the page once, for reveals keyed on an IntersectionObserver alone
      await s('Runtime.evaluate', {
        expression: `(async () => { const h = () => document.documentElement.scrollHeight; for (let y = 0; y < h() && y < 30000; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400)); return 1 })()`,
        awaitPromise: true
      })
      // and every picture the browser defers (loading="lazy") in: a visitor scrolling down sees each one,
      // but the walk passes in 40 ms steps and the browser can let a picture it never got to start stay
      // empty; Tracy Business WordPress's team photo read as an empty block on a random sixth of its home
      // pages, under either system (16/10/2026). Bounded at 10 s
      await s('Runtime.evaluate', {
        expression: `(async () => { const lazy = [...document.querySelectorAll('img[loading="lazy"]')].filter((i) => !i.complete); for (const i of lazy) i.loading = 'eager'; await Promise.race([Promise.all(lazy.map((i) => i.decode().catch(() => 0))), new Promise((r) => setTimeout(r, 10000))]); return lazy.length })()`,
        awaitPromise: true
      })
      // a jQuery `inview` reveal polls on a timer, slower than the walk: what it never saw stayed hidden (JA
      // Lawfirm's section titles, a different one missing on each take, 15/10/2026): each element bound to it is
      // told it is in view, as a visitor scrolling past would have it
      await s('Runtime.evaluate', {
        expression: `(() => { const $ = window.jQuery; if (!$ || !$._data) return 0; let n = 0; for (const e of document.querySelectorAll('*')) { const ev = $._data(e, 'events'); if (ev && ev.inview) { try { $(e).trigger('inview', [true, 'both', 'both']); n++ } catch {} } } return n })()`,
        returnByValue: true
      })
      // and every reveal the walk started played to its end (bounded at 5 s; a looping animation never
      // ends and is not waited for): animate.css reveals with a delay (JA Stark's .delay-2s) were caught
      // at opacity 0 on one page and finished on the next, so the same text was measured on one and not
      // on the other (11/10/2026)
      await s('Runtime.evaluate', {
        expression: `(async () => { for (let t = 0; t < 50; t++) { const a = document.getAnimations ? document.getAnimations().filter((x) => x.playState === 'running' && x.effect?.getComputedTiming?.().endTime !== Infinity) : []; if (!a.length) return t; await new Promise((r) => setTimeout(r, 100)) } return 50 })()`,
        awaitPromise: true
      })
      await s('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => 1)', awaitPromise: true })
      // `still` (a contract's measureStill): every carousel stopped on its first slide before the
      // measure, so each step reads the same slide — a hero slider that autoplays put a different
      // photo (and, on a phone, a slide mid-transition) under the same text from one step to the next
      // (JA Company, 11/10/2026: the same white title read 1.14 in two runs of three). Swiper (the
      // element's own .swiper), Bootstrap 4/5 and jQuery owl (v2 events, v1's data('owlCarousel'): JA Rent's hero kept
      // sliding under v2's events and was shot between two slides, 14/10/2026)/slick carousels, jQuery animations
      // finished; anything else is left as is
      if (still)
        await s('Runtime.evaluate', {
          expression: `(async () => { let n = 0; for (const e of document.querySelectorAll('*')) { const sw = e.swiper; if (!sw || sw.__dsStill) continue; sw.__dsStill = 1; n++; try { sw.autoplay?.stop?.() } catch {} try { sw.params && (sw.params.speed = 0); sw.params?.loop && sw.slideToLoop ? sw.slideToLoop(0, 0, false) : sw.slideTo(0, 0, false) } catch {} } const $ = window.jQuery; if ($) { try { $('.owl-carousel').trigger('stop.owl.autoplay').trigger('to.owl.carousel', [0, 0]) } catch {} const owl1 = () => { try { $('.owl-carousel').each(function () { const o = $(this).data('owlCarousel'); if (o && o.stop) { if (o.options) o.options.autoPlay = false; o.stop(); clearInterval(o.autoPlayInterval); o.play = () => {}; o.apStatus = 'stop'; (o.jumpTo || o.goTo).call(o, 0) } }) } catch {} try { $(':animated').finish() } catch {} }; owl1(); setTimeout(owl1, 700); setTimeout(owl1, 1400); try { $('.slick-initialized').slick('slickPause').slick('slickGoTo', 0, true) } catch {} try { $('.carousel').carousel('pause').carousel(0) } catch {} } const bs = window.bootstrap?.Carousel; if (bs) for (const e of document.querySelectorAll('.carousel')) { try { const c = bs.getOrCreateInstance(e); c.pause(); c.to(0) } catch {} } await new Promise((r) => setTimeout(r, 1500)); for (let t = 0; t < 30; t++) { const a = document.getAnimations ? document.getAnimations().filter((x) => x.playState === 'running' && x.effect?.getComputedTiming?.().endTime !== Infinity) : []; if (!a.length) break; await new Promise((r) => setTimeout(r, 100)) } return n })()`,
          awaitPromise: true
        })
      // two takes of the same page compared pixel for pixel: every animation at its start (a marquee
      // caught at two moments is not a difference between two sites)
      if (freeze)
        await s('Runtime.evaluate', {
          expression: `(async () => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.appendChild(st); scrollTo(0, 0); await new Promise((r) => setTimeout(r, 600)); return 1 })()`,
          awaitPromise: true
        })
      // once, before any probe reads the page, so every probe, ground read and picture sees one state
      await this.settle()
    },
    /**
     * Every page document the browser loads from now on handed to `fn(url, html)`, its answer served in
     * the document's place at the same address (null: as it came); `null` stops it. Same origin, the
     * page's own scripts run on the answer.
     * @param {((url: string, html: string) => Promise<string | null> | string | null) | null} fn
     */
    async rewriteDocuments(fn) {
      rewrite = fn
      await s('Fetch.enable', {
        patterns: fn
          ? [FONT_PATTERN, { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' }]
          : [FONT_PATTERN]
      })
    },
    async evaluate(expression) {
      const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
      return r.result.value
    },
    /**
     * `expression` evaluated in every frame of another site the page holds (Chrome runs such a frame, a
     * provider's player, as a target of its own that the page's scripts cannot read), as `[{ url, value }]`; a
     * frame that does not answer is left out. Preview probe 10: whether a YouTube frame plays or shows its error.
     * @param {string} expression
     * @returns {Promise<{ url: string, value: any }[]>}
     */
    async framesEvaluate(expression) {
      const { targetInfos } = await send('Target.getTargets')
      /** @type {{ url: string, value: any }[]} */
      const out = []
      for (const t of targetInfos.filter((/** @type {any} */ x) => x.type === 'iframe')) {
        let sid = null
        try {
          sid = (await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId
          const r = await send(
            'Runtime.evaluate',
            { expression, returnByValue: true, awaitPromise: true },
            sid
          )
          if (!r.exceptionDetails) out.push({ url: t.url, value: r.result.value })
        } catch {
          // a frame gone between the list and the read: not answered
        } finally {
          if (sid) await send('Target.detachFromTarget', { sessionId: sid }).catch(() => {})
        }
      }
      return out
    },
    // a reveal held at its end by a finished animation (`forwards`) stays on its own compositor layer, and a
    // capture beyond the viewport does not paint those layers below the first screen: JA Space's whole
    // content, JA Resume's portfolio, JA Healthcare's cards came out as blank page in every shot (15/10/2026).
    // Each such end state is written onto its element and the animation dropped: the same computed style,
    // painted with the page. Done when the page is open (before the probes; not inside capture(), where the
    // ground read has made the words transparent) and again before a shot, for a reveal that ended since
    // A background fixed to the viewport (background-attachment: fixed, T3/T4's section photos) is not painted
    // below the first screen by such a capture either: JA Beauty's testimonials photo came out as the page's white,
    // in the picture and in the ground its words were judged on (15/10/2026). It scrolls with its box instead
    async settle() {
      await s('Runtime.evaluate', {
        expression: `(() => { let n = 0; for (const a of document.getAnimations ? document.getAnimations() : []) { try { const t = a.effect.getComputedTiming(); if (t.endTime !== Infinity && a.playState === 'finished' && t.fill !== 'none' && t.fill !== 'backwards') { a.commitStyles(); a.cancel(); n++ } } catch {} } if (!document.getElementById('tracy-ds-measure-scroll')) { const st = document.createElement('style'); st.id = 'tracy-ds-measure-scroll'; st.textContent = '*,*::before,*::after{background-attachment:scroll!important}'; document.head.appendChild(st) } return n })()`,
        returnByValue: true
      }).catch(() => null)
    },
    async shot(file) {
      await this.settle()
      const m = await s('Page.getLayoutMetrics')
      // a page whose html/body are height:100% (T3 + skrollr: JA Restaurant) reports the viewport as
      // its content size while its content runs on below: the document's own scroll height counts too
      const sh = await s('Runtime.evaluate', {
        expression: 'document.documentElement.scrollHeight',
        returnByValue: true
      }).catch(() => null)
      const height = Math.max(m.cssContentSize.height, Number(sh?.result?.value) || 0)
      const r = await s('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: Math.ceil(m.cssContentSize.width),
          height: Math.min(Math.ceil(height), 6000),
          scale: m.cssContentSize.width > 800 ? 0.5 : 1
        }
      })
      writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
    /** The whole page as a PNG (base64) at `scale`: what flow.mjs reads a picture's ground off. */
    async capture(scale) {
      const m = await s('Page.getLayoutMetrics')
      // as shot(): a height:100% html/body (JA Restaurant) under-reports the content height
      const sh = await s('Runtime.evaluate', {
        expression: 'document.documentElement.scrollHeight',
        returnByValue: true
      }).catch(() => null)
      const height = Math.max(m.cssContentSize.height, Number(sh?.result?.value) || 0)
      const r = await s('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: Math.ceil(m.cssContentSize.width),
          height: Math.min(Math.ceil(height), 30000),
          scale
        }
      })
      return r.data
    },
    close() {
      try {
        ws.close()
      } catch {}
      // the killed Chrome can still be writing its profile: retried, and a leftover temp folder never
      // fails a measurement (ENOTEMPTY ended a JA Alumni pass, 11/10/2026)
      reap()
    }
  }
}
