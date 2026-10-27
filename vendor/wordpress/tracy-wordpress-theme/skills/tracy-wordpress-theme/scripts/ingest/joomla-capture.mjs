// joomla-capture.mjs — the `capture/` a dump of a RUNNING Joomla site needs (issues #67, #73), with what a route
// is measured to answer and to link. joomla-dump.mjs calls it under `--capture`; the functions are pure or take
// their I/O as arguments so a test can drive each without Docker.
//
// WHAT IS CAPTURED. The site's template directories (`templates/<tpl>` of every site style: layouts, blocks, LESS,
// css, acm schemas), `t3-assets` (the CSS T3 compiles per page) and `media/t4` (T4's compiled style sheets), copied out
// of the web container as one tar stream that is READ HERE, entry by entry — no `tar -x`, so nothing is created that
// this reader did not accept: regular files and directories only (a link, device or fifo refuses the whole capture),
// plain path segments, no `..`, bounded counts and sizes. The `@import`s a compiled sheet starts with are fetched over
// HTTP when the copied tree does not hold them (a plugin's font sheet), bounded the same way.
//
// WHAT IS MEASURED. Every route is requested twice without following redirects and without cookies — the first pass
// warms the pages (T3 compiles its per-page CSS on the first hit), the second is the record: status, `Location`, and
// the stylesheets the page links in document order (render-routes.json `stylesheets`, `status`, `location`).
//
// WHEN IT FAILS. A request that times out, is refused, answers 5xx or is larger than the bound aborts the capture:
// every outstanding request is cancelled and awaited before the error is raised, so no late response writes into a
// finished run. The caller has written nothing yet.
import { lstatSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { importPath, leadingImports } from './joomla-imports.mjs'
import { CAPTURE_LIMITS, fetchBounded, locationOf, stylesheetLinks } from '../lib/source-capture.mjs'
export { CAPTURE_LIMITS, fetchBounded, locationOf, stylesheetLinks } from '../lib/source-capture.mjs'

// ── the tar stream ────────────────────────────────────────────────────────────

const octal = (buf) => {
  const text = buf.toString('latin1').replace(/\0.*$/s, '').trim()
  return text === '' ? 0 : /^[0-7]+$/.test(text) ? Number.parseInt(text, 8) : Number.NaN
}
const cstr = (buf) => buf.toString('utf8').replace(/\0.*$/s, '')
/** Path segments `a/b/c` → its plain segments, or null: `.`/`..`, an empty segment (except a trailing `/`), NUL, control characters, `\`. */
export function safeSegments(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.length > 1024) return null
  const segs = path.replace(/\/+$/, '').split('/')
  if (!segs.length || segs.some((s) => !s || s === '.' || s === '..' || /[\x00-\x1f\x7f\\]/.test(s))) return null
  return segs
}

/**
 * The entries of a tar stream: `[{ path, dir, data }]`. Only regular files (`0`, NUL) and directories (`5`) are
 * accepted, with pax (`x`) and GNU long-name (`L`) path records read; anything else (symbolic and hard links,
 * devices, fifos), a path that is not made of plain segments, a size past the bounds or a truncated stream throws
 * naming the entry — the whole stream is refused, never read around.
 */
export function readTar(buf, limits = CAPTURE_LIMITS) {
  const out = []
  let total = 0
  let longName = null
  let paxPath = null
  let ended = false
  for (let at = 0; at + 512 <= buf.length; ) {
    const h = buf.subarray(at, at + 512)
    if (h.every((b) => b === 0)) {
      // The terminator is two zero blocks; nothing but zeros may follow.
      if (at + 1024 > buf.length || !buf.subarray(at, at + 1024).every((b) => b === 0) || !buf.subarray(at).every((b) => b === 0)) throw new Error(`tar stream: the end-of-archive marker at byte ${at} is not two zero blocks followed by nothing but zeros`)
      ended = true
      break
    }
    const size = octal(h.subarray(124, 136))
    if (!Number.isFinite(size) || size < 0) throw new Error(`tar entry at byte ${at}: the size field is not a number`)
    const type = String.fromCharCode(h[156] || 48)
    const prefix = cstr(h.subarray(345, 500))
    const name = cstr(h.subarray(0, 100))
    at += 512
    if (at + size > buf.length) throw new Error(`tar entry ${JSON.stringify(name)} is cut off (${size} bytes announced, ${buf.length - at} left)`)
    const body = buf.subarray(at, at + size)
    at += Math.ceil(size / 512) * 512
    if (at > buf.length) throw new Error(`tar entry ${JSON.stringify(name)} is cut off inside its 512-byte padding`)
    if (type === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))
      paxPath = m ? m[1] : null
      continue
    }
    if (type === 'g') continue
    if (type === 'L') {
      longName = cstr(body)
      continue
    }
    const path = paxPath ?? longName ?? (prefix ? `${prefix}/${name}` : name)
    paxPath = null
    longName = null
    const rel = path.replace(/^\.\//, '')
    if (type !== '0' && type !== '5') throw new Error(`tar entry ${JSON.stringify(rel)} is of type ${JSON.stringify(type)} (a link, device or fifo): a capture holds regular files and directories only`)
    const segs = safeSegments(rel)
    if (!segs) throw new Error(`tar entry ${JSON.stringify(rel.slice(0, 120))} is not a plain relative path`)
    if (segs.length > limits.depth) throw new Error(`tar entry ${JSON.stringify(rel.slice(0, 120))} is nested deeper than ${limits.depth}`)
    if (out.length >= limits.files) throw new Error(`the tar stream holds more than ${limits.files} entries`)
    if (type === '5') {
      out.push({ path: segs.join('/'), dir: true })
      continue
    }
    if (size > limits.fileBytes) throw new Error(`tar entry ${JSON.stringify(rel)} is ${size} bytes, over the ${limits.fileBytes} bound`)
    total += size
    if (total > limits.totalBytes) throw new Error(`the tar stream holds more than ${limits.totalBytes} bytes`)
    out.push({ path: segs.join('/'), dir: false, data: Buffer.from(body) })
  }
  if (!ended) throw new Error('the tar stream ends without its end-of-archive block: it is cut off')
  return out
}

/** Create the directories `segs` below `root` one level at a time, checking each existing level first: a link, or a file where a directory belongs, is refused before anything is created through it. */
function ensureDirs(root, segs) {
  const top = lstatSync(root, { throwIfNoEntry: false })
  if (!top) throw new Error(`${root} does not exist`)
  if (top.isSymbolicLink()) throw new Error(`${root} is a link; not written through`)
  if (!top.isDirectory()) throw new Error(`${root} is not a directory; not written through`)
  let cur = root
  for (const seg of segs) {
    cur = join(cur, seg)
    let st = null
    try {
      st = lstatSync(cur)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    if (st?.isSymbolicLink()) throw new Error(`${cur} is a link; not written through`)
    if (st && !st.isDirectory()) throw new Error(`${cur} is not a directory; not written through`)
    if (!st) mkdirSync(cur)
  }
}

/** Write accepted entries below `root`, each file created exclusively (never over something there), no link followed. */
export function writeEntries(entries, root) {
  for (const e of entries) {
    const target = join(root, ...e.path.split('/'))
    if (e.dir) {
      ensureDirs(root, e.path.split('/'))
      continue
    }
    ensureDirs(root, e.path.split('/').slice(0, -1))
    writeFileSync(target, e.data, { flag: 'wx', mode: 0o644 })
  }
}

// ── pages ─────────────────────────────────────────────────────────────────────

/**
 * Request every route of `routes` (`[{ id, path }]`) `passes` times (the last pass is the record) with at most
 * `concurrency` requests in flight, and return the routes with `stylesheets` (a 2xx HTML page's links), `status`
 * and `location` (a non-200 answer). A 5xx, a timeout or an oversized page aborts: the rest are cancelled and
 * awaited before the first error is thrown. Route order is kept.
 */
export async function crawlRoutes(routes, base, { passes = 2, concurrency = CAPTURE_LIMITS.concurrency, timeoutMs = CAPTURE_LIMITS.requestTimeoutMs, fetchImpl = fetch } = {}) {
  if (routes.length > CAPTURE_LIMITS.routes) throw new Error(`${routes.length} routes, over the ${CAPTURE_LIMITS.routes} bound`)
  const basePath = base.pathname.replace(/\/+$/, '')
  const urlOf = (r) => `${base.origin}${basePath}${r.path === '/' ? '/' : r.path}`
  const record = routes.map((r) => ({ ...r }))
  const ctl = new AbortController()
  let failure = null
  for (let pass = 1; pass <= passes; pass++) {
    let next = 0
    const worker = async () => {
      while (!ctl.signal.aborted) {
        const i = next++
        if (i >= routes.length) return
        try {
          const res = await fetchBounded(urlOf(routes[i]), { timeoutMs, maxBytes: CAPTURE_LIMITS.pageBytes, signal: ctl.signal, fetchImpl })
          if (res.status >= 500) throw new Error(`${urlOf(routes[i])}: the site answered ${res.status}`)
          if (pass === passes) {
            const r = record[i]
            delete r.stylesheets
            delete r.status
            delete r.location
            if (res.status !== 200) r.status = res.status
            if (res.status >= 300 && res.status < 400) {
              if (!res.location) throw new Error(`${urlOf(routes[i])}: a ${res.status} answer with no Location`)
              r.location = locationOf(res.location, base)
            }
            if (res.status >= 200 && res.status < 300) r.stylesheets = stylesheetLinks(res.body.toString('utf8'))
          }
        } catch (e) {
          failure ??= e
          ctl.abort()
          return
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, routes.length) }, worker))
    if (failure) throw failure
  }
  return record
}

// ── @imports the copied tree does not hold ────────────────────────────────────

/**
 * The files a compiled sheet's leading `@import`s name that `has(rel)` says the capture lacks, fetched from the site
 * (`base`) and handed to `store(rel, text)`; followed at most `CAPTURE_LIMITS.depth`-bounded, cycle-free, at most
 * `CAPTURE_LIMITS.imports` files. `sheets`: `[{ rel, text }]` capture-relative. An import that cannot be fetched
 * (a 404, a foreign origin, a condition, a path that is not plain) is reported in `gaps`, not fatal: the adapter
 * then reports the sheet as not fully read.
 */
export async function followImports(sheets, base, { has, store, timeoutMs = CAPTURE_LIMITS.requestTimeoutMs, fetchImpl = fetch, signal }) {
  const gaps = []
  const fetched = []
  const basePath = base.pathname.replace(/\/+$/, '') || '/'
  const seen = new Set()
  const visit = async (text, rel, chain) => {
    for (const imp of leadingImports(text).imports) {
      const gap = (why) => gaps.push({ sheet: rel, target: imp.target, why })
      if (imp.tail) {
        gap('conditional import')
        continue
      }
      const p = importPath(imp.target, rel, basePath)
      if (p.why) {
        gap(p.why)
        continue
      }
      if (chain.includes(p.rel) || seen.has(p.rel)) continue
      if (chain.length >= 4) {
        gap('imports nested deeper than 4')
        continue
      }
      seen.add(p.rel)
      let body = has(p.rel)
      if (body == null) {
        if (fetched.length >= CAPTURE_LIMITS.imports) {
          gap(`more than ${CAPTURE_LIMITS.imports} imported files`)
          continue
        }
        let res
        try {
          res = await fetchBounded(`${base.origin}${basePath === '/' ? '' : basePath}/${p.rel.split('/').map(encodeURIComponent).join('/')}`, { timeoutMs, maxBytes: CAPTURE_LIMITS.sheetBytes, signal, fetchImpl })
        } catch (e) {
          gap(e.message)
          continue
        }
        if (res.status !== 200) {
          gap(`the site answered ${res.status}`)
          continue
        }
        body = res.body.toString('utf8')
        store(p.rel, body)
        fetched.push(p.rel)
      }
      await visit(body, p.rel, [...chain, p.rel])
    }
  }
  for (const s of sheets) await visit(s.text, s.rel, [s.rel])
  return { fetched, gaps }
}
