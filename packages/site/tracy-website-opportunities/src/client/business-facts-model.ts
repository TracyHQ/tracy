/**
 * The Business facts sub-page as grouped cards (#537, design A): what the opportunity payload says, sorted into the
 * business card on top and one card per group of facts (hours, services, about, team, brand, key messages, guest
 * reviews), each with where its facts come from and whether the seller changed one. Nothing is decided here: every
 * value is the server's (`profile`, `candidate`, `approval`), only grouped and labelled for the screen.
 */
import { type PhonesView, phonesView } from './profile-phones-model.ts'
import { type RatingRowView, ratingRowView } from './profile-rating-model.ts'
import { type HoursRowView, hoursRowView } from './profile-hours-model.ts'
import { type ReadingItemView, readingRowsView } from './profile-reading-model.ts'
import { type KeyMessageView, keyMessagesView } from './profile-key-messages-model.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export const CARD_IDS = ['hours', 'services', 'about', 'team', 'brand', 'messages', 'reviews'] as const
export type CardId = (typeof CARD_IDS)[number]

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
  /** The column of two (one column on a narrow page, in reading order: left, then right). */
  column: 'left' | 'right'
  state: CardState
  origins: Origin[]
  mark: EditMark
}

export interface ReviewQuoteView {
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

const readingOrigins = (items: { from: 'bio' | 'post' | 'review' }[]): Origin[] =>
  uniqueOrigins(items.map((i) => ({ kind: 'reading', from: i.from })))

/** The whole sub-page in groups. */
export function businessFactsView(input: BusinessFactsInput): BusinessFactsView {
  const profile = input.researched ? rec(input.profile) : {}
  const candidate = rec(input.candidate)
  const researched = input.researched
  const mark = (field: string): EditMark => (researched ? editMarkOf(input, field) : null)

  const phones = researched ? phonesView(profile) : null
  const candidatePhone = text(candidate.phone)
  const business: BusinessCardView = {
    name: input.name,
    initials: initialsOf(input.name),
    markColors: researched ? markColorsOf(input.colors) : null,
    category: text(candidate.category),
    rating: researched ? ratingRowView(profile) : null,
    address: (researched ? text(profile.address) : null) ?? text(candidate.address),
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
    marks: { address: mark('address'), phone: mark('phone') }
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
  const card = (
    id: CardId,
    column: 'left' | 'right',
    filled: boolean,
    origins: Origin[],
    m: EditMark = null
  ): FactsCardView => ({
    id,
    column,
    state: state(filled),
    origins: researched && filled ? origins : [],
    mark: m
  })
  const cards: FactsCardView[] = [
    card(
      'hours',
      'left',
      hours !== null,
      hoursChoice === 'edit'
        ? [{ kind: 'you' }]
        : hoursSource === null
          ? []
          : [{ kind: 'source', source: hoursSource === 'google' ? 'google-places' : hoursSource }]
    ),
    card(
      'services',
      'right',
      services.length + audience.length + serviceAreas.length > 0,
      readingOrigins([...services, ...audience, ...serviceAreas])
    ),
    card(
      'about',
      'right',
      about !== null,
      mark('bio') !== null
        ? [{ kind: 'you' }]
        : [provenanceOrigin(profile, 'bio')].filter((o): o is Origin => o !== null),
      mark('bio')
    ),
    card('team', 'left', team.length > 0, readingOrigins(team)),
    card('brand', 'right', hasBrand, []),
    card('messages', 'left', messages.length > 0, []),
    card('reviews', 'right', reviews.length > 0, [])
  ]
  // A team or guest reviews the research did not find leave no empty card behind; the other groups say Not found.
  const shown = cards.filter((c) => !((c.id === 'team' || c.id === 'reviews') && c.state === 'none'))
  return {
    researched,
    business,
    cards: shown,
    hours,
    about,
    services,
    audience,
    serviceAreas,
    team,
    messages,
    reviews
  }
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
