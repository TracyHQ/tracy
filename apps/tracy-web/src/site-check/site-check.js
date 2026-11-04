// The site check (ADR 0044, step 11): a site door and a write report in, `site-check/1` out. It uses no model, writes
// nothing and repairs nothing. The entry point runs named groups in order; a further measure joins by adding a group to
// SITE_CHECK_GROUPS, with nothing here changed.
//
// A group is { name, causingStep, stopsLaterWhenRed?, run({ report, siteKey, read }) } and answers
// { checked, failures, ...anything it wants kept }. A failure is { page?, slot?, width?, measured?, level?, causingStep?,
// reason? }, with `level` defaulting to block and `causingStep` to the group's own. `read(action, params)` asks the site
// through the door. Only reads pass, answers are shared between groups, and a refused read makes the group unmeasured.
//
// Statuses: green, red (a block failure), unmeasured (it could not tell), and not-run for a group stopped by an earlier one.
import { GroupUnmeasured } from './group-unmeasured.js'
import { readBackGroup } from './read-back.js'

export const CHECK_VERSION = 'site-check/1'
export const SITE_CHECK_GROUPS = [readBackGroup]

const READ_OPERATIONS = new Set(['inspect', 'read'])

/** The only way a group reaches the site. */
function readsOnly(door, siteKey) {
  const answers = new Map()
  return async (action, params = {}) => {
    if (!READ_OPERATIONS.has(params.operation))
      throw new GroupUnmeasured(`The site check only reads; ${action} ${params.operation} was not sent.`)
    const id = JSON.stringify([action, params])
    if (!answers.has(id)) answers.set(id, door.apply({ siteKey, action, params }))
    const answer = await answers.get(id)
    if (!answer?.ok)
      throw new GroupUnmeasured(
        `${action} ${params.operation} was refused: ${answer?.message ?? answer?.error ?? answer?.code ?? 'no answer'}`
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

/**
 * @param {{ door: { apply: Function }, report: object, groups?: object[], now?: () => number }} input `report` is
 *   `site-write-report/1`; its `site` says which site to read
 * @returns {Promise<object>} `site-check/1`
 */
export async function runSiteCheck({ door, report, groups = SITE_CHECK_GROUPS, now = Date.now }) {
  const siteKey = report.site
  const context = { report, siteKey, now, read: readsOnly(door, siteKey) }
  const results = []
  let stoppedBy = null
  for (const group of groups) {
    if (stoppedBy) {
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
    results.push(result)
    if (group.stopsLaterWhenRed && result.status !== 'green') stoppedBy = result
  }
  const every = results.flatMap((g) => g.failures)
  return {
    version: CHECK_VERSION,
    status: overall(results),
    site: siteKey,
    kit: report.kit ?? null,
    contract: report.contract ?? null,
    counts: {
      block: every.filter((f) => f.level === 'block').length,
      warn: every.filter((f) => f.level === 'warn').length
    },
    groups: results
  }
}
