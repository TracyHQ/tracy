/**
 * `tracy_design_check` — the pure half: what the tool answers from a site's design record and a
 * probe of one of its pages (ADR 0023). The other half (`index.ts`) resolves the site, opens the
 * page in the site's own browser (`BROWSER_SCRIPT` in `styles` mode) and writes the report file.
 *
 * ALWAYS `ok: true` (ADR 0022 §2 — a warning, never a refusal): a site wearing no system, a browser
 * that cannot run, and a page that drifted are all ANSWERS, each with a `next` the agent can act
 * on. No refusal code is added here, so `check-refusal-next` has nothing new to map.
 */
import { checkNext, judge, paletteOf } from '@tracy/site-build-core/design-check'

import { hostBrowserTarget, looksLikeMissingBinary, parseBrowser } from './exec.mjs'

/**
 * One page's style probe, from the site's own browser — or, where the site's container has none,
 * from dsh's.
 *
 * 🔒 WHY DSH'S BROWSER, AND NOT A BROWSER IN THE SITE (Lee, 29/09/2026: "missing → install it,
 * wherever is sensible"). Every Joomla site runs the stock `joomla:6-apache` image: no node, no
 * chromium, so the in-container probe could never run and the tool answered DESIGN_CHECK_SKIPPED on
 * every Joomla site. Installing chromium there would put ~500 MB into EVERY customer site (chromium
 * 374 MB + node 117 MB, as measured in `tracy/web-wordpress`), on an image Tracy does not build, and
 * anything installed into a running container is gone the next time compose recreates it. dsh already ships a chromium (`tracy-chrome`, the one
 * the build's `shot` stage probes styles with), so the check runs there instead — nothing grows.
 *
 * 🔒 IT STAYS ONE SITE, AND DSH'S NETWORKS STAY OUT OF REACH. dsh is NOT on the sites' network on a
 * fleet host (`host-dsh.yml`: `docker-api` + `egress` only), and it must not be: dsh sits beside the
 * docker socket proxy. So the host browser dials nothing at all (`BROWSER_SCRIPT` host mode: no name
 * resolves, every connection goes to a dead proxy, page scripts are off) and every document and
 * stylesheet it loads is fetched by THAT site container's own curl on its loopback — the road
 * page.text's read already takes. The address and origin are the in-container ones, so the off-site
 * guard compares against the same origin; a request to any other origin is failed, not continued.
 *
 * @param {object} input
 * @param {{ url: string, origin: string, container: string, resolverRule: string, via: string }} input.target
 * @param {(target: { url: string, origin: string, container: string, resolverRule: string, via: string }) => Promise<Run>} input.runInContainer
 * @param {(target: { url: string, origin: string, container: string, via: string }, chrome: string) => Promise<Run>} input.runOnHost
 * @param {string | null} input.hostChrome
 * @returns {Promise<{ ok: true, probe: { href: string, seen: number, samples: any[] }, browser: 'site' | 'host' } | { ok: false, why: string }>}
 * @typedef {{ code: number | null, stdout: string, stderr: string, timedOut: boolean, spawnError?: string }} Run
 */
export async function measurePage({ target, runInContainer, runOnHost, hostChrome }) {
  /** @type {'site' | 'host'} */
  let browser = 'site'
  let run = await runInContainer(target)
  let parsed = parseBrowser(run.stdout)
  if (looksLikeMissingBinary(run) || (!parsed.ok && parsed.kind === 'no-browser')) {
    if (!hostChrome) return { ok: false, why: 'no browser in this site container, and none in dsh' }
    const pinned = hostBrowserTarget(target)
    if (pinned === null)
      return { ok: false, why: 'the page is served on a route dsh cannot pin to this site' }
    browser = 'host'
    run = await runOnHost(pinned, hostChrome)
    parsed = parseBrowser(run.stdout)
    if (!parsed.ok && parsed.kind === 'no-browser') return { ok: false, why: "dsh's browser did not start" }
  }
  if (!parsed.ok)
    return {
      ok: false,
      why: parsed.kind === 'offsite' ? `the page left the site for ${parsed.error}` : parsed.error
    }
  if (!(run.code === 0 && !run.spawnError && !run.timedOut))
    return { ok: false, why: 'the browser did not finish cleanly' }
  let probe = null
  try {
    probe = JSON.parse(parsed.dom)
  } catch {
    probe = null
  }
  if (!probe || typeof probe !== 'object' || !Array.isArray(probe.samples))
    return { ok: false, why: 'the style probe returned nothing' }
  return { ok: true, probe, browser }
}

/** The paths one call may measure. */
export const MAX_PATHS = 3

export const DESIGN_CHECK_DESCRIPTION =
  'Measure this site against the design system it wears (docs/agents/design.json, or the design-system ' +
  "slot the site context's Design system line names): opens a page in the " +
  "site's own browser (dsh's, with the page's scripts off, where the site has none; that run answers " +
  'browser:"host" and a `note`: elements a script builds are not counted there, so its score can ' +
  "differ from the build's) and compares every " +
  "visible element's computed colour and font-family with the " +
  "system's tokens, by value. Answers ok:true always, with `score` (0–100), `warnings` — " +
  'OFF_PALETTE_COLOR {prop, value, band: off|near, nearest: {token, distance}, count, where}, ' +
  'OFF_SYSTEM_FONT {family, count, where}, NO_DESIGN_BOUND (this site wears no system the catalogue ' +
  'can name), DESIGN_CHECK_SKIPPED {why} (the browser could not measure) — and `next`, the one thing ' +
  "to do. A look change is measured for you (in a tracy_site write's answer, or a notice after a " +
  'stylesheet edit or site.rebuild); call this when that measure was skipped, for another page, or ' +
  'after fixing what it named. Params: path (default "/"), or paths (up to 3). Warnings are advice: fix what is real.'

export const DESIGN_CHECK_PARAMETERS = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'The page to measure, e.g. "/" or "/about". Default "/".' },
    paths: {
      type: 'array',
      items: { type: 'string' },
      description: `Up to ${MAX_PATHS} pages to measure in one call; overrides path.`
    },
    siteKey: {
      type: 'string',
      description:
        'Leave this out: the call acts on the site THIS conversation belongs to. Naming another site ' +
        'is refused (SITE_OUTSIDE_CONVERSATION).'
    }
  }
}

/**
 * The pages a call names, or the one problem with them.
 * @param {unknown} args
 * @returns {{ ok: true, paths: string[], siteKey: string | null } | { ok: false, code: 'BAD_PATH', error: string }}
 */
export function designCheckPaths(args) {
  const a = args && typeof args === 'object' ? /** @type {Record<string, unknown>} */ (args) : {}
  const raw = Array.isArray(a.paths) && a.paths.length > 0 ? a.paths : [a.path ?? '/']
  /** @type {string[]} */
  const paths = []
  for (const p of raw.slice(0, MAX_PATHS)) {
    const s = typeof p === 'string' ? p.trim() : ''
    if (s === '' || !s.startsWith('/') || s.startsWith('//') || /[\s<>"']/.test(s))
      return {
        ok: false,
        code: 'BAD_PATH',
        error: `"${String(p)}" is not a path on this site; give one that starts with "/".`
      }
    paths.push(s)
  }
  return { ok: true, paths, siteKey: typeof a.siteKey === 'string' && a.siteKey !== '' ? a.siteKey : null }
}

/**
 * The answer for a site whose record names no system (or has no record at all).
 * @param {{ id?: string | null, source?: string } | null} design
 */
export function noDesignAnswer(design) {
  return {
    ok: true,
    checked: false,
    design: design && typeof design.id === 'string' ? { id: design.id, source: design.source } : null,
    warnings: [{ code: 'NO_DESIGN_BOUND' }],
    next:
      'This site wears no design system the catalogue can name, so there is no palette to measure against. ' +
      "Keep to the theme's own variables; to bind a system, create the site from a design template."
  }
}

/**
 * The answer when the page could not be measured — the browser is missing, the page did not load,
 * the address left the site. Still ok: nothing was written, nothing is wrong with the site.
 *
 * A site wearing a design-system slot (`source: "slot"`, `ds-slot-worn.mjs`) has no design.json to
 * compare by hand: the answer names the slot and where it lives instead (`slotWhere`), never a file
 * the site does not have.
 * @param {string} why
 * @param {{ id: string, source: string }} design
 * @param {string} [slotWhere]
 */
export function skippedAnswer(why, design, slotWhere) {
  const against =
    design.source === 'slot'
      ? `the design-system slot this site wears (\`${design.id}\`${slotWhere ? `, ${slotWhere}` : ''}): keep to its variables, never re-type its values`
      : 'docs/agents/design.json'
  return {
    ok: true,
    checked: false,
    design,
    warnings: [{ code: 'DESIGN_CHECK_SKIPPED', why }],
    next: `The page could not be measured (${why}). Compare your change against ${against} by hand, and try the check again later.`
  }
}

/**
 * The answer for measured pages: one report per page, warnings and next from the worst.
 * @param {object} input
 * @param {{ id: string, source: string, tokens: Record<string, string>, allow?: { prop: string, value: string }[] }} input.design
 * @param {{ path: string, url: string, probe: { href: string, seen: number, samples: any[] }, browser?: 'site' | 'host' }[]} input.pages
 * @param {string} input.reportPath where the first page's report was written (site-relative)
 * @param {() => Date} [input.now]
 */
export function checkedAnswer({ design, pages, reportPath, now }) {
  const palette = paletteOf(design.tokens)
  const reports = pages.map((p) => ({
    path: p.path,
    url: p.url,
    browser: p.browser,
    report: judge(p.probe, palette, {
      allow: Array.isArray(design.allow) ? design.allow : [],
      design: { id: design.id, source: design.source },
      ...(now ? { now } : {})
    })
  }))
  /** @type {Record<string, unknown>[]} */
  const warnings = []
  for (const { path: at, report } of reports) {
    for (const o of report.colors.offenders)
      warnings.push({
        code: 'OFF_PALETTE_COLOR',
        path: at,
        prop: o.prop,
        value: o.value,
        band: o.band,
        nearest: o.nearest,
        count: o.count,
        where: o.where
      })
    for (const f of report.fonts.offenders)
      warnings.push({ code: 'OFF_SYSTEM_FONT', path: at, family: f.family, count: f.count, where: f.where })
  }
  const scores = reports
    .map((r) => r.report.score)
    .filter((s) => typeof s === 'number')
    .map(Number)
  const score = scores.length === 0 ? null : Math.min(...scores)
  const worst = reports.reduce(
    (a, b) => ((b.report.score ?? 101) < (a.report.score ?? 101) ? b : a),
    reports[0]
  )
  const next = checkNext(worst.report)
  const scriptsOff = reports.some((r) => r.browser === 'host')
  return {
    ok: true,
    checked: true,
    design: { id: design.id, source: design.source },
    pages: reports.map((r) => ({
      path: r.path,
      url: r.url,
      score: r.report.score,
      judged: r.report.elements.judged,
      ...(r.browser ? { browser: r.browser } : {})
    })),
    score,
    warnings,
    next:
      next ??
      `Nothing drifted: every judged colour and font on ${reports.map((r) => r.path).join(', ')} is on the design system.`,
    report: reportPath,
    reports: reports.map((r) => r.report),
    ...(scriptsOff ? { note: SCRIPTS_OFF_NOTE } : {})
  }
}

/**
 * What a host-mode measure says about itself (ADR 0023, "Addendum 30/09"). dsh's browser runs the
 * page with its scripts OFF, so an element a script builds or reveals (a T4 off-canvas menu, a
 * dropdown, a badge) has no box there and is not judged. The build's `shot` probe runs the same
 * page with scripts ON. Measured 29/09/2026 on one T4 Joomla home page (`dfinj1`, `/en/`): shot
 * 785 judged, 88; host 626 judged, 84 — the SAME offenders; the 69 extra elements were all on the
 * palette, and blocking fonts and images changed nothing. So the gap is a denominator, not a
 * drift, and an agent comparing the two must not chase it.
 */
export const SCRIPTS_OFF_NOTE =
  "Measured with the page's scripts off (browser: host). Elements a script builds or reveals — " +
  'menus, off-canvas panels, dropdowns — are not counted, so this score can differ from the one ' +
  "the build's shot stage recorded for the same page (scripts on) even when the warnings are the " +
  'same. Compare warnings, not the two scores.'
