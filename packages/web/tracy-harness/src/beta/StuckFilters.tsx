import { Button, Input } from '@tracy/ui'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import type { Stuck } from './api'
import { StatisticsFilter } from './StatisticsFilter'
import {
  type StuckFilters as Filters,
  STUCK_DEFAULTS,
  stuckCms,
  stuckDay,
  stuckOperation,
  stuckRange,
  stuckRangeLabel,
  stuckReason,
  stuckStep
} from './stuck-data'

export function StuckFilters({
  value,
  body,
  loading,
  onChange,
  onReload
}: {
  value: Filters
  body: Stuck | null
  loading: boolean
  onChange: (patch: Partial<Filters>) => void
  onReload: () => void
}) {
  const t = useT()
  const [custom, setCustom] = useState(value.days === 'custom')
  const [start, setStart] = useState(value.start)
  const [end, setEnd] = useState(value.end)
  const [error, setError] = useState('')
  useEffect(() => {
    setCustom(value.days === 'custom')
    setStart(value.start)
    setEnd(value.end)
    setError('')
  }, [value.days, value.start, value.end])
  const readAt = body?.readAt || new Date().toISOString()
  const range = stuckRange(value, readAt)
  const sites = body?.sites || [...(body?.open || []), ...(body?.handledToday || [])]
  const classifications = [...sites, ...(body?.history?.activity || []), ...(body?.history?.episodes || [])]
  const choices = [
    {
      key: 'cms',
      label: t('beta.filters.cms'),
      all: t('beta.stuck.filter.allPlatforms'),
      help: t('beta.stuck.filter.cmsHelp'),
      values: ['joomla', 'wordpress', 'emdash', 'unknown'],
      name: (key: string) => stuckCms(t, key)
    },
    {
      key: 'operation',
      label: t('beta.stuck.filter.setupType'),
      all: t('beta.stuck.filter.allSetupTypes'),
      help: t('beta.stuck.filter.setupTypeHelp'),
      values: ['build', 'import', 'unknown'],
      name: (key: string) => stuckOperation(t, { operation: key })
    },
    {
      key: 'step',
      label: t('beta.stuck.filter.step'),
      all: t('beta.stuck.filter.allSteps'),
      help: t('beta.stuck.filter.stepHelp'),
      values: [...new Set(classifications.map((row) => row.step || 'unknown'))].sort(),
      name: (key: string) => stuckStep(t, key)
    },
    {
      key: 'reason',
      label: t('beta.stuck.filter.reason'),
      all: t('beta.stuck.filter.allReasons'),
      help: t('beta.stuck.filter.reasonHelp'),
      values: [...new Set(classifications.map((row) => row.reason || 'unknown'))].sort(),
      name: (key: string) => stuckReason(t, key)
    }
  ] as const
  return (
    <div className="signals-filters" aria-label={t('beta.stuck.filter.label')}>
      <div className="signals-filter-top">
        <div className="signals-segment" role="group" aria-label={t('beta.stuck.filter.period')}>
          {['24h', '1', '7', '30', 'all', 'custom'].map((days) => (
            <button
              type="button"
              key={days}
              aria-pressed={custom ? days === 'custom' : value.days === days}
              onClick={() => {
                setCustom(days === 'custom')
                setError('')
                if (days !== 'custom') onChange({ days, start: '', end: '' })
                else {
                  setStart(value.start || stuckDay(range.start || Date.parse(readAt)))
                  setEnd(value.end || stuckDay(readAt))
                }
              }}
            >
              {days === '24h'
                ? t('beta.stuck.filter.last24h')
                : days === '1'
                  ? t('beta.stuck.filter.today')
                  : days === 'all'
                    ? t('beta.stuck.filter.allTime')
                    : days === 'custom'
                      ? t('beta.stuck.filter.custom')
                      : t('beta.common.days', { count: Number(days) })}
            </button>
          ))}
        </div>
        <label className="signals-check" title={t('beta.stuck.filter.compareHelp')}>
          <input
            type="checkbox"
            checked={value.compare && value.days !== 'all'}
            disabled={value.days === 'all'}
            onChange={(event) => onChange({ compare: event.target.checked })}
          />
          {t('beta.stuck.filter.compare')}
        </label>
        <span className="signals-range" title={t('beta.stuck.filter.rangeHelp')}>
          {stuckRangeLabel(t, value, readAt)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('beta.stuck.filter.refresh')}
          title={t('beta.stuck.filter.refresh')}
          disabled={loading}
          onClick={onReload}
        >
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
        </Button>
      </div>
      <div className="signals-filter-bottom">
        {choices.map((choice) => (
          <StatisticsFilter
            key={choice.key}
            label={choice.label}
            value={value[choice.key]}
            emptyLabel={choice.all}
            help={`${choice.help} ${t('beta.stuck.filter.countsNote')}`}
            options={[
              { value: '', label: choice.all, ...(body?.open ? { count: body.open.length } : {}) },
              ...[...new Set([...choice.values, ...(value[choice.key] ? [value[choice.key]] : [])])].map(
                (key) => ({
                  value: key,
                  label: choice.name(key),
                  ...(body?.open
                    ? {
                        count: body.open.filter(
                          (site) =>
                            (choice.key === 'cms'
                              ? site.platform || 'unknown'
                              : site[choice.key] || 'unknown') === key
                        ).length
                      }
                    : {})
                })
              )
            ]}
            onChange={(next) => onChange({ [choice.key]: next })}
          />
        ))}
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...STUCK_DEFAULTS })}>
          {t('beta.stuck.filter.reset')}
        </Button>
        <span className="signals-staff" title={t('beta.stuck.filter.accountsHelp')}>
          {t('beta.stuck.filter.accounts')}
        </span>
      </div>
      {custom && (
        <form
          className="signals-custom"
          onSubmit={(event) => {
            event.preventDefault()
            const next = { ...value, days: 'custom', start, end }
            const validation = stuckRange(next, readAt).error
            if (validation) {
              setError(t('beta.stuck.range.invalid'))
              return
            }
            setError('')
            onChange({ days: 'custom', start, end })
          }}
        >
          <Input
            type="date"
            aria-label={t('beta.stuck.filter.startDate')}
            value={start}
            max={end || stuckDay(readAt)}
            required
            onChange={(event) => setStart(event.target.value)}
          />
          <span>{t('beta.stuck.filter.to')}</span>
          <Input
            type="date"
            aria-label={t('beta.stuck.filter.endDate')}
            value={end}
            min={start || undefined}
            max={stuckDay(readAt)}
            required
            onChange={(event) => setEnd(event.target.value)}
          />
          <Button variant="outline" size="sm" type="submit">
            {t('beta.stuck.filter.apply')}
          </Button>
          <span role="status">{error}</span>
        </form>
      )}
    </div>
  )
}
