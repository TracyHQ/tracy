import { Button, Input, Tooltip, TooltipContent, TooltipTrigger } from '@tracy/ui'
import { Info, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type T, useT } from '../i18n'
import type { SourceBucket } from './api'
import { StatisticsFilter } from './StatisticsFilter'
import {
  DEFAULT_FILTERS,
  FILTER_KEYS,
  type FilterKey,
  type SignalFilters as Filters,
  type SignalReport,
  shortDay,
  vnToday
} from './signals-data'
import { sourceLabel } from './strings'

const LABELS: Record<FilterKey, string> = {
  medium: 'beta.filters.channel',
  source: 'beta.filters.source',
  campaign: 'beta.filters.campaign',
  content: 'beta.filters.content',
  cms: 'beta.filters.cms',
  status: 'beta.filters.status'
}
const ALL: Record<FilterKey, string> = {
  medium: 'beta.signals.filters.allChannels',
  source: 'beta.signals.filters.allSources',
  campaign: 'beta.signals.filters.allCampaigns',
  content: 'beta.signals.filters.allVariants',
  cms: 'beta.signals.filters.allCms',
  status: 'beta.signals.filters.allStatuses'
}
const HELP: Record<FilterKey, string> = {
  medium: 'beta.signals.filters.helpChannel',
  source: 'beta.signals.filters.helpSource',
  campaign: 'beta.signals.filters.helpCampaign',
  content: 'beta.signals.filters.helpContent',
  cms: 'beta.signals.filters.helpCms',
  status: 'beta.signals.filters.helpStatus'
}
const FALLBACK = {
  medium: [
    'email',
    'blog',
    'demo',
    'site',
    'forum',
    'product-page',
    'helpdesk',
    'social',
    'video',
    'owned',
    'other',
    'none'
  ],
  source: [],
  campaign: [],
  content: [],
  cms: ['joomla', 'wordpress', 'emdash'],
  status: ['built', 'stuck', 'deleted', 'pending', 'no-site']
}
const PLATFORM_NAMES: Record<string, string> = { wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' }
const OPTION_KEYS: Record<string, string> = {
  none: 'beta.source.none',
  'no-site': 'beta.signals.filters.noSite',
  built: 'beta.signals.state.built',
  stuck: 'beta.signals.state.stuck',
  deleted: 'beta.signals.state.deleted',
  pending: 'beta.signals.state.pending'
}
const isBucket = (value: string): value is SourceBucket =>
  ['email', 'blog', 'demo', 'site', 'forum', 'product-page', 'other', 'none'].includes(value)
const channelLabel = (t: T, value: string) => (isBucket(value) ? sourceLabel(t, value) : value)
const optionLabel = (t: T, value: string) =>
  PLATFORM_NAMES[value] ?? (OPTION_KEYS[value] ? t(OPTION_KEYS[value]) : value)

export function SignalFilters({
  value,
  report,
  loading,
  onChange,
  onReload
}: {
  value: Filters
  report: SignalReport | null
  loading: boolean
  onChange: (value: Filters) => void
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
  const today = vnToday()
  return (
    <div className="signals-filters" aria-label={t('beta.signals.filters.aria')}>
      <div className="signals-filter-top">
        <div className="signals-segment" role="group" aria-label={t('beta.signals.filters.period')}>
          {['24h', '7', '14', '30', 'all', 'custom'].map((days) => (
            <button
              key={days}
              type="button"
              data-signal-window={days}
              aria-pressed={custom ? days === 'custom' : value.days === days}
              onClick={() => {
                setError('')
                setCustom(days === 'custom')
                if (days !== 'custom') onChange({ ...value, days, start: '', end: '' })
                else {
                  setStart(value.start || report?.range.start || '')
                  setEnd(value.end || report?.range.end || '')
                }
              }}
            >
              {days === '24h'
                ? t('beta.signals.filters.last24h')
                : days === 'all'
                  ? t('beta.signals.filters.allTime')
                  : days === 'custom'
                    ? t('beta.signals.filters.custom')
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
          {t('beta.signals.filters.compare')}
        </label>
        <span className="signals-range">
          {report
            ? (report.range.preset || value.days) === '24h'
              ? t('beta.signals.filters.rangeHours', {
                  start: shortDay(report.range.startAt || report.range.start, t('beta.common.notRecorded')),
                  end: shortDay(report.range.endAt || report.range.end)
                })
              : (report.range.preset || value.days) === 'all'
                ? t('beta.signals.filters.rangeAll')
                : t('beta.signals.filters.rangeDays', {
                    start: shortDay(report.range.start, t('beta.common.notRecorded')),
                    end: shortDay(report.range.end),
                    year: report.range.end.slice(0, 4)
                  })
            : loading
              ? t('beta.signals.filters.readingPeriod')
              : ''}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          aria-label={t('beta.signals.filters.refresh')}
          title={t('beta.signals.filters.refresh')}
          onClick={onReload}
        >
          <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
        </Button>
      </div>
      <div className="signals-filter-bottom">
        <Tooltip>
          <TooltipTrigger
            render={<Button size="icon-sm" variant="ghost" />}
            aria-label={t('beta.signals.filters.aboutLinks')}
            aria-describedby="signals-link-filter-info"
          >
            <Info size={14} aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent
            id="signals-link-filter-info"
            role="tooltip"
            className="signals-filter-tooltip text-[13px]"
          >
            {t('beta.signals.filters.aboutLinksBody')}
          </TooltipContent>
        </Tooltip>
        {FILTER_KEYS.map((key) => (
          <StatisticsFilter
            key={key}
            label={t(LABELS[key])}
            value={value[key]}
            emptyLabel={t(ALL[key])}
            help={t(HELP[key])}
            options={[
              {
                value: '',
                label: t(ALL[key]),
                ...(key === 'medium' && !value.medium && report ? { count: report.totals.newUsers } : {})
              },
              ...[
                ...new Set([
                  ...FALLBACK[key],
                  ...(report?.filterOptions[key] || []),
                  ...(value[key] ? [value[key]] : [])
                ])
              ].map((option) => ({
                value: option,
                label: key === 'medium' ? channelLabel(t, option) : optionLabel(t, option),
                ...(key === 'medium' &&
                !value.medium &&
                report?.totals.bySource[option as keyof typeof report.totals.bySource] !== undefined
                  ? { count: report.totals.bySource[option as keyof typeof report.totals.bySource] }
                  : {})
              }))
            ]}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        ))}
        <span className="signals-staff" title={t('beta.signals.filters.staffHelp')}>
          {t('beta.signals.filters.staff')}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setCustom(false)
            setError('')
            onChange({ ...DEFAULT_FILTERS })
          }}
        >
          {t('beta.signals.filters.reset')}
        </Button>
      </div>
      {report?.totals.newUsers === 0 && (
        <p className="signals-filter-empty" role="status">
          {t('beta.signals.filters.noMatch')}
        </p>
      )}
      {custom && (
        <form
          className="signals-custom"
          onSubmit={(event) => {
            event.preventDefault()
            if (!start || !end || start > end || end > today) {
              setError(t('beta.signals.filters.chooseDates'))
              return
            }
            if ((Date.parse(end) - Date.parse(start)) / 86_400_000 >= 366) {
              setError(t('beta.filters.invalidRange'))
              return
            }
            setError('')
            onChange({ ...value, days: 'custom', start, end })
          }}
        >
          <Input
            type="date"
            aria-label={t('beta.signals.filters.startDate')}
            max={end && end < today ? end : today}
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
          />
          <span>{t('beta.signals.filters.to')}</span>
          <Input
            type="date"
            aria-label={t('beta.signals.filters.endDate')}
            min={start || undefined}
            max={today}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            required
          />
          <Button type="submit" size="sm" variant="outline">
            {t('beta.signals.filters.apply')}
          </Button>
          <span role="status">{error}</span>
        </form>
      )}
      <details className="signals-filter-help">
        <summary>{t('beta.signals.filters.howTitle')}</summary>
        <p>{t('beta.signals.filters.howBody')}</p>
      </details>
    </div>
  )
}
