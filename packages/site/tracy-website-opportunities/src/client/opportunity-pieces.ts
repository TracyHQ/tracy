/**
 * The four pieces every place shows in My opportunities (spec #512, ticket #518), in Cards and in Compact rows:
 * **Place** (name, type, address with a pin to Google Maps), **Opportunity** (score ring and one "why" line),
 * **Demo** (thumbnail, days left, or the reason it stopped) and **Status** with its one next action. Built from
 * facts the list door already returns; nothing is invented, a missing fact is left out.
 * Pure: no fetch, no clock read (callers pass `now`).
 */
import type { Grade } from '@tracy/wo-views'
import { type DemoState, demoBlock, demoStateOf } from '@tracy/wo-views/demo-state'
import { SOCIAL_NETWORKS, formatNumber, formatRating, hostOf, totalFollowers } from '@tracy/wo-views/model'

import type { SecondaryField } from './column-prefs.ts'
import { toPlaceRow } from './my-list.ts'
import {
  ACTION_VIEW,
  type BadgeTone,
  type NextAction,
  type OpportunityListRow,
  nextAction,
  stageOf,
  statusView
} from './opportunity-row.ts'
import type { Translate } from './strings.ts'

export type DemoPiece =
  | { kind: 'none' }
  | { kind: 'building' }
  | { kind: 'thumb'; url: string | null; address: string; daysLeft: number | null }
  | { kind: 'failed'; reason: string }
  | { kind: 'expired'; line: string }

/** What the one button does: a row action of the research stage, or the demo state machine's primary. */
export type NextRun =
  | { kind: 'row'; action: NextAction }
  | { kind: 'demo'; action: 'build' | 'open' | 'rebuild' }

export interface PlacePieces {
  id: string
  state: DemoState
  place: { name: string; type: string | null; address: string | null; mapsUrl: string }
  opportunity: { score: number; grade: Grade; pending: boolean; why: string }
  demo: DemoPiece
  status: { label: string; tone: BadgeTone }
  next: { label: string; run: NextRun | null; disabled: boolean }
}

export interface PieceOptions {
  now: number
  locale: string
  /** The account is over its daily build limit: a build press is disabled. */
  buildBlocked?: boolean
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The place page Google gave, else a Google Maps search for the place (by its place id when Google found it). */
export function mapsUrlOf(row: OpportunityListRow): string {
  const place = toPlaceRow(row)
  if (place.mapsUrl && /^https:\/\//i.test(place.mapsUrl)) return place.mapsUrl
  const query = [place.name, place.address].filter(Boolean).join(', ')
  const params = new URLSearchParams({ api: '1', query: query || place.name })
  if (place.provider !== 'osm' && place.providerId && place.providerId !== row.id)
    params.set('query_place_id', place.providerId)
  return `https://www.google.com/maps/search/?${params}`
}

function whyLine(row: OpportunityListRow, t: Translate, locale: string): string {
  const place = toPlaceRow(row)
  const hasSocial = SOCIAL_NETWORKS.some((n) => Boolean(place.socials?.[n] ?? place.social?.[n]?.url))
  const web = place.website ? 'my.why.website' : hasSocial ? 'my.why.socialOnly' : 'my.why.noWebsite'
  const reviews = num(place.reviews)
  const rating = num(place.rating)
  const reviewText =
    reviews !== null && reviews > 0
      ? t(reviews === 1 ? 'my.why.reviews.one' : 'my.why.reviews.other', {
          count: formatNumber(reviews, locale)
        }) + (rating !== null ? t('my.why.stars', { rating: formatRating(rating, locale) }) : '')
      : t('my.why.noReviews')
  const followers = totalFollowers(place)
  const social =
    followers !== null && followers > 0
      ? t('my.why.followers', { count: formatNumber(followers, locale) })
      : hasSocial
        ? t('my.why.hasSocial')
        : t('my.why.noSocial')
  return [t(web), reviewText, social].join(' · ')
}

const STATE_STATUS: Record<DemoState, { key: string; tone: BadgeTone }> = {
  none: { key: 'my.status.notBuilt', tone: 'outline' },
  queued: { key: 'my.status.building', tone: 'secondary' },
  building: { key: 'my.status.building', tone: 'secondary' },
  ready: { key: 'my.status.ready', tone: 'live' },
  failed: { key: 'my.status.failed', tone: 'destructive' },
  expired: { key: 'my.status.expired', tone: 'outline' }
}

function demoPiece(state: DemoState, row: OpportunityListRow, t: Translate, opts: PieceOptions): DemoPiece {
  const block = demoBlock(state, row, t, { now: opts.now, locale: opts.locale })
  if (state === 'queued' || state === 'building') return { kind: 'building' }
  if (state === 'failed') return { kind: 'failed', reason: block.line?.replace(/^[^:]*:\s*/, '') ?? '' }
  if (state === 'expired') return { kind: 'expired', line: block.line ?? '' }
  if (state === 'ready') {
    const expires = row.demo?.expiresAt ? Date.parse(row.demo.expiresAt) : Number.NaN
    const url = text(row.demo?.url)
    return {
      kind: 'thumb',
      url,
      address: text(row.demo?.siteKey) ?? (url ? hostOf(url) : ''),
      daysLeft: Number.isFinite(expires) ? Math.max(1, Math.ceil((expires - opts.now) / 86_400_000)) : null
    }
  }
  return { kind: 'none' }
}

/** A place still in research (or cancelled) speaks of its research; from Demo on, of its demo. */
function inResearch(row: OpportunityListRow, state: DemoState): boolean {
  const stage = stageOf(row)
  return (stage === 'research' || stage === 'cancelled') && state === 'none'
}

/**
 * The one status of a place: the list's Status piece and the Details header chip both draw this, so they never
 * disagree (Building while the demo action is queued or running, Ready once it completed).
 */
export function placeStatus(row: OpportunityListRow, t: Translate): { label: string; tone: BadgeTone } {
  const state = demoStateOf(row)
  if (inResearch(row, state)) return { label: t(statusView(row).key), tone: statusView(row).variant }
  return { label: t(STATE_STATUS[state].key), tone: STATE_STATUS[state].tone }
}

export function placePieces(row: OpportunityListRow, t: Translate, opts: PieceOptions): PlacePieces {
  const place = toPlaceRow(row)
  const state = demoStateOf(row)
  const research = inResearch(row, state)
  const statusOf = placeStatus(row, t)
  let next: PlacePieces['next']
  const rowAction = nextAction(row)
  if (research || rowAction === 'open-demo-chat') {
    next = {
      label: t(ACTION_VIEW[rowAction].labelKey),
      run: { kind: 'row', action: rowAction },
      disabled: false
    }
  } else {
    const primary = demoBlock(state, row, t, { now: opts.now, locale: opts.locale }).primary
    next = {
      label: primary.label,
      run: primary.action === null ? null : { kind: 'demo', action: primary.action },
      disabled: primary.disabled || (primary.action !== 'open' && opts.buildBlocked === true)
    }
  }
  return {
    id: row.id,
    state,
    place: {
      name: place.branch ? `${place.name} · ${place.branch}` : place.name,
      type: text(place.category) ?? text(place.cuisine),
      address: text(place.address),
      mapsUrl: mapsUrlOf(row)
    },
    opportunity: {
      score: place.score.score,
      grade: place.score.grade,
      pending: place.score.pending,
      why: whyLine(row, t, opts.locale)
    },
    demo: demoPiece(state, row, t, opts),
    status: statusOf,
    next
  }
}

const CHAT_NAME: Record<string, string> = {
  whatsapp: 'WhatsApp',
  zalo: 'Zalo',
  messenger: 'Messenger',
  line: 'LINE'
}
const SOURCE_KEY: Record<string, string> = {
  'google-places': 'my.source.google',
  'google-maps': 'my.source.google',
  osm: 'my.source.osm'
}

export function secondaryLines(
  row: OpportunityListRow,
  t: Translate,
  opts: PieceOptions,
  fields: readonly SecondaryField[]
): Array<{ id: SecondaryField; label: string; value: string }> {
  const place = toPlaceRow(row)
  const value = (field: SecondaryField): string | null => {
    switch (field) {
      case 'type':
        return text(place.category) ?? text(place.cuisine)
      case 'contact': {
        const email = text(place.email) ?? text(place.siteCheck?.emails?.[0])
        if (email) return email
        const chat = Object.entries(place.contacts ?? {}).find(([, v]) => text(v))
        return chat ? `${CHAT_NAME[chat[0]] ?? chat[0]} ${text(chat[1])}` : null
      }
      case 'website':
        return place.website ? hostOf(place.website) : null
      case 'phone':
        return text(place.phone)
      case 'rating': {
        const rating = num(place.rating)
        const reviews = num(place.reviews)
        if (rating === null) return null
        return reviews !== null && reviews > 0
          ? t('my.field.ratingFrom', {
              rating: formatRating(rating, opts.locale),
              count: formatNumber(reviews, opts.locale)
            })
          : formatRating(rating, opts.locale)
      }
      case 'source': {
        const c = (row.candidate ?? {}) as Record<string, unknown>
        const key = typeof c.provider === 'string' ? SOURCE_KEY[c.provider] : undefined
        return key ? t(key) : null
      }
      case 'researched': {
        if (row.job?.state !== 'completed') return null
        const ms = row.job.updatedAt ? Date.parse(row.job.updatedAt) : Number.NaN
        return Number.isFinite(ms)
          ? new Intl.DateTimeFormat(opts.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
              ms
            )
          : null
      }
      case 'stage':
        return t(`my.stage.${stageOf(row)}`)
    }
  }
  const lines: Array<{ id: SecondaryField; label: string; value: string }> = []
  for (const id of fields) {
    const v = value(id)
    if (v) lines.push({ id, label: t(`my.field.${id}`), value: v })
  }
  return lines
}
