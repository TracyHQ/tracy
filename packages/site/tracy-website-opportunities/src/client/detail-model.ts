/**
 * An opportunity's answer, read for the screen. Only what the server sent is drawn: an empty field is
 * left out (it belongs in the brief's `missing` list, not on screen as a guess).
 */
import { SOCIAL_NETWORKS, socialLine, type SocialLine } from '@tracy/wo-views/model'

import { toSocialStat } from './flow.ts'
import { buildView, fillState, type BuildView } from './status.ts'

export const PROFILE_FIELDS = ['name', 'branch', 'address', 'phone', 'hours', 'bio'] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]

export interface ProfileRow {
  field: ProfileField
  value: string
  sources: string[]
  /** When the newest source saw it, if the server marked it stale. */
  staleSince: string | null
  conflict: boolean
}

type FieldValue =
  | string
  | {
      value?: unknown
      sources?: unknown
      stale?: { seenAt?: unknown } | boolean | null
      seenAt?: unknown
      conflict?: unknown
      conflicts?: unknown
    }
  | null
  | undefined

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : null

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : []

/** The sources that saw `value` in the server's `evidence[field]` list. */
function evidenceSources(evidence: unknown, value: string): string[] {
  if (!Array.isArray(evidence)) return []
  const key = value.toLowerCase().replace(/\s+/g, ' ')
  const hit = evidence.find(
    (e: unknown) =>
      text((e as { value?: unknown } | null)?.value)
        ?.toLowerCase()
        .replace(/\s+/g, ' ') === key
  ) as { sources?: unknown } | undefined
  return strings(hit?.sources)
}

export function profileFields(profile: Record<string, unknown> | null | undefined): ProfileRow[] {
  if (profile === null || profile === undefined || typeof profile !== 'object') return []
  const evidence = (profile.evidence ?? {}) as Record<string, unknown>
  const conflicts = strings(profile.conflicts)
  const rows: ProfileRow[] = []
  for (const field of PROFILE_FIELDS) {
    const raw = profile[field] as FieldValue
    if (raw === null || raw === undefined) continue
    if (typeof raw !== 'object') {
      const value = text(raw)
      if (value !== null)
        rows.push({
          field,
          value,
          sources: evidenceSources(evidence[field], value),
          staleSince: null,
          conflict: conflicts.includes(field)
        })
      continue
    }
    const value = text(raw.value)
    if (value === null) continue
    const sources = Array.isArray(raw.sources)
      ? raw.sources.filter((s): s is string => typeof s === 'string')
      : []
    const stale = raw.stale
    const staleSince =
      stale && typeof stale === 'object'
        ? text(stale.seenAt)
        : stale === true
          ? (text(raw.seenAt) ?? '')
          : null
    const conflict = raw.conflict === true || (Array.isArray(raw.conflicts) && raw.conflicts.length > 0)
    rows.push({ field, value, sources, staleSince, conflict })
  }
  return rows
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function brandColors(
  brand: { colors?: unknown } | null | undefined
): { hex: string; role: string | null }[] {
  if (!brand || !Array.isArray(brand.colors)) return []
  return brand.colors.flatMap((c: unknown) => {
    const color = c as { hex?: unknown; role?: unknown } | null
    if (!color || typeof color.hex !== 'string' || !HEX.test(color.hex)) return []
    return [{ hex: color.hex.toLowerCase(), role: typeof color.role === 'string' ? color.role : null }]
  })
}

/** The site name the server would give a build now (`GET …/revisions/:revId`), or '' when it sent none. */
export function suggestedLabelOf(answer: { suggestedLabel?: unknown } | null | undefined): string {
  return typeof answer?.suggestedLabel === 'string' ? answer.suggestedLabel : ''
}

/** Build states that end a build without a live site: the revision may be built again. */
const BUILD_ENDED = new Set(['refused', 'failed'])

/** The build a revision page shows: its live one (the server keeps one per revision), else its latest, else none. */
export function shownBuildId(
  builds: ReadonlyArray<{ id?: unknown; state?: unknown }> | null | undefined
): string | null {
  const list = Array.isArray(builds) ? builds.filter((b) => typeof b?.id === 'string') : []
  const live = list.find((b) => !BUILD_ENDED.has(String(b.state ?? '')))
  const shown = live ?? list[0]
  return typeof shown?.id === 'string' ? shown.id : null
}

export interface BuildFailure {
  /** The build's own request id. */
  requestId: string
  /** The demo action that made it: Retry resumes that action on the same build. */
  actionId: string | null
  code: string | null
  /** The host's own words for a failed provision, as it said them; null for a refusal. */
  reason: string | null
}

/** What a stopped build (`GET …/builds/:id`) offers: a retry with its request id, and why it stopped. */
export function buildFailure(
  answer: { build?: Record<string, unknown> | null } | null | undefined
): BuildFailure | null {
  const build = answer?.build
  if (
    !build ||
    !(BUILD_ENDED.has(String(build.state ?? '')) || fillState(build.receipt) === 'failed') ||
    typeof build.requestId !== 'string'
  )
    return null
  const receipt = (build.receipt ?? null) as {
    failure?: { code?: unknown; reason?: unknown }
    body?: { code?: unknown }
    demoActionId?: unknown
    fill?: { code?: unknown }
  } | null
  const code = receipt?.failure?.code ?? receipt?.fill?.code ?? receipt?.body?.code
  const reason = receipt?.failure?.reason
  return {
    requestId: build.requestId,
    actionId: typeof receipt?.demoActionId === 'string' ? receipt.demoActionId : null,
    code: typeof code === 'string' ? code : null,
    reason: typeof reason === 'string' && reason.trim() !== '' ? reason : null
  }
}

export interface BrandObservationView {
  origin: 'website' | 'social'
  colors: { hex: string; role: string | null }[]
  /** No official brand exists yet (`engine.status: 'not_integrated'`): these are observations. */
  observedOnly: boolean
}

/** The profile's `brand` (`{website, social, engine}`): the website's observation, else the social one. */
export function brandObservation(
  brand: Record<string, unknown> | null | undefined
): BrandObservationView | null {
  if (!brand || typeof brand !== 'object') return null
  const pick = (['website', 'social'] as const).find(
    (origin) => brandColors(brand[origin] as { colors?: unknown }).length > 0
  )
  if (pick === undefined) return null
  const engine = brand.engine as { status?: unknown } | null | undefined
  return {
    origin: pick,
    colors: brandColors(brand[pick] as { colors?: unknown }),
    observedOnly: engine?.status !== 'integrated'
  }
}

const MEDIA_CATEGORIES = new Set(['food', 'space', 'event', 'people', 'menu'])
const MEDIA_REASONS = new Set(['too_large', 'download_failed', 'url_blocked'])
export const HIDDEN_REASONS = new Set(['not_stored', 'social-icon', 'map', 'icon', 'tiny', 'decoration'])

export interface MediaTile {
  id: string
  kind: 'image' | 'video'
  category: string
  /** Bytes are in Tracy's store; otherwise only the source address was kept. */
  stored: boolean
  sourceUrl: string | null
  reasonKey: string | null
  /** Where it was collected (`website`, `instagram`, `google-maps`…), null when the server did not say. */
  source: string | null
  /** The credit its licence requires beside it, as a line; null when it needs none. */
  credit: string | null
  width: number | null
  height: number | null
  /** Why the server does not show it as a photograph (`media-junk.js`), null when it does. */
  hidden: string | null
}

/** `{provider, authors: [{displayName}]}` → "Google: Minh, Hoa"; null for anything else. */
export function creditText(raw: unknown): string | null {
  if (!isRecord(raw)) return null
  const provider = text(raw.provider)
  if (provider === null) return null
  const authors = (Array.isArray(raw.authors) ? raw.authors : [])
    .map((a: unknown) => (isRecord(a) ? text(a.displayName) : null))
    .filter((n): n is string => n !== null)
  return authors.length > 0 ? `${provider}: ${authors.join(', ')}` : provider
}

const size = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

export function mediaTile(raw: Record<string, unknown> | null | undefined): MediaTile | null {
  if (!raw || typeof raw.id !== 'string') return null
  const stored = raw.status === undefined || raw.status === 'stored'
  const reason = typeof raw.reason === 'string' ? raw.reason : ''
  return {
    id: raw.id,
    kind: raw.kind === 'video' ? 'video' : 'image',
    category: MEDIA_CATEGORIES.has(String(raw.category)) ? String(raw.category) : 'other',
    stored,
    sourceUrl:
      typeof raw.sourceUrl === 'string' && /^https?:\/\//i.test(raw.sourceUrl) ? raw.sourceUrl : null,
    reasonKey: stored ? null : `media.reason.${MEDIA_REASONS.has(reason) ? reason : 'other'}`,
    source: text(raw.source),
    credit: creditText(raw.credit),
    width: size(raw.width),
    height: size(raw.height),
    hidden: HIDDEN_REASONS.has(String(raw.hidden)) ? String(raw.hidden) : null
  }
}

/** One part of the Media row has data, was searched and is not there, or was not collected (yet). */
export type FieldState = 'found' | 'none' | 'notCollected'

const LOGO_VIA = new Set([
  'social-profile',
  'jsonld-logo',
  'header-img',
  'img-named',
  'apple-touch-icon',
  'og-image',
  'icon'
])
/** A logo this small on its short side is said to be small: kept anyway, redrawn from the original. */
const SMALL_LOGO_EDGE = 480

export type LogoView =
  | {
      state: 'found'
      mediaId: string
      /** `media.logo.from.<via>` */
      viaKey: string
      source: string | null
      width: number | null
      height: number | null
      small: boolean
      recognised: 'vision' | 'words' | null
      transparent: boolean
      candidates: number
    }
  | { state: 'none'; candidates: number }
  | { state: 'notCollected' }

/** The brand's logo state from the place's `brand.logoResearch` and the stored pictures the screen can draw. */
export function logoView(brand: unknown, media: ReadonlyArray<MediaTile>): LogoView {
  const research = isRecord(brand) && isRecord(brand.logoResearch) ? brand.logoResearch : null
  if (research === null) return { state: 'notCollected' }
  const candidates = Array.isArray(research.candidates) ? research.candidates.length : 0
  const chosen = isRecord(research.chosen) ? research.chosen : null
  const mediaId = chosen !== null ? text(chosen.mediaId) : null
  if (
    research.status !== 'found' ||
    chosen === null ||
    mediaId === null ||
    !media.some((m) => m.id === mediaId && m.stored)
  )
    return { state: 'none', candidates }
  const via = text(chosen.via)
  const width = size(chosen.width)
  const height = size(chosen.height)
  return {
    state: 'found',
    mediaId,
    viaKey: `media.logo.from.${via !== null && LOGO_VIA.has(via) ? via : 'other'}`,
    source: text(chosen.source),
    width,
    height,
    small: width !== null && height !== null && Math.min(width, height) < SMALL_LOGO_EDGE,
    recognised: chosen.recognised === 'vision' || chosen.recognised === 'words' ? chosen.recognised : null,
    transparent: chosen.hasAlpha === true,
    candidates
  }
}

export type ColorsView =
  | {
      state: 'found'
      origin: 'website' | 'social'
      colors: { hex: string; role: string | null }[]
      observedOnly: boolean
    }
  | { state: 'none' }
  | { state: 'notCollected' }

export function colorsView(brand: unknown): ColorsView {
  if (!isRecord(brand)) return { state: 'notCollected' }
  const seen = brandObservation(brand)
  return seen === null ? { state: 'none' } : { state: 'found', ...seen }
}

/** The order photos are shown in: what a restaurant site wants first. */
const PHOTO_ORDER = ['food', 'space', 'people', 'event', 'menu', 'other'] as const

export interface PhotoGroup {
  category: string
  tiles: MediaTile[]
}

export interface FileTile {
  url: string
  name: string
  source: string
  /** Dishes read from it, when it was read for the menu. */
  items: number | null
}

/** Sources that can hold a video: a failed one means a video may be missing. */
const VIDEO_SOURCES = new Set(['website', 'instagram', 'facebook', 'tiktok', 'youtube'])

export interface MediaRowView {
  logo: LogoView
  colors: ColorsView
  /** `found`: every picture collected; `shown`: the ones drawn as photographs; `hidden`: the rest, kept and listed on demand. */
  photos: { state: 'found' | 'none'; groups: PhotoGroup[]; found: number; shown: number; hidden: MediaTile[] }
  files: FileTile[]
  videos: { state: 'found' | 'notCollected' | 'hidden'; tiles: MediaTile[] }
}

/** The pictures, files and videos of a place grouped for the Media row (Brand · Photos and files · Video). */
export function mediaRowView({
  profile,
  media,
  sources
}: {
  profile: Record<string, unknown> | null
  media: ReadonlyArray<MediaTile>
  sources: ReadonlyArray<{ source?: unknown; status?: unknown }>
}): MediaRowView {
  const brand = isRecord(profile?.brand) ? profile.brand : null
  const logo = logoView(brand, media)
  // The chosen logo has its own place above: the gallery does not repeat it.
  const own = media.filter((m) => m.kind === 'image' && !(logo.state === 'found' && m.id === logo.mediaId))
  const images = own.filter((m) => m.hidden === null)
  const groups = PHOTO_ORDER.map((category) => ({
    category,
    tiles: images.filter((m) => m.category === category)
  })).filter((g) => g.tiles.length > 0)
  const reads = Array.isArray(profile?.menuReads) ? profile.menuReads : []
  const files: FileTile[] = []
  for (const raw of Array.isArray(profile?.menus) ? profile.menus : []) {
    const url = isRecord(raw) ? text(raw.url) : null
    if (url === null || !/^https?:\/\//i.test(url)) continue
    const path = (() => {
      try {
        return new URL(url).pathname
      } catch {
        return ''
      }
    })()
    if (!/\.pdf$/i.test(path) || files.some((f) => f.url === url)) continue
    const read = reads.find((r: unknown) => isRecord(r) && r.url === url && r.status === 'complete')
    files.push({
      url,
      name: decodeURIComponent(path.split('/').pop() ?? '') || url,
      source: isRecord(raw) ? (text(raw.source) ?? 'website') : 'website',
      items: isRecord(read) && typeof read.items === 'number' ? read.items : null
    })
  }
  const videos = media.filter((m) => m.kind === 'video')
  const videoFailed = sources.some(
    (s) => typeof s.source === 'string' && VIDEO_SOURCES.has(s.source) && s.status === 'failed'
  )
  return {
    logo,
    colors: colorsView(brand),
    photos: {
      state: groups.length > 0 ? 'found' : 'none',
      groups,
      found: own.length,
      shown: images.length,
      hidden: own.filter((m) => m.hidden !== null)
    },
    files,
    videos: { state: videos.length > 0 ? 'found' : videoFailed ? 'notCollected' : 'hidden', tiles: videos }
  }
}

/** Amenity flags Google sends (same list as `AMENITIES` in domain/gplaces-details.mjs); each reads as `amenity.<id>`. */
export const AMENITY_IDS = [
  'servesBreakfast',
  'servesBrunch',
  'servesLunch',
  'servesDinner',
  'servesBeer',
  'servesWine',
  'servesCocktails',
  'servesCoffee',
  'servesDessert',
  'servesVegetarianFood',
  'outdoorSeating',
  'liveMusic',
  'delivery',
  'takeout',
  'dineIn',
  'goodForChildren',
  'goodForGroups',
  'allowsDogs',
  // Attributes any trade can have (Google's restroom, accessibility, parking and payment options).
  'restroom',
  'goodForWatchingSports',
  'curbsidePickup',
  'wheelchairAccessibleEntrance',
  'wheelchairAccessibleParking',
  'wheelchairAccessibleRestroom',
  'wheelchairAccessibleSeating',
  'freeParkingLot',
  'paidParkingLot',
  'freeStreetParking',
  'paidStreetParking',
  'valetParking',
  'freeGarageParking',
  'paidGarageParking',
  'acceptsCreditCards',
  'acceptsDebitCards',
  'acceptsCashOnly',
  'acceptsNfc'
] as const
export type AmenityId = (typeof AMENITY_IDS)[number]

const PRICE_SIGNS: Readonly<Record<string, string>> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$'
}

export type SummaryKind = 'editorial' | 'generative' | 'reviews'
const SUMMARY_KINDS: readonly SummaryKind[] = ['editorial', 'generative', 'reviews']
const MAX_REVIEWS = 5

export interface GooglePlaceView {
  offered: AmenityId[]
  notOffered: AmenityId[]
  /** Book a table: null = Google did not say. */
  reservable: boolean | null
  /** `$`…`$$$$`, `free`, or null. */
  price: string | null
  summaries: { kind: SummaryKind; text: string }[]
  openingHours: string[]
  reviews: {
    author: string
    text: string
    rating: number | null
    authorUri: string | null
    authorAvatarUrl: string | null
  }[]
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The profile's `googlePlace` (placeFactsFromDetails) for the screen; null when it holds nothing to show. */
export function googlePlaceView(raw: unknown): GooglePlaceView | null {
  if (!isRecord(raw)) return null
  const amenities = isRecord(raw.amenities) ? raw.amenities : {}
  const offered = AMENITY_IDS.filter((id) => amenities[id] === true)
  const notOffered = AMENITY_IDS.filter((id) => amenities[id] === false)
  const reservable = typeof raw.reservable === 'boolean' ? raw.reservable : null
  const level = text(raw.priceLevel)
  const price = level === null ? null : level === 'PRICE_LEVEL_FREE' ? 'free' : (PRICE_SIGNS[level] ?? null)
  const summaryMap = isRecord(raw.summaries) ? raw.summaries : {}
  const summaries = SUMMARY_KINDS.flatMap((kind) => {
    const value = text(summaryMap[kind])
    return value === null ? [] : [{ kind, text: value }]
  })
  const openingHours = strings(raw.openingHours).filter((h) => h.trim() !== '')
  const reviews = (Array.isArray(raw.reviews) ? raw.reviews : [])
    .flatMap((r: unknown) => {
      if (!isRecord(r)) return []
      const author = text(r.author)
      const body = text(r.text)
      if (author === null || body === null) return []
      const rating = typeof r.rating === 'number' && Number.isFinite(r.rating) ? r.rating : null
      const googleLink = (value: unknown, avatar = false): string | null => {
        if (typeof value !== 'string') return null
        try {
          const url = new URL(value)
          const host = avatar ? /(^|\.)googleusercontent\.com$/ : /(^|\.)google\.com$/
          return url.protocol === 'https:' && host.test(url.hostname) && !url.username && !url.password
            ? url.href
            : null
        } catch {
          return null
        }
      }
      return [
        {
          author,
          text: body,
          rating,
          authorUri: googleLink(r.authorUri),
          authorAvatarUrl: googleLink(r.authorAvatarUrl, true)
        }
      ]
    })
    .slice(0, MAX_REVIEWS)
  const empty =
    offered.length + notOffered.length + summaries.length + openingHours.length + reviews.length === 0 &&
    reservable === null &&
    price === null
  return empty ? null : { offered, notOffered, reservable, price, summaries, openingHours, reviews }
}

export interface PageSpeedView {
  performance: number | null
  seo: number | null
  lcpSeconds: number | null
  https: boolean | null
  mobileFriendly: boolean | null
  checkedAt: string
}

const score100 = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100 ? v : null
const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

/** The profile's `pageSpeed` (mobile PageSpeed of the current website); null without a measurement date. */
export function pageSpeedView(raw: unknown): PageSpeedView | null {
  if (!isRecord(raw)) return null
  const checkedAt = text(raw.checkedAt)
  if (checkedAt === null) return null
  const lcp = typeof raw.lcpMs === 'number' && Number.isFinite(raw.lcpMs) && raw.lcpMs >= 0 ? raw.lcpMs : null
  return {
    performance: score100(raw.performance),
    seo: score100(raw.seo),
    lcpSeconds: lcp === null ? null : Math.round(lcp / 100) / 10,
    https: flag(raw.https),
    mobileFriendly: flag(raw.mobileFriendly),
    checkedAt
  }
}

/**
 * The profile's `socialStats` (`{<network>: SocialStat}`, stored by research) as lines with numbers,
 * in network order; empty when research stored none, so the section is not drawn.
 */
export function socialStatsLines(
  profile: Record<string, unknown> | null | undefined,
  now: number
): SocialLine[] {
  const stats = profile?.socialStats
  if (stats === null || typeof stats !== 'object' || Array.isArray(stats)) return []
  return SOCIAL_NETWORKS.flatMap((network) => {
    const raw: unknown = Reflect.get(stats, network)
    if (raw === null || typeof raw !== 'object') return []
    const url: unknown = Reflect.get(raw, 'url')
    if (typeof url !== 'string' || url === '') return []
    const stat = toSocialStat(url, { status: 'done', ...raw })
    const line = stat === null ? null : socialLine(network, stat, now)
    return line === null ? [] : [line]
  })
}

export interface DemoRow {
  id: string
  /** Demo 1 is the oldest. */
  n: number
  cms: string | null
  /** The template's label, else its design id; null when the build named none. */
  template: string | null
  phase: BuildView['phase']
  /** Built, but the final check left blockers (`receipt.blockers`): shown as needing fixes, never as live. */
  needsFixes: boolean
  siteKey: string | null
  createdAt: string | null
  /** The number of the brief it was built from; null when that brief is not listed. */
  briefN: number | null
}

/** Every demo of an opportunity, newest first: what it was built with, its state and its brief. */
export function demoRows(builds: unknown, revisions: unknown): DemoRow[] {
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
  const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
  const briefs = new Map(
    (Array.isArray(revisions) ? revisions : []).flatMap((r: unknown): [string, number][] =>
      isObject(r) && typeof r.id === 'string' && typeof r.n === 'number' ? [[r.id, r.n]] : []
    )
  )
  const rows = (Array.isArray(builds) ? builds : []).flatMap((b: unknown) => {
    if (!isObject(b) || typeof b.id !== 'string' || b.id === '') return []
    const template = isObject(b.template) ? (text(b.template.label) ?? text(b.template.design)) : null
    const siteKey = text(b.siteKey)
    const view = buildView({
      build: { state: text(b.state), receipt: isObject(b.receipt) ? b.receipt : null },
      site: siteKey ? { key: siteKey } : null
    })
    const phase = view.phase
    const revisionId = text(b.revisionId)
    return [
      {
        id: b.id,
        cms: text(b.cms),
        template,
        phase,
        needsFixes: phase === 'done' && view.fixes.length > 0,
        siteKey,
        createdAt: text(b.createdAt),
        briefN: revisionId ? (briefs.get(revisionId) ?? null) : null
      }
    ]
  })
  const oldestFirst = [...rows].sort((a, b) =>
    String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
  )
  const numbered = new Map(oldestFirst.map((row, i) => [row.id, i + 1]))
  return rows.map((row) => ({ ...row, n: numbered.get(row.id) ?? 0 })).sort((a, b) => b.n - a.n)
}

export interface BriefStatus {
  id: string
  n: number
  createdAt: string | null
  /** Whether the research still reads as it did; null when the server could not tell. */
  current: boolean | null
  /** The brief was made while photos were still being looked at. */
  madeWhileLabelling: boolean
  /** Photos looked at so far while the labelling still runs, else null. */
  labelling: { looked: number; total: number } | null
}

/** The Details answer's `brief`: the latest brief of this research, or null before the first build. */
export function briefStatus(brief: unknown): BriefStatus | null {
  if (typeof brief !== 'object' || brief === null) return null
  const b = brief as Record<string, unknown>
  if (typeof b.id !== 'string' || typeof b.n !== 'number') return null
  return {
    id: b.id,
    n: b.n,
    createdAt: typeof b.createdAt === 'string' ? b.createdAt : null,
    current: typeof b.current === 'boolean' ? b.current : null,
    madeWhileLabelling: b.madeWhileLabelling === true,
    labelling: labellingOf(b.labelling)
  }
}

function labellingOf(value: unknown): { looked: number; total: number } | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  return typeof v.looked === 'number' && typeof v.total === 'number' && v.total > 0
    ? { looked: v.looked, total: v.total }
    : null
}

export interface TripadvisorReviewView {
  authorAvatarUrl: string | null
  photos: { url: string; mediaId: string | null }[]
  id: string
  text: string
  author: string
  rating: number | null
  url: string
  authorUrl: string | null
}

const tripadvisorLink = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      /^(www\.)?tripadvisor\.com$/.test(url.hostname) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

const tripadvisorImage = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      /^(?:dynamic-media-cdn|media-cdn)\.tripadvisor\.com$/.test(url.hostname) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

/** Preserve the actual listing even when reviews cover another branch of the restaurant. */
export function tripadvisorListingView(
  profile: unknown
): { name: string; address: string | null; url: string } | null {
  if (!isRecord(profile) || !isRecord(profile.reviewSources)) return null
  const source = profile.reviewSources.tripadvisor
  if (!isRecord(source)) return null
  const name = text(source.name),
    url = tripadvisorLink(source.url)
  return name && url ? { name, url, address: text(source.address) } : null
}

/** Only sourced guest quotations are shown. Missing or unavailable optional research draws nothing. */
export function tripadvisorReviewView(profile: unknown, media: MediaTile[] = []): TripadvisorReviewView[] {
  if (!isRecord(profile) || !isRecord(profile.reviewSources)) return []
  const source = profile.reviewSources.tripadvisor
  if (!isRecord(source) || !Array.isArray(source.reviews)) return []
  return source.reviews
    .flatMap((raw: unknown) => {
      if (!isRecord(raw)) return []
      const author = text(raw.author)
      const quote = text(raw.text)
      const url = tripadvisorLink(raw.url)
      if (!author || !quote || !url) return []
      return [
        {
          id: text(raw.id) ?? url,
          text: quote,
          author,
          url,
          authorUrl: tripadvisorLink(raw.authorUrl),
          authorAvatarUrl: tripadvisorImage(raw.authorAvatarUrl),
          photos: (Array.isArray(raw.photos) ? raw.photos : [])
            .flatMap((photo: unknown) => {
              if (!isRecord(photo) || photo.reviewId !== raw.id || tripadvisorLink(photo.sourceUrl) !== url)
                return []
              const image = tripadvisorImage(photo.url)
              if (!image) return []
              const stored = media.find(
                (item) => item.stored && item.kind === 'image' && item.sourceUrl === image
              )
              return [{ url: image, mediaId: stored?.id ?? null }]
            })
            .slice(0, 10),
          rating: typeof raw.rating === 'number' && raw.rating >= 0 && raw.rating <= 5 ? raw.rating : null
        }
      ]
    })
    .slice(0, 10)
}
