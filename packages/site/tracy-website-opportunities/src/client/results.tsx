import { FindActionButton } from './find-action.tsx'
import { type PublicResearchActions, PublicResearchCell } from './public-research-cell.tsx'
/**
 * The Find results: the plugin's adapter around `@tracy/wo-views`. The library only draws; this file
 * owns the result filters, the Columns choice on this device, the site-check and social-stats
 * polling, the photo doors and the Maps SDK.
 */
import { type Dispatch, type JSX, useEffect, useMemo, useState } from 'react'
import { Button, Spinner } from '@tracy/ui'
import { interfaceLocale } from '@tracy/core/interface-languages'
import {
  type MapsApi,
  type PlaceRow,
  type RowActions,
  ColumnsMenu,
  KindTabs,
  PlacesGrid,
  PlacesMap,
  PlacesTable,
  ResultsHeader,
  StatusBadge,
  SortSelect,
  ViewSwitch,
  filterByKind,
  kindCounts,
  sortRows
} from '@tracy/wo-views'

import { type Api, placePhotoUrl, placePhotoUrlById } from './api.ts'
import { localStore, writeHiddenColumns } from './column-prefs.ts'
import { type ResultFilters, applyResultFilters } from './find-input.ts'
import {
  type Flow,
  type FlowAction,
  checkProgress,
  rowHandles,
  socialAnswer,
  socialProgress,
  searchAnswer
} from './flow.ts'
import { useCheckPolls } from './check-polls.ts'
import { sourceLabel } from './cms-label.ts'
import type { Translate } from './strings.ts'

/** Rows drawn before "Show more"; also the server's auto-check budget per call. */
const PAGE = 20

const MAPS_SRC = 'https://maps.googleapis.com/maps/api/js'
let mapsLoad: { key: string; promise: Promise<MapsApi | null> } | null = null

const isMapsApi = (v: unknown): v is MapsApi =>
  typeof v === 'object' && v !== null && 'Map' in v && typeof v.Map === 'function' && 'LatLngBounds' in v

function loadedMaps(): MapsApi | null {
  const google: unknown = Reflect.get(window, 'google')
  const maps: unknown = typeof google === 'object' && google !== null ? Reflect.get(google, 'maps') : null
  return isMapsApi(maps) ? maps : null
}

/** Load Maps JavaScript once per page (and key); null when it cannot load. */
function loadMaps(key: string): Promise<MapsApi | null> {
  if (mapsLoad !== null && mapsLoad.key === key) return mapsLoad.promise
  const promise = new Promise<MapsApi | null>((resolve) => {
    const ready = loadedMaps()
    if (ready !== null) return resolve(ready)
    const callback = '__tracyWoMapsReady'
    Reflect.set(window, callback, () => resolve(loadedMaps()))
    const script = document.createElement('script')
    script.src = `${MAPS_SRC}?key=${encodeURIComponent(key)}&libraries=marker&loading=async&v=weekly&callback=${callback}`
    script.async = true
    script.onerror = () => {
      mapsLoad = null
      resolve(null)
    }
    document.head.appendChild(script)
  })
  mapsLoad = { key, promise }
  return promise
}

/** The Maps SDK while the Map view is open and a browser key exists; `failed` when it would not load. */
export function useMaps(key: string | null, wanted: boolean): { maps: MapsApi | null; failed: boolean } {
  const [state, setState] = useState<{ maps: MapsApi | null; failed: boolean }>({ maps: null, failed: false })
  useEffect(() => {
    if (!wanted || key === null || state.maps !== null) return
    let live = true
    void loadMaps(key).then((maps) => {
      if (live) setState({ maps, failed: maps === null })
    })
    return () => {
      live = false
    }
  }, [key, wanted, state.maps])
  return state
}

export const photoActions: Pick<RowActions, 'photoUrl' | 'photoFallbackUrl'> = {
  // The search's photo name first; when Google expired it, the place id door looks it up again.
  photoUrl: (row, width) =>
    row.photo?.name
      ? placePhotoUrl(row.photo.name, width)
      : row.provider === 'google-places'
        ? placePhotoUrlById(row.providerId, width)
        : null,
  photoFallbackUrl: (row, width) =>
    row.photo?.name && row.provider === 'google-places' ? placePhotoUrlById(row.providerId, width) : null
}

/** The public search door's refusal codes (`public/wo-find-page.js`), in the visitor's words. */
export function publicRefusalKey(code: string | undefined): string {
  if (code === 'RATE_LIMITED') return 'public.error.limit'
  if (code === 'BUSY') return 'public.error.busy'
  if (code === 'DAILY_LIMIT' || code === 'CLOSED' || code === 'FEATURE_OFF') return 'public.error.daily'
  if (code === 'PLACE_NOT_FOUND') return 'public.error.notFound'
  if (code === 'NETWORK') return 'public.error.network'
  return 'find.failed'
}

export function ResultsView({
  t,
  api,
  flow,
  dispatch,
  filters,
  mapsKey,
  socialStats = false,
  onResearch,
  busy = false,
  publicMode
}: {
  t: Translate
  api: Api
  flow: Flow
  dispatch: Dispatch<FlowAction>
  filters: ResultFilters
  mapsKey: string | null
  /** `/capabilities` names a usable social-stats provider (`socialStatsOffered`). */
  socialStats?: boolean
  busy?: boolean
  onResearch?(row: PlaceRow): void
  /** The public Find: no photo, no Map, no poll, no refresh, nothing stored; at most `maxPicks` picks;
   * `research`: each row's shared research and Build demo (`public-research.ts`). */
  publicMode?: { maxPicks: number; research?: PublicResearchActions }
}): JSX.Element | null {
  const isPublic = publicMode !== undefined
  const { search, results } = flow
  const locale = interfaceLocale()
  const [limit, setLimit] = useState(PAGE)
  const filtered = useMemo(() => applyResultFilters(search.candidates, filters), [search.candidates, filters])
  const ofKind = useMemo(() => filterByKind(filtered, results.kind), [filtered, results.kind])
  const sorted = useMemo(
    () => sortRows(ofKind, results.sort, results.dir),
    [ofKind, results.sort, results.dir]
  )
  const shown = sorted.slice(0, limit)
  const selected = useMemo(() => new Set(flow.selected), [flow.selected])
  const { maps, failed: mapsFailed } = useMaps(mapsKey, results.view === 'map')

  useEffect(() => {
    if (!isPublic) writeHiddenColumns(localStore(), results.hidden)
  }, [results.hidden, isPublic])

  // Revalidate a browser-restored list against this account, without another Google search.
  const identityKey = search.candidates.map((row) => row.key).join('|')
  const building = search.candidates.some((row) => row.findAction?.kind === 'building')
  useEffect(() => {
    if (search.phase !== 'done' || isPublic) return
    let live = true
    const refresh = async () => {
      const answer = await api.refreshFind(search.candidates)
      if (live && answer.ok && Array.isArray(answer.body?.candidates))
        dispatch({ type: 'research-refreshed', candidates: searchAnswer(answer.body).candidates })
    }
    void refresh()
    const timer = building ? window.setInterval(() => void refresh(), 10_000) : null
    return () => {
      live = false
      if (timer !== null) window.clearInterval(timer)
    }
  }, [identityKey, search.phase, building])

  // Website checks for the rows on screen (and those still queued), social stats for every linked page:
  // the same polls My opportunities runs (`check-polls.ts`).
  const polls = useCheckPolls({
    api,
    rows: search.candidates.filter((r) => shown.includes(r) || r.siteCheck?.status === 'queued'),
    socialRows: search.candidates,
    active: search.phase === 'done' && !isPublic,
    social: socialStats,
    onChecks: (checks) => dispatch({ type: 'checks-merged', checks }),
    onStats: (stats) => dispatch({ type: 'social-merged', stats })
  })

  // A new search starts at the first page and polls again.
  useEffect(() => {
    if (search.phase !== 'searching') return
    setLimit(PAGE)
    polls.reset()
  }, [search.phase])

  // One row's button: past the auto budget (`force`), then the poll above follows its queued pages.
  const getSocial = async (row: PlaceRow): Promise<void> => {
    const handles = rowHandles(row)
    if (handles.length === 0) return
    dispatch({
      type: 'social-merged',
      stats: Object.fromEntries(handles.map((h) => [h.url, { status: 'queued' }]))
    })
    const answer = await api.socialStats(handles, true)
    if (answer.ok) {
      dispatch({ type: 'social-merged', stats: socialAnswer(handles, answer.body) })
      // A poll stopped by a refusal (the hourly cap) follows the pages this press queued.
      polls.reset()
    } else
      dispatch({
        type: 'social-merged',
        stats: Object.fromEntries(handles.map((h) => [h.url, { status: 'failed' }]))
      })
  }

  if (search.phase === 'idle') return null
  if (search.phase === 'searching') {
    return (
      <p className="tracy-wo-note" role="status">
        <Spinner label={t('find.searching')} /> {t('find.searching')}
      </p>
    )
  }
  if (search.phase === 'failed') {
    return (
      <p className="tracy-wo-error" role="alert">
        {isPublic
          ? t(publicRefusalKey(search.code))
          : search.code === 'FEATURE_OFF'
            ? t('off.title')
            : t('find.failed')}
      </p>
    )
  }
  if (search.candidates.length === 0) return <p className="tracy-wo-note">{t('find.none')}</p>

  const actionButton = (row: PlaceRow) => (
    <FindActionButton row={row} t={t} busy={busy} onAction={(picked) => onResearch?.(picked)} />
  )
  const publicResearch = publicMode?.research
  const rowAction = onResearch
    ? actionButton
    : publicResearch
      ? (row: PlaceRow) => <PublicResearchCell t={t} row={row} actions={publicResearch} />
      : null
  const findColumns = rowAction
    ? [{ id: 'action', header: t('columns.action'), after: 'web' as const, inCard: false, cell: rowAction }]
    : []
  const card = rowAction
    ? {
        foot: (row: PlaceRow) => (
          <div className="tracy-wo-row">
            <StatusBadge t={t} status={row.status} research={row.research} locale={locale} />
            {rowAction(row)}
          </div>
        )
      }
    : undefined
  const actions: RowActions = {
    onToggle: (key) =>
      dispatch(isPublic ? { type: 'toggle', key, max: publicMode.maxPicks } : { type: 'toggle', key }),
    ...(onResearch ? { onResearch } : {}),
    ...(socialStats ? { onGetSocial: (row: PlaceRow) => void getSocial(row) } : {}),
    // A photo URL is a Places Photo call per row: never for a stranger.
    ...(isPublic ? {} : photoActions)
  }
  const center = search.center ?? null
  const mapNote =
    mapsKey === null ? t('map.needsKey') : mapsFailed ? t('map.loadFailed') : t('find.searching')

  return (
    <section
      className="tracy-wo-results"
      aria-label={t('results.found', { count: search.candidates.length })}
    >
      <ResultsHeader
        t={t}
        found={search.candidates.length}
        shown={sorted.length}
        hiddenChains={search.hiddenChains ?? 0}
        sortLabel={t(`results.sort.${results.sort}`)}
        provider={search.provider ?? null}
        checking={isPublic ? null : checkProgress(flow)}
        social={socialStats ? socialProgress(flow) : null}
        kind={results.kind}
      >
        <SortSelect t={t} value={results.sort} onChange={(key) => dispatch({ type: 'results-sort', key })} />
        {/* Map stays pressable without a browser key: the view itself says an admin must add one (map.needsKey). */}
        <ViewSwitch
          t={t}
          value={results.view}
          onChange={(view) => dispatch({ type: 'results-view', view })}
          mapAvailable
          mapHidden={isPublic}
        />
        {results.view === 'table' && (
          <ColumnsMenu
            t={t}
            hidden={results.hidden}
            onToggle={(column) => dispatch({ type: 'results-column', column })}
          />
        )}
      </ResultsHeader>
      {search.fellBack && search.provider ? (
        <p className="tracy-wo-note">
          {t('find.providerFallback', {
            provider: sourceLabel(t, search.provider),
            from: sourceLabel(t, 'google-maps')
          })}
        </p>
      ) : null}
      <KindTabs
        t={t}
        counts={kindCounts(filtered)}
        total={filtered.length}
        value={results.kind}
        onChange={(kind) => dispatch({ type: 'results-kind', kind })}
      />
      {sorted.length === 0 ? (
        <p className="tracy-wo-note">{t('results.empty')}</p>
      ) : results.view === 'map' ? (
        <PlacesMap
          t={t}
          rows={sorted}
          selected={selected}
          actions={actions}
          maps={maps}
          center={center}
          unavailableNote={mapNote}
          card={card}
          locale={locale}
        />
      ) : (
        <>
          {/* In a narrow column the table draws cards itself (library CSS). */}
          {results.view === 'table' ? (
            <PlacesTable
              t={t}
              rows={shown}
              selected={selected}
              hidden={results.hidden}
              sort={results.sort}
              dir={results.dir}
              onSort={(key) => dispatch({ type: 'results-sort', key })}
              actions={actions}
              extraColumns={findColumns}
              card={card}
              locale={locale}
            />
          ) : (
            <PlacesGrid
              t={t}
              rows={shown}
              selected={selected}
              actions={actions}
              locale={locale}
              card={card}
            />
          )}
          {sorted.length > shown.length && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="tracy-wo-more"
              onClick={() => setLimit(sorted.length)}
            >
              {t('find.showMore', { count: sorted.length - shown.length })}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
