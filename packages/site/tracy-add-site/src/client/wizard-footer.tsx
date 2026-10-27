import type { JSX } from 'react'
import { WizardFooter as SharedWizardFooter } from '@tracy/core/wizard-shell'

import type { Translate } from './strings'

/** One sticky action row for every editable page of either branch. */
export function WizardFooter({
  t,
  ...props
}: {
  t: Translate
  onBack?: () => void
  onContinue: () => void
  continueLabel?: string
  disabled?: boolean
  busy?: boolean
  onSkip?: () => void
  answeredStatus?: string
  outlined?: boolean
}): JSX.Element {
  return (
    <SharedWizardFooter
      {...props}
      words={{ back: t('wizard_back'), skip: t('wizard_skip'), continue: t('wizard_continue') }}
    />
  )
}
