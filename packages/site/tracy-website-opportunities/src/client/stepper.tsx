/**
 * The three steps of one place (spec #512, layout C with stepper style D). On Details it is the Progress card at the
 * top of the left column: a vertical list of numbered dots joined by a line, a done step with a check and "Done
 * <date>", the current step with its ring, its status line (or why it stopped) and the ONE action of the step (Running while a job runs,
 * why it stopped with Try again), an upcoming step muted. A sub-page draws the same one action in its title row
 * (`StepButton`, beside the progress line of `sub-page-header.tsx`). The view comes from `stepper-model.ts`.
 */
import type { JSX } from 'react'
import { Check } from 'lucide-react'
import { Button, Spinner } from '@tracy/ui'

import { StatusPill } from './status-pill.tsx'
import type { StepAction, StepperView } from './stepper-model.ts'
import type { Translate } from './strings.ts'

const shortDate = (iso: string | null, locale: string): string | null => {
  const ms = iso ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms)
}

/** The one action of the current step, the Running status pill while its job runs, or nothing. */
export function StepButton({
  t,
  view,
  busy,
  disabled,
  onAction
}: {
  t: Translate
  view: StepperView
  busy: boolean
  disabled: boolean
  onAction: (action: StepAction) => void
}): JSX.Element | null {
  if (view.running) return <StatusPill state="running" label={t('stepper.running')} />
  if (view.action === null) return null
  return (
    <Button
      type="button"
      size="sm"
      disabled={busy || disabled}
      onClick={() => view.action && onAction(view.action.kind)}
    >
      {busy ? <Spinner label={t(view.action.labelKey)} /> : null}
      {t(view.action.labelKey)}
    </Button>
  )
}

export function Stepper({
  t,
  view,
  locale,
  busy,
  disabled = false,
  onAction
}: {
  t: Translate
  view: StepperView
  locale: string
  /** A press of this page is in flight. */
  busy: boolean
  /** The action waits (the daily build limit is used up). */
  disabled?: boolean
  onAction: (action: StepAction) => void
}): JSX.Element {
  const line = view.lineKey === null ? null : t(view.lineKey)
  const button = <StepButton t={t} view={view} busy={busy} disabled={disabled} onAction={onAction} />
  const dot = (state: string, i: number): JSX.Element => (
    <span className="tracy-wo-step-dot" aria-hidden="true">
      {state === 'done' ? <Check /> : i + 1}
    </span>
  )
  return (
    <section className="tracy-wo-progress" aria-label={t('progress.title')}>
      <h3 className="tracy-wo-psec-title">{t('progress.title')}</h3>
      <ol className="tracy-wo-progress-steps">
        {view.steps.map((step, i) => {
          const date = shortDate(step.doneAt, locale)
          const current = step.state === 'current'
          return (
            <li
              key={step.id}
              className="tracy-wo-step"
              data-state={step.state}
              data-failed={step.failed ? '' : undefined}
              aria-current={current ? 'step' : undefined}
            >
              <span className="tracy-wo-step-mark">
                {dot(step.state, i)}
                <span className="tracy-wo-step-ln" />
              </span>
              <span className="tracy-wo-step-body">
                <span className="tracy-wo-step-name">{t(step.nameKey)}</span>
                {step.state === 'done' ? (
                  <span className="tracy-wo-step-sub">
                    {date === null ? t('stepper.done') : t('stepper.doneOn', { date })}
                  </span>
                ) : current && line !== null && view.errorKey === null ? (
                  <span className="tracy-wo-step-sub tracy-wo-step-line">{line}</span>
                ) : null}
                {current && view.errorKey !== null ? (
                  <span className="tracy-wo-error tracy-wo-small" role="alert">
                    {t(view.errorKey)}
                  </span>
                ) : null}
                {current && (view.running || view.action !== null) ? (
                  <span className="tracy-wo-step-act">{button}</span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
