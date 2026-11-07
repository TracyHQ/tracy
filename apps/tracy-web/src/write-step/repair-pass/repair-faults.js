// The faults step 9b sends (#448): the first site check's blocking failures. Each is held to the kind tables (repair-kinds.js): a kind never sent, one no visitor sees, one no
// table names, and a fault with no page (a comment points at a page) are skipped with a code and a reason; so is a demo
// fault naming a value the brief gives (`not-demo`, repair-brief-values.js). A fault the check names at two widths is
// sent once. Faults are grouped by page, in the order their page was first named. Pure.
import { pagePath } from '../../lib/hidden-page-links.js'
import { notDemoReason } from './repair-brief-values.js'
import { kindOfFailure, notSentOf } from './repair-kinds.js'

/** The page as a kept page names it (`/index.php/about` and `/about/` are `/about`), or null. */
export const pageOf = (page) => (typeof page === 'string' && page ? pagePath(page) : null)

const quoted = (text) =>
  String(text ?? '')
    .match(/"([^"]{3,})"/)?.[1]
    ?.toLowerCase() ?? null

/** Whether two faults are one: same page and kind, and the same slot, block or quoted words. */
export function sameFault(a, b) {
  if (a.page !== b.page || a.kind !== b.kind) return false
  if (a.slot && b.slot) return a.slot === b.slot
  if (a.block && b.block) return a.block === b.block
  const qa = quoted(a.seen) ?? (typeof a.measured === 'string' ? a.measured.toLowerCase() : null)
  const qb = quoted(b.seen) ?? (typeof b.measured === 'string' ? b.measured.toLowerCase() : null)
  return Boolean(qa && qb && (qa.includes(qb) || qb.includes(qa)))
}

/** A blocking site check failure as a fault. */
const fromFailure = (f) => ({
  source: 'site-check',
  group: f.group,
  page: pageOf(f.page),
  slot: f.slot ?? null,
  block: null,
  kind: kindOfFailure(f),
  width: f.width ?? null,
  measured: f.measured ?? null,
  seen: f.reason ?? null
})

/** Every blocking failure of a site check, named by its group. */
export const blockingFailures = (check) =>
  (check?.groups ?? []).flatMap((g) =>
    (g.failures ?? [])
      .map((f) => ({ ...f, group: f.group ?? g.name }))
      .filter((f) => (f.level ?? 'block') === 'block')
  )

/** Why one fault is not sent, by code and reason, or null. */
function skipOf(fault, brief) {
  const skip = notSentOf(fault)
  if (skip) return skip
  const notDemo = notDemoReason(fault, brief)
  return notDemo ? { code: 'not-demo', reason: notDemo } : null
}

/**
 * @param {{ firstCheck: object | null, brief?: Map<string, string[]> | null }} input `brief` the
 *   brief's values (repair-brief-values.js `briefValues`)
 * @returns {{ pages: { page: string, faults: object[] }[],
 *   skipped: { fault: object, code: string, reason: string }[] }}
 */
export function faultsToSend({ firstCheck, brief = null }) {
  const skipped = []
  const kept = []
  for (const fault of blockingFailures(firstCheck).map(fromFailure)) {
    const skip = skipOf(fault, brief)
    if (skip) skipped.push({ fault, ...skip })
    else if (!kept.some((k) => sameFault(k, fault))) kept.push(fault)
  }
  const pages = []
  for (const fault of kept) {
    const page = pages.find((p) => p.page === fault.page)
    if (page) page.faults.push(fault)
    else pages.push({ page: fault.page, faults: [fault] })
  }
  return { pages, skipped }
}

/** The key a failure is compared by between two checks: group, page, slot and width. */
export const failureKey = (f) => [f.group, pageOf(f.page), f.slot ?? '', f.width ?? ''].join('\n')

/** Blocking failures of `later` that `first` did not have. */
export function newBlocking(first, later) {
  const had = new Set(blockingFailures(first).map(failureKey))
  return blockingFailures(later).filter((f) => !had.has(failureKey(f)))
}

/** The faults among `faults` that `check` still fails on. */
export function stillThere(faults, check) {
  const place = (f) => [f.group, pageOf(f.page), f.slot ?? ''].join('\n')
  const now = new Set(blockingFailures(check).map(place))
  return faults.filter((f) => f.source === 'site-check' && now.has(place(f)))
}
