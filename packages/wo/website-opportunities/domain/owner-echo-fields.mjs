// Which field of a reading is a fact value and which is copy, and the echo guard field by field (decision D46, #609).
// The owner's chat statement is a source: its FACTS must arrive and its WORDING must never become copy. So a name or a
// value the owner typed (a person, a place, a service of any length, a role title, a price) is not prose and is never
// held to the echo guard; a sentence the site may say (a story line, a key message, a USP line) is. A copy field that
// echoes the owner is dropped from its item and the item's facts stay; an item left with no copy it needs (a story
// line, a key message) is not lost either: its fact moves to `ownerFacts`, which the brief gives the writer as "the
// owner states this; say it in other words" and never as quotable copy. Pure; imports the guard only.
// Every layer's table: section 6 of `docs/references/building-a-site-from-a-business.md`.
import { copiesOwner, hasOwnerEcho } from './owner-echo.mjs'

/** A name or a value: a fact as the owner may type it, never held to the echo guard. */
export const NAME = 'name'
/** Words the site may say: held to the echo guard. */
export const COPY = 'copy'
/** A quote or a source's words: evidence, never copy (quotes of the statement are dropped by `readingWithoutOwnerQuotes`). */
export const EVIDENCE = 'evidence'
/** A record: an id, a source, a flag, a reason. Nothing the site says. */
export const RECORD = 'record'

const item = (extra) =>
  Object.freeze({ id: RECORD, quote: EVIDENCE, source: RECORD, mentions: EVIDENCE, ...extra })

/** Every field of every group of a reading (`checkBusinessReading`, the brief's view of it), with its class. */
export const READING_FIELD_CLASSES = Object.freeze({
  services: item({ label: NAME, kind: NAME, price: NAME, basis: RECORD }),
  audience: item({ label: NAME, basis: RECORD }),
  team: item({
    label: NAME,
    role: NAME,
    reviewsOnly: RECORD,
    factId: RECORD,
    onSite: RECORD,
    photoMediaId: RECORD,
    photoAssetId: RECORD
  }),
  serviceAreas: item({ label: NAME }),
  story: item({ label: COPY }),
  facts: item({ label: COPY }),
  keyMessages: Object.freeze({ id: RECORD, label: COPY, quotes: EVIDENCE, basis: RECORD, decidedBy: RECORD }),
  uspThemes: Object.freeze({
    id: RECORD,
    label: COPY,
    line: COPY,
    accent: COPY,
    // Who it serves, as the hero says it beside the line: words of the theme, dropped alone when they echo.
    who: COPY,
    basis: RECORD,
    quotes: EVIDENCE
  }),
  subTrade: Object.freeze({ id: NAME, quotes: EVIDENCE }),
  // The reading's records of what it set aside: names of groups and fields, reasons, weights.
  uspThemesDropped: Object.freeze({ label: RECORD, why: RECORD }),
  ownerEchoDropped: Object.freeze({
    group: RECORD,
    field: RECORD,
    rule: RECORD,
    weight: RECORD,
    why: RECORD,
    kept: RECORD
  }),
  standInDropped: Object.freeze({ group: RECORD, field: RECORD, why: RECORD }),
  ownerFacts: Object.freeze({
    id: RECORD,
    kind: RECORD,
    group: RECORD,
    field: RECORD,
    text: EVIDENCE,
    source: RECORD,
    reason: RECORD
  })
})

/** The copy fields an item of a group cannot stand without: dropping one moves the item's fact to `ownerFacts`. */
const NEEDED = Object.freeze({
  story: ['label'],
  facts: ['label'],
  keyMessages: ['label'],
  uspThemes: ['label', 'line']
})

/** The groups whose items the guard reads. */
export const ECHO_GROUPS = Object.freeze(
  'services audience team story serviceAreas facts keyMessages uspThemes'.split(' ')
)

/** The copy fields of a group, from the table. */
export const copyFieldsOf = (group) =>
  Object.entries(READING_FIELD_CLASSES[group] ?? {})
    .filter(([, c]) => c === COPY)
    .map(([f]) => f)

/** Why an echo was recorded (`ownerEchoDropped[].why`). */
export const OWNER_ECHO_WHY = 'copies_owner_statement'
/** The kind of a fact kept for the writer, and of a tagline the owner states (it waits for a product decision). */
export const OWNER_FACT_KIND = 'owner-fact'
export const OWNER_TAGLINE_KIND = 'owner-tagline'
export const OWNER_TAGLINE_REASON = 'awaits_product_decision'

const OWNER_KIND = 'owner-statement'
const isText = (v) => typeof v === 'string' && v.trim() !== ''
const list = (v) => (Array.isArray(v) ? v : [])
const fromOwner = (x) => x?.kind === OWNER_KIND || x?.source?.kind === OWNER_KIND
/** The owner's quotes an item stands on. */
const ownerQuotes = (i) =>
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

/** An item's fact as the writer reads it (`ownerFacts`): what it says, never to be quoted. */
export function ownerFactOf(group, i, n = 0) {
  const tagline = statesTagline(i)
  const text = group === 'uspThemes' ? i?.line || i?.label : i?.label
  const source = i?.source ?? list(i?.quotes).find(fromOwner)?.source ?? { kind: OWNER_KIND, ref: 'owner' }
  return {
    id: `of_${i?.id ?? `${group}-${n}`}`,
    kind: tagline ? OWNER_TAGLINE_KIND : OWNER_FACT_KIND,
    group,
    text: String(text ?? ''),
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

/**
 * A reading less every copy field that copies the owner (pure, `owner-echo.mjs copiesOwner` against `echo`), the rule
 * above: the field goes and the item stays, unless it was a field the item needs, when the item moves to `ownerFacts`.
 * An item of the statement that states a tagline moves there too, as `owner-tagline` (D46 keeps the owner's wording off
 * the site; whether a tagline is the exception waits for a product decision). Every echo is recorded in
 * `ownerEchoDropped` as `{group, field, rule, weight, why, kept}` (never the text; `kept`: `item`, `owner-fact` or
 * `owner-tagline`); a reading left with no USP theme holds none (`uspThemes: null`, reason `rejected`). Nothing to
 * compare and no tagline, the same object.
 */
export function withoutEchoOf(read, echo) {
  if (!read || typeof read !== 'object') return read
  const on = hasOwnerEcho(echo)
  const out = { ...read }
  const records = []
  const facts = []
  let removed = 0
  for (const group of ECHO_GROUPS) {
    if (!Array.isArray(read[group])) continue
    out[group] = read[group].flatMap((i, n) => {
      const pub = publicQuotesOf(i)
      const hits = on
        ? copyFieldsOf(group).flatMap((field) => {
            const hit = isText(i?.[field]) && copiesOwner(i[field], echo, pub)
            return hit ? [{ group, field, rule: hit.rule, weight: hit.weight, why: OWNER_ECHO_WHY }] : []
          })
        : []
      const tagline = copyFieldsOf(group).length > 0 && statesTagline(i)
      if (!hits.length && !tagline) return [i]
      const needed = tagline || hits.some((h) => (NEEDED[group] ?? []).includes(h.field))
      if (needed) {
        const fact = ownerFactOf(group, i, n)
        facts.push(fact)
        records.push(...hits.map((h) => ({ ...h, kept: fact.kind })))
        removed += 1
        return []
      }
      records.push(...hits.map((h) => ({ ...h, kept: 'item' })))
      const kept = { ...i }
      for (const h of hits) delete kept[h.field]
      return [kept]
    })
  }
  if (!records.length && !facts.length) return read
  if (Array.isArray(read.uspThemes) && read.uspThemes.length && !out.uspThemes.length) {
    out.uspThemes = null
    out.uspThemesReason = 'rejected'
  }
  if (removed) out.dropped = (read.dropped ?? 0) + removed
  if (records.length) out.ownerEchoDropped = [...list(read.ownerEchoDropped), ...records]
  return withOwnerFacts(out, facts)
}
