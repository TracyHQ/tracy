// The approved PR table with branch/date scope and paging; GitHub access remains staff-only.
import { CiExecutionPanel } from './CiExecution'
import { useCiAutoRead } from './ci-read'
import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOPBAR_SLOT_ID } from './shell/topbar'
import { useT } from './i18n'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  NativeSelect,
  Badge,
  Button,
  Input,
  Progress,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn
} from '@tracy/ui'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Circle,
  AlertCircle,
  Search,
  ExternalLink,
  X,
  RefreshCw,
  SlidersHorizontal
} from 'lucide-react'
import {
  buildLabel,
  ciColumns,
  ciMessage,
  ciScopeQuery,
  filterCompactLabel,
  filterLabel,
  stageLabel,
  stateLabel,
  sortedRows,
  relativeTime,
  exactTime,
  githubLink,
  needsAttention,
  checkLabel,
  executionColumn,
  executionSummary,
  prFilters,
  prStages,
  prStep,
  matchesPrFilter,
  failureGuidance,
  attentionIssue,
  agentIssueText,
  agentIssuesText,
  durationLabel,
  releaseDuration,
  rowDuration,
  filterTime,
  filterTimeColumn,
  runnerLabel,
  type CiPayload,
  type CiRow,
  type SortKey
} from './ci-api'

export function Ci({ fetchImpl = fetch, initial }: { fetchImpl?: typeof fetch; initial?: number } = {}) {
  const t = useT()
  const columns = ciColumns(t)
  const [branch, setBranch] = useState('All')
  const [date, setDate] = useState('24h')
  const [dateField, setDateField] = useState('updated')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [draftField, setDraftField] = useState('updated')
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const scopeQuery = ciScopeQuery({ branch, dateField, range: date, from, to })
  const listUrl = `/api/ops/ci?${scopeQuery}`
  const [data, setData] = useState<CiPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [detail, setDetail] = useState<CiRow | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [tick, setTick] = useState(Date.now())
  const initializedViewer = useRef<string | null>(null)
  const readAccount = useRef<string | undefined>(undefined)
  const confirmedReads = useRef(new Map<number, string>())
  const readQueue = useRef<Promise<void>>(Promise.resolve())
  const [readSaving, setReadSaving] = useState(0)
  const [readError, setReadError] = useState<string | null>(null)
  const readTable = useRef<HTMLDivElement>(null)
  const withReadState = (row: CiRow): CiRow =>
    confirmedReads.current.has(row.id)
      ? { ...row, unread: false, readAt: confirmedReads.current.get(row.id)! }
      : row
  function markRead(numbers: number[]) {
    const account = readAccount.current
    const task = readQueue.current
      .catch(() => {})
      .then(() => {
        if (account !== readAccount.current) return
        return saveRead(numbers, account)
      })
    readQueue.current = task
    return task
  }
  async function saveRead(numbers: number[], account: string | undefined) {
    const pending = [...new Set(numbers)].filter((id) => !confirmedReads.current.has(id))
    if (!pending.length) return
    setReadSaving((n) => n + 1)
    try {
      for (let start = 0; start < pending.length; start += 1000) {
        const batch = pending.slice(start, start + 1000)
        const response = await fetchImpl('/api/ops/ci/read', {
          method: 'PUT',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ read: true, numbers: batch })
        })
        if (!response.ok || response.redirected) throw new Error('ci.message.readSaveFailed')
        const result = (await response.json()) as {
          readAccount?: string
          states: { id: number; unread: boolean; readAt: string }[]
        }
        if (account !== readAccount.current || (account && result.readAccount !== account)) {
          confirmedReads.current.clear()
          setRefresh((n) => n + 1)
          throw new Error('ci.message.accountChanged')
        }
        if (
          !Array.isArray(result.states) ||
          result.states.length !== batch.length ||
          batch.some(
            (id) =>
              !result.states.some(
                (state) => state.id === id && state.unread === false && typeof state.readAt === 'string'
              )
          )
        )
          throw new Error('ci.message.readSaveFailed')
        for (const state of result.states) confirmedReads.current.set(state.id, state.readAt)
        setData((current) => (current ? { ...current, rows: current.rows.map(withReadState) } : current))
        setDetail((current) => (current ? withReadState(current) : current))
      }
      setReadError(null)
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'ci.message.readSaveFailed')
      throw error
    } finally {
      setReadSaving((n) => n - 1)
    }
  }
  useEffect(() => {
    setData(null)
  }, [listUrl])
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    async function load() {
      if (pending || controller.signal.aborted) return
      pending = true
      setBusy(true)
      try {
        const res = await fetchImpl(listUrl, {
          signal: controller.signal,
          headers: { accept: 'application/json' }
        })
        if (!res.ok || res.redirected) throw new Error('ci.message.loadFailed')
        const payload = (await res.json()) as CiPayload
        if (!Array.isArray(payload.rows) || !Array.isArray(payload.members))
          throw new Error('ci.message.unexpected')
        if (!controller.signal.aborted) {
          if (payload.readAccount !== readAccount.current) {
            readAccount.current = payload.readAccount
            confirmedReads.current.clear()
            initializedViewer.current = null
          }
          // A poll started before a successful write must not restore the old unread badge.
          setData({ ...payload, rows: payload.rows.map(withReadState) })
          setLoadError(null)
          const viewer = payload.viewer.authorId ?? 'All'
          if (initializedViewer.current !== viewer) {
            initializedViewer.current = viewer
            setPerson(viewer)
            setFilter(
              payload.rows.some((row) => (viewer === 'All' || row.authorId === viewer) && needsAttention(row))
                ? 'Needs attention'
                : 'All PRs'
            )
          }
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : 'ci.message.loadFailedShort')
      } finally {
        if (!controller.signal.aborted) setBusy(false)
        pending = false
      }
    }
    void load()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchImpl, refresh, listUrl])
  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setTopbarSlot(document.getElementById(TOPBAR_SLOT_ID)), [])
  const [expanded, setExpanded] = useState<number | null>(initial ?? null)
  const [filter, setFilter] = useState('All PRs')
  const [person, setPerson] = useState('All')
  const [copyStatus, setCopyStatus] = useState<{ id: number; message: string } | null>(null)
  async function copyIssue(row: CiRow) {
    try {
      await navigator.clipboard.writeText(agentIssueText(row))
      setCopyStatus({ id: row.id, message: 'ci.message.copied' })
    } catch {
      setCopyStatus({ id: row.id, message: 'ci.message.copyUnavailable' })
    }
  }
  const [copyAllStatus, setCopyAllStatus] = useState<string | null>(null)
  async function copyAllIssues() {
    try {
      await navigator.clipboard.writeText(agentIssuesText(rows))
      setCopyAllStatus('ci.message.copiedAll')
    } catch {
      setCopyAllStatus('ci.message.copyUnavailable')
    }
  }
  const memberTabs = useRef<HTMLDivElement>(null)
  useEffect(() => {
    memberTabs.current
      ?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [person])
  const people = data?.members ?? []
  const viewer = data?.viewer.authorId ?? null
  const [query, setQuery] = useState('')
  useEffect(() => setCopyAllStatus(null), [person, query, filter, data])
  const [sort, setSort] = useState<SortKey>('build')
  const [descending, setDescending] = useState(false)
  const [briefWidth, setBriefWidth] = useState(270)
  const briefDrag = useRef<{ x: number; width: number } | null>(null)
  const resizeBrief = (width: number) => setBriefWidth(Math.max(180, Math.min(1000, width)))
  useEffect(() => {
    setPage(1)
    setExpanded(null)
  }, [branch, date, dateField, from, to, person, filter, query, sort, descending, pageSize])
  const available = data?.rows ?? []
  const stale = Boolean(
    loadError || data?.stale || (data?.measuredAt && tick - Date.parse(data.measuredAt) > 90000)
  )
  const unavailable = !data || !data.measuredAt
  const authored = available.filter((row) => person === 'All' || row.authorId === person)
  const matchingRows = sortedRows(
    authored.filter(
      (p) =>
        matchesPrFilter(p, filter) &&
        `${p.id} ${p.title} ${p.author} ${p.commit}`.toLowerCase().includes(query.toLowerCase())
    ),
    sort,
    descending,
    tick,
    filter
  )
  const pages = Math.max(1, Math.ceil(matchingRows.length / pageSize))
  const currentPage = Math.min(page, pages)
  const rows = matchingRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const unreadRowsKey = rows
    .filter((row) => row.unread === true)
    .map((row) => row.id)
    .join(',')
  useCiAutoRead(readTable, unreadRowsKey ? `${data?.readAccount ?? ''}:${unreadRowsKey}` : '', markRead)
  const selected = rows.find((row) => row.id === expanded)
  const p = selected && detail?.id === selected.id && detail.commit === selected.commit ? detail : selected
  useEffect(() => {
    setDetail(null)
    setDetailError(null)
    if (!selected || stale) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetchImpl(`/api/ops/ci/${selected.id}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' }
        })
        if (!response.ok || response.redirected) throw new Error('ci.message.detailFailed')
        const payload = (await response.json()) as { row: CiRow }
        if (!controller.signal.aborted && payload.row.commit === selected.commit)
          setDetail(withReadState(payload.row))
      } catch {
        if (!controller.signal.aborted) setDetailError('ci.message.detailFailed')
      }
    })()
    return () => controller.abort()
  }, [selected?.id, selected?.commit, data?.measuredAt, fetchImpl, stale])
  const toggle = (id: number) => setExpanded((current) => (current === id ? null : id))
  const timeColumn = filterTimeColumn(filter, t)
  function selectFilter(next: string) {
    if (next === 'Live' && filter !== 'Live') {
      setSort('committedAt')
      setDescending(true)
    }
    setFilter(next)
  }
  function columnHeader(original: (typeof columns)[number]) {
    const c = original.key === 'committedAt' ? { ...original, ...timeColumn } : original
    return (
      <TableHead
        key={c.key}
        className={cn(
          c.key === 'title' && 'relative',
          executionColumn(c.key) && 'bg-primary/5',
          c.key === 'build' && 'border-l border-primary/20',
          c.key === 'duration' && 'border-r border-primary/20'
        )}
        style={
          c.key === 'title' ? { width: briefWidth, minWidth: briefWidth, maxWidth: briefWidth } : undefined
        }
        aria-sort={sort === c.key ? (descending ? 'descending' : 'ascending') : 'none'}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-0 text-xs"
          title={c.hint}
          aria-label={t('ci.column.sortBy', { column: c.label })}
          onClick={() => {
            setSort(c.key)
            setDescending(sort === c.key ? !descending : c.key === 'committedAt' || c.key === 'mergedAt')
          }}
        >
          {c.label}
          {sort === c.key ? (
            descending ? (
              <ArrowDown className="size-3" />
            ) : (
              <ArrowUp className="size-3" />
            )
          ) : (
            <ArrowUpDown className="size-3 text-muted-foreground" />
          )}
        </Button>
        {c.key === 'title' && (
          <div
            role="separator"
            aria-label={t('ci.column.resize', { column: c.label })}
            aria-orientation="vertical"
            aria-valuemin={180}
            aria-valuemax={1000}
            aria-valuenow={briefWidth}
            tabIndex={0}
            className="absolute inset-y-0 right-0 z-20 flex w-3 cursor-col-resize touch-none items-center justify-center hover:bg-primary/10 focus-visible:outline-ring"
            title={t('ci.column.resizeHint', { column: c.label })}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              briefDrag.current = { x: event.clientX, width: briefWidth }
            }}
            onPointerMove={(event) => {
              if (briefDrag.current)
                resizeBrief(briefDrag.current.width + event.clientX - briefDrag.current.x)
            }}
            onPointerUp={() => {
              briefDrag.current = null
            }}
            onPointerCancel={() => {
              briefDrag.current = null
            }}
            onLostPointerCapture={() => {
              briefDrag.current = null
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault()
                resizeBrief(briefWidth + (event.key === 'ArrowRight' ? 30 : -30))
              }
            }}
          >
            <span className="h-4 w-0.5 rounded bg-border" />
          </div>
        )}
      </TableHead>
    )
  }
  const searchBox = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
        <Input
          className="h-8 w-48 pl-8"
          aria-label={t('ci.search.label')}
          placeholder={t('ci.search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <NativeSelect
        aria-label={t('ci.branch.label')}
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
      >
        {['All', 'develop', 'staging', 'main'].map((value) => (
          <option key={value} value={value}>
            {t('ci.branch.option', { branch: value === 'All' ? t('ci.branch.all') : value })}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t('ci.date.label')}
        value={date}
        onChange={(e) => {
          const value = e.target.value
          if (value === 'custom') {
            setDraftField(dateField)
            setDraftFrom(from)
            setDraftTo(to)
            setAdvancedOpen(true)
          } else setDate(value)
        }}
      >
        {['24h', '7d', '30d', '90d', 'any', 'custom'].map((value) => (
          <option key={value} value={value}>
            {t(`ci.date.${value}`)}
          </option>
        ))}
      </NativeSelect>
      <Popover
        open={advancedOpen}
        onOpenChange={(open) => {
          setAdvancedOpen(open)
          if (open) {
            setDraftField(dateField)
            setDraftFrom(from)
            setDraftTo(to)
          }
        }}
      >
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <SlidersHorizontal className="size-3.5" />
          {t('ci.filterButton')}
          {dateField !== 'updated' || date === 'custom' ? ' · 1' : ''}
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-4" align="end">
          <div>
            <h2 className="font-semibold">{t('ci.advanced.title')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('ci.advanced.hint')}</p>
          </div>
          <label className="block space-y-1 text-sm">
            <span>{t('ci.advanced.dateField')}</span>
            <NativeSelect
              aria-label={t('ci.advanced.dateField')}
              value={draftField}
              onChange={(e) => setDraftField(e.target.value)}
            >
              {['updated', 'created', 'merged'].map((value) => (
                <option key={value} value={value}>
                  {t(`ci.dateField.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span>{t('ci.advanced.from')}</span>
              <Input
                aria-label={t('ci.advanced.fromDate')}
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('ci.advanced.to')}</span>
              <Input
                aria-label={t('ci.advanced.toDate')}
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{t('ci.advanced.timezone')}</p>
          {draftFrom && draftTo && draftFrom > draftTo && (
            <p role="alert" className="text-xs text-destructive">
              {t('ci.advanced.invalidRange')}
            </p>
          )}
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBranch('All')
                setDate('24h')
                setDateField('updated')
                setFrom('')
                setTo('')
                setAdvancedOpen(false)
              }}
            >
              {t('ci.advanced.reset')}
            </Button>
            <Button
              size="sm"
              disabled={Boolean(draftFrom && draftTo && draftFrom > draftTo)}
              onClick={() => {
                setDateField(draftField)
                setFrom(draftFrom)
                setTo(draftTo)
                if (draftFrom || draftTo) setDate('custom')
                else if (date === 'custom') setDate('24h')
                setAdvancedOpen(false)
              }}
            >
              {t('ci.advanced.apply')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="space-y-4 p-5">
        {topbarSlot ? (
          createPortal(searchBox, topbarSlot)
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{t('ci.title')}</h1>
            {searchBox}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {data?.repo ?? 'TracyHQ/tch'} · {branch === 'All' ? t('ci.summary.allBranches') : branch} ·{' '}
            {t('ci.summary.prs', { n: `${available.length}${data?.truncated ? '+' : ''}` })} ·{' '}
            {t(`ci.dateField.${dateField}`)}
            {date === 'custom' ? `: ${from || t('ci.summary.any')} – ${to || t('ci.summary.any')}` : ''} ·{' '}
            {t('ci.summary.autoUpdate')}
          </span>
          <div className="flex items-center gap-2">
            <span>
              {data?.measuredAt
                ? t('ci.summary.updatedAgo', { time: relativeTime(data.measuredAt, tick) })
                : t('ci.summary.waiting')}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw className={cn('size-3.5', busy && 'motion-safe:animate-spin')} />
              {t('ci.refresh')}
            </Button>
          </div>
        </div>
        {data && !data.viewer.linked && (
          <p className="text-xs text-muted-foreground">{t('ci.notice.unlinked')}</p>
        )}
        {data?.truncated && (
          <p role="status" className="text-sm text-muted-foreground">
            {t('ci.notice.truncated')}
          </p>
        )}
        {(loadError || data?.error || stale) && (
          <div
            role="status"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm"
          >
            {loadError ? ciMessage(t, loadError) : data?.error || t('ci.notice.delayed')}
            {stale && data?.measuredAt && <span> {t('ci.notice.snapshot')}</span>}
          </div>
        )}
        {data?.runnerStatus?.error && (
          <p role="status" className="text-xs text-muted-foreground">
            {t('ci.notice.runner', { error: data.runnerStatus.error })}
          </p>
        )}
        <Tabs
          value={person}
          onValueChange={(value) => {
            const member = String(value)
            setPerson(member)
            setQuery('')
            setFilter(
              available.some((row) => (member === 'All' || row.authorId === member) && needsAttention(row))
                ? 'Needs attention'
                : 'All PRs'
            )
            setCopyStatus(null)
          }}
          className="min-w-0 gap-4"
        >
          <div className="flex min-w-0 items-center gap-3 border-b border-border">
            <div
              className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-1"
              aria-label={t('ci.members.scroll')}
              ref={memberTabs}
            >
              <TabsList
                variant="line"
                aria-label={t('ci.members.filter')}
                className="h-10 min-w-max justify-start gap-1"
              >
                {[{ id: 'All', name: t('ci.members.all'), login: null }, ...people].map((member) => (
                  <TabsTrigger
                    key={member.id}
                    value={member.id}
                    className="h-9 flex-none px-3 data-active:text-primary after:bg-primary"
                    onFocus={(event) =>
                      event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                    }
                  >
                    {member.name}
                    {member.id === viewer && (
                      <span className="text-xs text-muted-foreground">{t('ci.members.you')}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {unavailable
                        ? '—'
                        : available.filter((row) => member.id === 'All' || row.authorId === member.id).length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {person !== 'All' && (
              <span className="hidden shrink-0 pb-1 text-xs text-muted-foreground sm:block">
                {((name) => (name ? t('ci.members.viewing', { name }) : t('ci.members.viewingSelected')))(
                  people.find((member) => member.id === person)?.name
                )}
              </span>
            )}
          </div>
          <div className="min-w-0 overflow-x-auto pb-1">
            <div className="flex w-max items-center gap-0.5" aria-label={t('ci.filter.group')}>
              {prFilters.map((stage) => {
                const count = unavailable ? '—' : authored.filter((p) => matchesPrFilter(p, stage)).length
                const step = prStages.indexOf(stage)
                const attention = stage === 'Needs attention'
                return (
                  <Button
                    key={stage}
                    size="sm"
                    variant={attention ? 'outline' : filter === stage ? 'secondary' : 'ghost'}
                    aria-pressed={filter === stage}
                    aria-label={`${step >= 0 ? `${step}. ` : ''}${stage === 'Ready to merge' ? filterCompactLabel(stage, t) : filterLabel(stage, t)} ${count}`}
                    title={
                      stage === 'Ready'
                        ? t('ci.filter.readyHint')
                        : stage === 'Ready to merge'
                          ? t('ci.filter.readyToMergeHint')
                          : filterLabel(stage, t)
                    }
                    className={cn(
                      'h-7 shrink-0 gap-1 px-2 text-xs',
                      count === 0 && filter !== stage && 'opacity-45',
                      typeof count === 'number' && count > 0 && 'font-semibold',
                      !attention && filter === stage && 'font-semibold',
                      attention &&
                        'ml-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive',
                      attention && filter === stage && 'border-destructive/50 bg-destructive/10'
                    )}
                    onClick={() => selectFilter(stage)}
                  >
                    {step >= 0 && <span className="text-muted-foreground">{step}.</span>}
                    {filterCompactLabel(stage, t)}
                    <span
                      className={cn(
                        'text-muted-foreground',
                        attention &&
                          !unavailable &&
                          authored.some(needsAttention) &&
                          'rounded-full bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive'
                      )}
                    >
                      {count}
                    </span>
                  </Button>
                )
              })}
            </div>
          </div>
          <TabsContent value={person} className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span title={t('ci.read.hint')}>
                {t('ci.read.summary', { n: authored.filter((row) => row.unread === true).length })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={readSaving > 0 || !authored.some((row) => row.unread === true)}
                title={t('ci.read.markAllHint')}
                onClick={() =>
                  void markRead(authored.filter((row) => row.unread === true).map((row) => row.id)).catch(
                    () => {}
                  )
                }
              >
                {readSaving > 0 ? t('ci.read.saving') : t('ci.read.markAll')}
              </Button>
            </div>
            {data?.truncated && <p className="text-xs text-muted-foreground">{t('ci.read.truncated')}</p>}
            {readError && (
              <p role="alert" className="text-xs text-destructive">
                {ciMessage(t, readError)}
              </p>
            )}
            {filter === 'Needs attention' && rows.length > 0 && (
              <section
                aria-label={t('ci.issues.label')}
                className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{t('ci.issues.heading', { n: rows.length })}</h2>
                  <Button size="sm" variant="outline" onClick={() => void copyAllIssues()}>
                    {t('ci.issues.copyAll')}
                  </Button>
                </div>
                {copyAllStatus && (
                  <p role="status" className="text-xs text-muted-foreground">
                    {t(copyAllStatus)}
                  </p>
                )}
                {copyAllStatus === 'ci.message.copyUnavailable' && (
                  <details open className="text-xs text-muted-foreground">
                    <summary>{t('ci.issues.allText')}</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words">{agentIssuesText(rows)}</pre>
                  </details>
                )}
                <p className="text-xs text-muted-foreground">{t('ci.issues.explain')}</p>
                {stale && <p className="text-xs text-destructive">{t('ci.issues.stale')}</p>}
                {rows.map((row) => {
                  const issue = attentionIssue(row, t)
                  return (
                    <div key={row.id} className="space-y-2 rounded-md border border-border bg-background p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button
                          className="text-left text-sm font-medium hover:underline"
                          onClick={() => setExpanded(row.id)}
                        >
                          #{row.id} · {row.title}
                          {row.unread === true && (
                            <Badge variant="outline" className="ml-2 border-primary/30 text-primary">
                              {t('ci.issues.new')}
                            </Badge>
                          )}
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium">{row.author}</span>
                          <Button size="sm" variant="outline" onClick={() => void copyIssue(row)}>
                            {t('ci.issues.copyOne')}
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs font-medium">{issue.label}</p>
                      <p className="text-xs text-muted-foreground">{issue.evidence}</p>
                      <p className="text-sm">{issue.action}</p>
                      {copyStatus?.id === row.id && (
                        <p role="status" className="text-xs text-muted-foreground">
                          {t(copyStatus.message)}
                        </p>
                      )}
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">{t('ci.issues.agentText')}</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-words">{agentIssueText(row)}</pre>
                      </details>
                    </div>
                  )
                })}
              </section>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {t('ci.table.shown', {
                  n: rows.length,
                  column:
                    (sort === 'committedAt'
                      ? timeColumn.label
                      : columns.find((c) => c.key === sort)?.label) ?? '',
                  direction: descending ? t('ci.table.descending') : t('ci.table.ascending')
                })}
                {sort === 'build' && ` · ${t('ci.table.buildOrder')}`}
              </span>
              <span>{t('ci.table.waitingExplain')}</span>
            </div>
            <div className={cn('grid items-start gap-4', p && 'lg:grid-cols-[minmax(0,1fr)_480px]')}>
              <div ref={readTable} className="min-w-0 overflow-hidden rounded-lg border border-border">
                <Table
                  className="text-xs"
                  style={{ minWidth: 1500 + briefWidth }}
                  aria-label={t('ci.table.label')}
                >
                  <TableHeader className="bg-muted/50">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-9">
                        <span className="sr-only">{t('ci.table.details')}</span>
                      </TableHead>
                      {columns.map((c) => columnHeader(c))}
                      <TableHead className="text-xs">{t('ci.table.notes')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={15} className="py-14 text-center text-muted-foreground">
                          {busy && !data
                            ? t('ci.empty.reading')
                            : unavailable
                              ? t('ci.empty.unavailable')
                              : t('ci.empty.none')}
                          {!unavailable && (
                            <p className="mt-1">
                              {filter === 'Waiting to run'
                                ? t('ci.empty.noWaiting')
                                : available.length === 0
                                  ? t('ci.empty.noneYet')
                                  : t('ci.empty.tryOther')}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.map((p) => {
                      const open = expanded === p.id
                      const step = prStep(p)
                      const progress = p.progress
                      const ci = executionSummary(p, tick, t)
                      const singleRunner = p.execution?.jobs.find(
                        (job) => job.runner?.name === ci.runner
                      )?.runner
                      const note = failureGuidance(p, t)?.note ?? ci.waitingNote ?? p.note
                      return (
                        <Fragment key={p.id}>
                          <TableRow
                            data-pr={p.id}
                            data-read-state={
                              p.unread === true ? 'unread' : p.unread === false ? 'read' : 'unknown'
                            }
                            onClick={(event) => {
                              if (
                                (event.target as HTMLElement).closest('button, a, input, select') ||
                                window.getSelection()?.toString()
                              )
                                return
                              setExpanded(p.id)
                            }}
                            className={cn(
                              'cursor-pointer border-border',
                              progress && 'border-b-0',
                              open && 'bg-muted/40',
                              p.unread === true
                                ? 'font-semibold [&_td]:font-semibold [&_td_*]:font-semibold'
                                : 'font-normal [&_td]:font-normal [&_td_*]:font-normal'
                            )}
                          >
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={t(open ? 'ci.row.collapse' : 'ci.row.expand', { id: p.id })}
                                aria-expanded={open}
                                aria-controls={open ? `pr-details-${p.id}` : undefined}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggle(p.id)
                                }}
                              >
                                {open ? (
                                  <ChevronDown className="size-3.5" />
                                ) : (
                                  <ChevronRight className="size-3.5" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">#{p.id}</TableCell>
                            <TableCell>
                              {step ? (
                                <span
                                  className="text-xs tabular-nums"
                                  title={`${step.index}. ${filterLabel(step.label, t)}`}
                                  aria-label={t('ci.row.step', {
                                    index: step.index,
                                    label: filterLabel(step.label, t)
                                  })}
                                >
                                  {step.index}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell
                              className="sticky left-0 z-10 bg-background"
                              style={{ width: briefWidth, minWidth: briefWidth, maxWidth: briefWidth }}
                            >
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggle(p.id)
                                }}
                                aria-expanded={open}
                                aria-controls={open ? `pr-details-${p.id}` : undefined}
                                className="flex items-center gap-2 text-left text-sm font-medium hover:underline focus-visible:outline-ring"
                                style={{ width: briefWidth - 24 }}
                                title={p.title}
                              >
                                {p.unread === true && (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 border-primary/30 text-primary"
                                  >
                                    {t('ci.issues.new')}
                                  </Badge>
                                )}
                                <span className="min-w-0 truncate">{p.title}</span>
                              </button>
                            </TableCell>
                            <TableCell className="border-l border-primary/20 bg-primary/5">
                              <span
                                className={cn(
                                  'flex items-center gap-1.5',
                                  p.build === 'Failed' && 'text-destructive',
                                  p.build === 'Building' && 'text-primary'
                                )}
                              >
                                {p.build === 'Ready' ? (
                                  <CheckCircle2 className="size-3.5" />
                                ) : p.build === 'Failed' ? (
                                  <AlertCircle className="size-3.5" />
                                ) : p.build === 'Building' ? (
                                  <Clock3 className="size-3.5" />
                                ) : (
                                  <Circle className="size-3.5" />
                                )}
                                {p.build === 'Building' ? t('ci.build.checking') : buildLabel(p.build, t)}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[190px] truncate bg-primary/5" title={ci.step}>
                              {ci.step}
                            </TableCell>
                            <TableCell
                              className="max-w-[175px] bg-primary/5"
                              title={
                                (p.execution?.jobs ?? [])
                                  .filter((job) => job.runner)
                                  .map((job) => `${job.runner!.name}: ${runnerLabel(job.runner, t)}`)
                                  .join(' · ') ||
                                p.execution?.runnerError ||
                                t('ci.row.runnerUnknown')
                              }
                            >
                              <span className="block truncate font-mono">{ci.runner}</span>
                              {singleRunner && (
                                <span className="block text-[10px] text-muted-foreground">
                                  {runnerLabel(singleRunner, t)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="border-r border-primary/20 bg-primary/5 font-mono">
                              {durationLabel(rowDuration(p, tick), t)}
                              <p className="mt-1 text-xs font-sans text-muted-foreground">
                                {!p.merged
                                  ? t('ci.row.phase.checks')
                                  : p.deployment.stage === 'Building image'
                                    ? stageLabel('Building image', t)
                                    : ['Deploying', 'Live'].includes(p.deployment.stage ?? '')
                                      ? t('ci.row.phase.deploy')
                                      : t('ci.row.notConfirmed')}
                              </p>
                            </TableCell>
                            <TableCell>{p.author}</TableCell>
                            <TableCell>
                              <time
                                dateTime={filterTime(p, filter) ?? undefined}
                                title={exactTime(filterTime(p, filter), t)}
                              >
                                {relativeTime(filterTime(p, filter), tick)}
                              </time>
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground" title={p.commit}>
                              {p.commit.slice(0, 8)}
                            </TableCell>
                            <TableCell>
                              {p.mergedAt ? (
                                <div>
                                  <time dateTime={p.mergedAt} title={exactTime(p.mergedAt, t)}>
                                    {relativeTime(p.mergedAt, tick)}
                                  </time>
                                  <p
                                    className={cn(
                                      'mt-1 text-xs',
                                      p.deployment.failed ? 'text-destructive' : 'text-muted-foreground'
                                    )}
                                    title={p.deployment.label}
                                  >
                                    {p.deployment.failed
                                      ? p.deployment.label
                                      : p.deployment.stage === 'Merged'
                                        ? t('ci.row.mergedUnconfirmed')
                                        : p.deployment.stage
                                          ? stageLabel(p.deployment.stage, t)
                                          : t('ci.row.notConfirmed')}
                                    {releaseDuration(p, tick) !== null &&
                                      ` · ${durationLabel(releaseDuration(p, tick), t)}`}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">{t('ci.row.notMerged')}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {p.queue ? (
                                <Badge variant="outline" className="border-primary/30 text-primary">
                                  {t(p.queue === 1 ? 'ci.row.queueNext' : 'ci.row.queueWaiting', {
                                    n: p.queue
                                  })}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">
                                  {p.state === 'Ready to merge' ? t('ci.row.notQueued') : '—'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={p.state === 'Needs a fix' ? 'destructive' : 'secondary'}
                                className="whitespace-nowrap"
                              >
                                {stateLabel(p.state, t)}
                              </Badge>
                            </TableCell>

                            <TableCell className="font-mono text-muted-foreground">{p.target}</TableCell>
                            <TableCell className="max-w-[220px] truncate text-muted-foreground" title={note}>
                              {note}
                            </TableCell>
                          </TableRow>
                          {progress && (
                            <TableRow className="border-0 hover:bg-transparent">
                              <TableCell colSpan={15} className="h-[2px] p-0">
                                <Progress
                                  value={progress.value}
                                  aria-label={t('ci.row.progress', { id: p.id })}
                                  aria-valuetext={stateLabel(progress.label, t)}
                                  title={stateLabel(progress.label, t)}
                                  className={cn(
                                    'gap-0 [&_[data-slot=progress-track]]:h-[2px] [&_[data-slot=progress-track]]:rounded-none [&_[data-slot=progress-track]]:bg-border [&_[data-slot=progress-indicator]]:motion-reduce:transition-none',
                                    progress.tone === 'done' &&
                                      '[&_[data-slot=progress-indicator]]:bg-success',
                                    progress.tone === 'failed' &&
                                      '[&_[data-slot=progress-indicator]]:bg-destructive',
                                    progress.tone === 'running' &&
                                      !stale &&
                                      '[&_[data-slot=progress-indicator]]:motion-safe:animate-pulse'
                                  )}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {p && (
                <div
                  id={`pr-details-${p.id}`}
                  role="region"
                  aria-label={t('ci.detail.label', { id: p.id })}
                  className="space-y-5 rounded-lg border border-border bg-card p-5 text-xs text-card-foreground lg:sticky lg:top-4"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">
                        {t('ci.detail.heading', { id: p.id, author: p.author })}
                      </span>
                      <a
                        href={githubLink(p.url) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-ring"
                      >
                        {t('ci.detail.viewInGitHub')} <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={t('ci.detail.close')}
                      onClick={() => setExpanded(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">{p.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{p.detail}</p>
                  </div>
                  <CiExecutionPanel key={`${p.id}:${p.commit}`} row={p} now={tick} />
                  <div>
                    <h3 className="font-semibold">{t('ci.detail.next')}</h3>
                    <p className="mt-1 text-sm">{failureGuidance(p, t)?.note ?? p.next}</p>
                    {failureGuidance(p, t) && (
                      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <p>{failureGuidance(p, t)!.explanation}</p>
                        {failureGuidance(p, t)!.checks.length > 0 && (
                          <p>
                            {t('ci.failure.checks', { checks: failureGuidance(p, t)!.checks.join(', ') })}
                          </p>
                        )}
                        <p>{t('ci.detail.openFailed')}</p>
                      </div>
                    )}
                    <p className="mt-2 text-muted-foreground">
                      {!stale && p.estimateSeconds !== null
                        ? t('ci.detail.estimate', { n: Math.ceil(p.estimateSeconds / 60) })
                        : t('ci.detail.noEstimate')}
                    </p>
                    {detailError && (
                      <p role="status" className="mt-2 text-destructive">
                        {ciMessage(t, detailError)}
                      </p>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-3 font-semibold">
                      {t('ci.detail.checksOn', { sha: p.commit.slice(0, 8) })}
                    </h3>
                    <ol className="space-y-3">
                      {p.checks.map((check) => (
                        <li key={check.id}>
                          <div className="flex justify-between gap-3">
                            <span className="min-w-0 break-words">
                              {githubLink(check.url) ? (
                                <a
                                  href={githubLink(check.url)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline"
                                >
                                  {check.name}
                                </a>
                              ) : (
                                check.name
                              )}
                            </span>
                            <span className="shrink-0 text-muted-foreground">{checkLabel(check, t)}</span>
                          </div>
                          {check.steps
                            .filter(
                              (step) =>
                                step.status === 'IN_PROGRESS' ||
                                ['FAILURE', 'TIMED_OUT'].includes(step.conclusion ?? '')
                            )
                            .map((step) => (
                              <p key={step.number} className="mt-1 text-muted-foreground">
                                {step.name}: {checkLabel(step, t)}
                              </p>
                            ))}
                          {check.summary &&
                            ['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(
                              check.conclusion ?? ''
                            ) && (
                              <p className="mt-1 whitespace-pre-wrap break-words text-destructive">
                                {check.summary}
                              </p>
                            )}
                        </li>
                      ))}
                    </ol>
                    {!p.checks.length && <p className="text-muted-foreground">{t('ci.detail.noChecks')}</p>}
                    {!p.checksComplete && (
                      <p className="mt-2 text-destructive">{t('ci.detail.incomplete')}</p>
                    )}
                    <p className="mt-3 text-muted-foreground">{t('ci.detail.parallel')}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {p.build === 'Failed' ? t('ci.detail.wrong') : t('ci.detail.latest')}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">{p.outcome}</p>
                    <div className="mt-3 flex gap-2">
                      <span className="font-medium">{t('ci.detail.deployment')}</span>
                      <span>
                        {p.deployment.stage && `${stageLabel(p.deployment.stage, t)} · `}
                        {p.deployment.label}
                        {releaseDuration(p, tick) !== null &&
                          ` · ${durationLabel(releaseDuration(p, tick), t)}`}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {p.deployment.coverage?.length ? t('ci.detail.coverage') : t('ci.detail.checksSource')}
                    </p>
                    {p.deployment.checks.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs">
                        {p.deployment.checks.map((check) => (
                          <li key={`${check.workflow}:${check.id}`}>
                            {githubLink(check.url) ? (
                              <a
                                className="hover:underline"
                                href={githubLink(check.url)!}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {check.workflow} · {check.name} · {checkLabel(check, t)}
                              </a>
                            ) : (
                              <span>
                                {check.workflow} · {check.name} · {checkLabel(check, t)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-muted-foreground">
                        {t('ci.detail.technical')}
                      </summary>
                      <p className="mt-2 break-words font-mono text-muted-foreground">
                        {t('ci.detail.technicalLine', {
                          merge: p.mergeState,
                          review: p.review ?? t('ci.detail.noReview'),
                          queue: p.queueState ?? t('ci.row.notQueued')
                        })}{' '}
                      </p>
                      <p className="mt-2">
                        {t('ci.detail.commitTime', { time: exactTime(p.committedAt, t) })}
                      </p>
                      <p>
                        {t('ci.detail.mergeTime', {
                          time: p.mergedAt ? exactTime(p.mergedAt, t) : t('ci.row.notMerged')
                        })}
                      </p>
                      {p.deployment.coverage?.map((proof) => (
                        <p key={proof.workflow}>
                          {proof.workflow}: {proof.commit}
                        </p>
                      ))}
                    </details>
                  </div>
                </div>
              )}
            </div>
            <nav
              aria-label={t('ci.page.label')}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm"
            >
              <span role="status">
                {t('ci.page.range', {
                  start: matchingRows.length ? (currentPage - 1) * pageSize + 1 : 0,
                  end: Math.min(currentPage * pageSize, matchingRows.length),
                  total: `${matchingRows.length}${data?.truncated ? '+' : ''}`
                })}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-muted-foreground">
                  {t('ci.page.perPage')}
                  <NativeSelect
                    aria-label={t('ci.page.perPage')}
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {[25, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className="flex items-center gap-2">
                  {t('ci.page.page')}
                  <NativeSelect
                    aria-label={t('ci.page.page')}
                    value={currentPage}
                    onChange={(e) => {
                      setPage(Number(e.target.value))
                      setExpanded(null)
                    }}
                  >
                    {Array.from({ length: pages }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </NativeSelect>
                  {t('ci.page.of', { pages })}
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t('ci.page.previousAria')}
                  disabled={currentPage === 1}
                  onClick={() => {
                    setPage(currentPage - 1)
                    setExpanded(null)
                  }}
                >
                  {t('ci.page.previous')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t('ci.page.nextAria')}
                  disabled={currentPage === pages}
                  onClick={() => {
                    setPage(currentPage + 1)
                    setExpanded(null)
                  }}
                >
                  {t('ci.page.next')}
                </Button>
              </div>
            </nav>
            <p className="text-xs text-muted-foreground">{t('ci.legend')}</p>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
