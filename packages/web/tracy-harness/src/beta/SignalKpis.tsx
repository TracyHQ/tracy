import { Card } from '@tracy/ui'
import { useT } from '../i18n'
import type { Day, SourceBucket } from './api'
import type { SignalSeries } from './SignalChart'
import { SignalHoverCard } from './SignalHoverCard'
import { StatisticsKpi } from './StatisticsKpi'
import { unaffectedFilterNote } from './signal-filter-scope'
import { formatNumber, type SignalFilters, type SignalReport, totalSites } from './signals-data'
import { counted, sourceLabel } from './strings'

export function SignalKpis({
  report,
  filters,
  compare,
  onOpenWaitlist
}: {
  report: SignalReport
  filters: SignalFilters
  compare: boolean
  onOpenWaitlist?: () => void
}) {
  const t = useT()
  const totals = report.totals,
    prior = report.previous || totals
  const unaffected = unaffectedFilterNote(filters)
  const tiles: {
    key: string
    label: string
    value: number
    previous: number
    unit: string
    note: string
    definition: string
    metric: (row: Day) => number
    series: SignalSeries['id']
    goodWhenUp: boolean
  }[] = [
    {
      key: 'users',
      series: 'users',
      goodWhenUp: true,
      label: t('beta.signals.newUsers'),
      value: totals.newUsers,
      previous: prior.newUsers,
      unit: t('beta.signals.kpi.unitPeople', { count: totals.newUsers }),
      definition: t('beta.signals.kpi.usersDefinition'),
      note: t('beta.signals.kpi.usersNote'),
      metric: (row) => row.newUsers
    },
    {
      key: 'sites',
      series: 'sites',
      goodWhenUp: true,
      label: t('beta.signals.newSites'),
      value: totals.created + totals.imported,
      previous: prior.created + prior.imported,
      unit: t('beta.signals.kpi.unitSites', { count: totals.created + totals.imported }),
      definition: t('beta.signals.kpi.sitesDefinition'),
      note: t('beta.signals.kpi.sitesNote', { created: totals.created, imported: totals.imported }),
      metric: totalSites
    },
    {
      key: 'waitlist',
      series: 'waitlist',
      goodWhenUp: false,
      label: t('beta.signals.kpi.waitlist'),
      value: totals.waitlist,
      previous: prior.waitlist,
      unit: t('beta.signals.kpi.unitBlocked', { count: totals.waitlist }),
      definition: t('beta.signals.kpi.waitlistDefinition'),
      note: t('beta.signals.kpi.waitlistNote'),
      metric: (row) => row.waitlist
    },
    {
      key: 'stuck',
      series: 'failures',
      goodWhenUp: false,
      label: t('beta.signals.kpi.failures'),
      value: totals.stuck,
      previous: prior.stuck,
      unit: t('beta.signals.kpi.unitAffected', { count: totals.stuck }),
      definition: t('beta.signals.kpi.failuresDefinition'),
      note: t('beta.signals.kpi.failuresNote', counted(totals.failureEvents)),
      metric: (row) => row.stuck
    },
    {
      key: 'discord',
      series: 'discord',
      goodWhenUp: true,
      label: t('beta.signals.kpi.discord'),
      value: totals.discordLinked,
      previous: prior.discordLinked,
      unit: t('beta.signals.kpi.unitVerified', { count: totals.discordLinked }),
      definition: t('beta.signals.kpi.discordDefinition'),
      note: t('beta.signals.kpi.bugReports', counted(totals.discordBugs)),
      metric: (row) => row.discordLinked
    }
  ]
  const sources: SourceBucket[] = ['email', 'blog', 'demo', 'site', 'other', 'none']
  const optional: SourceBucket[] = ['forum', 'product-page', 'helpdesk', 'social', 'video', 'owned']
  for (const source of optional)
    if (report.sources.includes(source)) sources.splice(sources.indexOf('other'), 0, source)
  const sourceTotal = sources.reduce((sum, source) => sum + (totals.bySource[source] ?? 0), 0)
  return (
    <>
      <div className="signals-kpis">
        {tiles.map(({ key, ...tile }) => {
          const attention =
            key === 'stuck' && tile.value > 0
              ? 'negative'
              : key === 'waitlist' && tile.value > tile.previous
                ? 'warning'
                : null
          return (
            <StatisticsKpi
              key={key}
              {...tile}
              rows={report.byDay}
              previous={compare ? tile.previous : undefined}
              previousRows={compare ? report.previousByDay : []}
              comparisonNeutral={report.range.partialEnd}
              comparisonLabel={report.range.partialEnd ? t('beta.signals.kpi.partial') : undefined}
              attention={attention}
              className={
                unaffected && ['waitlist', 'discord'].includes(key) ? 'signals-unaffected' : undefined
              }
              trendLabel={
                filters.days === '24h'
                  ? t('beta.signals.kpi.trendHourly')
                  : key === 'stuck'
                    ? t('beta.signals.kpi.trendFailures')
                    : t('beta.signals.kpi.trendDaily')
              }
              scope={
                <>
                  {['waitlist', 'discord'].includes(key)
                    ? t('beta.signals.kpi.scopeDates')
                    : t('beta.signals.kpi.scopeAll')}
                  {unaffected && ['waitlist', 'discord'].includes(key) && (
                    <small className="signals-scope-note">{unaffected}</small>
                  )}
                </>
              }
            >
              {key === 'waitlist' && (
                <>
                  <SignalHoverCard
                    label={t('beta.signals.kpi.waitlistHistory')}
                    summary={t('beta.signals.kpi.waitlistMissing')}
                  >
                    <p>{t('beta.signals.kpi.waitlistMissingBody')}</p>
                  </SignalHoverCard>
                  <a
                    className="signals-waitlist-link"
                    href="/ops/waitlist"
                    onClick={(event) => {
                      if (
                        !onOpenWaitlist ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey ||
                        event.button !== 0
                      )
                        return
                      event.preventDefault()
                      onOpenWaitlist()
                    }}
                  >
                    {t('beta.signals.kpi.seeWaitlist')}
                  </a>
                </>
              )}
            </StatisticsKpi>
          )
        })}
      </div>
      <Card className="signals-source-card">
        <h2>{t('beta.signals.kpi.byChannel')}</h2>
        <div className="signals-source-breakdown">
          <div
            className="signals-source-bar"
            role="img"
            aria-label={
              sourceTotal
                ? sources
                    .map(
                      (source) => `${sourceLabel(t, source)} ${formatNumber(totals.bySource[source] ?? 0)}`
                    )
                    .join(', ')
                : t('beta.signals.kpi.noChannelData')
            }
          >
            {sources.map((source) => (
              <span
                data-source={source}
                key={source}
                style={{
                  width: `${sourceTotal ? ((totals.bySource[source] ?? 0) / sourceTotal) * 100 : 0}%`
                }}
              />
            ))}
          </div>
          <div className="signals-source-list">
            {sources.map((source) => (
              <span data-source={source} key={source}>
                <i className="signals-dot" aria-hidden="true" />
                {sourceLabel(t, source)} <b>{formatNumber(totals.bySource[source] ?? 0)}</b>
                <small>
                  {sourceTotal ? Math.round(((totals.bySource[source] ?? 0) / sourceTotal) * 100) : 0}%
                </small>
              </span>
            ))}
          </div>
        </div>
      </Card>
    </>
  )
}
