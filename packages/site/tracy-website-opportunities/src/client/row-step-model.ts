/**
 * The middle and right of a My opportunities row (#537, option A): three small segments with "Step n of 3", the
 * state of the current step in the words the Details page uses, and the one action of that step.
 *
 * It reads ONLY the stepper view (`stepperView`) and the Details header chip (`reviewChipOf`), the same view the
 * Progress band draws, so the list and Details can never disagree. It adds no state of its own: a running step reads
 * as running with a quiet Open, a finished place reads Site ready with Open your site.
 * Pure: no DOM, no fetch, no clock read.
 */
import { type StepAction, type StepLine, type StepperView, reviewChipOf } from './stepper-model.ts'

export type RowSegment = 'done' | 'current' | 'future'

/** The row's action: a step action of the band, Open (Details, while a job runs) or Open your site. */
export type RowActionKind = StepAction | 'open' | 'open-site'

export interface RowAction {
  kind: RowActionKind
  labelKey: string
  /** primary: the step waits for the seller · outline: Open your site · quiet: a plain Open link. */
  look: 'primary' | 'outline' | 'quiet'
}

export interface RowStep {
  /** The current step, 1 based; equal to `total` once every step is done. */
  at: number
  total: number
  allDone: boolean
  segments: RowSegment[]
  /** The kicker: `band.kicker` (Step n of 3) or `band.allDone`. */
  kickerKey: string
  kickerParams?: Record<string, number>
  /** The state line of the current step. */
  stateKey: string
  tone: StepLine['tone']
  running: boolean
  action: RowAction | null
}

/** The state line of a running step, by step. */
const RUNNING_KEY: Record<string, string> = {
  research: 'row.researching',
  brief: 'stepper.brief.running',
  build: 'stepper.build.running'
}

/** The state line of a step that stopped on a failure, by step. */
const FAILED_KEY: Record<string, string> = {
  research: 'row.failed.research',
  brief: 'row.failed.brief',
  build: 'my.status.failed'
}

export function rowStepOf(view: StepperView): RowStep {
  const total = view.steps.length
  const index = view.current === null ? -1 : view.steps.findIndex((s) => s.id === view.current)
  const segments = view.steps.map((s): RowSegment => s.state)
  if (index < 0)
    return {
      at: total,
      total,
      allDone: true,
      segments,
      kickerKey: 'band.allDone',
      stateKey: 'chip.built',
      tone: 'ok',
      running: false,
      action: { kind: 'open-site', labelKey: 'row.openSite', look: 'outline' }
    }
  const step = view.steps[index]
  const base = {
    at: index + 1,
    total,
    allDone: false,
    segments,
    kickerKey: 'band.kicker',
    kickerParams: { n: index + 1, total }
  }
  const stepAction: RowAction | null =
    view.action === null ? null : { kind: view.action.kind, labelKey: view.action.labelKey, look: 'primary' }
  if (view.running)
    return {
      ...base,
      stateKey: RUNNING_KEY[step.id] ?? 'stepper.running',
      tone: 'run',
      running: true,
      action: { kind: 'open', labelKey: 'row.open', look: 'quiet' }
    }
  if (view.errorKey !== null)
    return {
      ...base,
      stateKey: FAILED_KEY[step.id] ?? 'stepper.failed',
      tone: 'error',
      running: false,
      action: stepAction
    }
  // A paused research and an expired site have their own words; every other state is the Details header chip.
  const chip: StepLine =
    step.status.key === 'stepper.paused'
      ? { key: 'stepper.paused', tone: 'warn' }
      : view.lineKey === 'stepper.build.expired'
        ? { key: 'my.status.expired', tone: 'warn' }
        : reviewChipOf(view)
  return { ...base, stateKey: chip.key, tone: chip.tone, running: false, action: stepAction }
}
