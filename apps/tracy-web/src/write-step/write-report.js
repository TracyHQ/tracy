// The write report `site-write-report/1` (ADR 0044): one line per slot with its owner, status and reason. `readBack` is
// null until the site check fills it in; nothing here reads the site. A line's `part` says what kind of thing it is when
// it is not a content slot of the mapping.
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

/** A line for each claim, from what the write did. */
function claimLine(claim, { written, refused }) {
  const key = contentMapKey(claim.slot)
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
  if (refused.has(key)) {
    const entry = refused.get(key)
    return line(claim.slot, key, claim.owner, 'failed', refusalWords(entry), { refusal: entry })
  }
  if (written.has(key)) return line(claim.slot, key, claim.owner, 'written', null)
  return line(claim.slot, key, claim.owner, 'skipped', 'the run ended before this slot was written')
}

/** The export's extras: this step writes the mapping only, so each is reported and left for the ticket that writes it. */
function extraLines(extras, owners) {
  const skipped = (slot, owner, part, reason) => line(slot, null, owner, 'skipped', reason, { part })
  return [
    ...Object.keys(extras.alts ?? {}).map((f) => skipped(f, 'writer', 'alt', 'alt text is not written yet')),
    ...Object.keys(extras.pageMeta ?? {}).map((p) =>
      skipped(p, 'writer', 'page-meta', 'page titles and descriptions are not written yet')
    ),
    ...Object.keys(extras.pages ?? {}).map((p) =>
      skipped(p, 'writer', 'page-body', 'legal and not-found pages are not written yet')
    ),
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
 *   refused: Map<string, object> }} input
 */
export function slotLines({ owners, unowned, extras, written, refused }) {
  const done = { written: new Set(written), refused }
  return [
    ...[...owners.values()].map((claim) => claimLine(claim, done)),
    ...unowned.map((u) =>
      line(u.slot, contentMapKey(u.slot), null, 'skipped', 'no owner: a slot in a kept block no file fills')
    ),
    ...extraLines(extras, owners)
  ]
}

export function countsOf(slots) {
  const counts = { written: 0, hidden: 0, skipped: 0, failed: 0 }
  for (const s of slots) counts[s.status] += 1
  return counts
}
