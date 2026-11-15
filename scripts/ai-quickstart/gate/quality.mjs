// Template quality of the release gate (ticket #586, product decision 4): the site check's own page groups, named,
// run on the marker site and on the untouched human quickstart (the control), at the site check's widths (1440 and
// 390) and, for the theme reads, in light and dark. No second implementation: the groups, the host's browser reads and
// the failure levels are the site check's (`apps/tracy-web/src/site-check/`, imported only). A block failure whose
// group, width and selector (or reason, when it names no selector) the control does not show is a regression and
// blocks; one the control shows is the template's own (`same_as_template`) and is recorded. A group the control could
// not measure falls back to the demo baseline file the template readiness step keeps (`demo-measures.json`); a group
// with no control at all cannot be compared and leaves the measurement incomplete. Missing SEO items
// (`quality-seo.mjs`) block whatever the control says. Pure but for the injected host.
import { PAGE_CHECK_GROUPS } from '../../../apps/tracy-web/src/site-check/page-groups.js'
import { runSiteCheck } from '../../../apps/tracy-web/src/site-check/site-check.js'

/** The site check groups the gate runs, by name, in the site check's own order. */
export const QUALITY_GROUPS = Object.freeze([
  'empty-frames',
  'cms-errors',
  'text-overflow',
  'stretched-pictures',
  'empty-controls',
  'main-heading',
  'orphan-row',
  'blank-footer-column',
  'band-contrast',
  'words-over-picture',
  'logo-readable'
])

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

/** The identity of a failure across two sites: its group, width and selector, or its reason with no selector. */
export const failureKey = (f) =>
  [f.group, f.width ?? '', f.selector ?? 'reason:' + (f.reason ?? '')].join('|')

const MEASURED = new Set(['green', 'red', 'not-applicable'])

/** The control of one group: the measured one when it measured, else the baseline's, else none. */
function controlGroup(name, control, baseline) {
  const measured = control?.groups?.find((g) => g.name === name)
  if (measured && MEASURED.has(measured.status)) return { from: control.from ?? 'measured', group: measured }
  const base = baseline?.groups?.find((g) => g.name === name)
  if (base && MEASURED.has(base.status)) return { from: 'baseline', group: base }
  return { from: 'none', group: null }
}

/**
 * The quality measurement.
 * @param {{marker: {groups: object[]}, control?: {from?: string, groups: object[]} | null, baseline?: object | null,
 *   seo?: {status: string, missing: object[]} | null}} input
 */
export function qualityOf({ marker, control = null, baseline = null, seo = null }) {
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
    const known = new Set((c.group?.failures ?? []).map((f) => failureKey({ group: g.name, ...f })))
    for (const f of g.failures ?? []) {
      const at = { ...f, group: g.name }
      if (at.level !== 'block') warnings.push(at)
      else if (!c.group) uncompared.push(at)
      else if (known.has(failureKey(at))) sameAsTemplate.push({ ...at, class: 'same_as_template' })
      else regressions.push({ ...at, class: 'regression' })
    }
  }
  const seoFailed = seo?.status === 'failed'
  const status =
    regressions.length || seoFailed
      ? 'failed'
      : unmeasured.length || uncompared.length || !marker?.groups?.length || (seo && seo.status !== 'passed')
        ? 'incomplete'
        : 'passed'
  return {
    status,
    control: control?.groups ? (control.from ?? 'measured') : baseline ? 'baseline' : 'none',
    byGroup,
    regressions,
    sameAsTemplate,
    warnings,
    uncompared,
    unmeasured,
    ...(seo ? { seo } : {})
  }
}
