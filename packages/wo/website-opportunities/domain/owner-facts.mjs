// The owner's facts a reading keeps for the writer (`ownerFacts`, decision D46, #609): an item's fact said in other
// words, never quoted, and the owner's and the public quotes an item stands on. Pure; imports the name shape's whole
// word helper only. `owner-echo-fields.mjs` re-exports what others read.
import { wholeWordsOf } from './owner-name-shape.mjs'

/** The kind of a fact kept for the writer, and of a tagline the owner states (it waits for a product decision). */
export const OWNER_FACT_KIND = 'owner-fact'
export const OWNER_TAGLINE_KIND = 'owner-tagline'
export const OWNER_TAGLINE_REASON = 'awaits_product_decision'

const OWNER_KIND = 'owner-statement'
const isText = (v) => typeof v === 'string' && v.trim() !== ''
const list = (v) => (Array.isArray(v) ? v : [])
export const fromOwner = (x) => x?.kind === OWNER_KIND || x?.source?.kind === OWNER_KIND
/** The owner's quotes an item stands on. */
export const ownerQuotes = (i) =>
  [
    fromOwner(i) ? i.quote : null,
    ...list(i?.quotes)
      .filter(fromOwner)
      .map((q) => q.quote)
  ].filter(isText)
const TAGLINE = /\b(?:tag ?line|slogan|motto|strap ?line)\b/iu
/** Whether the owner's words an item stands on state a tagline (English words only; the doc says so). */
export const statesTagline = (i) => ownerQuotes(i).some((q) => TAGLINE.test(q))

/** The public quotes an item stands on (its quote, mentions and quotes of a text other than the owner's statement). */
export const publicQuotesOf = (i) =>
  [
    ...(i?.source && !fromOwner(i) ? [i.quote] : []),
    ...list(i?.mentions)
      .filter((m) => !fromOwner(m))
      .map((m) => m.quote),
    ...list(i?.quotes)
      .filter((q) => !fromOwner(q))
      .map((q) => q.quote)
  ].filter(isText)

/**
 * An item's fact as the writer reads it (`ownerFacts`): what it says, never to be quoted, as whole words. `field`: one
 * field of the item kept as a fact of its own (a role or a price typed as a sentence), the item staying.
 */
export function ownerFactOf(group, i, n = 0, field = null) {
  const tagline = !field && statesTagline(i)
  const text = field ? i?.[field] : group === 'uspThemes' ? i?.line || i?.label : i?.label
  const source = i?.source ?? list(i?.quotes).find(fromOwner)?.source ?? { kind: OWNER_KIND, ref: 'owner' }
  return {
    id: `of_${i?.id ?? `${group}-${n}`}${field ? `_${field}` : ''}`,
    kind: tagline ? OWNER_TAGLINE_KIND : OWNER_FACT_KIND,
    group,
    ...(field ? { field } : {}),
    text: wholeWordsOf(String(text ?? ''), ownerQuotes(i)),
    source,
    ...(tagline ? { reason: OWNER_TAGLINE_REASON } : {})
  }
}

/** A reading with these facts added to `ownerFacts` (one per id). */
export function withOwnerFacts(read, facts) {
  if (!facts.length) return read
  const all = [...list(read.ownerFacts)]
  for (const f of facts) if (isText(f.text) && !all.some((x) => x.id === f.id)) all.push(f)
  return { ...read, ownerFacts: all }
}
