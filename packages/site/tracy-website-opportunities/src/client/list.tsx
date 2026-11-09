import { useDemoChatNavigation } from './demo-chat.ts'
/**
 * My opportunities (spec #512): the full-width list inside the Opportunities tab. Every place shows four pieces
 * (Place, Opportunity, Demo, Status with its next action) as Cards or Compact rows, plus Map where the deployment has
 * a browser map key; the stage bar, Search by name, 50 rows a page newest first, many-row Build, Delete, Resume and
 * Cancel. A row or its name opens Details in the same tab (`onOpen`); there is no side panel.
 *
 * Only moving rows are asked again (research waiting or running, demo sites being built) by id every
 * 3 s; the counts come from the tab every 15 s and after each press; coming back to the page refreshes
 * the rows shown and puts rows added elsewhere on top. An old server (no `counts`) answers every row
 * at once: the screen then filters and counts itself and offers no "select all matching".
 */
import { requestTemplatePick } from '@tracy/core/template-picker'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Search, Trash2, X } from 'lucide-react'
import { Button, InputGroup, InputGroupAddon, InputGroupInput, Spinner, useTabLoading } from '@tracy/ui'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { type PlaceRow, type RowActions, type SiteCheck, ColumnsMenu, PlacesMap } from '@tracy/wo-views'

import { type Api, pressDemo } from './api.ts'
import {
  type MyView,
  type SecondaryField,
  SECONDARY_FIELDS,
  localStore,
  myViews,
  readMyFields,
  readMyView,
  shownMyView,
  writeMyFields,
  writeMyView
} from './column-prefs.ts'
import { useCheckPolls } from './check-polls.ts'
import { useCapabilities } from './find.tsx'
import { mergeChecks, mergeSocialStats, socialStatsOffered } from './flow.ts'
import { DeleteDialog } from './delete-dialog.tsx'
import {
  type DeleteAsk,
  deleteAsk,
  deleteFailedKey,
  deleteOpportunities,
  withoutRows
} from './delete-model.ts'
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
import { MyPlaces, MyViewSwitch } from './my-places.tsx'
import { type NextRun, placePieces, secondaryLines } from './opportunity-pieces.ts'
import { type NextAction, type OpportunityListRow, statusView } from './opportunity-row.ts'
import { POLL_MS, onBackInSight, usePoll } from './poll.ts'
import type { RequestIds } from './request-ids.ts'
import { photoActions, useMaps } from './results.tsx'
import { rankingFor, runAction } from './row-actions.ts'
import { usageFull, type DemoUsage } from './outreach-model.ts'
import { StageFilter } from './stage-filter.tsx'
import type { Translate } from './strings.ts'

const PAGE = 50
/** The list door's `ids` takes at most this many a call. */
const IDS_MAX = 100
const SEARCH_DEBOUNCE_MS = 300

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

  /** Take deleted rows off the screen at once, without asking the list again. */
  const drop = useCallback((deleted: readonly string[]) => {
    if (deleted.length === 0) return
    setState((s) => {
      const rows = s.rows === null ? null : withoutRows(s.rows, deleted)
      const legacyRows = s.legacyRows === null ? null : withoutRows(s.legacyRows, deleted)
      const removed = (s.rows?.length ?? 0) - (rows?.length ?? 0)
      return { ...s, rows, legacyRows, total: s.total === null ? null : Math.max(0, s.total - removed) }
    })
  }, [])

  return {
    state,
    loadingMore,
    more,
    drop,
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
  deleted,
  onAddress,
  onOpen,
  onOpenBrief
}: {
  t: Translate
  api: Api
  ids: RequestIds
  cms: string | null
  address: MyAddress
  account: AccountCounts
  /** Places deleted elsewhere (the Details menu) this tab's lifetime: they leave the rows at once. */
  deleted: readonly string[]
  onAddress: (patch: Partial<MyAddress>) => void
  /** Opens a place's Details page in the same tab (a history entry). */
  onOpen: (opportunityId: string) => void
  onOpenBrief: (opportunityId: string, revisionId: string) => void
}): JSX.Element {
  const locale = interfaceLocale() ?? 'en'
  const filter = address.stage
  const [usage, setUsage] = useState<DemoUsage | null>(null)
  const refreshUsage = useCallback(async () => {
    const answer = await api.demoUsage()
    if (answer.ok) setUsage(answer.body.usage)
  }, [api])
  useEffect(() => {
    void refreshUsage()
  }, [refreshUsage])
  usePoll(refreshUsage, true, 15000)
  const { state, loadingMore, more, drop, refreshIds, refreshShown, reload } = useMyRows(
    api,
    filter,
    address.q
  )
  useEffect(() => drop(deleted), [deleted, drop])
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

  const [chosenView, setChosenView] = useState<MyView>(() => readMyView(localStore()))
  const chooseView = (next: MyView): void => {
    setChosenView(next)
    writeMyView(localStore(), next)
  }
  const [fields, setFields] = useState<ReadonlySet<SecondaryField>>(() => new Set(readMyFields(localStore())))
  const toggleField = (field: SecondaryField): void =>
    setFields((f) => {
      const next = new Set(f)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      writeMyFields(localStore(), next)
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

  // Website checks and social stats for the rows shown, as Find runs them
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
  const checkRows = merged
  const refreshPlaces = (keys: string[]): void => {
    const listed = keys.filter((k) => byId.has(k))
    if (listed.length > 0) void refreshIds(listed)
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
      // Send demo lives on the Details page (its menu).
      if (outcome.kind === 'send-demo') return onOpen(row.id)
      if (outcome.kind === 'open-brief') return onOpenBrief(row.id, outcome.revisionId)
      if (outcome.kind === 'navigate') return window.location.assign(outcome.href)
      if (outcome.kind === 'failed') setActionFailed(true)
      await refreshIds([row.id])
      void account.refresh()
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(row.id)
        return next
      })
    }
  }

  // A press on an expired demo: Reopen a frozen one, Rebuild a deleted one (both read "Build again").
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
      await refreshIds([row.id])
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(row.id)
        return next
      })
    }
  }
  /** The one next action of a place, from its four pieces. */
  const runNext = (row: OpportunityListRow, run: NextRun): void => {
    if (run.kind === 'row') return void act(run.action, row)
    if (run.action === 'build') return void act('build', row)
    if (run.action === 'open') return void act('open-site', row)
    void demoPress(row, row.demo?.frozenAt && !row.demo.deletedAt ? 'reopen' : 'rebuild')
  }

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

  // Delete (the bulk bar; one place deletes from its Details menu): a confirmation first, then the rows leave the screen.
  const [deleting, setDeleting] = useState<DeleteAsk | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const askDelete = (ask: DeleteAsk | null): void => {
    if (ask === null || deleteBusy) return
    setBulkNote(null)
    setDeleting(ask)
  }
  const confirmDelete = async (): Promise<void> => {
    if (deleting === null || deleteBusy) return
    const ask = deleting
    setDeleteBusy(true)
    const outcome = await deleteOpportunities(api, ids, ask.ids)
    setDeleteBusy(false)
    setDeleting(null)
    if (!outcome.ok) {
      setBulkNote(t(deleteFailedKey(outcome.code)))
      return
    }
    drop(outcome.deleted)
    setPicked(
      (p) =>
        new Set(
          withoutRows(
            [...p].map((id) => ({ id })),
            outcome.deleted
          ).map((r) => r.id)
        )
    )
    setAllMatching(false)
    if (ask.ids.length > 1 || outcome.failed > 0)
      setBulkNote(t('delete.result', { deleted: outcome.deleted.length, failed: outcome.failed }))
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

  // The map's card opens Details like a row does.
  const actions: RowActions = {
    onToggle: toggle,
    onOpen: (place) => onOpen(place.key),
    ...photoActions
  }
  const rowOf = (place: PlaceRow): OpportunityListRow => byId.get(place.key) ?? { id: place.key }
  const now = Date.now()
  const pieceOptions = { now, locale, buildBlocked: usageFull(usage) }
  const pieces = shown.map((row) => placePieces(row, t, pieceOptions))
  const fieldList = SECONDARY_FIELDS.filter((f) => fields.has(f))
  const lines = new Map(shown.map((row) => [row.id, secondaryLines(row, t, pieceOptions, fieldList)]))
  const mapsKey = caps?.maps?.browserKey ?? null
  const views = myViews(caps === null ? null : mapsKey)
  const view = shownMyView(chosenView, views)
  const { maps, failed: mapsFailed } = useMaps(mapsKey, view === 'map')
  const mapNote = mapsFailed ? t('map.loadFailed') : t('loading.label')

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
        card={{
          score: true,
          facts: false,
          foot: (place: PlaceRow) => {
            const p = placePieces(rowOf(place), t, pieceOptions)
            return <span className="tracy-wo-small tracy-wo-muted">{p.status.label}</span>
          }
        }}
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
    ) : (
      <MyPlaces
        t={t}
        view={view}
        places={pieces}
        lines={lines}
        selected={picked}
        busy={busy}
        onToggle={toggle}
        onOpen={onOpen}
        onNext={(id, run) => {
          const row = byId.get(id)
          if (row) runNext(row, run)
        }}
      />
    )

  const anyPicked = allMatching || picked.size > 0
  return (
    <div className="tracy-wo-my tracy-wo-results">
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
          <MyViewSwitch t={t} value={view} views={views} onChange={chooseView} />
          {view !== 'map' && (
            <ColumnsMenu
              t={t}
              hidden={new Set()}
              onToggle={() => {}}
              columns={[]}
              fixed={[t('columns.place'), t('columns.score'), t('columns.demo'), t('columns.status')]}
              items={SECONDARY_FIELDS.map((field) => ({
                id: field,
                label: t(`my.field.${field}`),
                shown: fields.has(field),
                onToggle: () => toggleField(field)
              }))}
              note={t('my.columns.note')}
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
              variant="destructive"
              size="sm"
              disabled={bulkBusy || deleteBusy || allMatching}
              onClick={() => askDelete(deleteAsk(shown, picked))}
            >
              <Trash2 aria-hidden="true" />
              {t('delete.button')}
            </Button>
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
      <DeleteDialog
        t={t}
        locale={locale}
        ask={deleting}
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
