/**
 * The demo progress card of a step chain build and the time and price line under a Build demo button (#516, spec #512).
 */
import type { JSX } from 'react'
import { CircleCheck, CircleX, Clock } from 'lucide-react'
import { Spinner } from '@tracy/ui'
import { chainProgressView } from '@tracy/wo-views'
import type { ChainEstimate, ChainRun } from '@tracy/wo-views'
import { demoFailureKey, type OpportunityListRow } from './opportunity-row.ts'
import type { Translate } from './strings.ts'

const STEP_KEYS = new Set(['kit', 'brand', 'plan', 'copy', 'pictures', 'write'])
/** A chain step's label: the string table first, the server's English label for a step it does not know yet. */
function stepLabel(t: Translate, run: ChainRun, id: string): string {
  return STEP_KEYS.has(id) ? t(`progress.step.${id}`) : (run.steps.find((s) => s.id === id)?.label ?? id)
}

/** The one plain sentence of the card: Ready, where it stopped, or what Tracy is doing now. */
function nowSentence(t: Translate, row: OpportunityListRow, run: ChainRun): string {
  const state = row.demoAction?.state
  if (state === 'completed') return t('progress.ready')
  if (state === 'failed')
    return t('progress.stopped', { step: stepLabel(t, run, run.current ?? run.steps[0]?.id ?? '') })
  if (run.current === null) return t('progress.now.start')
  return STEP_KEYS.has(run.current) ? t(`progress.now.${run.current}`) : stepLabel(t, run, run.current)
}

const usdText = (locale: string, usd: number): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(usd)

/**
 * The progress card of a demo build (#516, spec #512): a bar over the chain's steps, one sentence, about n min left
 * (the measured estimate minus the time since the start), the USD spent so far, and the steps folded under it, each
 * done, running or pending. A build with no chain progress (`demoAction.run`) shows one sentence while it builds; the
 * four steps of the older build are never drawn here.
 */
export function DemoProgress({
  t,
  row,
  locale = 'en',
  now = Date.now(),
  open = false
}: {
  t: Translate
  row: OpportunityListRow
  locale?: string
  now?: number
  /** The steps start unfolded (the Progress band lists them, #537). */
  open?: boolean
}): JSX.Element | null {
  const action = row.demoAction
  const run = action?.run
  if (!run) {
    if (action?.state !== 'queued') return null
    return (
      <div className="tracy-wo-progress" role="status">
        <span className="tracy-wo-progress-now">{t('progress.building')}</span>
      </div>
    )
  }
  const view = chainProgressView(run, now)
  const finished = action?.state === 'completed'
  const failed = action?.state === 'failed'
  const done = finished ? view.total : view.done
  const why = failed ? demoFailureKey(row) : null
  const facts = finished
    ? []
    : [
        failed || view.minutesLeft === null
          ? null
          : view.over
            ? t('progress.over')
            : t('progress.left', { n: view.minutesLeft }),
        t('progress.spent', { usd: usdText(locale, view.usd) })
      ].filter(Boolean)
  return (
    <div className="tracy-wo-progress" role="status">
      <span className="tracy-wo-progress-now">{nowSentence(t, row, run)}</span>
      <span
        className="tracy-wo-progress-bar"
        role="progressbar"
        aria-label={nowSentence(t, row, run)}
        aria-valuemin={0}
        aria-valuemax={view.total}
        aria-valuenow={done}
      >
        <span style={{ width: `${view.total === 0 ? 0 : (done / view.total) * 100}%` }} />
      </span>
      {facts.length ? <span className="tracy-wo-muted tracy-wo-small">{facts.join(' · ')}</span> : null}
      {!finished && !failed && view.minutesLeft === null ? (
        <span className="tracy-wo-muted tracy-wo-small">{t('progress.firstBuild')}</span>
      ) : null}
      {why ? <span className="tracy-wo-error tracy-wo-small">{t(why)}</span> : null}
      <details open={open}>
        <summary className="tracy-wo-small">{t('progress.show', { n: view.total })}</summary>
        <ol className="tracy-wo-progress-steps tracy-wo-small">
          {view.steps.map((s) => {
            const state = finished ? 'done' : s.state
            return (
              <li key={s.id} data-state={state}>
                {state === 'done' ? (
                  <CircleCheck className="tracy-wo-icon" aria-hidden="true" />
                ) : state === 'current' ? (
                  failed ? (
                    <CircleX className="tracy-wo-icon" aria-hidden="true" />
                  ) : (
                    <Spinner label={stepLabel(t, run, s.id)} />
                  )
                ) : (
                  <Clock className="tracy-wo-icon" aria-hidden="true" />
                )}
                <b>{stepLabel(t, run, s.id)}</b>
                <span className="tracy-wo-muted">
                  {state === 'done' && s.minutes !== null
                    ? t('progress.minutes', { n: Math.max(1, Math.round(s.minutes)) })
                    : t(`progress.state.${state}`)}
                </span>
              </li>
            )
          })}
        </ol>
      </details>
    </div>
  )
}

/**
 * The line under the Build demo button (#516): "about n min · about $x" from the template's measured estimate, the
 * measured on the first build note when none was measured yet (null), nothing when the template carries no estimate
 * (it is not built by the step chain).
 */
export function buildEstimateText(
  t: Translate,
  locale: string,
  estimate: ChainEstimate | null | undefined
): string | null {
  if (estimate === undefined) return null
  if (estimate === null) return t('progress.firstBuild')
  return t('progress.estimate', {
    n: Math.max(1, Math.round(estimate.minutes)),
    usd: usdText(locale, estimate.usd)
  })
}

export function BuildEstimate({
  t,
  locale = 'en',
  estimate
}: {
  t: Translate
  locale?: string
  estimate: ChainEstimate | null | undefined
}): JSX.Element | null {
  const text = buildEstimateText(t, locale, estimate)
  return text === null ? null : <p className="tracy-wo-muted tracy-wo-small">{text}</p>
}
