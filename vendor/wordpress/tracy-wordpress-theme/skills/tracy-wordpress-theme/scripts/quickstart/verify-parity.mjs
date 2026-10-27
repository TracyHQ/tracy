#!/usr/bin/env node
// Parity between two live stands — the build stand and a clean restore of its pack. An access
// check and three measurements, and the exit code is 0 only when all four pass:
//
//   access   the restore read the way the fleet reads it (lib.mjs probeWebroot): a probe written
//            root-owned through `--root-b` runs under wp-cli (`--wp-b`) and under the web server's
//            PHP (over HTTP at `--b`); both must be www-data (`--runtime-uid`, never root), a
//            root-owned 0600 canary must be unreadable (modes enforced), and wp-config.php, uploads,
//            the active theme and its parent — every entry of the webroot — must be readable. With
//            `--restore-report` (+ `--pack`) the restore report must be green and of this pack and
//            this stand: the pack's SHA256SUMS must hold (lib.mjs readPack), the manifest and both
//            archives on disk, measured, must be the hashes the manifest and the report's binding
//            name, and the binding's webroot, site URL and runtime uid must be --webroot-b, --b and
//            --runtime-uid (lib.mjs bindingProblems). The active theme (stylesheet, template) must
//            be read from --wp-b — and be the manifest's theme when --pack is given — or the probe
//            has not checked it.
//            Without `--wp-b` and `--root-b` the check has not run, and parity is not ok.
//
//   routes   HTTP status of every route on both sides (redirects are NOT followed: a 301 on one
//            side and a 200 on the other is a difference), held to the status the route is declared
//            to answer (lib.mjs routeExpectations: an explicit `status` or `view: "404"` in the page
//            map, else 200). A declared 404 page answering 404 on both stands matches; the same
//            undeclared 404, 500 or failed request on both does not.
//   counts   through the two wp runners: posts per type, categories, and the options that decide
//            what the front page is and which theme draws it.
//   styles   computed styles of a fixed selector set on four axes (light/dark × 1440/390), captured
//            with Playwright, dark applied the way scripts/shoot.mjs does (an init script sets the
//            hook before the page's own scripts run), compared with verify-render's diffSnapshots
//            and its colour tolerance. Fonts wait for document.fonts.ready. One browser, one
//            context per axis, `--concurrency` axes in flight (lib/browser.mjs); the snapshot maps
//            are keyed and ordered by axis, so a parallel run compares exactly what a serial one did.
//
// Writes parity.json. Usage:
//   node verify-parity.mjs --a <url> --b <url> --routes <page-map.json|routes.json|a,b,c>
//        [--wp-a "<runner>" --wp-b "<runner>"] [--out parity.json] [--tolerance 8]
//        [--dark-hook attr:data-theme=dark] [--viewports 1440x900,390x844] [--themes light,dark]
//        [--selectors "body,header,…"] [--skip-styles] [--concurrency 4]
//        [--root-b "<root runner>" --webroot-b /var/www/html --runtime-uid 33 --pack <dir> --restore-report <json>]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  cli,
  parseArgs,
  wpRunner,
  readRouteExpectations,
  isRenderableStatus,
  compareParity,
  rootRunner,
  anchorRoot,
  bindingProblems,
  normalSiteUrl,
  checkWebrootPath,
  probeWebroot,
  acquireLock,
  readPack,
  sha256File,
  UsageError
} from './lib.mjs'
import { diffSnapshots } from '../verify-render.mjs'
import { withBrowser, withPage, mapLimit, initScriptFor, DEFAULT_CONCURRENCY } from '../lib/browser.mjs'

// The dark hook grammar is lib/browser's — the same one scripts/shoot.mjs applies.
export { initScriptFor }

export const DEFAULT_SELECTORS = [
  'body',
  'header',
  'footer',
  'h1',
  'a',
  '.wp-block-button__link',
  '[class*="acm-"]'
]
const STYLE_PROPS = [
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'padding-top',
  'padding-bottom',
  'margin-top',
  'margin-bottom'
]
export const COUNT_TYPES = ['post', 'page', 'wp_navigation', 'wp_template_part', 'attachment']
export const COUNT_OPTIONS = [
  'show_on_front',
  'page_on_front',
  'blogname',
  'blogdescription',
  'template',
  'stylesheet'
]

const SPEC = {
  '--a': { placeholder: 'url', required: true, help: 'first stand (the source)' },
  '--b': { placeholder: 'url', required: true, help: 'second stand (the restore)' },
  '--routes': {
    placeholder: 'file|list',
    required: true,
    help: 'page-map.json, a routes JSON, or a comma list'
  },
  '--wp-a': { placeholder: 'runner', help: 'wp-cli runner for --a (counts are skipped without both)' },
  '--wp-b': { placeholder: 'runner', help: 'wp-cli runner for --b, as www-data (--user 33:33)' },
  '--root-b': { placeholder: 'runner', help: 'root runner on the --b webroot (restore.mjs --root-runner) — the access probe needs it' },
  '--webroot-b': { placeholder: 'path', default: '/var/www/html', help: 'the --b webroot as its runners see it' },
  '--runtime-uid': { placeholder: 'uid', default: '33', help: "the fleet's www-data: wp-cli and PHP on --b must run as it" },
  '--pack': { placeholder: 'dir', help: 'the pack --b was restored from (its manifest names the theme and the archive)' },
  '--restore-report': { placeholder: 'file', help: 'restore.mjs --report: must be ok, and of --pack\'s archive' },
  '--out': { placeholder: 'file', default: 'parity.json' },
  '--tolerance': { placeholder: 'N', default: '8', help: 'per-channel colour tolerance (verify-render)' },
  '--dark-hook': { placeholder: 'hook', default: 'attr:data-theme=dark', help: 'as scripts/shoot.mjs' },
  // A site that is dark by default draws dark on the light axis too unless it is told otherwise, and
  // two dark stands agree with each other — the light axis then measures nothing. The `cookie:` part
  // is a real request cookie set before the first navigation (lib/browser `lightHook`), for both stands.
  '--light-hook': { placeholder: 'hook', help: 'light pass of a site dark by default, e.g. cookie:tracy_theme=light (default none)' },
  '--viewports': { placeholder: 'WxH,…', default: '1440x900,390x844' },
  '--themes': { placeholder: 'a,b', default: 'light,dark' },
  '--selectors': { placeholder: 'css,…', default: DEFAULT_SELECTORS.join(',') },
  '--skip-styles': { value: false, help: 'routes and counts only (no browser)' },
  '--concurrency': { placeholder: 'N', default: String(DEFAULT_CONCURRENCY), help: 'axes in flight at once' }
}

/**
 * The access check on --b (see the header). Returns {ok, ran, runtimeUid, cli, http, problems};
 * a probe that could not run is a problem, never a pass.
 */
export async function checkAccess({ wp, root, webroot, siteUrl, runtimeUid, manifest = null, measured = null, packProblems = [], restoreReport = null, fetchImpl = fetch }) {
  const out = { ok: false, ran: false, runtimeUid, cli: null, http: null, binding: measured, problems: [...packProblems] }
  // The pack is measured, not taken from the manifest: a pack changed since the restore is not the
  // pack the restore report speaks for.
  if (manifest) {
    if (measured?.webrootArchive !== manifest.webroot?.sha256)
      out.problems.push(`the pack's archive ${manifest.webroot?.file} is ${measured?.webrootArchive ?? '(not measured)'}, its manifest says ${manifest.webroot?.sha256}`)
    if (measured?.databaseArchive !== manifest.database?.sha256)
      out.problems.push(`the pack's database ${manifest.database?.file} is ${measured?.databaseArchive ?? '(not measured)'}, its manifest says ${manifest.database?.sha256}`)
  }
  if (restoreReport) {
    if (!restoreReport.ok) out.problems.push(`the restore report says the restore did not finish${restoreReport.error ? `: ${restoreReport.error.split('\n')[0]}` : ''}`)
    if (!restoreReport.access?.afterRestore?.ok) out.problems.push('the restore report carries no passing access check')
    if (!manifest) out.problems.push('the restore report cannot be matched to a pack — pass --pack')
    else out.problems.push(...bindingProblems(restoreReport.binding, measured))
  }
  if (!wp || !root) {
    out.problems.push('the fleet access probe did not run — pass --wp-b and --root-b (the restore must be read as www-data)')
    return out
  }
  let at
  try {
    at = anchorRoot(root, webroot)
  } catch (e) {
    out.problems.push(`the root runner cannot write the access probe: ${e.message}`)
    return out
  }
  // The active theme is read, never assumed: an option wp-cli cannot read is a named failure, not a
  // probe that silently checks no theme.
  const themes = []
  for (const opt of ['stylesheet', 'template']) {
    const r = wp(['option', 'get', opt], { allowFail: true, raw: true })
    const value = (r?.stdout || '').trim()
    if (r?.status !== 0 || !value) out.problems.push(`wp-cli cannot read the active theme (option ${opt}${r?.status !== 0 ? ` exited ${r?.status}: ${(r?.stderr || '').trim().split('\n').slice(-1)[0]}` : ' is empty'})`)
    else themes.push(value)
  }
  if (manifest && themes.length && themes[0] !== manifest.theme.name) out.problems.push(`the active theme is ${themes[0]}, the pack's manifest says ${manifest.theme.name}`)
  if (manifest) themes.push(manifest.theme.name)
  const probe = await probeWebroot({ root: at, wp, webroot, themes: [...new Set(themes)], runtimeUid, siteUrl, fetchImpl })
  out.ran = true
  const brief = (p) => (p ? { euid: p.euid, user: p.user, sapi: p.sapi, entries: p.entries, themes: Object.keys(p.themes ?? {}) } : null)
  out.cli = brief(probe.cli)
  out.http = brief(probe.http)
  out.problems.push(...probe.problems)
  out.ok = out.problems.length === 0
  return out
}

/**
 * Whether a redirect from `asked` to `location` is WordPress's trailing-slash canonical of the same
 * page: a permanent redirect (301/308) on the same origin, to the same query, whose path differs
 * from the one asked only by one trailing `/`. A redirect to another origin, another query or
 * another path is not one, whatever its path looks like.
 */
function isSlashCanonical(status, asked, location) {
  if ((status !== 301 && status !== 308) || !location) return false
  let target
  try {
    target = new URL(location, asked)
  } catch {
    return false
  }
  return (
    target.origin === asked.origin &&
    target.search === asked.search &&
    (target.pathname === `${asked.pathname}/` || `${target.pathname}/` === asked.pathname)
  )
}

// `expected` (path → status) is the status each route is declared to answer (200 when it names
// none). A route declared to redirect is reported as the status it answers, never followed.
/**
 * The pack as it is on disk now, for the restore binding: readPack's manifest and its hash, and both
 * archives hashed again. Every file is read through lib.mjs readRegularBytes — a link is never
 * followed and a FIFO never waited on, including one put in place after readPack read the sums.
 */
export function measurePack(pack) {
  const { manifest, manifestSha } = readPack(pack)
  return {
    manifest,
    manifestSha,
    webrootArchive: sha256File(path.join(pack, manifest.webroot.file)),
    databaseArchive: sha256File(path.join(pack, manifest.database.file))
  }
}

export async function httpStatuses(base, routes, expected = new Map()) {
  const out = {}
  for (const r of routes) {
    try {
      const asked = new URL(r, base)
      let res = await fetch(asked, { redirect: 'manual', signal: AbortSignal.timeout(60000) })
      // WordPress canonicalises `/x` to `/x/` with a 301 on both stands; that is the same page,
      // and two stands agreeing on a 301 says nothing about what the page holds. Follow that
      // canonical once (isSlashCanonical), so the comparison (and the style probes downstream,
      // which only run on routes that answer their declared status) reaches the page. Any other
      // redirect, and any redirect the route is declared to answer, is reported as the status it is.
      const want = (expected instanceof Map ? expected.get(r) : expected?.[r]) ?? 200
      const declaredRedirect = want >= 300 && want < 400
      if (!declaredRedirect && isSlashCanonical(res.status, asked, res.headers.get('location'))) {
        await res.arrayBuffer()
        res = await fetch(new URL(res.headers.get('location'), asked), { redirect: 'manual', signal: AbortSignal.timeout(60000) })
      }
      out[r] = res.status
      await res.arrayBuffer()
    } catch (e) {
      out[r] = `error: ${e.message}`
    }
  }
  return out
}

function collectCounts(wp) {
  const counts = {}
  for (const t of COUNT_TYPES)
    counts[`post:${t}`] = wp.count(['post', 'list', `--post_type=${t}`, '--post_status=any'])
  counts['term:category'] = wp.count(['term', 'list', 'category'])
  for (const opt of COUNT_OPTIONS)
    counts[`option:${opt}`] = wp(['option', 'get', opt], { allowFail: true }).trim()
  return counts
}

// Snapshot of one page: { selector: { prop: value } } for every selector that matches.
const SNAPSHOT_FN = `(args) => {
  const out = {}
  for (const sel of args.selectors) {
    let el = null
    try { el = document.querySelector(sel) } catch { el = null }
    if (!el) continue
    const cs = getComputedStyle(el)
    const props = {}
    for (const p of args.props) { const v = cs.getPropertyValue(p); if (v && v.trim()) props[p] = v.trim() }
    if (Object.keys(props).length) out[sel] = props
  }
  return out
}`

// `expected` (path → status) is the status each route is declared to answer (200 when it names none):
// a stand whose response is not that status gives no snapshot for the axis.
export async function captureStyles({ a, b, routes, expected = {}, viewports, themes, darkHook, lightHook = null, selectors, concurrency = DEFAULT_CONCURRENCY }) {
  const snapshotFn = new Function('return ' + SNAPSHOT_FN)()
  const axes = []
  for (const [width, height] of viewports)
    for (const theme of themes) for (const route of routes) axes.push({ width, height, theme, route })
  const captureAxis = (browser) => async ({ width, height, theme, route }) =>
    withPage(browser, { viewport: { width, height }, theme, darkHook, lightHook, hookUrl: [a, b] }, async (page) => {
      const shoot = async (base) => {
        const url = new URL(route, base).toString()
        const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 })
        const want = (expected instanceof Map ? expected.get(route) : expected[route]) ?? 200
        if (!res || res.status() !== want) return null
        await page.evaluate(() => document.fonts.ready.then(() => undefined))
        await page.waitForTimeout(250)
        return page.evaluate(snapshotFn, { selectors, props: STYLE_PROPS })
      }
      const axis = `${route}|${width}|${theme}`
      try {
        return { axis, sa: await shoot(a), sb: await shoot(b) }
      } catch (e) {
        return { axis, error: e.message }
      }
    })
  const results = await withBrowser((browser) => mapLimit(axes, concurrency, captureAxis(browser)))
  const A = {}
  const B = {}
  const failures = []
  for (const r of results) {
    if (r.error) failures.push({ axis: r.axis, error: r.error })
    else {
      if (r.sa) A[r.axis] = r.sa
      if (r.sb) B[r.axis] = r.sb
    }
  }
  return { A, B, failures }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain)
  cli(async () => {
    const o = parseArgs(
      process.argv.slice(2),
      SPEC,
      'usage: verify-parity.mjs --a <url> --b <url> --routes <file|list> [--wp-a … --wp-b …] [--out parity.json] [options]'
    )
    let declared
    try {
      declared = readRouteExpectations(o.routes)
    } catch (e) {
      throw new UsageError(e.message)
    }
    const routes = declared.map((r) => r.path)
    const expected = new Map(declared.map((r) => [r.path, r.expected]))
    const viewports = o.viewports.split(',').map((v) => v.split('x').map(Number))
    const themes = o.themes.split(',')
    const selectors = o.selectors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const tolerance = Number(o.tolerance)
    const runtimeUid = Number(o.runtimeUid)
    if (!Number.isInteger(runtimeUid) || runtimeUid <= 0) throw new UsageError('--runtime-uid must be a uid other than 0')

    console.log(`==> access: ${o.b} read as the fleet reads it (www-data, uid ${runtimeUid})`)
    // A pack that does not hold together (sums, manifest, archive on disk) is an access failure
    // recorded in parity.json, not an exit that leaves no parity.json saying why.
    let manifest = null
    const webrootB = checkWebrootPath(o.webrootB)
    // what a restore report must be bound to (lib.mjs BINDING_KEYS): the pack as it is on disk now
    // and the stand this run probes
    const measured = { manifest: null, webrootArchive: null, databaseArchive: null, webroot: webrootB, siteUrl: normalSiteUrl(o.b), runtimeUid }
    const packProblems = []
    if (o.pack)
      try {
        const read = measurePack(o.pack)
        manifest = read.manifest
        measured.manifest = read.manifestSha
        measured.webrootArchive = read.webrootArchive
        measured.databaseArchive = read.databaseArchive
      } catch (e) {
        packProblems.push(`the pack ${o.pack} does not check out: ${e.message}`)
      }
    let restoreReport = null
    if (o.restoreReport)
      try {
        restoreReport = JSON.parse(readFileSync(o.restoreReport, 'utf8'))
      } catch (e) {
        packProblems.push(`the restore report ${o.restoreReport} cannot be read: ${e.message}`)
        restoreReport = { ok: false, error: 'unreadable restore report' }
      }
    const lock = o.rootB ? acquireLock(`${o.rootB}\n${webrootB}`) : null
    let access
    try {
      const wpB = o.wpB ? wpRunner(o.wpB) : null
      try {
        access = await checkAccess({ wp: wpB, root: o.rootB ? rootRunner(o.rootB) : null, webroot: webrootB, siteUrl: o.b, runtimeUid, manifest, measured, packProblems, restoreReport })
      } finally {
        wpB?.dispose()
      }
    } finally {
      lock?.release()
    }
    for (const p of access.problems) console.log(`  access: ${p}`)

    console.log(`==> ${routes.length} routes: HTTP status on both sides`)
    const a = { routes: await httpStatuses(o.a, routes, expected), counts: {}, styles: {} }
    const b = { routes: await httpStatuses(o.b, routes, expected), counts: {}, styles: {} }

    // A stand wp-cli cannot load (an unreadable wp-config.php) is a failed count, recorded with the
    // rest — not an exit that leaves no parity.json saying why.
    const countErrors = []
    if (o.wpA && o.wpB) {
      console.log('==> counts through wp-cli')
      for (const [side, runner, into] of [['a', o.wpA, a], ['b', o.wpB, b]])
        try {
          into.counts = collectCounts(wpRunner(runner))
        } catch (e) {
          countErrors.push({ side, error: e.message })
        }
    } else console.log('==> counts skipped (pass --wp-a and --wp-b)')

    let failures = []
    if (!o.skipStyles) {
      // a page to measure: a route answering its declared status on both stands, when that status
      // draws a page (200 or a declared error page — a redirect has no page of its own)
      const okRoutes = routes.filter((r) => isRenderableStatus(expected.get(r)) && a.routes[r] === expected.get(r) && b.routes[r] === expected.get(r))
      console.log(
        `==> computed styles: ${okRoutes.length} routes × ${viewports.length} viewports × ${themes.length} themes × ${selectors.length} selectors`
      )
      const cap = await captureStyles({
        a: o.a,
        b: o.b,
        routes: okRoutes,
        expected,
        viewports,
        themes,
        darkHook: o.darkHook,
        lightHook: o.lightHook ?? null,
        selectors,
        concurrency: Number(o.concurrency)
      })
      a.styles = cap.A
      b.styles = cap.B
      failures = cap.failures
    }

    const result = compareParity(a, b, { diff: diffSnapshots, tolerance, expected })
    const parity = {
      a: o.a,
      b: o.b,
      generatedAt: new Date().toISOString(),
      ok: result.ok && failures.length === 0 && countErrors.length === 0 && access.ok,
      access,
      routes: result.routes,
      counts: result.counts,
      countErrors,
      styles: {
        ...result.styles,
        viewports: o.viewports,
        themes,
        selectors,
        properties: STYLE_PROPS,
        tolerance,
        darkHook: o.darkHook,
        ...(o.lightHook ? { lightHook: o.lightHook } : {}),
        captureFailures: failures
      },
      summary: {
        routes: result.routes.length,
        routesMatching: result.routes.filter((r) => r.ok).length,
        routes200: result.routes.filter((r) => r.a === 200 && r.b === 200).length,
        counts: result.counts.length,
        countsMatching: result.counts.filter((c) => c.ok).length,
        axes: result.styles.axes,
        styleChecks: result.styles.checked,
        styleMismatches: result.styles.mismatches.length
      }
    }
    writeFileSync(o.out, JSON.stringify(parity, null, 2) + '\n')
    const s = parity.summary
    console.log(
      `parity: access ${access.ok ? 'ok' : `FAILED (${access.problems.length})`} · routes ${s.routesMatching}/${s.routes} match (${s.routes200} both 200) · counts ${s.countsMatching}/${s.counts} · styles ${s.styleMismatches} mismatches over ${s.styleChecks} checks on ${s.axes} axes → ${o.out}`
    )
    for (const r of result.routes.filter((r) => !r.ok)) console.log(`  route ${r.path}: ${r.a} vs ${r.b}, declared ${r.expected}`)
    for (const c of result.counts.filter((c) => !c.ok)) console.log(`  count ${c.name}: ${c.a} vs ${c.b}`)
    for (const m of result.styles.mismatches.slice(0, 40))
      console.log(`  style ${m.axis} ${m.selector} ${m.property}: ${m.a} vs ${m.b}`)
    for (const f of failures) console.log(`  capture failed ${f.axis}: ${f.error}`)
    for (const c of countErrors) console.log(`  counts on ${c.side} failed: ${c.error}`)
    return parity.ok ? 0 : 1
  })
