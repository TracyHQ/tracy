import type { JSX } from 'react'
import { CircleCheck, CircleX, Clock } from 'lucide-react'
import { Spinner } from '@tracy/ui'
import { DemoCell, chainProgressView } from '@tracy/wo-views'
import type { ChainEstimate, ChainRun, DemoCellActions } from '@tracy/wo-views'
import { ResearchCell, StepsBar } from './opportunity-cells.tsx'
import {
  demoActionOpen,
  demoFailureKey,
  stageOf,
  researchSummary,
  type OpportunityListRow
} from './opportunity-row.ts'
import type { Translate } from './strings.ts'
import { CMS_LABEL } from './cms-label.ts'
import { type AgainControl, ResearchAgainButton } from './research-again-dialog.tsx'

const BUILD_STEPS = ['brief', 'build', 'fill', 'check'] as const
export function buildProgress(row: OpportunityListRow) {
  const action = row.demoAction
  const step = BUILD_STEPS.indexOf(action?.step as (typeof BUILD_STEPS)[number])
  return {
    step: step < 0 ? 1 : step + 1,
    done: !demoActionOpen(row) && (row.demo?.qa === 'passed' || row.latestBuild?.qa === 'passed'),
    failed: action?.state === 'failed' || row.demo?.qa === 'failed',
    running:
      action?.state === 'queued' ||
      // `baseline`: the site check is still reading the site before the prompt goes out (`demo-qa.js`).
      ['baseline', 'pending', 'retry'].includes(row.latestBuild?.qa ?? row.demo?.qa ?? '')
  }
}
export function ProgressCell({
  t,
  row,
  locale,
  now
}: {
  t: Translate
  row: OpportunityListRow
  locale: string
  now: number
}): JSX.Element {
  if (stageOf(row) === 'research' || stageOf(row) === 'cancelled')
    return <ResearchCell t={t} row={row} locale={locale} now={now} />
  if (!row.demoAction && !row.latestBuild) return <ResearchCell t={t} row={row} locale={locale} now={now} />
  const run = row.demoAction?.run
  if (run && row.demoAction?.state !== 'completed') {
    const view = chainProgressView(run, now)
    return (
      <div className="tracy-wo-research">
        <span className="tracy-wo-small">{nowSentence(t, row, run)}</span>
        <StepsBar t={t} step={view.done + 1} steps={view.total} />
      </div>
    )
  }
  const p = buildProgress(row)
  const why = demoFailureKey(row)
  if (p.done)
    return (
      <div className="tracy-wo-research">
        <span className="tracy-wo-small">
          {[t('v3.demoReady'), row.latestRevision?.template?.label, CMS_LABEL[row.latestRevision?.cms ?? '']]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {row.demo ? <DemoCell t={t} locale={locale} demo={row.demo} now={now} showSite={false} /> : null}
      </div>
    )
  return (
    <div className="tracy-wo-research">
      <span className="tracy-wo-row">
        {p.failed ? (
          <CircleX className="tracy-wo-icon" aria-hidden="true" />
        ) : p.running ? (
          <Spinner label={t('v3.building')} />
        ) : null}
        <span className="tracy-wo-small">{t(`v3.step.${BUILD_STEPS[p.step - 1]}`)}</span>
      </span>
      <StepsBar t={t} step={p.done ? 5 : p.step} steps={4} />
      <span className="tracy-wo-muted tracy-wo-small">{t('research.step', { step: p.step, steps: 4 })}</span>
      {p.failed && why ? <span className="tracy-wo-error tracy-wo-small">{t(why)}</span> : null}
    </div>
  )
}
export interface DemoStepFacts {
  writes: number | null
  photos: number | null
  qa: { state: string; rounds: number; issues: number | null } | null
}
export function Steps({
  t,
  row,
  children,
  facts,
  locale = 'en',
  now = Date.now(),
  onBrief,
  again
}: {
  t: Translate
  row: OpportunityListRow
  children?: JSX.Element
  facts?: DemoStepFacts | null
  locale?: string
  now?: number
  onBrief?: () => void
  /** Research again (`useResearchAgain`); drawn once the research is not running. */
  again?: AgainControl
}): JSX.Element {
  const summary = researchSummary(row)
  const p = buildProgress(row)
  const why = demoFailureKey(row)
  const researchDone = summary.kind === 'done'
  return (
    <section className="tracy-wo-insp-sec" aria-label={t('v3.steps')}>
      <h3 className="tracy-wo-h3">{t('v3.steps')}</h3>
      <ol className="tracy-wo-step-list">
        <li>
          <span>
            {researchDone ? (
              <CircleCheck className="tracy-wo-icon" aria-hidden="true" />
            ) : summary.kind === 'running' ? (
              <Spinner label={t('v3.research')} />
            ) : (
              <Clock className="tracy-wo-icon" aria-hidden="true" />
            )}
          </span>
          <div className="tracy-wo-flow-content">
            <b>{`1 · ${t('v3.research')}`}</b>
            <ResearchCell t={t} row={row} locale={locale} now={now} />
            {again && summary.kind !== 'running' && summary.kind !== 'queued' ? (
              <ResearchAgainButton t={t} locale={locale} name={row.name ?? ''} control={again} />
            ) : null}
            {children ? (
              // Open once research has started: the sources it read stay in view after it is done too.
              <details open={summary.kind !== 'none' && summary.kind !== 'queued'}>
                <summary className="tracy-wo-muted">{t('v3.step.sources')}</summary>
                {children}
              </details>
            ) : null}
          </div>
        </li>
        {row.demoAction?.run ? (
          <li>
            <span>
              {row.demoAction.state === 'queued' ? (
                <Spinner label={t('progress.building')} />
              ) : (
                <Clock className="tracy-wo-icon" aria-hidden="true" />
              )}
            </span>
            <div className="tracy-wo-flow-content">
              <DemoProgress t={t} row={row} locale={locale} now={now} />
            </div>
          </li>
        ) : null}
        {(row.demoAction?.run ? [] : BUILD_STEPS).map((key, i) => {
          const complete =
            p.done ||
            i + 1 < p.step ||
            (key === 'brief' && Boolean(row.latestRevision)) ||
            (key === 'build' && row.latestBuild?.done === true)
          const running = !p.done && i + 1 === p.step && p.running
          const failed = p.failed && i + 1 === p.step
          const Icon = complete ? CircleCheck : failed ? CircleX : Clock
          return (
            <li
              key={key}
              data-complete={complete || undefined}
              data-current={running || undefined}
              data-failed={failed || undefined}
            >
              <span>
                {running ? (
                  <Spinner label={t(`v3.step.${key}`)} />
                ) : (
                  <Icon className="tracy-wo-icon" aria-hidden="true" />
                )}
              </span>
              <div className="tracy-wo-flow-content">
                <b>{`${i + 2} · ${t(`v3.step.${key}`)}`}</b>
                {key === 'brief' && row.latestRevision ? (
                  <span className="tracy-wo-muted tracy-wo-small">
                    {[
                      t('brief.number', { n: row.latestRevision.n ?? 1 }),
                      row.latestRevision.template?.label,
                      row.latestRevision.cms
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {onBrief ? (
                      <button type="button" className="tracy-wo-flow-link" onClick={onBrief}>
                        {t('inspector.details')}
                      </button>
                    ) : null}
                  </span>
                ) : null}
                {key === 'build' && row.demo?.url ? (
                  <span className="tracy-wo-muted tracy-wo-small">{row.demo.url}</span>
                ) : null}
                {key === 'fill' && facts ? (
                  <span className="tracy-wo-muted tracy-wo-small">
                    {[
                      facts.writes === null ? null : t('v3.writes', { count: facts.writes }),
                      facts.photos === null ? null : t('v3.placed', { count: facts.photos })
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
                {key === 'check' && facts?.qa ? (
                  <span className="tracy-wo-muted tracy-wo-small">
                    {[
                      t('v3.rounds', { count: facts.qa.rounds }),
                      facts.qa.issues === null ? null : t('v3.issues', { count: facts.qa.issues })
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
                {failed ? (
                  <span className="tracy-wo-error tracy-wo-small">
                    {t('v3.stepFailed', { step: t(`v3.step.${key}`) })}
                  </span>
                ) : null}
                {failed && why ? <span className="tracy-wo-error tracy-wo-small">{t(why)}</span> : null}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
export function DemoSiteCell({
  t,
  row,
  locale,
  now,
  actions
}: {
  t: Translate
  row: OpportunityListRow
  locale: string
  now: number
  actions?: DemoCellActions
}): JSX.Element {
  const demo = row.demo
  if (!demo) return <span className="tracy-wo-muted">{t('v3.notBuilt')}</span>
  const building =
    row.demoAction?.state === 'queued' || (!row.latestBuild?.done && row.latestBuild?.state !== 'failed')
  return (
    <div className="tracy-wo-demo-cell">
      {demo.url ? (
        building ? (
          <span className="tracy-wo-muted tracy-wo-demo-url" aria-disabled="true">
            {demo.url}
          </span>
        ) : (
          <a
            className="tracy-wo-demo-url"
            href={demo.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {demo.url}
          </a>
        )
      ) : (
        <span className="tracy-wo-muted">{t('v3.notBuilt')}</span>
      )}
      {demo.qa === 'failed' ? (
        <span className="tracy-wo-error tracy-wo-small">{t('v3.needsReview')}</span>
      ) : null}
      <DemoCell t={t} locale={locale} demo={demo} now={now} actions={actions} showSite={false} />
    </div>
  )
}

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
  now = Date.now()
}: {
  t: Translate
  row: OpportunityListRow
  locale?: string
  now?: number
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
      <details>
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
