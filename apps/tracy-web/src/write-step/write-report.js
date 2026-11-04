// The write report `site-write-report/1` (ADR 0044): one line per slot with its owner, status and reason. `readBack` is
// null until the site check fills it in; nothing here reads the site. A line's `part` says what kind of thing it is when
// it is not a content slot of the mapping. A written or refused line keeps in `ordered` the value that was sent, which is
// what the site check compares the site with. A line written through a door other than the contract names its read in
// `readFrom` (site-check/read-back.js). In a rewrite a line that was not sent carries `unchanged: true` and keeps its status and
// `ordered`, since they still say what the site holds (last-report.js); `counts` tells those apart from what this run wrote.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'
import { refusalWords } from './contract-write.js'
import { PICTURE_OWNER } from './picture-package.js'

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
function claimLine(claim, { written, refused, routed, deferred, ordered, settled, hides, links }) {
  const slotKey = contentMapKey(claim.slot)
  const key = routed.get(slotKey) ?? slotKey
  if (claim.kind === 'hide') {
    const done = {
      ...line(claim.slot, key, claim.owner, 'skipped', 'the run ended before this slot was hidden'),
      ...hides.get(claim.slot)
    }
    // A hide no plan ordered says its own reason: the hide stage speaks for the plan.
    return claim.why && done.status === 'hidden' ? { ...done, reason: claim.why } : done
  }
  if (claim.kind === 'link')
    return {
      ...line(
        claim.slot,
        key,
        claim.owner,
        'skipped',
        `the plan sends this link to ${claim.content}; the run ended before it was written`
      ),
      ...links.get(claim.slot)
    }
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
 *   ordered?: Record<string, string>, brandLines?: object[], pictureLines?: object[], settled?: Map<string, object>,
 *   hides?: Map<string, object>, frameLines?: object[], links?: Map<string, object> }} input `ordered`: what the mapping sent, by content map key;
 *   `brandLines` and `pictureLines`: each stage's own lines, which stand for its claims; `settled`: what the page settings
 *   stage did, by line slot; `hides`: what the hide stage did to a hide claim; `frameLines`: its lines of blocks and pages;
 *   `shareLines`: the share stage's own lines; `links`: what the link stage did to a link claim
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
  brandLines = [],
  settled = new Map(),
  pictureLines = [],
  hides = new Map(),
  frameLines = [],
  shareLines = [],
  links = new Map()
}) {
  const done = { written: new Set(written), refused, routed, deferred, ordered, settled, hides, links }
  return [
    ...frameLines,
    ...brandLines,
    ...pictureLines,
    ...shareLines,
    ...[...owners.values()]
      .filter((c) => c.owner !== 'brand' && (c.owner !== PICTURE_OWNER || c.kind === 'hide'))
      .map((claim) => claimLine(claim, done)),
    ...unowned.map((u) =>
      line(u.slot, contentMapKey(u.slot), null, 'skipped', 'no owner: a slot in a kept block no file fills')
    ),
    ...extraLines(extras, owners, settled)
  ]
}

export function countsOf(slots) {
  const counts = { written: 0, hidden: 0, skipped: 0, failed: 0, unchanged: 0 }
  for (const s of slots) counts[s.unchanged ? 'unchanged' : s.status] += 1
  return counts
}
