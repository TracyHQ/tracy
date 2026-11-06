// The finisher's two sources of faults merged into one list before the fixer runs (#423, spec #418): the finder's faults,
// and the first site check's failures of the listed kinds. The finder never reads the site check; this merge does.
//
//   - A failure of a group named in CHECK_GROUP_KINDS has that fault kind; a group in LOGGED_ONLY_GROUPS is logged only
//     with its reason (a missing or repeated h1); any other blocking failure is logged only as outside the fault list.
//   - A failure that has no door to repair is logged as no door: an item the write step had nothing to write to
//     (`unaddressable-items`, the links with no slot in the contract of #369), or a link failure that names no slot.
//   - A failure is repaired only when confirmed on the live site. A visible kind is confirmed when the finder saw the same
//     fault (same kind, on the same page or slot); an invisible kind (a link target, an alt, a title or meta) when the page
//     the site serves now still holds what the check measured. Unconfirmed, it is logged as measurement wrong.
//   - A fault both sources name is one fault (sources: finder and site check), so it gets one repair order; failures of
//     the same fault at two widths or from two groups count once too.
//   - A finder fault of a kind a check group measured green is logged with that group under `missedBy`.
import { FAULT_KINDS, LOGGED_ONLY_KINDS, loggedOnlyReason } from './fault-kinds.js'
import { logRecord } from './repair-log.js'

const DEMO_CONTACT = /^(tel|mailto):/i

/** The fault kind of each site check group's failures; a function reads the failure when one group holds two kinds. */
export const CHECK_GROUP_KINDS = Object.freeze({
  'emphasis-codes-left': 'raw-markup',
  'cms-errors': 'raw-markup',
  'words-over-picture': 'unreadable-text',
  'band-contrast': 'unreadable-text',
  'empty-frames': 'empty-frame',
  'empty-controls': 'empty-frame',
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

/** Two faults are the same when their kinds are, and they agree on page and slot, one of the two named alike in both. */
function sameFault(a, b) {
  if (a.kind !== b.kind) return false
  if (a.page && b.page && a.page !== b.page) return false
  if (a.slot && b.slot && a.slot !== b.slot) return false
  return Boolean((a.page && a.page === b.page) || (a.slot && a.slot === b.slot))
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

const digits = (s) => String(s).replace(/\D+/g, '')
const decoded = (html) =>
  String(html)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")

/**
 * Whether the page the site serves now still holds what the check measured: a tel: or mailto: link to the same number or
 * address, else the measured words or address anywhere in the page. Null when there is nothing measured to look for.
 */
export function servedNow(html, measured) {
  if (typeof measured !== 'string' || !measured.trim()) return null
  const page = decoded(html)
  const scheme = measured.match(DEMO_CONTACT)?.[1]?.toLowerCase()
  if (scheme) {
    const hrefs = [...page.matchAll(new RegExp(`href\\s*=\\s*["']?${scheme}:([^"'\\s>]+)`, 'gi'))].map(
      (m) => m[1]
    )
    const want = measured.slice(scheme.length + 1)
    return scheme === 'tel'
      ? hrefs.some((h) => digits(h) === digits(want) && digits(want) !== '')
      : hrefs.some((h) => decodeURIComponent(h).toLowerCase() === want.toLowerCase())
  }
  return page.includes(measured.trim())
}

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
    if (!kind || !FAULT_KINDS[kind]) {
      const named = logged ?? f.group
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
    const again = fromCheck.find((c) => sameFault(c.fault, fault))
    if (again) continue
    const seen = faults.find((x) => x.sources.includes('finder') && sameFault(x, fault))
    fromCheck.push({ fault })
    if (seen) {
      merge.confirmed += 1
      if (!seen.sources.includes('site-check')) seen.sources = [...seen.sources, 'site-check']
      continue
    }
    if (!SERVED_KINDS.has(kind)) {
      merge.measurementWrong += 1
      records.push(
        logRecord(fault, {
          ...asCheck(f),
          outcome: 'measurement-wrong',
          reason: 'measurement wrong: the finder did not see this fault on the screenshots of the live site'
        })
      )
      continue
    }
    const html = fault.page && pageHtml ? await pageHtml(fault.page).catch(() => null) : null
    const served = typeof html === 'string' ? servedNow(html, fault.measured) : null
    if (served === null) {
      merge.loggedOnly += 1
      records.push(
        logRecord(fault, {
          ...asCheck(f),
          reason: `not confirmed: ${typeof html !== 'string' ? 'the live page could not be read' : 'the failure carries nothing measured to look for'}, so it is not repaired`
        })
      )
      continue
    }
    if (!served) {
      merge.measurementWrong += 1
      records.push(
        logRecord(fault, {
          ...asCheck(f),
          outcome: 'measurement-wrong',
          reason: `measurement wrong: the live page no longer holds ${JSON.stringify(fault.measured)}`
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
