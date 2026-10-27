/**
 * One extraction as it runs: a line per harvester step, in the order they happened, then the result
 * or the reason it failed — OpenDesign's app and Lovable both show the pipeline this way, and a
 * customer who sees "Anti-bot wall" understands a thin result where a spinner would not explain it.
 */
import type { JSX } from 'react'
import { Check, CircleAlert, Loader2 } from 'lucide-react'

import type { Job } from './api'
import { failureText } from './failure'
import type { Translate } from './strings'

export function JobProgress({ job, t }: { job: Job; t: Translate }): JSX.Element {
  const label = (step: string): string => {
    const key = `step.${step}`
    const s = t(key)
    return s === key ? step : s
  }
  return (
    <div
      className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs"
      data-job={job.host}
      data-state={job.state}
    >
      <div className="flex items-center gap-2 font-medium">
        {job.state === 'running' ? (
          <Loader2 size={14} className="animate-spin text-primary" />
        ) : job.state === 'failed' ? (
          <CircleAlert size={14} className="text-destructive" />
        ) : (
          <Check size={14} className="text-success" />
        )}
        {job.state === 'failed' ? t('job.failed', { host: job.host }) : t('job.running', { host: job.host })}
      </div>
      <ol className="m-0 mt-1.5 list-none pl-5 text-muted-foreground">
        {job.steps.map((s, i) => (
          <li key={`${s.step}-${String(i)}`} className="leading-5">
            {label(s.step)}
            {s.detail && s.step !== 'fetch' && s.step !== 'extra-page' && s.step !== 'done' ? (
              <span className="opacity-70"> · {s.detail}</span>
            ) : null}
          </li>
        ))}
      </ol>
      {job.state === 'failed' && job.error ? (
        <p className="m-0 mt-1.5 text-destructive" data-code={job.error.code}>
          {failureText(job.error.code, t)}
        </p>
      ) : null}
    </div>
  )
}
