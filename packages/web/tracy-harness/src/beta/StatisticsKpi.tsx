/**
 * Shared statistics tile; Signals and Desktop App Statistics use the same markup and styles. `unit`
 * comes translated and already in the plural form the value needs (`t(key, { count: value })`).
 */
import { Card, cn } from '@tracy/ui'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { useT } from '../i18n/index.ts'
import { SignalChart } from './SignalChart'
import { formatNumber } from './signals-data'

export function StatisticsKpi<Row extends { day: string }>({
  label,
  value,
  valueLabel,
  valueTitle,
  previous,
  unit,
  definition,
  note,
  rows,
  previousRows = [],
  metric,
  series,
  goodWhenUp = true,
  scope,
  attention,
  children,
  className,
  trendLabel,
  showTrend = true,
  comparisonNeutral = false,
  comparisonLabel
}: {
  label: string
  value: number
  valueLabel?: string
  valueTitle?: string
  previous?: number
  unit: string
  definition: string
  note: string
  rows: Row[]
  previousRows?: Row[]
  metric: (row: Row) => number
  series?: string
  goodWhenUp?: boolean
  scope?: ReactNode
  attention?: 'negative' | 'warning' | null
  children?: ReactNode
  className?: string
  showTrend?: boolean
  trendLabel?: string
  comparisonNeutral?: boolean
  comparisonLabel?: string
}) {
  const t = useT()
  const delta = value - (previous ?? value)
  const tone =
    comparisonNeutral || delta === 0 ? 'neutral' : delta > 0 === goodWhenUp ? 'positive' : 'negative'
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : ArrowRight
  const displayLabel = valueLabel || (value === 0 && unit ? t('appstat.kpi.zero', { unit }) : undefined)
  return (
    <Card className={cn('signals-kpi', className)} data-signal-tile={label} data-series={series}>
      <div className="signals-kpi-heading">
        <span className="signals-kpi-label" title={definition} tabIndex={0}>
          <i className="signals-dot" aria-hidden="true" />
          {label}
        </span>
        {attention && (
          <span className="signals-attention" data-tone={attention}>
            <i className="signals-dot" aria-hidden="true" />
            {t('appstat.kpi.attention')}
          </span>
        )}
      </div>
      <div
        className={cn('signals-kpi-number', displayLabel && 'signals-kpi-number-label')}
        title={valueTitle || definition}
      >
        {displayLabel || formatNumber(value)}
        {!displayLabel && <small>{unit}</small>}
      </div>
      {previous !== undefined && (
        <div className="signals-delta">
          <b
            className="signals-delta-chip"
            data-tone={tone}
            aria-label={`${t(`appstat.kpi.delta.${delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'}`, {
              n: formatNumber(Math.abs(delta))
            })}; ${t(`appstat.kpi.tone.${tone}`)}`}
          >
            <DeltaIcon size={12} aria-hidden="true" />
            {delta > 0 ? '+' : ''}
            {formatNumber(delta)}
          </b>
          <span>{t('appstat.kpi.previous', { n: formatNumber(previous) })}</span>
          {comparisonLabel && <span className="signals-comparison-note">{comparisonLabel}</span>}
        </div>
      )}
      <p className="signals-kpi-note">{note}</p>
      {showTrend && (
        <div className="signals-kpi-chart">
          <span>{trendLabel ?? t('appstat.kpi.trend')}</span>
          <SignalChart
            rows={rows}
            previous={previousRows}
            metric={metric}
            label={t('appstat.kpi.trendOf', { label })}
          />
        </div>
      )}
      {children}
      <span className="signals-kpi-scope">{scope ?? t('appstat.kpi.scope')}</span>
    </Card>
  )
}
