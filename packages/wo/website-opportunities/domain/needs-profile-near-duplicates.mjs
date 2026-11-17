// Near duplicate services of the needs profile (#609, a real run): one page can name the same offer twice, once as a
// heading and once with a leading label or the business's name before it ("Muay Thai Basics Course" beside
// "Tidewater - Muay Thai Basics Course"). The merge (`needs-profile-merge.mjs`) joins only names that are equal, so both
// reached the plan, which placed one and left the other out. Pure: after the merge, two services (or two packages)
// stated by the same sources are one offer when their names are equal once
//   - case, accents, punctuation and hyphens are folded away (`Self-Defense` is `self defense`),
//   - the words of the business's own name are taken out, and
//   - a leading label set apart by a separator (` - `, `: `, ` | `, a dash) is taken out,
// so one name holds the other whole and adds only such words. Two offers that merely share words ("Muay Thai Basics
// Course" and "Muay Thai Sparring Course", "Boxing Classes" and "Kids Boxing Classes") stay two.
// The better one is kept: the one with a description or a price, else the shorter name. It takes every field it lacks
// and every source and row of the other. Each merge is recorded in `merged` with its code, its reason and the whole
// record merged away (`item`), so the items in are the items kept plus the items merged, and a merge can be undone.
import { primaryRoleOf } from './needs-profile-merge.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const OFFERS = ['service', 'package']
/** The fields that make one of two near duplicates the better one. */
const RICH_ROLES = Object.freeze({
  service: ['offering.description', 'offering.price'],
  package: ['package.price', 'package.period']
})
export const NEAR_DUPLICATE_CODE = 'near_duplicate_merged'
export const NEAR_DUPLICATE_REASON =
  "the same offer named twice by the same sources: the names are equal once case, punctuation, the business's own name and a leading label are set aside"

/**
 * Letters and digits only, lower case, accents and punctuation (hyphens too) folded to single spaces, a possessive
 * `'s` taken off ("Tidewater's" is "tidewater").
 */
export const foldName = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’]s\b/gu, '')
    .replace(/['’]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** A leading label set apart by a separator: the words before ` - `, `: `, ` | ` or a dash. */
const LEADING_LABEL = /^[^:|\u2013\u2014]+?(?:\s+-\s+|\s*[:|]\s+|\s*[\u2013\u2014]\s*)(?=\S)/u

/**
 * The words of a name that say which offer it is: the name folded, its leading label and the business's name words
 * taken out. A name made only of such words keeps its folded form, so it is never empty.
 */
export function coreOfName(name, businessWords = new Set()) {
  const raw = String(name ?? '').trim()
  const unlabelled = raw.replace(LEADING_LABEL, '')
  const words = foldName(unlabelled || raw)
    .split(' ')
    .filter((w) => w && !businessWords.has(w))
  return words.length ? words.join(' ') : foldName(raw)
}

/** The words of the business's own name, folded ("Tidewater's Gym" gives tidewater, gym). */
export const businessWordsOf = (name) => new Set(foldName(name).split(' ').filter(Boolean))

const sameSources = (a, b) => {
  const x = new Set(list(a.sources))
  return x.size === new Set(list(b.sources)).size && list(b.sources).every((s) => x.has(s))
}
const nameOf = (item, kind) => String(item.fields?.[primaryRoleOf(kind)]?.value ?? '')
const isRich = (item, kind) => RICH_ROLES[kind].some((role) => item.fields?.[role] !== undefined)

/** Of two near duplicates, the one to keep: a description or a price first, then the shorter name, then the first. */
function better(a, b, kind) {
  if (isRich(a, kind) !== isRich(b, kind)) return isRich(a, kind) ? a : b
  return [...nameOf(b, kind)].length < [...nameOf(a, kind)].length ? b : a
}

/** The kept item takes the fields it lacks, and every source and row of the one it absorbs. */
function absorb(kept, gone) {
  const fields = { ...gone.fields, ...kept.fields }
  const sources = [...new Set([...list(kept.sources), ...list(gone.sources)])]
  const rows = [...list(kept.rows), ...list(gone.rows)]
  return { ...kept, fields, sources, ...(rows.length ? { rows } : {}) }
}

/**
 * The profile's items with near duplicate services and packages merged, and the record of every merge.
 * @param {Record<string, object[]>} items merged items of the needs profile, by kind
 * @param {{businessName?: string | null}} [business] the business's own name, whose words never tell offers apart
 * @returns {{items: Record<string, object[]>, merged: object[]}}
 */
export function mergeNearDuplicates(items, { businessName = null } = {}) {
  const businessWords = businessWordsOf(businessName)
  const out = { ...items }
  const merged = []
  for (const kind of OFFERS) {
    const kept = []
    for (const item of list(items?.[kind])) {
      const core = coreOfName(nameOf(item, kind), businessWords)
      const at = kept.findIndex(
        (k) => sameSources(k, item) && coreOfName(nameOf(k, kind), businessWords) === core
      )
      if (at === -1) {
        kept.push(item)
        continue
      }
      const winner = better(kept[at], item, kind)
      const loser = winner === item ? kept[at] : item
      kept[at] = absorb(winner, loser)
      merged.push({
        from: 'research',
        kind,
        id: loser.id,
        value: nameOf(loser, kind),
        into: winner.id,
        code: NEAR_DUPLICATE_CODE,
        reason: NEAR_DUPLICATE_REASON,
        // The whole record merged away, so a wrong merge can be undone (#575, P8).
        item: loser,
        scope: 'observation'
      })
    }
    if (items?.[kind]) out[kind] = kept
  }
  return { items: out, merged }
}
