// What one copy field may state, from its own block (#575, the step chain's W04 and W05 adapted,
// `apps/tracy-web/src/site-writer/copy-check/rules-facts.js`). The step chain held each slot's numbers, times, prices,
// phones, emails and links to the facts that slot cites; the build chat has no per field citation, so a field is held to
// the data of the BLOCK that holds it: its facts and items (`block.data`), the rows of its lists, the owner's facts
// placed on it, and the counts of the distinct items and rows it shows (the step chain's "a count of the distinct items
// the cited facts name is such a fact"). The page's search texts cite no fact, as alt text and titles did not: they keep
// the whole plan data. Pure.
import { numberForm, numbersOf } from './copy-claims.mjs'
import { OWNER_FACT_DATA_KIND } from './page-writer-owner-facts.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const textOf = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : value)
/** The kind of a count the block shows: a plain number the copy may state. */
export const BLOCK_COUNT_KIND = 'block.count'

/** Every value of one plan id as `{kind, value}`: a fact's value, or an item's field values. */
function entriesOfId(id, data) {
  const entry = data.byId.get(id)
  if (entry?.what === 'fact') return [{ kind: entry.kind ?? null, value: textOf(entry.entry.value) }]
  if (entry?.what === 'item')
    return Object.entries(entry.source?.fields ?? {}).flatMap(([kind, f]) =>
      [f?.value].flat().map((value) => ({ kind, value: textOf(value) }))
    )
  const row = data.rowsById?.get(id)
  if (row)
    return Object.entries(row.values).flatMap(([kind, v]) =>
      [v].flat().map((value) => ({ kind, value: textOf(value) }))
    )
  return []
}

/** Every row of a block's lists, nested rows included, as its data id; and how many rows each list holds. */
function rowsOfBlock(block) {
  const ids = []
  const counts = []
  const walk = (planned) => {
    const rows = list(planned?.rows)
    if (rows.length) counts.push(rows.length)
    for (const row of rows) {
      if (isText(row?.data)) ids.push(row.data)
      for (const nested of list(row?.lists)) walk(nested)
    }
  }
  for (const planned of list(block?.lists)) walk(planned)
  return { ids, counts }
}

/**
 * The values a copy field of `block` may state: its own data, its rows, the owner's facts placed on it and its counts.
 * @param {object} block a plan block (`{id, data, lists}`)
 * @param {{byId: Map, rowsById?: Map}} data the plan data (`planDataOf`)
 * @param {object[]} [ownerFacts] the owner's facts placed on this block (`placeOwnerFacts`)
 * @param {number} [cards] the trade cards the block holds (`trade-cards.mjs`)
 * @returns {Array<{kind: string | null, value: string}>}
 */
export function blockKnownOf(block, data, ownerFacts = [], cards = 0) {
  const ids = list(block?.data)
  const rows = rowsOfBlock(block)
  const items = ids.filter((id) => data.byId.get(id)?.what === 'item').length
  const counts = [items, cards, ...rows.counts].filter((n) => n > 0)
  return [
    ...ids.flatMap((id) => entriesOfId(id, data)),
    ...rows.ids.flatMap((id) => entriesOfId(id, data)),
    ...list(ownerFacts).flatMap((f) =>
      [f.text, ...list(f.candidates), ...list(f.mention).map((m) => m.value)].map((value) => ({
        kind: OWNER_FACT_DATA_KIND,
        value
      }))
    ),
    ...counts.map((n) => ({ kind: BLOCK_COUNT_KIND, value: String(n) }))
  ].filter((e) => isText(e.value))
}

/** Each field's own scope, by block id, for every block of a page. */
export function scopesOfPage(page, data, ownerFactsByBlock, cardsByBlock = new Map()) {
  return new Map(
    list(page.blocks).map((block) => [
      block.id,
      blockKnownOf(block, data, ownerFactsByBlock?.get(block.id), cardsByBlock.get(block.id)?.length ?? 0)
    ])
  )
}

const QUOTE = /"([^"]+)"|“([^”]+)”|«([^»]+)»|„([^“”]+)[“”]/gu
/** A quoted passage of fewer words is a term, not a quotation (the step chain's shortest repeat, three words). */
const QUOTE_MIN_WORDS = 3
const plain = (s) =>
  String(s)
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?…]+|[\s.,;:!?…]+$/g, '')
    .toLowerCase()

/**
 * The quoted passages of `value` that are no exact passage of a review the field's own data holds (W05 adapted):
 * reviews are shown from the data, the writer never quotes anyone in its own words.
 * @param {string} value a written copy value
 * @param {Array<{kind: string | null, value: string}>} known the field's scope (`blockKnownOf`)
 */
export function quotesNotInReviews(value, known) {
  const reviews = list(known)
    .filter((e) => /review|testimonial|quote/.test(e.kind ?? ''))
    .map((e) => plain(e.value))
  const out = []
  for (const m of String(value).matchAll(QUOTE)) {
    const passage = plain(m[1] ?? m[2] ?? m[3] ?? m[4])
    if (passage.split(' ').length < QUOTE_MIN_WORDS) continue
    if (!reviews.some((r) => r.includes(passage))) out.push(passage)
  }
  return out
}

const DIGITS = /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*/gu

/**
 * The numbers in digits of `value` that no value of the field's scope writes (W04: "every number appears in the value
 * of a fact the slot cites"; the step chain read every digit run, not only a number in a claim). A number word of the
 * data backs its digits ("four classes" backs "4"); a count of the block's items or rows is in the scope.
 * @param {string} value a written copy value
 * @param {Array<{kind: string | null, value: string}>} known the field's scope (`blockKnownOf`)
 */
export function numbersNotInScope(value, known) {
  const backed = new Set(list(known).flatMap((e) => numbersOf(e.value)))
  const out = []
  for (const m of String(value).matchAll(DIGITS)) if (!backed.has(numberForm(m[0]))) out.push(m[0])
  return [...new Set(out)]
}
