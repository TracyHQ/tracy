/**
 * The build run's steps as Progress band sub-steps (#537): the step chain (`demoAction.run`, states done, current and
 * upcoming) read into the same `BandSubStep` list the research and brief rows use, so the band draws ONE kind of row
 * (`progress-band-subs.tsx`) for all three steps. Pure: no React, no clock.
 */
import type { ChainRun } from '@tracy/wo-views'

import type { BandSubStep } from './stepper-model.ts'
import type { Translate } from './strings.ts'

const STEP_KEYS = new Set(['kit', 'brand', 'plan', 'copy', 'pictures', 'write'])

/** A chain step's label: the string table first, the server's English label for a step it does not know yet. */
export function chainStepLabel(t: Translate, run: ChainRun, id: string): string {
  return STEP_KEYS.has(id) ? t(`progress.step.${id}`) : (run.steps.find((s) => s.id === id)?.label ?? id)
}

/** Whether a step id has its own sentence in the string table (`progress.now.<id>`). */
export const knownChainStep = (id: string): boolean => STEP_KEYS.has(id)

/**
 * The run's steps as sub-steps: done stays done, current runs (or failed, when the build stopped there), upcoming
 * waits. A finished build shows every step done.
 */
export function chainSubSteps(
  t: Translate,
  run: ChainRun,
  actionState: string | null | undefined
): BandSubStep[] {
  const finished = actionState === 'completed'
  const failed = actionState === 'failed'
  return run.steps.map((s) => ({
    key: s.id,
    label: chainStepLabel(t, run, s.id),
    state:
      finished || s.state === 'done'
        ? 'done'
        : s.state === 'current'
          ? failed
            ? 'failed'
            : 'running'
          : 'waiting'
  }))
}
