import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@tracy/ui'
import { ChevronDown, X } from 'lucide-react'
import { formatNumber, useT } from '../i18n/index.ts'
import './statistics-filters.css'

export interface StatisticsFilterOption {
  value: string
  label: string
  count?: number
}

/** The Templates Management picker primitives, shared by the four statistics pages. */
export function StatisticsFilter({
  label,
  value,
  emptyLabel,
  defaultValue = '',
  help,
  options,
  onChange
}: {
  label: string
  value: string
  emptyLabel: string
  defaultValue?: string
  help?: string
  options: StatisticsFilterOption[]
  onChange: (value: string) => void
}) {
  const t = useT()
  const active = value !== defaultValue
  const current = options.find((option) => option.value === value)
  return (
    <div className="statistics-filter" data-statistics-filter={label} data-active={active}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button type="button" className="statistics-filter-trigger" />}
          aria-label={label}
          title={help}
        >
          {active && <span className="statistics-filter-name">{label}</span>}
          <span className="statistics-filter-value">{current?.label || (value ? value : emptyLabel)}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="statistics-filter-menu min-w-48">
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={value === option.value}
              data-filter-value={option.value}
              onCheckedChange={() => onChange(option.value)}
            >
              <span>{option.label}</span>
              {option.count !== undefined && (
                <span className="statistics-filter-count">{formatNumber(option.count)}</span>
              )}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {active && (
        <button
          type="button"
          className="statistics-filter-clear"
          aria-label={t('appstat.filter.clear', { label })}
          title={t('appstat.filter.clear', { label })}
          onClick={() => onChange(defaultValue)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
