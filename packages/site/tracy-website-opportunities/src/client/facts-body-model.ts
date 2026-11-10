/**
 * The body of the Business facts row in the Workspace card (#537, option B): a fixed grid of facts in two columns on
 * the left and a strip of three to six square media tiles on the right. Every slot is always there, so the body never changes height: a fact the
 * research has not found reads NA (or Collecting… while research runs). Reads the same views the Business facts
 * sub-page reads; nothing is decided here.
 */
import { profileFields, type MediaRowView, type MediaTile } from './detail-model.ts'
import { hoursRowView } from './profile-hours-model.ts'
import { phonesView } from './profile-phones-model.ts'
import { ratingRowView, ratingText } from './profile-rating-model.ts'

type Rec = Record<string, unknown>

/** The strip shows at least STRIP_SLOTS square slots and at most STRIP_MAX tiles, as the room allows (CSS decides). */
export const STRIP_SLOTS = 3
export const STRIP_MAX = 6

export type FactId =
  | 'name'
  | 'address'
  | 'hours'
  | 'about'
  | 'phone'
  | 'website'
  | 'rating'
  | 'followers'
  | 'spare'

export type FactValue =
  /** Text as the sources wrote it; title holds the whole of it for an ellipsised slot. */
  | { kind: 'text'; text: string; title: string }
  /** A sentence of the interface (`t(key, params)`); title, when set, holds the source text in full. */
  | { kind: 'say'; key: string; params: Record<string, string | number>; title: string | null }
  | { kind: 'link'; url: string; host: string }

export interface Fact {
  id: FactId
  /** The label's string key; null for the reserved empty slot. */
  labelKey: string | null
  /** null: not found (NA, or Collecting… while research runs). */
  value: FactValue | null
}

export interface FactsBodyView {
  /** Name, Address, Hours, About. */
  left: Fact[]
  /** Phone, Website, Rating, then Instagram followers or a reserved empty slot. */
  right: Fact[]
  /** The first stored items, photos then videos, at most STRIP_MAX of them. */
  tiles: MediaTile[]
  /** Every stored photo and video; a tile's rest count is total minus its 1-based place. */
  total: number
  counts: { photos: number; videos: number }
  /** Research is running: a missing fact reads Collecting… instead of NA. */
  running: boolean
}

export interface FactsBodyInput {
  profile: Rec | null
  candidate: Rec
  /** The name the site carries (the person's pick, else the one the sources agree on, else the listing's). */
  name: string | null
  media: MediaRowView
  running: boolean
  /** Today's weekday, 0 for Sunday (Date.getDay()). */
  today: number
  locale: string
}

const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const plain = (s: string | null): FactValue | null =>
  s === null ? null : { kind: 'text', text: s.replace(/\s+/g, ' '), title: s }

/** Hours lines name their days in English (Google's weekday descriptions). */
/** The dash between two times: a hyphen, an en dash or an em dash (code points, so the source holds no long dash). */
const RANGE = new RegExp(`\\s*[-${String.fromCharCode(0x2013, 0x2014)}]\\s*`)

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** One line for the hours: today's times when a line names today, else every line joined. */
export function hoursSummary(lines: string[], today: number): FactValue | null {
  if (lines.length === 0) return null
  const title = lines.join('\n')
  const day = WEEKDAYS[today] ?? ''
  const line = lines.find((l) => l.toLowerCase().startsWith(day.toLowerCase()) && day !== '')
  if (line === undefined) return { kind: 'text', text: lines.join(' · '), title }
  const at = line.indexOf(':')
  const times = (at < 0 ? line : line.slice(at + 1)).trim()
  // "9:00 AM to 9:00 PM" written with a dash reads "Open today 9:00 AM to 9:00 PM"; "Closed" reads "Today: Closed".
  const range = times.split(RANGE)
  if (range.length === 2 && range[0] !== '' && range[1] !== '')
    return { kind: 'say', key: 'facts.body.hoursToday', params: { from: range[0], to: range[1] }, title }
  return { kind: 'say', key: 'facts.body.hoursTodayText', params: { times }, title }
}

function websiteValue(raw: unknown): FactValue | null {
  const url = text(raw)
  if (url === null || !/^https?:\/\//i.test(url)) return null
  try {
    return { kind: 'link', url, host: new URL(url).host.replace(/^www\./, '') }
  } catch {
    return null
  }
}

function ratingValue(profile: Rec | null, locale: string): FactValue | null {
  const rating = ratingRowView(profile)
  if (rating === null) return null
  const score = ratingText(rating.score, locale)
  if (rating.reviews === null)
    return { kind: 'say', key: 'facts.body.ratingNoCount', params: { rating: score }, title: null }
  return {
    kind: 'say',
    key: rating.reviews === 1 ? 'facts.body.ratingOne' : 'facts.body.ratingMany',
    params: { rating: score, count: new Intl.NumberFormat(locale).format(rating.reviews) },
    title: null
  }
}

/** Instagram followers, the one extra fact worth the slot; null when the research did not count them. */
function followersFact(profile: Rec | null, locale: string): Fact {
  const followers = rec(rec(profile?.socialStats).instagram).followers
  if (typeof followers !== 'number' || !Number.isFinite(followers) || followers < 0)
    return { id: 'spare', labelKey: null, value: null }
  return {
    id: 'followers',
    labelKey: 'facts.body.instagram',
    value: {
      kind: 'say',
      key: followers === 1 ? 'facts.body.followersOne' : 'facts.body.followersMany',
      params: { count: new Intl.NumberFormat(locale).format(followers) },
      title: null
    }
  }
}

export function factsBodyView(input: FactsBodyInput): FactsBodyView {
  const { profile, candidate, media, locale } = input
  const rows = profileFields(profile)
  const field = (f: string): string | null => rows.find((r) => r.field === f)?.value ?? null
  const hours = hoursRowView(profile)
  const about = field('bio')
  const photos = media.photos.groups.flatMap((g) => g.tiles).filter((m) => m.stored)
  const videos = media.videos.tiles.filter((m) => m.stored)
  const items = [...photos, ...videos]
  return {
    left: [
      { id: 'name', labelKey: 'field.name', value: plain(text(input.name) ?? field('name')) },
      { id: 'address', labelKey: 'field.address', value: plain(field('address') ?? text(candidate.address)) },
      {
        id: 'hours',
        labelKey: 'facts.body.hours',
        value: hours === null || hours.left ? null : hoursSummary(hours.hours, input.today)
      },
      // About keeps its line breaks for the two clamped lines; the title holds the whole text.
      {
        id: 'about',
        labelKey: 'field.bio',
        value: about === null ? null : { kind: 'text', text: about, title: about }
      }
    ],
    right: [
      {
        id: 'phone',
        labelKey: 'field.phone',
        value: plain(phonesView(profile)?.main ?? text(candidate.phone))
      },
      { id: 'website', labelKey: 'field.website', value: websiteValue(candidate.website) },
      { id: 'rating', labelKey: 'facts.body.rating', value: ratingValue(profile, locale) },
      followersFact(profile, locale)
    ],
    tiles: items.slice(0, STRIP_MAX),
    total: items.length,
    counts: { photos: photos.length, videos: videos.length },
    running: input.running
  }
}
