// The write report `site-write-report/1` (ADR 0044): one line per slot with its owner, status and reason. `readBack` is
// null until the site check fills it in; nothing here reads the site. A line's `part` says what kind of thing it is when
// it is not a content slot of the mapping. A written or refused line keeps in `ordered` the value that was sent, which is
// what the site check compares the site with. A line written through a door other than the contract names its read in
// `readFrom` (site-check/read-back.js).
import { contentMapKey } from '../site-writer/contract-mapping.js'
import { refusalWords } from './contract-write.js'

export const REPORT_VERSION = 'site-write-report/1'

const line = (slot, key, owner, status, reason, extra = {}) => ({
  slot,
  key,
  owner,
  status,
  reason,
  readBack: null,
  ...extra
})

/** A base line with what the page settings stage did to it, when it did anything (write-step/page-settings-stage.js). */
function staged(base, result) {
  if (!result) return base
  const { status, reason = null, ordered, readFrom } = result
  return {
    ...base,
    status,
    reason,
    ...(ordered === undefined ? {} : { ordered }),
    ...(readFrom ? { readFrom } : {})
  }
}

/** A line for each claim, from what the write did. */
function claimLine(claim, { written, refused, routed, deferred, ordered, settled }) {
  const slotKey = contentMapKey(claim.slot)
  const key = routed.get(slotKey) ?? slotKey
  if (claim.kind === 'hide')
    return line(
      claim.slot,
      key,
      claim.owner,
      'skipped',
      'the plan hides this slot; hiding is not written yet'
    )
  if (claim.kind === 'link')
    return line(
      claim.slot,
      key,
      claim.owner,
      'skipped',
      `the plan sends this link to ${claim.content}; link targets are not written yet`
    )
  if (settled.has(claim.slot))
    return staged(
      line(claim.slot, key, claim.owner, 'skipped', deferred.get(key) ?? null),
      settled.get(claim.slot)
    )
  if (deferred.has(key)) return line(claim.slot, key, claim.owner, 'skipped', deferred.get(key))
  if (refused.has(key)) {
    const entry = refused.get(key)
    return line(claim.slot, key, claim.owner, 'failed', refusalWords(entry), {
      refusal: entry,
      ordered: ordered[key]
    })
  }
  if (written.has(key)) return line(claim.slot, key, claim.owner, 'written', null, { ordered: ordered[key] })
  return line(claim.slot, key, claim.owner, 'skipped', 'the run ended before this slot was written')
}

/** The export's extras: each is skipped until the page settings stage says what it did (`settled`, by line slot). */
function extraLines(extras, owners, settled) {
  const ran = 'the run ended before the page settings were written'
  const skipped = (slot, owner, part, reason) =>
    staged(line(slot, null, owner, 'skipped', reason, { part }), settled.get(slot))
  const pageWords = ([page]) => [
    skipped(`${page}:title`, 'writer', 'page-title', ran),
    skipped(`${page}:description`, 'writer', 'page-description', ran)
  ]
  return [
    ...Object.keys(extras.alts ?? {}).map((f) => skipped(f, 'writer', 'alt', 'alt text is not written yet')),
    ...Object.entries(extras.pageMeta ?? {}).flatMap(pageWords),
    ...Object.keys(extras.pages ?? {}).map((p) => skipped(p, 'writer', 'page-body', ran)),
    ...(extras.mainMenu?.hide ?? []).map((h) => skipped(h.item, 'plan', 'menu-hide', ran)),
    ...(extras.footerHeadings ?? [])
      .filter((h) => !owners.has(h.slot))
      .map((h) =>
        skipped(h.slot, null, 'footer-heading', 'the site copy has no words for this footer heading')
      )
  ]
}

/**
 * The slot lines of a report.
 * @param {{ owners: Map<string, object>, unowned: object[], extras: object, written: Iterable<string>,
 *   refused: Map<string, object>, routed?: Map<string, string>, deferred?: Map<string, string>,
 *   ordered?: Record<string, string>, settled?: Map<string, object> }} input `ordered`: what the mapping sent, by
 *   content map key; `settled`: what the page settings stage did, by line slot
 */
export function slotLines({
  owners,
  unowned,
  extras,
  written,
  refused,
  routed = new Map(),
  deferred = new Map(),
  ordered = {},
  settled = new Map()
}) {
  const done = { written: new Set(written), refused, routed, deferred, ordered, settled }
  return [
    ...[...owners.values()].map((claim) => claimLine(claim, done)),
    ...unowned.map((u) =>
      line(u.slot, contentMapKey(u.slot), null, 'skipped', 'no owner: a slot in a kept block no file fills')
    ),
    ...extraLines(extras, owners, settled)
  ]
}

export function countsOf(slots) {
  const counts = { written: 0, hidden: 0, skipped: 0, failed: 0 }
  for (const s of slots) counts[s.status] += 1
  return counts
}
