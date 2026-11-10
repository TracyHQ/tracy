/**
 * The Progress band at the top of Details (#537, option D): one full width band with two panes. The left pane lists
 * the three steps (a dot, the name with the status as a pill on its right, and one fixed line saying what the step does;
 * a step that waits shows only a lock icon in its pill, the short reason on hover). The right pane is the current step: "Step 2 of 3", its name, its one status line,
 * why it stopped, the REAL sub-steps of a running job, and the action buttons at its bottom right.
 *
 * Sub-steps come only from what the server sends: the Content brief job's steps (`briefControlView`), the build's
 * step chain (`DemoProgress`, passed in), or a `stepProgress` answer. Research sends none per card, so it shows one
 * running line. Nothing here counts time to fake progress. The view comes from `stepper-model.ts`.
 *
 * The band keeps ONE fixed height in every state (`progress-band-css.ts`): the left list sets it (three steps, each a
 * name with its pill, and one purpose line, all clamped to one line with the full text on hover), and the
 * right pane fills it with its buttons pinned to the bottom. Sub-steps run in one horizontal row of small nodes; a
 * long set scrolls sideways inside the row, which keeps the running node in view, so the pane never grows.
 */

import { Button, Spinner } from '@tracy/ui'
import { Check, Lock, Clock } from 'lucide-react'
import type { JSX, ReactNode } from 'react'

import { SubSteps } from './progress-band-subs.tsx'
import { type StepNodeState, SubStepNode } from './step-node.tsx'
import type { BandSubStep, StepAction, StepId, StepperView, StepView } from './stepper-model.ts'
import type { Translate } from './strings.ts'

const shortDate = (iso: unknown, locale: string): string | null => {
  const ms = typeof iso === 'string' ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms)
}

/** The status line of a step, its date formatted in the interface language. */
function statusText(t: Translate, step: StepView, locale: string): string {
  const date = shortDate(step.status.params?.date, locale)
  if (step.status.params?.date !== undefined && date === null) return t('stepper.done')
  return t(step.status.key, date === null ? step.status.params : { ...step.status.params, date })
}

const PURPOSE_OF: Record<StepId, string> = {
  research: 'band.purpose.research',
  brief: 'band.purpose.brief',
  build: 'band.purpose.build'
}

/** The pill of a step, to the right of its name: the state as a pill, or only a lock icon (reason on hover) for a locked step. */
function StatusPill({
  t,
  step,
  locale
}: {
  t: Translate
  step: StepView
  locale: string
}): JSX.Element | null {
  if (step.lockKey !== null) {
    const reason = t(step.lockKey)
    return (
      <span
        className="tracy-wo-stab-pill tracy-wo-band-pill"
        data-state="locked"
        role="img"
        title={reason}
        aria-label={reason}
      >
        <Lock aria-hidden="true" className="tracy-wo-icon" />
      </span>
    )
  }
  const full = statusText(t, step, locale)
  const tone = step.status.tone
  // A finished step already shows its green check in the number dot: no pill repeats "Done" (owner, #537). The
  // finish date stays readable on the step name through its title.
  if (tone === 'ok') return null
  const text = full
  const node: StepNodeState | null = tone === 'run' ? 'running' : tone === 'error' ? 'failed' : null
  const state = { run: 'reading', error: 'failed', warn: 'review', mute: 'next' }[tone]
  return (
    <span className="tracy-wo-stab-pill tracy-wo-band-pill" data-state={state} title={full}>
      {node !== null ? <SubStepNode state={node} label={text} /> : null}
      <span className="tracy-wo-band-pill-text">{text}</span>
    </span>
  )
}

export function ProgressBand({
  t,
  view,
  locale,
  busy,
  disabled = false,
  subSteps = [],
  buildSteps = null,
  error = null,
  onAction
}: {
  t: Translate
  view: StepperView
  locale: string
  /** A press of this page is in flight. */
  busy: boolean
  /** The action waits (the daily build limit is used up). */
  disabled?: boolean
  /** The sub-steps of the running step, from the server. */
  subSteps?: BandSubStep[]
  /** The build's own step chain (`DemoProgress`), shown while the build runs. */
  buildSteps?: ReactNode
  /** A refusal of the last press (`gate.*`), already in words. */
  error?: string | null
  onAction: (action: StepAction) => void
}): JSX.Element {
  const at = view.current === null ? -1 : view.steps.findIndex((s) => s.id === view.current)
  const current = at < 0 ? null : view.steps[at]
  const total = view.steps.length
  const dot = (step: StepView, i: number): JSX.Element => (
    <span className="tracy-wo-step-dot" aria-hidden="true">
      {step.state === 'done' ? <Check /> : i + 1}
    </span>
  )
  const action = view.action
  return (
    <section className="tracy-wo-band" data-fixed="" aria-label={t('progress.title')}>
      <ol className="tracy-wo-band-list">
        {view.steps.map((step, i) => (
          <li
            key={step.id}
            className="tracy-wo-step"
            data-state={step.state}
            data-failed={step.failed ? '' : undefined}
            data-review={step.review ? '' : undefined}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className="tracy-wo-step-mark">
              {dot(step, i)}
              <span className="tracy-wo-step-ln" />
            </span>
            <span className="tracy-wo-step-body">
              <span className="tracy-wo-band-top">
                <span className="tracy-wo-step-name" title={t(step.nameKey)}>
                  {t(step.nameKey)}
                </span>
                <StatusPill t={t} step={step} locale={locale} />
              </span>
              <span className="tracy-wo-band-purpose" title={t(PURPOSE_OF[step.id])}>
                {t(PURPOSE_OF[step.id])}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div
        className="tracy-wo-band-pane"
        data-review={view.review ? '' : undefined}
        data-build={view.running && current?.id === 'build' && buildSteps ? '' : undefined}
      >
        {current === null ? (
          <>
            <span className="tracy-wo-band-kicker">{t('band.allDone')}</span>
            <h3 className="tracy-wo-band-name">{t(view.steps[total - 1]?.nameKey ?? 'step.build')}</h3>
            <p className="tracy-wo-band-line" title={t('band.built')}>
              {t('band.built')}
            </p>
          </>
        ) : (
          <>
            <span className="tracy-wo-band-kicker">{t('band.kicker', { n: at + 1, total })}</span>
            <div className="tracy-wo-band-head">
              <h3 className="tracy-wo-band-name" title={t(current.nameKey)}>
                {t(current.nameKey)}
              </h3>
              {view.estimateKey !== null ? (
                <span className="tracy-wo-band-est" title={t(`${view.estimateKey}.why`)}>
                  <Clock className="tracy-wo-icon" aria-hidden="true" />
                  {t(view.estimateKey)}
                </span>
              ) : null}
            </div>
            {view.lineKey !== null && view.errorKey === null ? (
              <p className="tracy-wo-band-line" title={t(view.lineKey)}>
                {t(view.lineKey)}
              </p>
            ) : null}
            {view.errorKey !== null ? (
              <p className="tracy-wo-error tracy-wo-band-line" role="alert" title={t(view.errorKey)}>
                {t(view.errorKey)}
              </p>
            ) : null}
            {view.running ? (
              current.id === 'build' && buildSteps ? (
                <div className="tracy-wo-band-build">{buildSteps}</div>
              ) : subSteps.length > 0 ? (
                <SubSteps t={t} items={subSteps} />
              ) : (
                <p className="tracy-wo-band-running" role="status">
                  <Spinner label={t('stepper.running')} />
                  {t(current.id === 'research' ? 'band.research.collecting' : 'stepper.running')}
                </p>
              )
            ) : null}
          </>
        )}
        {error || view.running || action !== null ? (
          <div className="tracy-wo-band-acts">
            {error ? (
              <p className="tracy-wo-error tracy-wo-small tracy-wo-band-refused" role="alert" title={error}>
                {error}
              </p>
            ) : null}
            {view.running ? (
              <Button type="button" size="sm" variant="outline" disabled>
                <Spinner label={t('stepper.running')} />
                {t('stepper.running')}
              </Button>
            ) : action !== null ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || disabled}
                onClick={() => onAction(action.kind)}
              >
                {busy ? <Spinner label={t(action.labelKey)} /> : null}
                {t(action.labelKey)}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
