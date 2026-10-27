import { cn } from '@tracy/ui'
import { useState } from 'react'
import { type T, useT } from '../i18n'
import type { Day } from './api'
import { formatNumber, shortDay } from './signals-data'

export interface SignalSeries<Row extends { day: string } = Day> {
  id: string
  label: string
  metric: (row: Row) => number | null
  unaffected?: string
}

/** One point's spoken summary: every line's value, the previous period's and its scope note. */
function pointLabel(
  t: T,
  day: string,
  lines: {
    label: string
    value: string
    previous: { day: string; value: string } | null
    unaffected?: string
  }[]
) {
  const parts = lines.map((line) => {
    let text = `${line.label} ${line.value}`
    if (line.previous)
      text += `, ${t('beta.chart.pointPrevious', { day: shortDay(line.previous.day), value: line.previous.value })}`
    return line.unaffected ? `${text} (${line.unaffected})` : text
  })
  return `${shortDay(day)}: ${parts.join('; ')}`
}

export function SignalChart<Row extends { day: string } = Day>({
  rows,
  previous = [],
  metric,
  series,
  large = false,
  integerAxis = false,
  missingLabel,
  label
}: {
  rows: Row[]
  previous?: Row[]
  metric?: (row: Row) => number | null
  series?: SignalSeries<Row>[]
  large?: boolean
  integerAxis?: boolean
  missingLabel?: (row: Row) => string
  label: string
}) {
  const t = useT()
  const [hover, setHover] = useState<number | null>(null)
  const current = [...rows].sort((a, b) => a.day.localeCompare(b.day))
  const prior = [...previous].sort((a, b) => a.day.localeCompare(b.day))
  const compare = prior.length === current.length && prior.length > 0
  const lines = series ?? [
    { id: undefined, label: t('beta.chart.current'), metric: metric ?? (() => 0), unaffected: undefined }
  ]
  const plotted = lines.map((line) => ({
    ...line,
    values: current.map(line.metric),
    previousValues: compare ? prior.map(line.metric) : []
  }))
  const highest = Math.max(
    1,
    ...plotted
      .flatMap((line) => [...line.values, ...line.previousValues])
      .filter((value): value is number => value !== null)
  )
  const max = integerAxis ? Math.max(2, Math.ceil(highest / 2) * 2) : highest
  const width = 600,
    height = large ? 150 : 54,
    padding = large ? 16 : 6
  const x = (index: number) => padding + (index * (width - padding * 2)) / Math.max(1, current.length - 1)
  const y = (value: number) => height - padding - (value * (height - padding * 2)) / max
  const path = (values: (number | null)[]) =>
    values
      .map((value, index) =>
        value === null ? '' : `${index && values[index - 1] !== null ? 'L' : 'M'}${x(index)} ${y(value)}`
      )
      .join(' ')
  const display = (value: number | null, row: Row) =>
    value === null ? (missingLabel ? missingLabel(row) : t('beta.common.notRecorded')) : formatNumber(value)
  const isolated = (values: (number | null)[], point: number) =>
    (point === 0 || values[point - 1] === null) && (point === values.length - 1 || values[point + 1] === null)
  const index = hover !== null && current[hover] ? hover : null
  return (
    <div className={large ? 'signals-chart signals-chart-large' : 'signals-chart'}>
      {large &&
        [0, 0.5, 1].map((fraction) => (
          <span
            key={fraction}
            className="signals-chart-tick"
            aria-hidden="true"
            style={{ top: y(fraction * max) - 4 }}
          >
            {Math.round(fraction * max)}
          </span>
        ))}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            className="signals-gridline"
            x1={padding}
            x2={width - padding}
            y1={y(fraction * max)}
            y2={y(fraction * max)}
          />
        ))}
        {plotted.map((line) => (
          <g
            key={line.id ?? 'metric'}
            data-series={line.id}
            className={line.unaffected ? 'signals-unaffected' : undefined}
          >
            {compare && <path className="signals-ghost" d={path(line.previousValues)} />}
            {compare &&
              prior.map((row, point) =>
                line.previousValues[point] !== null && isolated(line.previousValues, point) ? (
                  <circle
                    key={row.day}
                    className="signals-ghost"
                    cx={x(point)}
                    cy={y(line.previousValues[point] as number)}
                    r={2.5}
                  />
                ) : null
              )}
            <path className="signals-line" d={path(line.values)} />
            {current.map((row, point) =>
              line.values[point] === null ? null : (
                <circle
                  key={row.day}
                  className="signals-chart-dot"
                  cx={x(point)}
                  cy={y(line.values[point] as number)}
                  r={
                    index === point
                      ? 3.5
                      : point === current.length - 1 || isolated(line.values, point)
                        ? 2.5
                        : 0
                  }
                />
              )
            )}
          </g>
        ))}
        {index !== null && (
          <line
            className="signals-hoverline"
            x1={x(index)}
            x2={x(index)}
            y1={padding}
            y2={height - padding}
          />
        )}
        {current.map((row, point) => {
          const left = point === 0 ? 0 : (x(point - 1) + x(point)) / 2
          const right = point === current.length - 1 ? width : (x(point) + x(point + 1)) / 2
          return (
            <rect
              key={row.day}
              className="signals-hit"
              x={left}
              y={0}
              width={right - left}
              height={height}
              tabIndex={large ? 0 : -1}
              role="graphics-symbol"
              aria-label={pointLabel(
                t,
                row.day,
                plotted.map((line) => ({
                  label: line.label,
                  value: display(line.values[point], row),
                  previous: compare
                    ? { day: prior[point].day, value: display(line.previousValues[point], prior[point]) }
                    : null,
                  unaffected: line.unaffected
                }))
              )}
              onPointerEnter={() => setHover(point)}
              onFocus={() => setHover(point)}
              onBlur={() => setHover(null)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setHover(null)
              }}
            />
          )
        })}
      </svg>
      {index !== null && (
        <div
          role="tooltip"
          className="signals-chart-tooltip"
          style={{ left: `${Math.min(60, (index / Math.max(1, current.length - 1)) * 80)}%` }}
        >
          <strong>{shortDay(current[index].day)}</strong>
          {compare && <small>{t('beta.chart.previousDay', { day: shortDay(prior[index].day) })}</small>}
          {plotted.map((line) => (
            <span
              className={cn('signals-tooltip-row', line.unaffected && 'signals-unaffected')}
              data-series={line.id}
              key={line.id ?? 'metric'}
            >
              <i className="signals-dot" aria-hidden="true" />
              <span>{line.label}</span>
              {line.unaffected && <small className="signals-scope-note">{line.unaffected}</small>}
              <strong>{display(line.values[index], current[index])}</strong>
              {compare && (
                <small className="signals-tooltip-previous">
                  {t('beta.chart.versus', { value: display(line.previousValues[index], prior[index]) })}
                </small>
              )}
            </span>
          ))}
        </div>
      )}
      {!current.length && <p className="text-muted-foreground text-xs">{t('beta.chart.empty')}</p>}
      {large && current.length > 0 && (
        <div className="signals-chart-dates">
          <span>{shortDay(current[0].day)}</span>
          <span>{shortDay(current[current.length - 1].day)}</span>
        </div>
      )}
    </div>
  )
}
