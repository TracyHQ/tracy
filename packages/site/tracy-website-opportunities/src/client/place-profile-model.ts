/**
 * The place profile (ADR 0037) as the Details page draws it: facts and quotations in the shape of the document, one
 * coverage row per target. Nothing is invented: a missing field stays missing, a price is shown as printed, and the
 * seven coverage states stay seven (blocked, failed and not applicable are never folded into "not there").
 */
type Rec = Record<string, unknown>

export const COVERAGE_STATUSES = [
  'found',
  'partial',
  'searched_not_found',
  'not_researched',
  'blocked',
  'failed',
  'not_applicable'
] as const
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number]

/** Targets whose absence the seller needs to know about; the other grey rows stay hidden (approved draft, closing note). */
export const IMPORTANT_TARGETS: ReadonlySet<string> = new Set([
  'menu',
  'offerings',
  'prices',
  'hours',
  'phone',
  'media',
  'brand'
])

export interface OfferingView {
  id: string
  name: string
  section: string | null
  description: string | null
  variants: { size: string | null; duration: string | null; price: string | null }[]
}
export interface PersonView {
  id: string
  name: string
  role: string | null
  bio: string | null
}
export interface ClaimView {
  id: string
  label: string
  detail: string | null
}
export interface FaqView {
  id: string
  question: string
  answer: string
}
export interface QuoteView {
  id: string
  kind: string
  text: string
  author: string | null
}
export interface MediaLinkView {
  id: string
  url: string | null
  relations: { relation: string; target: string | null }[]
}
export interface CoverageRowView {
  target: string
  status: CoverageStatus
  tone: 'ok' | 'warn' | 'grey'
  searchedAt: string | null
}
export interface PlaceProfileView {
  offerings: OfferingView[]
  people: PersonView[]
  statistics: ClaimView[]
  recognitions: ClaimView[]
  relationships: ClaimView[]
  faqs: FaqView[]
  quotes: QuoteView[]
  mediaLinks: MediaLinkView[]
  coverage: CoverageRowView[]
}

const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const list = (v: unknown): Rec[] =>
  Array.isArray(v) ? v.filter((x) => x !== null && typeof x === 'object') : []
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** A fact's `{id, value}`; a fact without either is dropped. */
function facts(v: unknown): { id: string; value: Rec }[] {
  return list(v).flatMap((fact) => {
    const id = text(fact.id)
    return id === null ? [] : [{ id, value: rec(fact.value) }]
  })
}

function priceOf(price: unknown): string | null {
  const p = rec(price)
  const raw = text(p.raw)
  if (raw === null) return null
  const conditions = text(p.conditions)
  return conditions === null ? raw : `${raw} · ${conditions}`
}

export const toneOf = (status: CoverageStatus): CoverageRowView['tone'] =>
  status === 'found' ? 'ok' : status === 'searched_not_found' || status === 'not_applicable' ? 'grey' : 'warn'

/** Yellow rows always show; grey ("looked, nothing there" or "does not apply") only for the important targets. */
export const coverageShown = (status: CoverageStatus, target: string): boolean =>
  toneOf(status) !== 'grey' || IMPORTANT_TARGETS.has(target)

/** Awards and partners: the name, then who gave it or what the tie is. */
function claimRows(v: unknown, detailKey: string): ClaimView[] {
  return facts(v).flatMap(({ id, value }) => {
    const name = text(value.name)
    return name === null ? [] : [{ id, label: name, detail: text(value[detailKey]) }]
  })
}

/** `null` when the answer is not a profile document. */
export function placeProfileView(profile: unknown): PlaceProfileView | null {
  const doc = rec(profile)
  if (!Array.isArray(doc.coverage) || typeof doc.schema !== 'string') return null
  const offerings: OfferingView[] = facts(doc.offerings).flatMap(({ id, value }) => {
    const name = text(value.name)
    if (name === null) return []
    return [
      {
        id,
        name,
        section: text(value.section),
        description: text(value.description),
        variants: list(value.variants).map((variant) => {
          const duration = rec(variant.duration)
          const unit = text(duration.unit)
          return {
            size: text(variant.size),
            duration:
              unit !== null && typeof duration.amount === 'number' ? `${duration.amount} ${unit}` : null,
            price: priceOf(variant.price)
          }
        })
      }
    ]
  })
  const people: PersonView[] = facts(doc.people).flatMap(({ id, value }) => {
    const name = text(value.name)
    return name === null ? [] : [{ id, name, role: text(value.role), bio: text(value.bio) }]
  })
  const claims = rec(doc.claims)
  const statistics: ClaimView[] = facts(claims.statistics).flatMap(({ id, value }) => {
    const label = text(value.label)
    if (label === null || typeof value.amount !== 'number') return []
    const unit = text(value.unit)
    return [{ id, label, detail: `${value.amount}${unit === null ? '' : ` ${unit}`}` }]
  })
  const names = new Map<string, string>()
  for (const o of offerings) names.set(o.id, o.name)
  for (const p of people) names.set(p.id, p.name)
  const businessId = text(rec(doc.business).id)
  const mediaLinks: MediaLinkView[] = facts(doc.media).flatMap(({ id, value }) => {
    const relations = list(value.relations).flatMap((r) => {
      const relation = text(r.relation)
      const entity = text(r.entityId)
      return relation === null || entity === null
        ? []
        : [{ relation, target: entity === businessId ? null : (names.get(entity) ?? null) }]
    })
    return relations.length === 0 ? [] : [{ id, url: text(value.url), relations }]
  })
  const coverage: CoverageRowView[] = list(doc.coverage).flatMap((row) => {
    const target = text(row.target)
    const status = COVERAGE_STATUSES.find((s) => s === row.status)
    if (target === null || status === undefined || !coverageShown(status, target)) return []
    return [{ target, status, tone: toneOf(status), searchedAt: text(row.searchedAt) }]
  })
  return {
    recognitions: claimRows(claims.recognitions, 'issuer'),
    relationships: claimRows(claims.relationships, 'description'),
    faqs: facts(doc.faqs).flatMap(({ id, value }) => {
      const question = text(value.question)
      const answer = text(value.answer)
      return question === null || answer === null ? [] : [{ id, question, answer }]
    }),
    quotes: facts(doc.quotes).flatMap(({ id, value }) => {
      const body = text(value.text)
      if (body === null) return []
      return [{ id, kind: text(value.kind) ?? 'post', text: body, author: text(value.author) }]
    }),
    offerings,
    people,
    statistics,
    mediaLinks,
    coverage
  }
}
