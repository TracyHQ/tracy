/**
 * The pieces every place shows in My opportunities (spec #512, ticket #518; #537 option A), in Cards and in Compact
 * rows: **Place** (name, type, address with a pin to Google Maps), the **Step** it reached with the step's one action
 * (`row-step-model.ts`), and the **Demo** preview a card draws once a site exists. Built from facts the list door
 * already returns; nothing is invented, a missing fact is left out.
 * Pure: no fetch, no clock read (callers pass `now`).
 */
import { type DemoState, demoBlock, demoStateOf } from '@tracy/wo-views/demo-state'
import { formatNumber, formatRating, hostOf } from '@tracy/wo-views/model'

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
import { type ResearchState, researchOf } from './research-gate-model.ts'
import { type RowStep, rowStepOf } from './row-step-model.ts'
import { type StepperInput, type StepperView, stepperView } from './stepper-model.ts'
import type { Translate } from './strings.ts'

export type DemoPiece =
  | { kind: 'none' }
  | { kind: 'building' }
  | { kind: 'thumb'; url: string | null; address: string; daysLeft: number | null }
  | { kind: 'failed'; reason: string }
  | { kind: 'expired'; line: string }

/**
 * What the one button does, following the same four steps as the Details stepper (`stepper-model.ts`): a row action
 * (Start research, Resume, Send demo), Make content brief, or a demo press.
 */
export type NextRun =
  | { kind: 'row'; action: NextAction }
  | { kind: 'brief' }
  | { kind: 'demo'; action: 'build' | 'open' | 'rebuild' }
  /**
   * Opens Details (#537): on the sub-page the step waits on (review the business facts or the brief), or on Details
   * itself for research again (its Sources table and the step's own press) and while a job runs.
   */
  | { kind: 'details'; section?: 'profile' | 'brief' }

export interface PlacePieces {
  id: string
  state: DemoState
  place: { name: string; type: string | null; address: string | null; mapsUrl: string }
  demo: DemoPiece
  status: { label: string; tone: BadgeTone }
  /** Step n of 3 and the state of the current step, from the same stepper view as the Details band (#537). */
  step: RowStep
  next: { label: string; run: NextRun | null; disabled: boolean; look: 'primary' | 'outline' | 'quiet' }
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

/** A researched place with no demo yet: Researched, or Brief ready once it has a content brief. */
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
  if (state === 'none')
    return row.latestRevision?.id
      ? { label: t('status.brief'), tone: 'ok' }
      : { label: t('my.status.researched'), tone: 'ok' }
  return { label: t(STATE_STATUS[state].key), tone: STATE_STATUS[state].tone }
}

const OLD_HOST_RESEARCH: Record<string, ResearchState> = {
  completed: 'done',
  queued: 'running',
  running: 'running',
  failed: 'failed'
}

/**
 * The place's stepper view, built from the list row exactly as Details builds it from its own answer. The list carries
 * no Content brief job, so a brief being written reads as not made yet until the list reloads.
 */
export function rowStepperView(row: OpportunityListRow, state: DemoState = demoStateOf(row)): StepperView {
  // An older host sends no `research`: the research job says it (completed = done).
  const jobState = row.job?.state ?? ''
  const research =
    (row as { research?: unknown }).research === undefined
      ? {
          state: OLD_HOST_RESEARCH[jobState] ?? ('not_started' as const),
          researchedAt: null,
          done: jobState === 'completed'
        }
      : researchOf(row)
  return stepperView({
    research,
    researchJob: row.job ?? null,
    brief: row.latestRevision ?? null,
    demo: state,
    demoAt: state === 'ready' ? (row.demoAction?.updatedAt ?? null) : null,
    approval: (row as { approval?: StepperInput['approval'] }).approval ?? null
  })
}

/** The row's one button: the current step's action of the stepper model, so it never skips the content brief. */
function nextOf(
  row: OpportunityListRow,
  state: DemoState,
  step: RowStep,
  t: Translate,
  opts: PieceOptions
): PlacePieces['next'] {
  // A demo handed to the client chat keeps its own button.
  if (nextAction(row) === 'open-demo-chat')
    return {
      label: t(ACTION_VIEW['open-demo-chat'].labelKey),
      run: { kind: 'row', action: 'open-demo-chat' },
      disabled: false,
      look: 'outline'
    }
  const action = step.action
  if (action === null) return { label: '', run: null, disabled: true, look: 'quiet' }
  const label = t(action.labelKey)
  const look = action.look
  const blocked = opts.buildBlocked === true
  switch (action.kind) {
    case 'open':
      return { label, run: { kind: 'details' }, disabled: false, look }
    case 'open-site': {
      // The ready site's own press of the Your site block (open it, or reopen a frozen one).
      const primary = demoBlock(state, row, t, { now: opts.now, locale: opts.locale }).primary
      return {
        label,
        run: primary.action === null ? null : { kind: 'demo', action: primary.action },
        disabled: primary.disabled,
        look
      }
    }
    case 'start-research':
      return { label, run: { kind: 'row', action: 'start' }, disabled: false, look }
    case 'resume-research':
      return { label, run: { kind: 'row', action: 'resume' }, disabled: false, look }
    case 'make-brief':
    case 'retry-brief':
      return { label, run: { kind: 'brief' }, disabled: false, look }
    case 'build':
    case 'retry-build':
      return { label, run: { kind: 'demo', action: 'build' }, disabled: blocked, look }
    case 'rebuild':
      return { label, run: { kind: 'demo', action: 'rebuild' }, disabled: blocked, look }
    case 'review-profile':
      return { label, run: { kind: 'details', section: 'profile' }, disabled: false, look }
    case 'review-brief':
      return { label, run: { kind: 'details', section: 'brief' }, disabled: false, look }
    case 'research-again':
      return { label, run: { kind: 'details' }, disabled: false, look }
  }
}

export function placePieces(row: OpportunityListRow, t: Translate, opts: PieceOptions): PlacePieces {
  const place = toPlaceRow(row)
  const state = demoStateOf(row)
  const statusOf = placeStatus(row, t)
  const step = rowStepOf(rowStepperView(row, state))
  const next = nextOf(row, state, step, t, opts)
  return {
    id: row.id,
    state,
    place: {
      name: place.branch ? `${place.name} · ${place.branch}` : place.name,
      type: text(place.category) ?? text(place.cuisine),
      address: text(place.address),
      mapsUrl: mapsUrlOf(row)
    },
    demo: demoPiece(state, row, t, opts),
    status: statusOf,
    step,
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
