// What a content brief holds back from the site, by stable code and count (#575, plan stage inputs): prices no source
// published, a Google rating of too few reviews, people only reviews name, stale posts and photos, hours the owner left
// off. The brief says each in a sentence for the writer (`missing[].why`); a plan card cannot group or translate a
// sentence, so this gives each a code and a count. The codes are the brief's own fact reasons (`fact-assessment.mjs`,
// `few-reviews`, `review-only-person`, `stale`, `implausible-all-week-hours`, `owner-left-off`...) written as plan codes
// (lower case words joined by underscores, Contract B), plus three for what has no fact behind it:
//   not_collected      the brief found none (`missing` with no fact kept off: no price, no menu, no photos);
//   sources_disagree   the sources give different values and none is shown (`missing[].conflicting`);
//   kept_off_site      a fact kept off the site with no reason recorded.
// A fact the owner left off is `owner_left_off`, whatever rule held it first. Never a value: only fields, codes and
// counts, so nothing held reaches a reader through this list. Pure.

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The codes this module writes beside the brief's own fact reasons. */
export const HELD_BACK_CODES = Object.freeze(['not_collected', 'sources_disagree', 'kept_off_site'])
/** A brief fact reason as a plan code: `few-reviews` is `few_reviews`. */
export const reasonCode = (reason) =>
  String(reason)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** The code of one fact kept off the site. */
function factCode(fact) {
  const reasons = list(fact?.reasons).filter(isText)
  if (fact?.decidedBy === 'owner' || reasons.includes('owner-left-off')) return 'owner_left_off'
  const first = reasons.find((r) => r !== 'owner-override')
  return first ? reasonCode(first) : 'kept_off_site'
}

/**
 * What the brief holds back, one entry per field and code, in the brief's order.
 * @param {object | null | undefined} brief the stored content brief
 * @returns {Array<{field: string, code: string, count: number}>}
 */
export function heldBackOf(brief) {
  const out = []
  const add = (field, code, count = 1) => {
    const found = out.find((e) => e.field === field && e.code === code)
    if (found) found.count += count
    else out.push({ field, code, count })
  }
  const offFields = new Set()
  for (const fact of list(brief?.facts)) {
    if (fact?.onSite !== false || fact.sourceKind === 'observed' || !isText(fact.field)) continue
    add(fact.field, factCode(fact))
    offFields.add(fact.field)
  }
  for (const entry of list(brief?.missing)) {
    if (!isText(entry?.field) || offFields.has(entry.field)) continue
    add(entry.field, list(entry.conflicting).length ? 'sources_disagree' : 'not_collected')
  }
  for (const entry of list(brief?.stale)) {
    if (!isText(entry?.field)) continue
    const field = entry.field.startsWith('media:') ? 'photos' : entry.field
    if (!offFields.has(field)) add(field, 'stale')
  }
  return out
}
