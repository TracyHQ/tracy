// The finisher's two sources of faults merged into one list before the fixer runs (#423, spec #418): the finder's faults,
// and the first site check's failures of the listed kinds. The finder never reads the site check; this merge does.
//
//   - A failure of a group named in CHECK_GROUP_KINDS has that fault kind; a group in LOGGED_ONLY_GROUPS is logged only
//     with its reason (a missing or repeated h1); any other blocking failure is logged only as outside the fault list.
//   - A failure that has no door to repair is logged as no door: an item the write step had nothing to write to
//     (`unaddressable-items`, the links with no slot in the contract of #369), or a link failure that names no slot.
//   - A failure is repaired only when confirmed on the live site (fault-confirm.js): by the finder when it saw the same fault
//     in the same place (slot, block, or the words it quoted), else by the page the site serves now still holding what the
//     check measured. Unconfirmed, it is logged as measurement wrong; an invisible kind (a link target, an alt, a title or
//     meta) with nothing to look for, or a page that could not be read, is logged only as not confirmed.
//   - A fault both sources name is one fault (sources: finder and site check), so it gets one repair order; failures of
//     the same fault at two widths or from two groups count once too.
//   - A finder fault of a kind a check group measured green is logged with that group under `missedBy`.
import { confirmedByFinder, sameCheckFault, servedNow } from './fault-confirm.js'
import { FAULT_KINDS, isRepairable, LOGGED_ONLY_KINDS, loggedOnlyReason } from './fault-kinds.js'
import { logRecord } from './repair-log.js'

const DEMO_CONTACT = /^(tel|mailto):/i

/** The fault kind of each site check group's failures; a function reads the failure when one group holds two kinds. */
export const CHECK_GROUP_KINDS = Object.freeze({
  'emphasis-codes-left': 'raw-markup',
  'cms-errors': 'raw-markup',
  'words-over-picture': 'unreadable-text',
  'band-contrast': 'unreadable-text',
  'empty-frames': 'empty-frame',
  'empty-controls': 'empty-block',
  'text-overflow': 'broken-layout',
  'glued-words': 'broken-layout',
  'demo-words': 'demo-fact',
  'dead-links': 'bad-link',
  'hidden-page-links': 'bad-link',
  'demo-links': (f) => (DEMO_CONTACT.test(String(f.measured ?? '')) ? 'demo-contact-link' : 'bad-link'),
  'alt-matches-picture': 'wrong-alt',
  'accent-emphasis': 'lost-design'
})

/** Groups whose failures are logged only, by the fault kind whose reason they carry. */
export const LOGGED_ONLY_GROUPS = Object.freeze({ 'main-heading': 'main-heading' })

/** Groups whose failures have no door to repair: the write step had nothing to write to. */
export const NO_DOOR_GROUPS = new Set(['unaddressable-items'])

/** Kinds the finder cannot see on a screenshot: confirmed by reading the page the site serves now. */
export const SERVED_KINDS = new Set(['bad-link', 'demo-contact-link', 'demo-title-meta', 'wrong-alt'])

/** Kinds whose repair needs a slot: a failure of one that names no slot has no door. */
const LINK_KINDS = new Set(['bad-link', 'demo-contact-link'])

const kindOfFailure = (f) => {
  const by = CHECK_GROUP_KINDS[f.group]
  return typeof by === 'function' ? by(f) : (by ?? null)
}

const failuresOf = (check) =>
  (check?.groups ?? []).flatMap((g) => (g.failures ?? []).map((f) => ({ ...f, group: f.group ?? g.name })))

/** A failure as a fault of the list, where the crops fall back to the page's first desktop tile. */
const faultOf = (f, kind) => ({
  page: f.page ?? null,
  viewport: f.width === 390 ? 'phone' : 'desktop',
  tile: 0,
  slot: f.slot ?? null,
  kind,
  seen: f.reason ?? (f.measured ? `${f.group} measured ${String(f.measured).slice(0, 200)}` : f.group),
  measured: f.measured ?? null
})

/**
 * @param {{ found: object[], firstCheck: object | null,
 *   pageHtml?: ((page: string) => Promise<string | null>) | null }} input `found` the finder's faults of the list;
 *   `pageHtml` reads a page as the site serves it now
 * @returns {Promise<{ faults: object[], records: object[], merge: { finder: number, siteCheck: number, confirmed: number,
 *   both: number, measurementWrong: number, noDoor: number, loggedOnly: number } }>}
 */
export async function mergedFaults({ found, firstCheck, pageHtml = null }) {
  const records = []
  const asCheck = (f) => ({
    causingStep: f.causingStep ?? null,
    causingCheck: f.group,
    sources: ['site-check']
  })
  // Each fault the finder saw, with the groups that reported its kind green.
  const greenGroups = (kind) =>
    (firstCheck?.groups ?? [])
      .filter((g) => g.status === 'green' && kindOfFailure({ group: g.name }) === kind)
      .map((g) => g.name)
  const faults = found.map((fault) => {
    const missedBy = greenGroups(fault.kind)
    return { ...fault, sources: ['finder'], ...(missedBy.length ? { missedBy } : {}) }
  })
  const merge = {
    finder: found.length,
    siteCheck: 0,
    confirmed: 0,
    both: 0,
    measurementWrong: 0,
    noDoor: 0,
    loggedOnly: 0
  }
  const fromCheck = []
  for (const f of failuresOf(firstCheck)) {
    if ((f.level ?? 'block') !== 'block') continue
    merge.siteCheck += 1
    const kind = kindOfFailure(f)
    const logged = LOGGED_ONLY_GROUPS[f.group]
    if (NO_DOOR_GROUPS.has(f.group) || (kind && LINK_KINDS.has(kind) && !f.slot)) {
      merge.noDoor += 1
      records.push(
        logRecord(faultOf(f, kind), {
          ...asCheck(f),
          outcome: 'no-door',
          reason: `no door to repair: ${f.slot ? `nothing to write to for ${f.slot}` : 'the failure names no slot in the contract'}${f.reason ? ` (${f.reason})` : ''}`
        })
      )
      continue
    }
    if (!isRepairable(kind)) {
      const named = logged ?? (FAULT_KINDS[kind] ? kind : f.group)
      merge.loggedOnly += 1
      records.push(
        logRecord(faultOf(f, LOGGED_ONLY_KINDS[named] ? named : (kind ?? f.group)), {
          ...asCheck(f),
          reason: loggedOnlyReason(named)
        })
      )
      continue
    }
    const fault = faultOf(f, kind)
    // The same fault named again (another width, another group) is counted once.
    const again = fromCheck.find((c) => sameCheckFault(c.fault, fault))
    if (again) continue
    const seen = faults.find((x) => x.sources.includes('finder') && confirmedByFinder(x, fault))
    fromCheck.push({ fault })
    if (seen) {
      merge.confirmed += 1
      if (!seen.sources.includes('site-check')) seen.sources = [...seen.sources, 'site-check']
      continue
    }
    const html = fault.page && pageHtml ? await pageHtml(fault.page).catch(() => null) : null
    const served = typeof html === 'string' ? servedNow(html, fault.measured) : null
    const unread =
      typeof html !== 'string'
        ? 'the live page could not be read'
        : 'the failure carries nothing measured to look for'
    if (served === null && SERVED_KINDS.has(kind)) {
      merge.loggedOnly += 1
      records.push(
        logRecord(fault, { ...asCheck(f), reason: `not confirmed: ${unread}, so it is not repaired` })
      )
      continue
    }
    if (!served) {
      merge.measurementWrong += 1
      const missed = SERVED_KINDS.has(kind)
        ? ''
        : 'the finder did not see this fault on the screenshots of the live site, and '
      records.push(
        logRecord(fault, {
          ...asCheck(f),
          outcome: 'measurement-wrong',
          reason: `measurement wrong: ${missed}${served === false ? `the live page no longer holds ${JSON.stringify(fault.measured)}` : unread}`
        })
      )
      continue
    }
    merge.confirmed += 1
    faults.push({ ...fault, sources: ['site-check'] })
  }
  merge.both = faults.filter((x) => x.sources.length > 1).length
  return { faults, records, merge }
}
