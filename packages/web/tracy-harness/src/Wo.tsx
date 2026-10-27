import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  cn,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { createTranslate, reasonText } from '@tracy/wo-views'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  MapPin,
  PauseCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  User,
  X,
  XCircle,
  Zap
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChoiceSelect } from './ChoiceSelect'
import {
  formatDateTime,
  formatFixed,
  formatWith,
  type T,
  tr,
  Trans,
  useLanguage,
  useT
} from './i18n/index.ts'
import { useWoAddress, type WoNavigate } from './use-wo-address.ts'
import { ViewAsUserButton } from './ViewAsUserButton'
import { WoPlaces } from './WoPlaces'
import { WoProviderOrderPanel } from './WoProviderOrder'
import { WoPublicDemosPanel } from './WoPublicDemos'
import { parseWoAddress, type WoAddress, type WoPlacesAddress } from './wo-address.ts'
import {
  fetchWoDubaiPrefetch,
  fetchWoQueue,
  filterWoRows,
  runWoAction,
  runWoDubaiPrefetch,
  saveWoProviderKey,
  saveWoRead,
  saveWoSettings,
  socialCapRows,
  sortWoRows,
  testWoProviderKey,
  WO_STAGE_META,
  WO_CUSTOMER_STAGES,
  WO_CUSTOMER_LABEL_KEY,
  woNeedsAttention,
  type WoCms,
  type WoDubaiPrefetch,
  type WoFilter,
  type WoOpportunityRow,
  type WoOpsSettings,
  type WoPayload,
  type WoProviderId,
  type WoProviderTestResult,
  type WoSocialBudgetId,
  type WoSortKey,
  woProgressPercent
} from './wo-api'

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (diffSec < 60) return tr('wo.time.justNow')
  if (diffSec < 3600) return tr('wo.time.minutesAgo', { count: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return tr('wo.time.hoursAgo', { count: Math.floor(diffSec / 3600) })
  return tr('wo.time.daysAgo', { count: Math.floor(diffSec / 86400) })
}

// Fallback city of a row with neither city nor branch; an id, translated only where shown.
const UNSPECIFIED_CITY = 'Unspecified'
const cityLabel = (t: T, city: string) => (city === UNSPECIFIED_CITY ? t('wo.queue.unspecifiedCity') : city)

function StageBadge({ row }: { row: WoOpportunityRow }) {
  const t = useT()
  const meta = {
    tone:
      row.customerStage === 'outreach' ? 'success' : row.customerStage === 'cancelled' ? 'neutral' : 'info'
  }
  const cls =
    meta.tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : meta.tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : meta.tone === 'danger'
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : meta.tone === 'info'
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border bg-muted/50 text-muted-foreground'
  return (
    <Badge variant="outline" className={cn('px-1.5 py-0 font-mono text-[11px]', cls)}>
      {row.customerStage ? t(WO_CUSTOMER_LABEL_KEY[row.customerStage]) : t('wo.stage.unavailable')}
    </Badge>
  )
}

function RollupPill({ rollup }: { rollup: WoOpportunityRow['researchRollup'] }) {
  const t = useT()
  if (rollup === 'success') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        {t('wo.rollup.pass')}
      </span>
    )
  }
  if (rollup === 'failure') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-destructive">
        <XCircle className="size-3.5" />
        {t('wo.rollup.failed')}
      </span>
    )
  }
  if (rollup === 'paused') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
        <PauseCircle className="size-3.5" />
        {t('wo.rollup.paused')}
      </span>
    )
  }
  if (rollup === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-primary">
        <Loader2 className="size-3.5 animate-spin" />
        {t('wo.rollup.running')}
      </span>
    )
  }
  return <span className="text-muted-foreground">{t('wo.rollup.idle')}</span>
}

export function Wo({ entry, navigate }: { entry?: object; navigate?: WoNavigate } = {}) {
  const t = useT()
  // The address is read once here; `useWoAddress` keeps it in step afterwards.
  const [initial] = useState(() => parseWoAddress(window.location.search, window.location.hash))
  const [payload, setPayload] = useState<WoPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<WoAddress['view']>(initial.view)
  const [placesAddress, setPlacesAddress] = useState<WoPlacesAddress>(initial.places)

  // Live Queue filter & sort state (1-to-1 with Ci.tsx + scalable User & City filters)
  const [search, setSearch] = useState(initial.queue.search)
  const [cmsScope, setCmsScope] = useState<'all' | WoCms>(initial.queue.cms)
  const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d' | '90d' | 'any'>(initial.queue.range)
  const [dateField, setDateField] = useState<'updated' | 'created' | 'built'>(initial.queue.date)
  const [userFilter, setUserFilter] = useState<string>(initial.queue.user)
  const [cityFilter, setCityFilter] = useState<string>(initial.queue.city)
  const [userSearch, setUserSearch] = useState('')
  const [userPickerMode, setUserPickerMode] = useState<'all' | 'attention' | 'running'>('all')
  const [userPopoverOpen, setUserPopoverOpen] = useState(false)
  const [citySearch, setCitySearch] = useState('')
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false)
  const [stageFilter, setStageFilter] = useState<WoFilter>(initial.queue.stage)
  const [sortKey, setSortKey] = useState<WoSortKey>(initial.queue.sort)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initial.queue.dir)
  const [selectedId, setSelectedId] = useState<string | null>(initial.queue.open)
  const [opportunityColWidth, setOpportunityColWidth] = useState<number>(250)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  // Settings form state
  const [draftSettings, setDraftSettings] = useState<WoOpsSettings | null>(null)
  const [draftUiEnabled, setDraftUiEnabled] = useState<boolean>(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null)
  const [keyInputs, setKeyInputs] = useState<Record<WoProviderId, string>>({
    deepseek: '',
    firecrawl: '',
    jina: '',
    apify: '',
    google: '',
    rapidapi: '',
    serpapi: '',
    litescrape: '',
    scrapecreators: ''
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, WoProviderTestResult>>({})

  const address: WoAddress = {
    view: viewMode,
    queue: {
      search,
      user: userFilter,
      city: cityFilter,
      cms: cmsScope,
      range: dateRange,
      date: dateField,
      stage: stageFilter,
      sort: sortKey,
      dir: sortDir,
      open: selectedId
    },
    places: placesAddress
  }
  // Each view restores only its own section; the others keep what this tab had.
  const push = useWoAddress(
    address,
    (next) => {
      setViewMode(next.view)
      if (next.view === 'places') setPlacesAddress(next.places)
      if (next.view !== 'queue') return
      const q = next.queue
      setSearch(q.search)
      setUserFilter(q.user)
      setCityFilter(q.city)
      setCmsScope(q.cms)
      setDateRange(q.range)
      setDateField(q.date)
      setStageFilter(q.stage)
      setSortKey(q.sort)
      setSortDir(q.dir)
      setSelectedId(q.open)
    },
    { entry, navigate }
  )
  const changePlaces = useCallback(
    (change: Partial<WoPlacesAddress>, asEntry: boolean) => {
      if (asEntry) push()
      setPlacesAddress((prev) => ({ ...prev, ...change }))
    },
    [push]
  )

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await fetchWoQueue()
      setPayload(data)
      setDraftSettings((prev) => prev ?? data.settings)
      setDraftUiEnabled(data.uiEnabled)
      setError(null)
    } catch (err: any) {
      setError(err?.message || tr('wo.error.loadQueue'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
    const timer = setInterval(() => {
      void load(true)
    }, 30_000)
    return () => clearInterval(timer)
  }, [load])

  const allRows = payload?.opportunities ?? []
  const allMembers = payload?.members ?? []

  const citiesList = useMemo(() => {
    if (payload?.cities && payload.cities.length > 0) return payload.cities
    const map = new Map<
      string,
      { city: string; count: number; attentionCount: number; runningCount: number }
    >()
    for (const r of allRows) {
      const c = r.city || r.branch || UNSPECIFIED_CITY
      const entry = map.get(c) ?? { city: c, count: 0, attentionCount: 0, runningCount: 0 }
      entry.count += 1
      if (woNeedsAttention(r)) entry.attentionCount += 1
      if (r.queueState === 'LEASED' || r.queueState === 'QUEUED') entry.runningCount += 1
      map.set(c, entry)
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
  }, [payload?.cities, allRows])

  const filteredMembersForPopover = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    return allMembers.filter((m) => {
      if (userPickerMode === 'attention' && m.attentionCount === 0) return false
      if (userPickerMode === 'running' && (m.runningCount ?? 0) === 0) return false
      if (!q) return true
      return (
        m.login.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
      )
    })
  }, [allMembers, userSearch, userPickerMode])

  const filteredCitiesForPopover = useMemo(() => {
    const q = citySearch.trim().toLowerCase()
    if (!q) return citiesList
    return citiesList.filter((c) => c.city.toLowerCase().includes(q))
  }, [citiesList, citySearch])

  // Priority users shown as quick pills below the toolbar:
  // Users who have active/running jobs or need attention right now (or top 5 if none), plus selected user
  const priorityMembers = useMemo(() => {
    const urgent = allMembers.filter((m) => m.attentionCount > 0 || (m.runningCount ?? 0) > 0)
    const base = urgent.length > 0 ? urgent.slice(0, 6) : allMembers.slice(0, 5)
    if (userFilter !== 'all' && !base.some((m) => m.login === userFilter || m.accountId === userFilter)) {
      const chosen = allMembers.find((m) => m.login === userFilter || m.accountId === userFilter)
      if (chosen) return [chosen, ...base.slice(0, 5)]
    }
    return base
  }, [allMembers, userFilter])

  // Rows scoped by search, CMS, date, user, and city (before stage pill selection)
  const userScopedRows = useMemo(
    () =>
      filterWoRows(allRows, {
        search,
        cmsScope,
        userFilter,
        cityFilter,
        stageFilter: 'all',
        dateField,
        dateRange
      }),
    [allRows, search, cmsScope, userFilter, cityFilter, dateField, dateRange]
  )

  const stageCounts = useMemo(() => {
    const counts: Partial<Record<WoFilter, number>> & { all: number; attention: number } = {
      all: userScopedRows.length,
      '0-pin': 0,
      '1-queued': 0,
      '2-waiting': 0,
      '3-researching': 0,
      '4-brief-ready': 0,
      '5-provisioning': 0,
      '6-uploading': 0,
      '7-live': 0,
      attention: 0
    }
    for (const r of userScopedRows) {
      if (woNeedsAttention(r)) counts.attention += 1
      else if (r.customerStage) counts[r.customerStage] = (counts[r.customerStage] ?? 0) + 1
    }
    return counts
  }, [userScopedRows])

  const filteredRows = useMemo(() => {
    const filtered = filterWoRows(allRows, {
      search,
      cmsScope,
      userFilter,
      cityFilter,
      stageFilter,
      dateField,
      dateRange
    })
    return sortWoRows(filtered, sortKey, sortDir)
  }, [allRows, search, cmsScope, userFilter, cityFilter, stageFilter, dateField, dateRange, sortKey, sortDir])

  const attentionRows = useMemo(() => userScopedRows.filter(woNeedsAttention), [userScopedRows])

  const selectedRow = useMemo(() => allRows.find((r) => r.id === selectedId) ?? null, [allRows, selectedId])

  const toggleSort = (key: WoSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const handleSelectUserTab = (val: string) => {
    setUserFilter(val)
    if (val === 'all') {
      setStageFilter('all')
      return
    }
    const member = payload?.members.find((m) => m.login === val || m.accountId === val)
    if (member && member.attentionCount > 0) {
      setStageFilter('attention')
    } else {
      setStageFilter('all')
    }
  }

  const handleSelectRow = async (row: WoOpportunityRow) => {
    push()
    setSelectedId((prev) => (prev === row.id ? null : row.id))
    if (!row.read) {
      setPayload((prev) =>
        prev
          ? {
              ...prev,
              opportunities: prev.opportunities.map((r) => (r.id === row.id ? { ...r, read: true } : r))
            }
          : prev
      )
      try {
        await saveWoRead(row.id, true)
      } catch {
        // Ignore transient read-state error
      }
    }
  }

  const handleToggleRead = async (row: WoOpportunityRow) => {
    const nextRead = !row.read
    setPayload((prev) =>
      prev
        ? {
            ...prev,
            opportunities: prev.opportunities.map((r) => (r.id === row.id ? { ...r, read: nextRead } : r))
          }
        : prev
    )
    try {
      await saveWoRead(row.id, nextRead)
    } catch {
      // Ignore
    }
  }

  const handleOperatorAction = async (
    opportunityId: string,
    action: 'force-complete-brief' | 'reset-cap-resume' | 'reclaim-retry' | 'bump-queue' | 'cancel-job'
  ) => {
    const key = `${opportunityId}:${action}`
    setBusyAction(key)
    try {
      const res = await runWoAction(opportunityId, action)
      if (res.queue) setPayload(res.queue)
    } catch (err: any) {
      setError(err?.message || tr('wo.error.action', { action }))
    } finally {
      setBusyAction(null)
    }
  }

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopiedKey(key)
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev))
    }, 1800)
  }

  const handleSaveAllSettings = async () => {
    if (!draftSettings) return
    setSavingSettings(true)
    setSettingsSavedMsg(null)
    try {
      const updated = await saveWoSettings({
        settings: draftSettings,
        uiEnabled: draftUiEnabled
      })
      setPayload(updated)
      setDraftSettings(updated.settings)
      setDraftUiEnabled(updated.uiEnabled)
      setSettingsSavedMsg(tr('wo.settings.saved'))
      setTimeout(() => setSettingsSavedMsg(null), 3000)
    } catch (err: any) {
      setError(err?.message || tr('wo.error.saveSettings'))
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSaveProviderKey = async (provider: WoProviderId, rawKey: string) => {
    setSavingKey(provider)
    try {
      const updated = await saveWoProviderKey(provider, rawKey)
      setPayload(updated)
      setKeyInputs((prev) => ({ ...prev, [provider]: '' }))
    } catch (err: any) {
      setError(err?.message || tr('wo.error.saveKey', { provider }))
    } finally {
      setSavingKey(null)
    }
  }

  const handleTestProviderKey = async (provider: WoProviderId) => {
    setTestingKey(provider)
    try {
      const res = await testWoProviderKey(provider)
      setTestResults((prev) => ({ ...prev, [provider]: res }))
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          provider,
          status: 'network_error',
          detail: err?.message || tr('wo.error.testKey')
        }
      }))
    } finally {
      setTestingKey(null)
    }
  }

  const writable = payload?.writable ?? false
  const selectedMember = allMembers.find((m) => m.login === userFilter || m.accountId === userFilter)
  const selectedCityObj = citiesList.find((c) => c.city.toLowerCase() === cityFilter.toLowerCase())
  const urgentMembersCount = allMembers.filter(
    (m) => m.attentionCount > 0 || (m.runningCount ?? 0) > 0
  ).length

  return (
    <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-3 px-4 py-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>{t('wo.error.title')}</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="xs" variant="outline" onClick={() => setError(null)}>
              {t('wo.error.dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {viewMode !== 'settings' && (
        <>
          {/* Top Search & Scope Bar (Search + Searchable User Popover + Searchable City Popover + CMS + Date + Filter) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-64 sm:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('wo.queue.searchPlaceholder')}
                  className="h-8 pl-8 text-xs"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={t('wo.queue.clearSearch')}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>

              {/* Searchable User Popover Filter (scales to hundreds/thousands of users) */}
              <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant={userFilter === 'all' ? 'outline' : 'default'}
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                    />
                  }
                >
                  <User className="size-3.5" />
                  <span>
                    {userFilter === 'all'
                      ? t('wo.queue.userAll', { n: allMembers.length })
                      : t('wo.queue.userOne', {
                          name: selectedMember?.name ?? userFilter,
                          n: selectedMember?.count ?? 0
                        })}
                  </span>
                  {selectedMember && selectedMember.attentionCount > 0 ? (
                    <span className="inline-block size-1.5 rounded-full bg-destructive" />
                  ) : null}
                  <ChevronDown className="size-3 opacity-70" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-2.5 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        {t('wo.queue.filterByUser', { n: allMembers.length })}
                      </span>
                      {userFilter !== 'all' ? (
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectUserTab('all')
                            setUserPopoverOpen(false)
                          }}
                          className="text-[11px] text-primary hover:underline"
                        >
                          {t('wo.queue.resetToAll')}
                        </button>
                      ) : null}
                    </div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder={t('wo.queue.searchUser')}
                        className="h-7 pl-7 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          ['all', t('wo.common.allCount', { n: allMembers.length })],
                          [
                            'attention',
                            t('wo.queue.pickerIssues', {
                              n: allMembers.filter((m) => m.attentionCount > 0).length
                            })
                          ],
                          [
                            'running',
                            t('wo.queue.pickerRunning', {
                              n: allMembers.filter((m) => (m.runningCount ?? 0) > 0).length
                            })
                          ]
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setUserPickerMode(mode)}
                          className={cn(
                            'rounded px-2 py-1 text-[11px] transition-colors',
                            userPickerMode === mode
                              ? 'bg-primary font-medium text-primary-foreground'
                              : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="max-h-60 space-y-0.5 overflow-y-auto pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectUserTab('all')
                          setUserPopoverOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded px-2 py-1.5 text-left',
                          userFilter === 'all' ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                        )}
                      >
                        <span>{t('wo.queue.allUsers')}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {t('wo.queue.woCount', { count: allRows.length })}
                        </span>
                      </button>
                      {filteredMembersForPopover.length === 0 ? (
                        <div className="py-4 text-center text-muted-foreground">{t('wo.queue.noUsers')}</div>
                      ) : (
                        filteredMembersForPopover.map((m) => {
                          const active = userFilter === m.login || userFilter === m.accountId
                          return (
                            <button
                              key={m.accountId}
                              type="button"
                              onClick={() => {
                                handleSelectUserTab(m.login)
                                setUserPopoverOpen(false)
                              }}
                              className={cn(
                                'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left',
                                active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="truncate font-medium">{m.name}</span>
                                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                                    @{m.login}
                                  </span>
                                </div>
                                <div className="truncate text-[10px] text-muted-foreground">{m.email}</div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {(m.runningCount ?? 0) > 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="border-primary/30 bg-primary/10 px-1 py-0 text-[10px] text-primary"
                                  >
                                    {t('wo.queue.running', { n: m.runningCount ?? 0 })}
                                  </Badge>
                                ) : null}
                                {m.attentionCount > 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="border-destructive/40 bg-destructive/10 px-1 py-0 text-[10px] text-destructive"
                                  >
                                    {t('wo.queue.issues', { count: m.attentionCount })}
                                  </Badge>
                                ) : null}
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  ({m.count})
                                </span>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Searchable City Popover Filter */}
              <Popover open={cityPopoverOpen} onOpenChange={setCityPopoverOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant={cityFilter === 'all' ? 'outline' : 'default'}
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                    />
                  }
                >
                  <MapPin className="size-3.5" />
                  <span>
                    {cityFilter === 'all'
                      ? t('wo.queue.cityAll', { n: citiesList.length })
                      : t('wo.queue.cityOne', {
                          name: cityLabel(t, selectedCityObj?.city ?? cityFilter),
                          n: selectedCityObj?.count ?? 0
                        })}
                  </span>
                  <ChevronDown className="size-3 opacity-70" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-2.5 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        {t('wo.queue.filterByCity', { n: citiesList.length })}
                      </span>
                      {cityFilter !== 'all' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCityFilter('all')
                            setCityPopoverOpen(false)
                          }}
                          className="text-[11px] text-primary hover:underline"
                        >
                          {t('wo.queue.resetToAll')}
                        </button>
                      ) : null}
                    </div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={citySearch}
                        onChange={(e) => setCitySearch(e.target.value)}
                        placeholder={t('wo.queue.searchCity')}
                        className="h-7 pl-7 text-xs"
                      />
                    </div>
                    <div className="max-h-56 space-y-0.5 overflow-y-auto pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCityFilter('all')
                          setCityPopoverOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded px-2 py-1.5 text-left',
                          cityFilter === 'all' ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                        )}
                      >
                        <span>{t('wo.queue.allCities')}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {t('wo.queue.woCount', { count: allRows.length })}
                        </span>
                      </button>
                      {filteredCitiesForPopover.length === 0 ? (
                        <div className="py-4 text-center text-muted-foreground">{t('wo.queue.noCities')}</div>
                      ) : (
                        filteredCitiesForPopover.map((c) => {
                          const active = cityFilter.toLowerCase() === c.city.toLowerCase()
                          return (
                            <button
                              key={c.city}
                              type="button"
                              onClick={() => {
                                setCityFilter(c.city)
                                setCityPopoverOpen(false)
                              }}
                              className={cn(
                                'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left',
                                active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                              )}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <MapPin className="size-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{cityLabel(t, c.city)}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {c.attentionCount > 0 ? (
                                  <span
                                    className="inline-block size-1.5 rounded-full bg-destructive"
                                    title={t('wo.queue.needAttention', { n: c.attentionCount })}
                                  />
                                ) : null}
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  ({c.count})
                                </span>
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <ChoiceSelect
                value={cmsScope}
                onValueChange={(v) => setCmsScope(v as 'all' | WoCms)}
                className="h-8 w-[140px] text-xs"
                choices={[
                  { value: 'all', label: t('wo.queue.cmsAll') },
                  { value: 'joomla', label: t('wo.queue.cmsOne', { cms: 'joomla' }) },
                  { value: 'wordpress', label: t('wo.queue.cmsOne', { cms: 'wordpress' }) },
                  { value: 'emdash', label: t('wo.queue.cmsOne', { cms: 'emdash' }) }
                ]}
              />

              <ChoiceSelect
                value={dateRange}
                onValueChange={(v) => setDateRange(v as '24h' | '7d' | '30d' | '90d' | 'any')}
                className="h-8 w-[148px] text-xs"
                choices={[
                  { value: '24h', label: t('wo.queue.date24h') },
                  { value: '7d', label: t('wo.queue.date7d') },
                  { value: '30d', label: t('wo.queue.date30d') },
                  { value: '90d', label: t('wo.queue.date90d') },
                  { value: 'any', label: t('wo.queue.dateAny') }
                ]}
              />

              <Popover>
                <PopoverTrigger
                  render={<Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" />}
                >
                  <Filter className="size-3.5" />
                  {t('wo.queue.filter')}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-3 text-xs">
                  <div className="space-y-2">
                    <div className="font-medium text-foreground">{t('wo.queue.filterDateBy')}</div>
                    <div className="grid grid-cols-1 gap-1">
                      {(
                        [
                          ['updated', t('wo.queue.dateUpdated')],
                          ['created', t('wo.queue.dateCreated')],
                          ['built', t('wo.queue.demoBuilt')]
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setDateField(id)}
                          className={cn(
                            'flex items-center justify-between rounded px-2 py-1.5 text-left',
                            dateField === id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                          )}
                        >
                          <span>{label}</span>
                          {dateField === id ? <Check className="size-3.5" /> : null}
                        </button>
                      ))}
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-muted-foreground">{t('wo.queue.columnWidth')}</span>
                      <span className="font-mono">{`${opportunityColWidth}px`}</span>
                    </div>
                    <input
                      type="range"
                      min={180}
                      max={420}
                      value={opportunityColWidth}
                      onChange={(e) => setOpportunityColWidth(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'px-2 py-0.5 text-xs',
                  payload?.uiEnabled
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                )}
              >
                {payload?.uiEnabled ? t('wo.queue.surfaceOn') : t('wo.queue.surfaceOff')}
              </Badge>
              <Button
                variant={viewMode === 'places' ? 'default' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  push()
                  setViewMode((v) => (v === 'places' ? 'queue' : 'places'))
                }}
              >
                <MapPin className="size-3.5" />
                {viewMode === 'places' ? t('wo.queue.backToQueue') : t('wo.queue.places')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  push()
                  setViewMode((v) => (v === 'settings' ? 'queue' : 'settings'))
                }}
              >
                <Settings2 className="size-3.5" />
                {t('wo.queue.settings')}
              </Button>
            </div>
          </div>

          {/* Sub-header Status Line */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-muted-foreground text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-foreground">
                {payload?.origin
                  ? payload.origin.replace(/^https?:\/\//, '')
                  : typeof window !== 'undefined'
                    ? window.location.host
                    : 'ops'}
              </span>
              <span>·</span>
              <span>{userFilter === 'all' ? t('wo.queue.allUsers') : `@${userFilter}`}</span>
              <span>·</span>
              <span>{cityFilter === 'all' ? t('wo.queue.allCities') : cityLabel(t, cityFilter)}</span>
              <span>·</span>
              <span>{cmsScope === 'all' ? t('wo.queue.allCms') : cmsScope}</span>
              <span>·</span>
              <span className="font-medium text-foreground">
                {t('wo.queue.woCount', { count: filteredRows.length })}
              </span>
              <span>·</span>
              <span>
                {dateField === 'created'
                  ? t('wo.queue.created')
                  : dateField === 'built'
                    ? t('wo.queue.demoBuilt')
                    : t('wo.queue.updated')}
              </span>
              <span>·</span>
              <span>{t('wo.queue.autoUpdate')}</span>
              {allRows.length >= 250 ? <span>· {t('wo.queue.latestCap')}</span> : null}
              {userFilter !== 'all' || cityFilter !== 'all' || cmsScope !== 'all' || search ? (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setUserFilter('all')
                      setCityFilter('all')
                      setCmsScope('all')
                      setStageFilter('all')
                      setSearch('')
                    }}
                    className="font-medium text-primary hover:underline"
                  >
                    {t('wo.queue.resetFilters')}
                  </button>
                </>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 gap-1 text-xs"
              onClick={() => void load(true)}
              disabled={refreshing}
            >
              <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} />
              {t('wo.queue.refresh')}
            </Button>
          </div>
        </>
      )}

      {viewMode === 'research' ? (
        <WoDubaiPilot writable={writable} />
      ) : viewMode === 'places' ? (
        <WoPlaces address={placesAddress} onAddress={changePlaces} />
      ) : viewMode === 'settings' && draftSettings ? (
        <WoSettingsView
          payload={payload}
          draftSettings={draftSettings}
          setDraftSettings={setDraftSettings}
          draftUiEnabled={draftUiEnabled}
          setDraftUiEnabled={setDraftUiEnabled}
          writable={writable}
          savingSettings={savingSettings}
          settingsSavedMsg={settingsSavedMsg}
          onSaveAll={handleSaveAllSettings}
          keyInputs={keyInputs}
          setKeyInputs={setKeyInputs}
          savingKey={savingKey}
          testingKey={testingKey}
          testResults={testResults}
          onSaveKey={handleSaveProviderKey}
          onTestKey={handleTestProviderKey}
        />
      ) : (
        <>
          {/* Compact Priority User Bar (only running / attention users, or top 5 + "+N more" trigger) */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 font-medium text-[11px] text-muted-foreground">
                  {urgentMembersCount > 0 ? t('wo.queue.activeUsers') : t('wo.queue.recentUsers')}
                </span>
                <Button
                  size="xs"
                  variant={userFilter === 'all' ? 'default' : 'ghost'}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => handleSelectUserTab('all')}
                >
                  {t('wo.common.allCount', { n: allRows.length })}
                </Button>
                {priorityMembers.map((m) => {
                  const active = userFilter === m.login || userFilter === m.accountId
                  return (
                    <Button
                      key={m.accountId}
                      size="xs"
                      variant={active ? 'default' : 'ghost'}
                      className="h-7 gap-1.5 px-2.5 text-xs"
                      onClick={() => handleSelectUserTab(m.login)}
                    >
                      <span>{m.name}</span>
                      <span
                        className={cn(
                          'font-mono text-[11px]',
                          active ? 'text-primary-foreground/80' : 'text-muted-foreground'
                        )}
                      >
                        ({m.count})
                      </span>
                      {(m.runningCount ?? 0) > 0 ? (
                        <span
                          className="inline-block size-1.5 animate-pulse rounded-full bg-primary"
                          title={t('wo.queue.running', { n: m.runningCount ?? 0 })}
                        />
                      ) : null}
                      {m.attentionCount > 0 ? (
                        <span
                          className="inline-block size-1.5 rounded-full bg-destructive"
                          title={t('wo.queue.needAttention', { n: m.attentionCount })}
                        />
                      ) : null}
                    </Button>
                  )
                })}
                {allMembers.length > priorityMembers.length ? (
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                    onClick={() => setUserPopoverOpen(true)}
                  >
                    {t('wo.queue.moreUsers', { n: allMembers.length - priorityMembers.length })}
                    <ChevronDown className="size-3" />
                  </Button>
                ) : null}
              </div>

              {/* Quick City Pills for top 4 cities */}
              {citiesList.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 font-medium text-[11px] text-muted-foreground">
                    {t('wo.queue.cities')}
                  </span>
                  <Button
                    size="xs"
                    variant={cityFilter === 'all' ? 'secondary' : 'ghost'}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setCityFilter('all')}
                  >
                    {t('wo.common.all')}
                  </Button>
                  {citiesList.slice(0, 4).map((c) => {
                    const active = cityFilter.toLowerCase() === c.city.toLowerCase()
                    return (
                      <Button
                        key={c.city}
                        size="xs"
                        variant={active ? 'default' : 'ghost'}
                        className="h-6 gap-1 px-2 text-[11px]"
                        onClick={() =>
                          setCityFilter((prev) =>
                            prev.toLowerCase() === c.city.toLowerCase() ? 'all' : c.city
                          )
                        }
                      >
                        <MapPin className="size-2.5" />
                        <span>{cityLabel(t, c.city)}</span>
                        <span className="font-mono text-[10px] opacity-75">({c.count})</span>
                      </Button>
                    )
                  })}
                  {citiesList.length > 4 ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px] text-muted-foreground"
                      onClick={() => setCityPopoverOpen(true)}
                    >
                      {t('wo.queue.more', { n: citiesList.length - 4 })}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Customer milestones, matching My Opportunities; Attention is a separate bucket. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="xs"
                  variant={stageFilter === 'all' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setStageFilter('all')}
                >
                  {t('wo.common.allCount', { n: stageCounts.all })}
                </Button>
                {WO_CUSTOMER_STAGES.map((st) => {
                  const count = stageCounts[st] ?? 0
                  return (
                    <Button
                      key={st}
                      size="xs"
                      variant={stageFilter === st ? 'default' : 'outline'}
                      className="h-7 text-xs"
                      onClick={() => setStageFilter(st)}
                    >
                      {t(WO_CUSTOMER_LABEL_KEY[st])} ({count})
                    </Button>
                  )
                })}
              </div>

              <Button
                size="xs"
                variant={stageFilter === 'attention' ? 'destructive' : 'outline'}
                className={cn(
                  'h-7 gap-1.5 text-xs',
                  stageFilter !== 'attention' &&
                    stageCounts.attention > 0 &&
                    'border-destructive/50 text-destructive hover:bg-destructive/10'
                )}
                onClick={() => setStageFilter((prev) => (prev === 'attention' ? 'all' : 'attention'))}
              >
                <AlertTriangle className="size-3.5" />
                {t('wo.queue.attention', { n: stageCounts.attention })}
              </Button>
            </div>
          </div>

          {/* Issues to review Box (when Needs attention filter is active) */}
          {stageFilter === 'attention' && attentionRows.length > 0 ? (
            <Card className="border-destructive/40 bg-destructive/5 py-3">
              <CardHeader className="px-4 py-0 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-destructive" />
                    <CardTitle className="text-sm">
                      {t('wo.issues.title', { n: attentionRows.length })}
                    </CardTitle>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() =>
                      handleCopyText(
                        'all-issues',
                        attentionRows
                          .map((r) => r.attentionCommand || `${r.name}: ${r.attentionReason}`)
                          .join('\n')
                      )
                    }
                  >
                    {copiedKey === 'all-issues' ? (
                      <>
                        <Check className="size-3.5" />
                        {t('wo.issues.copiedAll')}
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        {t('wo.issues.copyAll')}
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 px-4 py-0">
                {attentionRows.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/90 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="font-mono text-muted-foreground">#{r.number}</span>
                        <button
                          type="button"
                          onClick={() => void handleSelectRow(r)}
                          className="truncate text-left hover:underline"
                        >
                          {r.name}
                        </button>
                        <Badge variant="outline" className="text-[10px]">
                          @{r.user.login}
                        </Badge>
                        <StageBadge row={r} />
                      </div>
                      <div className="mt-0.5 text-muted-foreground">
                        {r.attentionReason || r.customerStatus || r.statusText}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {writable ? (
                        <>
                          <Button
                            size="xs"
                            variant="default"
                            className="h-7 gap-1 text-xs"
                            disabled={busyAction === `${r.id}:force-complete-brief`}
                            onClick={() => void handleOperatorAction(r.id, 'force-complete-brief')}
                          >
                            <Zap className="size-3" />
                            {t('wo.action.forceBrief')}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            className="h-7 gap-1 text-xs"
                            disabled={busyAction === `${r.id}:reset-cap-resume`}
                            onClick={() => void handleOperatorAction(r.id, 'reset-cap-resume')}
                          >
                            <RotateCcw className="size-3" />
                            {t('wo.action.resetCap')}
                          </Button>
                        </>
                      ) : null}
                      <Button
                        size="xs"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        onClick={() =>
                          handleCopyText(
                            `issue-${r.id}`,
                            r.attentionCommand || `${r.name}: ${r.attentionReason}`
                          )
                        }
                      >
                        {copiedKey === `issue-${r.id}` ? (
                          <>
                            <Check className="size-3" />
                            {t('wo.issues.copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            {t('wo.issues.copyOne')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* Main Grid: 15-Column Table + Right-Hand Sticky Execution Panel */}
          <div
            className={cn(
              'grid grid-cols-1 items-start gap-4',
              selectedRow && 'lg:grid-cols-[minmax(0,1fr)_480px]'
            )}
          >
            <div className="min-w-0 overflow-x-auto rounded-lg border bg-card">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-7 px-2" />
                    <SortableHead
                      label={t('wo.col.wo')}
                      sortKey="number"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                      className="w-16"
                    />
                    <SortableHead
                      label={t('wo.col.step')}
                      sortKey="step"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                      className="w-24"
                    />
                    <SortableHead
                      label={t('wo.col.opportunity')}
                      sortKey="name"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                      style={{
                        width: opportunityColWidth,
                        minWidth: opportunityColWidth,
                        maxWidth: opportunityColWidth
                      }}
                      className="sticky left-0 z-10 bg-muted/90 backdrop-blur"
                    />
                    <SortableHead
                      label={t('wo.col.research')}
                      sortKey="research"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                      className="border-primary/20 border-l bg-primary/5"
                    />
                    <TableHead className="bg-primary/5">{t('wo.col.currentStep')}</TableHead>
                    <TableHead className="bg-primary/5">{t('wo.col.worker')}</TableHead>
                    <SortableHead
                      label={t('wo.col.duration')}
                      sortKey="duration"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                      className="border-primary/20 border-r bg-primary/5"
                    />
                    <SortableHead
                      label={t('wo.col.user')}
                      sortKey="user"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label={t('wo.col.time')}
                      sortKey="time"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <TableHead>{t('wo.col.revId')}</TableHead>
                    <TableHead>{t('wo.col.demoSite')}</TableHead>
                    <SortableHead
                      label={t('wo.col.queue')}
                      sortKey="queue"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label={t('wo.col.status')}
                      sortKey="status"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label={t('wo.col.cmsTemplate')}
                      sortKey="cms"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                    <TableHead>{t('wo.col.notes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={16} className="py-12 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                        {t('wo.queue.loading')}
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={16} className="py-12 text-center text-muted-foreground">
                        {t('wo.queue.empty')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => {
                      const isSelected = row.id === selectedId
                      const pct = woProgressPercent(row)
                      return (
                        <Fragment key={row.id}>
                          <TableRow
                            onClick={() => void handleSelectRow(row)}
                            className={cn(
                              'cursor-pointer transition-colors',
                              !row.read && 'font-medium',
                              isSelected && 'bg-primary/8 hover:bg-primary/12',
                              woNeedsAttention(row) &&
                                !isSelected &&
                                'bg-destructive/4 hover:bg-destructive/8'
                            )}
                          >
                            <TableCell className="px-2">
                              {isSelected ? (
                                <ChevronDown className="size-3.5 text-primary" />
                              ) : (
                                <ChevronRight className="size-3.5 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">#{row.number}</TableCell>
                            <TableCell>
                              <StageBadge row={row} />
                            </TableCell>
                            <TableCell
                              style={{
                                width: opportunityColWidth,
                                minWidth: opportunityColWidth,
                                maxWidth: opportunityColWidth
                              }}
                              className="sticky left-0 z-10 bg-card/95 backdrop-blur"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {!row.read ? (
                                  <Badge
                                    variant="default"
                                    className="h-4 px-1 text-[9px] uppercase tracking-wider"
                                  >
                                    {t('wo.queue.new')}
                                  </Badge>
                                ) : null}
                                <span className="truncate font-medium text-foreground">{row.name}</span>
                              </div>
                              <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (row.city) {
                                      setCityFilter((prev) =>
                                        prev.toLowerCase() === row.city!.toLowerCase() ? 'all' : row.city!
                                      )
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 truncate hover:text-foreground hover:underline"
                                  title={row.address || row.branch}
                                >
                                  <MapPin className="size-2.5 shrink-0" />
                                  <span className="truncate">{row.branch}</span>
                                </button>
                              </div>
                            </TableCell>
                            <TableCell className="border-primary/15 border-l bg-primary/[0.03]">
                              <RollupPill rollup={row.researchRollup} />
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate bg-primary/[0.03]">
                              {row.currentStep}
                            </TableCell>
                            <TableCell className="bg-primary/[0.03] font-mono text-[11px] text-muted-foreground">
                              {row.worker}
                            </TableCell>
                            <TableCell className="border-primary/15 border-r bg-primary/[0.03] font-mono text-[11px]">
                              {formatDuration(row.durationSec)}
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSelectUserTab(row.user.login)
                                }}
                                className="inline-flex items-center gap-1 font-medium hover:underline"
                              >
                                <User className="size-3 text-muted-foreground" />
                                {row.user.login}
                              </button>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {formatRelativeTime(row.updatedAt)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                              {row.revId}
                            </TableCell>
                            <TableCell>
                              {row.demoSite && row.demoUrl ? (
                                <a
                                  href={row.demoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                                >
                                  {row.demoSite}
                                  <ExternalLink className="size-3" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'font-mono text-[10px]',
                                  row.queueState === 'BLOCKED' && 'border-destructive/40 text-destructive',
                                  row.queueState === 'PAUSED' &&
                                    'border-amber-500/40 text-amber-600 dark:text-amber-400',
                                  row.queueState === 'LEASED' && 'border-primary/40 text-primary'
                                )}
                              >
                                {row.queueState}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={cn(
                                'max-w-[180px] truncate',
                                woNeedsAttention(row) && 'font-medium text-destructive'
                              )}
                            >
                              {row.customerStatus ?? t('wo.stage.unavailable')}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-[11px]">
                              <span className="text-muted-foreground uppercase">{row.cms}</span>
                              <span className="mx-1 text-muted-foreground">·</span>
                              <span>{row.template}</span>
                            </TableCell>
                            <TableCell className="max-w-[240px] truncate text-muted-foreground">
                              {row.notes}
                            </TableCell>
                          </TableRow>
                          <TableRow className="border-b hover:bg-transparent">
                            <TableCell colSpan={16} className="p-0">
                              <Progress
                                value={pct}
                                className={cn(
                                  'h-0.5 rounded-none',
                                  woNeedsAttention(row) && '[&>[data-slot=progress-indicator]]:bg-destructive'
                                )}
                              />
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Right-Hand Sticky Execution & Inspector Panel */}
            {selectedRow ? (
              <WoInspectorPanel
                row={selectedRow}
                writable={writable}
                busyAction={busyAction}
                copiedKey={copiedKey}
                onClose={() => {
                  push()
                  setSelectedId(null)
                }}
                onToggleRead={() => void handleToggleRead(selectedRow)}
                onAction={(action) => void handleOperatorAction(selectedRow.id, action)}
                onCopy={handleCopyText}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

function SortableHead({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  className,
  style
}: {
  label: string
  sortKey: WoSortKey
  currentKey: WoSortKey
  dir: 'asc' | 'desc'
  onSort: (k: WoSortKey) => void
  className?: string
  style?: React.CSSProperties
}) {
  const active = currentKey === sortKey
  return (
    <TableHead className={className} style={style}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        <span>{label}</span>
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="size-3 text-primary" />
          ) : (
            <ArrowDown className="size-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}

function WoInspectorPanel({
  row,
  writable,
  busyAction,
  copiedKey,
  onClose,
  onToggleRead,
  onAction,
  onCopy
}: {
  row: WoOpportunityRow
  writable: boolean
  busyAction: string | null
  copiedKey: string | null
  onClose: () => void
  onToggleRead: () => void
  onAction: (
    action: 'force-complete-brief' | 'reset-cap-resume' | 'reclaim-retry' | 'bump-queue' | 'cancel-job'
  ) => void
  onCopy: (key: string, text: string) => void
}) {
  const t = useT()
  return (
    <Card className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto border-primary/25 py-3 shadow-sm">
      <CardHeader className="px-4 py-0 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <StageBadge row={row} />
              <span className="font-mono text-muted-foreground text-xs">#{row.number}</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                @{row.user.login}
              </Badge>
            </div>
            <CardTitle className="mt-1 truncate text-base">{row.name}</CardTitle>
            <CardDescription className="truncate text-xs">{row.branch}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="outline" className="h-7 text-xs" onClick={onToggleRead}>
              {row.read ? t('wo.inspector.markUnread') : t('wo.inspector.markRead')}
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label={t('wo.inspector.close')}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 py-0 text-xs">
        {/* Section 1: WoExecutionPanel (mirrors CiExecution.tsx) */}
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="mb-2 text-muted-foreground">
            {t('wo.inspector.execution', {
              stage: t(WO_STAGE_META[row.stage].labelKey),
              status: row.statusText
            })}
          </p>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">{t('wo.inspector.researchExecution')}</span>
            <RollupPill rollup={row.researchRollup} />
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
            <div>
              {t('wo.inspector.worker')} <span className="font-mono text-foreground">{row.worker}</span>
            </div>
            <div>
              {t('wo.inspector.attempt')}{' '}
              <span className="font-mono text-foreground">
                {row.execution ? `${row.execution.attempt}/${row.execution.maxAttempts}` : '—'}
              </span>
            </div>
            <div>
              {t('wo.inspector.queueState')}{' '}
              <span className="font-mono text-foreground">{row.queueState}</span>
            </div>
            <div>
              {t('wo.inspector.duration')}{' '}
              <span className="font-mono text-foreground">{formatDuration(row.durationSec)}</span>
            </div>
          </div>

          <div className="mt-2.5 space-y-1">
            {row.collectors.map((col) => (
              <details
                key={col.name}
                className="group rounded border bg-background px-2.5 py-1.5"
                open={col.status === 'failure' || col.status === 'running'}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {col.status === 'success' ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                    ) : col.status === 'failure' ? (
                      <XCircle className="size-3.5 shrink-0 text-destructive" />
                    ) : col.status === 'running' ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                    ) : (
                      <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate font-medium">{col.name}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatDuration(col.durationSec)}
                  </span>
                </summary>
                <div className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                  <div className="font-mono text-[10px]">{col.provider}</div>
                  <div className="mt-0.5 text-foreground">{col.detail}</div>
                  {col.unresolved?.length ? (
                    <div className="mt-1">
                      <div className="font-medium text-foreground">{t('wo.inspector.unresolvedBySweep')}</div>
                      <ul className="mt-0.5 space-y-0.5">
                        {col.unresolved.map((item, i) => (
                          <li key={`${item.field}-${item.page ?? ''}-${i}`}>
                            <span className="font-mono text-[10px] text-foreground">{item.field}</span>
                            {item.page ? <span className="font-mono text-[10px]"> · {item.page}</span> : null}
                            {item.why ? <span> — {item.why}</span> : null}
                          </li>
                        ))}
                      </ul>
                      {col.unresolvedMore ? (
                        <div className="mt-0.5">
                          {t('wo.inspector.unresolvedMore', { n: col.unresolvedMore })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Section 2: What happens next & Operator Actions */}
        <div className="rounded-md border p-3">
          <div className="font-semibold text-foreground">{t('wo.inspector.next')}</div>
          <p className="mt-1 text-muted-foreground">
            {woNeedsAttention(row)
              ? row.attentionReason || row.customerStatus || t('wo.inspector.needsReview')
              : row.customerStage === 'outreach'
                ? t('wo.inspector.nextOutreach')
                : row.customerStage === 'demo'
                  ? row.customerStatus === 'Ready to build'
                    ? t('wo.inspector.nextBuild')
                    : t('wo.inspector.nextQa')
                  : row.customerStage === 'cancelled'
                    ? t('wo.inspector.nextCancelled')
                    : t('wo.inspector.nextResearch')}
          </p>

          {writable ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Button
                size="xs"
                variant="default"
                className="h-7 gap-1 text-xs"
                disabled={busyAction !== null}
                onClick={() => onAction('force-complete-brief')}
              >
                <Zap className="size-3" />
                {t('wo.action.forceBrief')}
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={busyAction !== null}
                onClick={() => onAction('reset-cap-resume')}
              >
                <RotateCcw className="size-3" />
                {t('wo.action.resetCap')}
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={busyAction !== null}
                onClick={() => onAction('reclaim-retry')}
              >
                <Play className="size-3" />
                {t('wo.action.reclaim')}
              </Button>
              {row.queueState === 'QUEUED' ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  disabled={busyAction !== null}
                  onClick={() => onAction('bump-queue')}
                >
                  {t('wo.action.bump')}
                </Button>
              ) : null}
              {row.queueState === 'LEASED' || row.queueState === 'QUEUED' ? (
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-7 text-destructive text-xs"
                  disabled={busyAction !== null}
                  onClick={() => onAction('cancel-job')}
                >
                  {t('wo.action.cancelJob')}
                </Button>
              ) : null}
            </div>
          ) : null}

          {row.attentionCommand ? (
            <div className="mt-2 border-t pt-2">
              <Button
                size="xs"
                variant="outline"
                className="h-7 w-full justify-center gap-1.5 text-xs"
                onClick={() => onCopy(`panel-${row.id}`, row.attentionCommand!)}
              >
                {copiedKey === `panel-${row.id}` ? (
                  <>
                    <Check className="size-3.5" />
                    {t('wo.inspector.copiedPrompt')}
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    {t('wo.inspector.copyPrompt')}
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Section 3: Demo site status */}
        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">{t('wo.col.demoSite')}</span>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {row.cms} · {row.template}
            </Badge>
          </div>
          {row.demoSite && row.demoUrl ? (
            <div className="mt-1.5 flex items-center justify-between">
              <a
                href={row.demoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
              >
                {row.demoSite}
                <ExternalLink className="size-3" />
              </a>
              <Badge variant="outline" className="text-[10px]">
                {row.demoStatus}
              </Badge>
            </div>
          ) : (
            <div className="mt-1 text-muted-foreground">{t('wo.inspector.noDemo', { rev: row.revId })}</div>
          )}
        </div>

        {row.websiteUrl ? (
          <div className="rounded-md border p-3 text-[11px]">
            <div className="font-semibold text-foreground text-xs">{t('wo.inspector.currentWebsite')}</div>
            <div className="mt-1 truncate font-mono text-muted-foreground">{row.websiteUrl}</div>
            {row.pageSpeed ? (
              <div className="mt-1.5 grid grid-cols-4 gap-2 font-mono">
                <div>{t('wo.inspector.perf', { n: row.pageSpeed.performance ?? '—' })}</div>
                <div>{`SEO ${row.pageSpeed.seo ?? '—'}`}</div>
                <div>
                  {`LCP ${row.pageSpeed.lcpMs == null ? '—' : `${formatFixed(row.pageSpeed.lcpMs / 1000, 1)}s`}`}
                </div>
                <div>{row.pageSpeed.https ? 'HTTPS' : t('wo.inspector.noHttps')}</div>
                <div className="col-span-4 text-muted-foreground">
                  {t('wo.inspector.checked', { when: formatRelativeTime(row.pageSpeed.checkedAt) })}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-muted-foreground">{t('wo.inspector.notMeasured')}</div>
            )}
          </div>
        ) : null}

        {row.googlePlace ? (
          <div className="rounded-md border p-3 text-[11px]">
            <div className="font-semibold text-foreground text-xs">{t('wo.inspector.googleListing')}</div>
            <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono">
              <div>{t('wo.inspector.amenities', { count: row.googlePlace.amenities })}</div>
              <div>{t('wo.inspector.reviews', { count: row.googlePlace.reviews })}</div>
              <div>{t('wo.inspector.photos', { count: row.googlePlace.photos })}</div>
              {row.googlePlace.fetchedAt ? (
                <div className="col-span-3 text-muted-foreground">
                  {t('wo.inspector.fetched', { when: formatRelativeTime(row.googlePlace.fetchedAt) })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Section 4: Technical details */}
        <div className="rounded-md border p-3 text-[11px] text-muted-foreground">
          <div className="font-semibold text-foreground text-xs">{t('wo.inspector.technical')}</div>
          <div className="mt-1.5 space-y-1 font-mono">
            <div>{t('wo.inspector.opportunityId', { id: row.id })}</div>
            <div className="flex items-center gap-1">
              {t('wo.inspector.account', { email: row.user.email })}
              <ViewAsUserButton email={row.user.email} />
            </div>
            <div>{t('wo.inspector.revision', { rev: row.revId })}</div>
            {row.placeId ? <div>{t('wo.inspector.placeId', { id: row.placeId })}</div> : null}
            <div>{t('wo.inspector.created', { when: formatDateTime(row.createdAt) })}</div>
            <div>{t('wo.inspector.updated', { when: formatDateTime(row.updatedAt) })}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// The server's defaults (`DEFAULT_WO_OPS_SETTINGS.pinnedTemplates`); an empty pin saves as these.
const DEFAULT_PINS: Record<WoCms, string> = {
  joomla: 'tracy-base/j6',
  wordpress: 'tracy-base/wp7',
  emdash: 'tracy-base/emdash-0.x'
}

// Product and provider names: the same in every language.
const CMS_NAMES: Record<WoCms, string> = { joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' }
const APIFY_MAP_CHAIN = 'Apify Google Maps → OSM'

// Settings the pipeline does not read yet (tasks/plan-ops-wo-wiring.md D5): shown locked, value kept.
function NotWired() {
  const t = useT()
  return (
    <Badge variant="outline" className="ml-1 font-normal text-[10px] text-muted-foreground">
      {t('wo.settings.notWired')}
    </Badge>
  )
}

function WoSettingsPanel({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="py-4">
      <CardHeader className="px-5 py-0 pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-0 text-sm">{children}</CardContent>
    </Card>
  )
}

function WoSettingsView({
  payload,
  draftSettings,
  setDraftSettings,
  draftUiEnabled,
  setDraftUiEnabled,
  writable,
  savingSettings,
  settingsSavedMsg,
  onSaveAll,
  keyInputs,
  setKeyInputs,
  savingKey,
  testingKey,
  testResults,
  onSaveKey,
  onTestKey
}: {
  payload: WoPayload | null
  draftSettings: WoOpsSettings
  setDraftSettings: React.Dispatch<React.SetStateAction<WoOpsSettings | null>>
  draftUiEnabled: boolean
  setDraftUiEnabled: (v: boolean) => void
  writable: boolean
  savingSettings: boolean
  settingsSavedMsg: string | null
  onSaveAll: () => void
  keyInputs: Record<WoProviderId, string>
  setKeyInputs: React.Dispatch<React.SetStateAction<Record<WoProviderId, string>>>
  savingKey: string | null
  testingKey: string | null
  testResults: Record<string, WoProviderTestResult>
  onSaveKey: (provider: WoProviderId, rawKey: string) => void
  onTestKey: (provider: WoProviderId) => void
}) {
  const t = useT()
  const [section, setSection] = useState('all')
  const sections = [
    { id: 'general', label: t('wo.settings.general'), description: t('wo.settings.generalDescription') },
    { id: 'keys', label: t('wo.settings.keys'), description: t('wo.settings.keysDescription') },
    {
      id: 'discovery',
      label: t('wo.settings.discovery'),
      description: t('wo.settings.discoveryDescription')
    },
    {
      id: 'providers',
      label: t('wo.settings.providers'),
      description: t('wo.settings.providersDescription')
    },
    { id: 'limits', label: t('wo.settings.limits'), description: t('wo.settings.limitsDescription') },
    {
      id: 'public-demos',
      label: t('wo.settings.publicDemos'),
      description: t('wo.settings.publicDemosDescription')
    },
    {
      id: 'templates',
      label: t('wo.settings.templates'),
      description: t('wo.settings.templatesDescription')
    },
    { id: 'pictures', label: t('wo.settings.pictures'), description: t('wo.settings.picturesDescription') }
  ]
  const currentSection = sections.find((item) => item.id === section)
  const shows = (id: string) => section === 'all' || section === id
  const providers = payload?.providers
  const unofferedPins = (payload?.templateStatuses ?? []).filter((t) => !t.offered)
  const unofferedPin = (cms: WoCms) => unofferedPins.find((t) => t.cms === cms)

  const updateField = <K extends keyof WoOpsSettings>(key: K, value: WoOpsSettings[K]) => {
    setDraftSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }
  const updateSocialCap = (id: WoSocialBudgetId, cap: number) => {
    setDraftSettings((prev) =>
      prev
        ? { ...prev, socialStatsProviderDailyCap: { ...prev.socialStatsProviderDailyCap, [id]: cap } }
        : prev
    )
  }

  const providerCards: {
    id: WoProviderId
    title: string
    subtitle: string
    placeholder: string
  }[] = [
    {
      id: 'deepseek',
      title: t('wo.keys.deepseek.title'),
      subtitle: t('wo.keys.deepseek.subtitle'),
      placeholder: t('wo.keys.deepseek.placeholder')
    },
    {
      id: 'firecrawl',
      title: t('wo.keys.firecrawl.title'),
      subtitle: t('wo.keys.firecrawl.subtitle'),
      placeholder: t('wo.keys.firecrawl.placeholder')
    },
    {
      id: 'jina',
      title: t('wo.keys.jina.title'),
      subtitle: t('wo.keys.jina.subtitle'),
      placeholder: t('wo.keys.jina.placeholder')
    },
    {
      id: 'apify',
      title: t('wo.keys.apify.title'),
      subtitle: t('wo.keys.apify.subtitle'),
      placeholder: t('wo.keys.apify.placeholder')
    },
    {
      id: 'google',
      title: t('wo.keys.google.title'),
      subtitle: t('wo.keys.google.subtitle'),
      placeholder: t('wo.keys.google.placeholder')
    },
    {
      id: 'serpapi',
      title: t('wo.keys.serpapi.title'),
      subtitle: t('wo.keys.serpapi.subtitle'),
      placeholder: t('wo.keys.serpapi.placeholder')
    },
    {
      id: 'rapidapi',
      title: t('wo.keys.rapidapi.title'),
      subtitle: t('wo.keys.rapidapi.subtitle'),
      placeholder: t('wo.keys.rapidapi.placeholder')
    },
    {
      id: 'litescrape',
      title: t('wo.keys.litescrape.title'),
      subtitle: t('wo.keys.litescrape.subtitle'),
      placeholder: t('wo.keys.litescrape.placeholder')
    },
    {
      id: 'scrapecreators',
      title: t('wo.keys.scrapecreators.title'),
      subtitle: t('wo.keys.scrapecreators.subtitle'),
      placeholder: t('wo.keys.scrapecreators.placeholder')
    }
  ]

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:flex-row">
      <nav
        aria-label={t('wo.settings.navLabel')}
        className="flex flex-none flex-wrap gap-1 self-start lg:sticky lg:top-4 lg:w-48 lg:flex-col"
      >
        {[{ id: 'all', label: t('wo.common.all') }, ...sections].map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => setSection(item.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-left text-sm hover:bg-muted/60',
              section === item.id ? 'bg-muted font-medium text-foreground' : 'text-foreground/80'
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <h2 className="font-medium text-base">{currentSection?.label ?? t('wo.settings.allTitle')}</h2>
          <p className="mt-0.5 text-muted-foreground text-sm">
            {currentSection?.description ?? t('wo.settings.allDescription')}
          </p>
        </div>
        {shows('general') && (
          <>
            {' '}
            <Card className="py-4">
              <CardHeader className="px-5 py-0 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{t('wo.general.title')}</CardTitle>
                    <CardDescription className="text-xs">
                      <Trans i18nKey="wo.general.description" components={{ code: <code /> }} />
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Switch
                      checked={draftUiEnabled}
                      disabled={!writable}
                      onCheckedChange={(v) => setDraftUiEnabled(Boolean(v))}
                    />
                    <span className="font-medium text-xs">
                      {draftUiEnabled ? t('wo.general.enabled') : t('wo.general.disabled')}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 px-5 py-0 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border p-3 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-primary" />
                      {t('wo.general.mapDiscovery')}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {providers?.google?.configured
                        ? 'Google Places + Apify + OSM'
                        : providers?.apify?.configured
                          ? 'Google Maps + OSM'
                          : t('wo.general.osmFallback')}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('wo.general.radius', {
                      radius: draftSettings.defaultRadiusM,
                      max: draftSettings.gmapsMaxPlaces
                    })}
                  </p>
                </div>

                <div className="rounded-md border p-3 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="size-3.5 text-primary" />
                      {t('wo.general.webSearch')}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {draftSettings.webSearchProvider.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('wo.general.chain', { chain: draftSettings.websiteFetchChain })}
                  </p>
                </div>

                <div className="rounded-md border p-3 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <ImageIcon className="size-3.5 text-primary" />
                      {t('wo.general.picturePipeline')}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {draftSettings.visionEnabled ? t('wo.general.visionOn') : t('wo.general.visionOff')}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('wo.general.pictureLimits', {
                      vision: draftSettings.maxVisionPictures,
                      handoff: draftSettings.handoffMaxPictures
                    })}
                  </p>
                </div>

                <div className="rounded-md border p-3 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" />
                      {t('wo.general.pinnedTemplates')}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        unofferedPins.length > 0 && 'border-amber-500/40 text-amber-600'
                      )}
                    >
                      {unofferedPins.length > 0
                        ? t('wo.general.notOffered', { n: unofferedPins.length })
                        : t('wo.general.ready')}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('wo.general.defaultCms', {
                      cms: draftSettings.defaultCms,
                      pin: draftSettings.pinnedTemplates[draftSettings.defaultCms]
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
        {shows('keys') && (
          <>
            {' '}
            <Card className="py-4">
              <CardHeader className="px-5 py-0 pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 text-primary" />
                  <CardTitle className="text-base">{t('wo.keys.title')}</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  <Trans i18nKey="wo.keys.description" components={{ code: <code /> }} />
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 px-5 py-0 md:grid-cols-2">
                {providerCards.map((item) => {
                  const info = providers?.[item.id]
                  const testRes = testResults[item.id]
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'space-y-2.5 rounded-lg border p-3.5 text-xs',
                        item.id === 'google' && 'border-primary/25 bg-primary/[0.02] md:col-span-2',
                        ['serpapi', 'rapidapi', 'litescrape'].includes(item.id) && 'md:col-span-2'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-foreground">{item.title}</div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{item.subtitle}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'shrink-0 font-mono text-[10px]',
                            info?.configured
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'text-muted-foreground'
                          )}
                        >
                          {info?.configured
                            ? t(info.source === 'ops' ? 'wo.keys.sourceSaved' : 'wo.keys.sourceEnv', {
                                hint: info.hint ?? ''
                              })
                            : t('wo.keys.notConfigured')}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Input
                          type="password"
                          value={keyInputs[item.id]}
                          disabled={!writable}
                          onChange={(e) => setKeyInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder={
                            info?.configured
                              ? t('wo.keys.replace', { hint: info.hint ?? '' })
                              : item.placeholder
                          }
                          className="h-8 flex-1 font-mono text-xs"
                        />
                        <Button
                          size="xs"
                          variant="default"
                          className="h-8 px-2.5 text-xs"
                          disabled={!writable || !keyInputs[item.id].trim() || savingKey === item.id}
                          onClick={() => onSaveKey(item.id, keyInputs[item.id])}
                        >
                          {savingKey === item.id ? t('wo.keys.saving') : t('wo.keys.save')}
                        </Button>
                        {info?.source === 'ops' ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="h-8 px-2 text-xs"
                            disabled={!writable || savingKey === item.id}
                            onClick={() => onSaveKey(item.id, '')}
                          >
                            {t('wo.keys.clear')}
                          </Button>
                        ) : null}
                        <Button
                          size="xs"
                          variant="outline"
                          className="h-8 px-2.5 text-xs"
                          disabled={!writable || !info?.configured || testingKey === item.id}
                          onClick={() => onTestKey(item.id)}
                        >
                          {testingKey === item.id ? t('wo.keys.testing') : t('wo.keys.test')}
                        </Button>
                      </div>

                      {testRes ? (
                        <div
                          className={cn(
                            'rounded px-2.5 py-1.5 font-mono text-[11px]',
                            testRes.ok
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'bg-destructive/10 text-destructive'
                          )}
                        >
                          <div>{testRes.detail}</div>
                          {testRes.apis
                            ? (['places', 'pagespeed', 'embed'] as const).map((api) => (
                                <div key={api}>
                                  {testRes.apis?.[api].ok ? '✓' : '✗'} {testRes.apis?.[api].detail}
                                </div>
                              ))
                            : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </>
        )}
        {shows('providers') && (
          <WoProviderOrderPanel
            groups={payload?.capabilities}
            providerOrder={draftSettings.providerOrder}
            writable={writable}
            onChange={(next) => updateField('providerOrder', next)}
          />
        )}
        {shows('discovery') && (
          <WoSettingsPanel
            title={t('wo.settings.discovery')}
            description={t('wo.settings.discoveryDescription')}
          >
            <FieldGroup className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel className="text-xs">{t('wo.discovery.mapChain')}</FieldLabel>
                <FieldContent>
                  <ChoiceSelect
                    value={draftSettings.mapDiscoveryProvider ?? 'auto'}
                    disabled={!writable}
                    onValueChange={(v) =>
                      updateField('mapDiscoveryProvider', v as WoOpsSettings['mapDiscoveryProvider'])
                    }
                    className="h-8 text-xs"
                    choices={[
                      { value: 'auto', label: t('wo.discovery.mapAuto') },
                      { value: 'google', label: t('wo.discovery.mapGoogle') },
                      { value: 'apify', label: APIFY_MAP_CHAIN },
                      { value: 'osm', label: t('wo.discovery.mapOsm') }
                    ]}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t('wo.discovery.radius')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={250}
                    max={10000}
                    value={draftSettings.defaultRadiusM}
                    disabled={!writable}
                    onChange={(e) => updateField('defaultRadiusM', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t('wo.discovery.maxPlaces')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={5}
                    max={100}
                    value={draftSettings.gmapsMaxPlaces}
                    disabled={!writable}
                    onChange={(e) => updateField('gmapsMaxPlaces', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
            </FieldGroup>

            <div className="space-y-1.5 rounded-md border bg-primary/[0.02] p-3">
              <div className="font-medium">{t('wo.discovery.enrichment')}</div>
              <div className="flex flex-wrap gap-4 pt-1">
                <label className="inline-flex items-center gap-1.5">
                  <Checkbox
                    checked={draftSettings.googlePlacesPhotos ?? true}
                    disabled={!writable}
                    onCheckedChange={(v) => updateField('googlePlacesPhotos', Boolean(v))}
                  />
                  <span>{t('wo.discovery.placesPhotos')}</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <Checkbox
                    checked={draftSettings.tripadvisorReviews ?? true}
                    disabled={!writable}
                    onCheckedChange={(v) => updateField('tripadvisorReviews', Boolean(v))}
                  />
                  <span>{t('wo.discovery.tripadvisor')}</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <Checkbox
                    checked={draftSettings.pageSpeedCheckEnabled ?? true}
                    disabled={!writable}
                    onCheckedChange={(v) => updateField('pageSpeedCheckEnabled', Boolean(v))}
                  />
                  <span>{t('wo.discovery.pageSpeed')}</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <Checkbox
                    checked={draftSettings.googleMapsEmbed ?? true}
                    disabled
                    onCheckedChange={(v) => updateField('googleMapsEmbed', Boolean(v))}
                  />
                  <span>{t('wo.discovery.mapsEmbed')}</span>
                  <NotWired />
                </label>
              </div>
            </div>

            {/* Find places v2 (tasks/spec-wo-find-v2.md): the map view's browser key, the score's slow-site
                line, and how many sites one poll may send to PageSpeed. */}
            <FieldGroup className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel className="text-xs">{t('wo.discovery.browserKey')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="text"
                    placeholder={t('wo.discovery.browserKeyPlaceholder')}
                    value={draftSettings.googleMapsBrowserKey ?? ''}
                    disabled={!writable}
                    onChange={(e) => updateField('googleMapsBrowserKey', e.target.value)}
                    className="h-8 text-xs"
                  />
                  <FieldDescription className="text-[11px]">
                    {t('wo.discovery.browserKeyHint')}
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t('wo.discovery.slowThreshold')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={draftSettings.slowSiteThreshold ?? 50}
                    disabled={!writable}
                    onChange={(e) => updateField('slowSiteThreshold', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t('wo.discovery.siteChecks')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    value={draftSettings.siteChecksAutoLimit ?? 20}
                    disabled={!writable}
                    onChange={(e) => updateField('siteChecksAutoLimit', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t('wo.discovery.socialPages')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={0}
                    max={40}
                    value={draftSettings.socialStatsAutoLimit ?? 10}
                    disabled={!writable}
                    onChange={(e) => updateField('socialStatsAutoLimit', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t('wo.discovery.menuPhotos')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={draftSettings.menuPhotosPerPlace ?? 24}
                    disabled={!writable}
                    onChange={(e) => updateField('menuPhotosPerPlace', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                  <FieldDescription className="text-[11px]">
                    {t('wo.discovery.menuPhotosHint')}
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>

            <FieldGroup className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel className="text-xs">
                  {t('wo.discovery.webSearch')} <NotWired />
                </FieldLabel>
                <FieldContent>
                  <ChoiceSelect
                    value={draftSettings.webSearchProvider}
                    disabled
                    onValueChange={(v) =>
                      updateField('webSearchProvider', v as WoOpsSettings['webSearchProvider'])
                    }
                    className="h-8 text-xs"
                    choices={[
                      { value: 'auto', label: t('wo.discovery.webAuto') },
                      { value: 'deepseek', label: t('wo.discovery.webDeepseek') },
                      { value: 'jina', label: t('wo.discovery.webJina') },
                      { value: 'firecrawl', label: t('wo.discovery.webFirecrawl') },
                      { value: 'off', label: t('wo.discovery.webOff') }
                    ]}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel className="text-xs">
                  {t('wo.discovery.fetchChain')} <NotWired />
                </FieldLabel>
                <FieldContent>
                  <ChoiceSelect
                    value={draftSettings.websiteFetchChain}
                    disabled
                    onValueChange={(v) =>
                      updateField('websiteFetchChain', v as WoOpsSettings['websiteFetchChain'])
                    }
                    className="h-8 text-xs"
                    choices={[
                      { value: 'crawl-jina-firecrawl-deepseek', label: t('wo.discovery.fetchJinaFirst') },
                      { value: 'crawl-firecrawl-jina', label: t('wo.discovery.fetchFirecrawlFirst') },
                      { value: 'crawl-only', label: t('wo.discovery.fetchCrawlOnly') }
                    ]}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>

            <div className="space-y-1.5 rounded-md border p-3">
              <div className="font-medium">{t('wo.discovery.autoCollect')}</div>
              <div className="flex flex-wrap gap-4 pt-1">
                {(['website', 'facebook', 'instagram', 'tiktok', 'youtube'] as const).map((src) => (
                  <label key={src} className="inline-flex items-center gap-1.5 capitalize">
                    <Checkbox
                      checked={draftSettings.autoCollectSources[src]}
                      disabled={!writable}
                      onCheckedChange={(v) =>
                        updateField('autoCollectSources', {
                          ...draftSettings.autoCollectSources,
                          [src]: Boolean(v)
                        })
                      }
                    />
                    <span>{src === 'website' ? t('wo.discovery.sourceWebsite') : src}</span>
                  </label>
                ))}
              </div>
            </div>

            <FieldGroup className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel className="text-xs">
                  {t('wo.discovery.depth')} <NotWired />
                </FieldLabel>
                <FieldContent>
                  <ChoiceSelect
                    value={draftSettings.depthPreset}
                    disabled
                    onValueChange={(v) => updateField('depthPreset', v as WoOpsSettings['depthPreset'])}
                    className="h-8 text-xs"
                    choices={[
                      { value: 'fast', label: t('wo.discovery.depthFast') },
                      { value: 'standard', label: t('wo.discovery.depthStandard') },
                      { value: 'deep', label: t('wo.discovery.depthDeep') }
                    ]}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel className="text-xs">
                  {t('wo.discovery.partial')} <NotWired />
                </FieldLabel>
                <FieldContent>
                  <ChoiceSelect
                    value={draftSettings.onPartialSource}
                    disabled
                    onValueChange={(v) =>
                      updateField('onPartialSource', v as WoOpsSettings['onPartialSource'])
                    }
                    className="h-8 text-xs"
                    choices={[
                      { value: 'complete', label: t('wo.discovery.partialComplete') },
                      { value: 'pause', label: t('wo.discovery.partialPause') }
                    ]}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </WoSettingsPanel>
        )}
        {shows('public-demos') && <WoPublicDemosPanel />}
        {shows('limits') && (
          <WoSettingsPanel title={t('wo.settings.limits')} description={t('wo.settings.limitsDescription')}>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel className="text-xs">{t('wo.limits.perAccount')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={0}
                    value={draftSettings.socialStatsPerAccountPerDay ?? 200}
                    disabled={!writable}
                    onChange={(e) => updateField('socialStatsPerAccountPerDay', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
            <FieldGroup className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {socialCapRows(draftSettings.socialStatsProviderDailyCap).map((row) => (
                <Field key={row.id}>
                  <FieldLabel className="text-xs">
                    {t(
                      row.unit === 'runs'
                        ? 'wo.limits.runsPerDay'
                        : row.unit === 'units'
                          ? 'wo.limits.unitsPerDay'
                          : 'wo.limits.callsPerDay',
                      { listing: row.listing }
                    )}
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      type="number"
                      min={0}
                      value={row.cap}
                      disabled={!writable}
                      onChange={(e) => updateSocialCap(row.id, Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                    <FieldDescription className="text-[11px]">
                      {t('wo.limits.capHint', {
                        network: row.network,
                        pricing: row.pricing
                          ? t(row.pricing.key)
                          : t('wo.limits.freeTier', {
                              tier: row.freeTier ? t(row.freeTier.key, row.freeTier.params) : ''
                            })
                      })}
                    </FieldDescription>
                    {!row.id.endsWith('-apify') && row.id !== 'youtube-official' && (
                      <div className="grid grid-cols-2 gap-2">
                        <FieldDescription className="col-span-2 text-[11px]">
                          {t('wo.limits.allocation')}
                        </FieldDescription>
                        {(['limit', 'used', 'startsAt', 'endsAt'] as const).map((field) => (
                          <Field key={field} className={field.endsWith('At') ? 'col-span-2' : undefined}>
                            <FieldLabel className="text-[11px]">
                              {t(
                                {
                                  limit: 'wo.limits.cycleLimit',
                                  used: 'wo.limits.cycleUsed',
                                  startsAt: 'wo.limits.cycleStarts',
                                  endsAt: 'wo.limits.cycleEnds'
                                }[field]
                              )}
                            </FieldLabel>
                            <Input
                              className="h-8 text-xs"
                              disabled={!writable}
                              type={field === 'limit' || field === 'used' ? 'number' : 'text'}
                              min={0}
                              placeholder={field.endsWith('At') ? '2026-10-20T00:00:00Z' : '0'}
                              value={draftSettings.socialStatsProviderCycle?.[row.id]?.[field] ?? ''}
                              onChange={(e) =>
                                updateField('socialStatsProviderCycle', {
                                  ...draftSettings.socialStatsProviderCycle,
                                  [row.id]: {
                                    limit: 0,
                                    used: 0,
                                    startsAt: '',
                                    endsAt: '',
                                    ...draftSettings.socialStatsProviderCycle?.[row.id],
                                    [field]:
                                      field === 'limit' || field === 'used'
                                        ? Number(e.target.value)
                                        : e.target.value
                                  }
                                })
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    )}
                    {row.id === 'youtube-official' && (
                      <Field>
                        <FieldLabel className="text-[11px]">{t('wo.limits.youtubeQuota')}</FieldLabel>
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          min={0}
                          max={10000}
                          disabled={!writable}
                          value={draftSettings.socialStatsYouTubeDailyQuota ?? 0}
                          onChange={(e) =>
                            updateField('socialStatsYouTubeDailyQuota', Number(e.target.value))
                          }
                        />
                      </Field>
                    )}
                  </FieldContent>
                </Field>
              ))}
            </FieldGroup>{' '}
            <FieldGroup className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel className="text-xs">{t('wo.limits.apifySearches')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={draftSettings.searchRunsPerDay}
                    disabled={!writable}
                    onChange={(e) => updateField('searchRunsPerDay', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">
                  {t('wo.limits.researchRuns')} <NotWired />
                </FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={draftSettings.researchRunsPerDay}
                    disabled
                    onChange={(e) => updateField('researchRunsPerDay', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t('wo.limits.maxUsd')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    step="0.05"
                    min={0.05}
                    max={5}
                    value={draftSettings.maxChargeUsdPerRun}
                    disabled={!writable}
                    onChange={(e) => updateField('maxChargeUsdPerRun', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </WoSettingsPanel>
        )}
        {shows('templates') && (
          <WoSettingsPanel
            title={t('wo.settings.templates')}
            description={t('wo.settings.templatesDescription')}
          >
            {unofferedPins.length > 0 ? (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="size-4" />
                <AlertTitle className="text-xs">{t('wo.templates.unofferedTitle')}</AlertTitle>
                <AlertDescription className="text-[11px]">
                  {t(
                    draftSettings.templatePinPolicy === 'strict'
                      ? 'wo.templates.unofferedStrict'
                      : 'wo.templates.unofferedFallback',
                    {
                      pins: unofferedPins
                        .map((p) =>
                          p.inspirationHidden
                            ? t('wo.templates.hiddenOnShelf', { pin: `${p.cms}: ${p.slug}` })
                            : `${p.cms}: ${p.slug}`
                        )
                        .join(', ')
                    }
                  )}
                </AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel className="text-xs">{t('wo.templates.defaultCms')}</FieldLabel>
                <FieldContent>
                  <ChoiceSelect
                    value={draftSettings.defaultCms}
                    disabled={!writable}
                    onValueChange={(v) => updateField('defaultCms', v as WoCms)}
                    className="h-8 text-xs"
                    choices={[
                      { value: 'joomla', label: CMS_NAMES.joomla },
                      { value: 'wordpress', label: CMS_NAMES.wordpress },
                      { value: 'emdash', label: CMS_NAMES.emdash }
                    ]}
                  />
                </FieldContent>
                <FieldDescription className="text-[11px]">
                  {t('wo.templates.defaultCmsHint')}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel className="text-xs">{t('wo.templates.policy')}</FieldLabel>
                <FieldContent>
                  <ChoiceSelect
                    value={draftSettings.templatePinPolicy}
                    disabled={!writable}
                    onValueChange={(v) =>
                      updateField('templatePinPolicy', v as WoOpsSettings['templatePinPolicy'])
                    }
                    className="h-8 text-xs"
                    choices={[
                      { value: 'fallback-any-restaurant', label: t('wo.templates.policyFallback') },
                      { value: 'strict', label: t('wo.templates.policyStrict') }
                    ]}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>

            <FieldGroup className="grid grid-cols-3 gap-3">
              {(['joomla', 'wordpress', 'emdash'] as const).map((cms) => (
                <Field key={cms}>
                  <FieldLabel className="text-xs">
                    {t('wo.templates.pinned', { cms: CMS_NAMES[cms] })}
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      value={draftSettings.pinnedTemplates[cms]}
                      placeholder={DEFAULT_PINS[cms]}
                      disabled={!writable}
                      onChange={(e) =>
                        updateField('pinnedTemplates', {
                          ...draftSettings.pinnedTemplates,
                          [cms]: e.target.value
                        })
                      }
                      className="h-8 font-mono text-xs"
                    />
                  </FieldContent>
                  {unofferedPin(cms) ? (
                    <FieldDescription className="text-[11px] text-destructive">
                      {t('wo.templates.notInReleases', { slug: unofferedPin(cms)?.slug ?? '' })}
                    </FieldDescription>
                  ) : (
                    <FieldDescription className="text-[11px]">{t('wo.templates.pinHint')}</FieldDescription>
                  )}
                </Field>
              ))}
            </FieldGroup>
          </WoSettingsPanel>
        )}
        {shows('pictures') && (
          <WoSettingsPanel
            title={t('wo.settings.pictures')}
            description={t('wo.settings.picturesDescription')}
          >
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{t('wo.pictures.curation')}</div>
                <FieldDescription className="text-[11px]">{t('wo.pictures.curationHint')}</FieldDescription>
              </div>
              <Switch
                checked={draftSettings.visionEnabled}
                onCheckedChange={(v) => updateField('visionEnabled', Boolean(v))}
              />
            </div>

            <p className="text-xs text-muted-foreground">{t('wo.pictures.note')}</p>
            <FieldGroup className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel className="text-xs">{t('wo.pictures.maxVision')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={10}
                    max={200}
                    value={draftSettings.maxVisionPictures}
                    onChange={(e) => updateField('maxVisionPictures', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t('wo.pictures.handoffMax')}</FieldLabel>
                <FieldContent>
                  <Input
                    type="number"
                    min={6}
                    max={60}
                    value={draftSettings.handoffMaxPictures}
                    onChange={(e) => updateField('handoffMaxPictures', Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t('wo.pictures.missingHero')}</FieldLabel>
                <FieldContent>
                  <ChoiceSelect
                    value={draftSettings.missingHeroMode}
                    onValueChange={(v) =>
                      updateField('missingHeroMode', v as WoOpsSettings['missingHeroMode'])
                    }
                    className="h-8 text-xs"
                    choices={[
                      { value: 'outpaint-and-scene', label: t('wo.pictures.outpaintScene') },
                      { value: 'outpaint', label: t('wo.pictures.outpaint') },
                      { value: 'real-only', label: t('wo.pictures.realOnly') }
                    ]}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </WoSettingsPanel>
        )}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background py-3">
          {settingsSavedMsg ? (
            <span className="font-medium text-emerald-600 text-xs dark:text-emerald-400">
              {settingsSavedMsg}
            </span>
          ) : null}
          <Button size="sm" disabled={!writable || savingSettings} onClick={onSaveAll} className="gap-1.5">
            {savingSettings ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {t('wo.settings.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

const pilotScoreText = createTranslate()

/** The production pilot view; Storybook supplies only a fixture transport. Reads never refresh social. */
export function WoDubaiPilot({
  writable = false,
  fetchImpl = fetch
}: {
  writable?: boolean
  fetchImpl?: typeof fetch
}) {
  const t = useT()
  const { lang } = useLanguage()
  const [data, setData] = useState<WoDubaiPrefetch | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      setData(await fetchWoDubaiPrefetch(fetchImpl))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [fetchImpl])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [load])
  const action = async (value: 'seed' | 'start' | 'stop' | 'concurrency', concurrency?: number) => {
    setBusy(true)
    try {
      await runWoDubaiPrefetch(value, fetchImpl, concurrency)
      await load()
    } catch (e) {
      await load()
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const stamp = (value: string | null | undefined) =>
    value
      ? formatWith(value, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Dubai' }, lang)
      : '—'
  const completed =
    data?.seeds.filter((s) => s.state === 'completed' || (!s.job_id && s.snapshot_id)).length ?? 0
  const websiteCollected =
    data?.seeds.filter((s) => s.sources.some((r) => r.source === 'website' && r.fetchedAt)).length ?? 0
  const socialPlaces = data?.seeds.filter((s) => s.socials.length > 0).length ?? 0
  const creditUrl = (value: string | undefined) => {
    if (!value) return null
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
    } catch {
      return null
    }
  }
  return (
    <Card id="dubai-pilot" className="my-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{t('wo.pilot.title')}</CardTitle>
            <CardDescription>{t('wo.pilot.subtitle')}</CardDescription>
          </div>
          <Badge variant={data?.campaign?.enabled ? 'default' : 'outline'}>
            {data?.campaign?.enabled
              ? t('wo.pilot.running')
              : data?.campaign?.last_error && !data.seeds.length
                ? t('wo.pilot.placesUnavailable')
                : t('wo.pilot.stopped')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t('wo.pilot.updateFailed')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!data ? (
          <p className="text-muted-foreground text-sm">{t('wo.pilot.loading')}</p>
        ) : (
          <>
            <p className="text-sm">{data.campaign?.selection_rule ?? t('wo.pilot.selectionRule')}</p>
            <p className="text-muted-foreground text-xs">{t('wo.pilot.priority')}</p>
            <Alert>
              <AlertTitle>{t('wo.pilot.sameResearch')}</AlertTitle>
              <AlertDescription>{t('wo.pilot.sameResearchBody')}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void load()}>
                {t('wo.pilot.refresh')}
              </Button>
              {!data.campaign?.seed_source.revision ? (
                <Button
                  size="sm"
                  disabled={!writable || busy || !data.available}
                  onClick={() => void action('seed')}
                >
                  {busy ? t('wo.pilot.loadingRestaurants') : t('wo.pilot.loadRestaurants')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={data.campaign.enabled ? 'outline' : 'default'}
                  disabled={!writable || busy || !data.available}
                  onClick={() => void action(data.campaign?.enabled ? 'stop' : 'start')}
                >
                  {data.campaign.enabled ? t('wo.pilot.stop') : t('wo.pilot.start')}
                </Button>
              )}
              {!data.available ? (
                <span className="text-muted-foreground text-sm">{t('wo.pilot.requires')}</span>
              ) : null}
            </div>
            {data.campaign ? (
              <>
                <Field className="max-w-sm">
                  <FieldLabel htmlFor="dubai-parallel-restaurants">{t('wo.pilot.parallel')}</FieldLabel>
                  <FieldContent>
                    <ChoiceSelect
                      value={String(data.controls.maxPrefetchConcurrency)}
                      disabled={!writable || busy || !data.available}
                      onValueChange={(value) => {
                        const concurrency = Number(value)
                        if ([1, 2, 3].includes(concurrency)) void action('concurrency', concurrency)
                      }}
                      id="dubai-parallel-restaurants"
                      className="h-8 w-24 text-xs"
                      choices={[
                        { value: '1', label: '1' },
                        { value: '2', label: '2' },
                        { value: '3', label: '3' }
                      ]}
                    />
                    <FieldDescription>{t('wo.pilot.parallelHint')}</FieldDescription>
                  </FieldContent>
                </Field>
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Trans
                      i18nKey="wo.pilot.selected"
                      values={{
                        selected: data.seeds.filter((s) => s.facts.selected !== false).length,
                        completed
                      }}
                      components={{ b: <strong /> }}
                    />
                  </div>
                  <div>
                    <Trans
                      i18nKey="wo.pilot.profiles"
                      values={{ website: websiteCollected, social: socialPlaces }}
                      components={{ b: <strong /> }}
                    />
                  </div>
                  <div>
                    <Trans
                      i18nKey="wo.pilot.reservations"
                      values={{
                        starts: data.controls.providerStarts,
                        cost: `$${formatFixed(data.controls.providerCostCents / 100, 2)}`
                      }}
                      components={{ b: <strong /> }}
                    />
                    <p className="text-muted-foreground text-xs">{t('wo.pilot.quotas')}</p>
                  </div>
                  <div>
                    {t('wo.pilot.lastTick', { when: stamp(data.campaign.last_tick_at) })}
                    <br />
                    {t('wo.pilot.nextDue', {
                      when: data.campaign.enabled ? stamp(data.campaign.next_tick_at) : t('wo.pilot.stopped'),
                      n: data.campaign.tick_count
                    })}
                  </div>
                </div>
                <Progress
                  value={data.seeds.length ? (completed / data.seeds.length) * 100 : 0}
                  aria-label={t('wo.pilot.progress')}
                />
                <p className="text-muted-foreground text-xs">
                  {t('wo.pilot.cron', {
                    tick: data.controls.tickSeconds,
                    max: data.controls.maxPrefetchConcurrency,
                    pages: data.controls.websitePages
                  })}
                </p>
                {data.campaign.last_error ? (
                  <p className="text-destructive text-sm">{data.campaign.last_error}</p>
                ) : null}
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">{t('wo.pilot.process')}</summary>
                  <div className="mt-2 space-y-1 break-all text-muted-foreground">
                    <p>{t('wo.pilot.flow')}</p>
                    <p>
                      <a
                        className="text-primary hover:underline"
                        href="https://maps.google.com"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {data.campaign.seed_source.attribution}
                      </a>{' '}
                      ·{' '}
                      <a
                        className="text-primary hover:underline"
                        href={data.campaign.seed_source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('wo.pilot.sourceEndpoint')}
                      </a>
                    </p>
                    <p>{t('wo.pilot.fetched', { when: stamp(data.campaign.seed_source.fetchedAt) })}</p>
                    <p>
                      {t('wo.pilot.sha', {
                        rev: data.campaign.seed_source.revision ?? t('wo.pilot.notFetched')
                      })}
                    </p>
                  </div>
                </details>
                <div className="max-h-[32rem] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('wo.pilot.colRestaurant')}</TableHead>
                        <TableHead>{t('wo.pilot.colJob')}</TableHead>
                        <TableHead>{t('wo.pilot.colSocial')}</TableHead>
                        <TableHead>{t('wo.pilot.colResult')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.seeds.map((seed) => (
                        <TableRow key={seed.external_id}>
                          <TableCell className="max-w-64 whitespace-normal">
                            <div className="font-medium">{seed.facts.name}</div>
                            {seed.facts.selected === false ? (
                              <p className="text-muted-foreground text-xs">
                                {t('wo.pilot.outsideSelection')}
                              </p>
                            ) : null}
                            <a
                              className="text-primary text-xs hover:underline"
                              href={seed.facts.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {seed.external_id}
                            </a>
                            <br />
                            {seed.facts.website ? (
                              <a
                                className="break-all text-primary text-xs hover:underline"
                                href={seed.facts.website}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {seed.facts.website}
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">{t('wo.pilot.noWebsite')}</span>
                            )}
                            {seed.facts.opportunity ? (
                              <div className="mt-2 space-y-1 text-xs">
                                <p>
                                  {seed.facts.rank ? `#${seed.facts.rank} · ` : ''}
                                  {t('wo.pilot.opportunity')}{' '}
                                  <Badge variant="outline">{seed.facts.opportunity.grade}</Badge>{' '}
                                  {seed.facts.opportunity.score}/100
                                  {seed.facts.opportunity.pending ? ` · ${t('wo.pilot.provisional')}` : ''}
                                </p>
                                <details>
                                  <summary className="cursor-pointer">{t('wo.pilot.scoreReasons')}</summary>
                                  <ul className="mt-1 space-y-1 text-muted-foreground">
                                    {seed.facts.opportunity.reasons.map((reason) => (
                                      <li key={reason[0]}>{reasonText(pilotScoreText, reason)}</li>
                                    ))}
                                  </ul>
                                  <p className="text-muted-foreground">
                                    {t('wo.pilot.websiteChecked', {
                                      when: stamp(seed.facts.rankingCheckedAt)
                                    })}
                                  </p>
                                </details>
                              </div>
                            ) : (
                              <p className="mt-2 text-muted-foreground text-xs">
                                {t('wo.pilot.scorePending')}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <Badge variant="outline">
                              {seed.state ?? (seed.snapshot_id ? t('wo.pilot.warm') : t('wo.pilot.waiting'))}
                            </Badge>
                            <p className="text-muted-foreground text-xs">
                              {t('wo.pilot.attempt', {
                                stage: seed.stage ?? t('wo.pilot.notAdmitted'),
                                n: seed.attempt ?? 0
                              })}
                            </p>
                            {seed.sources
                              .filter((r) => r.source === 'website')
                              .map((r) => (
                                <div className="text-xs" key={r.source}>
                                  {r.status}
                                  {r.reason ? ` (${r.reason})` : ''} ·{' '}
                                  {t('wo.pilot.pages', { count: r.coverage?.fetched ?? 0 })}
                                  <br />
                                  {t('wo.pilot.fetched', { when: stamp(r.fetchedAt) })}
                                </div>
                              ))}
                            {seed.last_error ? (
                              <p className="text-destructive text-xs">
                                {seed.last_error.code}: {seed.last_error.reason}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="max-w-60 whitespace-normal">
                            <div className="flex flex-col gap-1">
                              {seed.socials.length ? (
                                seed.socials.map((s) => (
                                  <a
                                    className="break-all text-primary text-xs hover:underline"
                                    key={`${s.network}:${s.url}`}
                                    href={s.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {s.network}: {s.url}
                                  </a>
                                ))
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  {t('wo.pilot.noSocial')}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-muted-foreground text-xs">{t('wo.pilot.notVerified')}</p>
                          </TableCell>
                          <TableCell className="max-w-80 whitespace-normal">
                            <a
                              className="text-primary text-xs hover:underline"
                              href={`?view=places&place=${encodeURIComponent(seed.place_id)}`}
                            >
                              {t('wo.pilot.openRecords')}
                            </a>
                            <p className="text-muted-foreground text-xs">
                              {t('wo.pilot.mediaItems', { count: seed.media_count ?? 0 })}
                            </p>
                            <details>
                              <summary className="cursor-pointer text-xs">
                                {seed.published_at ? t('wo.pilot.latestProfile') : t('wo.pilot.inProgress')}
                              </summary>
                              <div className="mt-2 space-y-1 break-all text-xs">
                                <p>{seed.profile?.name ?? '—'}</p>
                                <p>{seed.profile?.bio ?? t('wo.pilot.noBio')}</p>
                                <p>{seed.profile?.phone ?? t('wo.pilot.noPhone')}</p>
                                <p>{seed.profile?.address ?? t('wo.pilot.noAddress')}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {(seed.images ?? []).map((m) => (
                                    <div key={m.id}>
                                      <a
                                        target="_blank"
                                        rel="noreferrer"
                                        href={`/api/ops/wo/prefetch/dubai/places/${seed.place_id}/media/${m.id}`}
                                      >
                                        <img
                                          loading="lazy"
                                          className="aspect-square w-full rounded object-cover"
                                          src={`/api/ops/wo/prefetch/dubai/places/${seed.place_id}/media/${m.id}`}
                                          alt={m.caption ?? seed.facts.name}
                                        />
                                      </a>
                                      <p className="text-muted-foreground">
                                        {m.credit?.provider}{' '}
                                        {m.credit?.authors
                                          ?.filter((author) => author.displayName)
                                          .map((author, index) => {
                                            const href = creditUrl(author.uri)
                                            return (
                                              <span key={`${author.displayName}:${index}`}>
                                                {index > 0 ? ', ' : null}
                                                {href ? (
                                                  <a
                                                    className="text-primary hover:underline"
                                                    href={href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                  >
                                                    {author.displayName}
                                                  </a>
                                                ) : (
                                                  author.displayName
                                                )}
                                              </span>
                                            )
                                          })}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                                {!seed.images?.length ? (
                                  <p className="text-muted-foreground">{t('wo.pilot.noPhotos')}</p>
                                ) : null}
                                <p>
                                  {t('wo.pilot.snapshot', {
                                    snapshot: seed.snapshot_id ?? '—',
                                    scope: seed.enrichment_scope ?? '—'
                                  })}
                                </p>
                                <p>{t('wo.pilot.published', { when: stamp(seed.published_at) })}</p>
                                <p>{t('wo.pilot.job', { job: seed.job_id ?? '—' })}</p>
                                <p>{t('wo.pilot.place', { place: seed.place_id })}</p>
                              </div>
                            </details>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
