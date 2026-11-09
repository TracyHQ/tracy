/**
 * The Content brief of the Details page (#524). `useBriefJob` owns the brief job: the press (from the stepper, or
 * Refresh of an out-of-date brief), and the poll while it runs, like Research. `BriefControl` draws the Site brief
 * block's status under the brief line: locked until research is done, the job's steps with a progress bar while it
 * runs, and a failed job's plain reason with the step that stopped. The one Make content brief / Try again button
 * lives in the stepper (mock r6-a), never here; only Refresh of an out-of-date brief stays as a secondary press.
 */
import { type JSX, useCallback, useEffect, useState } from 'react'
import { CircleAlert, CircleCheck, Circle } from 'lucide-react'
import { Button, Spinner } from '@tracy/ui'

import type { Api } from './api.ts'
import { usePoll } from './poll.ts'
import type { BriefControlView } from './research-gate-model.ts'
import type { Translate } from './strings.ts'

const requestId = (): string =>
  typeof crypto?.randomUUID === 'function'
    ? `brief-${crypto.randomUUID()}`
    : `brief-${Date.now()}-${Math.random().toString(36).slice(2)}`

export interface BriefJobControl {
  /** The latest job as this page knows it (from the Details answer, then pressed and polled here). */
  job: unknown
  pressing: boolean
  /** The last press was refused by the server. */
  refused: boolean
  press: () => Promise<void>
}

export function useBriefJob(
  api: Api,
  opportunityId: string,
  briefJob: unknown,
  onSettled: () => void
): BriefJobControl {
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
  const press = useCallback(async (): Promise<void> => {
    if (pressing) return
    setPressing(true)
    setRefused(false)
    const answer = await api.createRevision(opportunityId, requestId())
    setPressing(false)
    if (!answer.ok || answer.body?.job === undefined) return setRefused(true)
    setJob(answer.body.job)
  }, [api, opportunityId, pressing])
  return { job, pressing, refused, press }
}

/** The Site brief block's chip: Working while the job runs, Failed when it stopped. */
export function briefChip(view: BriefControlView): 'working' | 'failed' | null {
  if (view.mode === 'running') return 'working'
  if (view.mode === 'failed') return 'failed'
  return null
}

export function BriefControl({
  t,
  view,
  control
}: {
  t: Translate
  view: BriefControlView
  control: BriefJobControl
}): JSX.Element | null {
  const refused = control.refused ? (
    <p className="tracy-wo-error" role="alert">
      {t('brief.failed')}
    </p>
  ) : null
  if (view.mode === 'none') return refused
  if (view.mode === 'note')
    return view.noteKey !== null ? <p className="tracy-wo-muted tracy-wo-small">{t(view.noteKey)}</p> : null
  if (view.mode === 'locked')
    return <p className="tracy-wo-muted tracy-wo-small">{t(view.reasonKey ?? 'brief.locked')}</p>
  if (view.mode === 'running' || view.mode === 'failed') {
    const doneCount = view.steps.filter((s) => s.state === 'done').length
    return (
      <div className="tracy-wo-stack" role={view.mode === 'running' ? 'status' : undefined}>
        {view.mode === 'running' ? (
          <p>{t('brief.job.title')}</p>
        ) : (
          <p role="alert">{t(view.errorKey ?? 'brief.job.error.other')}</p>
        )}
        {view.steps.length > 0 ? (
          <ol className="tracy-wo-brief-steps">
            {view.steps.map((s) => (
              <li key={s.step} data-state={s.state}>
                {s.state === 'done' ? (
                  <CircleCheck className="tracy-wo-icon is-done" aria-hidden="true" />
                ) : s.state === 'running' ? (
                  <Spinner label={t(s.labelKey)} />
                ) : s.state === 'failed' ? (
                  <CircleAlert className="tracy-wo-icon is-failed" aria-hidden="true" />
                ) : (
                  <Circle className="tracy-wo-icon is-waiting" aria-hidden="true" />
                )}
                <b>{t(s.labelKey)}</b>
                <span>
                  {t(
                    `brief.job.state.${s.state === 'waiting' && view.mode === 'failed' ? 'notStarted' : s.state}`
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {view.mode === 'running' ? (
          <span
            className="tracy-wo-progress-bar"
            role="progressbar"
            aria-label={t('brief.job.title')}
            aria-valuemin={0}
            aria-valuemax={view.steps.length}
            aria-valuenow={doneCount}
          >
            <span style={{ width: `${((doneCount + 0.5) / Math.max(1, view.steps.length)) * 100}%` }} />
          </span>
        ) : null}
      </div>
    )
  }
  // make: the stepper carries the press; a brief that is out of date keeps Refresh here, beside its line.
  return (
    <div className="tracy-wo-stack">
      {view.noteKey !== null ? <p className="tracy-wo-muted tracy-wo-small">{t(view.noteKey)}</p> : null}
      {view.labelKey === 'brief.refresh' ? (
        <div className="tracy-wo-row tracy-wo-wrap">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={control.pressing}
            onClick={() => void control.press()}
          >
            {control.pressing ? <Spinner label={t('brief.refresh')} /> : null}
            {t('brief.refresh')}
          </Button>
        </div>
      ) : null}
      {refused}
    </div>
  )
}
