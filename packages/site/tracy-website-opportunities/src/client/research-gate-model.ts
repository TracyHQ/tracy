/**
 * What this card's own research allows (#524): Details shows research results only once it is done, and the Content
 * brief button stays locked with a short reason until then. Making the brief runs as a job in the background; its step
 * and its failure are read here. Source rows say when their data was collected.
 */
type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export type ResearchState = 'not_started' | 'running' | 'done' | 'failed'

export interface CardResearch {
  state: ResearchState
  researchedAt: string | null
  /** Research results may show: this card's research finished at least once. */
  done: boolean
}

const STATES = new Set<string>(['not_started', 'running', 'done', 'failed'])

/** The card's research from a Details or list answer; a host that does not send it yet reads as done (as before). */
export function researchOf(body: unknown): CardResearch {
  const r = rec(rec(body).research)
  const state = text(r.state)
  if (state === null || !STATES.has(state)) return { state: 'done', researchedAt: null, done: true }
  const researchedAt = text(r.researchedAt)
  return { state: state as ResearchState, researchedAt, done: researchedAt !== null || state === 'done' }
}

export type BriefStep = 'reading' | 'labelling' | 'writing'
const STEPS: readonly BriefStep[] = ['reading', 'labelling', 'writing']

export interface BriefControlView {
  /**
   * locked: research first; make: a button that starts a job; running: progress; failed: reason and Try again;
   * note: a line with no button (a brief of an older reading that a new brief would not change).
   */
  mode: 'none' | 'locked' | 'make' | 'running' | 'failed' | 'note'
  labelKey: string | null
  reasonKey: string | null
  noteKey: string | null
  errorKey: string | null
  steps: { step: BriefStep; labelKey: string; state: 'done' | 'running' | 'waiting' | 'failed' }[]
}

const ERRORS = new Set(['BRIEF_INTERRUPTED', 'BRIEF_INVALID', 'RESEARCH_NOT_DONE'])

/**
 * The Content brief control of a card, from its research, its current brief (`body.brief`) and its latest brief job
 * (`body.briefJob`).
 */
export function briefControlView({
  research,
  brief,
  briefJob,
  profileEditedAt = null
}: {
  research: unknown
  brief: unknown
  briefJob?: unknown
  /** When the seller last edited the Profile (`profileEditedAt`), or null. */
  profileEditedAt?: string | null
}): BriefControlView {
  const view: BriefControlView = {
    mode: 'none',
    labelKey: null,
    reasonKey: null,
    noteKey: null,
    errorKey: null,
    steps: []
  }
  const job = rec(briefJob)
  if (job.state === 'running') {
    const at = Math.max(0, STEPS.indexOf((text(job.step) ?? 'reading') as BriefStep))
    view.mode = 'running'
    view.steps = STEPS.map((step, i) => ({
      step,
      labelKey: `brief.job.step.${step}`,
      state: i < at ? 'done' : i === at ? 'running' : 'waiting'
    }))
    return view
  }
  const r = researchOf({ research })
  if (!r.done) {
    view.mode = 'locked'
    view.labelKey = 'brief.make'
    view.reasonKey = 'brief.locked'
    return view
  }
  const b = rec(brief)
  const hasBrief = text(b.id) !== null
  if (job.state === 'failed' && (!hasBrief || b.current !== true)) {
    const code = text(rec(job.error).code) ?? ''
    const at = STEPS.indexOf((text(job.step) ?? '') as BriefStep)
    view.mode = 'failed'
    view.labelKey = 'action.tryAgain'
    // A known code reads its own sentence; anything else names the step that did not finish, never the raw code.
    view.errorKey = ERRORS.has(code)
      ? `brief.job.error.${code.toLowerCase()}`
      : at >= 0
        ? `brief.job.error.at.${STEPS[at]}`
        : 'brief.job.error.other'
    if (at >= 0)
      view.steps = STEPS.map((step, i) => ({
        step,
        labelKey: `brief.job.step.${step}`,
        state: i < at ? 'done' : i === at ? 'failed' : 'waiting'
      }))
    return view
  }
  if (!hasBrief) {
    view.mode = 'make'
    view.labelKey = 'brief.make'
    return view
  }
  if (b.current === false && editsNewer(b.createdAt, profileEditedAt)) {
    // The seller's Profile edit is newer than the brief: a Refresh writes a brief with it, whatever the reading.
    view.mode = 'make'
    view.labelKey = 'brief.refresh'
    return view
  }
  if (b.current === false) {
    // The brief job cannot read the business again, so a brief that is out of date only because its reading is
    // older gets the note pointing to Research again, and no Refresh that would make the same brief.
    if (b.readingOld === true) view.noteKey = 'brief.readingOld'
    const refreshHelps = b.readingOld !== true || b.sameResearch === false
    view.mode = refreshHelps ? 'make' : 'note'
    if (refreshHelps) view.labelKey = 'brief.refresh'
  }
  return view
}

const editsNewer = (briefAt: unknown, editedAt: string | null): boolean => {
  const brief = typeof briefAt === 'string' ? Date.parse(briefAt) : Number.NaN
  const edit = editedAt === null ? Number.NaN : Date.parse(editedAt)
  return Number.isFinite(brief) && Number.isFinite(edit) && edit > brief
}

/**
 * The line of the Site brief block: up to date, out of date because the seller's Profile edit is newer than it, or
 * out of date because the research or the rules moved on.
 */
export function briefLineKey(brief: unknown, profileEditedAt: string | null): string {
  const b = rec(brief)
  if (b.current === true) return 'brief.current'
  if (b.current !== false) return 'brief.number'
  return editsNewer(b.createdAt, profileEditedAt) ? 'brief.staleEdits' : 'brief.stale'
}

/** "Collected 26 Oct" of a source row with collected data, or null. */
export function collectedLine(
  t: (key: string, params?: Record<string, string | number>) => string,
  row: unknown,
  locale: string
): string | null {
  const at = text(rec(row).collectedAt)
  const time = at === null ? Number.NaN : Date.parse(at)
  if (!Number.isFinite(time)) return null
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    time
  )
  return t('source.collectedOn', { date })
}
