#!/usr/bin/env node
// motion.mjs — the motion of a source page and its port, side by side: scroll-in reveals,
// carousels (slides, autoplay, nav, dots) and looping animations, each paired by the nearest
// heading. See lib/motion.mjs for why motion is both measured here and frozen everywhere else.
//
//   node scripts/visual/motion.mjs --source <origin> --site <origin> --routes /a,/b|<page-map.json>
//        [--source-prefix /index.php] [--width 1440] [--out <file.json>]
//
// The page is loaded, scrolled once to the bottom and back (so lazy carousels initialise), and
// read BEFORE anything is frozen: this tool is the one place where motion is the subject.
// A side that did not load (network error, HTTP ≥ 400) or failed after it loaded (scroll, measure,
// close, compare) is an `error` row naming the pair, never an empty inventory: "no motion" and
// "not measured" must not read the same. Exit 1 on any row; exit 2 on input that names nothing to
// measure (no page, a malformed route or origin, a page map that does not read).
//
// A page map pairs each page's site `path` with its `source.joomlaPath` (the WordPress slug follows
// the article alias, so the two differ); a page without one is read at `path` on both sides. The
// source address is resolved as visual-qa.mjs resolves a live source route (sourceUrlOf).
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { withBrowser } from '../lib/browser.mjs'
import { compareMotion, measureMotion } from '../lib/motion.mjs'
import { resolveSourceRoutes } from '../lib/source-routes.mjs'
import { routeProblem } from './preflight.mjs'
import { positiveInt, sourceUrlOf } from './visual-qa.mjs'

const USAGE = 'usage: motion.mjs --source <origin> --site <origin> --routes /a,/b|<page-map.json> [--source-prefix /index.php] [--width 1440] [--out file.json]'
// A route is joined to an origin, so it follows preflight's route rules: no other host, no dot
// segment, no query, fragment, backslash, whitespace or control character — the URL read must be
// the route declared.
const notRoute = (r) => {
  const why = routeProblem(r)
  return why && `${JSON.stringify(r)} is not a route (${why})`
}

/**
 * The route pairs a page map names, in page order: `{ site: path, source: source.joomlaPath ?? path }`
 * for every page that is not synthetic. A map with no measurable page, or a path that is not a
 * route, is an Error — never an empty run.
 */
export function routePairsOf(pageMap) {
  if (!Array.isArray(pageMap?.pages)) throw new Error('the page map has no "pages" array')
  const pairs = []
  pageMap.pages.forEach((p, i) => {
    if (p === null || typeof p !== 'object') throw new Error(`page ${i} is not an object`)
    if (p.synthetic) return
    if (notRoute(p.path)) throw new Error(`page ${i}: path ${notRoute(p.path)}`)
    const joomlaPath = p.source?.joomlaPath
    if (joomlaPath != null && notRoute(joomlaPath)) throw new Error(`page ${i} (${p.path}): source.joomlaPath ${notRoute(joomlaPath)}`)
    pairs.push({ site: p.path, source: joomlaPath ?? p.path })
  })
  if (!pairs.length) throw new Error('the page map names no page to measure (every page is synthetic)')
  return pairs
}

/** A route (`/a`, the same route on both sides) or a pair (`{ site, source }`) → the pair. */
function pairOf(route) {
  const pair = typeof route === 'string' ? { site: route, source: route } : route
  const why = notRoute(pair?.site) || notRoute(pair?.source)
  if (why) throw new Error(`route ${JSON.stringify(route)} is not a route or a { site, source } pair of routes: ${why}`)
  return pair
}

/** `--source`/`--site`: an http(s) origin, nothing after it — a route is appended to it as written. */
function httpOrigin(raw, name) {
  let u
  try {
    u = new URL(raw)
  } catch {
    throw new Error(`${name} ${raw} is not a URL`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`${name} ${raw} is not an http(s) URL`)
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error(`${name} ${raw} must be an origin like http://host:port, without path, query, fragment or credentials`)
  return u.origin
}

/** `--source-prefix`: '' or a plain path like /index.php (preflight's rule), no trailing slash. */
function sourcePrefix(prefix) {
  if (prefix === '') return prefix
  if (typeof prefix !== 'string' || !/^(\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)+$/.test(prefix) || routeProblem(prefix)) throw new Error(`--source-prefix ${prefix} must be a path like /index.php, without a trailing slash, of letters, digits and . _ ~ -`)
  return prefix
}

export function formatMarkdown(results) {
  const lines = ['# Motion — source vs site', '']
  for (const r of results) {
    const s = r.source
    const t = r.site
    const pair = `${r.route} (source ${r.sourceRoute ?? r.route})`
    const where = r.sourceUrl && r.siteUrl ? [`source ${r.sourceUrl} · site ${r.siteUrl}`] : []
    if (r.error) {
      lines.push(`## ${pair} — NOT MEASURED: ${r.error}`, ...where, '')
      continue
    }
    lines.push(`## ${pair} — reveals ${s.reveals}/${t.reveals} · carousels ${s.carousels}/${t.carousels} (autoplay ${s.autoplay}/${t.autoplay}) · loops ${s.loops}/${t.loops}`, ...where)
    for (const row of r.rows) lines.push(`- **${row.kind}** near "${row.near.slice(0, 60)}": ${row.source} → ${row.site}`)
    lines.push('')
  }
  return lines.join('\n')
}

const firstLine = (e) => String(e?.message ?? e).split('\n')[0]

/**
 * One side's inventory, or `{ status, error }`: a page that does not load, and any failure after it
 * loaded (opening the page, scrolling, measuring, closing it), is an error for this side — it never
 * ends the run without naming the pair it was measuring.
 */
async function inventory(browser, url, width) {
  let page = null
  let status = 0
  let result
  try {
    page = await browser.newPage({ viewport: { width, height: 900 } })
    let res
    try {
      res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
    } catch (e) {
      return { status: 0, error: `${url}: ${firstLine(e)}` }
    }
    status = res?.status() ?? 0
    if (status >= 400 || status === 0) return { status, error: `${url}: HTTP ${status}` }
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 30))
      }
      scrollTo(0, 0)
    })
    await page.waitForTimeout(300)
    result = { status, motion: await measureMotion(page) }
  } catch (e) {
    result = { status, error: `${url}: not measured (${firstLine(e)})` }
  } finally {
    if (page) {
      const closeError = await page.close().then(() => null, (e) => e)
      if (closeError && !result?.error) result = { status, error: `${url}: not measured (page did not close: ${firstLine(closeError)})` }
    }
  }
  return result
}

/**
 * Measure and compare every route on an open browser. `routes` holds routes (the same on both
 * sides) or `{ site, source }` pairs (routePairsOf). The source route goes under `prefix` (a Joomla
 * source serves its pages under /index.php; `/` stays `/`) and is resolved on `source` as
 * visual-qa.mjs resolves a live source route. One result per route, in route order: `route` is the
 * site route, `sourceRoute` the source route, `sourceUrl`/`siteUrl` the addresses read.
 */
export async function motionRoutes(browser, { source, site, routes, prefix = '', width = 1440 }) {
  if (!Array.isArray(routes) || !routes.length) throw new Error('no route to measure')
  const pairs = routes.map(pairOf)
  source = httpOrigin(source, '--source')
  site = httpOrigin(site, '--site')
  prefix = sourcePrefix(prefix)
  // no prefix given: a source without URL rewrite answers under /index.php — each route is resolved ON ITS OWN (one page may answer directly
  // and another under /index.php); a route that resolves nowhere keeps its address and fails as a source that answered 404, never as a guess
  const res = prefix ? null : await resolveSourceRoutes(source, [...new Set(pairs.map((p) => p.source))])
  // a host that answers 200 on `/` yet has no address for a route the map declares is a failure of the tool: that route's row says so (never a bare 404)
  const unresolved = new Map((res?.failed ?? []).map((f) => [f.route, f.reason]))
  const resolved = res?.results ?? null
  const out = []
  for (const { site: route, source: sourceRoute } of pairs) {
    const sourceUrl = resolved?.[sourceRoute]?.url ?? sourceUrlOf({ sourceRoute: sourceRoute === '/' ? '/' : prefix + sourceRoute }, { sourceSite: source })
    const siteUrl = `${site}${route}`
    const pair = { route, sourceRoute, sourceUrl, siteUrl }
    const a = await inventory(browser, sourceUrl, width)
    const b = await inventory(browser, siteUrl, width)
    let compared
    if (!a.error && !b.error) {
      try {
        compared = compareMotion(a.motion, b.motion)
      } catch (e) {
        b.error = `not compared (${firstLine(e)})`
      }
    }
    const lost = unresolved.get(sourceRoute)
    if (a.error || b.error || lost) {
      const error = [a.error && `source ${a.error}`, b.error && `site ${b.error}`, lost && `TOOL FAILURE: source route unresolved although ${source} answers 200 on / (${lost})`].filter(Boolean).join('; ')
      out.push({ ...pair, status: [a.status, b.status], error, ...(lost ? { unresolved: true } : {}), rows: [{ near: '(page)', kind: 'error', source: a.error ?? 'measured', site: b.error ?? 'measured' }] })
      continue
    }
    out.push({ ...pair, status: [a.status, b.status], ...compared, raw: { source: a.motion, site: b.motion } })
  }
  return out
}

/** `--routes`: a comma list of routes, or a page map (`.json`) read as route pairs. */
function readRoutes(arg) {
  if (!arg.endsWith('.json')) return arg.split(',').map(pairOf)
  let st
  try {
    st = statSync(arg)
  } catch (e) {
    throw new Error(`--routes ${arg}: ${e.code ?? e.message}`)
  }
  // A directory or a FIFO is refused before it is read: reading a FIFO waits for a writer forever.
  if (!st.isFile()) throw new Error(`--routes ${arg} is not a regular file`)
  let map
  try {
    map = JSON.parse(readFileSync(arg, 'utf8'))
  } catch (e) {
    throw new Error(`--routes ${arg}: ${e.message}`)
  }
  try {
    return routePairsOf(map)
  } catch (e) {
    throw new Error(`--routes ${arg}: ${e.message}`)
  }
}

/** The run's options, or an Error naming the input — checked before a browser starts. */
function parseArgs(argv) {
  const opt = (name, d) => {
    const i = argv.indexOf(name)
    if (i < 0) return d
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`)
    return v
  }
  const source = opt('--source')
  const site = opt('--site')
  const routesArg = opt('--routes')
  if (!source || !site || !routesArg) throw new Error(USAGE)
  const prefix = sourcePrefix(opt('--source-prefix', ''))
  const outFile = opt('--out')
  if (outFile !== undefined && !outFile.endsWith('.json')) throw new Error(`--out ${outFile} must end in .json (the Markdown goes beside it)`)
  return {
    source: httpOrigin(source, '--source'),
    site: httpOrigin(site, '--site'),
    routes: readRoutes(routesArg),
    prefix,
    width: positiveInt(opt('--width', 1440), '--width'),
    outFile
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let o
  try {
    o = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(`motion.mjs: ${e.message}`)
    process.exit(2)
  }
  try {
    const { source, site, routes, prefix, width, outFile } = o
    const results = await withBrowser((browser) => motionRoutes(browser, { source, site, routes, prefix, width }))
    if (outFile) {
      writeFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), source, site, sourcePrefix: prefix, width, results }, null, 2)}\n`)
      writeFileSync(outFile.replace(/\.json$/, '.md'), formatMarkdown(results))
    }
    console.log(formatMarkdown(results))
    process.exitCode = results.some((r) => r.rows.length) ? 1 : 0
  } catch (e) {
    console.error(`motion.mjs: ${e.message}`)
    process.exitCode = 1
  }
}
