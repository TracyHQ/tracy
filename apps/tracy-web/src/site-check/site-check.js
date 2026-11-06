// The site check (ADR 0044, step 11): a site door and a write report in, `site-check/1` out. It uses no model, writes
// nothing and repairs nothing. The entry point runs named groups in order; a further measure joins by adding a group to
// SITE_CHECK_GROUPS, with nothing here changed.
//
// A group is { name, causingStep, stopsLaterWhenRed?, run({ report, siteKey, read }) } and answers
// { checked, failures, ...anything it wants kept }. A failure is { page?, slot?, width?, measured?, level?, causingStep?,
// reason? }, with `level` defaulting to block and `causingStep` to the group's own. `read(action, params)` asks the site
// through the door. Only reads pass, answers are shared between groups, and a refused read makes the group unmeasured.
//
// Context also holds `pageHtml(path)` (a page's markup as a visitor reads it), `host(payload)` (reads pages in a browser), `baseline` (the demo baseline) and `kit` (the template kit's
// document), all optional: a group that needs one and has none is unmeasured.
//
// Statuses: green, red (a block failure), unmeasured (it could not tell), and not-run for a group stopped by an earlier one.
import { GroupUnmeasured } from './group-unmeasured.js'
import { kitVersionGroup } from './kit-version.js'
import { PAGE_CHECK_GROUPS } from './page-groups.js'
import { baselineAtRoutes, hasRouteTable, pageSlugGroup } from './page-slug.js'
import { readBackGroup } from './read-back.js'
import { WRITE_FINDING_GROUPS } from './write-findings.js'
import { writtenNotPrintedGroup } from './written-not-printed.js'

export const CHECK_VERSION = 'site-check/1'
/** With a kit, the first group: a kit older than the check expects stops the run (kit-version.js). */
export const KIT_GROUPS = [kitVersionGroup]
/**
 * The groups that need no browser. With a host, `PAGE_CHECK_GROUPS` (page-groups.js) follow them. What the write step found and
 * left out (write-findings.js) reads only the report, so it comes before read-back, which stops the later groups when red.
 */
export const SITE_CHECK_GROUPS = [...WRITE_FINDING_GROUPS, readBackGroup]
/** With a route table in the report (the write step renamed kept pages), after read-back: each page ends with its plan slug. */
export const ROUTE_GROUPS = [pageSlugGroup]
/** The groups that read pages as a visitor's browser gets them, with no browser: they run when a page reader is given. */
export const PAGE_READ_GROUPS = [writtenNotPrintedGroup]

const READ_OPERATIONS = new Set(['inspect', 'read'])
/** Actions that only read by what they are (the plugin marks `content.get` as writing nothing) and take no operation. */
const READ_ACTIONS = new Set(['content.get'])

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

async function measure(group, context) {
  const from = context.now()
  const timed = () => ({ ms: context.now() - from })
  try {
    const { failures = [], ...kept } = await group.run(context)
    const named = failures.map(failureOf(group))
    return {
      name: group.name,
      status: named.some((f) => f.level === 'block') ? 'red' : 'green',
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
const notGreenAfter = (status, stoppedBy) => (stoppedBy && status === 'green' ? stoppedBy.status : status)

/**
 * @param {{ door: { apply: Function }, report: object, groups?: object[], now?: () => number, host?: Function,
 *   pageHtml?: (path: string) => Promise<string | null>, baseline?: object | null, kit?: object | null, allGroups?: boolean }} input `report` is `site-write-report/1`; its `site` says which site to read. `host` asks
 *   the site's tracy-host to read pages: without it only the groups that need no browser run (`pageGroups: false`).
 *   `pageHtml` reads a page's markup: without it `written-not-printed` does not run. A `kit` adds `kit-version` first.
 *   `allGroups` runs the groups a red or unmeasured group would stop; each says `ranDespite`, and the status stays what the
 *   stopping group made it (never green).
 * @returns {Promise<object>} `site-check/1`
 */
export async function runSiteCheck({
  door,
  report,
  host,
  pageHtml,
  baseline = null,
  kit = null,
  groups = [
    ...(kit ? KIT_GROUPS : []),
    ...SITE_CHECK_GROUPS,
    ...(hasRouteTable(report) ? ROUTE_GROUPS : []),
    ...(pageHtml ? PAGE_READ_GROUPS : []),
    ...(host ? PAGE_CHECK_GROUPS : [])
  ],
  now = Date.now,
  allGroups = false
}) {
  const siteKey = report.site
  const context = {
    report,
    siteKey,
    now,
    host,
    pageHtml,
    // Measured at the demo's addresses; the kept pages answer at the plan's now (page-slug.js).
    baseline: baselineAtRoutes(baseline, report.routes),
    kit,
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
    if (!stoppedBy && group.stopsLaterWhenRed && result.status !== 'green') stoppedBy = result
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
      unmeasured: results.filter((g) => g.status === 'unmeasured').length
    },
    groups: results
  }
}
