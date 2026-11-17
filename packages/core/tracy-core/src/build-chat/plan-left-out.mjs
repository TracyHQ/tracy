/**
 * The plan card's Left out list (#606, reworked after the #575 walk). The list is for the owner: which of THEIR facts,
 * items and pages the site will not have, and why, short and grouped. A real plan listed 49 lines: a customer's review
 * sentence, one line per reviewer, a page's footer logo and menus, and "2 serviceses". So:
 * - a section of the template left out (`kind: block`: a menu, a footer, a button, a list with fewer rows) is never
 *   listed: it is how the design is filled, not something of the owner's;
 * - a picture spot the template has and nothing fills (of a person, a partner logo, a gallery spot) is never listed
 *   either; the pictures section says what Tracy creates;
 * - an entry that reports an item of the plan (`item`) is grouped with the others of its data kind and reason, and
 *   named by its count in the card's words ("3 reviews"), never by a reviewer or a review's words (`dataKind`);
 * - an entry that reports a fact is named by the fact's label, with its data kind for the card's words (`factKind`);
 * - the same thing left out for the same reason is one line with its `count`. A one word label is made plural only
 *   when it is not one already ("Photo" reads "37 photos", "Services" reads "Services (2)"); a longer one takes its
 *   count after it.
 * Pure.
 */
import { plainTextOf as text } from './plain-text.mjs'

/** Codes of picture spots of the template that stay empty: not something of the owner's (`plan-look-pictures.mjs`). */
const TEMPLATE_SPOT_CODES = new Set(['no_generated_people', 'no_own_logo', 'gallery_own_photos_only'])
/** The item kinds the card counts in words of their own; any other kind is counted as items. */
export const COUNTED_KINDS = new Set(['service', 'person', 'quote', 'gallery'])
const COUNT_WORDS = Object.freeze({
  service: ['service', 'services'],
  person: ['person', 'people'],
  quote: ['review', 'reviews'],
  gallery: ['photo', 'photos'],
  item: ['item', 'items']
})
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const listOr = (value) => (Array.isArray(value) ? value : [])

/**
 * A left out label in plain words. The engine may name a page by its slug ("news-post page"): hyphens between letters
 * become spaces and the first letter is upper case ("News post page").
 */
function plainWordsOf(what) {
  const said = String(what ?? '').replace(/(\p{L})-(?=\p{L})/gu, '$1 ')
  return said.charAt(0).toUpperCase() + said.slice(1)
}

/** "photos" for "Photo": the plural of a one word label, the first letter lower case unless it is an acronym. */
function pluralOf(word) {
  const lower = /^\p{Lu}\p{Lu}/u.test(word) ? word : word.charAt(0).toLowerCase() + word.slice(1)
  if (/(x|z|ch|sh)$/i.test(lower)) return `${lower}es`
  if (/[^aeiou]y$/i.test(lower)) return `${lower.slice(0, -1)}ies`
  return `${lower}s`
}

/** A group's name in English: its count words for a data kind, else its label with its count. */
function countedWhatOf(line, count) {
  if (line.dataKind !== undefined) {
    const [one, many] = COUNT_WORDS[COUNTED_KINDS.has(line.dataKind) ? line.dataKind : 'item']
    return `${count} ${count === 1 ? one : many}`
  }
  if (count === 1) return line.what
  // A one word label already ending in s is no singular to make plural ("Services"): it takes its count after it.
  return /\s/.test(line.what) || /s$/i.test(line.what)
    ? `${line.what} (${count})`
    : `${count} ${pluralOf(line.what)}`
}

/**
 * What was left out, one line per distinct thing and reason, in plan order.
 * @param {any[]} leftOut the plan's left out entries
 * @param {{facts: any[], items: any[]}} plan the plan whose facts and items the entries report
 */
export function leftOutOf(leftOut, plan) {
  const facts = new Map(listOr(plan?.facts).map((f) => [f.id, f]))
  const items = new Map(listOr(plan?.items).map((i) => [i.id, i]))
  const lines = []
  const byKey = new Map()
  for (const l of listOr(leftOut)) {
    if (l?.kind === 'block') continue
    const code = typeof l?.code === 'string' && l.code !== '' ? l.code : null
    if (code !== null && TEMPLATE_SPOT_CODES.has(code)) continue
    const params = code && isPlainObject(l.params) ? l.params : null
    const fact = typeof l.item === 'string' ? facts.get(l.item) : undefined
    const item = typeof l.item === 'string' && !fact ? items.get(l.item) : undefined
    const dataKind = item ? (typeof item.kind === 'string' ? item.kind : 'item') : undefined
    const factKind = fact && typeof fact.kind === 'string' ? fact.kind : undefined
    const what = fact ? text(fact.label ?? fact.kind) : plainWordsOf(text(l.what))
    const reason = text(l.reason)
    // An item counts as many as it stands for (`count`, a set of photos); its own name never reaches the line.
    const n = item && Number.isSafeInteger(item.count) && item.count > 0 ? item.count : 1
    const key = JSON.stringify([dataKind ?? what, l.kind, reason, code, params])
    const seen = byKey.get(key)
    if (seen) {
      seen.count += n
      continue
    }
    const line = {
      what,
      kind: l.kind,
      reason,
      ...(code ? { code } : {}),
      ...(params ? { params } : {}),
      ...(dataKind !== undefined ? { dataKind } : {}),
      ...(factKind !== undefined ? { factKind } : {}),
      count: n
    }
    byKey.set(key, line)
    lines.push(line)
  }
  return lines.map(({ count, ...line }) => {
    if (count === 1 && line.dataKind === undefined) return line
    // A line of a data kind always carries its count: the card says it in its own words.
    return { ...line, what: countedWhatOf(line, count), count }
  })
}
