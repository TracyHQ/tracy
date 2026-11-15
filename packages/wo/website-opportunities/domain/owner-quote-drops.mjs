// What becomes of an item the reading read from the owner's chat statement and could not keep (decision D46, #609).
// Its facts are true and must arrive, so it is never dropped in silence: every such drop is recorded with why
// (`ownerItemsDropped: [{group, label, why}]`), and a quote that was not word for word in the statement, a model fault,
// is asked again once on the statement alone (`owner-quote-prompt.mjs`, `withOwnerQuoteRetry`). The item is grounded
// against the passage the model was given (held sentences already out), with the tolerance every quote has
// (`comparable`: compatibility forms, quote marks, spacing and case), never against web text. Pure.
import { OWNER_STATEMENT_KIND } from './owner-statement.mjs'

const list = (v) => (Array.isArray(v) ? v : [])
/** A label as letters and digits only: the ladder cleans a label (spaces, dashes) before it records it. */
const labelKey = (v) =>
  (
    String(v ?? '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).join(' ')

/** The owner's passage among a reading's texts, or null. */
export const ownerPassageIn = (sources) => list(sources).find((s) => s?.kind === OWNER_STATEMENT_KIND) ?? null

/**
 * The texts by ref, the owner's passage also under its kind (`owner-statement`) when no text holds that ref: the
 * message shows it as `[owner] (owner-statement)`, and a model citing either means the same passage.
 */
export function textsByRef(sources) {
  const byRef = new Map(list(sources).map((s) => [s.ref, s]))
  const passage = ownerPassageIn(sources)
  if (passage && !byRef.has(OWNER_STATEMENT_KIND)) byRef.set(OWNER_STATEMENT_KIND, passage)
  return byRef
}

/** Why an owner drop may be asked again: the quote, not the fact, was wrong. */
export const OWNER_RETRYABLE = Object.freeze(['quote_not_found', 'unknown_source'])

/**
 * The record of an item dropped by the reading's check (`checkBusinessReading`), when it is the owner's: read from the
 * passage, or naming no text at all while the owner spoke. Null for any other item, so a reading without an owner
 * statement records nothing new.
 * @param {{group: string, label: string, quote: string, source: any, passage: any, quoted: (q: string, s: any) => boolean}} at
 */
export function ownerDropOf({ group, label, quote, source, passage, quoted, why = null }) {
  if (!passage || (source && source !== passage)) return null
  const reason =
    why ??
    (!label
      ? 'no_label'
      : !source
        ? 'unknown_source'
        : !quoted(quote, source)
          ? 'quote_not_found'
          : 'label_not_grounded')
  return { group, label, why: reason }
}

/** The owner's USP themes the ladder dropped (`checkUspThemesOf`), as owner drops: a theme quoting the passage. */
export function ownerThemeDropsOf(raw, droppedThemes, byRef, passage) {
  if (!passage) return []
  const owners = new Set(
    list(raw)
      .filter((t) => list(t?.quotes).some((q) => byRef.get(String(q?.ref ?? '').trim()) === passage))
      .map((t) => labelKey(t?.label))
  )
  return list(droppedThemes)
    .filter((d) => owners.has(labelKey(d.label)))
    .map((d) => ({ group: 'uspThemes', label: d.label, why: d.why }))
}

/** Whether a reading has an owner drop worth its one retry, never asked before. */
export const needsOwnerQuoteRetry = (read, sources) =>
  Boolean(read) &&
  read.ownerQuoteRetry === undefined &&
  Boolean(ownerPassageIn(sources)) &&
  list(read.ownerItemsDropped).some((d) => OWNER_RETRYABLE.includes(d.why))
