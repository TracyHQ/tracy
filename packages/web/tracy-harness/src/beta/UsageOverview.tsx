import { Card, cn } from '@tracy/ui'
import { useState } from 'react'
import { type T, useT } from '../i18n'
import { SignalChart, type SignalSeries } from './SignalChart'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsKpi } from './StatisticsKpi'
import { shortDay } from './signals-data'
import type { Usage, UsageDay, UsageFilters } from './usage-api'
import { outOf } from './usage-data'

/** The zone every day and hour on this screen is counted in. */
const TIME_ZONE = 'UTC+7'

const SERIES_IDS = ['users', 'sites', 'failures', 'waitlist']
const seriesOf = (t: T): SignalSeries<UsageDay>[] => [
  { id: 'users', label: t('beta.usage.column.requests'), metric: (row) => row.requests },
  { id: 'sites', label: t('beta.usage.column.siteChanged'), metric: (row) => row.changed },
  { id: 'failures', label: t('beta.usage.overview.badRatings'), metric: (row) => row.negative },
  { id: 'waitlist', label: t('beta.usage.column.undone'), metric: (row) => row.undone }
]
type Definition = 'requests' | 'changed' | 'good' | 'bad' | 'undone'
const definition = (t: T, key: Definition) => t(`beta.usage.overview.def.${key}`)
const seriesDefinition = (id: string): Definition =>
  id === 'users' ? 'requests' : id === 'sites' ? 'changed' : id === 'failures' ? 'bad' : 'undone'

export function UsageOverview({ body, filters }: { body: Usage; filters: UsageFilters }) {
  const t = useT()
  const current = body.turns.all
  const previous = filters.days !== 'all' && filters.compare ? body.previous?.turns.all : undefined
  const rows = body.daily || []
  const priorRows = filters.days !== 'all' && filters.compare ? body.previousDaily || [] : []
  const rated = current.feedback.positive + current.feedback.negative
  const tiles = [
    {
      key: 'requests',
      label: t('beta.usage.overview.chatRequests'),
      value: current.turns,
      previous: previous?.turns,
      note: t('beta.usage.overview.sentToTracy'),
      metric: (row: UsageDay) => row.requests,
      good: true,
      neutral: true,
      series: 'users'
    },
    {
      key: 'changed',
      label: t('beta.usage.column.siteChanged'),
      value: current.changes.changed,
      previous: previous?.changes.changed,
      note: outOf(t, 'beta.usage.overview.ofChanged', current.changes.changed, current.turns),
      metric: (row: UsageDay) => row.changed,
      good: true,
      neutral: false,
      series: 'sites'
    },
    {
      key: 'good',
      label: t('beta.usage.sample.group.good'),
      value: current.feedback.positive,
      previous: previous?.feedback.positive,
      note: outOf(t, 'beta.usage.overview.ofRated', rated, current.turns),
      metric: () => 0,
      good: true,
      neutral: true,
      series: 'sites'
    },
    {
      key: 'bad',
      label: t('beta.usage.sample.group.bad'),
      value: current.feedback.negative,
      previous: previous?.feedback.negative,
      note: outOf(t, 'beta.usage.overview.ofRatedRequests', current.feedback.negative, rated),
      metric: (row: UsageDay) => row.negative,
      good: false,
      neutral: false,
      series: 'failures'
    }
  ] as const
  return (
    <div className="signals-kpis usage-kpis">
      {tiles.map((tile) => (
        <StatisticsKpi
          key={tile.key}
          label={tile.label}
          value={tile.value}
          valueLabel={
            tile.value === 0
              ? outOf(
                  t,
                  tile.key === 'good'
                    ? 'beta.usage.overview.ofGood'
                    : tile.key === 'bad'
                      ? 'beta.usage.overview.ofBad'
                      : tile.key === 'changed'
                        ? 'beta.usage.overview.ofChanged'
                        : 'beta.usage.overview.ofRecorded',
                  0,
                  current.turns
                )
              : undefined
          }
          unit={t('beta.usage.unit.requests', { count: tile.value })}
          previous={tile.previous}
          definition={definition(t, tile.key)}
          note={tile.note}
          rows={rows}
          previousRows={priorRows}
          metric={tile.metric}
          series={tile.series}
          goodWhenUp={tile.good}
          comparisonNeutral={tile.neutral || !!body.range?.partialEnd}
          comparisonLabel={body.range?.partialEnd ? t('beta.usage.periodInProgress') : undefined}
          trendLabel={
            body.range?.bucket === 'hour' ? t('beta.usage.trend.hourly') : t('beta.usage.trend.daily')
          }
          showTrend={rows.length > 0 && tile.key !== 'good'}
          scope={filters.days === 'all' ? t('beta.usage.scope.allTime') : t('beta.usage.scope.allFilters')}
        />
      ))}
    </div>
  )
}

export function UsageDaily({ body, compare }: { body: Usage; compare: boolean }) {
  const t = useT()
  const [visible, setVisible] = useState(SERIES_IDS)
  const lines = seriesOf(t)
  const hourly = body.range?.bucket === 'hour'
  const rows = body.daily || []
  const columns: SignalColumn<UsageDay>[] = [
    {
      key: 'day',
      label: hourly ? t('beta.usage.column.hour') : t('beta.usage.column.day'),
      help: t('beta.usage.overview.dayHelp'),
      value: (row) => row.day,
      render: (row) => (
        <span title={row.day}>
          {shortDay(row.day)}
          {body.range?.partialEnd && row.day === body.range.end && (
            <small>{t('beta.usage.dayInProgress')}</small>
          )}
        </span>
      )
    },
    ...lines.map((series) => ({
      key: series.id,
      label: series.label,
      help: definition(t, seriesDefinition(series.id)),
      numeric: true,
      value: series.metric
    }))
  ]
  return (
    <Card className="signals-panel" data-usage-block="daily">
      <div className="signals-panel-header">
        <h2>{t('beta.usage.overview.activity')}</h2>
        <span>{TIME_ZONE}</span>
      </div>
      <p className="signals-panel-sub">
        {t(hourly ? 'beta.usage.overview.activitySubHour' : 'beta.usage.overview.activitySubDay')}
      </p>
      <>
        <div className="signals-trend">
          <div className="signals-legend" role="group" aria-label={t('beta.usage.overview.visibleMetrics')}>
            {lines.map((series) => (
              <button
                type="button"
                key={series.id}
                className={cn('signals-legend-chip')}
                data-series={series.id}
                aria-pressed={visible.includes(series.id)}
                disabled={visible.length === 1 && visible.includes(series.id)}
                title={`${definition(t, seriesDefinition(series.id))}${visible.length === 1 && visible.includes(series.id) ? ` ${t('beta.usage.overview.keepOne')}` : ''}`}
                onClick={() =>
                  setVisible((items) =>
                    items.includes(series.id) ? items.filter((id) => id !== series.id) : [...items, series.id]
                  )
                }
              >
                <i className="signals-dot" aria-hidden="true" />
                {series.label}
              </button>
            ))}
            {compare && !!body.previousDaily?.length && (
              <span>
                <i className="signals-ghost-mark" />
                {t('beta.usage.previousPeriod')}
              </span>
            )}
          </div>
          <SignalChart
            rows={rows}
            previous={compare ? body.previousDaily || [] : []}
            series={lines.filter((series) => visible.includes(series.id))}
            large
            integerAxis
            label={t('beta.usage.overview.activity')}
          />
        </div>
        <SignalTable
          id="usage-daily"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.day}
          defaultSort="day"
          search={{
            label: t('beta.usage.overview.searchDay'),
            match: (row) => `${row.day} ${shortDay(row.day)}`
          }}
        />
      </>
    </Card>
  )
}
