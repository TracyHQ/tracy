/**
 * The body of the Business facts row in the Workspace card (#537, option F): two small groups of facts (Business,
 * Contact), an About line, and a 3 by 2 photo mosaic. Every fact is always there: a fact not
 * found reads NA (or Collecting… while research runs). Once research made the saved profile (#537 R18) it reads its
 * facts, as the sub-page does: an owner's value shows edited, a fact kept off reads NA. Nothing is decided here.
 */
import { profileFields, type MediaRowView, type MediaTile } from './detail-model.ts'
import { hoursRowView } from './profile-hours-model.ts'
import { phonesView } from './profile-phones-model.ts'
import { ratingRowView, ratingText } from './profile-rating-model.ts'
import { factsBodyFromSaved as fromSaved, followersSlot } from './facts-body-saved.ts'

type Rec = Record<string, unknown>

/** The photo mosaic is always 3 by 2: six tiles, the last one carrying +N for the rest. */
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
  /** Kept off the site by the owner or a rule: the value shows, dimmed (#537 R18). */
  off?: boolean
}

export interface FactsBodyView {
  /** The "Business" group: Name, Hours, Rating. */
  business: Fact[]
  /** The "Contact" group: Phone, Website, Address. */
  contact: Fact[]
  /** The About line under both groups. */
  about: Fact
  /** Instagram followers, shown at the right end of the About line; null when research did not count them. */
  followers: Fact | null
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
  /** The saved profile (`placeProfile.profile`), or null before research made it. */
  saved?: unknown
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

/** Instagram followers, the one extra fact worth the slot; the reserved slot when research did not count them. */
function followersFact(profile: Rec | null, locale: string): Fact {
  const followers = rec(rec(profile?.socialStats).instagram).followers
  if (typeof followers !== 'number' || !Number.isFinite(followers) || followers < 0)
    return { id: 'spare', labelKey: null, value: null }
  return followersSlot(followers, locale)
}

export function factsBodyView(input: FactsBodyInput): FactsBodyView {
  const { profile, candidate, media, locale } = input
  const rows = profileFields(profile)
  const saved = fromSaved(input.saved, locale)
  const raw = (f: string): string | null => rows.find((r) => r.field === f)?.value ?? null
  const rawHours = hoursRowView(profile)
  const hours =
    saved?.hours === undefined ? (rawHours === null || rawHours.left ? null : rawHours.hours) : saved.hours
  // The saved profile's value first (null when kept off), the raw research's where it has none.
  const about = saved?.about === undefined ? raw('bio') : saved.about
  // A photo or video the owner keeps off the site is not a thumbnail of the business (#537 R16).
  const photos = media.photos.groups.flatMap((g) => g.tiles).filter((m) => m.stored && !m.ownerHidden)
  const videos = media.videos.tiles.filter((m) => m.stored && !m.ownerHidden)
  const items = [...photos, ...videos]
  const off = (id: Fact['id']): boolean => saved?.off.has(id as never) === true
  const marked = (facts: Fact[]): Fact[] => facts.map((f) => (off(f.id) ? { ...f, off: true } : f))
  const followers = saved === null ? followersFact(profile, locale) : saved.followers
  return {
    business: marked([
      { id: 'name', labelKey: 'field.name', value: plain(text(input.name) ?? raw('name')) },
      {
        id: 'hours',
        labelKey: 'facts.body.hours',
        value: hours === null ? null : hoursSummary(hours, input.today)
      },
      {
        id: 'rating',
        labelKey: 'facts.body.rating',
        value: saved === null ? ratingValue(profile, locale) : saved.rating
      }
    ]),
    contact: marked([
      {
        id: 'phone',
        labelKey: 'field.phone',
        value: plain(
          saved?.phone === undefined ? (phonesView(profile)?.main ?? text(candidate.phone)) : saved.phone
        )
      },
      { id: 'website', labelKey: 'field.website', value: websiteValue(candidate.website) },
      {
        id: 'address',
        labelKey: 'field.address',
        value: plain(
          saved?.address === undefined ? (raw('address') ?? text(candidate.address)) : saved.address
        )
      }
    ]),
    // About is one muted line; the title holds the whole text.
    about: marked([
      {
        id: 'about',
        labelKey: 'field.bio',
        value: about === null ? null : { kind: 'text', text: about.replace(/\s+/g, ' '), title: about }
      }
    ])[0] as Fact,
    followers: followers.labelKey === null ? null : (marked([followers])[0] ?? null),
    tiles: items.slice(0, STRIP_MAX),
    total: items.length,
    counts: { photos: photos.length, videos: videos.length },
    running: input.running
  }
}
