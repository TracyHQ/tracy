// The site check's first group (ADR 0044, decision 7): the site against what the write report says was ordered. It says
// nothing about whether the result looks good. Red here belongs to step 9, and later groups do not run.
//
// How a line is read: a content slot, the line's `key`, through `content.contract inspect` (`slots[].current`). A line written through another
// door names its own read in `readFrom: { action, params, path, type? }`, and a read must be safe to repeat. A written line
// with neither warns and is listed under `reads`, so that green never claims more than was read.
import { GroupUnmeasured } from './group-unmeasured.js'
import { sameValue } from './slot-values.js'

const INSPECT = 'content.contract inspect'

/** Each entity's first page, from inspect's `pages`. An entity no page names (a category, a user) has no page. */
function pageIndex(pages) {
  const routes = new Map()
  const add = (entity, route) => {
    if (!routes.has(entity)) routes.set(entity, route)
  }
  for (const page of Array.isArray(pages) ? pages : []) {
    add(page.entity, page.route)
    for (const module of page.assignedModules ?? []) add(module.entity, page.route)
    const article = /[?&]id=(\d+)/.exec(page.link ?? '')
    if (article) add(`article-${article[1]}`, page.route)
  }
  return routes
}

// A step into a string reads it as JSON first: a menu item keeps its settings in one JSON column (`params`).
const asObject = (value) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
const valueAt = (answer, path) => path.reduce((value, step) => asObject(value)?.[step], answer)
const readName = ({ action, params }) => `${action} ${params?.operation ?? ''}`.trim()

function tally() {
  const counts = new Map()
  const parts = new Set()
  return {
    add(read, part) {
      counts.set(read, (counts.get(read) ?? 0) + 1)
      if (read === 'none') parts.add(part)
    },
    list: () =>
      [...counts].map(([read, lines]) => ({
        read,
        lines,
        ...(read === 'none' ? { parts: [...parts] } : {})
      }))
  }
}

/** One line against its read: its result word and, when it is not a match, a failure. */
function judge(line, held) {
  const base = {
    slot: line.slot,
    key: line.key,
    page: held.page,
    measured: held.value,
    ordered: line.ordered ?? null
  }
  if (line.status === 'failed')
    return {
      result: 'failed',
      failure: { ...base, reason: `The plugin refused this slot: ${line.reason}` }
    }
  if (!held.found)
    return {
      result: 'unread',
      failure: { ...base, reason: 'The site does not have this slot' }
    }
  if (typeof held.value !== 'string')
    return { result: 'unread', failure: { ...base, reason: `The read gave no current value (${held.why})` } }
  if (line.status === 'hidden')
    return held.value.trim() === ''
      ? { result: 'match' }
      : {
          result: 'differs',
          failure: { ...base, reason: 'The plan hides this slot and it still holds words' }
        }
  return sameValue(line.ordered, held.value, held.slot)
    ? { result: 'match' }
    : { result: 'differs', failure: { ...base, reason: 'The site does not hold what was ordered' } }
}

async function run({ report, read }) {
  const compared = report.slots.filter((s) => ['written', 'failed', 'hidden'].includes(s.status))
  const noOrder = compared.filter((s) => s.status === 'written' && s.ordered === undefined)
  if (noOrder.length)
    throw new GroupUnmeasured(
      `The report keeps no ordered value for ${noOrder.length} written lines: run the write step again.`
    )
  const reading = await read('content.contract', { operation: 'inspect' })
  const finished =
    report.status === 'done'
      ? []
      : [
          {
            measured: report.status,
            reason: `The write did not finish${report.cause ? `: ${report.cause.code}: ${report.cause.reason}` : ''}`
          }
        ]
  if (reading.contract !== report.contract)
    return {
      checked: 0,
      skipped: report.slots.length,
      reads: [],
      lines: {},
      failures: [
        ...finished,
        {
          measured: reading.contract,
          ordered: report.contract,
          reason: 'The site answers another contract than the write report'
        }
      ]
    }
  const slots = new Map((Array.isArray(reading.slots) ? reading.slots : []).map((s) => [s?.key, s]))
  const pages = pageIndex(reading.pages)
  const reads = tally()
  const lines = {}
  const failures = [...finished]
  const held = async (line) => {
    if (line.readFrom) {
      reads.add(readName(line.readFrom))
      const answer = await read(line.readFrom.action, line.readFrom.params)
      const value = valueAt(answer, line.readFrom.path ?? [])
      const about = `${readName(line.readFrom)} at ${(line.readFrom.path ?? []).join('.')}`
      return {
        found: true,
        page: null,
        value: typeof value === 'number' ? String(value) : (value ?? null),
        why: about,
        slot: { type: line.readFrom.type }
      }
    }
    reads.add(INSPECT)
    const slot = slots.get(line.key)
    return {
      found: Boolean(slot),
      page: pages.get(slot?.entity) ?? null,
      value: slot?.current ?? null,
      why: 'inspect',
      slot
    }
  }
  for (const line of compared) {
    if (line.part && !line.key && !line.readFrom && line.status !== 'failed') {
      reads.add('none', line.part)
      lines[line.slot] = 'unread'
      failures.push({
        slot: line.slot,
        ordered: line.ordered ?? null,
        level: 'warn',
        reason: `Nothing reads back a ${line.part} line yet, so this was not compared`
      })
      continue
    }
    const { result, failure } = judge(line, await held(line))
    lines[line.slot] = result
    if (failure) failures.push(failure)
  }
  if (report.status === 'done' && !compared.length && !finished.length)
    failures.push({
      level: 'warn',
      reason: 'The write report orders nothing, so there was nothing to compare'
    })
  return {
    checked: compared.length,
    skipped: report.slots.length - compared.length,
    reads: reads.list(),
    lines,
    failures
  }
}

export const readBackGroup = {
  name: 'read-back',
  causingStep: 9,
  stopsLaterWhenRed: true,
  run
}

/**
 * The write report with the check written onto it: each line's read-back result, and the check beside the lines.
 * @param {object} report
 * @param {object} check `site-check/1`
 */
export function withReadBack(report, check) {
  const lines = check.groups.find((g) => g.name === readBackGroup.name)?.lines ?? {}
  return {
    ...report,
    slots: report.slots.map((s) => ({ ...s, readBack: lines[s.slot] ?? null })),
    siteCheck: check
  }
}
