// A rewrite compares new files with the last report of the same site (ADR 0044, decision 6). Only a line the site really took
// counts as done: a failed line, one the run never reached and one the site check found different are all sent again. The
// report of every run keeps what the site holds, so the next run can compare with it, whatever way this one ended.
import { droppedBlocks } from './hide-plan.js'
import { NO_LAST } from './no-last-report.js'

const NAMED = 20
const DONE = new Set(['written', 'hidden'])
const RED_READS = new Set(['differs', 'failed'])
const isDone = (line) => DONE.has(line?.status)

/** A line's identity across runs: a slot can carry several logo spots, each with its own line. */
export const lineId = ({ slot, spot }) => (spot ? `${slot}@${spot}` : slot)

/**
 * @param {object | null | undefined} report the last run's write report on this site, however that run ended
 * @returns {{ active: boolean, report: object | null, line: (id: string) => object | null,
 *   same: (id: string, value: unknown) => boolean, sameKey: (key: string, value: string) => boolean,
 *   hidden: (id: string) => boolean, allDone: (part: string) => object[] | null, held: () => object[] }} `line`: the done line of
 *   this id, unless the site check found the site different; `same`: that line holds this value; `sameKey`: the last contract
 *   call wrote this value to this content map key; `allDone`: the lines of one part when there are some and every one is done;
 *   `held`: every line the site took
 */
export function readLastReport(report) {
  if (!report) return NO_LAST
  const failed = new Set()
  const taken = new Map()
  const slots = Array.isArray(report.slots) ? report.slots : []
  for (const line of slots) {
    if (line.status === 'failed') failed.add(lineId(line))
    if (isDone(line)) taken.set(lineId(line), line)
  }
  for (const id of failed) taken.delete(id)
  const standing = (line) => !RED_READS.has(line?.readBack)
  const line = (id) => {
    const found = taken.get(id)
    return found && standing(found) ? found : null
  }
  const keys = new Map()
  // A line with its own read went through another door; a slot in a contract call is read on its key.
  for (const entry of taken.values())
    if (typeof entry.key === 'string' && entry.status === 'written' && !entry.readFrom && standing(entry))
      keys.set(entry.key, entry.ordered)
  return {
    active: true,
    report,
    line,
    same: (id, value) => value !== undefined && line(id)?.ordered === value,
    sameKey: (key, value) => keys.get(key) === value,
    hidden: (id) => line(id)?.status === 'hidden',
    allDone: (part) => {
      const lines = slots.filter((entry) => entry.part === part)
      return lines.length && lines.every((entry) => line(lineId(entry))) ? lines : null
    },
    held: () => [...taken.values()]
  }
}

/** Why this report cannot be compared with these files, or null. */
export function lastReportProblem(last, { siteKey, contract }) {
  if (!last.active) return null
  const { site, contract: wrote } = last.report
  if (site !== siteKey)
    return {
      code: 'LAST_REPORT_OTHER_SITE',
      reason: `The last report is of the site ${site}, not ${siteKey}, so it says nothing about this site.`
    }
  if (wrote !== contract)
    return {
      code: 'NEEDS_NEW_SITE',
      reason: `This site was written on the contract ${wrote} and these files are for ${contract}, so this needs a new site. Nothing was written.`
    }
  return null
}

const named = (list) =>
  list.length > NAMED ? `${list.slice(0, NAMED).join(', ')} and ${list.length - NAMED} more` : list.join(', ')

/** What an earlier run took off the site and these files no longer take off, as words naming each. */
function broughtBack(last, { plan, kit, owners, extras, changes }) {
  const blocks = new Set(droppedBlocks(plan, kit).keys())
  const dropped = new Set(
    (Array.isArray(plan?.pages) ? plan.pages : []).filter((p) => p?.decision === 'drop').map((p) => p.id)
  )
  const items = new Set((extras?.mainMenu?.hide ?? []).map((h) => h.item))
  const out = []
  for (const line of last.held()) {
    const { slot, part } = line
    if (part === 'block') {
      if (!blocks.has(slot)) out.push(`${slot} (a block that was dropped)`)
    } else if (part === 'page-drop') {
      if (!dropped.has(slot)) out.push(`${slot} (a page that was dropped)`)
    } else if (part === 'menu-hide') {
      if (!items.has(slot)) out.push(`${slot} (a menu item that was unpublished)`)
    } else if (line.status === 'hidden' && !line.leftWith && !line.readFrom) {
      // A line gone with its block or menu item, or a link gone with what holds it, is decided by that one's own line.
      if (owners.get(slot)?.kind !== 'hide' || line.key in changes)
        out.push(
          `${slot} (${part === 'fixed-text' ? 'a sentence that was emptied' : 'a slot that was emptied'})`
        )
    }
  }
  return out
}

/** The refusal of a change only a new site can take, or null. Asks nothing of the site. */
export function needsNewSite(last, input) {
  if (!last.active) return null
  const back = broughtBack(last, input)
  if (!back.length) return null
  return {
    code: 'NEEDS_NEW_SITE',
    reason: `An earlier run took these off this site and they cannot be brought back, so this change needs a new site: ${named(back)}. Nothing was written.`
  }
}

/**
 * The lines of this run against the last report. A line the run did not send comes out `unchanged`: its status still says what
 * the site holds, which is what the site check reads. A run that ended early keeps what the site held for each line it did not
 * reach. `left`: what the site still holds from an earlier run and these files no longer order.
 * @param {object[]} lines this run's lines, each as if every order the run did not send had been written
 * @param {ReturnType<typeof readLastReport>} last
 * @param {string} status how this run ended
 * @returns {{ slots: object[], left: string[] }}
 */
export function againstLast(lines, last, status) {
  const before = new Map(last.held().map((line) => [lineId(line), line]))
  const carried = (line) => ({ ...line, unchanged: true })
  const left = []
  const seen = new Set()
  const slots = lines.map((line) => {
    const id = lineId(line)
    seen.add(id)
    const old = before.get(id)
    if (!old) return line
    if (line.status === 'skipped') {
      if (status !== 'done') return carried(old)
      left.push(line.slot)
      return line
    }
    const kept = last.line(id) && old.status === line.status && old.ordered === line.ordered
    return kept ? { ...line, unchanged: true } : line
  })
  for (const [id, line] of before) {
    if (seen.has(id)) continue
    slots.push(carried(line))
    if (status === 'done') left.push(line.slot)
  }
  return { slots, left }
}
