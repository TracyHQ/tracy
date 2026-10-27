import { Button, Input } from '@tracy/ui'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { StatisticsFilter } from './StatisticsFilter'
import { shortDay, vnToday } from './signals-data'
import type { UsageFilters as Filters, Usage } from './usage-api'
import { CMS_PLATFORMS, cmsLabel, USAGE_DEFAULTS } from './usage-data'

export function UsageFilters({
  value,
  body,
  loading,
  onChange,
  onReload
}: {
  value: Filters
  body: Usage | null
  loading: boolean
  onChange: (filters: Filters) => void
  onReload: () => void
}) {
  const t = useT()
  const [custom, setCustom] = useState(value.days === 'custom')
  const [start, setStart] = useState(value.start)
  const [end, setEnd] = useState(value.end)
  const [error, setError] = useState(false)
  useEffect(() => {
    setCustom(value.days === 'custom')
    setStart(value.start)
    setEnd(value.end)
    setError(false)
  }, [value.days, value.start, value.end])
  const today = vnToday()
  return (
    <div className="signals-filters" aria-label={t('beta.usage.filters.global')} data-usage-filters>
      <div className="signals-filter-top">
        <div className="signals-segment" role="group" aria-label={t('beta.usage.filters.period')}>
          {['24h', '7', '14', '30', 'all', 'custom'].map((days) => (
            <button
              key={days}
              type="button"
              data-usage-window={days}
              aria-pressed={custom ? days === 'custom' : value.days === days}
              onClick={() => {
                setError(false)
                setCustom(days === 'custom')
                if (days !== 'custom') onChange({ ...value, days, start: '', end: '' })
                else {
                  setStart(value.start || body?.range?.start || '')
                  setEnd(value.end || body?.range?.end || '')
                }
              }}
            >
              {days === '24h'
                ? '24h'
                : days === 'all'
                  ? t('beta.usage.filters.allTime')
                  : days === 'custom'
                    ? t('beta.usage.filters.custom')
                    : t('beta.common.days', { count: Number(days) })}
            </button>
          ))}
        </div>
        <label className="signals-check">
          <input
            type="checkbox"
            checked={value.compare && value.days !== 'all'}
            disabled={value.days === 'all'}
            onChange={(event) => onChange({ ...value, compare: event.target.checked })}
          />
          {t('beta.usage.filters.compare')}
        </label>
        <span className="signals-range">
          {body?.range
            ? (body.range.preset || value.days) === '24h'
              ? `${t('beta.usage.filters.last24')} · ${t('beta.usage.filters.range', { start: shortDay(body.range.startAt || body.range.start, t('beta.common.notRecorded')), end: shortDay(body.range.endAt || body.range.end) })} · UTC+7`
              : (body.range.preset || value.days) === 'all'
                ? `${t('beta.usage.scope.allTime')} · UTC+7`
                : `${t('beta.usage.filters.range', { start: shortDay(body.range.start, t('beta.common.notRecorded')), end: `${shortDay(body.range.end)} ${body.range.end.slice(0, 4)}` })} · UTC+7`
            : loading
              ? t('beta.usage.filters.readingPeriod')
              : ''}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          aria-label={t('beta.usage.filters.refresh')}
          title={t('beta.usage.filters.refresh')}
          onClick={onReload}
        >
          <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
        </Button>
      </div>
      <div className="signals-filter-bottom">
        <StatisticsFilter
          label={t('beta.usage.column.cms')}
          value={value.cms}
          defaultValue="all"
          emptyLabel={t('beta.usage.allPlatforms')}
          help={t('beta.usage.filters.cmsHelp')}
          options={CMS_PLATFORMS.map((key) => ({
            value: key,
            label: cmsLabel(t, key),
            ...(body ? { count: body.turns[key].turns } : {})
          }))}
          onChange={(cms) => onChange({ ...value, cms: cms as Filters['cms'] })}
        />
        <StatisticsFilter
          label={t('beta.usage.filters.people')}
          value={value.audience}
          defaultValue="customers"
          emptyLabel={t('beta.usage.filters.customers')}
          help={t('beta.usage.filters.peopleHelp')}
          options={[
            { value: 'customers', label: t('beta.usage.filters.customers') },
            { value: 'staff', label: t('beta.usage.filters.staff') },
            { value: 'all', label: t('beta.usage.filters.everyone') }
          ]}
          onChange={(audience) => onChange({ ...value, audience: audience as Filters['audience'] })}
        />
        <StatisticsFilter
          label={t('beta.usage.filters.demo')}
          value={value.demo}
          defaultValue="exclude"
          emptyLabel={t('beta.usage.filters.excludeDemos')}
          help={t('beta.usage.filters.demoHelp')}
          options={[
            { value: 'exclude', label: t('beta.usage.filters.excludeDemos') },
            { value: 'include', label: t('beta.usage.filters.includeDemos') },
            { value: 'only', label: t('beta.usage.filters.demosOnly') }
          ]}
          onChange={(demo) => onChange({ ...value, demo: demo as Filters['demo'] })}
        />
        <span className="signals-staff">
          {value.audience === 'customers' && value.demo === 'exclude'
            ? t('beta.usage.filters.staffExcluded')
            : t('beta.usage.filters.customAudience')}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setCustom(false)
            onChange({ ...USAGE_DEFAULTS })
          }}
        >
          {t('beta.usage.filters.reset')}
        </Button>
      </div>
      {custom && (
        <form
          className="signals-custom"
          onSubmit={(event) => {
            event.preventDefault()
            if (
              !start ||
              !end ||
              start > end ||
              end > today ||
              (Date.parse(end) - Date.parse(start)) / 86400000 >= 366
            ) {
              setError(true)
              return
            }
            setError(false)
            onChange({ ...value, days: 'custom', start, end })
          }}
        >
          <Input
            type="date"
            aria-label={t('beta.usage.filters.start')}
            max={end && end < today ? end : today}
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
          />
          <span>{t('beta.usage.filters.to')}</span>
          <Input
            type="date"
            aria-label={t('beta.usage.filters.end')}
            min={start || undefined}
            max={today}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            required
          />
          <Button type="submit" size="sm" variant="outline">
            {t('beta.usage.filters.apply')}
          </Button>
          <span role="status">{error ? t('beta.usage.filters.invalidRange') : ''}</span>
        </form>
      )}
    </div>
  )
}
