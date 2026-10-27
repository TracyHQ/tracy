import { Card, cn } from '@tracy/ui'
import { useState } from 'react'
import { useT } from '../i18n'
import type { Day } from './api'
import { SignalChart, type SignalSeries } from './SignalChart'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsNote } from './StatisticsNote'
import { unaffectedFilterNote } from './signal-filter-scope'
import { formatNumber, type SignalFilters, type SignalReport, shortDay, totalSites } from './signals-data'
import { counted, sourceLabel } from './strings'

// `label` holds a dictionary key, resolved at render.
const DAILY_SERIES: SignalSeries[] = [
  { id: 'users', label: 'beta.signals.newUsers', metric: (row) => row.newUsers },
  { id: 'sites', label: 'beta.signals.newSites', metric: totalSites },
  { id: 'waitlist', label: 'beta.signals.daily.blocked', metric: (row) => row.waitlist },
  { id: 'failures', label: 'beta.signals.daily.failures', metric: (row) => row.stuck }
]
const TAB_KEYS: Record<string, string> = {
  overview: 'beta.signals.daily.tabOverview',
  sources: 'beta.signals.daily.tabChannels',
  community: 'beta.signals.daily.tabCommunity'
}

export function SignalDaily({
  report,
  filters,
  compare
}: {
  report: SignalReport
  filters: SignalFilters
  compare: boolean
}) {
  const t = useT()
  const [tab, setTab] = useState('overview')
  const [visibleSeries, setVisibleSeries] = useState(DAILY_SERIES.map((series) => series.id))
  const unaffected = unaffectedFilterNote(filters)
  const series = DAILY_SERIES.map((item) => ({
    ...item,
    label: t(item.label),
    unaffected: item.id === 'waitlist' ? unaffected : undefined
  }))
  const numeric = (
    key: string,
    label: string,
    value: (row: Day) => number,
    accent?: string
  ): SignalColumn<Day> => ({
    key,
    label,
    value,
    accent,
    unaffected: ['waitlist', 'discordLinked', 'discordBugs'].includes(key) ? unaffected : undefined,
    numeric: true,
    render: (row) => (
      <span className={value(row) === 0 ? 'signals-zero' : ''}>{formatNumber(value(row))}</span>
    )
  })
  const latestDay = report.range.end
  const columns: SignalColumn<Day>[] = [
    {
      key: 'day',
      label: filters.days === '24h' ? t('beta.signals.daily.hour') : t('beta.signals.daily.day'),
      value: (row) => row.day,
      render: (row) => (
        <>
          <span className="signals-primary">{shortDay(row.day)}</span>
          {filters.days !== '24h' && report.range.partialEnd && row.day === latestDay && (
            <small title={t('beta.signals.daily.inProgressHelp')}>{t('beta.signals.daily.inProgress')}</small>
          )}
        </>
      )
    },
    numeric('newUsers', t('beta.signals.newUsers'), (row) => row.newUsers, 'var(--signals-users)')
  ]
  if (tab === 'overview')
    columns.push(
      numeric('created', t('beta.signals.daily.created'), (row) => row.created, 'var(--signals-sites)'),
      numeric('imported', t('beta.signals.daily.imported'), (row) => row.imported, 'var(--signals-sites)'),
      numeric('stuck', t('beta.signals.daily.failures'), (row) => row.stuck, 'var(--signals-failures)'),
      numeric('waitlist', t('beta.signals.daily.blocked'), (row) => row.waitlist, 'var(--signals-waitlist)')
    )
  if (tab === 'sources')
    columns.push(
      ...report.sources.map((source) =>
        numeric(
          source,
          sourceLabel(t, source),
          (row) => row.bySource[source],
          `var(--signals-source-${source})`
        )
      )
    )
  if (tab === 'community')
    columns.push(
      numeric(
        'discordLinked',
        t('beta.signals.daily.verified'),
        (row) => row.discordLinked,
        'var(--signals-discord)'
      ),
      numeric(
        'discordBugs',
        t('beta.signals.daily.bugReports'),
        (row) => row.discordBugs,
        'var(--signals-discord)'
      )
    )
  return (
    <Card className="signals-panel">
      <div className="signals-panel-header">
        <h2>{filters.days === '24h' ? t('beta.signals.daily.byHour') : t('beta.signals.daily.byDay')}</h2>
        <span>{t('beta.signals.daily.firstSignIns', counted(report.totals.newUsers))}</span>
      </div>
      <p className="signals-panel-sub">
        {filters.days === '24h'
          ? t('beta.signals.daily.hourlySub')
          : report.range.partialEnd
            ? t('beta.signals.daily.dailySubPartial')
            : t('beta.signals.daily.dailySub')}
      </p>
      {compare && report.range.partialEnd && (
        <StatisticsNote>{t('beta.signals.daily.partialNote')}</StatisticsNote>
      )}
      <div className="signals-trend">
        <div className="signals-legend" role="group" aria-label={t('beta.signals.daily.seriesGroup')}>
          {series.map((series) => (
            <button
              type="button"
              className={cn('signals-legend-chip', series.unaffected && 'signals-unaffected')}
              key={series.id}
              data-series={series.id}
              aria-pressed={visibleSeries.includes(series.id)}
              disabled={visibleSeries.length === 1 && visibleSeries.includes(series.id)}
              aria-label={t(
                !visibleSeries.includes(series.id)
                  ? 'beta.signals.daily.seriesHidden'
                  : visibleSeries.length === 1
                    ? 'beta.signals.daily.seriesLast'
                    : 'beta.signals.daily.seriesShown',
                { label: series.label }
              )}
              title={
                visibleSeries.length === 1 && visibleSeries.includes(series.id)
                  ? t('beta.signals.daily.keepOne')
                  : undefined
              }
              onClick={() =>
                setVisibleSeries((visible) =>
                  visible.includes(series.id)
                    ? visible.length > 1
                      ? visible.filter((id) => id !== series.id)
                      : visible
                    : [...visible, series.id]
                )
              }
            >
              <i className="signals-dot" aria-hidden="true" />
              {series.label}
              {series.unaffected && <small className="signals-scope-note">{series.unaffected}</small>}
            </button>
          ))}
          {compare && (
            <span>
              <i className="signals-ghost-mark" />
              {t('beta.signals.daily.previousPeriod')}
            </span>
          )}
        </div>
        <SignalChart
          rows={report.byDay}
          previous={compare ? report.previousByDay : []}
          series={series.filter((series) => visibleSeries.includes(series.id))}
          large
          label={t('beta.signals.daily.chartLabel')}
        />
      </div>
      <div className="signals-toolbar">
        <div className="signals-segment" role="group" aria-label={t('beta.signals.daily.tableColumns')}>
          {['overview', 'sources', 'community'].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={tab === value}
              onClick={() => {
                if (tab === value) return
                const url = new URL(window.location.href)
                url.searchParams.set('signals_daily_page', '1')
                window.history.pushState(null, '', url)
                setTab(value)
              }}
            >
              {t(TAB_KEYS[value])}
            </button>
          ))}
        </div>
        <span>{t('beta.signals.daily.sortHint')}</span>
      </div>
      <SignalTable
        key={tab}
        id="daily"
        columns={columns}
        rows={report.byDay}
        rowKey={(row) => row.day}
        defaultSort="day"
      />
    </Card>
  )
}
