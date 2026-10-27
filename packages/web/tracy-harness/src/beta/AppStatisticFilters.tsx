import { Button, Input } from '@tracy/ui'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLanguage, useT } from '../i18n/index.ts'
import { type AppStatisticPayload, appStatisticFilters } from './app-statistic-api'
import {
  appStatisticDay,
  appStatisticTime,
  dateBasis,
  OS_NAMES,
  releaseTypeLabel
} from './app-statistic-copy'
import { type AppStatisticState, defaultAppStatisticState } from './app-statistic-state'
import { StatisticsFilter } from './StatisticsFilter'

export function AppStatisticFilters({
  value,
  report,
  loading,
  onChange,
  onReload
}: {
  value: AppStatisticState
  report: AppStatisticPayload | null
  loading: boolean
  onChange: (patch: Partial<AppStatisticState>) => void
  onReload: () => void
}) {
  const t = useT()
  const { lang } = useLanguage()
  const time = (value: string) => appStatisticTime(value, t, lang)
  const [custom, setCustom] = useState(value.days === 'custom')
  const [start, setStart] = useState(value.start || '')
  const [end, setEnd] = useState(value.end || '')
  const [error, setError] = useState('')
  useEffect(() => {
    setCustom(value.days === 'custom')
    setStart(value.start || '')
    setEnd(value.end || '')
    setError('')
  }, [value.days, value.start, value.end])
  const today = appStatisticDay(new Date())
  const supported = appStatisticFilters(value.view)
  const options = report?.options
  const distribution = report?.analytics.desktopGrowth
  const range = report?.analytics.range
  const inclusiveEnd = range ? appStatisticDay(Date.parse(range.end) - 1) : today
  const filters = [
    {
      key: 'version',
      label: t('appstat.filter.version'),
      all: t('appstat.filter.version.all'),
      values: options?.versions || [],
      help: t('appstat.filter.version.help')
    },
    {
      key: 'channel',
      label: t('appstat.filter.channel'),
      all: t('appstat.filter.channel.all'),
      values: options?.channels || ['stable', 'dev'],
      help: t('appstat.filter.channel.help')
    },
    {
      key: 'platform',
      label: t('appstat.filter.platform'),
      all: t('appstat.filter.platform.all'),
      values: options?.platforms || ['macos', 'windows', 'linux'],
      help: t('appstat.filter.platform.help')
    },
    {
      key: 'template',
      label: t('appstat.filter.template'),
      all: t('appstat.filter.template.all'),
      values: options?.templates || [],
      help: t('appstat.filter.template.help')
    },
    {
      key: 'source',
      label: value.view === 'downloads' ? t('appstat.source.download') : t('appstat.source.firstSignIn'),
      all: t('appstat.filter.source.all'),
      values: options?.sources || [],
      help:
        value.view === 'downloads'
          ? t('appstat.filter.source.help.download')
          : t('appstat.filter.source.help.firstSignIn')
    }
  ] as const
  return (
    <div className="signals-filters" aria-label={t('appstat.filters')}>
      <div className="signals-filter-top">
        <div className="signals-segment" role="group" aria-label={t('appstat.period')}>
          {['24h', '1', '7', '30', 'all', 'custom'].map((days) => (
            <button
              key={days}
              type="button"
              data-app-window={days}
              aria-pressed={custom ? days === 'custom' : value.days === days}
              onClick={() => {
                setCustom(days === 'custom')
                setError('')
                if (days !== 'custom') onChange({ days, start: '', end: '' })
                else {
                  setStart(
                    value.start ||
                      (report?.analytics.range.start
                        ? appStatisticDay(report.analytics.range.start)
                        : undefined) ||
                      today
                  )
                  setEnd(value.end || inclusiveEnd)
                }
              }}
            >
              {days === '24h'
                ? t('appstat.period.24h')
                : days === 'all'
                  ? t('appstat.period.all')
                  : days === 'custom'
                    ? t('appstat.period.custom')
                    : t('appstat.period.days', { count: Number(days) })}
            </button>
          ))}
        </div>
        <label className="signals-check" title={t('appstat.compare.help')}>
          <input
            type="checkbox"
            checked={value.compare && value.days !== 'all'}
            disabled={value.days === 'all'}
            onChange={(event) => onChange({ compare: event.target.checked })}
          />
          {t('appstat.compare')}
        </label>
        <span
          className="signals-range"
          title={
            range
              ? t('appstat.range.exact', {
                  start: range.start ? time(range.start) : t('appstat.range.allRecorded'),
                  end: time(range.end)
                })
              : undefined
          }
        >
          {report
            ? value.days === '24h'
              ? t('appstat.range.last24h', { start: time(range!.start!), end: time(range!.end) })
              : t('appstat.range.days', {
                  start: report.analytics.range.start
                    ? appStatisticDay(report.analytics.range.start)
                    : t('appstat.range.allRecorded'),
                  end: value.days === 'custom' ? (value.end ?? '') : inclusiveEnd
                })
            : loading
              ? t('appstat.range.reading')
              : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          aria-label={t('appstat.refresh')}
          title={t('appstat.refresh')}
          onClick={onReload}
        >
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
        </Button>
      </div>
      <div className="signals-filter-bottom">
        {filters
          .filter(
            (filter) =>
              supported.includes(filter.key) && !(value.view === 'installs' && filter.key === 'source')
          )
          .map((filter) => (
            <StatisticsFilter
              key={filter.key}
              label={filter.label}
              value={value[filter.key]}
              emptyLabel={filter.all}
              help={
                distribution && !value[filter.key] && (filter.key === 'version' || filter.key === 'platform')
                  ? `${filter.help} ${t(distribution.unit === 'app copies' ? 'appstat.filter.countsCopies' : 'appstat.filter.countsRequests')}`
                  : filter.help
              }
              options={[
                {
                  value: '',
                  label: filter.all,
                  ...(distribution &&
                  !value[filter.key] &&
                  (filter.key === 'version' || filter.key === 'platform')
                    ? { count: distribution.distributionTotal }
                    : {})
                },
                ...[...new Set([...filter.values, ...(value[filter.key] ? [value[filter.key]] : [])])].map(
                  (option) => ({
                    value: option,
                    ...(distribution &&
                    !value[filter.key] &&
                    (filter.key === 'version' || filter.key === 'platform')
                      ? {
                          count:
                            distribution.distribution.find(
                              (row) => row.dimension === filter.key && row.label === option
                            )?.count ?? 0
                        }
                      : {}),
                    label:
                      option === 'unknown'
                        ? t('appstat.notRecorded')
                        : (OS_NAMES[option] ?? releaseTypeLabel(option, t))
                  })
                )
              ]}
              onChange={(next) => onChange({ [filter.key]: next })}
            />
          ))}
        {supported.includes('account') && (
          <StatisticsFilter
            label={t('appstat.account')}
            value={value.account}
            defaultValue="all"
            emptyLabel={t('appstat.account.all')}
            help={t('appstat.account.help')}
            options={[
              { value: 'all', label: t('appstat.account.all') },
              { value: 'linked', label: t('appstat.account.linked') },
              { value: 'unlinked', label: t('appstat.account.unlinked') }
            ]}
            onChange={(account) => onChange({ account })}
          />
        )}
        {supported.includes('attention') && (
          <label className="signals-check" title={t('appstat.attention.help')}>
            <input
              type="checkbox"
              checked={value.attention}
              onChange={(event) => onChange({ attention: event.target.checked })}
            />
            {t('appstat.attention')}
          </label>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...defaultAppStatisticState, view: value.view })}
        >
          {t('appstat.reset')}
        </Button>
      </div>
      {custom && (
        <form
          className="signals-custom"
          onSubmit={(event) => {
            event.preventDefault()
            if (!start || !end || start > end || end > today) return setError(t('appstat.custom.invalid'))
            if ((Date.parse(end) - Date.parse(start)) / 86400000 >= 366)
              return setError(t('appstat.custom.tooLong'))
            setError('')
            onChange({ days: 'custom', start, end })
          }}
        >
          <Input
            type="date"
            aria-label={t('appstat.custom.start')}
            value={start}
            max={end || today}
            required
            onChange={(event) => setStart(event.target.value)}
          />
          <span>{t('appstat.custom.to')}</span>
          <Input
            type="date"
            aria-label={t('appstat.custom.end')}
            value={end}
            min={start || undefined}
            max={today}
            required
            onChange={(event) => setEnd(event.target.value)}
          />
          <Button type="submit" variant="outline" size="sm">
            {t('appstat.custom.apply')}
          </Button>
          <span role="status">{error}</span>
        </form>
      )}
      <details className="signals-filter-help">
        <summary>{t('appstat.howFilters')}</summary>
        <p>{t('appstat.howFilters.body', { basis: dateBasis(value.view, t) })}</p>
        <p>
          {value.view === 'installs'
            ? t('appstat.howFilters.installs')
            : value.view === 'quickstarts'
              ? t('appstat.howFilters.quickstarts')
              : value.view === 'users'
                ? t('appstat.howFilters.users')
                : t('appstat.howFilters.downloads')}
        </p>
      </details>
    </div>
  )
}
