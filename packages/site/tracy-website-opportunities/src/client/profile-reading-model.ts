/**
 * The Services, Who it is for, Team and Service area rows of the Details Profile card (#1780), from `profile.readingCard` (the server's
 * reading of the business's bio, posts and reviews, `website-opportunities/domain/business-reading.mjs readingCardOf`).
 * Every item carries the quote it stands on and where the quote is from; nothing is decided here.
 */
type Rec = Record<string, unknown>

export type ReadingSource = 'bio' | 'post' | 'review'
export type ReadingPick = 'remove' | 'restore' | 'show' | 'hide'

export interface ReadingItemView {
  id: string
  label: string
  quote: string
  from: ReadingSource
  /** The post the quote is from, when it has an address. */
  url: string | null
  /** Team only: the role a text gives the person. */
  role: string | null
  /** Removed from the site by the person. */
  removed: boolean
  /** Team only: named only in reviews, off the site until shown. */
  reviewsOnly: boolean
  /** Team only: on the site. */
  onSite: boolean
}

export interface ReadingRowsView {
  /** `services` for a known trade, `offerings` (What it offers) for an unknown one. */
  servicesLabel: 'services' | 'offerings'
  /** The model did not run: rules read the bio and posts only. */
  rules: boolean
  services: ReadingItemView[]
  audience: ReadingItemView[]
  team: ReadingItemView[]
  /** Where the business says it serves ("Locations across Dubai"); never its address. */
  serviceAreas: ReadingItemView[]
}

const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const SOURCES: ReadingSource[] = ['bio', 'post', 'review']

function itemOf(v: unknown): ReadingItemView | null {
  const i = rec(v)
  const id = text(i.id)
  const label = text(i.label)
  const quote = text(i.quote)
  const source = rec(i.source)
  const from = SOURCES.find((s) => s === source.kind)
  if (id === null || label === null || quote === null || from === undefined) return null
  const url = text(source.url)
  return {
    id,
    label,
    quote,
    from,
    url: url !== null && url.startsWith('https://') ? url : null,
    role: text(i.role),
    removed: i.removed === true,
    reviewsOnly: i.reviewsOnly === true,
    onSite: i.onSite !== false
  }
}

const itemsOf = (v: unknown): ReadingItemView[] =>
  (Array.isArray(v) ? v : []).flatMap((i) => {
    const item = itemOf(i)
    return item === null ? [] : [item]
  })

/** The rows, or null when the research read nothing (no reading, or a reading with no item). */
export function readingRowsView(profile: unknown): ReadingRowsView | null {
  const card = rec(rec(profile).readingCard)
  if (card.method !== 'model' && card.method !== 'rules') return null
  const view: ReadingRowsView = {
    servicesLabel: card.trade === 'unknown' ? 'offerings' : 'services',
    rules: card.method === 'rules',
    services: itemsOf(card.services),
    audience: itemsOf(card.audience),
    team: itemsOf(card.team),
    serviceAreas: itemsOf(card.serviceAreas)
  }
  return view.services.length + view.audience.length + view.team.length + view.serviceAreas.length === 0
    ? null
    : view
}

/** What an item offers: Remove or Restore, and for a person named only in reviews Show on the site or Leave off. */
export function readingActions(item: ReadingItemView): ReadingPick[] {
  if (item.removed) return ['restore']
  if (item.reviewsOnly) return [item.onSite ? 'hide' : 'show', 'remove']
  return ['remove']
}
