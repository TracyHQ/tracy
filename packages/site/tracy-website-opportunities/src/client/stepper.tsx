/**
 * The three steps under the Details header, on every tab (mock r6-a): done steps carry a check and "Done <date>",
 * the current step its number, its name and one status line, future steps stay grey. At the right end sits the ONE
 * action of the current step, a disabled Running while a job runs, or why it stopped with Try again. In a narrow
 * panel the three names stay on one row and the status line with the button moves to a row below.
 * The view comes from `stepper-model.ts`.
 */
import type { JSX } from 'react'
import { Check } from 'lucide-react'
import { Button, Spinner } from '@tracy/ui'

import type { StepAction, StepperView } from './stepper-model.ts'
import type { Translate } from './strings.ts'

const shortDate = (iso: string | null, locale: string): string | null => {
  const ms = iso ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms)
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
  const failed = view.errorKey !== null
  return (
    <div className="tracy-wo-stepper-wrap">
      <section className="tracy-wo-stepper" aria-label={t('stepper.label')}>
        <ol className="tracy-wo-steps">
          {view.steps.map((step, i) => {
            const date = shortDate(step.doneAt, locale)
            return (
              <li
                key={step.id}
                className="tracy-wo-step"
                data-state={step.state}
                data-failed={step.failed ? '' : undefined}
                aria-current={step.state === 'current' ? 'step' : undefined}
              >
                <span className="tracy-wo-step-top">
                  <span className="tracy-wo-step-dot" aria-hidden="true">
                    {step.state === 'done' ? <Check /> : i + 1}
                  </span>
                  <span className="tracy-wo-step-ln" />
                </span>
                <span className="tracy-wo-step-name">{t(step.nameKey)}</span>
                {step.state === 'done' ? (
                  <span className="tracy-wo-step-sub">
                    {date === null ? t('stepper.done') : t('stepper.doneOn', { date })}
                  </span>
                ) : step.state === 'current' && line !== null ? (
                  <span className="tracy-wo-step-sub tracy-wo-step-line">{line}</span>
                ) : null}
              </li>
            )
          })}
        </ol>
        {view.action !== null || view.running || failed ? (
          <div className="tracy-wo-stepper-act">
            {line !== null ? <span className="tracy-wo-stepper-line">{line}</span> : null}
            {failed ? (
              <span className="tracy-wo-error tracy-wo-stepper-error" role="alert">
                {t(view.errorKey as string)}
              </span>
            ) : null}
            {view.running ? (
              <Button type="button" size="sm" variant="outline" disabled>
                <Spinner label={t('stepper.running')} />
                {t('stepper.running')}
              </Button>
            ) : view.action !== null ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || disabled}
                onClick={() => view.action && onAction(view.action.kind)}
              >
                {busy ? <Spinner label={t(view.action.labelKey)} /> : null}
                {t(view.action.labelKey)}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
