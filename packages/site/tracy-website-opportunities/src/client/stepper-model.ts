/**
 * The three steps of one place (spec #512, mock r6-a): 1 Research · 2 Content brief · 3 Build demo.
 * Sending the demo is not a step (no door records a send); it stays an action in the Demo site block menu.
 * One pure model reads the place's own research, its latest Content brief job, its latest brief and its demo state,
 * and says which steps are done (with their date), which one is current with its one status line, and the ONE action
 * of the current step (or that a job is running, or why it failed). The Details stepper and the My opportunities
 * card both draw this, so a place never offers Build demo before it has a brief.
 *
 * With the seller's approvals (`approval` of the Details and list answers, #537) two review states sit between the
 * steps: research done and the Profile not approved reads "Needs your review" on Research with Review profile, the
 * brief step locked; a brief made and not approved reads the same on Content brief, Build locked. A brief made from an
 * older Profile or older sources is stale, and a source added after research asks for research again. Without
 * `approval` (an older server) the steps read as before.
 * Pure: no DOM, no fetch, no clock read.
 */
import type { DemoState } from '@tracy/wo-views/demo-state'

import { type ResearchState, briefControlView } from './research-gate-model.ts'

export type StepId = 'research' | 'brief' | 'build'
export const STEP_IDS: readonly StepId[] = Object.freeze(['research', 'brief', 'build'])

export type StepState = 'done' | 'current' | 'future'

/** What the one button of the current step does. */
export type StepAction =
  | 'start-research'
  | 'resume-research'
  | 'make-brief'
  | 'retry-brief'
  | 'build'
  | 'retry-build'
  | 'rebuild'
  | 'review-profile'
  | 'review-brief'
  | 'research-again'

/** The seller's approvals as the server answers them (`approval.js approvalOf`); every field may be absent. */
export interface ApprovalInput {
  research?: 'ok' | 'sources_changed' | string | null
  profile?: 'none' | 'needed' | 'approved' | string | null
  profileApprovedAt?: string | null
  profileChangedAt?: string | null
  brief?: 'none' | 'needed' | 'approved' | 'stale' | string | null
  briefApprovedAt?: string | null
  briefStale?: 'profile' | 'sources' | string | null
  sourcesChangedAt?: string | null
}

/** One line of a step in the Progress list or its detail pane. */
export interface StepLine {
  key: string
  params?: Record<string, string | number>
  /** ok: settled · warn: waits for the seller · run: moving · error: stopped · mute: waiting for an earlier step. */
  tone: 'ok' | 'warn' | 'run' | 'error' | 'mute'
}

export interface StepperInput {
  /** This card's own research (`researchOf`). */
  research: { state: ResearchState; researchedAt: string | null; done: boolean }
  /** The research job of the card (`row.job`): queued, running, paused, blocked, failed, completed, cancelled. */
  researchJob?: { state?: string | null } | null
  /** The latest Content brief job (`body.briefJob`); the list has none. */
  briefJob?: unknown
  /** The latest brief (`body.brief`, or the list's `latestRevision`); null before the first one. */
  brief?: { id?: string; n?: number; createdAt?: string | null } | null
  /** The demo state machine's state (`demoStateOf`). */
  demo: DemoState
  /** When the ready demo was made, when known. */
  demoAt?: string | null
  /** The seller's approvals (#537); absent: the steps read without review states. */
  approval?: ApprovalInput | null
}

export interface StepView {
  id: StepId
  /** `step.<id>`: Research, Content brief, Build demo. */
  nameKey: string
  state: StepState
  /** The current step stopped on a failure. */
  failed: boolean
  /** ISO date a done step finished, when known. */
  doneAt: string | null
  /** The step waits for the seller's review (#537). */
  review: boolean
  /** When the seller approved what this step made, when known. */
  approvedAt: string | null
  /** Why a later step cannot start yet (`stepper.lock.*`), or null. */
  lockKey: string | null
  /** The one status line of the step in the Progress list. */
  status: StepLine
}

export interface StepperView {
  steps: StepView[]
  current: StepId | null
  /** The one status line of the current step. */
  lineKey: string | null
  /** A job of the current step is running: the button reads Running, disabled, with a spinner. */
  running: boolean
  /** The duration estimate tag of the current step (`stepper.estimate.*`), or null when none is known. */
  estimateKey: string | null
  /** The current step stopped: the plain sentence of why (the stepper shows it beside Try again). */
  errorKey: string | null
  action: { kind: StepAction; labelKey: string } | null
  /** The current step waits for the seller's review: its action opens the sub-page to review. */
  review: boolean
}

/** Where a status line carries a known duration, that estimate is shown as a tag beside the step title. */
const ESTIMATE_OF: Record<string, string> = {
  'stepper.research.notStarted': 'stepper.estimate.research',
  'stepper.research.running': 'stepper.estimate.research',
  'stepper.brief.readyApproved': 'stepper.estimate.brief',
  'stepper.build.readyApproved': 'stepper.estimate.build'
}

const MOVING = new Set(['queued', 'running'])
const STOPPED = new Set(['paused', 'blocked'])
const BUILDING = new Set<DemoState>(['queued', 'building'])

const hasBrief = (brief: StepperInput['brief']): boolean => typeof brief?.id === 'string' && brief.id !== ''

/** The approvals in one shape: null when the server sent none (an older server), so no review state shows. */
export function approvalOf(input: ApprovalInput | null | undefined):
  | (Required<ApprovalInput> & {
      researchNeeded: boolean
    })
  | null {
  if (input === null || typeof input !== 'object') return null
  const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
  const raw = input
  const researchNeeded = raw.research === 'sources_changed'
  return {
    research: researchNeeded ? 'sources_changed' : 'ok',
    researchNeeded,
    profile: text(raw.profile) ?? 'none',
    profileApprovedAt: text(raw.profileApprovedAt),
    profileChangedAt: text(raw.profileChangedAt),
    brief: text(raw.brief) ?? 'none',
    briefApprovedAt: text(raw.briefApprovedAt),
    briefStale: text(raw.briefStale) ?? (raw.brief === 'stale' ? 'profile' : null),
    sourcesChangedAt: text(raw.sourcesChangedAt)
  }
}

/**
 * A brief made before the Profile was approved (an older brief, or one made before the approval rule) was made from
 * an older Profile: stale until a new brief is made, whatever the server's own `brief` says.
 */
function withOlderBrief(
  approval: ReturnType<typeof approvalOf>,
  brief: StepperInput['brief']
): ReturnType<typeof approvalOf> {
  if (approval === null || brief == null || approval.brief === 'stale') return approval
  const made = Date.parse(brief.createdAt ?? '')
  const approved = Date.parse(approval.profileApprovedAt ?? '')
  if (approval.profile !== 'approved' || !Number.isFinite(made) || !Number.isFinite(approved)) return approval
  return approved > made ? { ...approval, brief: 'stale', briefStale: 'profile' } : approval
}

/**
 * What on screen still counts as made, in ONE place (#537). The three steps depend on each other, so a reset
 * cascades downstream and nothing old is shown: the server keeps its revisions, the client treats them as not made.
 *   - research running again, sources changed, or the business facts not approved (or edited after approval):
 *     the brief and the site are not made;
 *   - a brief made before the facts were approved (`withOlderBrief`) or marked stale: the brief and the site are not
 *     made;
 *   - a brief that is not approved, or approved after the site was made: the site is not built.
 */
export function effectiveOf(input: StepperInput): { brief: StepperInput['brief']; demo: DemoState } {
  const approval = withOlderBrief(approvalOf(input.approval), hasBrief(input.brief) ? input.brief : null)
  const jobState = input.researchJob?.state ?? null
  const again = input.research.state === 'running' || MOVING.has(jobState ?? '')
  const briefUsable =
    hasBrief(input.brief) &&
    !again &&
    (approval === null ||
      (!approval.researchNeeded && approval.profile === 'approved' && approval.brief !== 'stale'))
  const approvedAt = Date.parse(approval?.briefApprovedAt ?? '')
  const builtAt = Date.parse(input.demoAt ?? '')
  const approvedAfterBuild = Number.isFinite(approvedAt) && Number.isFinite(builtAt) && approvedAt > builtAt
  const demoValid =
    briefUsable && (approval === null || (approval.brief === 'approved' && !approvedAfterBuild))
  return { brief: briefUsable ? input.brief : null, demo: demoValid ? input.demo : 'none' }
}

/** Whether the latest brief counts as made on screen (`effectiveOf`). */
export const briefUsableOf = (input: StepperInput): boolean => effectiveOf(input).brief != null

export function stepperView(raw: StepperInput): StepperView {
  const input = { ...raw, ...effectiveOf(raw) }
  const done: Partial<Record<StepId, string | null>> = {}
  const approvedAt: Partial<Record<StepId, string | null>> = {}
  const lockOf: Partial<Record<StepId, string>> = {}
  let current: StepId | null = null
  let lineKey: string | null = null
  let running = false
  let errorKey: string | null = null
  let action: StepperView['action'] = null
  let review = false
  const jobState = input.researchJob?.state ?? null
  const briefMade = hasBrief(input.brief)
  const approval = withOlderBrief(approvalOf(input.approval), briefMade ? input.brief : null)

  if (!input.research.done) {
    current = 'research'
    if (input.research.researchedAt !== null) {
      // Research runs again: what came after it waits.
      lockOf.brief = 'stepper.lock.research'
      lockOf.build = 'stepper.lock.both'
    }
    if (input.research.state === 'running' || MOVING.has(jobState ?? '')) {
      running = true
      lineKey = 'stepper.research.running'
    } else if (STOPPED.has(jobState ?? '')) {
      lineKey = 'stepper.research.paused'
      action = { kind: 'resume-research', labelKey: 'job.resume' }
    } else if (input.research.state === 'failed' || jobState === 'failed') {
      lineKey = 'stepper.stopped'
      errorKey = 'stepper.research.failed'
      action = { kind: 'resume-research', labelKey: 'action.tryAgain' }
    } else {
      lineKey = 'stepper.research.notStarted'
      action = { kind: 'start-research', labelKey: 'job.start' }
    }
  } else if (approval?.researchNeeded || input.research.state === 'running' || MOVING.has(jobState ?? '')) {
    // A source added after research: research reads the business again before anything downstream counts (#537).
    current = 'research'
    if (input.research.state === 'running' || MOVING.has(jobState ?? '')) {
      running = true
      lineKey = 'stepper.research.running'
    } else {
      lineKey = 'stepper.research.sourcesChanged'
      action = { kind: 'research-again', labelKey: 'details.researchAgain' }
    }
    lockOf.brief = 'stepper.lock.researchAgain'
    lockOf.build = 'stepper.lock.both'
  } else if (approval !== null && approval.profile !== 'approved') {
    // Research done, the Profile not approved yet (or edited after approval): the seller reviews it first.
    current = 'research'
    review = true
    lineKey = 'stepper.review.profile'
    action = { kind: 'review-profile', labelKey: 'stepper.reviewProfile' }
    lockOf.brief = 'stepper.lock.profile'
    lockOf.build = 'stepper.lock.both'
  } else {
    done.research = input.research.researchedAt
    approvedAt.research = approval?.profileApprovedAt ?? null
    const job = briefControlView({
      research: { state: 'done' },
      brief: input.brief,
      briefJob: input.briefJob
    })
    if (job.mode === 'running') {
      current = 'brief'
      running = true
      lineKey = 'stepper.brief.running'
      lockOf.build = 'stepper.lock.brief'
    } else if (job.mode === 'failed' && !briefMade) {
      current = 'brief'
      lineKey = 'stepper.brief.failed'
      errorKey = job.errorKey
      action = { kind: 'retry-brief', labelKey: 'action.tryAgain' }
    } else if (!briefMade) {
      current = 'brief'
      lineKey = approval !== null ? 'stepper.brief.readyApproved' : 'stepper.brief.ready'
      action = { kind: 'make-brief', labelKey: 'brief.make' }
      lockOf.build = 'stepper.lock.brief'
    } else if (approval !== null && approval.brief !== 'approved') {
      current = 'brief'
      review = true
      lineKey = 'stepper.review.brief'
      action = { kind: 'review-brief', labelKey: 'stepper.reviewBrief' }
      lockOf.build = 'stepper.lock.brief'
    } else {
      done.brief = input.brief?.createdAt ?? null
      approvedAt.brief = approval?.briefApprovedAt ?? null
      if (input.demo === 'ready') {
        done.build = input.demoAt ?? null
      } else {
        current = 'build'
        if (BUILDING.has(input.demo)) {
          running = true
          lineKey = 'stepper.build.running'
        } else if (input.demo === 'failed') {
          lineKey = 'stepper.stopped'
          errorKey = 'stepper.build.failed'
          action = { kind: 'retry-build', labelKey: 'action.tryAgain' }
        } else if (input.demo === 'expired') {
          lineKey = 'stepper.build.expired'
          action = { kind: 'rebuild', labelKey: 'demo.primary.again' }
        } else {
          lineKey = approval !== null ? 'stepper.build.readyApproved' : 'stepper.build.ready'
          action = { kind: 'build', labelKey: 'v3.buildDemo' }
        }
      }
    }
  }

  const at = current === null ? STEP_IDS.length : STEP_IDS.indexOf(current)
  const steps = STEP_IDS.map((id, i): StepView => {
    const state: StepState = i < at ? 'done' : i === at ? 'current' : 'future'
    const failed = i === at && errorKey !== null
    const stepReview = i === at && review
    const lockKey = state === 'future' ? (lockOf[id] ?? null) : null
    const doneAt = i < at ? (done[id] ?? null) : null
    const approved = i < at ? (approvedAt[id] ?? null) : null
    const status: StepLine =
      state === 'done'
        ? approved !== null
          ? { key: 'stepper.approvedOn', params: { date: approved }, tone: 'ok' }
          : doneAt !== null
            ? { key: 'stepper.doneOn', params: { date: doneAt }, tone: 'ok' }
            : { key: 'stepper.done', tone: 'ok' }
        : failed
          ? { key: 'stepper.failed', tone: 'error' }
          : stepReview
            ? { key: 'stepper.needsReview', tone: 'warn' }
            : state === 'current'
              ? running
                ? { key: 'stepper.running', tone: 'run' }
                : id === 'research' && approval?.researchNeeded
                  ? { key: 'stepper.sourcesChanged', tone: 'warn' }
                  : lineKey === 'stepper.research.paused'
                    ? { key: 'stepper.paused', tone: 'warn' }
                    : { key: 'stepper.ready', tone: 'mute' }
              : { key: 'stepper.upNext', tone: 'mute' }
    return {
      id,
      nameKey: `step.${id}`,
      state,
      failed,
      doneAt,
      review: stepReview,
      approvedAt: approved,
      lockKey,
      status
    }
  })
  const estimateKey = errorKey === null && lineKey !== null ? (ESTIMATE_OF[lineKey] ?? null) : null
  return { steps, current, lineKey, estimateKey, running, errorKey, action, review }
}

/**
 * The chip in the Details header (#537): where the place stands for the seller, in one or two words
 * (`chip.*`): Researching, Profile needs review, Making brief, Brief needs review, Building your site, Site ready...
 */
export function reviewChipOf(view: StepperView): StepLine {
  const step = view.steps.find((s) => s.id === view.current)
  if (step === undefined) return { key: 'chip.built', tone: 'ok' }
  if (view.errorKey !== null) return { key: 'stepper.failed', tone: 'error' }
  if (step.id === 'research') {
    if (view.running) return { key: 'chip.researching', tone: 'run' }
    if (step.status.key === 'stepper.sourcesChanged') return { key: 'chip.sourcesChanged', tone: 'warn' }
    if (view.review) return { key: 'chip.profileReview', tone: 'warn' }
    return { key: 'chip.notStarted', tone: 'mute' }
  }
  if (step.id === 'brief') {
    if (view.running) return { key: 'chip.briefRunning', tone: 'run' }
    if (view.review) return { key: 'chip.briefReview', tone: 'warn' }
    return { key: 'chip.profileApproved', tone: 'ok' }
  }
  if (view.running) return { key: 'chip.building', tone: 'run' }
  return { key: 'chip.briefApproved', tone: 'ok' }
}

/** One sub-step of a running step, from the server. */
export interface BandSubStep {
  key: string
  label: string
  state: 'done' | 'running' | 'waiting' | 'failed'
}

const SUB_STATES = new Set(['done', 'running', 'waiting', 'failed'])

/**
 * The sub-steps of `stepProgress` (`{step, items: [{key, label, state}]}`) for one step, or an empty list when the
 * server sends none for it.
 */
export function bandSubSteps(stepProgress: unknown, step: string | null): BandSubStep[] {
  if (typeof stepProgress !== 'object' || stepProgress === null || step === null) return []
  const p = stepProgress as { step?: unknown; items?: unknown }
  if (p.step !== step || !Array.isArray(p.items)) return []
  return p.items.flatMap((raw): BandSubStep[] => {
    const i = (raw ?? {}) as Record<string, unknown>
    if (typeof i.label !== 'string' || i.label === '' || typeof i.state !== 'string') return []
    if (!SUB_STATES.has(i.state)) return []
    return [
      {
        key: typeof i.key === 'string' ? i.key : i.label,
        label: i.label,
        state: i.state as BandSubStep['state']
      }
    ]
  })
}
