/** Growth-facing request value, feedback and Add site activity; customer text remains permission-gated. */
import { Skeleton } from '@tracy/ui'
import { ChartColumn } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { type T, Trans, useT } from '../i18n'
import { StatisticsHeader } from './StatisticsHeader'
import { StatisticsNote } from './StatisticsNote'
import { StatisticsReportStatus } from './StatisticsReportStatus'
import { counted, exactText, relativeText } from './strings'
import { UsageCms, UsageDetails } from './UsageBreakdown'
import { UsageCustomers } from './UsageCustomers'
import { UsageFilters } from './UsageFilters'
import { UsageFunnel } from './UsageFunnel'
import { UsageDaily, UsageOverview } from './UsageOverview'
import { UsageSample } from './UsageSample'
import { UsageTokenCms } from './UsageTokenCms'
import { UsageResearch } from './UsageResearch'
import { UsageTokenCustomers } from './UsageTokenCustomers'
import { UsageTokenKpis, UsageTokenTrend } from './UsageTokens'
import {
  createUsageReader,
  type UsageFilters as Filters,
  type Usage as UsageBody,
  usageQuery
} from './usage-api'
import { readUsageFilters } from './usage-data'
import './signals.css'
import './usage.css'

/** "3 whole-site restores out of 5 recorded site undos": each count picks its own plural. */
const siteUndo = (t: T, key: string, part: number, body: UsageBody) =>
  t('beta.usage.siteUndos.outOf', {
    part: t(key, counted(part)),
    total: t('beta.usage.siteUndos.total', counted(body.siteUndos.restores + body.siteUndos.rowReverts))
  })

export function Usage() {
  const t = useT()
  const [reader] = useState(createUsageReader)
  const [filters, setFilters] = useState(readUsageFilters)
  const [body, setBody] = useState<UsageBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const update = (next: Filters) => {
    reader.cancel()
    const url = new URL(window.location.href)
    for (const key of ['days', 'start', 'end', 'cms', 'audience', 'demo', 'compare'])
      url.searchParams.delete(key)
    new URLSearchParams(usageQuery(next)).forEach((value, key) => url.searchParams.set(key, value))
    for (const key of url.searchParams.keys())
      if (key.startsWith('signals_usage-') && key.endsWith('_page')) url.searchParams.set(key, '1')
    window.history.pushState(null, '', url)
    setFilters(next)
  }
  useEffect(() => {
    const pop = () => {
      reader.cancel()
      setFilters(readUsageFilters())
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [reader])
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    setBody(null)
    const answer = await reader.read(filters)
    if (!answer) return
    setLoading(false)
    if (answer.ok) setBody(answer.body)
    else {
      setError(answer.status)
    }
  }, [filters, reader])
  useEffect(() => {
    void load()
    return () => reader.cancel()
  }, [load, reader])
  return (
    <div className="signals-screen usage-screen" data-usage-screen>
      <StatisticsHeader
        title={t('beta.nav.usage')}
        description={t('beta.usage.description')}
        icon={ChartColumn}
        tone="usage"
      >
        {body && (
          <span className="usage-updated" title={exactText(t, body.readAt)}>
            <Trans
              i18nKey="beta.usage.updated"
              components={{ time: <time dateTime={body.readAt}>{relativeText(t, body.readAt)}</time> }}
            />
          </span>
        )}
      </StatisticsHeader>
      <UsageFilters
        value={filters}
        body={body}
        loading={loading}
        onChange={update}
        onReload={() => void load()}
      />
      {error ? (
        <StatisticsReportStatus onRetry={() => void load()}>
          {t('beta.usage.loadFailed', { status: error })}
        </StatisticsReportStatus>
      ) : loading || !body ? (
        <div className="usage-loading">
          <Skeleton className="h-36" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="usage-content">
          {body.turns.all.turns === 0 && (
            <StatisticsNote standalone data-report-empty>
              {t(
                filters.days === '24h'
                  ? 'beta.usage.empty.day'
                  : filters.days === 'all'
                    ? 'beta.usage.empty.all'
                    : 'beta.usage.empty.period'
              )}
            </StatisticsNote>
          )}
          {body.limitations?.messages?.map((message) => (
            <StatisticsNote standalone key={message}>
              {message}
            </StatisticsNote>
          ))}
          {((body.limitations?.unknownRequestClassification || 0) > 0 ||
            (body.limitations?.unknownSiteClassification || 0) > 0) && (
            <StatisticsNote standalone>
              {t(
                filters.demo === 'include'
                  ? 'beta.usage.unclassified.noStatus'
                  : 'beta.usage.unclassified.excluded',
                {
                  requests: t(
                    'beta.usage.unclassified.requests',
                    counted(body.limitations?.unknownRequestClassification || 0)
                  ),
                  sites: t(
                    'beta.usage.unclassified.sites',
                    counted(body.limitations?.unknownSiteClassification || 0)
                  )
                }
              )}
            </StatisticsNote>
          )}
          {(body.limitations?.excludedLegacyTimings || 0) > 0 && (
            <StatisticsNote standalone>
              {t('beta.usage.legacyTimings', counted(body.limitations?.excludedLegacyTimings || 0))}
            </StatisticsNote>
          )}
          {filters.days === 'all' && (
            <StatisticsNote standalone>{t('beta.usage.allTimeNote')}</StatisticsNote>
          )}
          <UsageOverview body={body} filters={filters} />
          <UsageTokenKpis body={body} filters={filters} />
          <UsageTokenTrend body={body} compare={filters.compare && filters.days !== 'all'} />
          <UsageTokenCustomers body={body} />
          <UsageTokenCms body={body} cms={filters.cms} />
          <UsageResearch body={body} />
          <UsageDaily body={body} compare={filters.compare && filters.days !== 'all'} />
          <UsageCms body={body} cms={filters.cms} />
          <UsageCustomers body={body} />
          <UsageFunnel body={body} cms={filters.cms} compare={filters.compare && filters.days !== 'all'} />
          <UsageDetails body={body} cms={filters.cms} />
          <p className="usage-site-undos" data-usage-site-undos title={t('beta.usage.siteUndos.help')}>
            {t('beta.usage.siteUndos.text', {
              restores: siteUndo(t, 'beta.usage.siteUndos.restores', body.siteUndos.restores, body),
              reverts: siteUndo(t, 'beta.usage.siteUndos.reverts', body.siteUndos.rowReverts, body)
            })}
          </p>
          {body.canReadText && <UsageSample filters={filters} />}
        </div>
      )}
    </div>
  )
}
