// site-sweep-source-cache.mjs — the source side of the site sweep, measured once and reused while the source is unchanged.
//
// WHY. The source is frozen while a port is fixed, yet every sweep (and the behaviour, heights and confirmation passes of it) loaded
// every source page again for readings that cannot change. The PORT changes between runs and is always measured live; the SOURCE
// readings are kept on disk under <run-root>/source-cache/ and reused when nothing that makes them is different.
//
// WHAT A READING STANDS ON (the key). A reading is reused only when ALL of this is equal to the run that took it:
//   - the source origin, the resolved page URL, the load expectation (declared status), the browser context (width, scheme, switch
//     cookies), the probe configuration of the call site (parts, selectors, marks, hooks, behaviour hints, widths of the resize
//     sequence, reload mode, settle time) and the browser identity;
//   - PROBE_VERSION — bump it whenever a probe, a `load` step or a settle rule changes what it reads — and CODE_HASH, the hash of the
//     files that hold those probes, which invalidates every entry when any of them is edited (a safety net for a forgotten bump);
//   - the FINGERPRINT of the source content: the manifest of every document and resource the browser was served while taking the
//     reading (status and SHA-256 of the raw bytes; for a redirect its target), re-fetched with the request headers and cookies the browser sent, and compared on every response header but transport and caching metadata (Set-Cookie included)
//     (bounded in time and size) and compared before the reading is reused. This is a fetched-HTML/asset hash, taken from what the
//     reading really saw, so it covers stylesheets, scripts, fonts and pictures that preflight's document/stylesheet/font hash does
//     not, and it needs no preflight lock. Raw bytes are compared, so any change misses.
//
// SAFE BY CONSTRUCTION. A miss, a key mismatch, an unreadable or incomplete entry, a resource that cannot be fetched again, a resource
// that answers differently, a non-GET request, a request that failed, a reading whose document changed while it was taken: the reading is
// taken live. Only a reading that completed is stored (an error or a deadline is never stored), and the cache never supplies the port.
// A reading returned from the cache is a fresh copy: judging it cannot change the file.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'

export const SOURCE_CACHE_SCHEMA = 'tracy-site-sweep-source-cache/v1'
/** Bump whenever a probe, `load`, a settle rule or a reading's shape changes. 3: an icon reading carries the drawn glyph (`ink.shape`) and the short-label words. */
export const PROBE_VERSION = 3
const HERE = path.dirname(fileURLToPath(import.meta.url))
const CODE_FILES = ['site-sweep.mjs', 'site-sweep-probe.mjs', 'site-sweep-behaviour.mjs', 'site-sweep-behaviour-probe.mjs', 'site-sweep-heights.mjs', '../lib/motion.mjs', '../lib/platform-fonts.mjs']
const MAX_ENTRIES = 500
const MAX_BYTES = 40 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20000
const FETCH_PARALLEL = 8
// The request is replayed exactly as the browser sent it (every header, cookies and `accept-encoding` with its q-values included); only the
// hop-by-hop headers node:http sets for itself are left out. A credential is never stored.
const NOT_REPLAYED = new Set(['host', 'connection', 'content-length', 'keep-alive', 'transfer-encoding', 'upgrade', 'te'])
const CREDENTIALS = new Set(['authorization', 'proxy-authorization'])
// RESPONSE headers: all of them are part of the fingerprint — Set-Cookie, ETag, Last-Modified, CSP, Link, Refresh, anything a page script can
// read from a response or the browser acts on. Chromium also shows a page the transport headers (`date`, `age`, `connection`, `keep-alive`,
// `transfer-encoding`, `upgrade`), so none is exempt by assumption. They are left out only for a reading that is EVIDENCED not to have
// observed them: an init script wraps every `Headers` and XMLHttpRequest accessor of every frame, and a read of one of them, a walk over all
// headers, or a worker (which the script does not reach) means they are observed and are compared like any other header.
// A header that is compared and differs between two answers to the same request — a per-request cookie, a counter, an observed clock — can
// change what a page shows, so such a reading is NOT stored (it is taken live every time).
const TRANSPORT = ['date', 'age', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade']
// `Date` and `Age` are also used by the browser itself, with no accessor call: `Date` places a `Set-Cookie ...; Expires=` deadline, and `Date`/`Age`
// drive HTTP cache freshness. So they are left out of the comparison of a response only when no script or worker observed them AND the
// response sets no cookie with an `Expires` attribute AND it carries none of the headers the HTTP cache works from (the simplest condition
// that is certainly true: without any of them the browser has nothing to keep fresh or to revalidate). Otherwise they are compared like any
// other header, and the reading is not stored at all (equal values on two answers would not make a later one equal). The same holds when a script or worker observed the headers.
const CLOCK = ['date', 'age']
const CACHE_HEADERS = ['cache-control', 'expires', 'last-modified', 'etag', 'age']
/** Why the browser itself may depend on `Date`/`Age` of this response (null = it cannot). */
const clockDependence = (response) => {
  if (/(^|[;\n])\s*[^\n=;]+=[^\n]*;\s*expires\s*=/i.test(String(response?.['set-cookie'] ?? ''))) return 'sets a cookie with an Expires deadline'
  const h = CACHE_HEADERS.find((k) => response?.[k] !== undefined)
  return h ? `carries ${h}, so the HTTP cache may depend on Date/Age` : null
}
/** { name: value } of the response headers, from [name, value] pairs (names lower-cased; several Set-Cookie joined by newline). */
const comparedHeaders = (pairs) => Object.fromEntries([...pairs].map(([k, v]) => [String(k).toLowerCase(), v]).sort(([a], [b]) => (a < b ? -1 : 1)))
/** Names whose value is not the same in `a` and `b`. */
const differing = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter((k) => (a ?? {})[k] !== (b ?? {})[k]).sort()
const OBSERVE_INIT = `(() => {
  const note = () => { try { window.__tracyTransportRead() } catch {} }
  const transport = (n) => /^(date|age|connection|keep-alive|transfer-encoding|upgrade)$/i.test(String(n))
  const wrap = (proto, name, all) => {
    const orig = proto && proto[name]
    if (typeof orig !== 'function') return
    proto[name] = function (...a) { if (all || transport(a[0])) note(); return orig.apply(this, a) }
  }
  for (const m of ['get', 'has']) wrap(self.Headers && Headers.prototype, m, false)
  for (const m of ['forEach', 'entries', 'keys', 'values', 'getSetCookie']) wrap(self.Headers && Headers.prototype, m, true)
  if (self.Headers) { const it = Headers.prototype[Symbol.iterator]; Headers.prototype[Symbol.iterator] = function () { note(); return it.apply(this, arguments) } }
  wrap(self.XMLHttpRequest && XMLHttpRequest.prototype, 'getResponseHeader', false)
  wrap(self.XMLHttpRequest && XMLHttpRequest.prototype, 'getAllResponseHeaders', true)
})()`
const without = (headers, names) => Object.fromEntries(Object.entries(headers ?? {}).filter(([k]) => !names.includes(k)))
/** The header names left out of the comparison of `entry`: the transport ones where the reading did not observe them, Date and Age only where nothing in the response can depend on them either. */
const exemptNames = (entry) => [...(entry.transportExempt ? TRANSPORT.filter((k) => !CLOCK.includes(k)) : []), ...(entry.clockExempt ? CLOCK : [])]
const compared = (response, entry) => without(response, exemptNames(entry))

const sha = (v) => createHash('sha256').update(v).digest('hex')

/** JSON with sorted keys: equal values give equal text. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  return JSON.stringify(v === undefined ? null : v)
}

let codeHash = null
/** The hash of the files that hold the probes. */
export function codeHashOf() {
  if (!codeHash) {
    const h = createHash('sha256')
    for (const f of CODE_FILES) {
      const file = path.join(HERE, f)
      h.update(`${f}\0${existsSync(file) ? readFileSync(file) : 'missing'}\0`)
    }
    codeHash = h.digest('hex')
  }
  return codeHash
}

// ---- fingerprint: record what the browser was served, fetch it again ------------------------------------------------------

/**
 * Starts recording the responses of every page opened through the browser it hands out.
 * → { browser(real) → tracked browser, finish() → { ok, manifest, problems } }
 */
export function startTracker() {
  const state = { entries: new Map(), problems: [], pending: new Set(), unsupported: false, transportObserved: false }
  const track = (p) => {
    state.pending.add(p)
    p.finally(() => state.pending.delete(p))
  }
  const drain = async () => {
    while (state.pending.size) await Promise.allSettled([...state.pending])
  }
  const record = async (r) => {
    const req = r.request()
    const url = r.url()
    if (!/^https?:/.test(url)) return
    if (req.resourceType?.() === 'ping') return
    if (req.method() !== 'GET') return void state.problems.push(`${req.method()} ${url} cannot be fetched again`)
    const status = r.status()
    // only the full header sets are supported (headers() leaves out cookies): a page that cannot give them is not fingerprinted
    if (typeof req.allHeaders !== 'function' || typeof r.allHeaders !== 'function') return void state.problems.push(`${url}: the full request and response headers are not available`)
    const sent = await req.allHeaders()
    if (Object.keys(sent).some((k) => CREDENTIALS.has(k.toLowerCase()))) return void state.problems.push(`${url} was requested with a credential`)
    const headers = Object.fromEntries(Object.entries(sent).filter(([k]) => !NOT_REPLAYED.has(k.toLowerCase())))
    const got = await r.allHeaders()
    const entry = { url, status, headers, response: comparedHeaders(Object.entries(got)), document: Boolean(req.isNavigationRequest?.() && req.frame?.()?.parentFrame?.() == null) }
    if (status >= 300 && status < 400) entry.location = got.location ?? null
    else entry.sha256 = sha(await r.body())
    const id = `${url}\0${canonical(headers)}`
    const seen = state.entries.get(id)
    if (!seen) state.entries.set(id, entry)
    else if (seen.status !== entry.status || seen.sha256 !== entry.sha256 || seen.location !== entry.location) state.problems.push(`${url} answered differently within one reading`)
    else {
      // the same resource answered twice within one reading: the headers that differ are judged once it is known whether the transport headers were observed
      const v = differing(seen.response, entry.response)
      if (v.length) seen.drift = [...new Set([...(seen.drift ?? []), ...v])].sort()
    }
  }
  return {
    wrap(browser) {
      const tracked = Object.create(browser)
      tracked.newContext = async (...a) => {
        const context = await browser.newContext(...a)
        // does a page of this reading observe the transport headers? what cannot be proved counts as observed
        if (typeof context.exposeFunction === 'function' && typeof context.addInitScript === 'function') {
          await context.exposeFunction('__tracyTransportRead', () => void (state.transportObserved = true))
          await context.addInitScript(OBSERVE_INIT)
        } else state.transportObserved = true
        context.on?.('serviceworker', () => void (state.transportObserved = true))
        const newPage = context.newPage.bind(context)
        context.newPage = async (...b) => {
          const page = await newPage(...b)
          if (typeof page.on !== 'function') state.unsupported = true
          else {
            page.on('worker', () => void (state.transportObserved = true))
            page.on('response', (r) => track(record(r).catch((e) => void state.problems.push(`${r.url()}: ${String(e.message).split('\n')[0]}`))))
            page.on('requestfailed', (req) => {
              const why = req.failure?.()?.errorText ?? 'failed'
              if (!/ERR_ABORTED/.test(why)) state.problems.push(`${req.url()} failed (${why})`)
            })
          }
          return page
        }
        // the bodies are read while the page is alive
        const close = context.close.bind(context)
        context.close = async (...b) => {
          // a read a page made just before is delivered before the context goes
          await Promise.all((context.pages?.() ?? []).map((pg) => pg.evaluate(() => 0).catch(() => {})))
          await drain()
          return close(...b)
        }
        return context
      }
      return tracked
    },
    async finish() {
      await drain()
      const manifest = [...state.entries.values()]
      const problems = [...state.problems]
      for (const e of manifest) {
        e.transportExempt = !state.transportObserved
        // one rule: a reading in which Date/Age can matter (observed by a script or worker, or timed by the browser itself) is never stored,
        // however its values compare; Date/Age are exempt only where none of that holds
        const clock = clockDependence(e.response)
        e.clockExempt = !state.transportObserved && clock === null
        if (clock) problems.push(`${e.url}: the response ${clock}, so the reading depends on Date/Age and is taken live`)
        const drift = (e.drift ?? []).filter((k) => !exemptNames(e).includes(k))
        delete e.drift
        if (drift.length) {
          problems.push(`${e.url}: ${drift.join(', ')} changed between two answers within one reading`)
        }
      }
      if (state.transportObserved) problems.push('a page script or worker may have observed the response headers (Date/Age included), so the reading depends on Date/Age and is taken live')
      if (state.unsupported) problems.push('the page cannot report its responses')
      if (!manifest.some((e) => e.document)) problems.push('no document was recorded')
      if (manifest.length > MAX_ENTRIES) problems.push(`more than ${MAX_ENTRIES} resources`)
      return { ok: problems.length === 0, manifest, problems }
    }
  }
}

/**
 * GET `entry` again with exactly the request headers (cookies and `accept-encoding` included) the browser sent; no header is added or
 * changed (a fetch API would add its own, so the request goes through node:http). The body is decoded as the browser decoded it; an answer
 * in a coding this node cannot decode is an error, and the reading is taken live → { status, sha256, location, response }.
 */
export function fetchEntry(entry) {
  return new Promise((resolve, reject) => {
    const url = new URL(entry.url)
    const decoders = { gzip: zlib.createGunzip, deflate: zlib.createInflate, ...(zlib.createBrotliDecompress && { br: zlib.createBrotliDecompress }), ...(zlib.createZstdDecompress && { zstd: zlib.createZstdDecompress }) }
    const headers = { ...entry.headers }
    const req = (url.protocol === 'https:' ? https : http).request(url, { method: 'GET', headers, timeout: FETCH_TIMEOUT_MS }, (res) => {
      const pairs = Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(k === 'set-cookie' ? '\n' : ', ') : v])
      const response = comparedHeaders(pairs)
      const status = res.statusCode
      if (status >= 300 && status < 400) {
        res.resume()
        return resolve({ status, location: res.headers.location ?? null, response })
      }
      const coding = String(res.headers['content-encoding'] ?? 'identity').trim().toLowerCase()
      if (coding !== 'identity' && !decoders[coding]) return void req.destroy(new Error(`${entry.url}: content-encoding ${coding} cannot be decoded`))
      const body = coding === 'identity' ? res : res.pipe(decoders[coding]())
      const h = createHash('sha256')
      let n = 0
      body.on('data', (chunk) => {
        n += chunk.length
        if (n > MAX_BYTES) return void req.destroy(new Error(`${entry.url} is larger than ${MAX_BYTES} bytes`))
        h.update(chunk)
      })
      body.on('end', () => resolve({ status, sha256: h.digest('hex'), response }))
      body.on('error', reject)
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error(`${entry.url}: no answer in ${FETCH_TIMEOUT_MS} ms`)))
    req.on('error', reject)
    req.end()
  })
}

const sameAnswer = (entry, got) => got.status === entry.status && (got.location ?? null) === (entry.location ?? null) && (got.sha256 ?? null) === (entry.sha256 ?? null) && canonical(compared(got.response, entry)) === canonical(compared(entry.response, entry))

// ---- the cache ------------------------------------------------------------------------------------------------------------

/**
 * `dir` is <run-root>/source-cache. `enabled: false` is a bypass: every reading is live (and the report says so).
 * `fetcher` and `tracker` are injectable (tests); `tracker` is the factory of startTracker.
 * `sourceId` is the `id` of the source fingerprint the run read LIVE from the source (lib/source-fingerprint.mjs, never from this cache); it is
 * part of every key, so a reading stored under one source fingerprint is not reused under another.
 */
export function createSourceCache({ dir, enabled = true, fetcher = fetchEntry, tracker = startTracker, reason = null, probeVersion = PROBE_VERSION, sourceId = null } = {}) {
  const cells = []
  const inflight = new Map()
  let gate = FETCH_PARALLEL
  const waiting = []
  const slot = async () => {
    if (gate > 0) return void gate--
    await new Promise((r) => waiting.push(r))
  }
  const release = () => (waiting.length ? waiting.shift()() : gate++)
  const limited = async (fn) => {
    await slot()
    try {
      return await fn()
    } finally {
      release()
    }
  }
  // requests running at this moment are shared; a finished answer is never kept for a later reading
  const again = (entry, { fresh = false } = {}) => {
    const id = `${entry.url}\0${canonical(entry.headers)}`
    if (!fresh && inflight.has(id)) return inflight.get(id)
    const p = limited(() => fetcher(entry)).catch((e) => ({ error: String(e.message).split('\n')[0] }))
    if (!fresh) {
      inflight.set(id, p)
      p.finally(() => inflight.delete(id))
    }
    return p
  }
  // → null when every resource answers as it did, else the first that differs
  const changed = async (list) => {
    const got = await Promise.all(list.map((e) => again(e)))
    const i = got.findIndex((g, k) => g.error || !sameAnswer(list[k], g))
    return i < 0 ? null : `${list[i].url}${got[i].error ? ` (${got[i].error})` : ''}`
  }
  // → null when every resource answers the same way a second time (status, body and every compared header), else what differs
  const stable = async (manifest) => {
    const got = await Promise.all(manifest.map((e) => again(e, { fresh: true })))
    const i = got.findIndex((g, k) => g.error || !sameAnswer(manifest[k], g))
    if (i < 0) return null
    if (got[i].error) return `${manifest[i].url} (${got[i].error})`
    const v = differing(manifest[i].response, got[i].response)
    return `${manifest[i].url}${v.length && got[i].status === manifest[i].status && got[i].sha256 === manifest[i].sha256 ? `: ${v.join(', ')} differs between two answers` : ''}`
  }
  let browserId = null
  const identityOf = async (browser) => {
    if (browserId == null) browserId = await Promise.resolve(browser.version?.()).catch(() => null) ?? 'unknown'
    return browserId
  }
  // a reading that stands for several cells (the widths of one resize sequence) is recorded once per cell
  const cellOf = (label, kind, from, why) => { for (const l of [label].flat()) cells.push({ kind, ...l, from, ...(why ? { why } : {}) }) }

  const load = (file, keyText) => {
    if (!existsSync(file)) return { miss: 'no entry' }
    let doc
    try {
      doc = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return { miss: 'entry unreadable' }
    }
    if (doc?.schema !== SOURCE_CACHE_SCHEMA || doc.complete !== true) return { miss: 'entry incomplete' }
    if (canonical(doc.key) !== keyText) return { miss: 'key mismatch' }
    if (!Array.isArray(doc.manifest) || !doc.manifest.some((e) => e?.document) || !('value' in doc)) return { miss: 'entry incomplete' }
    return { doc }
  }
  const store = (file, doc) => {
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(tmp, JSON.stringify(doc))
      renameSync(tmp, file)
      return true
    } catch {
      rmSync(tmp, { force: true })
      return false
    }
  }

  return {
    enabled,
    dir,
    cells,
    /**
     * One source reading. `o`: { browser }. `spec`: { s (the side: name, side, origin, url, expect), kind, ctx, extra, label }.
     * `run(browser)` takes the reading live and returns a JSON value; give it the browser it is handed. The PORT is always live.
     */
    async read(o, spec, run) {
      const { s, kind, ctx = null, extra = {}, label = {} } = spec
      if (s.side !== 'source') return run(o.browser)
      if (!enabled) {
        cellOf(label, kind, 'live', reason ?? 'source cache bypassed')
        return run(o.browser)
      }
      const key = { schema: SOURCE_CACHE_SCHEMA, kind, origin: s.origin, url: s.url, expect: s.expect, ctx, extra, probeVersion, code: codeHashOf(), browser: await identityOf(o.browser), sourceId }
      const keyText = canonical(key)
      const file = path.join(dir, `${kind.replace(/[^\w-]/g, '_')}-${sha(keyText).slice(0, 40)}.json`)
      const hit = load(file, keyText)
      let why = hit.miss
      if (hit.doc) {
        const diff = await changed(hit.doc.manifest)
        if (!diff) {
          cellOf(label, kind, 'cache')
          return JSON.parse(JSON.stringify(hit.doc.value))
        }
        why = `the source changed: ${diff}`
      }
      const t = tracker()
      const value = await run(t.wrap(o.browser))
      const fp = await t.finish()
      const copy = JSON.parse(JSON.stringify(value ?? null))
      let stored = fp.ok ? 'live' : `not stored: ${fp.problems[0]}`
      if (fp.ok) {
        // every resource must answer a second time exactly as the reading saw it: a source edited while it was read, or one whose answers
        // differ from request to request (a per-request cookie, a counter), is not stored
        const diff = await stable(fp.manifest)
        if (diff) stored = `not stored: the source is not stable while it is read (${diff})`
        else if (!store(file, { schema: SOURCE_CACHE_SCHEMA, complete: true, key, manifest: fp.manifest, value: copy, storedAt: new Date().toISOString() })) stored = 'not stored: the cache could not be written'
      }
      cellOf(label, kind, 'live', `${why}; ${stored}`)
      return copy
    },
    /** What the report records. */
    summary() {
      const n = (from) => cells.filter((c) => c.from === from).length
      return { schema: SOURCE_CACHE_SCHEMA, enabled, probeVersion, dir: enabled ? dir : null, bypass: enabled ? null : (reason ?? 'source cache bypassed'), cached: n('cache'), live: n('live'), cells: cells.map((c) => ({ ...c })) }
    }
  }
}

/** The reading of one side: through the cache when `o.sourceCache` is given and the side is the source, else live. */
export function readSide(o, spec, run) {
  return o.sourceCache ? o.sourceCache.read(o, spec, run) : run(o.browser)
}
