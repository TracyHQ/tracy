/** The approved step checklist: observed activity, a readable status row, and scoped recovery. */
import { Alert, AlertDescription, Button } from '@tracy/ui'
import { ArrowUpRight, Check, CircleX, Info, Loader2, TriangleAlert } from 'lucide-react'
import { type JSX, type ReactNode, useEffect, useState } from 'react'

import type { CreateRefused, JobState } from './create'
import { copyCreateDetails } from './create-copy-details'
import {
  REDIRECT_WAIT_MS,
  canRetryCreateDesign,
  createDesignGuidance,
  createRefusalActions,
  createRefusalGuidance,
  createStatusTreatment
} from './create-step-model.mjs'
import { stepsFrom } from './steps.mjs'
import type { Translate } from './strings'
import { DISCORD_SUPPORT_URL } from './vendor-links'

export interface CreateMilestone {
  key: string
  label: string
  at: 'done' | 'running' | 'failed'
  designState?: 'done' | 'running' | 'failed'
}

export interface CreateStepView {
  title: string
  domain: string
  rows: CreateMilestone[]
  statusKey: string
  inProgress: boolean
  severity?: 'error' | 'warning' | 'info'
  guidance?: string[]
  technical?: string
  actions?: ReactNode
}

/** Guidance uses the same alert as Customize; actions stay outside the notice. */
function CreateFeedback({
  t,
  statusKey,
  inProgress,
  severity,
  guidance = []
}: Pick<CreateStepView, 'statusKey' | 'inProgress' | 'severity' | 'guidance'> & {
  t: Translate
}): JSX.Element {
  const treatment = createStatusTreatment(statusKey, inProgress)
  const Icon = severity === 'error' ? CircleX : severity === 'warning' ? TriangleAlert : Info
  const status = (
    <p className="tas-create-status" role={severity ? undefined : 'status'} data-severity={severity}>
      {treatment.live ? <span className="tas-create-live" aria-hidden="true" /> : null}
      <span className="tas-create-status-copy">
        {treatment.headline ? <strong>{t(treatment.headline)}</strong> : null}
        <span className="tas-create-explanation">{t(statusKey)}</span>
      </span>
    </p>
  )
  const instructions =
    guidance.length > 1 ? (
      <ol className="tas-create-guidance">
        {guidance.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ol>
    ) : guidance.length ? (
      <p className="tas-create-guidance">{guidance[0]}</p>
    ) : null
  return severity ? (
    <Alert
      variant={severity === 'error' ? 'destructive' : 'default'}
      role={severity === 'error' ? 'alert' : 'status'}
      className={`tas-questions-alert tas-create-notice${severity === 'warning' ? ' tas-questions-warning' : ''}`}
      data-severity={severity}
    >
      <Icon aria-hidden="true" />
      <AlertDescription>
        {status}
        {instructions}
      </AlertDescription>
    </Alert>
  ) : (
    <>
      {status}
      {instructions}
    </>
  )
}

/** One row of normal wizard buttons, followed by optional support diagnostics. */
export function CreateResolution({
  t,
  technical,
  actions,
  support = false
}: {
  t: Translate
  technical?: string
  actions?: ReactNode
  support?: boolean
}): JSX.Element {
  return (
    <>
      {actions || support ? (
        <div className="tas-create-actions">
          {actions}
          {support ? (
            <Button
              size="lg"
              variant="outline"
              className="tas-create-support bg-transparent dark:bg-transparent"
              render={<a href={DISCORD_SUPPORT_URL} target="_blank" rel="noopener noreferrer" />}
            >
              {t('create_support')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {technical ? (
        <details className="tas-create-technical">
          <summary>{t('create_technical')}</summary>
          <pre data-diagnosis="1">{technical}</pre>
          <Button size="lg" type="button" variant="outline" onClick={() => void copyCreateDetails(technical)}>
            {t('create_copy_details')}
          </Button>
        </details>
      ) : null}
    </>
  )
}

export function CreateChecklist({ t, view }: { t: Translate; view: CreateStepView }): JSX.Element {
  return (
    <div className="tas-create-step" data-create-step="1">
      <div className="tas-wizard-head">
        <h2 className="tas-wizard-title">{view.title}</h2>
        <p className="tas-wizard-desc">{view.domain}</p>
      </div>
      {view.rows.length ? (
        <ol className="tas-create-checklist">
          {view.rows.map((row) => (
            <li
              key={row.key}
              data-done={row.at === 'done' ? '1' : '0'}
              data-milestone={row.at}
              data-design-system-apply={row.designState}
            >
              <span className="tas-create-marker" aria-hidden="true">
                {row.at === 'done' ? (
                  <Check />
                ) : row.at === 'failed' ? (
                  <CircleX />
                ) : (
                  <Loader2 className="animate-spin" />
                )}
              </span>
              <span>{row.label}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <CreateFeedback t={t} {...view} />
      <CreateResolution
        t={t}
        technical={view.technical}
        actions={view.actions}
        support={!!view.guidance?.length}
      />
    </div>
  )
}

export function CreateRefusalProblem({
  refused,
  t,
  onBack,
  onMySites
}: {
  refused: CreateRefused
  t: Translate
  onBack?: (action: string) => void
  onMySites?: () => void
}): JSX.Element {
  const originalKey = createRefusalGuidance(refused)
  const [redirectFailed, setRedirectFailed] = useState(false)
  useEffect(() => {
    setRedirectFailed(false)
    if (!['elsewhere', 'capacity'].includes(originalKey)) return
    const timer = setTimeout(() => setRedirectFailed(true), REDIRECT_WAIT_MS)
    return () => clearTimeout(timer)
  }, [originalKey, refused.url])
  const key = redirectFailed ? 'redirect_failed' : originalKey
  const informative = ['pending', 'updating', 'elsewhere', 'capacity', 'redirect_failed'].includes(key)
  return (
    <div data-create-refusal={key} className="tas-create-problem">
      <CreateFeedback
        t={t}
        statusKey={`create_status_${key}`}
        inProgress={false}
        severity={informative ? 'info' : 'error'}
        guidance={!['elsewhere', 'capacity'].includes(key) ? [t(`create_fix_${key}`)] : undefined}
      />
      {!['elsewhere', 'capacity'].includes(key) ? (
        <CreateResolution
          t={t}
          support
          technical={refused.code}
          actions={createRefusalActions(key).map((action, index) =>
            action === 'sign_in_new_tab' ? (
              <Button
                size="lg"
                key={action}
                render={<a href="/login" target="_blank" rel="noopener noreferrer" />}
                aria-label={t('sign_in_new_tab_aria')}
                data-tracy-sign-in=""
              >
                {t(action)}
              </Button>
            ) : action === 'create_reload_page' ? (
              <Button size="lg" key={action} type="button" onClick={() => window.location.reload()}>
                {t(action)}
              </Button>
            ) : action === 'create_my_sites' ? (
              onMySites ? (
                <Button
                  size="lg"
                  key={action}
                  type="button"
                  variant={index === 0 ? 'default' : 'outline'}
                  onClick={onMySites}
                >
                  {t(action)}
                </Button>
              ) : null
            ) : onBack ? (
              <Button
                size="lg"
                key={action}
                type="button"
                variant={index === 0 ? 'default' : 'outline'}
                onClick={() => onBack(action)}
              >
                {t(action)}
              </Button>
            ) : null
          )}
        />
      ) : null}
    </div>
  )
}

/** No transition lives here. Callbacks retain the wizard's existing creation and retry behavior. */
export function CreateStep({
  t,
  phase,
  siteKey,
  platform,
  job,
  seen,
  unreachable,
  signedOut,
  slow,
  posting,
  agent,
  pickLine,
  onBack,
  onStartAgent,
  onWorkspace,
  onOpenSite,
  onDesignRetry,
  onMySites
}: {
  t: Translate
  phase: 'building' | 'starting' | 'ready'
  siteKey: string
  platform: string
  job: JobState | null
  seen: string
  unreachable?: boolean
  signedOut?: boolean
  slow?: boolean
  posting?: boolean
  agent?: 'up' | 'failed'
  pickLine?: { at: 'running' | 'done' | 'failed'; name: string } | null
  onBack: () => void
  onStartAgent: () => void
  onWorkspace: () => void
  onOpenSite: () => void
  onDesignRetry: () => void
  onMySites?: () => void
}): JSX.Element {
  const failed = phase === 'building' && job?.state === 'failed'
  const complete = phase !== 'building'
  const rows: CreateMilestone[] = stepsFrom(seen, platform).map((step) => ({
    key: step.key,
    label: t(
      [
        'step_cowork',
        'step_cowork_joomla',
        'step_cowork_wordpress',
        'step_agent',
        'step_webroot',
        'step_platform',
        'step_baseline',
        'step_writing',
        'step_address'
      ].includes(step.stringKey)
        ? `create_${step.stringKey}`
        : step.stringKey
    ),
    at: complete || step.done ? 'done' : failed ? 'failed' : 'running'
  }))
  if (pickLine)
    rows.push({
      key: 'design-system',
      designState: pickLine.at,
      label: t('create_design_step', { name: pickLine.name }),
      at: pickLine.at === 'done' ? 'done' : pickLine.at === 'failed' ? 'failed' : 'running'
    })
  if (complete)
    rows.push({
      key: 'workspace-start',
      label: t(agent === 'failed' ? 'create_workspace_unconfirmed' : 'create_workspace_step'),
      at: phase === 'starting' ? 'running' : agent === 'up' ? 'done' : 'failed'
    })
  const issues: string[] = []
  if (failed) issues.push('failed')
  else if (signedOut) issues.push('poll_signed_out')
  else if (unreachable) issues.push('unreachable')
  if (phase === 'ready') {
    if (agent === 'failed') issues.push('workspace')
    if (pickLine?.at === 'failed') issues.push(createDesignGuidance(job?.designSystem?.reason))
    if (job?.brief === 'failed') issues.push('content')
    if (!job?.liveUrl || job.addressError) issues.push('address')
  }
  const primaryIssue = issues[0]
  const status = primaryIssue
    ? `create_status_${primaryIssue}`
    : phase === 'starting'
      ? posting
        ? 'create_status_starting_post'
        : 'create_status_starting'
      : pickLine?.at === 'running'
        ? job?.designSystem?.state === 'queued'
          ? 'create_status_design_queued'
          : 'create_status_design_running'
        : phase === 'ready'
          ? 'create_status_ready'
          : !job
            ? 'create_status_accepted'
            : job.state === 'unknown'
              ? 'create_status_unknown'
              : slow
                ? 'create_status_slow'
                : job.state === 'queued'
                  ? 'create_status_queued'
                  : 'create_status_running'
  const technical = [job?.detail?.trim(), job?.output?.trim(), seen.trim(), job?.designSystem?.reason]
    .filter(Boolean)
    .join('\n')
  const actions = (
    <>
      {signedOut ? (
        <Button
          size="lg"
          render={<a href="/login" target="_blank" rel="noopener noreferrer" />}
          aria-label={t('sign_in_new_tab_aria')}
          data-tracy-sign-in=""
        >
          {t('sign_in_new_tab')}
        </Button>
      ) : null}
      {(failed || unreachable || signedOut || issues.includes('design_gone') || slow) && onMySites ? (
        <Button
          size="lg"
          type="button"
          variant={signedOut || slow ? 'outline' : 'default'}
          onClick={onMySites}
        >
          {t('create_my_sites')}
        </Button>
      ) : null}
      {failed ? (
        <Button size="lg" type="button" variant="outline" onClick={onBack}>
          {t('create_review_details')}
        </Button>
      ) : null}
      {phase === 'ready' && !issues.includes('design_gone') ? (
        <>
          {agent === 'up' ? (
            <Button size="lg" type="button" onClick={onWorkspace}>
              {t('create_start_editing')}
            </Button>
          ) : (
            <Button size="lg" type="button" onClick={onStartAgent}>
              {t('create_start_workspace')}
            </Button>
          )}
          {pickLine?.at === 'failed' &&
          job?.designSystem &&
          canRetryCreateDesign(createDesignGuidance(job.designSystem.reason)) ? (
            <Button size="lg" type="button" variant="outline" onClick={onDesignRetry}>
              {t('create_retry_design')}
            </Button>
          ) : null}
          {job?.liveUrl ? (
            <Button
              size="lg"
              type="button"
              variant="outline"
              onClick={onOpenSite}
              aria-label={t('create_open_site_aria')}
            >
              {t('create_open_site')}
              <ArrowUpRight aria-hidden="true" />
            </Button>
          ) : null}
        </>
      ) : null}
    </>
  )
  return (
    <CreateChecklist
      t={t}
      view={{
        title: t(
          failed
            ? 'create_title_failed'
            : primaryIssue === 'design_gone'
              ? 'create_title_attention'
              : phase === 'ready'
                ? agent === 'failed'
                  ? 'create_title_created'
                  : 'create_title_ready'
                : phase === 'starting'
                  ? 'create_title_starting'
                  : signedOut
                    ? 'create_title_unconfirmed'
                    : unreachable || job?.state === 'unknown'
                      ? 'create_title_checking'
                      : 'create_title_running'
        ),
        domain: job?.liveUrl ?? siteKey,
        rows,
        statusKey: status,
        inProgress: phase !== 'ready' && !failed && !signedOut,
        severity: primaryIssue
          ? failed || signedOut
            ? 'error'
            : unreachable
              ? 'info'
              : 'warning'
          : undefined,
        guidance: issues.map((key) => t(`create_fix_${key}`)),
        technical: primaryIssue ? JSON.stringify({ siteKey, detail: technical }, null, 2) : undefined,
        actions: failed || phase === 'ready' || unreachable || signedOut || slow ? actions : undefined
      }}
    />
  )
}
