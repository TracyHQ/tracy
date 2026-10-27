#!/usr/bin/env node
/**
 * How much of a live page the comment picker can tie to exactly ONE record — measured, not argued.
 *
 * The comment → edit plan (`tasks/todo-comment-to-edit.md`, "xong khi" (a)) is done when at least
 * 90% of the distinct visible elements on four pages of each CMS resolve to one source. This tool is
 * that number: for each page it lists every visible element the way a visitor's browser shows it,
 * asks the real `content.locate` door (`POST /api/sites/<key>/apply`) about each one with the marks
 * the picker itself would send, and tallies the answers per kind and per page.
 *
 * WHY IT IS NOT A GATE. It needs a running site, a running `tracy-web`, a signed-in seat and a
 * Chrome on the CDP port (`chrome-watch`), and its result moves with the site's content. A gate that
 * depends on all of that is either skipped (and says green) or red for reasons that are not the
 * change under review. It is a measurement a person runs before and after a change, and the JSON it
 * writes is the evidence.
 *
 * WHAT IS MEASURED, AND HOW IT MATCHES THE PRODUCT.
 * - Marks come from the picker's own `describe()` (`packages/cms/tracy-cms-preview/src/pick.mjs`),
 *   bundled and run in the page: the same `data-tracy-src` / `<template data-tracy-owner>` / menu
 *   item ids, innermost first, that a real pick sends. A different mark reader here would measure a
 *   picker nobody ships.
 * - The page is fetched STRAIGHT FROM THE SITE'S UPSTREAM (`--upstream`, e.g. the web container's
 *   port on the local stand), with `X-Tracy-Preview: pick` in the stamped run and without it in the
 *   plain run; everything else (styles, images, scripts) loads through the normal site address. The
 *   real ticket flow was not used on purpose: a redeemed ticket travels with the seat's session, and
 *   the site proxy then signs that seat into the CMS (admin bar, logged-in widgets), so the two runs
 *   would differ by more than the stamps. With the upstream route the only difference between the
 *   runs is the header, and the page is the anonymous visitor's — the same page the provenance spike
 *   measured (`tasks/evidence/provenance-spike/REPORT.md`). The Claude Cowork plugin stamps only
 *   when that header arrives and the site has a token.
 * - One element per distinct value per page (kind + text or image source), as the spike counted.
 *   `attr` elements (placeholder, aria-label, title) are asked with that value as `text`: the picker
 *   sends an element's own words, so these are what an agent would try, not what a pick carries.
 * - The headline is `resolved` only. `unconfirmed` names one record by value while the marks do not
 *   confirm it; the door refuses to call that resolved, and so does this count.
 *
 * Usage (local stand; the cookie is a `tracy_sess` value for a seat on the site):
 *   node scripts/measure-provenance.mjs --site capiwl1643.tracy.test \
 *     --upstream http://127.0.0.1:52012 --cookie-file <file> [--mode both|stamped|plain] \
 *     [--tracy http://tracy.test:8080] [--cdp http://127.0.0.1:9222] [--concurrency N] \
 *     [--container <label>-web-1] [--slow-ms 10000] \
 *     [--out tasks/evidence/comment-to-edit/coverage] <page-url> ...
 *
 * LOAD. Concurrency is min(--concurrency, the container's request workers − 1, 8): the ceiling is
 * read from `--container` (default `<first label of --site>-web-1`) with `docker exec`, and printed
 * with the reason. Without an inspectable container it is --concurrency, or 4. Two locate answers
 * in a row that are HTTP 429/503 or slower than --slow-ms halve it for the rest of the run; a
 * 429/503 is asked again rather than counted as an error. The chosen and final concurrency, the
 * median locate latency and the wall time close the summary (`load` in the JSON, `## Load` in the
 * Markdown); nothing above them changed.
 */

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { build } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STATUSES = ['resolved', 'candidates', 'conflict', 'unconfirmed', 'unknown', 'error']
const KINDS = ['text', 'image', 'attr']

// ── Load: how many locate calls at once, and when to ease off ────────────────────────────────────
//
// Each `content.locate` call makes the site's web container render or read part of the site, so the
// number of calls in flight is bounded by how many requests that container can serve at once. The
// ceiling is READ from the container (Apache's MaxRequestWorkers, PHP-FPM's pm.max_children), not
// assumed, and one worker is always left for the browser's own page loads and for anyone else using
// the site. Tested in `scripts/test/measure-provenance-load.test.mjs`.

/** Concurrency when nothing else is known: the container could not be inspected and no flag was given. */
export const FALLBACK_CONCURRENCY = 4
/** Never more than this many calls at once, whatever the container allows. */
export const MAX_CONCURRENCY = 8
/** Apache's compiled-in MaxRequestWorkers when a config sets none (Apache 2.4 docs, mpm_common). */
const APACHE_DEFAULT_WORKERS = { prefork: 256, worker: 400, event: 400 }

/**
 * Shell run inside the site's web container. Prints `mpm <name>` plus the worker directives of the
 * enabled Apache config, and `fpm` plus pm.max_children lines when PHP-FPM is present. Only reads.
 */
export const WORKER_PROBE = [
  'if command -v apache2ctl >/dev/null 2>&1; then',
  '  echo "mpm $(apache2ctl -V 2>/dev/null | sed -n "s/^Server MPM: *//p")"',
  '  cat /etc/apache2/apache2.conf /etc/apache2/mods-enabled/mpm_*.conf /etc/apache2/conf-enabled/*.conf 2>/dev/null',
  'elif command -v httpd >/dev/null 2>&1; then',
  '  echo "mpm $(httpd -V 2>/dev/null | sed -n "s/^Server MPM: *//p")"',
  '  cat /usr/local/apache2/conf/httpd.conf /usr/local/apache2/conf/extra/httpd-mpm.conf 2>/dev/null',
  'fi',
  'if command -v php-fpm >/dev/null 2>&1; then',
  '  echo fpm',
  '  cat /usr/local/etc/php-fpm.d/*.conf /etc/php/*/fpm/pool.d/*.conf 2>/dev/null',
  'fi'
].join('\n')

/**
 * The number of requests a web container serves at once, from `WORKER_PROBE`'s output.
 * Apache: the last active MaxRequestWorkers (or its old name MaxClients), else the MPM's default.
 * PHP-FPM: the last pm.max_children. Both present (Apache in front of FPM): the smaller one.
 * @param {string} text
 * @returns {{workers: number, source: string} | null} null when neither server was recognised.
 */
export function parseWorkerCeiling(text) {
  const lines = text.split('\n').map((l) => l.trim())
  const last = (re) => {
    let value = null
    for (const line of lines) {
      const m = re.exec(line)
      if (m) value = Number(m[1])
    }
    return value
  }
  const found = []
  const mpm = lines
    .find((l) => l.startsWith('mpm '))
    ?.slice(4)
    .trim()
    .toLowerCase()
  if (mpm) {
    const set = last(/^(?:MaxRequestWorkers|MaxClients)\s+(\d+)\s*$/i)
    const fallback = APACHE_DEFAULT_WORKERS[mpm]
    if (set) found.push({ workers: set, source: `Apache ${mpm} MaxRequestWorkers ${set}` })
    else if (fallback) found.push({ workers: fallback, source: `Apache ${mpm} default ${fallback}` })
  }
  if (lines.includes('fpm')) {
    const children = last(/^pm\.max_children\s*=\s*(\d+)\s*$/)
    if (children) found.push({ workers: children, source: `PHP-FPM pm.max_children ${children}` })
  }
  if (found.length === 0) return null
  return found.reduce((a, b) => (b.workers < a.workers ? b : a))
}

/**
 * How many locate calls to keep in flight: min(flag, workers − 1, MAX_CONCURRENCY) when the ceiling
 * is known; the flag (or FALLBACK_CONCURRENCY when none was given) when it is not.
 * @param {{requested?: number, ceiling: {workers: number, source: string} | null}} input
 * @returns {{value: number, reason: string}}
 */
export function chooseConcurrency({ requested, ceiling }) {
  const flag = requested && requested > 0 ? Math.floor(requested) : null
  if (!ceiling) {
    const value = flag ?? FALLBACK_CONCURRENCY
    return {
      value,
      reason: `container not inspected; ${flag ? `--concurrency ${flag}` : `default ${FALLBACK_CONCURRENCY}`}`
    }
  }
  const room = Math.max(1, ceiling.workers - 1)
  const options = [
    ...(flag ? [{ v: flag, why: `--concurrency ${flag}` }] : []),
    { v: room, why: `${ceiling.source} − 1 = ${room}` },
    { v: MAX_CONCURRENCY, why: `cap ${MAX_CONCURRENCY}` }
  ]
  const pick = options.reduce((a, b) => (b.v < a.v ? b : a))
  return {
    value: pick.v,
    reason: `min(${options.map((o) => o.why).join(', ')}) = ${pick.v}, bound by ${pick.why}`
  }
}

/**
 * Halves the concurrency when the site shows strain: two answers in a row that are HTTP 429/503 or
 * slower than `slowMs`. Only calls STARTED after the last halving count, so the calls already in
 * flight when the site slowed down do not halve it again for the same episode. Never below 1.
 * @param {{limit: number, slowMs: number, strikes?: number}} options
 */
export function createBackoff({ limit, slowMs, strikes = 2 }) {
  let current = limit
  let streak = 0
  let since = Number.NEGATIVE_INFINITY
  /** @type {{at: number, from: number, to: number, why: string}[]} */
  const halvings = []
  return {
    limit: () => current,
    halvings,
    /** @param {{status: number, ms: number, startedAt: number, now: number}} call */
    record({ status, ms, startedAt, now }) {
      if (startedAt < since) return current
      const busy = status === 429 || status === 503
      if (!busy && ms <= slowMs) {
        streak = 0
        return current
      }
      streak++
      if (streak >= strikes && current > 1) {
        const to = Math.max(1, Math.floor(current / 2))
        halvings.push({
          at: now,
          from: current,
          to,
          why: busy ? `HTTP ${status}` : `slower than ${slowMs} ms`
        })
        current = to
        streak = 0
        since = now
      }
      return current
    }
  }
}

/** @param {number[]} values */
export function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The worker ceiling of a site's web container, read with `docker exec` (the current docker
 * context). null when the container is not there or not recognisable; the caller falls back.
 * @param {string} container
 */
function readWorkerCeiling(container) {
  try {
    const text = execFileSync('docker', ['exec', container, 'sh', '-c', WORKER_PROBE], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15_000
    })
    return parseWorkerCeiling(text)
  } catch {
    return null
  }
}

/** The CLI. Guarded so the tests can import the pure helpers above without starting a run. */
async function main() {
  const { values: args, positionals: pages } = parseArgs({
    allowPositionals: true,
    options: {
      site: { type: 'string' },
      upstream: { type: 'string' },
      'cookie-file': { type: 'string' },
      mode: { type: 'string', default: 'both' },
      tracy: { type: 'string', default: 'http://tracy.test:8080' },
      cdp: { type: 'string', default: 'http://127.0.0.1:9222' },
      concurrency: { type: 'string' },
      container: { type: 'string' },
      'slow-ms': { type: 'string', default: '10000' },
      out: { type: 'string', default: path.join(ROOT, 'tasks/evidence/comment-to-edit/coverage') }
    }
  })
  if (!args.site || !args.upstream || pages.length === 0) {
    console.error('usage: measure-provenance.mjs --site <key> --upstream <origin> --cookie-file <f> <url>...')
    process.exit(2)
  }
  const cookie = (
    args['cookie-file'] ? await readFile(args['cookie-file'], 'utf8') : (process.env.TRACY_SESS ?? '')
  ).trim()
  if (!cookie) {
    console.error('measure-provenance: no seat cookie (--cookie-file or TRACY_SESS)')
    process.exit(2)
  }
  const modes = args.mode === 'both' ? ['plain', 'stamped'] : [args.mode]
  const containerName = args.container ?? `${args.site.split('.')[0]}-web-1`
  const ceiling = readWorkerCeiling(containerName)
  const chosen = chooseConcurrency({ requested: Number(args.concurrency) || undefined, ceiling })
  const slowMs = Math.max(1, Number(args['slow-ms']) || 10_000)
  const backoff = createBackoff({ limit: chosen.value, slowMs })
  /** Milliseconds of every locate HTTP answer, for the median in the summary. */
  const latencies = []
  console.log(
    `measure-provenance: concurrency ${chosen.value} — ${chosen.reason} (container ${containerName})`
  )
  const siteOrigin = new URL(pages[0]).origin

  // ── The picker's describe(), bundled for the page ───────────────────────────────────────────────

  const bundle = await build({
    stdin: {
      contents: `import { describe } from './src/pick.mjs'; window.__tracyMeasureDescribe = describe`,
      resolveDir: path.join(ROOT, 'packages/cms/tracy-cms-preview'),
      sourcefile: 'measure-entry.mjs'
    },
    bundle: true,
    format: 'iife',
    write: false,
    platform: 'browser'
  })
  const DESCRIBE_JS = bundle.outputFiles[0].text

  /** Every visible element worth a question, with the marks a pick on it would carry. */
  const PROBE = `(() => {
    const describe = window.__tracyMeasureDescribe
    const skip = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|PATH|HEAD|META|LINK)$/i
    const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 }
    const out = []
    for (const el of document.body.querySelectorAll('*')) {
      if (skip.test(el.tagName) || !visible(el)) continue
      const d = describe(el)
      const base = { tag: d.tag, marks: d.marks, domPath: d.domPath, selector: d.selector }
      const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(' ').replace(/\\s+/g, ' ').trim()
      if (own.length >= 2) out.push({ kind: 'text', text: own, ...base })
      if (d.image && !d.image.src.startsWith('data:')) out.push({ kind: 'image', image: { src: new URL(d.image.src, location.href).href, alt: d.image.alt }, ...base })
      for (const a of ['placeholder', 'aria-label', 'title']) { const v = el.getAttribute(a); if (v && v.trim().length >= 2 && !own.includes(v.trim())) out.push({ kind: 'attr', attr: a, text: v.trim(), ...base }) }
    }
    return JSON.stringify(out)
  })()`

  // ── CDP, on chrome-watch's Chrome ────────────────────────────────────────────────────────────────

  /** A tiny CDP client over one WebSocket: `send` resolves with the result, `on` receives events. */
  async function connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
    let next = 0
    const waiting = new Map()
    const handlers = new Map()
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data)
      if (data.id && waiting.has(data.id)) {
        waiting.get(data.id)(data)
        waiting.delete(data.id)
      } else if (data.method) for (const h of handlers.get(data.method) ?? []) h(data.params)
    })
    return {
      send: (method, params = {}) =>
        new Promise((resolve, reject) => {
          const id = ++next
          waiting.set(id, (d) =>
            d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)
          )
          ws.send(JSON.stringify({ id, method, params }))
        }),
      on: (method, handler) => handlers.set(method, [...(handlers.get(method) ?? []), handler])
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  /**
   * GET one document from the upstream with the site's own Host header. `node:http`, not `fetch`:
   * `fetch` treats Host as a forbidden header and sends the upstream's address instead, and the CMS
   * then redirects to that address. No `accept-encoding` is sent, so the body arrives as the CMS
   * wrote it.
   * @returns {Promise<{status: number, headers: Record<string, string|string[]>, body: Buffer}>}
   */
  function upstreamGet(pathAndQuery, headers) {
    return new Promise((resolve, reject) => {
      const request = http.get(new URL(pathAndQuery, args.upstream), { headers }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 502,
            headers: response.headers,
            body: Buffer.concat(chunks)
          })
        )
        response.on('error', reject)
      })
      request.on('error', reject)
      request.setTimeout(60_000, () => request.destroy(new Error('upstream timeout')))
    })
  }

  /**
   * A page in a fresh browser context (no cookie another agent left) whose documents come from the
   * upstream, with or without the stamp header. Left open when the run ends, as chrome-watch asks.
   */
  async function openPage(stamped) {
    const version = await (await fetch(`${args.cdp}/json/version`)).json()
    const browser = await connect(version.webSocketDebuggerUrl)
    const { browserContextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: false })
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId })
    const page = await connect(`${args.cdp.replace(/^http/, 'ws')}/devtools/page/${targetId}`)
    await page.send('Page.enable')
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    })
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: DESCRIBE_JS })
    await page.send('Fetch.enable', {
      patterns: [{ urlPattern: `${siteOrigin}/*`, resourceType: 'Document', requestStage: 'Request' }]
    })
    const siteHost = new URL(siteOrigin).host
    page.on('Fetch.requestPaused', async ({ requestId, request }) => {
      try {
        const url = new URL(request.url)
        const headers = { host: siteHost, accept: request.headers.Accept ?? 'text/html' }
        for (const name of ['User-Agent', 'Accept-Language', 'Cookie'])
          if (request.headers[name]) headers[name.toLowerCase()] = request.headers[name]
        if (stamped) headers['x-tracy-preview'] = 'pick'
        const answer = await upstreamGet(`${url.pathname}${url.search}`, headers)
        const responseHeaders = []
        for (const [name, value] of Object.entries(answer.headers))
          for (const one of Array.isArray(value) ? value : [value])
            if (!/^(content-length|transfer-encoding|connection|keep-alive)$/i.test(name))
              responseHeaders.push({ name, value: one })
        const body = answer.body
        await page.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: answer.status,
          responseHeaders,
          body: body.toString('base64')
        })
      } catch (error) {
        console.error('measure-provenance: upstream fetch failed', request.url, error.message)
        await page.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {})
      }
    })
    return page
  }

  async function extract(page, url) {
    const loaded = new Promise((resolve) => page.on('Page.loadEventFired', resolve))
    await page.send('Page.navigate', { url })
    await Promise.race([loaded, sleep(20_000)])
    await sleep(1500)
    // Scroll the whole page once so lazy images pick their real source.
    await page.send('Runtime.evaluate', {
      expression:
        'new Promise(r=>{let y=0;const s=()=>{window.scrollTo(0,y+=800);y<document.body.scrollHeight?setTimeout(s,120):(window.scrollTo(0,0),setTimeout(r,800))};s()})',
      awaitPromise: true
    })
    const result = await page.send('Runtime.evaluate', { expression: PROBE, returnByValue: true })
    if (result.exceptionDetails) throw new Error(`probe failed on ${url}: ${result.exceptionDetails.text}`)
    return JSON.parse(result.result.value)
  }

  // ── content.locate ───────────────────────────────────────────────────────────────────────────────

  async function locate(params) {
    // A cold site answers `incomplete` while its snapshot is being built: wait, then ask again.
    let busy = null
    for (let attempt = 0; attempt < 30; attempt++) {
      const startedAt = Date.now()
      const response = await fetch(`${args.tracy}/api/sites/${encodeURIComponent(args.site)}/apply`, {
        method: 'POST',
        headers: { cookie: `tracy_sess=${cookie}`, origin: args.tracy, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'content.locate', params })
      })
      const text = await response.text()
      const now = Date.now()
      latencies.push(now - startedAt)
      backoff.record({ status: response.status, ms: now - startedAt, startedAt, now })
      // A busy site is asked again, not recorded as an error: the answer must not depend on load.
      if (response.status === 429 || response.status === 503) {
        busy = `HTTP_${response.status}`
        await sleep(2000)
        continue
      }
      busy = null
      let body
      try {
        body = JSON.parse(text)
      } catch {
        body = { code: `HTTP_${response.status}`, text: text.slice(0, 200) }
      }
      if (!response.ok || !body.status) return { status: 'error', error: body.code ?? response.status }
      if (!body.incomplete) return body
      await sleep(4000)
    }
    return { status: 'error', error: busy ?? 'still incomplete after 2 minutes' }
  }

  /** Runs `task` over `items`, at most `limit()` at a time; a lowered limit retires the extra runners. */
  async function pool(items, limit, task) {
    const out = Array.from({ length: items.length })
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(limit(), items.length) }, async (_, runner) => {
        while (next < items.length && runner < limit()) {
          const i = next++
          out[i] = await task(items[i], i)
        }
      })
    )
    return out
  }

  // ── The run ──────────────────────────────────────────────────────────────────────────────────────

  const empty = () => Object.fromEntries(STATUSES.map((s) => [s, 0]))
  const run = { site: args.site, upstream: args.upstream, at: new Date().toISOString(), pages, modes: {} }
  const startedRun = Date.now()

  for (const mode of modes) {
    const page = await openPage(mode === 'stamped')
    const result = { pages: {}, total: { all: empty() }, byKind: {} }
    for (const kind of KINDS) result.byKind[kind] = empty()
    for (const url of pages) {
      const elements = await extract(page, url)
      const seen = new Set()
      const distinct = elements.filter((e) => {
        const key = `${e.kind}\u0000${e.text ?? e.image?.src}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      const answers = await pool(distinct, backoff.limit, (e) =>
        locate({
          url,
          ...(e.kind === 'image' ? { image: e.image } : { text: e.text }),
          marks: e.marks,
          domPath: e.domPath,
          selector: e.selector
        })
      )
      const tally = { all: empty() }
      for (const kind of KINDS) tally[kind] = empty()
      const rows = distinct.map((e, i) => {
        const a = answers[i]
        tally.all[a.status]++
        tally[e.kind][a.status]++
        result.total.all[a.status]++
        result.byKind[e.kind][a.status]++
        return {
          kind: e.kind,
          ...(e.attr ? { attr: e.attr } : {}),
          tag: e.tag,
          value: (e.text ?? e.image.src).slice(0, 120),
          marks: e.marks,
          status: a.status,
          ...(a.error ? { error: a.error } : {}),
          sources: a.sources,
          level: a.levels?.[0]
            ? { kind: a.levels[0].kind, id: a.levels[0].id, label: a.levels[0].label }
            : null,
          candidates: a.candidates?.length ?? 0
        }
      })
      result.pages[url] = { distinct: distinct.length, visible: elements.length, tally, rows }
      const share = ((100 * tally.all.resolved) / Math.max(1, distinct.length)).toFixed(1)
      console.log(`${mode} ${url}: ${distinct.length} distinct, ${tally.all.resolved} resolved (${share}%)`)
    }
    const count = Object.values(result.total.all).reduce((a, b) => a + b, 0)
    result.total.distinct = count
    result.total.resolvedShare = Number(((100 * result.total.all.resolved) / Math.max(1, count)).toFixed(1))
    run.modes[mode] = result
  }

  // ── What is left: the unresolved, grouped by the reason the door gave ─────────────────────────────

  /** A mark's owner kind (`post`, `module`, `menuItem`, `block` for an owner-less block stamp). */
  const markKind = (mark) => (mark ? /^([a-zA-Z]+):/.exec(mark)?.[1] : 'none') ?? 'other'

  function classes(result) {
    const groups = new Map()
    for (const [url, p] of Object.entries(result.pages))
      for (const row of p.rows) {
        if (row.status === 'resolved') continue
        const key = `${row.status} · value ${row.sources?.value ?? '-'} · mark ${row.sources?.mark ?? '-'} · ${row.kind} · innermost ${markKind(row.marks[0])}`
        const g = groups.get(key) ?? { key, count: 0, examples: [] }
        g.count++
        if (g.examples.length < 4)
          g.examples.push({
            page: new URL(url).pathname,
            value: (row.kind === 'image' ? row.value.split('/').pop() : row.value).slice(0, 60),
            marks: row.marks.slice(0, 2)
          })
        groups.set(key, g)
      }
    return [...groups.values()].sort((a, b) => b.count - a.count)
  }
  for (const result of Object.values(run.modes)) result.unresolved = classes(result).slice(0, 15)

  // The load summary is the LAST key, so everything before it keeps its old bytes.
  const wallMs = Date.now() - startedRun
  run.load = {
    container: containerName,
    ceiling,
    concurrency: { chosen: chosen.value, reason: chosen.reason, used: backoff.limit() },
    halvings: backoff.halvings.map((h) => ({ ...h, at: new Date(h.at).toISOString() })),
    slowMs,
    locateCalls: latencies.length,
    medianLatencyMs: median(latencies),
    wallTimeMs: wallMs
  }
  const concurrencyLine =
    backoff.halvings.length === 0
      ? `${chosen.value} (${chosen.reason})`
      : `${chosen.value} → ${backoff.limit()} (${chosen.reason}; halved ${backoff.halvings.map((h) => `${h.from}→${h.to} on ${h.why}`).join(', ')})`
  const loadLines = [
    `concurrency used: ${concurrencyLine}`,
    `median latency: ${run.load.medianLatencyMs ?? '-'} ms over ${latencies.length} locate calls`,
    `wall time: ${(wallMs / 1000).toFixed(1)} s`
  ]

  // ── Write ────────────────────────────────────────────────────────────────────────────────────────

  const pct = (n, d) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`
  const md = [
    `# Provenance coverage — ${args.site} (${run.at})`,
    '',
    `Pages: ${pages.map((p) => `\`${new URL(p).pathname}\``).join(' · ')}`,
    ''
  ]
  for (const [mode, result] of Object.entries(run.modes)) {
    md.push(
      `## ${mode}`,
      '',
      `**${result.total.resolvedShare}%** of ${result.total.distinct} distinct visible elements resolved to one source.`,
      ''
    )
    md.push(
      `| Page | Kind | Distinct | ${STATUSES.join(' | ')} | Resolved |`,
      `|${'---|'.repeat(STATUSES.length + 4)}`
    )
    for (const [url, p] of Object.entries(result.pages))
      for (const kind of [...KINDS, 'all']) {
        const t = p.tally[kind]
        const n = Object.values(t).reduce((a, b) => a + b, 0)
        if (n === 0) continue
        md.push(
          `| ${new URL(url).pathname} | ${kind} | ${n} | ${STATUSES.map((s) => t[s]).join(' | ')} | ${pct(t.resolved, n)} |`
        )
      }
    for (const kind of KINDS) {
      const t = result.byKind[kind]
      const n = Object.values(t).reduce((a, b) => a + b, 0)
      md.push(
        `| **all pages** | ${kind} | ${n} | ${STATUSES.map((s) => t[s]).join(' | ')} | ${pct(t.resolved, n)} |`
      )
    }
    const t = result.total.all
    md.push(
      `| **all pages** | **all** | ${result.total.distinct} | ${STATUSES.map((s) => t[s]).join(' | ')} | **${result.total.resolvedShare}%** |`,
      ''
    )
    md.push('Top unresolved classes:', '')
    for (const g of result.unresolved.slice(0, 10))
      md.push(
        `- ${g.count} × ${g.key} — e.g. ${g.examples.map((e) => `\`${e.value}\` (${e.page}${e.marks[0] ? `, ${e.marks[0]}` : ''})`).join('; ')}`
      )
    md.push('')
  }
  md.push('## Load', '', ...loadLines.map((l) => `- ${l}`), '')
  await mkdir(args.out, { recursive: true })
  const base = path.join(args.out, `${args.site.split('.')[0]}-${run.at.slice(0, 10)}`)
  await writeFile(`${base}.json`, `${JSON.stringify(run, null, 1)}\n`)
  await writeFile(`${base}.md`, `${md.join('\n')}\n`)
  for (const [mode, result] of Object.entries(run.modes))
    console.log(
      `${args.site} ${mode}: ${result.total.resolvedShare}% of ${result.total.distinct} distinct visible elements resolved to one source`
    )
  for (const line of loadLines) console.log(`${args.site} ${line}`)
  console.log(`wrote ${base}.json and ${base}.md`)
  process.exit(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
