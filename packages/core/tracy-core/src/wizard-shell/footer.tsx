import { Button } from '@tracy/ui'
import { Loader2 } from 'lucide-react'
import type { JSX, ReactNode } from 'react'

/** The words the footer's buttons say; each caller passes its own translations. */
export interface WizardFooterWords {
  back: string
  skip: string
  continue: string
}

/**
 * One sticky action row for every editable page of a stepped wizard (moved from
 * `@tracy/dsh-add-site`). With no `onContinue` there is no Continue button at all: a step that has
 * nothing to go on with shows no dead button.
 */
export function WizardFooter({
  words,
  onBack,
  onContinue,
  continueLabel,
  continueProps,
  disabled,
  busy,
  onSkip,
  answeredStatus,
  outlined = false,
  children
}: {
  words: WizardFooterWords
  onBack?: () => void
  onContinue?: () => void
  continueLabel?: string
  /** Extra attributes for the Continue button (`data-*`, `form`, `type`). */
  continueProps?: Record<string, string | undefined>
  disabled?: boolean
  busy?: boolean
  onSkip?: () => void
  answeredStatus?: string
  outlined?: boolean
  /** Drawn in the action group, before Skip. */
  children?: ReactNode
}): JSX.Element {
  return (
    <footer className="tas-wizard-footer" data-wizard-footer="1">
      {onBack ? (
        <Button
          type="button"
          variant={outlined ? 'outline' : 'ghost'}
          className={outlined ? 'bg-transparent dark:bg-transparent' : 'border-transparent bg-transparent'}
          data-wizard-back="1"
          disabled={busy}
          onClick={onBack}
        >
          {words.back}
        </Button>
      ) : null}
      <div className="tas-wizard-actions">
        {answeredStatus ? (
          <span className="tas-wizard-answered" data-wizard-answered="1" data-ask-status="1">
            {answeredStatus}
          </span>
        ) : null}
        {children}
        {onSkip ? (
          <Button
            type="button"
            variant={outlined ? 'outline' : 'ghost'}
            className={outlined ? 'bg-transparent dark:bg-transparent' : 'border-transparent bg-transparent'}
            data-wizard-skip="1"
            disabled={busy}
            onClick={onSkip}
          >
            {words.skip}
          </Button>
        ) : null}
        {onContinue ? (
          <Button
            type="button"
            data-wizard-continue="1"
            {...continueProps}
            disabled={disabled || busy}
            onClick={onContinue}
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
            {continueLabel ?? words.continue}
          </Button>
        ) : null}
      </div>
    </footer>
  )
}
