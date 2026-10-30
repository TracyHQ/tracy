// The blocker gate (spec TracyHQ/tracy#189): a brief build whose final checks still hold a blocker is never reported
// built. After the one bounded cleanup turn, the report that is left goes through `buildBlockers`; any blocker makes the
// build end in "needs fixes", shown to the person with this list.
//
// 🔒 THE ONE PLACE THAT SAYS WHAT A BLOCKER IS. A check names a finding's kind; this file says which kinds stop a build.
// Every CMS feeds the same report (`demo-leftover-check.js`), so the gate holds for Joomla, WordPress and EmDash alike.
// A finding any check marks `severity: 'blocker'` is a blocker even when no rule below names its kind, so a new check
// can never be silently ignored. Pure: no network, no clock.
import { LEFTOVER_KINDS } from './demo-leftovers.mjs'

export const BUILD_BLOCKERS_VERSION = 'build-blockers/1'

const EMPTY_HREF = /^a\[href="#"\]/

/**
 * The blocker kinds, in the order the person reads them. `matches` reads one finding of the final report.
 * @type {ReadonlyArray<{id: string, why: string, matches: (finding: any) => boolean}>}
 */
export const BLOCKER_RULES = Object.freeze([
  {
    id: 'demo-content',
    why: 'Words or pictures of the template demo are still on a slot the build did not fill',
    matches: (f) => LEFTOVER_KINDS[f.kind]?.severity === 'blocker'
  },
  {
    id: 'form-without-recipient',
    why: 'A form a visitor can fill in has nowhere to send it',
    matches: (f) => f.kind === 'contact-form' || f.kind === 'C21'
  },
  {
    id: 'record-not-from-brief',
    why: 'A record slot (a review author, a contact, a figure) holds a value that is not in the brief',
    matches: (f) =>
      f.kind === 'record-not-shown' || (f.kind === 'review-integrity' && f.reason === 'missing-review-author')
  },
  {
    id: 'missing-head-block',
    why: 'A head block the build owes the page is not on it',
    matches: (f) => f.kind === 'head-block' || f.kind === 'centred-row'
  },
  {
    id: 'link-without-job',
    why: 'A button or link leads nowhere',
    matches: (f) => ['C18', 'C19'].includes(f.kind) && EMPTY_HREF.test(String(f.place ?? ''))
  },
  {
    id: 'sibling-copy-shape',
    why: 'The cards of one list do not share one text shape: one long beside one short, one body of several, or an exclamation mark',
    matches: (f) => f.kind === 'sibling-copy-shape'
  },
  {
    id: 'sibling-record-pages',
    why: 'Sibling record pages share a picture or a section of words with only the name changed, show an empty card, or carry a blog pager',
    matches: (f) =>
      ['sibling-record-picture', 'sibling-record-copy', 'record-page-pager', 'empty-card'].includes(f.kind)
  },
  {
    id: 'other-blocker',
    why: 'A check marked this a blocker',
    matches: (f) => f.severity === 'blocker'
  }
])

/** The kept page a broken entry names: a kept page the site did not serve is a blocker of its own. */
const KEPT_PAGE_MISSING = 'kept-page-missing'

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
