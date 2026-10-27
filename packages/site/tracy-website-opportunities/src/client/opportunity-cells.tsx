/**
 * The My opportunities cells: Status badge, Research summary and the one next-action button. The
 * table's columns, the cards and the Inspector draw these same pieces.
 */
import type { JSX } from 'react'
import { CheckIcon, ExternalLink, Hammer, Play, Search } from 'lucide-react'
import { Badge, Button, Spinner } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'

import {
  ACTION_VIEW,
  type NextAction,
  type OpportunityListRow,
  nextAction,
  relativeTime,
  researchSummary,
  statusView
} from './opportunity-row.ts'
import type { Translate } from './strings.ts'

const BADGE_VARIANT = {
  outline: 'outline',
  secondary: 'secondary',
  destructive: 'destructive',
  ok: 'outline',
  live: 'secondary'
} as const

export function StatusCell({ t, row }: { t: Translate; row: OpportunityListRow }): JSX.Element {
  const view = statusView(row)
  return (
    <Badge
      variant={BADGE_VARIANT[view.variant]}
      className={cn(
        view.variant === 'ok' && 'tracy-wo-badge-ok',
        view.variant === 'live' && 'tracy-wo-badge-live'
      )}
    >
      {view.check ? <CheckIcon aria-hidden="true" /> : null}
      {t(view.key)}
    </Badge>
  )
}

/** Five segments: done, the one running, the rest. */
export function StepsBar({ t, step, steps }: { t: Translate; step: number; steps: number }): JSX.Element {
  return (
    <span className="tracy-wo-steps" role="img" aria-label={t('research.step', { step, steps })}>
      {Array.from({ length: steps }, (_, i) => (
        <span key={i} data-state={i + 1 < step ? 'done' : i + 1 === step ? 'now' : undefined} />
      ))}
    </span>
  )
}

function sourcesText(
  t: Translate,
  locale: string,
  sources: { done: number; notFound?: number; total: number } | null
): string | null {
  if (sources === null) return null
  const form = new Intl.PluralRules(locale).select(sources.total) === 'one' ? 'one' : 'other'
  const done = t(`research.sources.${form}`, { done: sources.done, total: sources.total })
  return sources.notFound ? `${done} · ${t('research.sources.notFound', { count: sources.notFound })}` : done
}

/** The Research column: the latest run's step, why it stopped, how many sources, and when. */
export function ResearchCell({
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
  const summary = researchSummary(row)
  const ago = (at: string | null) => relativeTime(at, now, locale)
  const sources = 'sources' in summary ? sourcesText(t, locale, summary.sources) : null
  const muted = (text: string | null) =>
    text ? <span className="tracy-wo-muted tracy-wo-small">{text}</span> : null
  const when = (key: string, at: string | null) => {
    const value = ago(at)
    return value === null ? null : t(key, { ago: value })
  }
  let body: JSX.Element
  switch (summary.kind) {
    case 'running':
      body = (
        <>
          <span className="tracy-wo-row">
            <Spinner label={t(summary.stageKey)} />
            <span className="tracy-wo-small">{t(summary.stageKey)}</span>
          </span>
          <StepsBar t={t} step={summary.step} steps={summary.steps} />
          {muted(
            [t('research.step', { step: summary.step, steps: summary.steps }), sources]
              .filter(Boolean)
              .join(' · ')
          )}
        </>
      )
      break
    case 'queued':
      body = (
        <>
          <span className="tracy-wo-small">{t('research.waiting')}</span>
          {muted(when('research.added', summary.at))}
        </>
      )
      break
    case 'stopped':
      body = (
        <>
          <span className={cn('tracy-wo-reason', summary.soft && 'is-soft')}>{t(summary.reasonKey)}</span>
          {muted(sources)}
        </>
      )
      break
    case 'done':
    case 'cancelled':
      body = (
        <>
          {sources ? <span className="tracy-wo-small">{sources}</span> : null}
          {muted(when(summary.kind === 'done' ? 'research.done' : 'research.stopped', summary.at))}
        </>
      )
      break
    default:
      body = (
        <>
          {muted([t('research.notStarted'), when('research.added', summary.at)].filter(Boolean).join(' · '))}
        </>
      )
  }
  return <div className="tracy-wo-research">{body}</div>
}

const ACTION_ICON: Readonly<Record<NextAction, typeof Play | null>> = {
  cancel: null,
  resume: Play,
  start: Search,
  build: Hammer,
  'open-site': ExternalLink,
  'open-demo-chat': ExternalLink,
  'retry-demo': Play,
  'send-demo': ExternalLink
}

/** The row's one next step; the consumer runs it (`onAction`). */
export function ActionButton({
  t,
  row,
  size = 'xs',
  busy = false,
  disabled = false,
  onAction
}: {
  t: Translate
  row: OpportunityListRow
  size?: 'xs' | 'sm'
  busy?: boolean
  disabled?: boolean
  onAction: (action: NextAction, row: OpportunityListRow) => void
}): JSX.Element {
  const action = nextAction(row)
  const view = ACTION_VIEW[action]
  const Icon = ACTION_ICON[action]
  return (
    <Button
      type="button"
      size={size}
      variant={view.variant}
      disabled={busy || disabled || (row.demoAction?.state === 'queued' && action !== 'open-demo-chat')}
      onClick={() => onAction(action, row)}
    >
      {busy ? <Spinner label={t(view.labelKey)} /> : Icon ? <Icon aria-hidden="true" /> : null}
      {t(row.demoAction?.state === 'queued' && action !== 'open-demo-chat' ? 'v3.building' : view.labelKey)}
    </Button>
  )
}
