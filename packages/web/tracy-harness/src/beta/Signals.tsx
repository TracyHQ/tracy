/** Read-only Signals dashboard. Global filters travel in the URL and are applied by the API. */
import { Skeleton } from '@tracy/ui'
import { Activity } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { exactTime } from '../ci-api'
import { formatWith, Trans, tr, useT } from '../i18n'
import type { Customers } from './api'
import { SignalCustomers } from './SignalCustomers'
import { SignalDaily } from './SignalDaily'
import { SignalFilters } from './SignalFilters'
import { SignalGrowth } from './SignalGrowth'
import { SignalKpis } from './SignalKpis'
import { SignalLatest } from './SignalLatest'
import { StatisticsHeader } from './StatisticsHeader'
import { StatisticsNote } from './StatisticsNote'
import { StatisticsEmptyActivity, StatisticsReportStatus } from './StatisticsReportStatus'
import {
  type SignalFilters as Filters,
  readFilters,
  readStatusText,
  readSignalReports,
  type SignalReport,
  saveFilters
} from './signals-data'
import './signals.css'
import './signal-filter-scope.css'

export function Signals({ onOpenWaitlist }: { onOpenWaitlist?: () => void } = {}) {
  const t = useT()
  const [filters, setFilters] = useState(readFilters)
  const [report, setReport] = useState<SignalReport | null>(null)
  const [customers, setCustomers] = useState<Customers | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [filterRevision, setFilterRevision] = useState(0)
  const changeFilters = useCallback((value: Filters) => {
    saveFilters(value)
    setFilterRevision((revision) => revision + 1)
    setFilters(value)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void readSignalReports(filters, controller.signal).then(([signals, people]) => {
      if (controller.signal.aborted) return
      if (signals.ok) {
        setReport(signals.body)
        setError(null)
      } else {
        setReport(null)

        setError(tr('beta.signals.readFailed', { status: readStatusText(tr, signals.status) }))
      }
      if (people.ok) {
        setCustomers(people.body)
        setCustomerError(null)
      } else {
        setCustomers(null)

        setCustomerError(tr('beta.signals.customersFailed', { status: readStatusText(tr, people.status) }))
      }
      setLoading(false)
    })
    return () => controller.abort()
  }, [filters, reload])
  useEffect(() => {
    const read = () => {
      const next = readFilters()
      setFilters((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
    }
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [])
  return (
    <div className="signals-screen" data-signals-screen>
      <StatisticsHeader
        title={t('beta.nav.signals')}
        description={t('beta.signals.description')}
        icon={Activity}
        tone="growth"
      />
      <SignalFilters
        value={filters}
        report={report}
        loading={loading}
        onChange={changeFilters}
        onReload={() => setReload((value) => value + 1)}
      />
      {!report && error ? (
        <StatisticsReportStatus onRetry={() => setReload((value) => value + 1)}>
          {error}
        </StatisticsReportStatus>
      ) : !report ? (
        <div className="signals-content" aria-label={t('beta.signals.loadingAria')}>
          <div className="signals-kpis">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-64" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="signals-content" aria-busy={loading}>
          {loading ? (
            <div className="signals-loading" role="status">
              {t('beta.signals.readingUpdated')}
            </div>
          ) : (
            <>
              {['newUsers', 'created', 'imported', 'waitlist', 'stuck', 'discordLinked', 'discordBugs'].every(
                (key) => report.totals[key as keyof typeof report.totals] === 0
              ) && <StatisticsEmptyActivity days={filters.days} />}
              {filters.days === 'all' && (
                <StatisticsNote standalone>{t('beta.signals.allTimeNote')}</StatisticsNote>
              )}
              <SignalKpis
                report={report}
                filters={filters}
                compare={filters.compare && filters.days !== 'all'}
                onOpenWaitlist={onOpenWaitlist}
              />
              <SignalDaily
                report={report}
                filters={filters}
                compare={filters.compare && filters.days !== 'all'}
              />
            </>
          )}
          {customerError ? (
            <StatisticsReportStatus onRetry={() => setReload((value) => value + 1)}>
              {customerError}
            </StatisticsReportStatus>
          ) : (
            <SignalCustomers
              key={`customers-${JSON.stringify(filters)}-${filterRevision}`}
              customers={customers}
              error={customerError}
              loading={loading}
            />
          )}
          {!loading && (
            <SignalLatest key={`latest-${JSON.stringify(filters)}`} report={report} loading={loading} />
          )}
          {!loading && customers && (
            <SignalGrowth key={JSON.stringify(filters)} growth={customers.growth} readAt={customers.readAt} />
          )}
          <p className="signals-read-at" role="status">
            <Trans
              i18nKey="beta.signals.updatedAt"
              values={{
                time: formatWith(report.readAt, {
                  timeZone: 'Asia/Ho_Chi_Minh',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                })
              }}
              components={{ time: <time dateTime={report.readAt} title={exactTime(report.readAt)} /> }}
            />
          </p>
        </div>
      )}
    </div>
  )
}
