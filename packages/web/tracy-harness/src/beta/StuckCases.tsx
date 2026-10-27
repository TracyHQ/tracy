import { Button, Card } from '@tracy/ui'
import { ArrowUpRight, Check, RotateCcw } from 'lucide-react'
import { useT } from '../i18n'
import { ViewAsUserButton } from '../ViewAsUserButton'
import type { StuckSite } from './api'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, SignalTable } from './SignalTable'
import { counted, relativeText } from './strings'
import { stuckCms, stuckDuration, stuckExact, stuckOperation, stuckReason, stuckStep } from './stuck-data'

export function StuckTime({ at }: { at: string | null }) {
  const t = useT()
  return at ? (
    <time dateTime={at} title={`${stuckExact(at)} · UTC+7`}>
      {relativeText(t, at)}
    </time>
  ) : (
    <span className="text-muted-foreground">{t('beta.common.notRecorded')}</span>
  )
}
export function StuckCases({
  rows,
  tab,
  writable,
  pressing,
  onPress,
  loading,
  error,
  asOf
}: {
  rows: StuckSite[]
  tab: string
  writable: boolean
  pressing: string | null
  onPress: (row: StuckSite, reopen: boolean) => void
  loading: boolean
  error: string | null
  asOf: string
}) {
  const t = useT()
  const columns: SignalColumn<StuckSite>[] = [
    {
      key: 'customer',
      label: t('beta.stuck.col.customer'),
      help: t('beta.stuck.col.customerHelp'),
      value: (row) => row.email || row.siteKey,
      render: (row) => (
        <SignalHoverCard
          label={t('beta.stuck.detailsFor', { site: row.siteKey })}
          summary={
            <span className="stuck-identity">
              <span className="signals-primary">
                {row.email || t('beta.stuck.accountNotRecorded')}
                <ViewAsUserButton email={row.email} />
              </span>
              <small>{row.siteKey}</small>
            </span>
          }
        >
          <dl className="stuck-facts">
            <dt>{t('beta.stuck.fact.site')}</dt>
            <dd>{row.siteKey}</dd>
            <dt>{t('beta.stuck.fact.platform')}</dt>
            <dd>{stuckCms(t, row.platform)}</dd>
            <dt>{t('beta.stuck.fact.setup')}</dt>
            <dd>{stuckOperation(t, row)}</dd>
            <dt>{t('beta.stuck.fact.source')}</dt>
            <dd>{row.source?.medium || row.source?.source || t('beta.common.notRecorded')}</dd>
            <dt>{t('beta.stuck.fact.subscription')}</dt>
            <dd>
              {row.plans
                .map((plan) => {
                  const name = plan.name || plan.id || t('beta.stuck.fact.unnamedPlan')
                  return plan.until ? t('beta.stuck.fact.planUntil', { name, date: plan.until }) : name
                })
                .join(', ') || t('beta.common.notRecorded')}
            </dd>
          </dl>
        </SignalHoverCard>
      )
    },
    {
      key: 'since',
      label: t(tab === 'open' ? 'beta.stuck.col.waitingSince' : 'beta.stuck.col.firstFailed'),
      help: t('beta.stuck.col.sinceHelp'),
      value: (row) => Date.parse(asOf) - Date.parse(row.firstAt),
      render: (row) => <StuckTime at={row.firstAt} />
    },
    {
      key: 'step',
      label: t('beta.stuck.col.step'),
      help: t('beta.stuck.col.stepHelp'),
      value: (row) => stuckStep(t, row.step),
      render: (row) => (
        <span title={t('beta.stuck.recordedStep', { step: row.step || t('beta.common.notRecorded') })}>
          <span className="signals-primary">{stuckStep(t, row.step)}</span>
          <small>{stuckOperation(t, row)}</small>
        </span>
      )
    },
    {
      key: 'reason',
      label: t('beta.stuck.col.reason'),
      help: t('beta.stuck.col.reasonHelp'),
      value: (row) => stuckReason(t, row.reason),
      render: (row) => (
        <SignalHoverCard
          label={t('beta.stuck.col.reason')}
          summary={<span className="stuck-reason">{stuckReason(t, row.reason)}</span>}
        >
          <p>{t('beta.stuck.reasonNote')}</p>
          <dl className="stuck-facts">
            <dt>{t('beta.stuck.fact.errorCode')}</dt>
            <dd>
              <code>{row.reason || t('beta.common.notRecorded')}</code>
            </dd>
            <dt>{t('beta.stuck.fact.stepCode')}</dt>
            <dd>
              <code>{row.step || t('beta.common.notRecorded')}</code>
            </dd>
            <dt>{t('beta.stuck.col.lastFailure')}</dt>
            <dd>
              <StuckTime at={row.lastAt} />
            </dd>
          </dl>
        </SignalHoverCard>
      )
    },
    {
      key: 'times',
      label: t('beta.stuck.col.failures'),
      help: t('beta.stuck.col.failuresHelp'),
      numeric: true,
      value: (row) => row.times,
      render: (row) => (
        <SignalHoverCard
          label={t('beta.stuck.failureCount')}
          summary={
            <span className={row.times > 1 ? 'signals-status-pill' : ''} data-tone="warning">
              {row.times}
            </span>
          }
        >
          <p>{t('beta.stuck.failuresInCase', counted(row.times))}</p>
          <p>
            {t('beta.stuck.failuresForSite', { n: counted(row.totalFailures).n })}{' '}
            {t('beta.stuck.casesForSite', { n: counted(row.episodeCount).n })}
          </p>
          <p>{t('beta.stuck.retryNote')}</p>
        </SignalHoverCard>
      )
    },
    {
      key: 'status',
      label: t('beta.stuck.col.status'),
      help: t('beta.stuck.col.statusHelp'),
      value: (row) => (row.open ? 'open' : row.closed?.how || ''),
      render: (row) => (
        <SignalHoverCard
          label={t('beta.stuck.cases.status')}
          summary={
            <span
              className="signals-status-pill"
              data-tone={row.open ? 'negative' : row.closed?.how === 'built' ? 'positive' : 'neutral'}
            >
              {t(
                row.open
                  ? 'beta.stuck.cases.needsHelp'
                  : row.closed?.how === 'built'
                    ? 'beta.stuck.status.workingAgain'
                    : row.closed?.how === 'deleted'
                      ? 'beta.stuck.status.siteDeleted'
                      : 'beta.stuck.status.markedHandled'
              )}
            </span>
          }
        >
          <p>{t(row.open ? 'beta.stuck.status.openNote' : 'beta.stuck.status.closedNote')}</p>
          <p>
            {row.open
              ? t('beta.stuck.cases.helperNotTracked')
              : row.closed?.how === 'handled'
                ? row.closed.by
                  ? t('beta.stuck.status.handledBy', { name: row.closed.by })
                  : t('beta.stuck.status.handledByAdmin')
                : t(
                    row.closed?.how === 'built'
                      ? 'beta.stuck.status.builtNote'
                      : 'beta.stuck.status.deletedNote'
                  )}
          </p>
          {row.closed && (
            <p>
              {t('beta.stuck.status.closedAt')} <StuckTime at={row.closed.at} />
            </p>
          )}
          <p>
            {t('beta.stuck.status.timeFromFirst', {
              duration: stuckDuration(
                t,
                (Date.parse(row.closed?.at || asOf) - Date.parse(row.firstAt)) / 3600000
              )
            })}
          </p>
        </SignalHoverCard>
      )
    },
    {
      key: 'lastAt',
      label: t(tab === 'open' ? 'beta.stuck.col.lastFailure' : 'beta.stuck.col.closed'),
      help: t(tab === 'open' ? 'beta.stuck.col.lastFailureHelp' : 'beta.stuck.col.closedHelp'),
      value: (row) => (tab === 'open' ? row.lastAt : row.closed?.at || null),
      render: (row) => <StuckTime at={tab === 'open' ? row.lastAt : row.closed?.at || null} />
    },
    {
      key: 'actions',
      label: t('beta.stuck.col.actions'),
      value: (row) => row.siteKey,
      render: (row) => (
        <div className="stuck-actions">
          <a
            className="app-statistic-link"
            href={`/${encodeURIComponent(row.siteKey)}/`}
            target="_blank"
            rel="noreferrer"
          >
            {t('beta.stuck.openSite')}
            <ArrowUpRight size={14} />
          </a>
          {(row.open || row.closed?.how === 'handled') && (
            <Button
              variant="ghost"
              size="sm"
              data-stuck-press={row.open ? 'handled' : 'reopen'}
              disabled={!writable || pressing === row.siteKey}
              title={t(
                writable
                  ? row.open
                    ? 'beta.stuck.press.handledHelp'
                    : 'beta.stuck.press.reopenHelp'
                  : 'beta.stuck.press.readOnly'
              )}
              onClick={() => onPress(row, !row.open)}
            >
              {row.open ? <Check size={14} /> : <RotateCcw size={14} />}
              {t(row.open ? 'beta.stuck.press.handled' : 'beta.stuck.press.reopen')}
            </Button>
          )}
        </div>
      )
    }
  ]
  return (
    <Card className="signals-panel">
      <SignalTable
        id={`stuck-${tab}`}
        columns={columns.filter((column) => tab !== 'open' || column.key !== 'lastAt')}
        rows={rows}
        rowKey={(row) => row.siteKey}
        defaultSort={tab === 'open' ? 'since' : 'lastAt'}
        loading={loading}
        error={error}
        search={{
          label: t('beta.stuck.searchCases'),
          match: (row) => [row.email, row.siteKey, row.reason, row.step, stuckReason(t, row.reason)].join(' ')
        }}
      />
    </Card>
  )
}
