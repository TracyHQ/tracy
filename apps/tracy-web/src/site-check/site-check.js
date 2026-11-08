// The site check (ADR 0044, step 11): a site door and a write report in, `site-check/1` out. It uses no model, writes
// nothing and repairs nothing. The entry point runs named groups in order; a further measure joins by adding a group to
// SITE_CHECK_GROUPS, with nothing here changed.
//
// A group is { name, causingStep, stopsLaterWhenRed?, run({ report, siteKey, read }) } and answers
// { checked, failures, ...anything it wants kept }. A failure is { page?, slot?, width?, measured?, level?, causingStep?,
// reason? }, with `level` defaulting to block and `causingStep` to the group's own. `read(action, params)` asks the site
// through the door. Only reads pass, answers are shared between groups, and a refused read makes the group unmeasured.
//
// Context also holds `pageHtml(path)` (a page's markup as a visitor reads it), `host(payload)` (reads pages in a browser), `baseline` (the demo baseline), `kit` (the template kit's
// document) and `pictures` (step 8's site-pictures/1 manifest, for `alt-matches-picture`), all optional: a group that needs one and has none is unmeasured.
//
// Statuses: green, red (a block failure), unmeasured (it could not tell), not-applicable (it checked nothing, and said why), and
// not-run for a group stopped by an earlier one. A group that checked nothing is never green (ADR 0044, decision 27): it answers
// `notApplicable: '<reason>'` when there was genuinely nothing of its kind to measure, and is unmeasured otherwise.
import { altMatchesPictureGroup } from './alt-matches-picture.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { kitVersionGroup } from './kit-version.js'
import { PAGE_CHECK_GROUPS } from './page-groups.js'
import { baselineAtRoutes, hasRouteTable, pageSlugGroup } from './page-slug.js'
import { reachablePagesGroup, iconGlyphsGroup } from './reachable-pages.js'
import { readBackGroup } from './read-back.js'
import { WRITE_FINDING_GROUPS } from './write-findings.js'
import { writtenNotPrintedGroup } from './written-not-printed.js'

export const CHECK_VERSION = 'site-check/1'
export const NOT_APPLICABLE = 'not-applicable'
/** With a kit, the first group: a kit older than the check expects stops the run (kit-version.js). */
export const KIT_GROUPS = [kitVersionGroup]
/**
 * The groups that need no browser. With a host, `PAGE_CHECK_GROUPS` (page-groups.js) follow them. What the write step found and
 * left out (write-findings.js) reads only the report, so it comes before read-back, which stops the later groups when red.
 */
export const SITE_CHECK_GROUPS = [...WRITE_FINDING_GROUPS, readBackGroup]
/** With a route table in the report (the write step renamed kept pages), after read-back: each page ends with its plan slug. */
export const ROUTE_GROUPS = [pageSlugGroup]
/**
 * The groups that read pages as a visitor's browser gets them, with no browser: they run when a page reader is given.
 * `alt-matches-picture` also needs step 8's manifest (`pictures`); without it, it is unmeasured when pictures were written.
 * `reachable-pages` and `icon-glyphs` (reachable-pages.js) open every page a kept page links to and read its icons.
 */
export const PAGE_READ_GROUPS = [
  writtenNotPrintedGroup,
  altMatchesPictureGroup,
  reachablePagesGroup,
  iconGlyphsGroup
]

const READ_OPERATIONS = new Set(['inspect', 'read'])
/** Actions that only read by what they are (the plugin marks `content.get` and `content.list` as writing nothing) and take no operation. */
const READ_ACTIONS = new Set(['content.get', 'content.list'])

/** The only way a group reaches the site. */
function readsOnly(door, siteKey) {
  const answers = new Map()
  return async (action, params = {}) => {
    if (!READ_OPERATIONS.has(params.operation) && !READ_ACTIONS.has(action))
      throw new GroupUnmeasured(`The site check only reads; ${action} ${params.operation} was not sent.`)
    const id = JSON.stringify([action, params])
    if (!answers.has(id)) answers.set(id, door.apply({ siteKey, action, params }))
    const answer = await answers.get(id)
    if (!answer?.ok)
      throw new GroupUnmeasured(
        `${action} ${params.operation ?? ''} was refused: ${answer?.message ?? answer?.error ?? answer?.code ?? 'no answer'}`
      )
    return answer
  }
}

const failureOf = (group) => (f) => ({
  group: group.name,
  page: null,
  slot: null,
  width: null,
  measured: null,
  level: 'block',
  causingStep: group.causingStep,
  ...f
})

/** Red on a block failure; otherwise a group that checked nothing is not applicable when it said why, else unmeasured. */
function statusOf(failures, checked, notApplicable) {
  if (failures.some((f) => f.level === 'block')) return { status: 'red' }
  if (checked > 0) return { status: 'green' }
  if (typeof notApplicable === 'string' && notApplicable.trim())
    return { status: NOT_APPLICABLE, reason: notApplicable }
  return {
    status: 'unmeasured',
    reason: 'Nothing was measured (0 checked), and the group gave no reason it does not apply.'
  }
}

/** A status that counts as passing: the verdict and a stopping group read it as green. */
const passes = (status) => status === 'green' || status === NOT_APPLICABLE

async function measure(group, context) {
  const from = context.now()
  const timed = () => ({ ms: context.now() - from })
  try {
    const { failures = [], notApplicable, ...kept } = await group.run(context)
    const named = failures.map(failureOf(group))
    return {
      name: group.name,
      ...statusOf(named, kept.checked, notApplicable),
      ...kept,
      failures: named,
      ...timed()
    }
  } catch (error) {
    return {
      name: group.name,
      status: 'unmeasured',
      reason: String(error?.message ?? error),
      checked: 0,
      failures: [],
      ...timed()
    }
  }
}

function overall(groups) {
  if (groups.some((g) => g.status === 'red')) return 'red'
  return groups.some((g) => g.status === 'unmeasured') ? 'unmeasured' : 'green'
}

/** With `allGroups`, a run that a group would have stopped is never green, whatever the later groups say. */
const notGreenAfter = (status, stoppedBy) => (stoppedBy && passes(status) ? stoppedBy.status : status)

/**
 * @param {{ door: { apply: Function }, report: object, groups?: object[], now?: () => number, host?: Function,
 *   pageHtml?: (path: string) => Promise<string | null>, baseline?: object | null, kit?: object | null, pictures?: object | null,
 *   allGroups?: boolean, pages?: string[] | null }} input `report` is `site-write-report/1`; its `site` says which site to read. `host` asks
 *   the site's tracy-host to read pages: without it only the groups that need no browser run (`pageGroups: false`).
 *   `pageHtml` reads a page's markup: without it `written-not-printed` does not run. A `kit` adds `kit-version` first.
 *   `allGroups` runs the groups a red or unmeasured group would stop; each says `ranDespite`, and the status stays what the
 *   stopping group made it (never green). `pages` opens only those kept pages in the host (all when null); the answer
 *   then holds only their page failures, to be joined to a check of the whole site (lib/scoped-site-check.js).
 * @returns {Promise<object>} `site-check/1`
 */
export async function runSiteCheck({
  door,
  report,
  host,
  pageHtml,
  baseline = null,
  kit = null,
  pictures = null,
  groups = [
    ...(kit ? KIT_GROUPS : []),
    ...SITE_CHECK_GROUPS,
    ...(hasRouteTable(report) ? ROUTE_GROUPS : []),
    ...(pageHtml ? PAGE_READ_GROUPS : []),
    ...(host ? PAGE_CHECK_GROUPS : [])
  ],
  now = Date.now,
  allGroups = false,
  pages = null
}) {
  const siteKey = report.site
  const context = {
    report,
    siteKey,
    now,
    host,
    // Only these kept pages are opened by the host (step 9b's check after a turn, joined by lib/scoped-site-check.js).
    pages,
    pageHtml,
    // Measured at the demo's addresses; the kept pages answer at the plan's now (page-slug.js).
    baseline: baselineAtRoutes(baseline, report.routes),
    kit,
    pictures,
    read: readsOnly(door, siteKey)
  }
  const results = []
  let stoppedBy = null
  for (const group of groups) {
    if (stoppedBy && !allGroups) {
      results.push({
        name: group.name,
        status: 'not-run',
        reason: `${stoppedBy.name} is ${stoppedBy.status}`,
        checked: 0,
        failures: []
      })
      continue
    }
    const result = await measure(group, context)
    results.push(stoppedBy ? { ...result, ranDespite: `${stoppedBy.name} is ${stoppedBy.status}` } : result)
    if (!stoppedBy && group.stopsLaterWhenRed && !passes(result.status)) stoppedBy = result
  }
  const every = results.flatMap((g) => g.failures)
  return {
    version: CHECK_VERSION,
    status: notGreenAfter(overall(results), stoppedBy),
    site: siteKey,
    pageGroups: Boolean(host),
    allGroups,
    kit: report.kit ?? null,
    contract: report.contract ?? null,
    counts: {
      block: every.filter((f) => f.level === 'block').length,
      warn: every.filter((f) => f.level === 'warn').length,
      // Groups that could not tell: never counted as green (ADR 0044, 2026-11-04).
      unmeasured: results.filter((g) => g.status === 'unmeasured').length,
      // Groups with nothing of their kind to measure, each with its reason: they pass, and are said (decision 27).
      notApplicable: results.filter((g) => g.status === NOT_APPLICABLE).length
    },
    groups: results
  }
}
