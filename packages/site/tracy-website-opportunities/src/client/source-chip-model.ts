/**
 * The source chip after each Business facts value (#537, design A): one word (Google, Bio, Post, Listing, Review,
 * Profile, Website, You, Not found), a platform glyph, and a hover title with the full source name and when it was
 * collected. Pure. A chip only stands for a source the payload names: no source, no chip; nothing is guessed.
 */
import { type SourceLogoKey, sourceLogoKey } from './source-logo.ts'

export type ChipWord =
  | 'google'
  | 'bio'
  | 'post'
  | 'listing'
  | 'review'
  | 'profile'
  | 'website'
  | 'you'
  | 'none'

export interface SourceChipView {
  word: ChipWord
  /** The source kind (`google-places`, `instagram`, `listing`...); null for You, Not found, or an unnamed platform. */
  source: string | null
  /** The page address (a post, a listing), when the payload gives one. */
  ref: string | null
  /** When the source's data was collected, or when the seller made the edit; null when the payload does not say. */
  at: string | null
}

/** A row of `body.sources` as far as a chip reads it. */
export interface ChipSourceRow {
  source: string
  ref?: string | null
  collectedAt?: string | null
}

const SOCIAL = new Set(['facebook', 'instagram', 'tiktok', 'youtube'])
const GOOGLE = new Set(['google-places', 'google-maps'])
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Google's word in the profile (`google`, the search provider and the hours claim) is the Google Places source. */
export const normalSource = (source: string): string => (source === 'google' ? 'google-places' : source)

function rowOf(rows: readonly ChipSourceRow[], source: string): ChipSourceRow | null {
  return (
    rows.find((r) => r.source === source && text(r.collectedAt) !== null) ??
    rows.find((r) => r.source === source) ??
    null
  )
}

function fromRow(
  word: ChipWord,
  source: string,
  rows: readonly ChipSourceRow[],
  ref: string | null = null
): SourceChipView {
  const row = rowOf(rows, source)
  return { word, source, ref: ref ?? text(row?.ref), at: text(row?.collectedAt) }
}

/** The seller's own edit. */
export const youChip = (at: string | null = null): SourceChipView => ({
  word: 'you',
  source: null,
  ref: null,
  at
})

/** A value the research looked for and did not find. */
export const noneChip = (): SourceChipView => ({ word: 'none', source: null, ref: null, at: null })

/**
 * The chip of a profile field (`name`, `address`, `phone`, `bio`, `hours`, `rating`) by the source the server
 * credits it to: `seller` is the seller, a social page gives its Bio (the bio field) or its Profile, null or a source
 * this screen does not know gives no chip.
 */
export function fieldChip(
  source: string | null,
  field: string,
  rows: readonly ChipSourceRow[],
  editedAt: string | null = null
): SourceChipView | null {
  if (source === null) return null
  if (source === 'seller') return youChip(editedAt)
  const s = normalSource(source)
  if (GOOGLE.has(s)) return fromRow('google', s, rows)
  if (s === 'listing') return fromRow('listing', s, rows)
  if (s === 'website') return fromRow('website', s, rows)
  if (SOCIAL.has(s)) return fromRow(field === 'bio' ? 'bio' : 'profile', s, rows)
  return null
}

/**
 * The chip of a reading item or a key message quote: what kind of text it stands on (`bio`, `post`, `review`) and,
 * when the payload names it, the platform of that text. A post's own address, when given, is its ref.
 */
export function readingChip(
  kind: 'bio' | 'post' | 'review',
  platform: string | null,
  url: string | null,
  rows: readonly ChipSourceRow[]
): SourceChipView {
  const source = platform === null ? (kind === 'review' ? 'google-places' : null) : normalSource(platform)
  if (source === null) return { word: kind, source: null, ref: url, at: null }
  return fromRow(kind, source, rows, url)
}

/** The glyph of a chip: the seller's person glyph, else the platform's, else the generic globe. */
export function chipLogo(chip: SourceChipView): SourceLogoKey | 'you' {
  if (chip.word === 'you') return 'you'
  if (chip.source === null) return 'website'
  return sourceLogoKey(chip.source, chip.ref)
}

/** The corner badge of a photo or video: its source's glyph; none for the seller's own (it says Added by you). */
export function mediaBadgeLogo(source: string | null, ref: string | null = null): SourceLogoKey | null {
  if (source === null || source === 'owner') return null
  return sourceLogoKey(normalSource(source), ref)
}

/** A collected time as "9 Nov" in the interface language; null when it is not a time. */
export function chipDate(at: string | null, locale: string): string | null {
  const time = at === null ? Number.NaN : Date.parse(at)
  if (!Number.isFinite(time)) return null
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(time)
}

type T = (key: string, params?: Record<string, unknown>) => string

/**
 * The hover title: "Instagram post · collected 9 Nov", "Edited by you on 10 Nov", "Looked on Google Places and
 * Instagram". `label` names a source kind (`sourceLabel`); `looked` lists what research read, for Not found.
 */
export function chipTitle(
  t: T,
  chip: SourceChipView,
  locale: string,
  label: (source: string, ref: string | null) => string,
  looked: string[] = []
): string {
  const date = chipDate(chip.at, locale)
  if (chip.word === 'you') return date === null ? t('chip.title.you') : t('chip.title.youOn', { date })
  if (chip.word === 'none')
    return looked.length === 0 ? t('chip.title.none') : t('chip.title.looked', { list: looked.join(', ') })
  const name = chip.source === null ? null : label(chip.source, chip.ref)
  const full =
    chip.word === 'bio' || chip.word === 'post' || chip.word === 'profile' || chip.word === 'review'
      ? name === null
        ? t(`chip.full.${chip.word}.plain`)
        : t(`chip.full.${chip.word}`, { source: name })
      : (name ?? t(`chip.word.${chip.word}`))
  return date === null ? full : t('chip.title.collected', { source: full, date })
}
