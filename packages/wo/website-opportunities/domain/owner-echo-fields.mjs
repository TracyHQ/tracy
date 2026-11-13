// Which field of a reading is a fact value and which is copy, and the echo guard field by field (decision D46, #609).
// The owner's chat statement is a source: its FACTS must arrive and its WORDING must never become copy. So a name or a
// value the owner typed (a person, a place, a service, a role title, a price) is not prose and is not held to the echo
// guard while it has the shape of a name (`owner-name-shape.mjs`; a sentence typed into one is prose, and its fact goes
// to `ownerFacts`); a sentence the site may say (a story line, a key message, a USP line) is. A copy field that
// echoes the owner is dropped from its item and the item's facts stay; an item left with no copy it needs (a story
// line, a key message) is not lost either: its fact moves to `ownerFacts`, which the brief gives the writer as "the
// owner states this; say it in other words" and never as quotable copy. Pure; imports the guard only.
// Every layer's table: section 6 of `docs/references/building-a-site-from-a-business.md`.
import { copiesOwner, hasOwnerEcho } from './owner-echo.mjs'
import {
  fromOwner,
  ownerFactOf,
  ownerQuotes,
  publicQuotesOf,
  statesTagline,
  withOwnerFacts
} from './owner-facts.mjs'
import { NAME_SHAPE_LIMITS, NAME_SHAPE_WHY, nameShapeProblem } from './owner-name-shape.mjs'

export {
  OWNER_FACT_KIND,
  OWNER_TAGLINE_KIND,
  OWNER_TAGLINE_REASON,
  ownerFactOf,
  publicQuotesOf,
  statesTagline,
  withOwnerFacts
} from './owner-facts.mjs'

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

/** The fields an item of a group cannot stand without: dropping one moves the item's fact to `ownerFacts`. */
const NEEDED = Object.freeze({
  ...Object.fromEntries(
    'services audience team serviceAreas story facts keyMessages'.split(' ').map((g) => [g, ['label']])
  ),
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
const isText = (v) => typeof v === 'string' && v.trim() !== ''
const list = (v) => (Array.isArray(v) ? v : [])

/** The copy fields of an item that copy the owner, as records. */
const echoHitsOf = (group, i, echo) =>
  echo
    ? copyFieldsOf(group).flatMap((field) => {
        const hit = isText(i?.[field]) && copiesOwner(i[field], echo, publicQuotesOf(i))
        return hit ? [{ group, field, rule: hit.rule, weight: hit.weight, why: OWNER_ECHO_WHY }] : []
      })
    : []

/** The name fields of an item that have no name's shape (`owner-name-shape.mjs`), as records. */
const nameHitsOf = (group, i, echo) =>
  Object.keys(NAME_SHAPE_LIMITS[group] ?? {}).flatMap((field) => {
    const at = {
      group,
      field,
      echo,
      publicTexts: publicQuotesOf(i),
      owner: fromOwner(i),
      quotes: ownerQuotes(i)
    }
    const hit = isText(i?.[field]) && nameShapeProblem(i[field], at)
    return hit ? [{ group, field, rule: hit.rule, weight: hit.weight, why: NAME_SHAPE_WHY }] : []
  })

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
      const hits = [...echoHitsOf(group, i, on ? echo : null), ...nameHitsOf(group, i, on ? echo : null)]
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
      // A name field typed as a sentence (a role, a price) is no copy either: its fact is kept for the writer.
      facts.push(
        ...hits.filter((h) => h.why === NAME_SHAPE_WHY).map((h) => ownerFactOf(group, i, n, h.field))
      )
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
