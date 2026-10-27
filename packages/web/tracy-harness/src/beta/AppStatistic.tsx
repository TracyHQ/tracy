// One URL owns the view, record filters and shared statistics table state.
import { Button, Skeleton } from '@tracy/ui'
import { Activity } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { relativeTime } from '../ci-api'
import { useLanguage, useT } from '../i18n/index.ts'
import { AppStatisticDetailPanel } from './AppStatisticDetailPanel'
import { AppStatisticFilters } from './AppStatisticFilters'
import { AppStatisticOverview } from './AppStatisticOverview'
import { type AppStatisticJump, AppStatisticRecords } from './AppStatisticRecords'
import {
  type AppStatisticDetail,
  type AppStatisticPayload,
  AppStatisticReadError,
  type AppStatisticRow,
  type AppStatisticView,
  appStatisticListUrl,
  externalLink,
  readAppStatistic,
  readErrorText
} from './app-statistic-api'
import { APP_STATISTIC_VIEWS, appStatisticTime, viewLabel } from './app-statistic-copy'
import {
  type AppStatisticState,
  readAppStatisticState,
  saveAppStatisticState,
  shouldResetAppStatisticDaily
} from './app-statistic-state'
import { StatisticsHeader } from './StatisticsHeader'
import { StatisticsEmptyActivity, StatisticsReportStatus } from './StatisticsReportStatus'
import './signals.css'
import './app-statistic.css'

export function AppStatistic({
  fetchImpl = fetch,
  initialView = 'users',
  initialSelection = null
}: {
  fetchImpl?: typeof fetch
  initialView?: AppStatisticView
  initialSelection?: string | null
} = {}) {
  const t = useT()
  const { lang } = useLanguage()
  const [state, setState] = useState(() => readAppStatisticState(initialView, initialSelection))
  const [snapshot, setSnapshot] = useState<{ key: string; body: AppStatisticPayload } | null>(null)
  const [detail, setDetail] = useState<AppStatisticDetail | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [detailError, setDetailError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailBusy, setDetailBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [dailyRevision, setDailyRevision] = useState(0)
  const sequence = useRef(0)
  const listUrl = appStatisticListUrl(state)
  const report = !error && snapshot?.key === listUrl ? snapshot.body : null
  const change = useCallback((patch: Partial<AppStatisticState>, resetPage = true) => {
    const resetDaily = shouldResetAppStatisticDaily(patch, resetPage)
    if (resetDaily) setDailyRevision((value) => value + 1)
    setState((current) => {
      const next = { ...current, ...(resetPage ? { page: 1, selected: null } : {}), ...patch }
      saveAppStatisticState(next, resetDaily)
      return next
    })
  }, [])
  useEffect(() => {
    const read = () => setState(readAppStatisticState(initialView, initialSelection))
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [initialView, initialSelection])
  useEffect(() => {
    const timer = setInterval(() => setReload((value) => value + 1), 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const revision = ++sequence.current
    setLoading(true)
    setError(null)
    void readAppStatistic<AppStatisticPayload>(listUrl, controller.signal, fetchImpl)
      .then((body) => {
        if (controller.signal.aborted || revision !== sequence.current) return
        setSnapshot({ key: listUrl, body })
        if (body.pages && state.page > body.pages) change({ page: body.pages }, false)
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted && revision === sequence.current)
          setError(
            failure instanceof Error ? failure : new AppStatisticReadError('appstat.error.statistics.generic')
          )
      })
      .finally(() => {
        if (!controller.signal.aborted && revision === sequence.current) setLoading(false)
      })
    return () => controller.abort()
  }, [listUrl, reload, fetchImpl, state.page, change])
  useEffect(() => {
    const controller = new AbortController()
    setDetail(null)
    setDetailError(null)
    if (!state.selected) {
      setDetailBusy(false)
      return () => controller.abort()
    }
    setDetailBusy(true)
    void readAppStatistic<AppStatisticDetail>(
      `/api/ops/app-statistic/${state.view}/${encodeURIComponent(state.selected)}`,
      controller.signal,
      fetchImpl,
      'details'
    )
      .then((body) => {
        if (!controller.signal.aborted) setDetail(body)
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setDetailError(
            failure instanceof Error ? failure : new AppStatisticReadError('appstat.error.details.generic')
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailBusy(false)
      })
    return () => controller.abort()
  }, [state.view, state.selected, reload, fetchImpl])
  const go = (
    view: AppStatisticView,
    scope: { id: string; label: string } | null = null,
    selection: string | null = null
  ) =>
    change({
      view,
      user: scope?.id || null,
      selected: selection,
      source: '',
      template: '',
      account: 'all',
      q: '',
      sort: view === 'users' ? 'lastAppContact' : 'time',
      direction: 'desc'
    })
  const jump: AppStatisticJump = (label, view, scope = null, selection = null) => (
    <button type="button" className="app-statistic-link" onClick={() => go(view, scope, selection)}>
      {label}
    </button>
  )
  const timeCell = (time?: string | null) =>
    time ? (
      <time
        className="whitespace-nowrap tabular-nums"
        dateTime={time}
        title={appStatisticTime(time, t, lang)}
      >
        {relativeTime(time)}
      </time>
    ) : (
      <span className="text-muted-foreground">{t('appstat.notRecorded')}</span>
    )
  const link = (url?: string | null, label?: string, title?: string) => {
    const target = externalLink(url)
    return target ? (
      <a
        className="app-statistic-link"
        href={target.href}
        title={title || target.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {label || target.label}
      </a>
    ) : null
  }
  const quickstartList = (rows: AppStatisticRow[], empty: string) =>
    rows.length ? (
      rows.map((row) => (
        <div
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-3 border-border border-b py-2"
        >
          <span>{row.template || t('appstat.notRecorded')}</span>
          {timeCell(row.requestedAt)}
        </div>
      ))
    ) : (
      <p className="text-muted-foreground">{empty}</p>
    )
  const scopedRow = report?.rows.find((row) => row.userId === state.user)
  const scopedWho = scopedRow?.email || scopedRow?.name
  return (
    <main className="signals-screen app-statistic-screen" data-app-statistic-screen>
      <StatisticsHeader
        title={t('appstat.title')}
        description={t('appstat.description')}
        icon={Activity}
        tone="desktop"
      />
      <AppStatisticFilters
        value={state}
        report={report || snapshot?.body || null}
        loading={loading}
        onChange={change}
        onReload={() => setReload((value) => value + 1)}
      />
      <div className="signals-content" aria-busy={loading}>
        <div className="signals-segment app-statistic-views" role="group" aria-label={t('appstat.views')}>
          {APP_STATISTIC_VIEWS.map((view) => (
            <button key={view} type="button" aria-pressed={state.view === view} onClick={() => go(view)}>
              {viewLabel(view, t)}
            </button>
          ))}
        </div>
        {state.user && state.view !== 'downloads' && (
          <div className="flex items-center gap-2">
            <span title={state.user}>
              {scopedWho ? t('appstat.onlyFrom', { who: scopedWho }) : t('appstat.onlyFromSelected')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => change({ user: null })}>
              {t('appstat.clearAccount')}
            </Button>
          </div>
        )}
        {error && (
          <StatisticsReportStatus onRetry={() => setReload((value) => value + 1)}>
            {readErrorText(error, t)}
            {error instanceof AppStatisticReadError && error.signInRequired && (
              <a className="ml-2 underline" href="/login?next=%2Fops%2Fapp-statistic">
                {t('appstat.signInAgain')}
              </a>
            )}
          </StatisticsReportStatus>
        )}
        {report?.total === 0 && !loading && (
          <StatisticsEmptyActivity days={state.days} activity={t('appstat.empty.records')} />
        )}
        {loading ? (
          <div aria-label={t('appstat.loading')}>
            <div className="signals-kpis app-statistic-kpis">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-64" />
              ))}
            </div>
          </div>
        ) : (
          report && (
            <AppStatisticOverview
              key={dailyRevision}
              report={report}
              compare={state.compare && state.days !== 'all'}
            />
          )
        )}
        <div
          className={
            state.selected
              ? 'app-statistic-record-layout app-statistic-record-layout-open'
              : 'app-statistic-record-layout'
          }
        >
          <AppStatisticRecords
            report={report}
            selected={state.selected}
            loading={loading}
            error={error ? readErrorText(error, t) : null}
            onSelect={(id) => change({ selected: state.selected === id ? null : id }, false)}
            jump={jump}
            timeCell={timeCell}
            link={link}
            remote={{
              page: state.page,
              pageSize: state.pageSize,
              total: report?.total || 0,
              sort: state.sort,
              direction: state.direction === 'asc' ? 'asc' : 'desc',
              query: state.q,
              onPage: (page) => change({ page, selected: null }, false),
              onPageSize: (pageSize) => change({ pageSize }),
              onSort: (sort, direction) => change({ sort, direction }),
              onSearch: (q) => change({ q })
            }}
          />
          <AppStatisticDetailPanel
            selected={state.selected}
            view={state.view}
            record={detail?.view === state.view && detail.row.id === state.selected ? detail : null}
            detailBusy={detailBusy}
            detailError={detailError}
            onClose={() => change({ selected: null }, false)}
            jump={jump}
            link={link}
            quickstartList={quickstartList}
          />
        </div>
        <p className="signals-read-at" role="status">
          {report ? (
            <>
              {t('appstat.updated')} {timeCell(report.readAt)} {t('appstat.refreshes')}
            </>
          ) : (
            t('appstat.waiting')
          )}
        </p>
      </div>
    </main>
  )
}
