// Observations of the needs profile (ticket #592): what each source states, before the merge. Structured listing
// fields, reviews and pictures are taken as they are; a fact the model read is kept only when it cites a known source,
// its quote is found in that source's own words and the quote proves the value (`needs-profile-grounding.mjs`).
// Nothing is set aside silently: every observation (or field of one) left out is listed in `dropped` with a `code`
// and a `reason`. `scope` says what was left out: the whole `observation`, or one `field` of it (named in `field`; the
// rest of the observation is kept). A whole item dropped for one field also names that field.
import { ROLE_VOCABULARY_V3, isRole } from './place-content-roles.mjs'
import { ITEM_KINDS, LIST_FACT_KINDS, SINGLE_FACT_KINDS, primaryRoleOf } from './needs-profile-merge.mjs'
import {
  MIN_EVIDENCE_CHARS,
  SUMMARY_ROLES,
  evidenceLongEnough,
  provenBy
} from './needs-profile-grounding.mjs'
import { MAX_ROW_DEPTH, groundRows } from './needs-profile-rows.mjs'

const FACT_KINDS = new Set([...SINGLE_FACT_KINDS, ...LIST_FACT_KINDS])
const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const squash = (value) => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

/** The reason of every drop code. */
const REASONS = Object.freeze({
  unhandled_field_kind: 'not a fact kind of the needs profile',
  not_text: 'the value is not text',
  review_without_text: 'a review without text',
  rating_not_readable: 'the rating is not a number or a text',
  picture_without_ref: 'a picture without a ref',
  unknown_kind: 'not a fact or item kind the model reads',
  missing_primary_field: 'the item has no name field',
  unknown_source: 'unknown source',
  evidence_not_in_source: 'evidence not found in the source',
  evidence_too_short: `evidence shorter than ${MIN_EVIDENCE_CHARS} letters and digits`,
  value_not_in_evidence: 'the value is not in its evidence',
  summary_not_in_evidence: 'the summary carries a name, number, price or link its evidence lacks',
  row_without_fields: 'the row holds no field the profile keeps',
  row_too_deep: `a row nested deeper than ${MAX_ROW_DEPTH} levels`
})
const drop = (code, what, scope = 'observation') => ({ ...what, code, reason: REASONS[code], scope })

/** Everything a source says in words: what a model fact's evidence must be found in. */
const corpusOf = (source) =>
  squash(
    [
      source.text,
      ...list(source.captions),
      ...list(source.reviews).map((r) => r?.text),
      ...list(source.pictures).map((p) => p?.alt)
    ]
      .filter(isText)
      .join('\n')
  )

/** A review's rating as text, or null when it is neither a number nor a text. */
const ratingOf = (rating) =>
  (typeof rating === 'number' && Number.isFinite(rating)) || isText(rating) ? String(rating).trim() : null

/** Observations from structured listing fields, reviews and pictures, taken as they are; the rest goes to `dropped`. */
export function structuredObservations(sources) {
  const facts = []
  const items = []
  const dropped = []
  for (const source of sources) {
    const ref = { id: source.id, origin: source.origin }
    const from = { from: 'research', source: source.id }
    for (const [kind, raw] of Object.entries(source.fields ?? {})) {
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        if (!FACT_KINDS.has(kind)) dropped.push(drop('unhandled_field_kind', { ...from, kind }))
        else if (!isText(value)) dropped.push(drop('not_text', { ...from, kind }))
        else facts.push({ kind, value, source: ref })
      }
    }
    for (const r of list(source.reviews)) {
      if (!isText(r?.text)) {
        dropped.push(drop('review_without_text', { ...from, kind: 'quote' }))
        continue
      }
      const fields = { 'quote.text': r.text }
      if (isText(r.author)) fields['quote.author_name'] = r.author
      if (r.rating !== undefined && r.rating !== null) {
        const rating = ratingOf(r.rating)
        if (rating) fields['quote.rating_or_source'] = rating
        else dropped.push(drop('rating_not_readable', { ...from, field: 'quote.rating_or_source' }, 'field'))
      }
      items.push({ kind: 'quote', fields, source: ref })
    }
    for (const p of list(source.pictures)) {
      if (!isText(p?.ref)) {
        dropped.push(drop('picture_without_ref', { ...from, kind: 'gallery', picture: p?.id ?? null }))
        continue
      }
      items.push({
        kind: 'gallery',
        fields: { 'business.gallery_image': p.ref },
        label: isText(p.label) ? p.label : null,
        alt: isText(p.alt) ? p.alt : null,
        source: ref,
        pictureId: p.id
      })
    }
  }
  return { facts, items, dropped }
}

/** Model observations kept only when grounded in a known source; every other one goes to `dropped` with its code. */
export function modelObservations(reading, sources) {
  const byId = new Map(sources.map((s) => [s.id, s]))
  const corpus = new Map(sources.map((s) => [s.id, corpusOf(s)]))
  const dropped = []
  const facts = []
  const items = []
  const rows = []
  /** The source `obs` cites when its quote is in that source's words, else null (the drop is recorded). */
  const quoted = (obs, what) => {
    const source = byId.get(obs?.source)
    if (!source) return dropped.push(drop('unknown_source', what)) && null
    const at = { ...what, source: source.id }
    if (!isText(obs.evidence) || !corpus.get(source.id).includes(squash(obs.evidence)))
      return dropped.push(drop('evidence_not_in_source', at)) && null
    if (!evidenceLongEnough(obs.evidence)) return dropped.push(drop('evidence_too_short', at)) && null
    return { id: source.id, origin: source.origin }
  }
  for (const f of list(reading.facts)) {
    const what = { from: 'model', kind: f?.kind, value: f?.value }
    if (!FACT_KINDS.has(f?.kind)) {
      dropped.push(drop('unknown_kind', what))
      continue
    }
    if (!isText(f.value)) {
      dropped.push(drop('not_text', what))
      continue
    }
    const source = quoted(f, what)
    if (!source) continue
    if (!provenBy(f.kind, f.value, f.evidence))
      dropped.push(drop('value_not_in_evidence', { ...what, source: source.id }))
    else facts.push({ kind: f.kind, value: f.value.trim(), source })
  }
  for (const it of list(reading.items)) {
    const what = { from: 'model', kind: it?.kind }
    const prefix = ITEM_KINDS[it?.kind]
    if (!prefix || it.kind === 'gallery') {
      dropped.push(drop('unknown_kind', what))
      continue
    }
    const fields = Object.fromEntries(
      Object.entries(it.fields ?? {}).filter(
        ([role, v]) => role.startsWith(prefix) && isRole(role, ROLE_VOCABULARY_V3) && isText(v)
      )
    )
    if (!isText(fields[primaryRoleOf(it.kind)])) {
      dropped.push(drop('missing_primary_field', what))
      continue
    }
    const source = quoted(it, what)
    if (!source) continue
    const at = { ...what, source: source.id }
    // A literal field the quote does not prove drops the whole item; a summary that says more drops that field only.
    const unproven = Object.entries(fields).filter(([role, v]) => !provenBy(role, v, it.evidence))
    const literal = unproven.find(([role]) => !SUMMARY_ROLES.includes(role))
    if (literal) {
      dropped.push(drop('value_not_in_evidence', { ...at, field: literal[0], value: literal[1] }))
      continue
    }
    for (const [role, value] of unproven) {
      dropped.push(drop('summary_not_in_evidence', { ...at, field: role, value }, 'field'))
      delete fields[role]
    }
    const kept = groundRows(it.rows, { quoted, drop, dropped, what, source })
    items.push({ kind: it.kind, fields, source, ...(kept.length ? { rows: kept } : {}) })
  }
  // Rows of the business itself (the lines of its opening times), each citing its own source.
  const sourceOf = (row) => {
    const source = byId.get(row?.source)
    return source ? { id: source.id, origin: source.origin } : null
  }
  rows.push(
    ...groundRows(reading.rows, { quoted, drop, dropped, what: { from: 'model', kind: 'row' }, sourceOf })
  )
  return { facts, items, rows, dropped }
}
