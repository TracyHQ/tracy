import type { JSX } from 'react'
import { CircleCheck, CircleX, Clock } from 'lucide-react'
import { Spinner } from '@tracy/ui'
import { DemoCell } from '@tracy/wo-views'
import type { DemoCellActions } from '@tracy/wo-views'
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
              <details open={summary.kind === 'stopped' || summary.kind === 'running'}>
                <summary className="tracy-wo-muted">{t('v3.step.sources')}</summary>
                {children}
              </details>
            ) : null}
          </div>
        </li>
        {BUILD_STEPS.map((key, i) => {
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
