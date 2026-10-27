import type { JSX } from 'react'

export interface WizardStep {
  id: string
  label: string
}

/** The words the step bar says; each caller passes its own translations. */
export interface WizardStepsWords {
  /** Accessible name of the bar of segments. */
  nav: string
  /** "Step 2 of 6". */
  position: (n: number, total: number) => string
  /** Said instead of the position once no step is current. */
  allDone: string
}

/**
 * The segment bar and "Step N of M" over a stepped wizard (moved from `@tracy/dsh-add-site`).
 * Completed pages stay reachable without allowing a jump past an unanswered page.
 */
export function WizardSteps({
  steps,
  current,
  done,
  onStep,
  words,
  positionLabel,
  completedLabel,
  currentState
}: {
  steps: WizardStep[]
  current: string
  done: string[]
  onStep?: (id: string) => void
  words: WizardStepsWords
  /** Beside the position: the current step's own label when absent. */
  positionLabel?: string
  completedLabel?: string
  currentState?: 'running' | 'done' | 'failed'
}): JSX.Element {
  const index = steps.findIndex((step) => step.id === current)
  return (
    <div className="tas-wizard-steps" data-wizard-steps="1" data-wizard-current={current}>
      <nav className="tas-wizard-segments" aria-label={words.nav}>
        {steps.map((step, i) => {
          const complete = done.includes(step.id)
          return (
            <button
              key={step.id}
              type="button"
              className="tas-wizard-segment"
              data-active={index >= 0 ? (i <= index ? '1' : undefined) : complete ? '1' : undefined}
              data-step-state={step.id === current ? currentState : undefined}
              data-wizard-goto={step.id}
              aria-current={step.id === current ? 'step' : undefined}
              aria-label={step.label}
              title={step.label}
              disabled={!onStep || !complete || step.id === current}
              onClick={() => onStep?.(step.id)}
            >
              <span aria-hidden="true" />
            </button>
          )
        })}
      </nav>
      <div className="tas-wizard-position" aria-live="polite">
        {index >= 0 ? (
          <>
            <b>{words.position(index + 1, steps.length)}</b>
            <span>{positionLabel ?? steps[index].label}</span>
          </>
        ) : (
          <span>{completedLabel ?? words.allDone}</span>
        )}
      </div>
    </div>
  )
}
