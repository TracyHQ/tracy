/**
 * One row of My opportunities, read for the screen: its stage, whether it needs the customer, its
 * Status badge, the one next action and the Research column. Pure: no fetch, no clock read (callers
 * pass `now`). The server's `stage` wins when it sends one, so filter counts and badges agree.
 */
import type { DemoFacts } from '@tracy/wo-views'
import type { DemoAction, OutreachDraft } from './outreach-model.ts'

import { type JobInput, reasonKey } from './status.ts'

export type Stage = 'research' | 'demo' | 'outreach' | 'cancelled'
/** Filter order of the stage bar (`cancelled` is outside the three steps). */
export const STAGES: readonly Stage[] = Object.freeze(['research', 'demo', 'outreach', 'cancelled'])

export interface RowJob extends JobInput {
  id?: string
  createdAt?: string | null
  updatedAt?: string | null
  lastError?: { code?: string; reason?: string; source?: string } | null
}

export interface OpportunityListRow {
  id: string
  name?: string
  branch?: string | null
  createdAt?: string | null
  candidate?: Record<string, unknown> | null
  job?: RowJob | null
  latestRevision?: {
    id?: string
    n?: number
    cms?: string
    template?: { label?: string; quickstart?: string }
    createdAt?: string | null
  } | null
  sites?: unknown[]
  /** Server-computed (D1); preferred over the fallback below. */
  attention?: boolean
  demoAction?: DemoAction | null
  outreach?: OutreachDraft | null
  stage?: string | null
  /** `done` = its site was made (`site_creation`), which a site key alone does not prove. */
  latestBuild?: {
    id?: string
    state?: string | null
    siteKey?: string | null
    done?: boolean
    qa?: string | null
    label?: string | null
  } | null
  /** Sources collected / found by the latest run, when the server sends them. */
  sourceCounts?: { done?: number; notFound?: number; total?: number } | null
  /** What Find shows for the same place (server, cache reads only); absent from an older server. */
  score?: unknown
  siteCheck?: unknown
  social?: unknown
  socials?: unknown
  /** The Demo column's facts (server, `GET /opportunities`); absent from an older server. */
  demo?: DemoFacts | null
}

const STAGE_SET = new Set<string>(STAGES)
/** Job states that put the row back at Researching, whatever it produced before. */
const ATTENTION = new Set(['paused', 'blocked', 'failed'])
const BUILD_DONE = new Set(['completed', 'done'])

const hasDemo = (row: OpportunityListRow): boolean =>
  (Array.isArray(row.sites) && row.sites.length > 0) ||
  (typeof row.latestBuild?.siteKey === 'string' &&
    row.latestBuild.siteKey !== '' &&
    BUILD_DONE.has(row.latestBuild.state ?? ''))

/**
 * A latest demo action that has not completed — a Retry still running, or a failed one — is the row's news,
 * whatever an older check of the build it reuses passed: the row stays in Demo with its progress or its Retry.
 * Mirrors the server's `outreach` (`apps/tracy-web/src/opportunities-build/journey-sql.js`, 27/10/2026).
 */
export const demoActionOpen = (row: OpportunityListRow): boolean =>
  row.demoAction != null && row.demoAction.state !== 'completed'

export function stageOf(row: OpportunityListRow): Stage {
  const open = demoActionOpen(row)
  if (typeof row.stage === 'string' && STAGE_SET.has(row.stage))
    return open && row.stage === 'outreach' ? 'demo' : (row.stage as Stage)
  if (!open && (row.latestBuild?.qa === 'passed' || row.demo?.qa === 'passed')) return 'outreach'
  if (row.demoAction || row.latestRevision || hasDemo(row) || row.job?.state === 'completed') return 'demo'
  return row.job?.state === 'cancelled' ? 'cancelled' : 'research'
}

export function needsAttention(row: OpportunityListRow): boolean {
  return (
    row.attention === true ||
    ATTENTION.has(row.job?.state ?? '') ||
    row.demoAction?.state === 'failed' ||
    row.demo?.qa === 'failed' ||
    row.latestBuild?.qa === 'failed'
  )
}

export type BadgeTone = 'outline' | 'secondary' | 'destructive' | 'ok' | 'live'
export interface StatusView {
  key: string
  variant: BadgeTone
  check: boolean
}

export function statusView(row: OpportunityListRow): StatusView {
  const stage = stageOf(row)
  if (stage === 'outreach') return { key: 'v3.demoReady', variant: 'live', check: true }
  if (stage === 'demo') {
    if (
      row.demoAction?.state === 'failed' ||
      ['failed', 'refused'].includes(row.latestBuild?.state ?? '') ||
      row.demo?.qa === 'failed' ||
      row.latestBuild?.qa === 'failed' ||
      (row.latestBuild?.done === true &&
        !row.latestBuild.qa &&
        !row.demo?.qa &&
        row.demoAction?.state !== 'queued')
    )
      return { key: 'v3.needsReview', variant: 'destructive', check: false }
    if (row.demoAction?.state === 'queued' || row.latestBuild)
      return { key: 'v3.building', variant: 'secondary', check: false }
    return { key: 'v3.readyToBuild', variant: 'ok', check: true }
  }
  if (stage === 'cancelled') return { key: 'status.cancelled', variant: 'outline', check: false }
  const state = row.job?.state
  if (state === 'failed') return { key: 'status.failed', variant: 'destructive', check: false }
  if (state === 'paused' || state === 'blocked')
    return { key: 'status.paused', variant: 'outline', check: false }
  return state
    ? { key: 'status.researching', variant: 'secondary', check: false }
    : { key: 'v3.notStarted', variant: 'outline', check: false }
}

export type NextAction =
  | 'cancel'
  | 'resume'
  | 'start'
  | 'build'
  | 'retry-demo'
  | 'send-demo'
  | 'open-site'
  | 'open-demo-chat'
export const ACTION_VIEW: Readonly<
  Record<NextAction, { labelKey: string; variant: 'default' | 'outline' | 'ghost' }>
> = {
  cancel: { labelKey: 'job.cancel', variant: 'ghost' },
  resume: { labelKey: 'job.resume', variant: 'outline' },
  start: { labelKey: 'job.start', variant: 'outline' },
  build: { labelKey: 'v3.buildDemo', variant: 'default' },
  'retry-demo': { labelKey: 'action.retry', variant: 'outline' },
  'send-demo': { labelKey: 'v3.sendDemo', variant: 'default' },
  'open-demo-chat': { labelKey: 'v3.openDemoChat', variant: 'outline' },
  'open-site': { labelKey: 'v3.reviewDemo', variant: 'outline' }
}
const MOVING = new Set(['queued', 'running'])
const hasJobId = (row: OpportunityListRow): boolean => typeof row.job?.id === 'string' && row.job.id !== ''

export function nextAction(row: OpportunityListRow): NextAction {
  const stage = stageOf(row)
  if (stage === 'outreach') return 'send-demo'
  if (
    row.demoAction?.state === 'failed' ||
    (row.demoAction?.id && (row.demo?.qa === 'failed' || row.latestBuild?.qa === 'failed'))
  )
    return 'retry-demo'
  if (stage === 'demo' && row.demoAction?.chatMode === 'client-send/1') return 'open-demo-chat'
  if (stage === 'demo') return row.latestBuild ? 'open-site' : 'build'
  if (hasJobId(row) && MOVING.has(row.job?.state ?? '')) return 'cancel'
  if (hasJobId(row)) return 'resume'
  return 'start'
}

export interface NextStepText {
  key: string
  params: Record<string, unknown>
  /** A stopped run's reason, drawn before the text. */
  reasonKey?: string
}

/** Why the latest run stopped: the source's reason when the server names one, else its code. */
export function stopReasonKey(job: RowJob | null | undefined): string {
  const error = job?.lastError ?? (job as { last_error?: RowJob['lastError'] } | null | undefined)?.last_error
  return reasonKey(error?.reason) ?? reasonKey(error?.code) ?? 'reason.other'
}

/**
 * Codes a failed demo action carries (`apps/tracy-web/src/opportunities-build/`), grouped under the reason a person
 * reads. Codes `reasonKey` already knows keep theirs; anything else reads the generic `reason.demo_failed`.
 */
const DEMO_FAILURES: Record<string, string> = {
  PROVISION_FAILED: 'reason.provision_failed',
  BUILD_FAILED: 'reason.provision_failed',
  BUILD_UNREACHABLE: 'reason.provision_failed',
  DEMO_BASELINE_UNAVAILABLE: 'reason.demo_check_failed',
  DEMO_QA_UNAVAILABLE: 'reason.demo_check_failed',
  QA_RETRY_FAILED: 'reason.demo_check_failed',
  QUICKSTART_QA_INCOMPLETE: 'reason.demo_check_failed',
  SITE_FILL_FAILED: 'reason.demo_fill_failed',
  QUALITY_FILL_NEEDS_ATTENTION: 'reason.demo_fill_failed',
  QUALITY_STEP_FAILED: 'reason.demo_fill_failed',
  DEMO_SELECTION_CHANGED: 'reason.demo_brief_changed',
  DEMO_WORKFLOW_CHANGED: 'reason.demo_brief_changed',
  TEMPLATE_VERSION_CHANGED: 'reason.demo_brief_changed',
  BRIEF_INVALID: 'reason.demo_brief_changed',
  SITE_ACCESS_DENIED: 'reason.demo_access_lost',
  ACCOUNT_NOT_FOUND: 'reason.demo_access_lost',
  AGENT_DEMO_NOT_GRANTED: 'reason.demo_access_lost',
  AGENT_DEMO_OTHER_WRITER: 'reason.demo_other_writer',
  DEMO_CHAT_UNAVAILABLE: 'reason.demo_chat_unavailable',
  DEMO_SESSION_UNAVAILABLE: 'reason.demo_chat_unavailable',
  DEMO_SITE_DELETED: 'reason.demo_site_deleted',
  DEMO_CANCELLED: 'reason.demo_cancelled',
  QUALITY_APPLY_DISABLED: 'reason.feature_off'
}

/** Why a failed demo stopped, always in words next to its Retry; null while it has not failed. */
export function demoFailureKey(row: OpportunityListRow): string | null {
  if (row.demoAction?.state !== 'failed') return null
  const code = row.demoAction.error ?? ''
  const known = DEMO_FAILURES[code] ?? reasonKey(code)
  return known && known !== 'reason.other' ? known : 'reason.demo_failed'
}

/** "What happens next" for the row. */
export function nextStepText(row: OpportunityListRow): NextStepText {
  const stage = stageOf(row)
  if (stage === 'research') {
    if (row.job?.state === 'running') return { key: 'next.running', params: {} }
    if (ATTENTION.has(row.job?.state ?? ''))
      return { key: 'next.stopped', params: {}, reasonKey: stopReasonKey(row.job) }
    return { key: row.job ? 'next.queued' : 'next.new', params: {} }
  }
  return {
    key: stage === 'demo' ? 'v3.nextDemo' : stage === 'outreach' ? 'v3.nextOutreach' : 'next.cancelled',
    params: {}
  }
}

export interface SourceCount {
  done: number
  /** Sources the place has nothing at: settled, not done. Absent when the answer does not count them. */
  notFound?: number
  total: number
}

/** The latest run, as the Research column draws it; times are ISO strings for `relativeTime`. */
export type ResearchSummary =
  | {
      kind: 'running'
      stageKey: string
      step: number
      steps: number
      sources: SourceCount | null
      at: string | null
    }
  | { kind: 'queued'; at: string | null }
  | {
      kind: 'stopped'
      state: 'paused' | 'blocked' | 'failed'
      reasonKey: string
      soft: boolean
      sources: SourceCount | null
    }
  | { kind: 'done'; at: string | null; sources: SourceCount | null }
  | { kind: 'cancelled'; at: string | null; sources: SourceCount | null }
  | { kind: 'none'; at: string | null }

/** The five research steps, in the order the executor runs them (`done` is the last step finishing). */
const RESEARCH_STEPS = ['discovery', 'collection', 'media', 'profile', 'brand'] as const

const time = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

function sourceCount(raw: OpportunityListRow['sourceCounts']): SourceCount | null {
  const done = raw?.done
  const total = raw?.total
  if (typeof done !== 'number' || typeof total !== 'number') return null
  if (!Number.isInteger(done) || !Number.isInteger(total) || total <= 0 || done < 0 || done > total)
    return null
  const notFound = raw?.notFound
  if (notFound === undefined) return { done, total }
  if (typeof notFound !== 'number' || !Number.isInteger(notFound) || notFound < 0 || done + notFound > total)
    return null
  return { done, notFound, total }
}

/** Which of the five steps a running research is on, as the Research column and the public Find draw it. */
export function researchStep(stage: string | null | undefined): {
  stageKey: string
  step: number
  steps: number
} {
  const index = RESEARCH_STEPS.indexOf((stage ?? '') as (typeof RESEARCH_STEPS)[number])
  const step = stage === 'done' ? RESEARCH_STEPS.length : Math.max(0, index) + 1
  return { stageKey: `job.stage.${RESEARCH_STEPS[step - 1]}`, step, steps: RESEARCH_STEPS.length }
}

export function researchSummary(row: OpportunityListRow): ResearchSummary {
  const job = row.job
  const sources = sourceCount(row.sourceCounts)
  if (!job) return { kind: 'none', at: time(row.createdAt) }
  const state = job.state ?? 'queued'
  if (state === 'running')
    return { kind: 'running', ...researchStep(job.stage), sources, at: time(job.createdAt) }
  if (state === 'paused' || state === 'blocked' || state === 'failed')
    return { kind: 'stopped', state, reasonKey: stopReasonKey(job), soft: state === 'paused', sources }
  if (state === 'completed') return { kind: 'done', at: time(job.updatedAt), sources }
  if (state === 'cancelled') return { kind: 'cancelled', at: time(job.updatedAt), sources }
  return { kind: 'queued', at: time(job.createdAt) }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "12 minutes ago", "yesterday", "4 days ago" in `locale`; null for a missing or bad date. */
export function relativeTime(iso: string | null | undefined, now: number, locale: string): string | null {
  const then = typeof iso === 'string' ? Date.parse(iso) : Number.NaN
  if (Number.isNaN(then)) return null
  const ago = Math.max(0, now - then)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (ago < HOUR) return rtf.format(-Math.floor(ago / MINUTE), 'minute')
  if (ago < DAY) return rtf.format(-Math.floor(ago / HOUR), 'hour')
  if (ago < 60 * DAY) return rtf.format(-Math.round(ago / DAY), 'day')
  if (ago < 365 * DAY) return rtf.format(-Math.round(ago / (30 * DAY)), 'month')
  return rtf.format(-Math.round(ago / (365 * DAY)), 'year')
}
