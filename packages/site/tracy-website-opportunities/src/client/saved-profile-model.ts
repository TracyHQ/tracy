/**
 * The saved profile (#537 R18) as the Business facts page reads it: every fact of the seven groups (business,
 * offerings, people, claims, quotes, links, extensions) with its path, the kind of value the facts door edits, the
 * owner's marks (`editedByOwner`, `addedByOwner`, `ownerHidden`...) and its first source, sorted into the page's bands.
 * No band knows a trade: whatever research put in a group shows in that group's band, and a fact this screen has no
 * special drawing for is a generic row. Pure; the server decided every value and every `onSite`.
 */
import {
  type ChipSourceRow,
  type SourceChipView,
  fieldChip,
  readingChip,
  youChip
} from './source-chip-model.ts'
import { FACT_GROUPS, type FactGroup, type FactKind, factKindOf } from './fact-kind.ts'

export type { FactGroup, FactKind }

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v)
const rec = (v: unknown): Rec => (isRec(v) ? v : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export interface SavedFact {
  id: string
  group: FactGroup
  /** Where the fact sits: `['business', 'hours']`, `['claims', 'statistics', '0']`. */
  path: string[]
  /** What names the fact: the business or extension key, the claims list, else the group. */
  key: string
  value: unknown
  kind: FactKind | null
  onSite: boolean
  edited: boolean
  /** What research read, when the owner edited the value; undefined otherwise. */
  researchValue: unknown
  editedAt: string | null
  added: boolean
  ownerHidden: boolean
  reviewKey: string | null
  teamMemberId: string | null
  photoMediaId: string | null
  replacedBy: string | null
  /** The kind and page of the source its first evidence cites (`instagram`, `google-places`, `owner`...). */
  sourceKind: string | null
  sourceRef: string | null
}

/** Every fact of the seven groups, in profile order; empty when the answer holds no saved profile. */
export function savedFactsOf(profile: unknown): SavedFact[] {
  const doc = rec(profile)
  const kinds = new Map<string, { kind: string | null; ref: string | null }>()
  for (const s of Array.isArray(doc.sources) ? doc.sources : [])
    if (typeof rec(s).id === 'string')
      kinds.set(rec(s).id as string, { kind: text(rec(s).kind), ref: text(rec(s).ref) })
  const evidence = new Map<string, string>()
  for (const e of Array.isArray(doc.evidence) ? doc.evidence : [])
    if (typeof rec(e).id === 'string') evidence.set(rec(e).id as string, String(rec(e).sourceId ?? ''))
  const out: SavedFact[] = []
  const walk = (value: unknown, group: FactGroup, path: string[]): void => {
    if (value === null || typeof value !== 'object') return
    const f = value as Rec
    if ('value' in f && Array.isArray(f.evidenceRefs)) {
      if (typeof f.id !== 'string') return
      const source = kinds.get(evidence.get(String(f.evidenceRefs[0])) ?? '')
      const key =
        group === 'business' || group === 'extensions' || group === 'claims' ? (path[1] ?? group) : group
      out.push({
        id: f.id,
        group,
        path,
        key,
        value: f.value,
        kind: factKindOf(group, key, f.value),
        onSite: f.onSite !== false,
        edited: f.editedByOwner === true,
        researchValue: f.editedByOwner === true ? f.researchValue : undefined,
        editedAt: text(f.editedAt),
        added: f.addedByOwner === true,
        ownerHidden: f.ownerHidden === true,
        reviewKey: text(f.reviewKey),
        teamMemberId: text(f.teamMemberId),
        photoMediaId: text(f.photoMediaId),
        replacedBy: text(f.replacedBy),
        sourceKind: source?.kind ?? null,
        sourceRef: source?.ref ?? null
      })
      return
    }
    for (const [k, child] of Object.entries(f)) walk(child, group, [...path, k])
  }
  for (const group of FACT_GROUPS) walk(doc[group], group, [group])
  return out
}

/**
 * Business keys that only repeat or take apart a fact the business band already draws (Google's raw duplicates): the
 * coordinates and parts of the address, the phone in other formats, the place's own ids and map links. The server's
 * brief skips them for the same reason (`brief-facts.mjs` STATED_BUSINESS); the owner does not review them, so the band
 * leaves them out. Any other unknown key still gets its generic cell.
 */
export const RAW_BUSINESS_DUPLICATES: ReadonlySet<string> = new Set([
  'location',
  'viewport',
  'addressComponents',
  'formattedAddress',
  'shortFormattedAddress',
  'adrFormatAddress',
  'postalAddress',
  'plusCode',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'placeId',
  'googleMapsUri',
  'googleMapsUrl',
  'mapsUrl',
  'utcOffsetMinutes'
])

/** The facts of the Hours and amenities band, by business key. */
export const HOURS_BAND_KEYS = ['hours', 'amenities', 'reservable'] as const

/** The saved profile sorted into the bands of the page. */
export interface SavedBands {
  /** The business group (but the Hours and amenities facts and Google's raw duplicates) and the extensions. */
  business: SavedFact[]
  hours: SavedFact | null
  amenities: SavedFact | null
  reservable: SavedFact | null
  offerings: SavedFact[]
  people: SavedFact[]
  /** The quotes that are no guest review (the bio, posts, summaries) and the claims in words. */
  about: SavedFact[]
  /** The guest reviews, one per review (two sources quoting the same review are one card). */
  reviews: SavedFact[]
  /** Counts: rating and review count (the reviews band), followers, posts... (beside their link). */
  statistics: SavedFact[]
  links: SavedFact[]
}

const STATS_OF_REVIEWS = new Set(['rating', 'reviewCount'])

/** The page's bands of a saved profile; null when the answer holds none (before research). */
export function savedBandsOf(profile: unknown): SavedBands | null {
  if (!isRec(profile) || !isRec(profile.business)) return null
  const facts = savedFactsOf(profile)
  const of = (group: FactGroup) => facts.filter((f) => f.group === group)
  const one = (key: string) => facts.find((f) => f.group === 'business' && f.key === key) ?? null
  const seen = new Set<string>()
  const reviews = of('quotes').filter((f) => {
    if (rec(f.value).kind !== 'review') return false
    const key = f.reviewKey ?? `${rec(f.value).author ?? ''}|${rec(f.value).text ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return {
    business: [
      ...of('business').filter(
        (f) => !(HOURS_BAND_KEYS as readonly string[]).includes(f.key) && !RAW_BUSINESS_DUPLICATES.has(f.key)
      ),
      ...of('extensions')
    ],
    hours: one('hours'),
    amenities: one('amenities'),
    reservable: one('reservable'),
    offerings: of('offerings'),
    people: of('people'),
    about: [
      ...of('quotes').filter((f) => rec(f.value).kind !== 'review'),
      ...of('claims').filter((f) => f.key !== 'statistics')
    ],
    reviews,
    statistics: of('claims').filter((f) => f.key === 'statistics'),
    links: of('links')
  }
}

/** A rating or review count shows in the reviews band; every other count beside its link. */
export const isReviewStat = (f: SavedFact): boolean => STATS_OF_REVIEWS.has(String(rec(f.value).label))

/** The source chip of a fact: You for the owner's value, else the kind of text or page its first evidence cites. */
export function factChipOf(fact: SavedFact, rows: readonly ChipSourceRow[]): SourceChipView | null {
  if (fact.edited || fact.added || fact.sourceKind === 'owner') return youChip(fact.editedAt)
  const source = fact.sourceKind
  if (source === null) return null
  const quote = text(rec(fact.value).kind)
  const page = fact.sourceRef !== null && /^https?:\/\//i.test(fact.sourceRef) ? fact.sourceRef : null
  if (fact.group === 'quotes' && (quote === 'post' || quote === 'review'))
    return readingChip(quote, source, page, rows)
  return fieldChip(source, fact.group === 'quotes' ? 'bio' : fact.key, rows)
}
