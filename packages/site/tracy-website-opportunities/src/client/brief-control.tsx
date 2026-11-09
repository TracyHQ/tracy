/**
 * The Content brief control of the Details page (#524): locked with a short reason until this card's research is done,
 * then a button that starts the brief as a background job. While the job runs, its steps show here and the page polls
 * it like Research; a failed job says why with Try again. A settled job hands over to the brief line (`onSettled`).
 */
import { type JSX, useEffect, useState } from 'react'
import { CircleCheck, Clock } from 'lucide-react'
import { Button, Spinner } from '@tracy/ui'

import type { Api } from './api.ts'
import { usePoll } from './poll.ts'
import { briefControlView } from './research-gate-model.ts'
import type { Translate } from './strings.ts'

const requestId = (): string =>
  typeof crypto?.randomUUID === 'function'
    ? `brief-${crypto.randomUUID()}`
    : `brief-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function BriefControl({
  t,
  api,
  opportunityId,
  research,
  brief,
  briefJob,
  onSettled
}: {
  t: Translate
  api: Api
  opportunityId: string
  /** `body.research` of the Details answer. */
  research: unknown
  /** `body.brief` of the Details answer. */
  brief: unknown
  /** `body.briefJob` of the Details answer: a running job keeps showing after a reload. */
  briefJob: unknown
  onSettled: () => void
}): JSX.Element | null {
  const [job, setJob] = useState<unknown>(briefJob)
  const [pressing, setPressing] = useState(false)
  const [refused, setRefused] = useState(false)
  useEffect(() => setJob(briefJob), [briefJob])
  const jobRec = typeof job === 'object' && job !== null ? (job as Record<string, unknown>) : {}
  const running = jobRec.state === 'running' && typeof jobRec.id === 'string'
  usePoll(async () => {
    if (!running) return
    const answer = await api.briefJob(opportunityId, jobRec.id as string)
    if (!answer.ok) return
    const next = answer.body?.job
    setJob(next)
    if (typeof next === 'object' && next !== null && Reflect.get(next, 'state') !== 'running') onSettled()
  }, running)
  const view = briefControlView({ research, brief, briefJob: job })
  const press = async (): Promise<void> => {
    if (pressing) return
    setPressing(true)
    setRefused(false)
    const answer = await api.createRevision(opportunityId, requestId())
    setPressing(false)
    if (!answer.ok || answer.body?.job === undefined) return setRefused(true)
    setJob(answer.body.job)
  }
  if (view.mode === 'none') return null
  if (view.mode === 'running')
    return (
      <div className="tracy-wo-progress" role="status">
        <span className="tracy-wo-progress-now">{t('brief.job.title')}</span>
        <span
          className="tracy-wo-progress-bar"
          role="progressbar"
          aria-label={t('brief.job.title')}
          aria-valuemin={0}
          aria-valuemax={view.steps.length}
          aria-valuenow={view.steps.filter((s) => s.state === 'done').length}
        >
          <span
            style={{
              width: `${((view.steps.filter((s) => s.state === 'done').length + 0.5) / view.steps.length) * 100}%`
            }}
          />
        </span>
        <ol className="tracy-wo-progress-steps tracy-wo-small">
          {view.steps.map((s) => (
            <li key={s.step} data-state={s.state === 'running' ? 'current' : s.state}>
              {s.state === 'done' ? (
                <CircleCheck className="tracy-wo-icon" aria-hidden="true" />
              ) : s.state === 'running' ? (
                <Spinner label={t(s.labelKey)} />
              ) : (
                <Clock className="tracy-wo-icon" aria-hidden="true" />
              )}
              <b>{t(s.labelKey)}</b>
            </li>
          ))}
        </ol>
      </div>
    )
  return (
    <div className="tracy-wo-stack">
      {view.noteKey !== null ? <p className="tracy-wo-muted tracy-wo-small">{t(view.noteKey)}</p> : null}
      {view.errorKey !== null ? (
        <p className="tracy-wo-error" role="alert">
          {t(view.errorKey)}
        </p>
      ) : null}
      <div className="tracy-wo-row tracy-wo-wrap">
        <Button
          type="button"
          size="xs"
          disabled={view.mode === 'locked' || pressing}
          onClick={() => void press()}
        >
          {pressing ? <Spinner label={t(view.labelKey ?? 'brief.make')} /> : null}
          {t(view.labelKey ?? 'brief.make')}
        </Button>
        {view.reasonKey !== null ? (
          <span className="tracy-wo-muted tracy-wo-small">{t(view.reasonKey)}</span>
        ) : null}
      </div>
      {refused ? (
        <p className="tracy-wo-error" role="alert">
          {t('brief.failed')}
        </p>
      ) : null}
    </div>
  )
}
