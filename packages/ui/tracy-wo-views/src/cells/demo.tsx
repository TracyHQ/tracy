import { Spinner } from '@tracy/ui'
import { ExternalLink, Snowflake } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'

import { type DemoFacts, demoView } from '../demo.ts'
import type { Translate } from '../types.ts'

export interface DemoCellActions {
  onExtend?: () => void
  onReopen?: () => void
  onRebuild?: () => void
  onRetry?: () => void
  /** A press of this row is on its way: every button waits. */
  busy?: boolean
}

const plural = (locale: string, n: number) =>
  new Intl.PluralRules(locale).select(n) === 'one' ? 'one' : 'other'
const exactTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

function Act({ label, onPress, busy }: { label: string; onPress?: () => void; busy?: boolean }) {
  if (!onPress) return null
  return (
    <button
      type="button"
      className="tracy-wo-demo-act"
      disabled={busy}
      onClick={(e: MouseEvent) => {
        // The row opens on a click; a press here is only the press.
        e.stopPropagation()
        onPress()
      }}
    >
      {label}
    </button>
  )
}

/**
 * The Demo column (tasks/todo-wo-demo-retention.md, "Demo column"): line 1 the site, opened in a new tab,
 * its exact expiry on hover; line 2 the countdown or the state, with the one press it offers.
 */
export function DemoCell({
  t,
  locale,
  demo,
  now,
  actions = {},
  showSite = true
}: {
  t: Translate
  locale: string
  demo: DemoFacts | null | undefined
  now: number
  actions?: DemoCellActions
  /** False where the site's link is drawn already (the Inspector's Demo site section). */
  showSite?: boolean
}) {
  const view = demoView(demo, now)
  if (view.kind === 'none') return <span className="tracy-wo-muted">—</span>
  const site =
    showSite && demo?.siteKey && view.kind !== 'deleted' ? (
      demo.url ? (
        <a
          className="tracy-wo-line tracy-wo-link"
          href={demo.url}
          target="_blank"
          rel="noreferrer"
          title={
            demo.expiresAt ? t('cell.demo.expiresAt', { date: exactTime(demo.expiresAt, locale) }) : undefined
          }
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink aria-hidden className="tracy-wo-glyph-sm" />
          <span className="tracy-wo-demo-key">{demo.siteKey}</span>
        </a>
      ) : (
        <span className="tracy-wo-line tracy-wo-demo-key">{demo.siteKey}</span>
      )
    ) : null
  let line: ReactNode
  switch (view.kind) {
    case 'building':
      line = (
        <span className="tracy-wo-line tracy-wo-muted">
          <Spinner label={t('cell.demo.building', { count: view.minutes })} className="size-3" />
          <span aria-hidden>{t('cell.demo.building', { count: view.minutes })}</span>
        </span>
      )
      break
    case 'failed':
      line = (
        <span className="tracy-wo-line tracy-wo-demo-urgent">
          {t('cell.demo.failed')}
          <Act label={t('cell.demo.retry')} onPress={actions.onRetry} busy={actions.busy} />
        </span>
      )
      break
    case 'kept':
      line = null
      break
    case 'frozen':
      line = (
        <span className="tracy-wo-line tracy-wo-muted">
          <Snowflake aria-hidden className="tracy-wo-glyph-sm" />
          {t('cell.demo.frozen')}
          {view.deletesInDays === null
            ? null
            : ` · ${t(`cell.demo.deletesIn.${plural(locale, view.deletesInDays)}`, { count: view.deletesInDays })}`}
          <Act label={t('cell.demo.reopen')} onPress={actions.onReopen} busy={actions.busy} />
        </span>
      )
      break
    case 'deleted':
      line = (
        <span className="tracy-wo-line tracy-wo-muted">
          {t('cell.demo.deleted', {
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(view.at))
          })}
          <Act label={t('cell.demo.rebuild')} onPress={actions.onRebuild} busy={actions.busy} />
        </span>
      )
      break
    case 'live':
      line = (
        <span className={`tracy-wo-line tracy-wo-small tracy-wo-demo-${view.level}`}>
          {t(`cell.demo.left.${view.unit}.${plural(locale, view.left)}`, { count: view.left })}
          {view.qaPassed && view.level === 'calm' ? ` · ${t('cell.demo.qaPassed')}` : null}
          {view.extend ? (
            <Act label={t('cell.demo.extend')} onPress={actions.onExtend} busy={actions.busy} />
          ) : null}
        </span>
      )
      break
  }
  return (
    <div className="tracy-wo-cell">
      {site}
      {line}
    </div>
  )
}
