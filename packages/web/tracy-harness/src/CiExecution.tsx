import { Badge } from '@tracy/ui'
import { useT } from './i18n'
import {
  buildLabel,
  checkLabel,
  durationLabel,
  exactTime,
  executionSummary,
  githubLink,
  jobDuration,
  runnerLabel,
  type CiRow
} from './ci-api'

export function CiExecutionPanel({ row, now }: { row: CiRow; now: number }) {
  const t = useT()
  const execution = row.execution
  const summary = executionSummary(row, now, t)
  const jobs = [...(execution?.jobs ?? [])].sort((a, b) => {
    const order = (status: string) => (status === 'IN_PROGRESS' ? 0 : status === 'COMPLETED' ? 2 : 1)
    return order(a.status) - order(b.status)
  })
  return (
    <section
      aria-label={t('ci.execution.label')}
      className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3"
    >
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold">{t('ci.execution.title')}</h3>
        <Badge variant="secondary">{buildLabel(row.build, t)}</Badge>
      </div>
      <p>
        {summary.step} · {durationLabel(summary.duration, t)}
      </p>
      {execution?.error && (
        <p role="status" className="text-muted-foreground">
          {execution.error}
        </p>
      )}
      {execution?.runnerError && <p className="text-muted-foreground">{execution.runnerError}</p>}
      {!jobs.length && (
        <p className="text-muted-foreground">
          {row.build === 'Not started' ? t('ci.execution.noJob') : t('ci.execution.noJobDetails')}
        </p>
      )}
      <div className="space-y-2">
        {jobs.map((job) => (
          <details
            key={job.id}
            open={job.status === 'IN_PROGRESS'}
            className="rounded border border-border bg-background/70 p-2"
          >
            <summary className="cursor-pointer break-words">
              <span className="font-medium">{job.name}</span> · {checkLabel(job, t)}
            </summary>
            <div className="mt-2 space-y-2">
              <p className="break-words">
                {t('ci.execution.runner', {
                  runner: job.runner
                    ? `${job.runner.name} · ${runnerLabel(job.runner, t)}`
                    : job.runnerAssignment === 'unknown'
                      ? t('ci.execution.assignmentUnknown')
                      : t('ci.runner.notAssigned')
                })}
              </p>
              <p>{t('ci.execution.jobDuration', { duration: durationLabel(jobDuration(job, now), t) })}</p>
              {job.status !== 'COMPLETED' && !job.runner && job.runnerAssignment !== 'unknown' && (
                <p className="text-muted-foreground">{t('ci.execution.waitingWhy')}</p>
              )}
              {job.labels.length > 0 && (
                <details className="text-muted-foreground">
                  <summary className="cursor-pointer">{t('ci.execution.requirements')}</summary>
                  <p className="mt-1 break-words">{job.labels.join(', ')}</p>
                </details>
              )}
              <ol className="space-y-1 border-l border-border pl-3">
                {job.steps.map((step) => (
                  <li key={step.number} className="break-words">
                    {step.number}. {step.name} · {checkLabel(step, t)}
                  </li>
                ))}
              </ol>
              {!job.steps.length && <p className="text-muted-foreground">{t('ci.execution.noSteps')}</p>}
              {githubLink(job.url) && (
                <a
                  href={githubLink(job.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-primary hover:underline"
                >
                  {t('ci.execution.viewLog')}
                </a>
              )}
              <p className="text-muted-foreground">
                {t('ci.execution.jobObserved', { time: exactTime(job.measuredAt, t) })}
              </p>
            </div>
          </details>
        ))}
      </div>
      {execution?.runnersMeasuredAt && (
        <p className="text-muted-foreground">
          {t('ci.execution.runnersObserved', { time: exactTime(execution.runnersMeasuredAt, t) })}
        </p>
      )}
      <p className="text-muted-foreground">{t('ci.execution.explain')}</p>
    </section>
  )
}
