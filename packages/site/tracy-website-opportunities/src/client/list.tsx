import { useDemoChatNavigation } from './demo-chat.ts'
/**
 * My opportunities (plan C1, mockup `tasks/mockups/wo-my-opportunities-v2.html`): Find's table with
 * Place · Research · Status · Action (Website, Google, Social, Contact and Demo site in Columns), the
 * stage bar, Search by name, Table / Grid / Map, 50 rows a page newest first, many-row Resume and
 * Cancel, and the Inspector on the right.
 *
 * Only moving rows are asked again (research waiting or running, demo sites being built) by id every
 * 3 s; the counts come from the tab every 15 s and after each press; coming back to the page refreshes
 * the rows shown and puts rows added elsewhere on top. An old server (no `counts`) answers every row
 * at once: the screen then filters and counts itself and offers no "select all matching".
 */
import { requestTemplatePick } from '@tracy/core/template-picker'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Play, Search, X } from 'lucide-react'
import { Button, InputGroup, InputGroupAddon, InputGroupInput, Spinner, useTabLoading } from '@tracy/ui'
import { interfaceLocale } from '@tracy/core/interface-languages'
import {
  type ColumnId,
  type ExtraColumn,
  type PlaceRow,
  type RowActions,
  type SiteCheck,
  ColumnsMenu,
  ScoreCell,
  PlacesGrid,
  PlacesMap,
  PlacesTable,
  ViewSwitch
} from '@tracy/wo-views'

import { type Api, MENU_PARTS, pressDemo } from './api.ts'
import {
  type MyColumn,
  isMyColumn,
  localStore,
  readMyHiddenColumns,
  writeMyHiddenColumns
} from './column-prefs.ts'
import { useCheckPolls } from './check-polls.ts'
import { useCapabilities } from './find.tsx'
import { mergeChecks, mergeSocialStats, socialStatsOffered } from './flow.ts'
import { Inspector } from './inspector.tsx'
import type { FilterValue, MyAddress } from './my-address.ts'
import {
  type AccountCounts,
  bulkFilter,
  chunk,
  createLatest,
  legacyView,
  listParams,
  mergePolled,
  movingIds,
  pageAnswer,
  prependNew,
  selectionJobs,
  stagePin,
  toPlaceRow
} from './my-list.ts'
import { ActionButton, StatusCell } from './opportunity-cells.tsx'
import { type NextAction, type OpportunityListRow, nextAction, statusView } from './opportunity-row.ts'
import { POLL_MS, onBackInSight, usePoll } from './poll.ts'
import type { RequestIds } from './request-ids.ts'
import { useCardResearchAgain, useSourceRetry } from './source-retry.ts'
import { menuAgainTarget } from './menu-model.ts'
import { photoActions, useMaps } from './results.tsx'
import { rankingFor, runAction } from './row-actions.ts'
import { InspectorSplit } from './inspector-split.tsx'
import { DemoSiteCell, ProgressCell } from './demo-progress.tsx'
import { MessageCell } from './send-demo.tsx'
import { usageFull, type DemoUsage } from './outreach-model.ts'
import { StageFilter } from './stage-filter.tsx'
import type { Translate } from './strings.ts'

const PAGE = 50
/** The list door's `ids` takes at most this many a call. */
const IDS_MAX = 100
const SEARCH_DEBOUNCE_MS = 300
const BUILT_INS = ['web', 'google', 'social', 'contact'] as const satisfies readonly ColumnId[]
const isBuiltIn = (c: MyColumn): c is (typeof BUILT_INS)[number] => BUILT_INS.some((b) => b === c)

type ViewMode = 'table' | 'grid' | 'map'

interface ListState {
  /** The rows on screen, in server order; null until the first answer. */
  rows: OpportunityListRow[] | null
  nextCursor: string | null
  /** Rows matching the filter and search on the server. */
  total: number | null
  /** Every row, from an old server that does not page (filtered here). */
  legacyRows: OpportunityListRow[] | null
  failed: boolean
}

const EMPTY: ListState = { rows: null, nextCursor: null, total: null, legacyRows: null, failed: false }

/** The rows for one filter and search: first page, Show more, polling by id, refresh when back in sight. */
function useMyRows(api: Api, filter: FilterValue, q: string) {
  const [state, setState] = useState<ListState>(EMPTY)
  const [loadingMore, setLoadingMore] = useState(false)
  const latest = useRef(createLatest())
  const generation = useRef(0)

  const firstPage = useCallback(
    async (mode: 'replace' | 'merge') => {
      const token = latest.current.next()
      const answer = await api.listPage(listParams({ filter, q, limit: PAGE }))
      if (!latest.current.isCurrent(token)) return
      const page = answer.ok ? pageAnswer(answer.body) : null
      if (page === null) {
        setState((s) => ({ ...s, failed: true }))
        return
      }
      if (!page.paged) {
        setState({ ...EMPTY, legacyRows: page.rows })
        return
      }
      setState((s) =>
        mode === 'merge' && s.rows !== null
          ? { ...s, rows: prependNew(s.rows, page.rows), total: page.total, failed: false }
          : {
              rows: page.rows,
              nextCursor: page.nextCursor,
              total: page.total,
              legacyRows: null,
              failed: false
            }
      )
    },
    [api, filter, q]
  )

  useEffect(() => {
    generation.current += 1
    setState(EMPTY)
    void firstPage('replace')
  }, [firstPage])

  const more = async (): Promise<void> => {
    if (loadingMore || state.nextCursor === null) return
    const at = generation.current
    setLoadingMore(true)
    const answer = await api.listPage(listParams({ filter, q, cursor: state.nextCursor, limit: PAGE }))
    setLoadingMore(false)
    if (at !== generation.current) return
    const page = answer.ok ? pageAnswer(answer.body) : null
    if (page === null) return
    setState((s) => {
      const shown = new Set((s.rows ?? []).map((r) => r.id))
      return {
        ...s,
        rows: [...(s.rows ?? []), ...page.rows.filter((r) => !shown.has(r.id))],
        nextCursor: page.nextCursor
      }
    })
  }

  /** Ask again for exactly these rows (≤ 100 a call) and put the answers in place. */
  const refreshIds = useCallback(
    async (wanted: readonly string[]) => {
      const at = generation.current
      for (const ids of chunk(wanted, IDS_MAX)) {
        const answer = await api.listPage(`ids=${ids.join(',')}`)
        const page = answer.ok ? pageAnswer(answer.body) : null
        if (page === null || at !== generation.current) return
        if (!page.paged) {
          setState({ ...EMPTY, legacyRows: page.rows })
          return
        }
        setState((s) => (s.rows === null ? s : { ...s, rows: mergePolled(s.rows, page.rows) }))
      }
    },
    [api]
  )

  const shownRows = state.rows ?? state.legacyRows ?? []
  const moving = movingIds(shownRows)
  usePoll(
    () => (state.legacyRows !== null ? firstPage('replace') : refreshIds(moving)),
    moving.length > 0,
    POLL_MS
  )

  // Back in sight: rows added elsewhere go on top, the rest are asked again in place.
  const backRef = useRef<() => void>(() => {})
  backRef.current = () => {
    void firstPage('merge')
    const beyond = (state.rows ?? []).slice(PAGE).map((r) => r.id)
    if (beyond.length > 0) void refreshIds(beyond)
  }
  useEffect(() => onBackInSight(() => backRef.current()), [])

  return {
    state,
    loadingMore,
    more,
    refreshIds,
    refreshShown: () => backRef.current(),
    reload: () => firstPage('replace')
  }
}

/** "1 place" / "186 places" in the interface language. */
function countText(t: Translate, locale: string, count: number): string {
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other'
  return t(`list.count.${form}`, { count: new Intl.NumberFormat(locale).format(count) })
}

export function MyOpportunitiesView({
  t,
  api,
  ids,
  address,
  account,
  onAddress,
  onOpenBrief
}: {
  t: Translate
  api: Api
  ids: RequestIds
  cms: string | null
  address: MyAddress
  account: AccountCounts
  onAddress: (patch: Partial<MyAddress>) => void
  onOpenBrief: (opportunityId: string, revisionId: string) => void
}): JSX.Element {
  const locale = interfaceLocale() ?? 'en'
  const filter = address.stage
  const outreach = filter === 'outreach'
  const forceDemo = filter === 'demo' || outreach
  const [usage, setUsage] = useState<DemoUsage | null>(null)
  const [sendId, setSendId] = useState<string | null>(null)
  const refreshUsage = useCallback(async () => {
    const answer = await api.demoUsage()
    if (answer.ok) setUsage(answer.body.usage)
  }, [api])
  useEffect(() => {
    void refreshUsage()
  }, [refreshUsage])
  usePoll(refreshUsage, true, 15000)
  const { state, loadingMore, more, refreshIds, refreshShown, reload } = useMyRows(api, filter, address.q)
  // Back from Details or a Brief (kept mounted, hidden): what was done there shows in the rows.
  const lastPage = useRef(address.page)
  useEffect(() => {
    if (lastPage.current !== null && address.page === null) refreshShown()
    lastPage.current = address.page
  }, [address.page, refreshShown])
  const legacy = state.legacyRows !== null
  const shown = useMemo(
    () =>
      state.legacyRows !== null ? legacyView(state.legacyRows, filter, address.q).rows : (state.rows ?? []),
    [state.rows, state.legacyRows, filter, address.q]
  )
  const counts = legacy ? legacyView(state.legacyRows ?? [], 'all', '').counts : account.counts
  const byId = useMemo(() => new Map(shown.map((r) => [r.id, r])), [shown])
  const places = useMemo(() => shown.map(toPlaceRow), [shown])
  useTabLoading(state.rows === null && state.legacyRows === null && !state.failed)

  const [view, setView] = useState<ViewMode>('table')
  const [hidden, setHidden] = useState<ReadonlySet<MyColumn>>(
    () => new Set(readMyHiddenColumns(localStore()))
  )
  useEffect(() => writeMyHiddenColumns(localStore(), hidden), [hidden])
  const toggleColumn = (column: MyColumn): void =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      return next
    })

  // Search: typed text shows at once, the list asks 300 ms after the last key.
  const [text, setText] = useState(address.q)
  const onAddressRef = useRef(onAddress)
  onAddressRef.current = onAddress
  useEffect(() => setText(address.q), [address.q])
  useEffect(() => {
    if (text === address.q) return
    const timer = window.setTimeout(() => onAddressRef.current({ q: text.slice(0, 100) }), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text, address.q])

  // Selection: picked rows, or every row matching the filter (bulk with `filter`).
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [bulkNote, setBulkNote] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  useEffect(() => {
    setPicked(new Set())
    setAllMatching(false)
  }, [filter, address.q])
  const toggle = (id: string): void => {
    setAllMatching(false)
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelection = (): void => {
    setPicked(new Set())
    setAllMatching(false)
  }
  const jobs = selectionJobs(shown, picked)
  const total = legacy ? shown.length : (state.total ?? shown.length)
  const pageAllPicked = shown.length > 0 && shown.every((r) => picked.has(r.id))

  // Inspector: the row from the list, or asked for by id when it is not on screen (an address).
  const [lonely, setLonely] = useState<OpportunityListRow | null>(null)
  const [lonelyAsk, setLonelyAsk] = useState(0)
  const open = address.opp
  const openRow = open === null ? null : (byId.get(open) ?? (lonely?.id === open ? lonely : null))
  useEffect(() => {
    if (open === null || byId.has(open)) return
    let live = true
    void api.listPage(`ids=${open}`).then((answer) => {
      const page = answer.ok ? pageAnswer(answer.body) : null
      const row = page?.rows.find((r) => r.id === open) ?? null
      if (live) setLonely(row)
    })
    return () => {
      live = false
    }
  }, [api, open, byId, lonelyAsk])
  const detail = useInspectorDetail(api, openRow)
  const retrySource = useSourceRetry(api, ids, openRow?.id ?? null, async () => {
    detail.reload()
    if (openRow !== null) await refreshIds([openRow.id])
  })
  const researchAgain = useCardResearchAgain(
    api,
    ids,
    openRow?.id ?? null,
    `${openRow?.job?.state ?? ''}:${openRow?.job?.updatedAt ?? ''}`,
    async () => {
      detail.reload()
      if (openRow !== null) await refreshIds([openRow.id])
    }
  )
  // Only a place with a Menu previews Read menu again (`menuAgainTarget`).
  const readMenuAgain = useCardResearchAgain(
    api,
    ids,
    menuAgainTarget(openRow?.id ?? null, detail.body?.menu),
    `${openRow?.job?.state ?? ''}:${openRow?.job?.updatedAt ?? ''}`,
    async () => {
      detail.reload()
      if (openRow !== null) await refreshIds([openRow.id])
    },
    MENU_PARTS
  )

  // Website checks and social stats for the rows shown and the Inspector's row, as Find runs them
  // (`check-polls.ts`). A settled answer asks the list for those rows again, so the server re-scores
  // them and the Opportunity spinner ends.
  const caps = useCapabilities(api)
  // Answers heard so far, laid over the rows as Find does, so a row is not asked again while its refresh is on the way.
  const [heardChecks, setHeardChecks] = useState<Readonly<Record<string, SiteCheck>>>({})
  const [heardStats, setHeardStats] = useState<Readonly<Record<string, unknown>>>({})
  const merged = useMemo(
    () => mergeSocialStats(mergeChecks(places, heardChecks), heardStats),
    [places, heardChecks, heardStats]
  )
  const checkRows = useMemo(() => {
    const extra =
      openRow !== null && !byId.has(openRow.id) ? mergeChecks([toPlaceRow(openRow)], heardChecks) : []
    return [...merged, ...extra]
  }, [merged, openRow, byId, heardChecks])
  const refreshPlaces = (keys: string[]): void => {
    if (keys.length === 0) return
    const listed = keys.filter((k) => byId.has(k))
    if (listed.length > 0) void refreshIds(listed)
    if (listed.length < keys.length) setLonelyAsk((n) => n + 1)
  }
  const settled = (status: unknown): boolean =>
    typeof status === 'string' && status !== 'queued' && status !== 'not_queued'
  const polls = useCheckPolls({
    api,
    rows: checkRows,
    active: true,
    social: socialStatsOffered(caps),
    onChecks: (checks) => {
      setHeardChecks((h) => ({ ...h, ...checks }))
      refreshPlaces(
        checkRows.filter((p) => p.website && settled(checks[p.website]?.status)).map((p) => p.key)
      )
    },
    onStats: (stats) => {
      setHeardStats((h) => ({ ...h, ...stats }))
      refreshPlaces(
        checkRows
          .filter((p) =>
            Object.values(p.socials ?? {}).some((url) => {
              const answer = url ? stats[url] : undefined
              return (
                answer !== null && typeof answer === 'object' && 'status' in answer && settled(answer.status)
              )
            })
          )
          .map((p) => p.key)
      )
    }
  })
  // Checks refused for good (not configured here): the website part is not coming, so no spinner waits for it.
  const drawn = useMemo(
    () =>
      polls.sitesStopped
        ? merged.map((p) => (p.score.pending ? { ...p, score: { ...p.score, pending: false } } : p))
        : merged,
    [merged, polls.sitesStopped]
  )

  // One row's next action.
  const [logoWait, setLogoWait] = useState(false)
  const beginDemoChat = useDemoChatNavigation(api, true, setLogoWait)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [actionFailed, setActionFailed] = useState(false)
  const act = async (action: NextAction, row: OpportunityListRow): Promise<void> => {
    if (busy.has(row.id)) return
    setActionFailed(false)
    const followChat = beginDemoChat()
    setBusy((b) => new Set(b).add(row.id))
    try {
      const outcome = await runAction(api, ids, action, row)
      refreshUsage()
      if (outcome.kind === 'demo-chat' && !(await followChat(outcome.actions))) setActionFailed(true)
      if (outcome.kind === 'send-demo') {
        if (!row.outreach) {
          setActionFailed(true)
          return
        }
        setSendId(row.id)
        onAddress({ opp: row.id })
        return
      }
      if (outcome.kind === 'open-brief') return onOpenBrief(row.id, outcome.revisionId)
      if (outcome.kind === 'navigate') return window.location.assign(outcome.href)
      if (outcome.kind === 'failed') setActionFailed(true)
      if (byId.has(row.id)) await refreshIds([row.id])
      else setLonelyAsk((n) => n + 1)
      void account.refresh()
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(row.id)
        return next
      })
    }
  }

  // A press on a row's demo (the Demo column, the Inspector): Extend, Reopen, Rebuild; Retry is the build press.
  const demoPress = async (
    row: OpportunityListRow,
    press: 'extend' | 'reopen' | 'rebuild'
  ): Promise<void> => {
    if (busy.has(row.id)) return
    setActionFailed(false)
    setBusy((b) => new Set(b).add(row.id))
    try {
      const answer = await pressDemo(api, ids, row.id, press)
      refreshUsage()
      if (!answer.ok) {
        if (answer.usage) setUsage(answer.usage)
        setActionFailed(true)
      }
      if (byId.has(row.id)) await refreshIds([row.id])
      else setLonelyAsk((n) => n + 1)
      if (row.id === address.opp) detail.reload()
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(row.id)
        return next
      })
    }
  }
  const demoActions = (row: OpportunityListRow) => ({
    busy: busy.has(row.id),
    onExtend: () => void demoPress(row, 'extend'),
    onReopen: () => void demoPress(row, 'reopen'),
    onRebuild: () => void demoPress(row, 'rebuild'),
    onRetry: () => void act('build', row)
  })

  const bulk = async (action: 'resume' | 'cancel'): Promise<void> => {
    if (bulkBusy) return
    const jobIds = jobs[action]
    if (!allMatching && jobIds.length === 0) return
    const selection = allMatching ? { filter: bulkFilter(filter, address.q) } : { jobIds }
    setBulkBusy(true)
    setBulkNote(null)
    const key = `bulk:${action}:${JSON.stringify(selection)}`
    const { id: requestId } = ids.begin(key)
    const answer = await api.bulk(action, requestId, selection)
    setBulkBusy(false)
    if (!answer.ok) {
      ids.fail(key)
      setBulkNote(answer.code === 'TOO_MANY' ? t('bulk.tooMany') : t('action.failed'))
      return
    }
    ids.succeed(key)
    const n = (v: unknown): number => (typeof v === 'number' ? v : 0)
    setBulkNote(
      t('bulk.result', {
        done: n(answer.body?.done),
        skipped: n(answer.body?.skipped),
        failed: n(answer.body?.failed)
      })
    )
    clearSelection()
    void reload()
    void account.refresh()
  }

  const buildable = shown.filter(
    (row) => picked.has(row.id) && row.stage === 'demo' && !row.latestBuild && !row.demoAction
  )
  const buildBulk = async () => {
    if (bulkBusy || allMatching || !buildable.length) return
    const followChat = beginDemoChat()
    const selected = buildable.map((row) => row.id)
    const key = `bulk:build:${selected.join(',')}`
    setBulkBusy(true)
    setBusy((rows) => new Set([...rows, ...selected]))
    setBulkNote(null)
    try {
      const selection = await requestTemplatePick(undefined, { ranking: await rankingFor(api, selected) })
      if (!selection) return
      const choiceKey = `${key}:${selection.cms}:${selection.design}:${selection.quickstart}`
      const { id: requestId } = ids.begin(choiceKey)
      const answer = await api.buildDemos(selected, requestId, selection)
      if (answer.ok) {
        ids.succeed(choiceKey)
        if (!(await followChat(answer.body.actions))) setBulkNote(t('action.failed'))
        await refreshIds(selected)
        clearSelection()
        void account.refresh()
      } else {
        ids.fail(choiceKey)
        if (answer.usage) setUsage(answer.usage)
        setBulkNote(t(answer.code === 'DEMO_BUILD_DAILY_LIMIT' ? 'v3.limitReached' : 'action.failed'))
      }
      refreshUsage()
    } catch {
      setBulkNote(t('action.failed'))
    } finally {
      setBulkBusy(false)
      setBusy((rows) => new Set([...rows].filter((id) => !selected.includes(id))))
    }
  }

  const actions: RowActions = {
    onToggle: toggle,
    onOpen: (place) => {
      setSendId(null)
      onAddress({ opp: place.key })
    },
    ...photoActions
  }
  const rowOf = (place: PlaceRow): OpportunityListRow => byId.get(place.key) ?? { id: place.key }
  const actionCell = (place: PlaceRow) => (
    <ActionButton
      t={t}
      row={rowOf(place)}
      busy={busy.has(place.key)}
      disabled={usageFull(usage) && ['build', 'retry-demo'].includes(nextAction(rowOf(place)))}
      onAction={(a, r) => void act(a, r)}
    />
  )
  const now = Date.now()
  const demoCell = (place: PlaceRow) => {
    const row = rowOf(place)
    return <DemoSiteCell t={t} locale={locale} row={row} now={now} actions={demoActions(row)} />
  }
  const extraColumns: ExtraColumn[] = [
    // Opportunity, as Find grades it (Lee 19/10): on by default, switchable in Columns.
    ...(hidden.has('score')
      ? []
      : [
          {
            id: 'score',
            header: t('columns.score'),
            position: 'start' as const,
            className: 'tracy-wo-c-score',
            inCard: false,
            cell: (place: PlaceRow) => <ScoreCell t={t} row={place} locale={locale} />
          }
        ]),
    ...(!outreach
      ? [
          {
            id: 'research',
            header: t('v3.progress'),
            position: 'start' as const,
            className: 'tracy-wo-c-research',
            cell: (place: PlaceRow) => <ProgressCell t={t} row={rowOf(place)} locale={locale} now={now} />
          }
        ]
      : []),
    ...(!forceDemo && hidden.has('demo')
      ? []
      : [
          {
            id: 'demo',
            header: t('inspector.demo'),
            // After Website, before Contact (Lee 19/10).
            after: 'web' as const,
            className: 'tracy-wo-c-demo',
            cell: demoCell
          }
        ]),
    ...(outreach
      ? [
          {
            id: 'message',
            header: t('v3.message'),
            className: 'tracy-wo-c-message',
            cell: (place: PlaceRow) => (
              <MessageCell
                t={t}
                draft={rowOf(place).outreach}
                onOpen={() => {
                  setSendId(place.key)
                  onAddress({ opp: place.key })
                }}
              />
            )
          }
        ]
      : [
          {
            id: 'status',
            header: t('columns.status'),
            inCard: false,
            cell: (place: PlaceRow) => <StatusCell t={t} row={rowOf(place)} />
          }
        ]),
    {
      id: 'action',
      header: t('columns.action'),
      inCard: false,
      className: 'tracy-wo-c-action',
      cell: actionCell
    },
    {
      id: 'go',
      header: '',
      inCard: false,
      className: 'tracy-wo-c-go',
      cell: () => <ChevronRight aria-hidden="true" className="tracy-wo-chevron" />
    }
  ]
  const card = {
    score: !hidden.has('score'),
    facts: false,
    // The grid card carries the Demo column too (spec "Demo column": the same two lines).
    ...(!forceDemo && hidden.has('demo') ? {} : { underName: demoCell }),
    foot: (place: PlaceRow) => (
      <>
        {outreach ? null : <StatusCell t={t} row={rowOf(place)} />}
        {actionCell(place)}
      </>
    )
  }
  const builtInHidden = new Set<ColumnId>([...hidden].filter(isBuiltIn))
  const mapsKey = caps?.maps?.browserKey ?? null
  const { maps, failed: mapsFailed } = useMaps(mapsKey, view === 'map')
  const mapNote = mapsKey === null ? t('map.needsKey') : mapsFailed ? t('map.loadFailed') : t('loading.label')

  const searching = address.q.trim() !== ''
  const accountEmpty = counts !== null && counts.all === 0 && !searching
  const list =
    state.failed && shown.length === 0 ? (
      <div className="tracy-wo-stack">
        <p className="tracy-wo-error" role="alert">
          {t('list.failed')}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
          {t('action.retry')}
        </Button>
      </div>
    ) : state.rows === null && state.legacyRows === null ? (
      <div className="tracy-wo-empty" aria-busy="true" />
    ) : accountEmpty ? (
      <div className="tracy-wo-empty">
        <p className="tracy-wo-name">{t('list.empty.title')}</p>
        <p className="tracy-wo-muted">{t('list.empty.body')}</p>
      </div>
    ) : shown.length === 0 ? (
      <div className="tracy-wo-empty">
        <p className="tracy-wo-muted">
          {searching ? t('list.noMatch', { q: address.q.trim() }) : t('list.filterEmpty')}
        </p>
      </div>
    ) : view === 'map' ? (
      <PlacesMap
        t={t}
        rows={drawn}
        selected={picked}
        actions={actions}
        maps={maps}
        center={null}
        unavailableNote={mapNote}
        locale={locale}
        card={card}
        pin={(place) => {
          const row = rowOf(place)
          return { ...stagePin(row), title: `${place.name} · ${t(statusView(row).key)}` }
        }}
        legend={
          <>
            <span className="tracy-wo-line">
              <i className="tracy-wo-dot" data-grade="A" />
              {t('filter.attention')}
            </span>
            <span className="tracy-wo-line">
              <i className="tracy-wo-dot" data-grade="B" />
              {t('status.researching')}
            </span>
            <span className="tracy-wo-line">
              <i className="tracy-wo-dot" data-grade="C" />
              {t('map.legend.steps')}
            </span>
          </>
        }
      />
    ) : view === 'grid' ? (
      <PlacesGrid
        t={t}
        rows={drawn}
        selected={picked}
        actions={actions}
        locale={locale}
        rowClick="open"
        activeKey={open}
        card={card}
        extra={(place) =>
          outreach ? (
            <MessageCell
              t={t}
              draft={rowOf(place).outreach}
              onOpen={() => {
                setSendId(place.key)
                onAddress({ opp: place.key })
              }}
            />
          ) : (
            <ProgressCell t={t} row={rowOf(place)} locale={locale} now={now} />
          )
        }
      />
    ) : (
      <PlacesTable
        t={t}
        rows={drawn}
        selected={picked}
        hidden={builtInHidden}
        sort="score"
        dir={-1}
        onSort={() => {}}
        sortable={false}
        actions={actions}
        columns={BUILT_INS}
        extraColumns={extraColumns}
        rowClick="open"
        activeKey={open}
        card={card}
        locale={locale}
      />
    )

  const anyPicked = allMatching || picked.size > 0
  return (
    <InspectorSplit
      t={t}
      list={
        <div className="tracy-wo-split-list tracy-wo-results">
          <div className="tracy-wo-res-head">
            <div className="tracy-wo-res-title">
              <p className="tracy-wo-count">
                <b>{counts === null ? '' : countText(t, locale, counts.all)}</b>
                <span className="tracy-wo-muted">{` · ${t('list.order')}`}</span>
              </p>
            </div>
            <InputGroup className="tracy-wo-q">
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                value={text}
                maxLength={100}
                placeholder={t('list.search')}
                aria-label={t('list.search')}
                autoComplete="off"
                onChange={(event) => setText(event.target.value)}
              />
            </InputGroup>
            <div className="tracy-wo-tools">
              <ViewSwitch t={t} value={view} onChange={setView} mapAvailable />
              {view === 'table' && (
                <ColumnsMenu
                  t={t}
                  hidden={builtInHidden}
                  onToggle={(c) => {
                    if (isMyColumn(c)) toggleColumn(c)
                  }}
                  columns={BUILT_INS}
                  fixed={[
                    t('columns.place'),
                    ...(outreach ? [t('v3.message')] : [t('v3.progress'), t('columns.status')]),
                    t('columns.action'),
                    ...(forceDemo ? [t('inspector.demo')] : [])
                  ]}
                  items={[
                    {
                      id: 'score',
                      label: t('columns.score'),
                      shown: !hidden.has('score'),
                      onToggle: () => toggleColumn('score')
                    },
                    ...(!forceDemo
                      ? [
                          {
                            id: 'demo',
                            label: t('inspector.demo'),
                            shown: !hidden.has('demo'),
                            onToggle: () => toggleColumn('demo')
                          }
                        ]
                      : [])
                  ]}
                  note={t('columns.remembered')}
                />
              )}
            </div>
          </div>
          <StageFilter t={t} value={filter} counts={counts} onChange={(stage) => onAddress({ stage })} />
          {usage ? (
            <p className="tracy-wo-muted tracy-wo-small" role="status">
              {t(usage.limit === 0 ? 'v3.usageUnlimited' : 'v3.usage', {
                used: usage.used,
                limit: usage.limit
              })}
              {usageFull(usage)
                ? ` · ${t('v3.limitResets', { time: new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(new Date(usage.resetsAt)) })}`
                : null}
            </p>
          ) : null}
          {actionFailed ? (
            <p className="tracy-wo-error" role="alert">
              {t('action.failed')}
            </p>
          ) : null}
          {logoWait ? (
            <p className="tracy-wo-note" role="status">
              {t('demo.logoPending')}
            </p>
          ) : null}
          {bulkNote !== null ? (
            <p className="tracy-wo-note" role="status">
              {bulkNote}
            </p>
          ) : null}
          {!legacy && view !== 'map' && pageAllPicked && total > shown.length ? (
            <p className="tracy-wo-note tracy-wo-select-all">
              {allMatching ? t('select.allOn', { count: total }) : t('select.page', { count: shown.length })}
              {allMatching ? (
                <Button type="button" size="xs" variant="link" onClick={clearSelection}>
                  {t('find.clear')}
                </Button>
              ) : (
                <Button type="button" size="xs" variant="link" onClick={() => setAllMatching(true)}>
                  {t('select.all', { count: total })}
                </Button>
              )}
            </p>
          ) : null}
          {list}
          {state.nextCursor !== null && view !== 'map' ? (
            <div className="tracy-wo-more-long">
              <span className="tracy-wo-small tracy-wo-muted">
                {t('list.showing', { shown: shown.length, total })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void more()}
              >
                {loadingMore ? <Spinner label={t('loading.label')} /> : null}
                {t('find.showMore', { count: Math.min(PAGE, Math.max(0, total - shown.length)) || PAGE })}
              </Button>
            </div>
          ) : null}
          {anyPicked ? (
            <div className="tracy-wo-sticky">
              <div className="tracy-wo-sticky-row">
                <span className="tracy-wo-small tracy-wo-muted tracy-wo-sticky-note">
                  {t('select.count', { count: allMatching ? total : picked.size })}
                </span>
                <Button type="button" variant="ghost" size="sm" disabled={bulkBusy} onClick={clearSelection}>
                  {t('find.clear')}
                </Button>
                {buildable.length ? (
                  <Button
                    size="sm"
                    disabled={bulkBusy || allMatching || usageFull(usage, buildable.length)}
                    onClick={() => void buildBulk()}
                  >
                    {t('v3.buildSelected', { count: buildable.length })}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy || (!allMatching && jobs.cancel.length === 0)}
                  onClick={() => void bulk('cancel')}
                >
                  <X aria-hidden="true" />
                  {t('bulk.cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={bulkBusy || (!allMatching && jobs.resume.length === 0)}
                  onClick={() => void bulk('resume')}
                >
                  {bulkBusy ? <Spinner label={t('loading.label')} /> : <Play aria-hidden="true" />}
                  {allMatching ? t('job.resume') : t('bulk.resume', { count: jobs.resume.length })}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      }
      inspector={
        openRow !== null ? (
          <Inspector
            t={t}
            row={openRow}
            send={sendId === openRow.id ? openRow.outreach : null}
            onCloseSend={() => setSendId(null)}
            buildDisabled={usageFull(usage) && ['build', 'retry-demo'].includes(nextAction(openRow))}
            detail={detail.body}
            failed={detail.failed}
            busy={busy.has(openRow.id)}
            locale={locale}
            now={now}
            onAction={(a, r) => void act(a, r)}
            onDetails={() => onAddress({ page: 'details' })}
            onClose={() => {
              setSendId(null)
              onAddress({ opp: null })
            }}
            onRetry={detail.reload}
            retrySource={retrySource}
            researchAgain={researchAgain}
            readMenuAgain={readMenuAgain}
            demoActions={demoActions(openRow)}
          />
        ) : null
      }
    />
  )
}

/** The open row's detail answer, asked again whenever the row's research, brief or build moves. */
function useInspectorDetail(
  api: Api,
  row: OpportunityListRow | null
): { body: Record<string, unknown> | null; failed: boolean; reload: () => void } {
  const [body, setBody] = useState<Record<string, unknown> | null>(null)
  const [failed, setFailed] = useState(false)
  const id = row?.id ?? null
  const version = row
    ? [
        row.job?.state,
        row.job?.stage,
        row.job?.updatedAt,
        row.latestRevision?.id,
        row.latestBuild?.state,
        row.latestBuild?.done,
        row.latestBuild?.qa,
        row.demoAction?.state,
        row.demoAction?.step,
        row.demoAction?.updatedAt
      ].join('|')
    : ''
  const latest = useRef(createLatest())
  const read = useCallback(async () => {
    if (id === null) return
    const token = latest.current.next()
    const answer = await api.detail(id)
    if (!latest.current.isCurrent(token)) return
    if (!answer.ok || answer.body === null || typeof answer.body !== 'object') {
      setFailed(true)
      return
    }
    setFailed(false)
    setBody(answer.body)
  }, [api, id])
  useEffect(() => {
    setBody(null)
    setFailed(false)
  }, [id])
  useEffect(() => {
    void read()
  }, [read, version])
  return { body, failed, reload: () => void read() }
}
