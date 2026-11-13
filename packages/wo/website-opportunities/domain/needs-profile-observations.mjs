// Observations of the needs profile (ticket #592): what each source states, before the merge. Structured listing
// fields, reviews and pictures are taken as they are; a fact the model read is kept only when it cites a known source
// and its evidence is found in that source's own words. Every observation set aside is listed with its reason.
import { ROLE_VOCABULARY_V3, isRole } from './place-content-roles.mjs'
import { ITEM_KINDS, LIST_FACT_KINDS, SINGLE_FACT_KINDS, primaryRoleOf } from './needs-profile-merge.mjs'

const FACT_KINDS = new Set([...SINGLE_FACT_KINDS, ...LIST_FACT_KINDS])
const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const squash = (value) => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

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

/** Observations from structured listing fields, reviews and pictures, taken as they are. */
export function structuredObservations(sources) {
  const facts = []
  const items = []
  for (const source of sources) {
    const ref = { id: source.id, origin: source.origin }
    for (const [kind, raw] of Object.entries(source.fields ?? {})) {
      for (const value of list(Array.isArray(raw) ? raw : [raw]).filter(isText))
        if (FACT_KINDS.has(kind)) facts.push({ kind, value, source: ref })
    }
    for (const r of list(source.reviews).filter((r) => isText(r?.text))) {
      const fields = { 'quote.text': r.text }
      if (isText(r.author)) fields['quote.author_name'] = r.author
      if (r.rating !== undefined) fields['quote.rating_or_source'] = String(r.rating)
      items.push({ kind: 'quote', fields, source: ref })
    }
    for (const p of list(source.pictures).filter((p) => isText(p?.ref))) {
      const label = isText(p.label) ? p.label : null
      items.push({
        kind: 'gallery',
        fields: { 'business.gallery_image': p.ref },
        label,
        alt: isText(p.alt) ? p.alt : null,
        source: ref,
        pictureId: p.id
      })
    }
  }
  return { facts, items }
}

/** Model observations kept only when grounded in a known source; every other one goes to `dropped` with its reason. */
export function modelObservations(reading, sources) {
  const byId = new Map(sources.map((s) => [s.id, s]))
  const corpus = new Map(sources.map((s) => [s.id, corpusOf(s)]))
  const dropped = []
  const facts = []
  const items = []
  const grounded = (obs, what) => {
    const source = byId.get(obs?.source)
    if (!source) {
      dropped.push({ ...what, reason: 'unknown source' })
      return null
    }
    if (!isText(obs.evidence) || !corpus.get(source.id).includes(squash(obs.evidence))) {
      dropped.push({ ...what, source: source.id, reason: 'evidence not found in the source' })
      return null
    }
    return { id: source.id, origin: source.origin }
  }
  for (const f of list(reading.facts)) {
    const what = { kind: f?.kind, value: f?.value }
    if (!FACT_KINDS.has(f?.kind) || !isText(f?.value)) {
      dropped.push({ ...what, reason: 'not a fact kind of the needs profile' })
      continue
    }
    const source = grounded(f, what)
    if (source) facts.push({ kind: f.kind, value: f.value.trim(), source })
  }
  for (const it of list(reading.items)) {
    const what = { kind: it?.kind }
    const prefix = ITEM_KINDS[it?.kind]
    if (!prefix || it.kind === 'gallery') {
      dropped.push({ ...what, reason: 'not an item kind the model reads' })
      continue
    }
    const fields = Object.fromEntries(
      Object.entries(it.fields ?? {}).filter(
        ([role, v]) => role.startsWith(prefix) && isRole(role, ROLE_VOCABULARY_V3) && isText(v)
      )
    )
    if (!isText(fields[primaryRoleOf(it.kind)])) {
      dropped.push({ ...what, reason: `missing ${primaryRoleOf(it.kind)}` })
      continue
    }
    const source = grounded(it, what)
    if (source) items.push({ kind: it.kind, fields, source })
  }
  return { facts, items, dropped }
}
