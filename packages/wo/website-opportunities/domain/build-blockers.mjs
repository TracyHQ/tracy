// The blocker gate (spec TracyHQ/tracy#189): a brief build whose final checks still hold a blocker is never reported
// built. After the one bounded cleanup turn, the report that is left goes through `buildBlockers`; any blocker makes the
// build end in "needs fixes", shown to the person with this list.
//
// 🔒 THE BLOCKER KINDS COME FROM THE ONE REGISTRY (`build-rules.mjs`): a rule of severity `blocker` names, with `blocks`,
// which findings stop a build. Every CMS feeds the same report (`demo-leftover-check.js`), so the gate holds for Joomla,
// WordPress and EmDash alike. A finding any check marks `severity: 'blocker'` is a blocker even when no rule blocks its
// kind (`other-blocker`), so a new check can never be silently ignored. Pure: no network, no clock.
import { blockerRules } from './build-rules.mjs'

export const BUILD_BLOCKERS_VERSION = 'build-blockers/1'

/** The kept page a broken entry names: a kept page the site did not serve is a blocker of its own. */
const KEPT_PAGE_MISSING = 'kept-page-missing'

/**
 * The blocker kinds, in the order the person reads them. `matches` reads one finding of the final report.
 * @type {ReadonlyArray<{id: string, why: string, matches: (finding: any) => boolean}>}
 */
export const BLOCKER_RULES = Object.freeze([
  ...blockerRules()
    .filter((r) => !r.broken)
    .map((r) => Object.freeze({ id: r.id, why: r.guarantee, matches: (f) => r.blocks(f) === true })),
  Object.freeze({
    id: 'other-blocker',
    why: 'A check marked this a blocker',
    matches: (f) => f.severity === 'blocker'
  })
])

const pageOf = (f) => String(f?.page ?? f?.path ?? '')

/**
 * Judge the final check report.
 * @param {{findings?: any[], broken?: any[]} | null | undefined} report - `receipt.leftovers` after the cleanup turn
 * @returns {{version: string, state: 'clear' | 'needs-fixes' | 'unchecked',
 *   items: Array<{rule: string, pages: string[], count: number}>, total: number}}
 */
export function buildBlockers(report) {
  if (!report || !Array.isArray(report.findings))
    return { version: BUILD_BLOCKERS_VERSION, state: 'unchecked', items: [], total: 0 }
  /** @type {Map<string, {pages: string[], count: number}>} */
  const groups = new Map()
  const add = (rule, page) => {
    const group = groups.get(rule) ?? { pages: [], count: 0 }
    group.count += 1
    if (page && !group.pages.includes(page)) group.pages.push(page)
    groups.set(rule, group)
  }
  for (const finding of report.findings) {
    const rule = BLOCKER_RULES.find((r) => r.matches(finding ?? {}))
    if (rule) add(rule.id, pageOf(finding))
  }
  for (const entry of Array.isArray(report.broken) ? report.broken : []) add(KEPT_PAGE_MISSING, pageOf(entry))
  const order = [...BLOCKER_RULES.map((r) => r.id), KEPT_PAGE_MISSING]
  const items = order
    .filter((id) => groups.has(id))
    .map((id) => ({ rule: id, .../** @type {{pages: string[], count: number}} */ (groups.get(id)) }))
  const total = items.reduce((sum, item) => sum + item.count, 0)
  return { version: BUILD_BLOCKERS_VERSION, state: items.length ? 'needs-fixes' : 'clear', items, total }
}
