/** Current support queue and recorded setup history; no request or chat text is read here. */
import { Button, Skeleton } from '@tracy/ui'
import { LifeBuoy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type T, useT } from '../i18n'
import { fetchStuck, pressHandled, type Stuck as StuckBody, type StuckSite } from './api'
import { StatisticsHeader } from './StatisticsHeader'
import { StatisticsNote } from './StatisticsNote'
import { StatisticsEmptyActivity, StatisticsReportStatus } from './StatisticsReportStatus'
import { StuckCases, StuckTime } from './StuckCases'
import { StuckFilters } from './StuckFilters'
import { StuckBreakdown, StuckHistory, StuckOverview } from './StuckOverview'
import { counted } from './strings'
import {
  buildStuckView,
  type StuckFilters as Filters,
  readStuckFilters,
  saveStuckFilters
} from './stuck-data'
import './signals.css'
import './stuck.css'

/** The door's refusal codes; an unknown code shows as itself. */
function refusedText(t: T, code: string) {
  if (code === 'NOT_OPEN') return t('beta.stuck.refused.notOpen')
  if (code === 'NOT_HANDLED') return t('beta.stuck.refused.notHandled')
  return t('beta.stuck.refused.other', { code })
}

export function Stuck({ onCount }: { onCount?: (n: number | null) => void }) {
  const t = useT()
  const sequence = useRef(0)
  const [filters, setFilters] = useState(readStuckFilters)
  const [body, setBody] = useState<StuckBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pressing, setPressing] = useState<string | null>(null)
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const revision = ++sequence.current
      setLoading(true)

      const query = new URLSearchParams()
      if (filters.days === 'custom') {
        query.set('start', filters.start)
        query.set('end', filters.end)
      } else query.set('days', filters.days)
      query.set('compare', filters.compare ? '1' : '0')
      const answer = await fetchStuck(signal, query.toString())
      if (signal?.aborted || revision !== sequence.current) return
      setLoading(false)
      if (answer.ok) {
        setBody(answer.body)
        setError(null)
        onCount?.(answer.body.count)
      } else {
        setBody(null)

        setError(t('beta.stuck.loadFailed', { status: answer.status }))
        onCount?.(null)
      }
    },
    [onCount, filters.days, filters.start, filters.end, filters.compare]
  )
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const interval = setInterval(() => {
      if (!document.hidden) void load(controller.signal)
    }, 30000)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [load])
  useEffect(() => {
    const read = () => setFilters(readStuckFilters())
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [])
  const change = (patch: Partial<Filters>) =>
    setFilters((current) => {
      const next = { ...current, ...patch }
      saveStuckFilters(next)
      return next
    })
  const press = async (row: StuckSite, reopen: boolean) => {
    setActionError(null)
    setPressing(row.siteKey)
    const result = await pressHandled(row.siteKey, reopen)
    await load()
    if (!result.ok) setActionError(refusedText(t, result.code))
    setPressing(null)
  }
  const view = body ? buildStuckView(body, filters) : null
  return (
    <main className="signals-screen stuck-screen" data-stuck-screen>
      <StatisticsHeader
        title={t('beta.stuck.title')}
        description={t('beta.stuck.description')}
        icon={LifeBuoy}
        tone="stuck"
      />
      <StuckFilters
        value={filters}
        body={body}
        loading={loading}
        onChange={change}
        onReload={() => void load()}
      />
      <div className="signals-content" aria-busy={loading}>
        {error && <StatisticsReportStatus onRetry={() => void load()}>{error}</StatisticsReportStatus>}
        {actionError && (
          <p className="text-destructive" role="alert" data-stuck-error>
            {actionError}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActionError(null)
                void load()
              }}
            >
              {t('beta.stuck.tryAgain')}
            </Button>
          </p>
        )}
        {body && view ? (
          <>
            {view.history && view.history.active === 0 && view.history.recovered === 0 && (
              <StatisticsEmptyActivity days={filters.days} activity={t('beta.stuck.setupActivity')} />
            )}
            {filters.days === 'all' && (
              <StatisticsNote standalone>{t('beta.stuck.allTimeNote')}</StatisticsNote>
            )}
            <StuckOverview body={body} view={view} />
            <section aria-label={t('beta.stuck.cases.title')}>
              <div className="stuck-case-heading">
                <div>
                  <h2>{t('beta.stuck.cases.title')}</h2>
                  <p title={t('beta.stuck.cases.closesWhen')}>{t('beta.stuck.cases.intro')}</p>
                </div>
                <div className="signals-segment" role="group" aria-label={t('beta.stuck.cases.status')}>
                  <button
                    type="button"
                    data-stuck-tab="open"
                    aria-pressed={filters.view === 'open'}
                    onClick={() => change({ view: 'open' })}
                  >
                    {t('beta.stuck.cases.needsHelp')} <span>{view.open.length}</span>
                  </button>
                  <button
                    type="button"
                    data-stuck-tab="closed"
                    aria-pressed={filters.view === 'closed'}
                    onClick={() => change({ view: 'closed' })}
                  >
                    {t('beta.stuck.cases.closedInPeriod')} <span>{view.closed.length}</span>
                  </button>
                </div>
              </div>
              <p className="stuck-scope-note" title={t('beta.stuck.cases.scopeHelp')}>
                {t(filters.view === 'open' ? 'beta.stuck.cases.scopeOpen' : 'beta.stuck.cases.scopeClosed')}{' '}
                {t('beta.stuck.cases.helperNotTracked')}
              </p>
              {filters.view === 'closed' && (
                <p className="stuck-scope-note" title={t('beta.stuck.cases.handledHelp')}>
                  {t('beta.stuck.cases.handledOfClosed', {
                    ...counted(view.closed.length),
                    handled: counted(view.closed.filter((row) => row.closed?.how === 'handled').length).n
                  })}
                </p>
              )}
              <StuckCases
                key={`${filters.view}:${filters.cms}:${filters.operation}:${filters.step}:${filters.reason}`}
                rows={filters.view === 'open' ? view.open : view.closed}
                tab={filters.view}
                asOf={body.readAt}
                writable={body.writable}
                pressing={pressing}
                onPress={(row, reopen) => void press(row, reopen)}
                loading={false}
                error={filters.view === 'closed' && view.range.error ? t('beta.stuck.range.invalid') : null}
              />
            </section>
            <StuckBreakdown view={view} />
            {view.range.error ? (
              <p role="alert" className="text-destructive">
                {t('beta.stuck.range.invalid')}
              </p>
            ) : (
              <StuckHistory body={body} view={view} filters={filters} />
            )}
            <p className="signals-read-at" role="status">
              {t('beta.stuck.updated')}
              <StuckTime at={body.readAt} />· {t('beta.stuck.refreshNote')}
            </p>
          </>
        ) : !error ? (
          <div className="signals-kpis stuck-kpis" aria-label={t('beta.stuck.loadingSites')}>
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-36" />
            ))}
          </div>
        ) : null}
      </div>
    </main>
  )
}
