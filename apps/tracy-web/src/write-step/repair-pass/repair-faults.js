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

/**
 * The button an empty-controls failure names (#448): it has no slot and no words, only the selector the host measured and,
 * for a button with no words, the address it leads to (`a.btn -> /contact`); a button going nowhere leads to `#`. Kept on
 * the fault so 9b finds the element on the served page (repair-served-element.js).
 */
function controlOf(f) {
  if (f.group === 'empty-frames')
    return { selector: f.selector ?? (typeof f.measured === 'string' ? f.measured : null) }
  if (f.group !== 'empty-controls' || typeof f.selector !== 'string' || !f.selector) return {}
  const arrow = typeof f.measured === 'string' ? f.measured.split(' -> ') : []
  const led = arrow.length === 2 && arrow[0] === f.selector ? arrow[1].trim() : null
  const href = led && led !== '(no address)' ? led : /goes nowhere/.test(f.reason ?? '') ? '#' : null
  return { selector: f.selector, href, wordless: led !== null }
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
  seen: f.reason ?? null,
  ...controlOf(f)
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
  const now = blockingFailures(check).map(fromFailure)
  return faults.filter(
    (f) =>
      f.source === 'site-check' &&
      ((check?.groups ?? []).some((g) => g.name === f.group && g.status === 'unmeasured') ||
        check?.status === 'unmeasured' ||
        now.some((later) => {
          if (later.group !== f.group || later.page !== f.page) return false
          if (f.slot) return later.slot === f.slot
          if (f.selector) return later.selector === f.selector && later.href === f.href
          // Counts (for example the number of h1 elements) can change while the same fault persists.
          if (typeof f.measured !== 'string') return !later.slot && !later.selector
          return sameFault(f, later)
        }))
  )
}

/** A kept page that could not render, rather than an ordinary broken link on a rendered page. */
export const unavailablePage = (f) =>
  f.group === 'dead-links' && String(f.reason ?? f.seen ?? '').startsWith('A kept page does not answer (')

// These measurements need a rendered page. Their absence on a failed page is not a passing baseline.
const RENDERED_GROUPS = new Set([
  'alt-matches-picture',
  'words-over-picture',
  'band-contrast',
  'demo-words',
  'demo-links',
  'dead-links',
  'hidden-page-links',
  'text-overflow',
  'empty-controls',
  'accent-emphasis',
  'emphasis-codes-left',
  'glued-words',
  'main-heading',
  'empty-frames',
  'demo-pictures',
  'cms-errors'
])

/** Separate newly measurable content after recovery from regressions against the latest completed check. */
export function changedFindings(before, later) {
  const unavailable = new Set(
    blockingFailures(before)
      .filter(unavailablePage)
      .map((f) => pageOf(f.page))
  )
  const stillUnavailable = new Set(
    blockingFailures(later)
      .filter(unavailablePage)
      .map((f) => pageOf(f.page))
  )
  const newlyObserved = []
  const regressions = []
  for (const f of newBlocking(before, later)) {
    const page = pageOf(f.page)
    const exposed =
      page && unavailable.has(page) && !stillUnavailable.has(page) && RENDERED_GROUPS.has(f.group)
    if (exposed) newlyObserved.push(f)
    else regressions.push(f)
  }
  // Missing measurements have no failure rows. Losing a measured contract must not look like clearing its faults.
  const measured = new Set((before?.groups ?? []).filter((g) => g.status !== 'unmeasured').map((g) => g.name))
  for (const group of later?.groups ?? []) {
    if (group.status !== 'unmeasured' || !measured.has(group.name)) continue
    regressions.push({
      group: group.name,
      page: null,
      kind: 'verification-lost',
      level: 'block',
      reason: group.reason ?? 'A previously measured site check is now unmeasured'
    })
  }
  return { newlyObserved, regressions }
}

/** Acceptance requires a measured site check with no blocking failures. */
export const checkAccepted = (check) =>
  check?.status === 'green' &&
  !blockingFailures(check).length &&
  !(check.counts?.unmeasured > 0) &&
  !(check.groups ?? []).some((g) => g.status === 'unmeasured')
