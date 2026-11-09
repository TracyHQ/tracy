/**
 * The four steps of one place (spec #512, mock r6-a): 1 Research · 2 Content brief · 3 Build demo · 4 Send demo.
 * One pure model reads the place's own research, its latest Content brief job, its latest brief and its demo state,
 * and says which steps are done (with their date), which one is current with its one status line, and the ONE action
 * of the current step (or that a job is running, or why it failed). The Details stepper and the My opportunities
 * card both draw this, so a place never offers Build demo before it has a brief.
 * Pure: no DOM, no fetch, no clock read.
 */
import type { DemoState } from '@tracy/wo-views/demo-state'

import { type ResearchState, briefControlView } from './research-gate-model.ts'

export type StepId = 'research' | 'brief' | 'build' | 'send'
export const STEP_IDS: readonly StepId[] = Object.freeze(['research', 'brief', 'build', 'send'])

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
  | 'send'

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
  /** When the demo was sent. No door records a send yet, so callers pass null today. */
  sentAt?: string | null
}

export interface StepView {
  id: StepId
  /** `step.<id>`: Research, Content brief, Build demo, Send demo. */
  nameKey: string
  state: StepState
  /** The current step stopped on a failure. */
  failed: boolean
  /** ISO date a done step finished, when known. */
  doneAt: string | null
}

export interface StepperView {
  steps: StepView[]
  current: StepId | null
  /** The one status line of the current step. */
  lineKey: string | null
  /** A job of the current step is running: the button reads Running, disabled, with a spinner. */
  running: boolean
  /** The current step stopped: the plain sentence of why (the stepper shows it beside Try again). */
  errorKey: string | null
  action: { kind: StepAction; labelKey: string } | null
}

const MOVING = new Set(['queued', 'running'])
const STOPPED = new Set(['paused', 'blocked'])
const BUILDING = new Set<DemoState>(['queued', 'building'])

const hasBrief = (brief: StepperInput['brief']): boolean => typeof brief?.id === 'string' && brief.id !== ''

export function stepperView(input: StepperInput): StepperView {
  const done: Partial<Record<StepId, string | null>> = {}
  let current: StepId | null = null
  let lineKey: string | null = null
  let running = false
  let errorKey: string | null = null
  let action: StepperView['action'] = null
  const jobState = input.researchJob?.state ?? null

  if (!input.research.done) {
    current = 'research'
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
  } else {
    done.research = input.research.researchedAt
    const job = briefControlView({
      research: { state: 'done' },
      brief: input.brief,
      briefJob: input.briefJob
    })
    if (job.mode === 'running') {
      current = 'brief'
      running = true
      lineKey = 'stepper.brief.running'
    } else if (job.mode === 'failed' && !hasBrief(input.brief)) {
      current = 'brief'
      lineKey = 'stepper.brief.failed'
      errorKey = job.errorKey
      action = { kind: 'retry-brief', labelKey: 'action.tryAgain' }
    } else if (!hasBrief(input.brief)) {
      current = 'brief'
      lineKey = 'stepper.brief.ready'
      action = { kind: 'make-brief', labelKey: 'brief.make' }
    } else {
      done.brief = input.brief?.createdAt ?? null
      if (input.demo === 'ready') {
        done.build = input.demoAt ?? null
        if (input.sentAt) done.send = input.sentAt
        else {
          current = 'send'
          lineKey = 'stepper.send.ready'
          action = { kind: 'send', labelKey: 'v3.sendDemo' }
        }
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
          lineKey = 'stepper.build.ready'
          action = { kind: 'build', labelKey: 'v3.buildDemo' }
        }
      }
    }
  }

  const at = current === null ? STEP_IDS.length : STEP_IDS.indexOf(current)
  const steps = STEP_IDS.map(
    (id, i): StepView => ({
      id,
      nameKey: `step.${id}`,
      state: i < at ? 'done' : i === at ? 'current' : 'future',
      failed: i === at && errorKey !== null,
      doneAt: i < at ? (done[id] ?? null) : null
    })
  )
  return { steps, current, lineKey, running, errorKey, action }
}
