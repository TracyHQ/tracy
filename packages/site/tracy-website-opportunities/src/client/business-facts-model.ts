/**
 * The Business facts sub-page as stacked fixed-height bands (#537, layout C): what the opportunity payload says,
 * sorted into the business band on top and one band per group of facts (hours, services, about, team, brand, key
 * messages, guest reviews, social pages), each with where its facts come from and whether the seller changed one.
 * Every band is always drawn, with N/A when research found nothing. Nothing is decided here: every value is the
 * server's (`profile`, `candidate`, `approval`), only grouped and labelled for the screen.
 */
import { type SourceLogoKey, sourceLogoKey } from './source-logo.ts'
import { type PhonesView, phonesView } from './profile-phones-model.ts'
import { type RatingRowView, ratingRowView } from './profile-rating-model.ts'
import { type HoursRowView, hoursRowView } from './profile-hours-model.ts'
import { type ReadingItemView, readingRowsView } from './profile-reading-model.ts'
import { type KeyMessageView, keyMessagesView } from './profile-key-messages-model.ts'
import {
  type ChipSourceRow,
  type SourceChipView,
  fieldChip,
  noneChip,
  readingChip,
  youChip
} from './source-chip-model.ts'
import type { SavedBands, SavedFact } from './saved-profile-model.ts'
import { withSavedProfile } from './facts-saved-view.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export const CARD_IDS = [
  'hours',
  'services',
  'about',
  'team',
  'brand',
  'messages',
  'reviews',
  'social'
] as const
export type CardId = (typeof CARD_IDS)[number]

/** Every band of the page, top to bottom: the business band, the cards, Photos & video, Research details. */
export const BAND_IDS = ['business', ...CARD_IDS, 'media', 'research'] as const
export type BandId = (typeof BAND_IDS)[number]

/**
 * The one collapsed height every band has, the same for every business, at three widths of the facts column: [wide
 * page (900px and more), mid page (under 900px), narrow page (under 560px)]. A band is a 40px header row (title, chips,
 * the action cluster) over a 76px body; what does not fit in the body scrolls sideways in one row. Only Edit makes a
 * band taller.
 */
export const BAND_HEIGHT = [118, 118, 118] as const

/** The widths of the facts column where the bands change their paddings and cell widths: mid under the first, narrow under the second. */
export const BAND_BREAKPOINTS = [900, 560] as const

/** One social page or listing the research read or the seller pasted, as a linked chip. */
export interface SocialPageView {
  source: string
  url: string
  logo: SourceLogoKey
}

/** Sources that are not a social page or a listing: the own website, Google's place, searches, files, the seller. */
const NOT_SOCIAL = new Set([
  'website',
  'google-places',
  'google-maps',
  'menu-file',
  'menu-photos',
  'owner',
  'instagram-search',
  'facebook-search'
])

/** The social pages and listings among the source rows, one per page address, in order. */
export function socialPagesOf(rows: readonly ChipSourceRow[]): SocialPageView[] {
  const seen = new Set<string>()
  const out: SocialPageView[] = []
  for (const r of rows) {
    const url = text(r.ref)
    if (url === null || !/^https?:\/\//i.test(url) || NOT_SOCIAL.has(r.source)) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ source: r.source, url, logo: sourceLogoKey(r.source, url) })
  }
  return out
}

/** Where a card's facts come from: a named source (`google-places`, `instagram`…), a kind of text, or the seller. */
export type Origin =
  | { kind: 'source'; source: string }
  | { kind: 'reading'; from: 'bio' | 'post' | 'review' }
  | { kind: 'you' }

/** A seller's edit of a fact: before the facts were approved (or with no approval yet), or after (#537). */
export type EditMark = 'byYou' | 'afterApproval' | null

/**
 * `filled`: the card has its facts. `none`: research ran and found none. `notCollected`: research has not finished,
 * so the card says Not collected yet and holds nothing partial.
 */
export type CardState = 'filled' | 'none' | 'notCollected'

export interface FactsCardView {
  id: CardId
  state: CardState
  origins: Origin[]
  mark: EditMark
  /** The one source chip of a block value (hours, about) in the card header; null when the source is not known. */
  chip: SourceChipView | null
}

export interface ReviewQuoteView {
  /** The server's key of the review (`PUT …/reviews/visibility`), null when the answer gives none. */
  key?: string | null
  /** The owner keeps this review off the site (#537 R16). */
  ownerHidden?: boolean
  /** The review's fact in the saved profile (#537 R18), switched through the facts door when it has no key. */
  factId?: string
  onSite?: boolean
  author: string
  text: string
  rating: number | null
  /** `google` or `tripadvisor`. */
  source: string
}

export interface BusinessCardView {
  name: string
  /** Up to two letters for the mark when there is no logo. */
  initials: string
  /** The brand colours of the mark (background, letters), or null for the neutral tile. */
  markColors: { background: string; letters: string } | null
  category: string | null
  rating: RatingRowView | null
  address: string | null
  phones: PhonesView | null
  website: string | null
  origins: Origin[]
  marks: { address: EditMark; phone: EditMark }
  /** The source chip after each value; null where the payload names no source. */
  chips: {
    name: SourceChipView | null
    rating: SourceChipView | null
    address: SourceChipView | null
    phone: SourceChipView | null
    website: SourceChipView | null
    /** One per other phone, in the order of `phones.others`. */
    others: (SourceChipView | null)[]
  }
  /** The saved profile's phone and address facts (#537 R18), for their Edited chip; absent before research. */
  facts?: { phone: SavedFact | null; address: SavedFact | null }
}

export interface BusinessFactsView {
  /** Research has finished for this card: before it, only what the pasted links gave shows. */
  researched: boolean
  business: BusinessCardView
  cards: FactsCardView[]
  hours: HoursRowView | null
  about: string | null
  services: ReadingItemView[]
  audience: ReadingItemView[]
  serviceAreas: ReadingItemView[]
  team: ReadingItemView[]
  messages: KeyMessageView[]
  reviews: ReviewQuoteView[]
  /** The social pages and listings, each a linked chip with its glyph. */
  social: SocialPageView[]
  /** The source rows (`body.sources`), for each chip's collected time and page address. */
  sources: ChipSourceRow[]
  /** The platform the bio was read from (a reading item from the bio carries none), or null. */
  bioPlatform: string | null
  /** The saved profile sorted into the bands (#537 R18): what the bands read once research made it; null before. */
  saved: SavedBands | null
}

export interface BusinessFactsInput {
  profile: unknown
  /** `opportunity.candidate`: what the search or the pasted links gave. */
  candidate: unknown
  /** The name the site carries (`nameOnSite`). */
  name: string
  researched: boolean
  approval: unknown
  /** When the latest brief was made, or null before the first one. */
  briefCreatedAt: string | null
  /** The brand colours as observed (`colorsView`), primary first. */
  colors: { hex: string; role: string | null }[]
  /** The guest reviews research kept (Google's, then TripAdvisor's). */
  reviews: ReviewQuoteView[]
  /** The source rows of the opportunity (`body.sources`): kind, page address, collected time. */
  sources?: ChipSourceRow[]
  /** The saved profile (`placeProfile.profile` of `GET …/:id`), with the owner's edits laid on (#537 R18). */
  savedProfile?: unknown
}

/** "Tennis & Padel Coach" reads TP; one word gives its first letter; nothing readable gives "?". */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  const letters = words.slice(0, 2).map((w) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ''))[0] ?? '')
  const out = letters.join('').toLocaleUpperCase()
  return out === '' ? '?' : out
}

const HEX = /^#([0-9a-f]{6})$/i
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
/** WCAG contrast ratio of two colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The mark's colours: the brand's first colour behind, its accent for the letters when they read on it (3:1, large
 * text), else white or black, whichever reads better. No usable colour gives null (the neutral tile).
 */
export function markColorsOf(colors: { hex: string; role: string | null }[]): BusinessCardView['markColors'] {
  const usable = colors.filter((c) => HEX.test(c.hex))
  const background = (usable.find((c) => c.role === 'primary') ?? usable[0])?.hex
  if (background === undefined) return null
  const accent = usable.find((c) => c.hex !== background)?.hex
  if (accent !== undefined && contrast(background, accent) >= 3) return { background, letters: accent }
  return {
    background,
    letters: contrast(background, '#ffffff') >= contrast(background, '#000000') ? '#ffffff' : '#000000'
  }
}

/**
 * How a seller's edit of `field` reads. The server keeps one time per edited field (`candidate.profileEdits`); a
 * brief is only made from approved facts, so an edit made after the latest brief, while the facts wait for approval
 * again, was made after approval.
 */
export function editMarkOf(
  input: Pick<BusinessFactsInput, 'profile' | 'candidate' | 'approval' | 'briefCreatedAt'>,
  field: string
): EditMark {
  const edited = rec(input.profile).editedBySeller
  if (!Array.isArray(edited) || !edited.includes(field)) return null
  const at = Date.parse(text(rec(rec(rec(input.candidate).profileEdits)[field]).at) ?? '')
  const brief = Date.parse(input.briefCreatedAt ?? '')
  const waiting = rec(input.approval).profile === 'needed'
  return waiting && Number.isFinite(at) && Number.isFinite(brief) && at > brief ? 'afterApproval' : 'byYou'
}

function uniqueOrigins(list: Origin[]): Origin[] {
  const seen = new Set<string>()
  return list.filter((o) => {
    const key = o.kind === 'source' ? `s:${o.source}` : o.kind === 'reading' ? `r:${o.from}` : 'you'
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The source the server credits a profile field to (`profile.provenance[field].source`); `seller` is the seller. */
function provenanceOrigin(profile: Rec, field: string): Origin | null {
  const source = text(rec(rec(profile.provenance)[field]).source)
  if (source === null) return null
  return source === 'seller' ? { kind: 'you' } : { kind: 'source', source }
}

/**
 * The source of a field's shown value: the one the server credits (`provenance`, the seller for an edit). The name
 * on the site may be another source's word or the seller's pick, so it is credited to the first source that states
 * that very name (`evidence`), and to none when no source does.
 */
function valueSource(profile: Rec, field: string, value: string | null): string | null {
  const credited = text(rec(rec(profile.provenance)[field]).source)
  if (field !== 'name' || credited === 'seller') return credited
  const fold = (v: string) => v.toLocaleLowerCase().replace(/\s+/g, ' ')
  const evidence = rec(profile.evidence).name
  if (value === null || !Array.isArray(evidence)) return null
  const hit = evidence.map(rec).find((e) => fold(text(e.value) ?? '') === fold(value))
  return Array.isArray(hit?.sources) ? text(hit.sources[0]) : null
}

/** The chip of one reading item (services, audience, service area, team). */
export function itemChipOf(view: Pick<BusinessFactsView, 'sources' | 'bioPlatform'>, item: ReadingItemView) {
  if (item.from === 'owner') return youChip()
  const platform = item.from === 'bio' ? view.bioPlatform : (item.platform ?? null)
  return readingChip(item.from, platform, item.url, view.sources)
}

/** The chip of a key message, from the text its first quote stands on; null when the server does not say. */
export function messageChipOf(view: Pick<BusinessFactsView, 'sources' | 'bioPlatform'>, m: KeyMessageView) {
  if (m.from === undefined || m.from === null) return null
  const platform = m.from.kind === 'bio' ? view.bioPlatform : m.from.platform
  return readingChip(m.from.kind, platform, m.from.url, view.sources)
}

/** The chip of a guest review: Review, on Google or TripAdvisor. */
export function reviewChipOf(view: Pick<BusinessFactsView, 'sources'>, r: ReviewQuoteView): SourceChipView {
  return readingChip('review', r.source, null, view.sources)
}

const readingOrigins = (items: { from: ReadingItemView['from'] }[]): Origin[] =>
  uniqueOrigins(items.map((i) => (i.from === 'owner' ? { kind: 'you' } : { kind: 'reading', from: i.from })))

/** The whole sub-page in groups. */
export function businessFactsView(input: BusinessFactsInput): BusinessFactsView {
  const profile = input.researched ? rec(input.profile) : {}
  const candidate = rec(input.candidate)
  const researched = input.researched
  const mark = (field: string): EditMark => (researched ? editMarkOf(input, field) : null)
  const rows = input.sources ?? []
  const editedAt = (field: string): string | null =>
    text(rec(rec(rec(candidate.profileEdits)[field])).at) ?? text(rec(rec(profile.provenance)[field]).seenAt)
  const chipOf = (field: string, value: string | null): SourceChipView | null =>
    researched && value !== null
      ? fieldChip(valueSource(profile, field, value), field, rows, editedAt(field))
      : null
  const bioEvidence = rec(profile.evidence).bio
  const bioFirst = Array.isArray(bioEvidence) ? rec(bioEvidence[0]).sources : null
  const bioCredited = text(rec(rec(profile.provenance).bio).source)
  const bioPlatform =
    (Array.isArray(bioFirst) ? text(bioFirst[0]) : null) ?? (bioCredited === 'seller' ? null : bioCredited)

  const phones = researched ? phonesView(profile) : null
  const candidatePhone = text(candidate.phone)
  const address = (researched ? text(profile.address) : null) ?? text(candidate.address)
  const rating = researched ? ratingRowView(profile) : null
  const business: BusinessCardView = {
    name: input.name,
    initials: initialsOf(input.name),
    markColors: researched ? markColorsOf(input.colors) : null,
    category: text(candidate.category),
    rating,
    address,
    phones:
      phones ?? (candidatePhone === null ? null : { main: candidatePhone, mainWhatsapp: false, others: [] }),
    website: text(candidate.website),
    origins: researched
      ? uniqueOrigins(
          ['name', 'address', 'phone']
            .map((f) => provenanceOrigin(profile, f))
            .filter((o): o is Origin => o !== null)
            .concat(
              (phones?.others ?? []).flatMap((o) =>
                o.sources.map((source) => ({ kind: 'source', source }) as Origin)
              )
            )
        )
      : [],
    marks: { address: mark('address'), phone: mark('phone') },
    chips: {
      name: chipOf('name', input.name),
      // Google's rating, read from the Google Places listing.
      rating: rating === null ? null : fieldChip('google-places', 'rating', rows),
      address: researched && text(profile.address) !== null ? chipOf('address', address) : null,
      phone: phones === null ? null : chipOf('phone', phones.main),
      // The website is the link the search or the seller gave: no source is named. One research did not find says so.
      website: researched && text(candidate.website) === null ? noneChip() : null,
      others: (phones?.others ?? []).map((o) => {
        const first = o.sources[0]
        return first === undefined ? null : fieldChip(first, 'phone', rows)
      })
    }
  }

  const hours = researched ? hoursRowView(profile) : null
  const about = researched ? text(profile.bio) : null
  const reading = researched ? readingRowsView(profile) : null
  const services = reading?.services ?? []
  const audience = reading?.audience ?? []
  const serviceAreas = reading?.serviceAreas ?? []
  const team = reading?.team ?? []
  const messages = researched ? keyMessagesView(profile) : []
  const reviews = researched ? input.reviews : []
  const hasBrand = researched && (input.colors.length > 0 || text(rec(profile.brand).logo) !== null)

  const state = (filled: boolean): CardState => (!researched ? 'notCollected' : filled ? 'filled' : 'none')
  const claims = rec(profile.hoursCheck).claims
  const hoursSource = Array.isArray(claims) ? text(rec(claims[0]).source) : null
  const hoursChoice = text(rec(profile.hoursCheck).choice)
  const social = socialPagesOf(rows)
  const card = (id: CardId, filled: boolean, origins: Origin[], m: EditMark = null): FactsCardView => ({
    id,
    state: state(filled),
    origins: researched && filled ? origins : [],
    mark: m,
    chip: null
  })
  const cards: FactsCardView[] = [
    card(
      'hours',
      hours !== null,
      hoursChoice === 'edit'
        ? [{ kind: 'you' }]
        : hoursSource === null
          ? []
          : [{ kind: 'source', source: hoursSource === 'google' ? 'google-places' : hoursSource }]
    ),
    card(
      'services',
      services.length + audience.length + serviceAreas.length > 0,
      readingOrigins([...services, ...audience, ...serviceAreas])
    ),
    card(
      'about',
      about !== null,
      mark('bio') !== null
        ? [{ kind: 'you' }]
        : [provenanceOrigin(profile, 'bio')].filter((o): o is Origin => o !== null),
      mark('bio')
    ),
    card('team', team.length > 0, readingOrigins(team)),
    card('brand', hasBrand, []),
    card('messages', messages.length > 0, []),
    card('reviews', reviews.length > 0, []),
    // The pasted links are known before research: their band fills as soon as there is one.
    { id: 'social', state: social.length > 0 ? 'filled' : state(false), origins: [], mark: null, chip: null }
  ]
  // Hours and About are one block each: their chip sits once in the card header.
  for (const c of cards) {
    if (c.state !== 'filled') continue
    if (c.id === 'hours')
      c.chip =
        hoursChoice === 'edit'
          ? youChip()
          : hoursSource === null
            ? null
            : fieldChip(hoursSource, 'hours', rows)
    if (c.id === 'about') c.chip = mark('bio') !== null ? youChip(editedAt('bio')) : chipOf('bio', about)
  }
  // Every band stays, the ones research found nothing for read N/A.
  const base: BusinessFactsView = {
    researched,
    business,
    cards,
    hours,
    about,
    services,
    audience,
    serviceAreas,
    team,
    messages,
    reviews,
    social,
    sources: rows,
    bioPlatform: researched ? bioPlatform : null,
    saved: null
  }
  return withSavedProfile(base, input.savedProfile)
}

/** A long guest review cut at a word near `max` characters, with an ellipsis. */
export function clipQuote(quote: string, max = 160): string {
  const flat = quote.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`
}

export type MediaFilter = 'all' | 'photos' | 'videos'

/** The tiles a media filter keeps, in order. */
export function filterMedia<T extends { kind: 'image' | 'video' }>(
  tiles: readonly T[],
  filter: MediaFilter
): T[] {
  if (filter === 'photos') return tiles.filter((m) => m.kind === 'image')
  if (filter === 'videos') return tiles.filter((m) => m.kind === 'video')
  return [...tiles]
}

/** One hours line split into its days and its times ("Monday: Open 24 hours"); a line with no colon is all times. */
export function hoursLineParts(line: string): { days: string; times: string } {
  const at = line.indexOf(': ')
  if (at <= 0) return { days: '', times: line }
  return { days: line.slice(0, at), times: line.slice(at + 2) }
}
