#!/usr/bin/env node
// All the review scanners over all the routes, on ONE browser, N pages at a time.
//
//   node scripts/review/scan.mjs <base-url> --routes <a,b|file> --config <review.config.json>
//        [--tools leak,contrast,editability] [--theme <dir>] [--out review/scanners.json]
//        [--cache <dir>] [--no-cache] [--concurrency 4] [--min-ratio 3.0] [--leak-mode white]
//
// Before this script the Phase 8 loop was `for route; for tool; node review/<tool>.mjs` — 26
// processes for 13 pages, each launching its own Chromium. This runs the same scans by importing
// the same functions (leak-scan.mjs `scanLeaks`, contrast-audit.mjs `scanContrast`,
// editability.mjs `checkEditability`), so a verdict here IS the verdict the standalone script
// prints — the standalone scripts stay for debugging one page.
//
// Output: one line per (tool, route) in --routes order, `<tool> <route> {…}`, the same JSON the
// standalone script prints last; then a summary line and `--out` JSON. Exit 1 when any check is
// `fail`; `needs-review` alone exits 0 (a reviewer reads those, the gate does not block on them).
// A route that cannot be scanned (wrong status, missing expected selector, timeout) is a `fail`
// line carrying the error — never a missing line.
//
// `--cache <dir>` keys each verdict on the target HTML (fetched once per route), the tool's
// TOOL_VERSION, the theme's CSS fingerprint (lib/route-cache), the review config and the tool's
// options; a hit is reported `cached: true` and counted in the summary. `--no-cache` measures
// everything — the release run.
import fs from 'node:fs'
import path from 'node:path'
// runtime.mjs must load first: it reads and removes `--config` from argv at import.
import { config, configured, verdict, SCAN_PAGE, COVERAGE_MIN } from './runtime.mjs'
import { scanLeaks, TOOL_VERSION as LEAK_VERSION } from './leak-scan.mjs'
import { scanContrast, TOOL_VERSION as CONTRAST_VERSION } from './contrast-audit.mjs'
import { loadTheme, judgeEditability, TOOL_VERSION as EDITABILITY_VERSION } from './editability.mjs'
import { withBrowser, withPage, mapLimit, concurrencyFrom } from '../lib/browser.mjs'
import { RouteCache, cacheKey, themeFingerprint } from '../lib/route-cache.mjs'
import { exitOnInputError, inputDir, readRoutes } from '../lib/routes.mjs'

const args = process.argv.slice(2)
const base = args[0]
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i === -1 ? def : args[i + 1]
}
const usage =
  'usage: scan.mjs <base-url> --routes <a,b|file> --config <review.config.json> [--tools leak,contrast,editability] [--theme <dir>] [--out file] [--cache dir] [--no-cache] [--concurrency N]'
if (!base || !opt('--routes')) {
  console.error(usage)
  process.exit(2)
}
const TOOLS = {
  leak: { name: 'leak-scan', version: LEAK_VERSION, browser: true },
  contrast: { name: 'contrast-audit', version: CONTRAST_VERSION, browser: true },
  editability: { name: 'editability', version: EDITABILITY_VERSION, browser: false }
}
const tools = opt('--tools', 'leak,contrast')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)
for (const t of tools)
  if (!TOOLS[t]) {
    console.error(`unknown tool "${t}" — known: ${Object.keys(TOOLS).join(', ')}`)
    process.exit(2)
  }
// A --theme or --routes file that cannot be read is exit 2, never an empty theme that passes every run.
const themeDir = exitOnInputError(() => inputDir(args, '--theme'))
if (tools.includes('editability') && !themeDir) {
  console.error('editability needs --theme <theme dir>')
  process.exit(2)
}
const minRatio = opt('--min-ratio', '3.0')
const leakMode = opt('--leak-mode', 'white')
const out = opt('--out')
const concurrency = concurrencyFrom(args)
const cache = new RouteCache(opt('--cache'), { enabled: !args.includes('--no-cache') })

const routes = exitOnInputError(() => readRoutes(opt('--routes'))).map((r) => r.path)
const theme = themeDir ? loadTheme(themeDir) : null
const cssFingerprint = themeFingerprint(themeDir)
const configExtra = JSON.stringify(config)

// Target HTML per route, fetched once and shared by every tool's cache key. A fetch that fails
// is not fatal here — the browser tool will report the real failure on its own line.
const htmlOf = new Map()
async function targetHtml(route) {
  if (!htmlOf.has(route)) {
    htmlOf.set(
      route,
      fetch(new URL(route, base), { redirect: 'follow', signal: AbortSignal.timeout(60000) })
        .then((r) => r.text())
        .catch(() => null)
    )
  }
  return htmlOf.get(route)
}

const failVerdict = (url, error) => ({ ...verdict(url, 0, [], true), error })

async function runTool(browser, tool, route) {
  const url = new URL(route, base).toString()
  const html = await targetHtml(route)
  const spec = TOOLS[tool]
  const key =
    html === null
      ? null
      : cacheKey({
          targetHtml: html,
          toolVersion: spec.version,
          theme: tool === 'editability' ? theme.fingerprint : cssFingerprint,
          extra: { tool, config: configExtra, minRatio, leakMode }
        })
  const hit = key && cache.get(spec.name, key)
  if (hit) return { ...hit, cached: true }
  const started = Date.now()
  let v
  try {
    if (tool === 'editability') {
      v = judgeEditability(url, html ?? '', theme)
      if (html === null) v = failVerdict(url, 'fetch failed')
    } else {
      v = await withPage(browser, SCAN_PAGE, async (page) => {
        const r = tool === 'leak' ? await scanLeaks(page, url, leakMode) : await scanContrast(page, url, minRatio)
        return verdict(page.url(), r.examined, r.findings, r.examined < COVERAGE_MIN)
      })
    }
  } catch (e) {
    v = failVerdict(url, String(e.message))
  }
  const entry = { ...v, seconds: Math.round((Date.now() - started) / 100) / 10 }
  if (key && !entry.error) cache.put(spec.name, key, entry)
  return { ...entry, cached: false }
}

const jobs = []
for (const route of routes) for (const tool of tools) jobs.push({ route, tool })
const needsBrowser = tools.some((t) => TOOLS[t].browser)
const line = (job, v) => `${TOOLS[job.tool].name} ${job.route} ${JSON.stringify(stripMeta(v))}`
// The printed line is the standalone tool's JSON: status, url, examined, findings/… , configured.
function stripMeta({ cached, seconds, error, ...v }) {
  return error ? { ...v, error } : v
}
const run = (browser) =>
  mapLimit(jobs, concurrency, (job) => runTool(browser, job.tool, job.route), {
    onDone: (i, v) => {
      console.log(line(jobs[i], v))
      if (v.error) console.error(`ERR ${TOOLS[jobs[i].tool].name} ${jobs[i].route}: ${v.error}`)
    }
  })
const results = needsBrowser ? await withBrowser(run) : await run(null)

const entries = results.map((v, i) => ({ tool: TOOLS[jobs[i].tool].name, route: jobs[i].route, ...v }))
const summary = {
  total: entries.length,
  pass: entries.filter((e) => e.status === 'pass').length,
  needsReview: entries.filter((e) => e.status === 'needs-review').length,
  fail: entries.filter((e) => e.status === 'fail').length,
  cached: entries.filter((e) => e.cached).length
}
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  fs.writeFileSync(
    out,
    JSON.stringify(
      { base, generatedAt: new Date().toISOString(), configured, concurrency, tools: tools.map((t) => TOOLS[t].name), routes, summary, results: entries },
      null,
      2
    ) + '\n'
  )
}
console.log(
  `scan: ${summary.total} checks — ${summary.pass} pass, ${summary.needsReview} needs-review, ${summary.fail} fail, cached ${summary.cached}/${summary.total}${out ? ` → ${out}` : ''}`
)
process.exit(summary.fail ? 1 : 0)
