/**
 * What the screen says about a job, a source and a build, as translation keys.
 *
 * Partial, blocked and failed never read as complete: the server's own word picks the label, and a
 * reason the screen does not know yet is shown as "other" rather than hidden.
 */
export type Tone = 'ok' | 'partial' | 'blocked' | 'failed' | 'skipped' | 'waiting'

const SOURCE_STATUS: Readonly<Record<string, Tone>> = {
  complete: 'ok',
  partial: 'partial',
  blocked: 'blocked',
  failed: 'failed',
  skipped: 'skipped'
}

/** The sources a place's research card lists, which a Retry can collect again alone (`only` of `POST …/research`). */
export const SHOWN_SOURCES = [
  'website',
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'facebook-search',
  'instagram-search',
  'google-places',
  'google-maps',
  'tripadvisor',
  'menu-file',
  'menu-photos'
] as const
export type ShownSource = (typeof SHOWN_SOURCES)[number]
const SHOWN = new Set<string>(SHOWN_SOURCES)
export const isShownSource = (source: string): source is ShownSource => SHOWN.has(source)
const RETRYABLE_TONES = new Set<Tone>(['blocked', 'failed', 'skipped'])
/** Reasons that say the place has nothing at a source: settled, not done (the server's `PLACE_SETTLED_REASONS`). */
export const PLACE_SETTLED_REASONS = ['not_found', 'private_or_empty', 'ambiguous'] as const

const REASONS = new Set([
  'credential_missing',
  'login_required',
  'rate_limited',
  'not_found',
  'timeout',
  'quota',
  'url_blocked',
  'feature_off',
  'template_unselected',
  'template_unavailable',
  'no_template_for_cms',
  'templates_unreadable',
  'site_not_ready',
  'handoff_unsupported',
  'handoff_in_progress',
  'handoff_baseline_failed',
  'qa_needs_review',
  'store_unavailable',
  'demo_step_timeout',
  'agent_demo_turn_stopped',
  'agent_demo_turn_lost',
  'agent_demo_ended_unchecked'
])

const JOB_STATES = new Set(['queued', 'running', 'paused', 'blocked', 'failed', 'cancelled', 'completed'])
const JOB_STAGES = new Set(['discovery', 'collection', 'media', 'profile', 'brand', 'done'])
const MOVING = new Set(['queued', 'running'])

export interface SourceInput {
  ref?: string | null
  source: string
  status?: string | null
  reason?: string | null
  coverage?: { fetched?: number; total?: number } | null
  /** The place's own source (shared research); false or missing: the account's own link or per-account research. */
  shared?: boolean
  /** A web search row only (`facebook-search`, `instagram-search`): the pages it found and how many queries it asked. */
  pages?: unknown
  queries?: number | null
}

export interface SourceRow {
  source: string
  statusKey: string
  tone: Tone
  reasonKey: string | null
  fetched: number
  total: number | null
  /** Not collected, and the place's research can collect it again alone. */
  retryable: boolean
}

/** A reason code (`credential_missing`, `FEATURE_OFF`…) as its key; null when there is none. */
export function reasonKey(code: unknown): string | null {
  if (typeof code !== 'string' || code === '') return null
  const lower = code.toLowerCase()
  return REASONS.has(lower) ? `reason.${lower}` : 'reason.other'
}

export function sourceRow(input: SourceInput): SourceRow {
  const tone = SOURCE_STATUS[input.status ?? ''] ?? 'waiting'
  const fetched = input.coverage?.fetched
  const total = input.coverage?.total
  return {
    source: input.source,
    statusKey: `source.status.${tone === 'ok' ? 'complete' : tone}`,
    tone,
    reasonKey: reasonKey(input.reason),
    fetched: typeof fetched === 'number' ? fetched : 0,
    total: typeof total === 'number' ? total : null,
    retryable: input.shared === true && RETRYABLE_TONES.has(tone) && isShownSource(input.source)
  }
}

export interface JobInput {
  state?: string | null
  stage?: string | null
  lastError?: { code?: string } | null
  last_error?: { code?: string } | null
}

export interface JobView {
  stateKey: string
  stageKey: string | null
  running: boolean
  canResume: boolean
  canCancel: boolean
  reasonKey: string | null
}

export function jobView(job: JobInput | null | undefined): JobView | null {
  if (job === null || job === undefined) return null
  const state = typeof job.state === 'string' && JOB_STATES.has(job.state) ? job.state : 'queued'
  const stage = job.stage ?? ''
  return {
    stateKey: `job.state.${state}`,
    stageKey: JOB_STAGES.has(stage) && MOVING.has(state) ? `job.stage.${stage}` : null,
    running: MOVING.has(state),
    canResume: state === 'paused' || state === 'blocked' || state === 'failed',
    canCancel: MOVING.has(state) || state === 'paused' || state === 'blocked',
    reasonKey: reasonKey((job.lastError ?? job.last_error)?.code)
  }
}

/** Whether anything shown is still moving, so the screen asks again in a few seconds. */
export function shouldPoll(
  opportunities: ReadonlyArray<{ job?: JobInput | null }>,
  builds: ReadonlyArray<{ state?: string | null }> = []
): boolean {
  return (
    opportunities.some((o) => MOVING.has(o.job?.state ?? '')) || builds.some((b) => MOVING.has(b.state ?? ''))
  )
}

export interface SiteLinks {
  /** The site in Tracy (its workspace), always present once the site exists. */
  workspace: string
  /** The live address, only when it is an http(s) URL. */
  live: string | null
}

export function siteLinks(
  site: { key?: string; address?: string | null } | null | undefined
): SiteLinks | null {
  if (site === null || site === undefined || typeof site.key !== 'string' || site.key === '') return null
  const address = typeof site.address === 'string' && /^https?:\/\//i.test(site.address) ? site.address : null
  return { workspace: `/${encodeURIComponent(site.key)}/`, live: address }
}

export interface BuildAnswer {
  build?: {
    state?: string | null
    receipt?: { body?: { code?: unknown } | null } | null
    lastError?: { code?: string } | null
    last_error?: { code?: string } | null
  }
  site?: { key?: string; address?: string | null } | null
  /** The create door's own row for this build (`site_creation`): `done` once the site is ready. */
  siteJob?: { state?: string | null } | null
}

export interface BuildView {
  /** `deleted`: the retention sweep tore the demo down — no site to open, Rebuild makes it again. */
  phase: 'running' | 'done' | 'failed' | 'deleted'
  links: SiteLinks | null
  reasonKey: string | null
}

const BUILD_DONE = new Set(['completed', 'done'])
const BUILD_FAILED = new Set(['failed', 'cancelled', 'blocked', 'refused'])

export function buildView(answer: BuildAnswer): BuildView {
  const state = answer.build?.state ?? 'requesting'
  const siteState = answer.siteJob?.state ?? ''
  if (state === 'deleted') return { phase: 'deleted', links: null, reasonKey: null }
  const links = siteLinks(answer.site)
  const code =
    (answer.build?.lastError ?? answer.build?.last_error)?.code ?? answer.build?.receipt?.body?.code
  if (BUILD_DONE.has(state) || siteState === 'done') return { phase: 'done', links, reasonKey: null }
  if (BUILD_FAILED.has(state) || BUILD_FAILED.has(siteState)) {
    return { phase: 'failed', links, reasonKey: reasonKey(code) ?? 'reason.other' }
  }
  return { phase: 'running', links, reasonKey: null }
}
