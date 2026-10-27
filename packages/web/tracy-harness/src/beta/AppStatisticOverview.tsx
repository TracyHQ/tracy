import { Card } from '@tracy/ui'
import { useState } from 'react'
import { useT } from '../i18n/index.ts'
import { AppStatisticGrowthPanels } from './AppStatisticGrowthPanels'
import type { AppStatisticDay, AppStatisticPayload } from './app-statistic-api'
import { appStatisticDay, dateBasis } from './app-statistic-copy'
import { SignalChart, type SignalSeries } from './SignalChart'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsKpi } from './StatisticsKpi'
import { StatisticsNote } from './StatisticsNote'
import { shortDay } from './signals-data'

interface AppMetric {
  key: keyof Omit<AppStatisticDay, 'day'>
  label: string
  series: string
  /** Dictionary key of the unit; its plural follows the tile's value. */
  unit: string
  definition: string
  note: string
  goodWhenUp: boolean
}
export function AppStatisticOverview({ report, compare }: { report: AppStatisticPayload; compare: boolean }) {
  const t = useT()
  const [hidden, setHidden] = useState<string[]>([])
  const hourly = report.days === '24h' || report.analytics.range.bucket === 'hour'
  const allTime = report.days === 'all' || report.analytics.range.preset === 'all'
  const latestState = report.view === 'users' || report.view === 'installs'
  const partialComparison = compare && report.analytics.previous && report.analytics.range.partialEnd
  const activityUnavailable = !report.activityAvailable
  const metrics: AppMetric[] = [
    {
      key: 'activeAppUsers',
      label: t('appstat.metric.active'),
      series: 'comments',
      unit: 'appstat.unit.peopleCopies',
      goodWhenUp: true,
      definition: t('appstat.meaning.activeUsers'),
      note: t('appstat.metric.active.note')
    },
    {
      key: 'users',
      label: latestState ? t('appstat.metric.people') : t('appstat.metric.peopleRequesting'),
      series: 'users',
      unit: 'appstat.unit.accounts',
      goodWhenUp: true,
      definition:
        report.view === 'users'
          ? t('appstat.metric.people.users.definition')
          : report.view === 'installs'
            ? t('appstat.metric.people.installs.definition')
            : t('appstat.metric.people.requests.definition'),
      note:
        report.view === 'users'
          ? t('appstat.metric.people.users.note')
          : report.view === 'installs'
            ? t('appstat.metric.people.installs.note')
            : t('appstat.metric.people.requests.note')
    }
  ]
  if (report.view === 'downloads')
    metrics.push({
      key: 'downloads',
      label: t('appstat.view.downloads'),
      series: 'sites',
      unit: 'appstat.unit.requests',
      goodWhenUp: true,
      definition: t('appstat.metric.downloads.definition'),
      note: t('appstat.metric.requestsNote')
    })
  if (report.view === 'users' || report.view === 'installs')
    metrics.push({
      key: 'installs',
      label: t('appstat.metric.installs'),
      series: 'discord',
      unit: 'appstat.unit.copies',
      goodWhenUp: true,
      definition: t('appstat.metric.installs.definition'),
      note:
        report.view === 'users' ? t('appstat.metric.installs.users.note') : t('appstat.metric.installs.note')
    })
  if (report.view === 'users' || report.view === 'quickstarts')
    metrics.push({
      key: 'quickstarts',
      label: report.view === 'users' ? t('appstat.metric.accountQuickstarts') : t('appstat.view.quickstarts'),
      series: 'waitlist',
      unit: 'appstat.unit.requests',
      goodWhenUp: true,
      definition: t('appstat.metric.quickstarts.definition'),
      note: t('appstat.metric.requestsNote')
    })
  if (report.view === 'installs')
    metrics.push(
      {
        key: 'linkedInstalls',
        label: t('appstat.metric.linked'),
        series: 'sites',
        unit: 'appstat.unit.copies',
        goodWhenUp: true,
        definition: t('appstat.metric.linked.definition'),
        note: t('appstat.metric.linked.note')
      },
      {
        key: 'unlinkedInstalls',
        label: t('appstat.metric.unlinked'),
        series: 'failures',
        unit: 'appstat.unit.copies',
        goodWhenUp: false,
        definition: t('appstat.metric.unlinked.definition'),
        note: t('appstat.metric.unlinked.note')
      }
    )
  const availableMetrics = metrics.filter(
    (metric) =>
      (metric.key !== 'activeAppUsers' || !activityUnavailable) &&
      (report.view !== 'downloads' || metric.key !== 'users')
  )
  const rows = report.analytics.daily
  const previous = compare && !allTime ? report.analytics.previous : null
  const plotted =
    report.view === 'users'
      ? availableMetrics.filter((metric) => metric.key === 'users')
      : availableMetrics.filter((metric) => metric.key !== 'users' && metric.key !== 'activeAppUsers')
  const series: SignalSeries<AppStatisticDay>[] = plotted.map((metric) => ({
    id: metric.series,
    label:
      report.view === 'installs' && metric.key === 'installs'
        ? t('appstat.series.copiesByLast')
        : metric.label,
    metric: (row) => row[metric.key] ?? 0
  }))
  const visible = series.filter((item) => !hidden.includes(item.id))
  const dailyColumns: SignalColumn<AppStatisticDay>[] = [
    {
      key: 'day',
      label: hourly ? t('appstat.col.hour') : t('appstat.col.day'),
      help: t('appstat.col.day.help'),
      value: (row) => row.day,
      render: (row) => (
        <>
          <span className="signals-primary">{hourly ? shortDay(row.day) : row.day}</span>
          {!hourly &&
            report.analytics.range.partialEnd &&
            row.day === appStatisticDay(Date.parse(report.analytics.range.end) - 1) && (
              <small>{t('appstat.dayInProgress')}</small>
            )}
        </>
      )
    },
    ...plotted.map((metric) => ({
      key: metric.key,
      label:
        report.view === 'users'
          ? t('appstat.col.peopleByLatest')
          : report.view === 'installs' && metric.key === 'installs'
            ? t('appstat.series.copiesByLast')
            : metric.label,
      help: metric.definition,
      numeric: true,
      value: (row: AppStatisticDay) => row[metric.key] ?? 0
    }))
  ]
  return (
    <>
      {partialComparison && <StatisticsNote standalone>{t('appstat.note.partial')}</StatisticsNote>}
      {latestState && (
        <StatisticsNote standalone>
          <SignalHoverCard label={t('appstat.connections.label')} summary={t('appstat.connections.summary')}>
            <p>{t('appstat.meaning.connection')}</p>
          </SignalHoverCard>
        </StatisticsNote>
      )}
      {allTime && <StatisticsNote standalone>{t('appstat.note.allTime')}</StatisticsNote>}
      <div className="signals-kpis app-statistic-kpis">
        {availableMetrics.map((metric) => (
          <StatisticsKpi
            key={metric.key}
            label={metric.label}
            value={report.summary[metric.key] ?? 0}
            previous={
              previous && !(metric.key === 'activeAppUsers' && activityUnavailable)
                ? (previous[metric.key] ?? 0)
                : undefined
            }
            unit={t(metric.unit, { count: report.summary[metric.key] ?? 0 })}
            definition={metric.definition}
            note={metric.note}
            rows={report.view === 'users' && !['users', 'activeAppUsers'].includes(metric.key) ? [] : rows}
            previousRows={
              compare && !(report.view === 'users' && !['users', 'activeAppUsers'].includes(metric.key))
                ? report.analytics.previousDaily
                : []
            }
            metric={(row) => row[metric.key] ?? 0}
            series={metric.series}
            goodWhenUp={metric.goodWhenUp}
            comparisonNeutral={
              (latestState && metric.key !== 'activeAppUsers') || report.analytics.range.partialEnd
            }
            comparisonLabel={
              partialComparison
                ? t('appstat.comparison.partial')
                : latestState && metric.key !== 'activeAppUsers'
                  ? t('appstat.comparison.latestState')
                  : undefined
            }
            showTrend={
              metric.key === 'activeAppUsers'
                ? !activityUnavailable
                : report.view !== 'users' || metric.key === 'users'
            }
            trendLabel={
              hourly
                ? t('appstat.trend.hourly')
                : metric.key === 'activeAppUsers'
                  ? t('appstat.trend.active')
                  : report.view === 'users' && metric.key !== 'users'
                    ? t('appstat.trend.notSplit')
                    : metric.key === 'users' && report.view !== 'users'
                      ? t('appstat.trend.accounts')
                      : report.view === 'users'
                        ? t('appstat.trend.latestRecord')
                        : report.view === 'installs'
                          ? t('appstat.trend.lastConnection')
                          : t('appstat.trend.requests')
            }
          />
        ))}
      </div>
      <AppStatisticGrowthPanels report={report} />
      <Card className="signals-panel" data-app-daily>
        <div className="signals-panel-header">
          <h2>
            {latestState
              ? hourly
                ? t('appstat.daily.latestByHour')
                : t('appstat.daily.latestByDay')
              : hourly
                ? t('appstat.daily.byHour')
                : t('appstat.daily.byDay')}
          </h2>
          <span>{t('appstat.basisUtc7', { basis: dateBasis(report.view, t) })}</span>
        </div>
        <p className="signals-panel-sub">
          {report.view === 'users'
            ? t('appstat.daily.users')
            : report.view === 'installs'
              ? t('appstat.daily.installs')
              : t('appstat.daily.requests')}
          {report.analytics.range.partialEnd ? ` ${t('appstat.daily.lastInProgress')}` : ''}
        </p>
        <div className="signals-trend">
          <div className="signals-legend" role="group" aria-label={t('appstat.chart.series')}>
            {series.map((item) => (
              <button
                type="button"
                key={item.id}
                className="signals-legend-chip"
                data-series={item.id}
                aria-pressed={!hidden.includes(item.id)}
                disabled={visible.length === 1 && visible[0].id === item.id}
                onClick={() =>
                  setHidden((value) =>
                    value.includes(item.id) ? value.filter((id) => id !== item.id) : [...value, item.id]
                  )
                }
              >
                <i className="signals-dot" aria-hidden="true" />
                {item.label}
              </button>
            ))}
            {compare && report.analytics.previous && (
              <span>
                <i className="signals-ghost-mark" />
                {latestState ? t('appstat.chart.previousRecords') : t('appstat.chart.previousPeriod')}
              </span>
            )}
          </div>
          <SignalChart
            rows={rows}
            previous={compare ? report.analytics.previousDaily : []}
            series={visible}
            large
            integerAxis
            label={t('appstat.chart.label')}
          />
        </div>
        <div className="signals-toolbar">
          <span>
            {t(hourly ? 'appstat.count.hours' : 'appstat.count.days', { count: rows.length })} ·{' '}
            {t('appstat.sortHint')}
          </span>
        </div>
        <SignalTable
          id="app-daily"
          columns={dailyColumns}
          rows={rows}
          rowKey={(row) => row.day}
          defaultSort="day"
        />
      </Card>
    </>
  )
}
