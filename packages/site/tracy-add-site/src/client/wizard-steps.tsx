import type { JSX } from 'react'
import { type WizardStep, WizardSteps as SharedWizardSteps } from '@tracy/core/wizard-shell'

import type { Translate } from './strings'

export type { WizardStep }

/** Completed pages stay reachable without allowing a jump past an unanswered page. */
export function WizardSteps({
  t,
  ...props
}: {
  steps: WizardStep[]
  current: string
  done: string[]
  onStep?: (id: string) => void
  t: Translate
  completedLabel?: string
  currentState?: 'running' | 'done' | 'failed'
}): JSX.Element {
  return (
    <SharedWizardSteps
      {...props}
      words={{
        nav: t('wizard_steps'),
        position: (n, total) => t('wizard_step_position', { n, total }),
        allDone: t('wizard_steps_done')
      }}
    />
  )
}
