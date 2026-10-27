import { Card } from '@tracy/ui'
import { formatFixed, type T, useLanguage, useT } from '../i18n/index.ts'
import type { AppStatisticGrowth, AppStatisticPayload } from './app-statistic-api'
import { appStatisticTime, OS_NAMES } from './app-statistic-copy'
import { SignalChart } from './SignalChart'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsNote } from './StatisticsNote'
import { formatNumber, shortDay } from './signals-data'

const percent = (value: number | null, t: T) =>
  value === null ? t('appstat.notApplicable') : `${formatFixed(value, 1)}%`
type Distribution = AppStatisticGrowth['distribution'][number]
type Adoption = { day: string; version: string; copies: number; total: number; share: number | null }

export function AppStatisticGrowthPanels({ report }: { report: AppStatisticPayload }) {
  const t = useT()
  const { lang } = useLanguage()
  const data = report.analytics.desktopGrowth
  if (!data) return null
  const hourly = report.days === '24h' || report.analytics.range.bucket === 'hour'
  const copies = report.view === 'users' || report.view === 'installs'
  const stages = [
    { stage: t('appstat.funnel.copies'), count: data.funnel.copies },
    { stage: t('appstat.funnel.signedIn'), count: data.funnel.signedIn },
    { stage: t('appstat.funnel.opened'), count: data.funnel.opened }
  ].map((row, index, rows) => ({ ...row, previous: index ? rows[index - 1].count : null }))
  const adoption: Adoption[] = data.adoption.flatMap((row) =>
    row.versions.map((version) => ({ day: row.day, total: row.total, ...version }))
  )
  const distributionColumns: SignalColumn<Distribution>[] = [
    {
      key: 'label',
      label: t('appstat.distribution.value'),
      help: t('appstat.distribution.value.help'),
      value: (row) => OS_NAMES[row.label] || row.label
    },
    {
      key: 'count',
      label: data.unit === 'app copies' ? t('appstat.col.copies') : t('appstat.col.downloadRequests'),
      numeric: true,
      help: t('appstat.distribution.count.help'),
      value: (row) => row.count
    },
    {
      key: 'share',
      label: t('appstat.distribution.share'),
      numeric: true,
      help: t('appstat.distribution.share.help'),
      value: (row) => row.share,
      render: (row) => percent(row.share, t)
    }
  ]
  return (
    <>
      {report.view === 'downloads' && (
        <StatisticsNote standalone data-app-download-link-limit>
          {t('appstat.note.downloadLink')}
        </StatisticsNote>
      )}
      {copies && report.activityAvailable && (
        <Card className="signals-panel" data-app-funnel>
          <div className="signals-panel-header">
            <h2>{t('appstat.funnel.title')}</h2>
            <span>{t('appstat.funnel.sub')}</span>
          </div>
          <div className="signals-panel-sub">
            <SignalHoverCard label={t('appstat.funnel.which')} summary={t('appstat.funnel.which.summary')}>
              <p>{t('appstat.funnel.which.body')}</p>
            </SignalHoverCard>
          </div>
          <SignalTable
            id="app-funnel"
            defaultSort="count"
            rows={stages}
            rowKey={(row) => row.stage}
            columns={[
              {
                key: 'stage',
                label: t('appstat.funnel.step'),
                help: t('appstat.funnel.step.help'),
                value: (row) => row.stage
              },
              {
                key: 'count',
                label: t('appstat.col.copies'),
                numeric: true,
                help: t('appstat.funnel.copies.help'),
                value: (row) => row.count,
                render: (row) => row.count ?? t('appstat.unavailable')
              },
              {
                key: 'conversion',
                label: t('appstat.funnel.conversion'),
                numeric: true,
                help: t('appstat.funnel.conversion.help'),
                value: (row) =>
                  row.count !== null && row.previous ? (row.count * 100) / row.previous : null,
                render: (row) =>
                  row.count === null
                    ? t('appstat.unavailable')
                    : percent(row.previous ? (row.count * 100) / row.previous : null, t)
              },
              {
                key: 'dropoff',
                label: t('appstat.funnel.dropoff'),
                numeric: true,
                help: t('appstat.funnel.dropoff.help'),
                value: (row) => {
                  const index = stages.indexOf(row)
                  const next = stages[index + 1]?.count
                  return row.count !== null && next != null ? row.count - next : null
                },
                render: (row) => {
                  const index = stages.indexOf(row)
                  const next = stages[index + 1]?.count
                  return index === stages.length - 1
                    ? t('appstat.notApplicable')
                    : row.count !== null && next != null
                      ? row.count - next
                      : t('appstat.unavailable')
                }
              }
            ]}
          />
          {data.openedCopiesOutsideConnections !== null && (
            <p className="signals-panel-sub">
              {t('appstat.funnel.outside', {
                count: data.openedCopiesOutsideConnections,
                n: formatNumber(data.openedCopiesOutsideConnections)
              })}
            </p>
          )}
        </Card>
      )}
      <div className="app-statistic-breakdowns">
        {(['platform', 'version'] as const).map((dimension) => (
          <Card className="signals-panel" key={dimension} data-app-distribution={dimension}>
            <div className="signals-panel-header">
              <h2>
                {dimension === 'platform' ? t('appstat.breakdown.platform') : t('appstat.breakdown.version')}
              </h2>
              <span>
                {t(data.unit === 'app copies' ? 'appstat.breakdown.copies' : 'appstat.breakdown.requests', {
                  count: data.distributionTotal,
                  n: formatNumber(data.distributionTotal)
                })}
              </span>
            </div>
            <p className="signals-panel-sub">
              {copies ? t('appstat.breakdown.copies.sub') : t('appstat.breakdown.requests.sub')}{' '}
              {t('appstat.breakdown.sub')}
            </p>
            <SignalTable
              id={`app-${dimension}`}
              columns={distributionColumns}
              rows={data.distribution.filter((row) => row.dimension === dimension)}
              defaultSort="count"
              rowKey={(row) => row.label}
            />
          </Card>
        ))}
      </div>
      {copies && (
        <>
          <Card className="signals-panel" data-app-new-copies>
            <div className="signals-panel-header">
              <h2>{hourly ? t('appstat.newCopies.byHour') : t('appstat.newCopies.byDay')}</h2>
              <span>{t('appstat.newCopies.sub')}</span>
            </div>
            <p className="signals-panel-sub">{t('appstat.newCopies.body')}</p>
            <div className="signals-trend">
              <SignalChart
                rows={data.newCopies}
                series={[{ id: 'discord', label: t('appstat.newCopies.col'), metric: (row) => row.copies }]}
                integerAxis
                label={t('appstat.newCopies.chart')}
              />
            </div>
            <SignalTable
              id="app-new-copies"
              rows={data.newCopies}
              rowKey={(row) => row.day}
              defaultSort="day"
              columns={[
                {
                  key: 'day',
                  label: hourly ? t('appstat.col.hour') : t('appstat.col.day'),
                  help: t('appstat.newCopies.day.help'),
                  value: (row) => row.day,
                  render: (row) => (hourly ? shortDay(row.day) : row.day)
                },
                {
                  key: 'copies',
                  label: t('appstat.newCopies.col'),
                  numeric: true,
                  help: t('appstat.newCopies.col.help'),
                  value: (row) => row.copies
                }
              ]}
            />
          </Card>
          {report.activityAvailable && (
            <Card className="signals-panel" data-app-adoption>
              <div className="signals-panel-header">
                <h2>{hourly ? t('appstat.adoption.byHour') : t('appstat.adoption.byDay')}</h2>
                <span>{t('appstat.adoption.sub')}</span>
              </div>
              <p className="signals-panel-sub">{t('appstat.adoption.body')}</p>
              <p className="signals-panel-sub">
                {data.activityCollectionStart
                  ? t('appstat.adoption.firstOpening', {
                      time: appStatisticTime(data.activityCollectionStart, t, lang)
                    })
                  : ''}{' '}
                {t('appstat.adoption.notMeasured')}
              </p>
              <SignalTable
                id="app-adoption"
                rows={adoption}
                rowKey={(row) => `${row.day}-${row.version}`}
                defaultSort="day"
                columns={[
                  {
                    key: 'day',
                    label: hourly ? t('appstat.col.hour') : t('appstat.col.day'),
                    help: t('appstat.adoption.day.help'),
                    value: (row) => row.day,
                    render: (row) => (hourly ? shortDay(row.day) : row.day)
                  },
                  {
                    key: 'version',
                    label: t('appstat.adoption.version'),
                    help: t('appstat.adoption.version.help'),
                    value: (row) => row.version
                  },
                  {
                    key: 'copies',
                    label: t('appstat.adoption.copies'),
                    numeric: true,
                    help: t('appstat.adoption.copies.help'),
                    value: (row) => row.copies
                  },
                  {
                    key: 'total',
                    label: t('appstat.adoption.total'),
                    numeric: true,
                    help: t('appstat.adoption.total.help'),
                    value: (row) => row.total
                  },
                  {
                    key: 'share',
                    label: t('appstat.adoption.share'),
                    numeric: true,
                    help: t('appstat.adoption.share.help'),
                    value: (row) => row.share,
                    render: (row) => percent(row.share, t)
                  }
                ]}
              />
            </Card>
          )}
        </>
      )}
    </>
  )
}
