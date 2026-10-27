import { Card } from '@tracy/ui'
import { useState } from 'react'
import { type T, useT } from '../i18n'
import type { Stuck } from './api'
import { SignalChart, type SignalSeries } from './SignalChart'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsKpi } from './StatisticsKpi'
import { StuckTime } from './StuckCases'
import { shortDay } from './signals-data'
import { counted } from './strings'
import {
  type buildStuckView,
  type StuckDaily,
  type StuckFilters,
  stuckBreakdown,
  stuckDuration,
  stuckSplit
} from './stuck-data'

type View = ReturnType<typeof buildStuckView>
/** A zero tile names its denominator: "0 of 4 open sites". */
function zeroLabel(t: T, id: string, open: number) {
  if (id === 'customers') return t('beta.stuck.kpi.zeroCustomers')
  return t(id === 'repeat' ? 'beta.stuck.kpi.zeroRepeat' : 'beta.stuck.kpi.zeroOpen', counted(open))
}
export function StuckOverview({ body, view }: { body: Stuck; view: View }) {
  const t = useT()
  const scope = t('beta.stuck.kpi.scope')
  const metrics = [
    {
      id: 'open',
      label: t('beta.stuck.kpi.open'),
      value: view.open.length,
      unit: t('beta.stuck.unit.sites', { count: view.open.length }),
      definition: t('beta.stuck.kpi.openHelp'),
      note: stuckSplit(t, view.open),
      series: 'failures'
    },
    {
      id: 'customers',
      label: t('beta.stuck.kpi.customers'),
      value: view.people,
      unit: t('beta.stuck.unit.customers', { count: view.people }),
      definition: t('beta.stuck.kpi.customersHelp'),
      note: t('beta.stuck.kpi.customersNote', counted(view.open.filter((row) => !row.email).length)),
      series: 'users'
    },
    {
      id: 'repeat',
      label: t('beta.stuck.kpi.repeat'),
      value: view.repeat.length,
      unit: t('beta.stuck.unit.sites', { count: view.repeat.length }),
      definition: t('beta.stuck.kpi.repeatHelp'),
      note: t('beta.stuck.kpi.repeatNote', counted(view.open.reduce((n, row) => n + row.times, 0))),
      series: 'waitlist'
    },
    {
      id: 'wait',
      label: t('beta.stuck.kpi.wait'),
      value: view.oldest ? (Date.parse(body.readAt) - Date.parse(view.oldest.firstAt)) / 3600000 : 0,
      valueLabel: view.oldest
        ? stuckDuration(t, (Date.parse(body.readAt) - Date.parse(view.oldest.firstAt)) / 3600000)
        : t('beta.stuck.kpi.noOpen'),
      unit: '',
      definition: t('beta.stuck.kpi.waitHelp'),
      note: t('beta.stuck.kpi.waitNote', counted(view.waitingOverDay)),
      series: 'failures'
    }
  ]
  return (
    <div className="signals-kpis stuck-kpis">
      {metrics.map(({ id, ...metric }) => (
        <StatisticsKpi
          key={id}
          {...metric}
          valueLabel={
            metric.valueLabel ?? (metric.value === 0 ? zeroLabel(t, id, view.open.length) : undefined)
          }
          rows={[]}
          metric={() => 0}
          showTrend={false}
          goodWhenUp={false}
          scope={scope}
        />
      ))}
    </div>
  )
}
export function StuckBreakdown({ view }: { view: View }) {
  const t = useT()
  const [group, setGroup] = useState<'cms' | 'step' | 'reason'>('reason')
  const rows = stuckBreakdown(t, view.open, group)
  type Row = (typeof rows)[number]
  const columns: SignalColumn<Row>[] = [
    {
      key: 'label',
      label: t(
        group === 'cms'
          ? 'beta.stuck.fact.platform'
          : group === 'step'
            ? 'beta.stuck.breakdown.step'
            : 'beta.stuck.col.reason'
      ),
      help: t('beta.stuck.breakdown.groupHelp'),
      value: (row) => row.label,
      render: (row) => <span title={t('beta.stuck.breakdown.recorded', { value: row.key })}>{row.label}</span>
    },
    {
      key: 'sites',
      label: t('beta.stuck.breakdown.sites'),
      numeric: true,
      help: t('beta.stuck.breakdown.sitesHelp'),
      value: (row) => row.sites
    },
    {
      key: 'people',
      label: t('beta.stuck.breakdown.customers'),
      numeric: true,
      help: t('beta.stuck.breakdown.customersHelp'),
      value: (row) => row.people
    },
    {
      key: 'failures',
      label: t('beta.stuck.breakdown.failures'),
      numeric: true,
      help: t('beta.stuck.breakdown.failuresHelp'),
      value: (row) => row.failures
    },
    {
      key: 'repeated',
      label: t('beta.stuck.breakdown.repeated'),
      numeric: true,
      help: t('beta.stuck.breakdown.repeatedHelp'),
      value: (row) => row.repeated
    }
  ]
  return (
    <Card className="signals-panel" data-stuck-breakdown>
      <div className="signals-panel-header">
        <h2>{t('beta.stuck.breakdown.title')}</h2>
        <span>{t('beta.stuck.breakdown.scope')}</span>
      </div>
      <div className="signals-toolbar">
        <div className="signals-segment" role="group" aria-label={t('beta.stuck.breakdown.groupBy')}>
          {(['cms', 'step', 'reason'] as const).map((key) => (
            <button type="button" key={key} aria-pressed={group === key} onClick={() => setGroup(key)}>
              {t(
                key === 'cms'
                  ? 'beta.filters.cms'
                  : key === 'step'
                    ? 'beta.stuck.filter.step'
                    : 'beta.stuck.filter.reason'
              )}
            </button>
          ))}
        </div>
      </div>
      <SignalTable
        key={group}
        id="stuck-breakdown"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.key}
        defaultSort="sites"
        search={{ label: t('beta.stuck.breakdown.search'), match: (row) => `${row.label} ${row.key}` }}
      />
    </Card>
  )
}
const SERIES: (SignalSeries<StuckDaily> & { labelKey: string })[] = [
  { id: 'failures', label: '', labelKey: 'beta.stuck.history.failedSites', metric: (row) => row.failed },
  { id: 'sites', label: '', labelKey: 'beta.stuck.history.recovered', metric: (row) => row.recovered }
]
export function StuckHistory({ body, view, filters }: { body: Stuck; view: View; filters: StuckFilters }) {
  const t = useT()
  const lines = SERIES.map(({ labelKey, ...line }) => ({ ...line, label: t(labelKey) }))
  const [visible, setVisible] = useState(['failures', 'sites'])
  const history = view.history
  const compare = filters.compare && !!history?.previous
  const previous = compare ? history?.previous : null
  const scope = t('beta.stuck.history.scope')
  const definitions = {
    rate: t('beta.stuck.history.rateHelp'),
    recovery: t('beta.stuck.history.recoveryHelp'),
    time: t('beta.stuck.history.timeHelp')
  }
  return (
    <Card className="signals-panel" data-stuck-history>
      <div className="signals-panel-header">
        <h2>{t('beta.stuck.history.title')}</h2>
        <span>{t('beta.stuck.history.period')}</span>
      </div>
      {history && (
        <>
          <div className="signals-kpis stuck-history-kpis">
            <StatisticsKpi
              label={t('beta.stuck.history.failedSites')}
              value={history.rate || 0}
              valueLabel={
                history.rate === null
                  ? t('beta.stuck.history.noActivity')
                  : history.rate === 0
                    ? t('beta.stuck.history.failedOfActive', {
                        ...counted(history.active),
                        failed: counted(history.failed).n
                      })
                    : `${Math.round(history.rate * 10) / 10}%`
              }
              previous={history.rate === null ? undefined : (previous?.rate ?? undefined)}
              unit={t('beta.stuck.unit.percentActive')}
              definition={definitions.rate}
              note={t('beta.stuck.history.failedOfSetup', {
                ...counted(history.active),
                failed: counted(history.failed).n
              })}
              rows={history.daily.filter((row) => row.active > 0)}
              previousRows={[]}
              metric={(row) => row.rate ?? 0}
              series="failures"
              goodWhenUp={false}
              scope={scope}
              comparisonNeutral={view.range.partial}
              comparisonLabel={t(
                view.range.partial ? 'beta.stuck.history.partialPoints' : 'beta.stuck.history.changePoints'
              )}
              trendLabel={t('beta.stuck.history.rateTrend')}
            />
            <StatisticsKpi
              label={t('beta.stuck.status.workingAgain')}
              value={history.recovered}
              previous={previous?.recovered}
              unit={t('beta.stuck.unit.recoveredCases', { count: history.recovered })}
              definition={definitions.recovery}
              note={t('beta.stuck.history.recoveryNote')}
              rows={history.daily}
              previousRows={compare ? history.previousDaily : []}
              metric={(row) => row.recovered}
              series="sites"
              scope={t('beta.stuck.history.allFiltersScope')}
              comparisonNeutral={view.range.partial}
              comparisonLabel={view.range.partial ? t('beta.stuck.history.partial') : undefined}
            />
            <StatisticsKpi
              label={t('beta.stuck.history.typicalTime')}
              value={history.medianHours || 0}
              valueLabel={stuckDuration(t, history.medianHours)}
              previous={
                history.medianHours !== null && previous?.medianHours !== null
                  ? previous?.medianHours
                  : undefined
              }
              unit={t('beta.stuck.unit.hours', { count: history.medianHours || 0 })}
              definition={definitions.time}
              note={t('beta.stuck.history.measuredNote', counted(history.measured))}
              rows={history.daily.filter((row) => row.medianHours !== null)}
              metric={(row) => row.medianHours || 0}
              series="discord"
              goodWhenUp={false}
              scope={t('beta.stuck.history.recoveredScope')}
              trendLabel={t('beta.stuck.history.timeTrend')}
              comparisonNeutral={view.range.partial}
              comparisonLabel={t(
                view.range.partial ? 'beta.stuck.history.partialHours' : 'beta.stuck.history.changeHours'
              )}
            />
          </div>
          <div className="signals-trend">
            <div className="signals-legend" role="group" aria-label={t('beta.stuck.history.visibleSeries')}>
              {lines.map((series) => (
                <button
                  type="button"
                  key={series.id}
                  className="signals-legend-chip"
                  data-series={series.id}
                  aria-pressed={visible.includes(series.id)}
                  disabled={visible.length === 1 && visible.includes(series.id)}
                  onClick={() =>
                    setVisible((current) =>
                      current.includes(series.id)
                        ? current.filter((id) => id !== series.id)
                        : [...current, series.id]
                    )
                  }
                >
                  <i className="signals-dot" aria-hidden="true" />
                  {series.label}
                </button>
              ))}
              {compare && (
                <span>
                  <i className="signals-ghost-mark" />
                  {t('beta.stuck.history.previousPeriod')}
                </span>
              )}
            </div>
            <SignalChart
              rows={history.daily}
              previous={compare ? history.previousDaily : []}
              series={lines.filter((line) => visible.includes(line.id))}
              large
              integerAxis
              label={t('beta.stuck.history.chart')}
            />
          </div>
          <SignalTable
            id="stuck-history"
            rows={history.daily}
            rowKey={(row) => row.day}
            defaultSort="day"
            columns={[
              {
                key: 'day',
                label: t(view.range.bucket === 'hour' ? 'beta.stuck.history.hour' : 'beta.stuck.history.day'),
                value: (row) => row.day,
                render: (row) => shortDay(row.day)
              },
              {
                key: 'active',
                label: t('beta.stuck.history.activeSites'),
                help: t('beta.stuck.history.activeSitesHelp'),
                numeric: true,
                value: (row) => row.active
              },
              {
                key: 'failed',
                label: t('beta.stuck.history.failedSites'),
                help: t('beta.stuck.history.failedSitesHelp'),
                numeric: true,
                value: (row) => row.failed
              },
              {
                key: 'rate',
                label: t('beta.stuck.history.share'),
                help: definitions.rate,
                numeric: true,
                value: (row) => (row.active ? row.rate : null),
                render: (row) =>
                  row.active
                    ? `${Math.round((row.rate ?? 0) * 10) / 10}%`
                    : t('beta.stuck.history.noDayActivity')
              },
              {
                key: 'recovered',
                label: t('beta.stuck.history.recovered'),
                help: definitions.recovery,
                numeric: true,
                value: (row) => row.recovered
              },
              {
                key: 'medianHours',
                label: t('beta.stuck.history.typicalTime'),
                help: definitions.time,
                numeric: true,
                value: (row) => row.medianHours,
                render: (row) => stuckDuration(t, row.medianHours)
              }
            ]}
          />
        </>
      )}
      <div className="stuck-history-footer">
        <SignalHoverCard label={t('beta.stuck.guide.title')} summary={t('beta.stuck.guide.summary')}>
          <p>{t('beta.stuck.guide.rate')}</p>
          <p>{t('beta.stuck.guide.recovery')}</p>
          <p>{t('beta.stuck.guide.missing')}</p>
        </SignalHoverCard>
        <span>
          {t('beta.stuck.history.dataAsOf')} <StuckTime at={body.readAt} />
        </span>
      </div>
    </Card>
  )
}
