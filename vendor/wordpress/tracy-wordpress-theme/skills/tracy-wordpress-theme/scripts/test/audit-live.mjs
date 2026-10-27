#!/usr/bin/env node
// audit-live.mjs — a READ-ONLY reporter: it runs the production detectors against a live port and prints what each one found.
//
//   node scripts/test/audit-live.mjs --profile essence|impact --source <origin> --target <origin>
//        --out <dir> --timeout-seconds N [--widths 390,768,…] [--dossier <dir>[,<dir>]] [--fallback local-fixtures]
//
// The source is the Joomla site, the target the WordPress port. Every class is measured by the production code
// (visual/interaction-parity.mjs, review/content-audit.mjs, review/behavior-copy.mjs, lib/parity-acceptance.mjs) and ends as one of
//   found          the detector fired (its raw findings are listed)
//   none-found     measured, the detector found nothing (the raw measurements are kept)
//   not-measured   a route, a side, a state or the time budget was missing: never counted as none-found
// The script does not judge a finding: it never labels one real or false, and it does not reconcile against any other audit
// (an independent reconciliation is a follow-up: docs/follow-ups/audit-gates.md). Nothing is submitted and nothing is written to a site:
// a request that is not a read is aborted in the page, forms are filled and read, never sent. Local fixtures run ONLY when the live
// sites cannot be read, and are labelled `fallback`: they are never live evidence, and the exit status says so (3).
//
// Exit: 0 every step ran against the live sites and nothing was left unmeasured (findings do not change it); 1 a step failed or a state was not
// measured; 2 usage or input error; 3 the live sites were unreachable; 4 both hosts answer 200 on / but a route could not be resolved.
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UsageError, parseStrict } from '../lib/cli-args.mjs'
import { repoRootOf, resolveRecordPath } from '../lib/record-paths.mjs'
import { lazyBrowser } from '../lib/browser.mjs'
import { parseDecisions, readSmallFile, substitutionReport } from '../lib/parity-acceptance.mjs'
import { auditCmsLeftovers, auditListings } from '../review/content-audit.mjs'
import { auditBehaviorCopy } from '../review/behavior-copy.mjs'
import { checkOut, exceptionSurfaceErrors, originOf } from '../review/port-audit.mjs'
import { InputError } from '../lib/routes.mjs'
import { defaultFetchPage as fetchPageSafe, resolveSourceRoutes } from '../lib/source-routes.mjs'
import { DESKTOP_WIDTH, HEADER_WIDTHS, formFindings, headerFindings, measureDrawer, measureForms, measureHeader, measureInteractions, measureTouch, measureToggle } from '../visual/interaction-parity.mjs'

export const LIVE_TOOL = 'audit-live/1'
const FETCH_MS = 25000
const PROFILES = ['essence', 'impact']
const VALUES = ['--profile', '--source', '--target', '--widths', '--out', '--timeout-seconds', '--dossier', '--fallback']

/**
 * What each profile compares: the pages (site route ↔ source route), the hooks, and the dossier its acceptance files are read from.
 * A dossier is named from the root of the checkout this script runs in (lib/record-paths.mjs), never as one machine lays its
 * worktrees out; a dossier kept elsewhere (another checkout, a page group's root) is given with --dossier.
 */
const PROFILE = {
  impact: {
    siteHooks: { darkHook: 'cookie:tracy_theme=dark' },
    sourceHooks: { darkHook: 'attr:data-theme=dark' },
    pages: {
      home: { site: '/', source: '/' },
      contact: { site: '/contact', source: '/contact' },
      donation: { site: '/water-treatment-projects/', source: '/donations/water-treatment-projects' },
      event: { site: '/an-adventure-with-animals/', source: '/events/an-adventure-with-animals' },
      article: { site: '/charity-branding-is-yourbrand-digital-ready/', source: '/category-blog/charity-branding-is-yourbrand-digital-ready' },
      username: { site: '/username-reminder-request', source: '/username-reminder-request' },
      password: { site: '/password-reset', source: '/password-reset' },
      offline: { site: '/pages/j-page/offline-page', source: '/pages/j-page/offline-page' },
      error: { site: '/pages/j-page/error-page', source: '/pages/j-page/error-page' },
      blog: { site: '/blog', source: '/blog' },
      blogdetail: { site: '/charity-of-the-month-plan-international-uk/', source: '/pages/j-content/blog-detail' }
    },
    dossiers: ['tasks/ja-impact-wp7']
  },
  essence: {
    siteHooks: { darkHook: 'cookie:tracy_theme=dark' },
    sourceHooks: { darkHook: 'attr:data-theme=dark', lightHook: 'attr:data-theme=light', darkRequestHook: 'attr:data-theme=dark' },
    pages: {
      home: { site: '/', source: '/home/home-3' },
      contact: { site: '/contact', source: '/contact' },
      article: { site: '/detail/layout-1', source: '/detail/layout-1' },
      listing: { site: '/category/category-style-1', source: '/category/category-style-1' },
      resources: { site: '/resources', source: '/resources' },
      login: { site: '/pages/user/login-form', source: '/pages/user/login-form' }
    },
    dossiers: ['tasks/ja-essence-wp7']
  }
}

/** The dossier(s) a profile reads when --dossier is not given: those of the checkout that holds this script (`repoRoot`), as absolute paths. */
export function profileDossiers(profile, { repoRoot = repoRootOf(path.dirname(fileURLToPath(import.meta.url))) ?? process.cwd() } = {}) {
  return PROFILE[profile].dossiers.map((d) => resolveRecordPath(d, { repoRoot }))
}

/** The classes, each with the finding kinds of the production detector that owns it. */
export const CLASSES = Object.freeze([
  { id: 'drawer-overlap', kinds: ['drawer-overlap'] },
  { id: 'drawer-model', kinds: ['drawer-model', 'drawer-missing'] },
  { id: 'menu-contrast', kinds: ['menu-contrast'] },
  { id: 'drawer-submenu', kinds: ['drawer-submenu-missing', 'drawer-submenu-not-opened', 'drawer-submenu-children-missing', 'drawer-back-inert', 'drawer-back-duplicate', 'drawer-labels-differ'] },
  { id: 'touch', kinds: ['touch-not-opened', 'touch-target-small', 'touch-target-obstructed'] },
  { id: 'toggle', kinds: ['toggle-missing', 'toggle-first-click'] },
  { id: 'carousel', kinds: ['carousel-missing', 'carousel-controls-missing', 'carousel-unreachable'] },
  { id: 'header', kinds: ['header-height', 'header-control-position', 'header-control-missing', 'header-control-extra'] },
  { id: 'responsive-visibility', kinds: ['responsive-visibility'] },
  { id: 'label-wrap', kinds: ['label-wrap'] },
  { id: 'form-semantics', kinds: ['form-missing', 'form-extra-required', 'form-missing-required', 'form-control-missing', 'form-submit-blocked', 'form-disabled-indistinct'] },
  { id: 'current-section', kinds: ['nav-current-missing', 'nav-current-wrong', 'nav-current-extra'] },
  { id: 'cms-leftovers', kinds: [] },
  { id: 'behavior-copy', kinds: [] },
  { id: 'citations', kinds: [] },
  { id: 'listings', kinds: [] }
])

/** The dossier's exception errors grouped by what is wrong (not 987 lines): each group is a real acceptance defect of the dossier, not of the site. */
function groupErrors(errors) {
  const g = {}
  for (const e of errors) {
    const k = e.replace(/^[^:]*:\s*[^:]*?\]\s*(?:"[^"]*")?:?\s*/, '').replace(/\b[SD](?:-[a-z][a-z0-9]*)*-\d+/g, 'D-n').replace(/"[^"]*"/g, '"…"').slice(0, 120)
    g[k] = (g[k] ?? 0) + 1
  }
  return g
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** Individual, portable citation and substitution finding rows for the reconciler. */
export function citationFindingRows({ duplicates = [], substitutions = {}, fileErrors = [] } = {}) {
  return [
    ...duplicates.map((id) => ({ kind: 'decision-duplicate', id, file: 'DECISIONS.md' })),
    ...(substitutions.substitutions ?? []).filter((finding) => finding.status === 'open').map((finding) => ({ kind: 'substitution-open', ...finding })),
    ...(substitutions.unresolved ?? []).map((finding) => ({ kind: 'substitution-unresolved', ...finding })),
    ...(substitutions.errors ?? []).map((detail) => ({ kind: 'substitution-declaration-error', detail })),
    ...fileErrors.map(({ file, detail }) => ({ kind: 'citation-error', file, detail }))
  ]
}

// ─────────────────────────────────────────────── reading the sites
async function fetchPage(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_MS), headers: { 'user-agent': 'tracy-audit-live' } })
  return { status: res.status, html: await res.text(), url: res.url }
}

/** The first of the candidate URLs that answers 200 on `origin`, else null with what each answered. */
async function resolveUrl(origin, routes, tried) {
  for (const r of routes) {
    const url = new URL(r, origin).href
    try {
      const p = await fetchPage(url)
      tried.push(`${url} → ${p.status}`)
      if (p.status === 200 && new URL(p.url).origin === origin) return { url: p.url, html: p.html }
    } catch (e) {
      tried.push(`${url} → ${String(e.message).split('\n')[0]}`)
    }
  }
  return null
}

const steps = []
const JOIN_MS = 20000
const TIMED_OUT = Symbol('timed-out')
/**
 * One measuring step. `fn(sink, signal)` writes what it measured into its own `sink`; the sink is committed to the report only when the
 * step finished inside its budget. A step over its budget is stopped — its signal aborts and, for a browser step, the browser is closed
 * so the pending page calls reject — and JOINED (waited for) before the next step starts: a late probe can neither change the report nor
 * race the next step's browser. A step that is not joined, or timed out, stays explicitly incomplete.
 */
async function step(name, budgetMs, fn, { handle = null, commit = () => {} } = {}) {
  const t0 = Date.now()
  const rec = { name, ok: false, ms: 0 }
  steps.push(rec)
  const sink = { findings: [], notMeasured: [], raw: {}, extra: {} }
  const ac = new AbortController()
  const work = Promise.resolve().then(() => fn(sink, ac.signal))
  let timer
  try {
    const r = await Promise.race([work, new Promise((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), budgetMs) })])
    if (r === TIMED_OUT) {
      ac.abort()
      rec.reason = `over its ${Math.round(budgetMs / 1000)} s budget`
      if (handle) await handle.close().catch(() => {})
      let joinTimer
      const joined = await Promise.race([work.then(() => true, () => true), new Promise((resolve) => { joinTimer = setTimeout(() => resolve(false), JOIN_MS) })])
      clearTimeout(joinTimer)
      if (!joined) rec.reason += `; the probe did not stop within ${JOIN_MS / 1000} s`
    } else {
      commit(sink)
      rec.ok = true
    }
  } catch (e) {
    rec.reason = String(e.message).split('\n')[0].slice(0, 240)
  } finally {
    clearTimeout(timer)
  }
  rec.ms = Date.now() - t0
  return rec
}

const flat = (...lists) => lists.flat().filter(Boolean)

// ─────────────────────────────────────────────── the run
export async function runLive({ profile, source, target, widths, dossierDirs, deadline, log = () => {} }) {
  steps.length = 0
  const P = PROFILE[profile]
  const out = { tool: LIVE_TOOL, profile, source, target, startedAt: new Date().toISOString(), live: 'ran', pages: {}, findings: [], notMeasured: [], raw: {}, extra: {} }
  const left = () => Math.max(1000, deadline - Date.now())

  // 1 ── the pages, resolved on both sides (a route that answers anything but 200 is unavailable, not skipped)
  const resolved = {}
  const sourceRoutes = [...new Set(Object.values(P.pages).map((p) => p.source))]
  const sourceRes = await resolveSourceRoutes(source, sourceRoutes, { fetchPage: fetchPageSafe })
  out.sourceRouting = { prefix: sourceRes.prefix || null, homeStatus: sourceRes.homeStatus, via: Object.fromEntries(sourceRoutes.map((r) => [r, sourceRes.results[r].via])) }
  for (const [key, p] of Object.entries(P.pages)) {
    const tried = []
    const site = await resolveUrl(target, [p.site, p.site.endsWith('/') ? p.site.slice(0, -1) || '/' : `${p.site}/`], tried)
    const sr = sourceRes.results[p.source]
    tried.push(...sr.tried)
    const src = sr.url ? { url: sr.url, html: sr.html } : null
    out.pages[key] = { site: site?.url ?? null, source: src?.url ?? null, sourceVia: sr.via, route: p.site, ...(site && src ? {} : { unavailable: tried.slice(-4).join('; ') }) }
    if (site && src) resolved[key] = { id: key, route: new URL(site.url).pathname, siteUrl: site.url, sourceUrl: src.url, siteHtml: site.html, sourceHtml: src.html }
    else out.notMeasured.push({ check: 'pages', route: p.site, reason: `${!site ? 'site' : 'source'} did not answer 200 (${tried.slice(-3).join('; ')})` })
  }
  // both hosts answered 200 on `/` (main checked) yet a route has no source: the tool failed to resolve it
  out.toolFailure = sourceRes.failed.length ? { kind: 'route-resolution', routes: sourceRes.failed } : null
  const have = (...keys) => keys.filter((k) => resolved[k]).map((k) => resolved[k])
  const siteHooks = P.siteHooks
  const sourceHooks = P.sourceHooks
  const asSide = (url, hooks) => ({ url, ...hooks })

  // 2 ── reading checks (no browser): leftovers, behaviour copy, listings, decisions and exceptions
  const commit = (sink) => {
    out.findings.push(...sink.findings)
    out.notMeasured.push(...sink.notMeasured)
    Object.assign(out.raw, sink.raw)
    Object.assign(out.extra, sink.extra)
  }
  const run = (name, budget, fn, handle = null) => step(name, budget, fn, { handle, commit })
  const readable = Object.values(resolved)
  const byRoute = new Map(readable.map((r) => [r.route, r]))
  const routes = readable.map((r) => r.route)
  await run('cms-leftovers', Math.min(left(), 180000), async (sink) => {
    const r = await auditCmsLeftovers({ routes, fetchPage: async (route) => ({ status: 200, html: byRoute.get(route).siteHtml }) })
    sink.extra['cms-leftovers'] = { routes: r.routes, examined: r.examined, findings: r.findings, count: r.findings.length, unmeasured: r.unmeasured }
  })
  await run('behavior-copy', Math.min(left(), 180000), async (sink) => {
    const r = await auditBehaviorCopy({ routes, fetchPage: async (route) => ({ status: 200, html: byRoute.get(route).siteHtml }), reviews: [] })
    // the detector's own findings (a claim the page contradicts, an unreviewed false promise) AND the claims classified contradictory
    sink.extra['behavior-copy'] = { routes: routes.length, examined: r.examined, claims: r.claims, unmeasured: r.unmeasured ?? [], inventory: r.inventory.map((c) => ({ route: c.route, claim: c.claim, copy: c.copy, action: c.action, feature: c.feature, contradicts: c.contradicts })), findings: r.findings, contradicting: r.inventory.filter((c) => c.contradicts).length }
  })
  await run('listings', Math.min(left(), 120000), async (sink) => {
    const rows = have('home', 'blog', 'listing').map((r) => auditListings({ route: r.route, siteHtml: r.siteHtml, sourceHtml: r.sourceHtml }))
    sink.extra.listings = { routes: rows.map((r) => r.route), examined: rows.reduce((n, r) => n + r.examined, 0), findings: rows.flatMap((r) => r.findings) }
    for (const r of rows) if (r.unmeasured) sink.notMeasured.push({ check: 'listings', route: r.route, reason: r.unmeasured })
  })
  await run('citations', Math.min(left(), 60000), async (sink) => {
    const dossiers = []
    for (const dir of dossierDirs) {
      const rec = { dir, found: existsSync(dir), files: {}, findings: [] }
      if (rec.found) {
        const decisionsFile = path.join(dir, 'DECISIONS.md')
        try {
          const decisions = parseDecisions(readSmallFile(decisionsFile, 'DECISIONS.md'))
          rec.decisions = decisions.decisions.size
          rec.duplicates = [...(decisions.duplicates ?? [])].length
          const substitutions = substitutionReport(decisions)
          rec.substitutions = (({ substitutions, unresolved, errors, blocking }) => ({ declared: substitutions.length, unresolved: unresolved.length, errors: errors.length, blocking }))(substitutions)
          const citationErrors = []
          for (const f of ['visual.contract.json', 'review.config.json', 'parity-accepted.json']) {
            const file = path.join(dir, f)
            if (!existsSync(file)) { rec.files[f] = { unavailable: 'no such file' }; continue }
            try {
              const raw = readSmallFile(file, f)
              const json = JSON.parse(raw)
              const errors = exceptionSurfaceErrors(json, decisions, file)
              rec.files[f] = { errors: errors.length, groups: groupErrors(errors), examples: errors.slice(0, 4), sha256: sha256(Buffer.from(raw)) }
              citationErrors.push(...errors.map((detail) => ({ file: f, detail: detail.split(file).join(f).split(dir).join('<dossier>') })))
            } catch (e) {
              rec.files[f] = { unavailable: String(e.message).split('\n')[0] }
            }
          }
          rec.findings.push(...citationFindingRows({ duplicates: decisions.duplicates ?? [], substitutions, fileErrors: citationErrors }))
        } catch (e) {
          rec.unavailable = String(e.message).split('\n')[0]
        }
      }
      dossiers.push(rec)
    }
    sink.extra.citations = { dossiers }
  })

  // 3 ── browser checks, through the production functions; forms and single items first (the amendment classes). Each step takes the
  // browser when it starts: a step stopped over its budget closes it, and the next one launches its own.
  const handle = lazyBrowser()
  const home = have('home')[0]
  const needHome = () => {
    if (!home) throw new Error('the home page was not readable on both sides')
  }
  try {
    await run('forms', Math.min(left(), 240000), async (sink) => {
      const c = have('contact')[0]
      if (!c) throw new Error('the contact page was not readable on both sides')
      const browser = await handle.get()
      const [s, o] = await Promise.all([measureForms(browser, asSide(c.siteUrl, siteHooks)), measureForms(browser, asSide(c.sourceUrl, sourceHooks))])
      const r = formFindings({ route: c.route, site: s, source: o })
      sink.findings.push(...r.findings)
      sink.notMeasured.push(...r.notMeasured)
      sink.raw.forms = { examined: r.examined, mutationsBlocked: s.mutationsBlocked + o.mutationsBlocked, submitsBlocked: s.submitsBlocked + o.submitsBlocked, site: brief(s.forms), source: brief(o.forms) }
    }, handle)
    await run('single-items', Math.min(left(), 420000), async (sink) => {
      const browser = await handle.get()
      const raw = []
      for (const c of have('donation', 'event', 'article', 'blogdetail')) {
        const [s, o] = await Promise.all([measureHeader(browser, asSide(c.siteUrl, siteHooks), { width: DESKTOP_WIDTH }), measureHeader(browser, asSide(c.sourceUrl, sourceHooks), { width: DESKTOP_WIDTH })])
        const r = headerFindings({ route: c.route, site: s, source: o })
        sink.findings.push(...r.findings.filter((f) => /^nav-current/.test(f.kind)))
        raw.push({ route: c.route, source: o.nav?.current ?? null, site: s.nav?.current ?? null, siteMarked: s.nav?.marked ?? null })
      }
      sink.raw.currentSection = raw
      if (!raw.length) throw new Error('no single item (donation, event, article) was readable on both sides')
    }, handle)
    await run('header-tiers', Math.min(left(), 480000), async (sink) => {
      needHome()
      const browser = await handle.get()
      const raw = []
      let examined = 0
      for (const width of widths) {
        const [s, o] = await Promise.all([measureHeader(browser, asSide(home.siteUrl, siteHooks), { width }), measureHeader(browser, asSide(home.sourceUrl, sourceHooks), { width })])
        const r = headerFindings({ route: home.route, site: s, source: o })
        sink.findings.push(...r.findings.filter((f) => !/^nav-current/.test(f.kind)))
        sink.notMeasured.push(...r.notMeasured)
        examined += r.examined ?? 0
        const pick = (h) => (h.inventory ?? []).filter((x) => /donate|subscribe|join|contact|get started|apply/i.test(x.label)).map((x) => ({ label: x.label, shown: x.shown, lines: x.lines, w: x.w, h: x.h }))
        raw.push({ width, headerHeight: { source: o.header?.box.h ?? null, site: s.header?.box.h ?? null }, buttons: { source: pick(o), site: pick(s) } })
      }
      sink.raw.headerTiers = raw
      sink.extra['header-tiers'] = { examined, widths: raw.length }
    }, handle)
    // the production runner, for the interaction checks it owns: one step per check, so each class carries its own examined count
    const runCheck = (name, budget) =>
      run(name, Math.min(left(), budget + 60000), async (sink) => {
        needHome()
        const browser = await handle.get()
        const r = await measureInteractions({ browser, pages: [{ id: home.id, route: home.route, siteUrl: home.siteUrl, sourceUrl: home.sourceUrl }], siteHooks, sourceHooks, checks: [name], budgetMs: Math.min(left(), budget), headerWidths: [DESKTOP_WIDTH] })
        sink.findings.push(...r.findings)
        sink.notMeasured.push(...r.notMeasured)
        sink.extra[name] = { examined: r.examined, findings: r.findings.length, notMeasured: r.notMeasured.length }
      }, handle)
    await runCheck('drawer', 420000)
    await runCheck('touch', 150000)
    await runCheck('toggle', 100000)
    await runCheck('carousel', 150000)
    await runCheck('contrast', 240000)
    // raw measurements, kept beside each reading
    await run('raw', Math.min(left(), 240000), async (sink) => {
      needHome()
      const browser = await handle.get()
      const [ds, dsrc] = await Promise.all([measureDrawer(browser, asSide(home.siteUrl, siteHooks), { maxStates: 8 }), measureDrawer(browser, asSide(home.sourceUrl, sourceHooks), { maxStates: 8 })])
      sink.raw.drawer390 = { site: drawerBrief(ds), source: drawerBrief(dsrc) }
      const [ts, tsrc] = await Promise.all([measureTouch(browser, asSide(home.siteUrl, siteHooks), { width: 1024 }), measureTouch(browser, asSide(home.sourceUrl, sourceHooks), { width: 1024 })])
      sink.raw.touch1024 = { site: ts.controls ?? [], source: tsrc.controls ?? [], context: [ts.context, tsrc.context] }
      const [gs, gsrc] = await Promise.all([measureToggle(browser, asSide(home.siteUrl, siteHooks)), measureToggle(browser, asSide(home.sourceUrl, sourceHooks))])
      sink.raw.toggle = { site: { found: gs.found, initial: gs.initial?.theme, seq: gs.seq?.map((x) => x.theme) }, source: { found: gsrc.found, initial: gsrc.initial?.theme, seq: gsrc.seq?.map((x) => x.theme) } }
    }, handle)
  } finally {
    await handle.close().catch(() => {})
  }

  // 4 ── one status per class, from the raw detector output
  out.classes = CLASSES.map((c) => classStatus(c, out))
  out.steps = steps.map(({ name, ok, ms, reason }) => ({ name, ok, ms, ...(reason ? { reason } : {}) }))
  out.finishedAt = new Date().toISOString()
  // complete: every step ran, every route resolved, nothing was left unmeasured. Findings do not change it.
  out.complete = steps.every((x) => x.ok) && !out.toolFailure && out.notMeasured.length === 0 && out.classes.every((c) => c.status !== 'not-measured')
  return out
}

const brief = (forms) => (forms ?? []).map((f) => ({ submit: f.submit?.label, required: f.fields.filter((x) => x.required).map((x) => x.label), optional: f.fields.filter((x) => !x.required).map((x) => x.label), submitDisabledWithRequiredSet: f.state1?.disabled, unlockedBy: f.unlockedBy, disabledStyle: f.disabledStyle && { opacity: f.disabledStyle.opacity, cursor: f.disabledStyle.cursor }, enabledStyle: f.enabledStyle && { opacity: f.enabledStyle.opacity, cursor: f.enabledStyle.cursor } }))
const drawerBrief = (d) => ({ measured: d.measured, states: (d.states ?? []).map((s) => ({ path: (s.labels ?? []).join(' > ') || 'root', model: s.model, children: s.children?.length ?? 0, declared: s.declared?.length ?? 0, claims: s.claims ?? null, error: s.error })) })

/** The step whose probe owns a class. */
const STEP_OF = {
  'drawer-overlap': 'drawer', 'drawer-model': 'drawer', 'drawer-submenu': 'drawer', 'menu-contrast': 'contrast', touch: 'touch', toggle: 'toggle', carousel: 'carousel',
  header: 'header-tiers', 'responsive-visibility': 'header-tiers', 'label-wrap': 'header-tiers', 'form-semantics': 'forms', 'current-section': 'single-items',
  'cms-leftovers': 'cms-leftovers', 'behavior-copy': 'behavior-copy', citations: 'citations', listings: 'listings'
}
const NOT_MEASURED_CHECK = { 'form-semantics': ['form'], 'drawer-submenu': ['drawer'], 'drawer-overlap': ['drawer'], 'drawer-model': ['drawer'], touch: ['touch'], toggle: ['toggle'], carousel: ['carousel'], header: ['header'], 'responsive-visibility': ['header'], 'label-wrap': ['header'], 'menu-contrast': ['contrast'], listings: ['listings'] }

/** found | none-found | not-measured, from the detector's own output: a class is none-found only when its detector examined something and left nothing unmeasured. */
function classStatus(c, out) {
  const stepRec = steps.find((x) => x.name === STEP_OF[c.id])
  const base = { id: c.id, kinds: c.kinds }
  const notMeasured = (reason, extra = {}) => ({ ...base, status: 'not-measured', reason, ...extra })
  if (!stepRec?.ok) return notMeasured(stepReason(STEP_OF[c.id]))
  const found = out.findings.filter((f) => c.kinds.includes(f.kind))
  const unmeasured = out.notMeasured.filter((n) => (NOT_MEASURED_CHECK[c.id] ?? []).includes(n.check))
  const clean = (examined, measurements) => (examined > 0 ? { ...base, status: 'none-found', measurements: { examined, ...measurements } } : notMeasured('the detector examined nothing', { measurements }))
  if (c.id === 'cms-leftovers') {
    const e = out.extra['cms-leftovers']
    if (e.count) return { ...base, status: 'found', findings: e.count, examples: e.findings.slice(0, 4).map((f) => ({ route: f.route, token: f.token, region: f.region, text: f.text })) }
    if (e.unmeasured.length) return notMeasured(`${e.unmeasured.length} route(s) unmeasured`)
    return e.routes ? clean(e.examined, { routes: e.routes }) : notMeasured('no route was read')
  }
  if (c.id === 'behavior-copy') {
    const e = out.extra['behavior-copy']
    const count = e.findings.length + e.contradicting
    if (count) return { ...base, status: 'found', findings: count, examples: [...e.findings.slice(0, 4), ...e.inventory.filter((x) => x.contradicts).slice(0, 4)] }
    if (e.unmeasured.length) return notMeasured(`${e.unmeasured.length} route(s) unmeasured`)
    return clean(e.examined, { claims: e.claims, inventory: e.inventory.slice(0, 6) })
  }
  if (c.id === 'listings') {
    const e = out.extra.listings
    if (e.findings.length) return { ...base, status: 'found', findings: e.findings.length, examples: e.findings.slice(0, 4) }
    if (!e.routes.length) return notMeasured('no listing page was readable on both sides')
    if (unmeasured.length) return notMeasured(`${unmeasured.length} listing(s) not measured: ${unmeasured[0].reason}`)
    return clean(e.examined, { routes: e.routes })
  }
  if (c.id === 'citations') {
    const e = out.extra.citations
    const present = e.dossiers.filter((d) => d.found)
    if (!present.length) return notMeasured(`no dossier exists among ${e.dossiers.map((d) => d.dir).join(', ')}`)
    // every input must have been read: an unreadable or missing DECISIONS.md or acceptance file is an input gap, never zero errors
    const gaps = present.flatMap((d) => (d.unavailable ? [`${d.dir}: ${d.unavailable}`] : Object.entries(d.files).filter(([, f]) => f.unavailable).map(([name, f]) => `${d.dir}/${name}: ${f.unavailable}`)))
    const count = (d) => Object.values(d.files).reduce((n, f) => n + (f.errors ?? 0), 0) + (d.duplicates ?? 0) + (d.substitutions?.blocking ?? 0)
    const total = present.reduce((n, d) => n + count(d), 0)
    const view = present.map((d) => ({ dir: d.dir, decisions: d.decisions, duplicates: d.duplicates, substitutions: d.substitutions, files: d.files }))
    if (total) return { ...base, status: 'found', findings: total, dossiers: view, ...(gaps.length ? { gaps } : {}) }
    if (gaps.length) return notMeasured(`${gaps.length} dossier input(s) unreadable or missing: ${gaps[0]}`, { dossiers: view })
    return clean(present.reduce((n, d) => n + (d.decisions ?? 0), 0), { dossiers: view })
  }
  if (found.length) return { ...base, status: 'found', findings: found.length, examples: found.slice(0, 4) }
  if (unmeasured.length) return notMeasured(`${unmeasured.length} state(s) not measured: ${unmeasured[0].reason}`)
  const own = out.extra[STEP_OF[c.id]]
  const raw = { 'drawer-submenu': out.raw.drawer390, 'drawer-overlap': out.raw.drawer390, 'drawer-model': out.raw.drawer390, touch: out.raw.touch1024, toggle: out.raw.toggle, 'form-semantics': out.raw.forms, 'current-section': out.raw.currentSection, header: out.raw.headerTiers, 'responsive-visibility': out.raw.headerTiers, 'label-wrap': out.raw.headerTiers }[c.id]
  const examined = c.id === 'form-semantics' ? out.raw.forms?.examined : c.id === 'current-section' ? out.raw.currentSection?.length : own?.examined
  return clean(examined ?? 0, raw ? { raw } : {})
}

function stepReason(name) {
  const s = steps.find((x) => x.name === name)
  return s ? (s.reason ?? 'the step did not finish') : 'the step did not run'
}

/** The pieces the reporter tests drive directly. */
export const liveInternals = { step, steps, classStatus, publish, JOIN_MS }

// ─────────────────────────────────────────────── local fallback (never live evidence)
async function runFallback() {
  const { fixtureServer } = await import('./audit-fixture.mjs')
  const { drawerFindings: dFind, measureDrawer: mDraw } = await import('../visual/interaction-parity.mjs')
  const server = await fixtureServer()
  const handle = lazyBrowser()
  try {
    const browser = await handle.get()
    const src = await mDraw(browser, { url: `${server.origin}/drawer/src` })
    const bad = await mDraw(browser, { url: `${server.origin}/drawer/noopen` })
    const r = dFind({ route: '/', site: bad, source: src, theme: 'light' })
    return { note: 'local fixtures only — NOT evidence about the live sites', drawerSubmenuDetectorFires: r.findings.some((f) => f.kind === 'drawer-submenu-not-opened') }
  } finally {
    await handle.close().catch(() => {})
    await server.close()
  }
}

// ─────────────────────────────────────────────── publication
/** Refuses an --out whose directory, or any directory above it, is a link or not a directory — the report could be published elsewhere. */
function checkOutDir(dir) {
  try {
    const st = lstatSync(dir)
    if (!st.isDirectory()) throw new InputError(`--out ${dir}: exists and is not a directory (a symlink is refused too)`)
    checkOut(path.join(dir, 'live-report.json')) // every ancestor and the directory itself
  } catch (e) {
    if (e instanceof InputError) throw e
    if (e.code !== 'ENOENT') throw new InputError(`--out ${dir}: ${e.message}`)
    checkOut(dir) // not there yet: every ancestor it will be created under
  }
}

/**
 * Publishes one complete generation: both files are written to temporary names first, then moved into place together. A failure on the
 * second move puts the first back, so a mixed report (new JSON beside an old REPORT.md) is never left behind.
 */
function publish(dir, report) {
  checkOutDir(dir)
  mkdirSync(dir, { recursive: true })
  checkOutDir(dir)
  const cell = (x, n) => String(x ?? '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, n)
  const rows = (report.classes ?? []).map((c) => `| ${c.id} | **${c.status}** | ${c.findings ?? ''} | ${cell(c.reason, 120)} |`)
  const md = [`# ${report.profile} — detector report (${report.live})`, '', `source ${report.source} · target ${report.target} · ${report.finishedAt ?? ''}`, '', 'What each production detector found. Nothing here is a judgement: a finding is raw detector output (live-report.json).', '', '| class | status | findings | note |', '|---|---|---|---|', ...rows, '']
  if (report.notMeasured?.length) md.push(`## Not measured (${report.notMeasured.length})`, '', ...report.notMeasured.slice(0, 60).map((n) => `- ${cell([n.check, n.route, n.width ? `${n.width}px` : '', n.theme, n.control].filter(Boolean).join(' '), 90)}: ${cell(n.reason, 200)}`), '')
  if (report.fallback) md.push(`Fallback: ${JSON.stringify(report.fallback)}`, '')
  const files = [['live-report.json', `${JSON.stringify(report, null, 2)}\n`], ['REPORT.md', md.join('\n')]]
  const stamp = `${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const staged = []
  const moved = []
  try {
    for (const [name, text] of files) {
      const tmp = path.join(dir, `.${name}.${stamp}.tmp`)
      writeFileSync(tmp, text, { flag: 'wx' })
      staged.push([name, tmp])
    }
    for (const [name, tmp] of staged) {
      const dest = path.join(dir, name)
      const bak = path.join(dir, `.${name}.${stamp}.bak`)
      let hadOld = true
      try {
        renameSync(dest, bak)
      } catch (e) {
        if (e.code !== 'ENOENT') throw e
        hadOld = false
      }
      moved.push({ dest, bak, hadOld })
      renameSync(tmp, dest)
    }
  } catch (e) {
    for (const m of moved.reverse()) {
      try {
        if (m.hadOld) renameSync(m.bak, m.dest)
        else rmSync(m.dest, { force: true })
      } catch { /* best effort: the temporary copy stays named */ }
    }
    for (const [, tmp] of staged) rmSync(tmp, { force: true })
    throw e
  }
  for (const m of moved) if (m.hadOld) rmSync(m.bak, { force: true })
}

export async function main(argv) {
  let args
  try {
    args = parseStrict(argv, { values: VALUES })
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    console.error(`audit-live: ${e.message}`)
    return 2
  }
  let cfg
  try {
    for (const need of ['--profile', '--source', '--target', '--out', '--timeout-seconds']) if (!args.has(need)) throw new InputError(`audit-live: ${need} is required`)
    const profile = args.opt('--profile')
    if (!PROFILES.includes(profile)) throw new InputError(`--profile must be one of ${PROFILES.join(', ')}`)
    const source = originOf(args.opt('--source'), '--source')
    const target = originOf(args.opt('--target'), '--target')
    if (source === target) throw new InputError('--source and --target are the same origin: nothing to compare')
    const seconds = Number(args.opt('--timeout-seconds'))
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 7200) throw new InputError('--timeout-seconds must be an integer between 30 and 7200')
    const widths = args.has('--widths') ? args.opt('--widths').split(',').map((x) => (/^\d+$/.test(x) ? Number(x) : NaN)) : [...HEADER_WIDTHS]
    if (!widths.length || widths.some((w) => !Number.isInteger(w) || w < 240 || w > 3840) || new Set(widths).size !== widths.length) throw new InputError('--widths must be unique integers between 240 and 3840')
    if (args.has('--fallback') && args.opt('--fallback') !== 'local-fixtures') throw new InputError('--fallback must be local-fixtures')
    const dossierDirs = args.has('--dossier') ? args.opt('--dossier').split(',').filter(Boolean).map((d) => path.resolve(d)) : profileDossiers(profile)
    const out = path.resolve(args.opt('--out'))
    checkOutDir(out)
    cfg = { profile, source, target, widths, dossierDirs, out, seconds, fallback: args.has('--fallback') }
  } catch (e) {
    if (!(e instanceof InputError)) throw e
    console.error(e.message)
    return 2
  }

  const deadline = Date.now() + cfg.seconds * 1000
  // live or not: one cheap read of each side first
  const reach = async (origin) => {
    try {
      return (await fetchPage(`${origin}/`)).status === 200
    } catch {
      return false
    }
  }
  const [a, b] = await Promise.all([reach(cfg.target), reach(cfg.source)])
  if (!a || !b) {
    const report = { tool: LIVE_TOOL, profile: cfg.profile, source: cfg.source, target: cfg.target, live: 'unavailable', reason: `${!a ? cfg.target : ''} ${!b ? cfg.source : ''} did not answer 200`.trim(), classes: CLASSES.map((c) => ({ id: c.id, status: 'not-measured', reason: 'the live sites were not reachable' })), finishedAt: new Date().toISOString() }
    if (cfg.fallback) report.fallback = await runFallback().catch((e) => ({ failed: String(e.message).split('\n')[0] }))
    publish(cfg.out, report)
    console.error(`audit-live: live sites unreachable (${report.reason}); local fixtures are not live evidence`)
    return 3
  }
  const watchdog = setTimeout(() => {
    console.error('audit-live: the time budget ran out')
  }, cfg.seconds * 1000).unref()
  let report
  try {
    report = await runLive({ ...cfg, dossierDirs: cfg.dossierDirs, deadline })
  } finally {
    clearTimeout(watchdog)
  }
  publish(cfg.out, report)
  for (const c of report.classes) console.log(`${c.status.padEnd(11)} ${c.id}${c.findings ? ` (${c.findings})` : ''}${c.reason ? ` — ${c.reason}` : ''}`)
  console.log(`steps: ${report.steps.map((s) => `${s.name}${s.ok ? '' : ' FAILED'}`).join(', ')}`)
  if (report.toolFailure) console.error(`audit-live: TOOL FAILURE — both hosts answer 200 on / but ${report.toolFailure.routes.length} route(s) could not be resolved: ${report.toolFailure.routes.map((r) => r.route).join(', ')}`)
  return report.toolFailure ? 4 : report.complete ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2))
