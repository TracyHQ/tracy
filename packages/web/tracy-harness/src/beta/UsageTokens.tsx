import { Card } from '@tracy/ui'
import { useT } from '../i18n'
import { SignalChart } from './SignalChart'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsKpi } from './StatisticsKpi'
import { shortDay } from './signals-data'
import type { TokenFigures, Usage, UsageDay, UsageFilters } from './usage-api'
import {
  TokenValue,
  tokenCoverageLabel,
  tokenDefinition,
  tokenMedianHelp,
  tokenMissing
} from './usage-tokens'

/** The zone every day and hour on this screen is counted in. */
const TIME_ZONE = 'UTC+7'

const emptyTokens = (requests: number): TokenFigures => ({
  total: null,
  requests,
  measuredRequests: 0,
  partialRequests: 0,
  perRequest: { n: 0, median: null, p90: null }
})

export function UsageTokenKpis({ body, filters }: { body: Usage; filters: UsageFilters }) {
  const t = useT()
  const tokens = body.turns.all.tokens ?? emptyTokens(body.turns.all.turns)
  const previous = filters.compare && filters.days !== 'all' ? body.previous?.turns.all.tokens : undefined
  const missing = !!tokens.requests && !tokens.measuredRequests
  const label = !tokens.requests
    ? t('beta.usage.tokens.notUsed')
    : missing
      ? t('beta.common.notRecorded')
      : undefined
  const inProgress = body.range?.partialEnd ? t('beta.usage.periodInProgress') : undefined
  return (
    <div className="signals-kpis usage-token-kpis">
      <StatisticsKpi
        label={t('beta.usage.tokens.used')}
        value={tokens.total ?? 0}
        valueLabel={label}
        valueTitle={missing ? tokenMissing(t) : undefined}
        className={missing ? 'usage-token-missing' : undefined}
        previous={tokens.total !== null && previous?.total != null ? previous.total : undefined}
        unit={t('beta.usage.unit.tokens', { count: tokens.total ?? 0 })}
        definition={tokenDefinition(t)}
        note={tokenCoverageLabel(t, tokens)}
        rows={[]}
        metric={() => 0}
        showTrend={false}
        comparisonNeutral
        comparisonLabel={inProgress}
        scope={filters.days === 'all' ? t('beta.usage.scope.allTime') : t('beta.usage.scope.allFilters')}
        trendLabel={t('beta.usage.trend.daily')}
      />
      <StatisticsKpi
        label={t('beta.usage.tokens.perRequest')}
        value={tokens.perRequest.median ?? 0}
        valueLabel={label ?? (tokens.perRequest.median === null ? t('beta.usage.time.notEnough') : undefined)}
        valueTitle={missing ? tokenMissing(t) : tokenMedianHelp(t)}
        className={missing ? 'usage-token-missing' : undefined}
        previous={
          tokens.perRequest.median !== null && previous?.perRequest.median != null
            ? previous.perRequest.median
            : undefined
        }
        unit={t('beta.usage.unit.tokens', { count: tokens.perRequest.median ?? 0 })}
        definition={`${tokenDefinition(t)} ${tokenMedianHelp(t)}`}
        note={tokenCoverageLabel(t, tokens)}
        rows={[]}
        metric={() => 0}
        showTrend={false}
        comparisonNeutral
        scope={t('beta.usage.tokens.medianScope')}
        trendLabel={t('beta.usage.trend.daily')}
      />
    </div>
  )
}

export function UsageTokenTrend({ body, compare }: { body: Usage; compare: boolean }) {
  const t = useT()
  const rows = body.daily || []
  const hourly = body.range?.bucket === 'hour'
  const coverage = (row: UsageDay) =>
    row.tokenCoverage ?? { requests: row.requests, measuredRequests: 0, partialRequests: 0 }
  const columns: SignalColumn<UsageDay>[] = [
    {
      key: 'day',
      label: hourly ? t('beta.usage.column.hour') : t('beta.usage.column.day'),
      help: t('beta.usage.tokens.dayHelp'),
      value: (row) => row.day,
      render: (row) => <span title={row.day}>{shortDay(row.day)}</span>
    },
    {
      key: 'tokens',
      label: t('beta.usage.column.tokens'),
      help: tokenDefinition(t),
      numeric: true,
      value: (row) => row.tokens ?? null,
      render: (row) => <TokenValue value={row.tokens ?? null} requests={row.requests} />
    },
    {
      key: 'measured',
      label: t('beta.usage.column.coverage'),
      help: t('beta.usage.tokens.coverageHelp'),
      value: (row) => coverage(row).measuredRequests,
      render: (row) => tokenCoverageLabel(t, coverage(row))
    }
  ]
  return (
    <Card className="signals-panel" data-usage-block="tokens-daily">
      <div className="signals-panel-header">
        <h2>{t('beta.usage.tokens.overTime')}</h2>
        <span>{TIME_ZONE}</span>
      </div>
      <p className="signals-panel-sub" title={tokenDefinition(t)}>
        {t(hourly ? 'beta.usage.tokens.trendSubHour' : 'beta.usage.tokens.trendSubDay')}
      </p>
      {body.turns.all.turns === 0 ? (
        <p className="signals-empty">{t('beta.usage.tokens.noRequests')}</p>
      ) : (
        <>
          <div className="signals-trend">
            <SignalChart
              rows={rows}
              previous={compare ? body.previousDaily || [] : []}
              metric={(row) => row.tokens ?? null}
              large
              integerAxis
              label={t('beta.usage.tokens.overTime')}
              missingLabel={(row) =>
                row.requests ? t('beta.common.notRecorded') : t('beta.usage.tokens.notUsed')
              }
            />
          </div>
          <SignalTable
            id="usage-tokens-daily"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.day}
            defaultSort="day"
            search={{
              label: t('beta.usage.tokens.searchDates'),
              match: (row) => `${row.day} ${shortDay(row.day)}`
            }}
          />
        </>
      )}
    </Card>
  )
}
