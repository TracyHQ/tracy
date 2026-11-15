// Template quality of the release gate (ticket #586, product decision 4): the site check's own page groups, named,
// run on the marker site and on the untouched human quickstart (the control), at the site check's widths (1440 and
// 390) and, for the theme reads, in light and dark. No second implementation: the groups, the host's browser reads and
// the failure levels are the site check's (`apps/tracy-web/src/site-check/`, imported only). A block failure whose
// group, page, width and selector (or reason, when it names no selector) the control does not show is a regression and
// blocks; one the control shows on the same template page is the template's own (`same_as_template`), recorded. A group the control could
// not measure falls back to the demo baseline file the template readiness step keeps (`demo-measures.json`); a group
// with no control at all cannot be compared and leaves the measurement incomplete, and so does a red group that lists
// no failure. A failure is matched by its page key too (the template page it is on), so the same failure on another
// page is a regression; a marker page with no counterpart on the control is judged on its own. Missing SEO items
// (`quality-seo.mjs`) block on every page the build writes; on a system page the template titles itself they are
// compared with the untouched template the same way. Pure but for the injected host.
import { PAGE_CHECK_GROUPS } from '../../../apps/tracy-web/src/site-check/page-groups.js'
import { runSiteCheck } from '../../../apps/tracy-web/src/site-check/site-check.js'
import { QUALITY_GROUPS } from './quality-groups.mjs'

export { QUALITY_GROUPS } from './quality-groups.mjs'

/** The site check's groups of these names; an unknown name throws, so a typo never measures nothing. */
export function qualityGroupsOf(names = QUALITY_GROUPS, catalogue = PAGE_CHECK_GROUPS) {
  return names.map((name) => {
    const group = catalogue.find((g) => g.name === name)
    if (!group) throw new Error('the site check has no group ' + name)
    return group
  })
}

/** The site check reaches the pages only through the host; the page list comes in the report. */
const pagesOnlyDoor = {
  async apply({ action, params }) {
    if (action === 'content.contract' && params?.operation === 'inspect') return { ok: true, pages: [] }
    return { ok: false, message: 'template quality reads the pages through the host only' }
  }
}

/** A failure as the record keeps it: what was seen and where, never a site address. */
const kept = (f) => ({
  group: f.group,
  page: f.page ?? null,
  width: f.width ?? null,
  level: f.level ?? 'block',
  reason: f.reason ?? null,
  measured: f.measured ?? null,
  ...(f.selector ? { selector: f.selector } : {})
})

/**
 * The named groups on a set of pages.
 * @param {{host: (payload: object) => Promise<object>, pages: string[], names?: string[], check?: Function}} input
 * @returns {Promise<{pages: string[], groups: Array<{name: string, status: string, reason?: string, failures: object[]}>}>}
 */
export async function measureQuality({ host, pages, names = QUALITY_GROUPS, check = runSiteCheck }) {
  const groups = qualityGroupsOf(names)
  const answer = await check({
    door: pagesOnlyDoor,
    report: { site: 'quality', keptPages: pages.map((path) => ({ path })) },
    host,
    groups,
    allGroups: true
  })
  return {
    pages: [...pages],
    groups: answer.groups.map((g) => ({
      name: g.name,
      status: g.status,
      ...(g.reason ? { reason: g.reason } : {}),
      failures: (g.failures ?? []).map(kept)
    }))
  }
}

/** The demo baseline file as a control: the groups it measured, marked as the baseline. */
export function baselineControl(doc) {
  if (!doc?.groups) return null
  return {
    from: 'baseline',
    groups: doc.groups.map((g) => ({ ...g, failures: (g.failures ?? []).map(kept) }))
  }
}

/**
 * The page key of every page of a set of renders (`{path, status, html}`): what template page each path is (an adapter
 * reads it from the page, `adapters/joomla-page-key.mjs`), so the same template page compares with itself on two sites
 * whose addresses differ. A page the reader names nothing for keeps its path.
 * @param {object[]} renders
 * @param {(html: string) => string | null} keyOf
 * @param {(path: string) => string} [addressOf] the address a page is asked at (`qualityPath`), the key of the map
 */
export function pageKeysOf(renders, keyOf, addressOf = (p) => '/' + String(p ?? '').replace(/^\/+/, '')) {
  const out = {}
  for (const r of renders ?? []) {
    const page = addressOf(r.path)
    if (r.status !== 200 || !r.html || out[page]) continue
    out[page] = keyOf(r.html) ?? page
  }
  return out
}

const pathOf = (page) => '/' + String(page ?? '').replace(/^\/+/, '')
/** The key of a failure's page on its site: its page key, else its path. */
const pageKeyOf = (side, page) => side?.pageKeys?.[pathOf(page)] ?? pathOf(page)

/** The identity of a failure across two sites: its group, page key, width and selector, or its reason with no selector. */
export const failureKey = (f, pageKey = f.page ?? '') =>
  [f.group, pageKey, f.width ?? '', f.selector ?? 'reason:' + (f.reason ?? '')].join('|')

const MEASURED = new Set(['green', 'red', 'not-applicable'])

const SIDE = /\bin the (light|dark) theme\b/
/**
 * The failures with one read on each theme side merged: the same group, page, width, selector and measured colours,
 * and a reason that differs only in the side, is one problem naming both sides (`themes`). A dark band the template
 * keeps dark on both sides is read twice by the look read, and is one thing to fix.
 */
function onceAcrossThemes(rows) {
  const out = []
  const seen = new Map()
  for (const r of rows) {
    const side = SIDE.exec(r.reason ?? '')?.[1] ?? null
    const key = [
      r.group,
      r.page,
      r.width,
      r.selector ?? '',
      r.measured ?? '',
      (r.reason ?? '').replace(SIDE, '')
    ].join('|')
    const had = seen.get(key)
    if (had) {
      if (side && !had.themes.includes(side)) had.themes.push(side)
      continue
    }
    const row = { ...r, themes: side ? [side] : [] }
    seen.set(key, row)
    out.push(row)
  }
  return out
}

/** The control of one group: the measured one when it measured, else the baseline's, else none. */
function controlGroup(name, control, baseline) {
  const measured = control?.groups?.find((g) => g.name === name)
  if (measured && MEASURED.has(measured.status))
    return { from: control.from ?? 'measured', side: control, group: measured }
  const base = baseline?.groups?.find((g) => g.name === name)
  if (base && MEASURED.has(base.status)) return { from: 'baseline', side: baseline, group: base }
  return { from: 'none', side: null, group: null }
}

/**
 * The SEO items split: a page the build writes blocks on any missing item; a system page the template itself titles
 * (sign in, password reset, search) is compared with the same page of the untouched template, by page and item.
 */
function seoSplit(seo, controlSeo, systemPages) {
  const system = new Set((systemPages ?? []).map(pathOf))
  // A system page is the same page on both sites by its page type: the marker site may read it at a menu item of its
  // own (`systemPagesOf`) where the untouched template is read at the raw address.
  const idOf = (m) => (String(m.pageType ?? '').startsWith('system-') ? m.pageType : pathOf(m.page))
  const known = new Set((controlSeo?.missing ?? []).map((m) => idOf(m) + '|' + m.item))
  const blocking = []
  const same = []
  const uncompared = []
  for (const m of seo?.missing ?? []) {
    if (!system.has(pathOf(m.page))) blocking.push(m)
    else if (!controlSeo) uncompared.push(m)
    else if (known.has(idOf(m) + '|' + m.item)) same.push({ group: 'seo', ...m, class: 'same_as_template' })
    else blocking.push(m)
  }
  return { blocking, same, uncompared }
}

/**
 * The quality measurement.
 * @param {{marker: {groups: object[], pageKeys?: object}, control?: {from?: string, groups: object[], pageKeys?:
 *   object, seo?: object} | null, baseline?: object | null, seo?: {status: string, missing: object[]} | null,
 *   systemPages?: string[]}} input `pageKeys`: path to page key on each site (`pageKeysOf`); `control.seo`: the SEO
 *   items of the untouched template; `systemPages`: the paths of the pages the template titles itself
 */
export function qualityOf({ marker, control = null, baseline = null, seo = null, systemPages = [] }) {
  const regressions = []
  const sameAsTemplate = []
  const warnings = []
  const uncompared = []
  const unmeasured = []
  const byGroup = {}
  for (const g of marker?.groups ?? []) {
    const c = controlGroup(g.name, control, baseline)
    byGroup[g.name] = { status: g.status, control: c.from, controlStatus: c.group?.status ?? null }
    if (!MEASURED.has(g.status)) {
      unmeasured.push({ group: g.name, reason: g.reason ?? g.status })
      continue
    }
    if (g.status === 'red' && !(g.failures ?? []).length) {
      unmeasured.push({ group: g.name, reason: 'red_without_failures' })
      continue
    }
    const known = new Set(
      (c.group?.failures ?? []).map((f) => failureKey({ group: g.name, ...f }, pageKeyOf(c.side, f.page)))
    )
    const controlPages = new Set(Object.values(c.side?.pageKeys ?? {}))
    for (const f of g.failures ?? []) {
      const at = { ...f, group: g.name }
      const key = pageKeyOf(marker, f.page)
      if (at.level !== 'block') warnings.push(at)
      else if (!c.group) uncompared.push(at)
      else if (known.has(failureKey(at, key))) sameAsTemplate.push({ ...at, class: 'same_as_template' })
      else
        regressions.push({
          ...at,
          class: 'regression',
          ...(c.side?.pageKeys && !controlPages.has(key) ? { counterpart: 'none' } : {})
        })
    }
  }
  const measuredAny = (marker?.groups ?? []).some((g) => g.status === 'green' || g.status === 'red')
  if (marker?.groups?.length && !measuredAny && !unmeasured.length)
    unmeasured.push({ group: null, reason: 'no_group_measured' })
  const split = seoSplit(seo, control?.seo ?? null, systemPages)
  sameAsTemplate.push(...split.same)
  const seoOut = seo
    ? { ...seo, blocking: split.blocking, same: split.same, uncompared: split.uncompared }
    : null
  const seoFailed = split.blocking.length > 0
  const seoOpen = seo && (split.uncompared.length > 0 || (seo.status !== 'passed' && seo.status !== 'failed'))
  const status =
    regressions.length || seoFailed
      ? 'failed'
      : unmeasured.length || uncompared.length || !marker?.groups?.length || seoOpen
        ? 'incomplete'
        : 'passed'
  return {
    status,
    control: control?.groups ? (control.from ?? 'measured') : baseline ? 'baseline' : 'none',
    byGroup,
    regressions: onceAcrossThemes(regressions),
    sameAsTemplate,
    warnings,
    uncompared,
    unmeasured,
    ...(seoOut ? { seo: seoOut } : {})
  }
}
