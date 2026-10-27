import { Button } from '@tracy/ui'
import type { ReactNode } from 'react'
import { useT } from '../i18n/index.ts'
import { ViewAsUserButton } from '../ViewAsUserButton'
import type { AppStatisticPayload, AppStatisticRow, AppStatisticView } from './app-statistic-api'
import {
  appStatus,
  cmsLabel,
  platformLabel,
  releaseTypeLabel,
  sourceFieldLabel,
  sourceLabel,
  viewLabel
} from './app-statistic-copy'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, type SignalRemoteTable, SignalTable } from './SignalTable'

export type AppStatisticJump = (
  label: string,
  view: AppStatisticView,
  scope?: { id: string; label: string } | null,
  selection?: string | null
) => ReactNode
export function AppStatisticRecords({
  report,
  selected,
  loading,
  error,
  remote,
  onSelect,
  jump,
  timeCell,
  link
}: {
  report: AppStatisticPayload | null
  selected: string | null
  loading: boolean
  error: string | null
  remote: SignalRemoteTable
  onSelect: (id: string) => void
  jump: AppStatisticJump
  timeCell: (time?: string | null) => ReactNode
  link: (url?: string | null, label?: string, title?: string) => ReactNode
}) {
  const t = useT()
  const view = report?.view ?? 'users'
  const userColumn: SignalColumn<AppStatisticRow> = {
    key: 'user',
    label: t('appstat.col.person'),
    help: t('appstat.col.person.help'),
    value: (row) => row.email ?? null,
    render: (row) => (
      <SignalHoverCard
        interactive
        label={view === 'users' ? t('appstat.records.personDetails') : t('appstat.detail.label')}
        summary={
          <span className="app-statistic-person">
            <span className="signals-primary">
              {row.name || row.email || t('appstat.unknown')}
              <ViewAsUserButton email={row.email} />
            </span>
            {row.name && row.email && <small>{row.email}</small>}
          </span>
        }
      >
        <p>{row.email || t('appstat.records.noAccount')}</p>
        {view === 'users' && (
          <>
            <p>{t('appstat.records.copiesConnected', { count: row.installs })}</p>
            <p>
              {t('appstat.records.latestActivity')} {timeCell(row.lastSeen)}
            </p>
            <div className="flex flex-col items-start gap-2 py-2">
              {jump(t('appstat.records.viewConnections'), 'installs', {
                id: row.id,
                label: row.email || row.id
              })}
              {jump(t('appstat.records.viewTemplateRequests'), 'quickstarts', {
                id: row.id,
                label: row.email || row.id
              })}
            </div>
          </>
        )}
        {view === 'installs' && row.linkedAt && (
          <p>
            {t('appstat.records.lastLinked')} {timeCell(row.linkedAt)}
          </p>
        )}
        {view !== 'users' && row.userId && jump(t('appstat.records.viewPerson'), 'users', null, row.userId)}
        <Button
          variant="ghost"
          size="sm"
          className="app-statistic-details-button"
          aria-label={t('appstat.records.detailsOf', { id: row.id })}
          aria-expanded={selected === row.id}
          onClick={() => onSelect(row.id)}
        >
          {selected === row.id ? t('appstat.records.closeActivity') : t('appstat.records.viewActivity')}
        </Button>
      </SignalHoverCard>
    )
  }
  const timeColumn: SignalColumn<AppStatisticRow> = {
    key: 'time',
    label:
      view === 'users' || view === 'installs' ? t('appstat.col.lastConnection') : t('appstat.col.requested'),
    help:
      view === 'installs'
        ? t('appstat.col.lastConnection.installs.help')
        : view === 'users'
          ? t('appstat.col.lastConnection.users.help')
          : t('appstat.col.requested.help'),
    value: (row) => (view === 'users' ? (row.lastAppContact ?? null) : row.lastSeen),
    render: (row) =>
      view === 'users' && !row.lastAppContact ? (
        <span className="text-muted-foreground">{t('appstat.records.noConnection')}</span>
      ) : (
        timeCell(view === 'users' ? row.lastAppContact : row.lastSeen)
      )
  }
  const versionColumn: SignalColumn<AppStatisticRow> = {
    key: 'version',
    label: t('appstat.filter.version'),
    help: t('appstat.col.version.help'),
    value: (row) => row.version || row.versions.join(', '),
    render: (row) => (
      <SignalHoverCard
        label={t('appstat.records.versionDetails')}
        summary={
          <span className="signals-pill">
            {row.version || row.versions[0] || t('appstat.unknown')}
            {row.versions.length > 1 ? ` +${row.versions.length - 1}` : ''}
          </span>
        }
      >
        <p>{row.versions.join(', ') || row.version || t('appstat.records.noVersion')}</p>
      </SignalHoverCard>
    )
  }
  const sourceColumn: SignalColumn<AppStatisticRow> = {
    key: 'source',
    label: t('appstat.col.source'),
    help:
      view === 'downloads' ? t('appstat.col.source.download.help') : t('appstat.col.source.firstSignIn.help'),
    value: (row) => row.source?.source || row.source?.medium || '',
    render: (row) => (
      <SignalHoverCard label={t('appstat.records.marketing')} summary={sourceLabel(row, t)}>
        {row.source ? (
          Object.entries(row.source)
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <p key={key}>
                {sourceFieldLabel(key, t)}: {value}
              </p>
            ))
        ) : (
          <p>{t('appstat.records.noMarketing')}</p>
        )}
      </SignalHoverCard>
    )
  }
  const columns: SignalColumn<AppStatisticRow>[] = []
  if (view === 'users')
    columns.push(
      userColumn,
      {
        key: 'installs',
        label: t('appstat.col.status'),
        help: t('appstat.col.status.help'),
        value: (row) => row.installs,
        render: (row) => (
          <span
            className="signals-status-pill"
            data-tone={row.lastOpened || row.installs ? 'positive' : 'neutral'}
          >
            {appStatus(row, t)}
          </span>
        )
      },
      versionColumn,
      { ...timeColumn, key: 'lastAppContact' },
      {
        key: 'lastOpened',
        label: t('appstat.col.lastOpened'),
        help: t('appstat.col.lastOpened.help'),
        value: (row) => row.lastOpened ?? null,
        render: (row) =>
          row.lastOpened ? (
            timeCell(row.lastOpened)
          ) : (
            <span className="text-muted-foreground">{t('appstat.records.noOpens')}</span>
          )
      },
      {
        key: 'daysUsed',
        label: t('appstat.col.daysUsed'),
        help: t('appstat.col.daysUsed.help'),
        numeric: true,
        value: (row) => row.daysUsed ?? 0,
        render: (row) => row.daysUsed ?? 0
      },
      sourceColumn,
      {
        key: 'quickstarts',
        label: t('appstat.col.quickstarts'),
        help: t('appstat.col.quickstarts.help'),
        numeric: true,
        value: (row) => row.quickstarts ?? 0
      },
      {
        key: 'attention',
        label: t('appstat.col.problems'),
        help: t('appstat.col.problems.help'),
        numeric: true,
        value: (row) => row.attention,
        render: (row) => (
          <span className="signals-status-pill" data-tone={row.attention ? 'negative' : 'neutral'}>
            {row.attention ? t('appstat.records.problemsOpen', { count: row.attention }) : t('appstat.none')}
          </span>
        )
      }
    )
  else if (view === 'quickstarts')
    columns.push(
      timeColumn,
      userColumn,
      {
        key: 'template',
        label: t('appstat.col.template'),
        help: t('appstat.col.template.help'),
        value: (row) => row.template ?? '',
        render: (row) =>
          link(row.templateUrl, row.template || t('appstat.notRecorded')) ||
          row.template ||
          t('appstat.notRecorded')
      },
      {
        key: 'cms',
        label: t('appstat.col.cms'),
        help: t('appstat.col.cms.help'),
        value: (row) => row.cms ?? '',
        render: (row) => <span className="signals-pill">{cmsLabel(row.cms, t)}</span>
      },
      {
        key: 'referrer',
        label: t('appstat.col.referrer'),
        help: t('appstat.col.referrer.help'),
        value: (row) => row.referrer ?? '',
        render: (row) =>
          row.referrer ? (
            <SignalHoverCard label={t('appstat.col.referrer')} summary={t('appstat.records.viewReferrer')}>
              {link(row.referrer)}
            </SignalHoverCard>
          ) : (
            <span title={t('appstat.meaning.referrerUnknown')}>{t('appstat.notRecorded')}</span>
          )
      },
      sourceColumn
    )
  else {
    columns.push(
      ...(view === 'installs'
        ? [userColumn]
        : [
            {
              key: 'id',
              label: t('appstat.col.request'),
              value: (row: AppStatisticRow) => row.id,
              render: (row: AppStatisticRow) => (
                <Button variant="ghost" size="sm" onClick={() => onSelect(row.id)}>
                  {t('appstat.records.viewRequest')}
                </Button>
              )
            }
          ]),
      versionColumn,
      {
        key: 'channel',
        label: t('appstat.filter.channel'),
        help: t('appstat.col.channel.help'),
        value: (row) => row.channel ?? '',
        render: (row) => <span className="signals-pill">{releaseTypeLabel(row.channel, t)}</span>
      },
      {
        key: 'platform',
        label: t('appstat.filter.platform'),
        help: t('appstat.col.platform.help'),
        value: (row) => row.platform ?? '',
        render: (row) => platformLabel(row, t)
      }
    )
    if (view === 'downloads') {
      columns.push(sourceColumn)
    } else
      columns.push({
        key: 'firstSeen',
        label: t('appstat.col.firstConnection'),
        help: t('appstat.col.firstConnection.help'),
        value: (row) => row.firstSeen,
        render: (row) => timeCell(row.firstSeen)
      })
    columns.push(timeColumn)
  }
  return (
    <section className="signals-panel border border-border bg-card" data-app-records>
      <div className="signals-panel-header">
        <h2>{viewLabel(view, t)}</h2>
        <span>{t('appstat.sortHint')}</span>
      </div>
      <p className="signals-panel-sub">
        {view === 'users'
          ? t('appstat.records.users.sub')
          : view === 'downloads'
            ? t('appstat.records.downloads.sub')
            : t('appstat.records.other.sub')}
      </p>
      {(view === 'users' || view === 'installs') && (
        <p className="signals-panel-sub">{t('appstat.meaning.connection')}</p>
      )}
      {(view === 'users' || view === 'downloads') && (
        <p className="signals-panel-sub">{t('appstat.meaning.anonymousDownload')}</p>
      )}
      {view === 'quickstarts' && <p className="signals-panel-sub">{t('appstat.records.quickstarts.sub')}</p>}
      <SignalTable
        id="app-records"
        rows={report?.rows || []}
        columns={columns.filter(
          (column) => report?.activityAvailable || !['lastOpened', 'daysUsed'].includes(column.key)
        )}
        rowKey={(row) => row.id}
        defaultSort={view === 'users' ? 'lastAppContact' : 'time'}
        search={{ label: t('appstat.records.search'), match: () => '' }}
        loading={loading}
        error={error}
        remote={remote}
        needsAttention={(row) => row.attention > 0}
      />
    </section>
  )
}
