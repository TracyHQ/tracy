/**
 * The Content brief of the Details page (#524). `useBriefJob` owns the brief job: the press (from the stepper, or
 * Refresh of an out-of-date brief), and the poll while it runs, like Research. `BriefControl` draws the Site brief
 * block's status under the brief line: locked until research is done; a job that runs or stopped shows in the
 * Progress band only (#537). The one Make content brief / Try again button
 * lives in the stepper (mock r6-a), never here; only Refresh of an out-of-date brief stays as a secondary press.
 */
import { type JSX, useCallback, useEffect, useState } from 'react'
import { Button } from '@tracy/ui'

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
  /** The code of that refusal (`PROFILE_NOT_APPROVED`, `BRIEF_STALE`, ...), or null (#537). */
  refusedCode: string | null
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
  const [refusedCode, setRefusedCode] = useState<string | null>(null)
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
    setRefusedCode(null)
    const answer = await api.createRevision(opportunityId, requestId())
    setPressing(false)
    if (!answer.ok || answer.body?.job === undefined) {
      setRefusedCode(answer.ok ? null : answer.code)
      return setRefused(true)
    }
    setJob(answer.body.job)
  }, [api, opportunityId, pressing])
  return { job, pressing, refused, refusedCode, press }
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
  // A job that runs or stopped shows in the Progress band only (#537): the card draws nothing of it.
  if (view.mode === 'running' || view.mode === 'failed') return refused
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
            {t('brief.refresh')}
          </Button>
        </div>
      ) : null}
      {refused}
    </div>
  )
}
