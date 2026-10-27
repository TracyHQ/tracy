import { requestTemplatePick } from '@tracy/core/template-picker'
import { useDemoChatNavigation } from './demo-chat.ts'
/**
 * Find places: a place (typed, or the person's location), a radius and the Advanced search, or one
 * web address. The rows found are drawn by `results.tsx`; picks are sent from the sticky bar.
 */
import { type Dispatch, type JSX, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Globe, Link2, LocateFixed, MapPin, Search, SlidersHorizontal } from 'lucide-react'
import {
  Button,
  InputGroupAddon,
  InputGroupButton,
  NativeSelect,
  NativeSelectOption,
  Spinner,
  useComboboxAnchor
} from '@tracy/ui'
import { interfaceLocale } from '@tracy/core/interface-languages'

import { type Api, type Capabilities, sendPicks } from './api.ts'
import { type FindMode, ModeSwitch } from '@tracy/wo-views/link-rows'
import { rowsOf, spreadPaste } from '@tracy/wo-views/link-rows-model'
import { FindLinks } from './find-links.tsx'
import { CUISINES } from 'website-opportunities/domain/place-kinds.mjs'
import { AdvancedPanel, DEFAULT_ADVANCED, DEFAULT_FILTERS } from './find-advanced.tsx'
import {
  type AdvancedOptions,
  type Depth,
  type ResultFilters,
  type SearchArea,
  DEFAULT_RADIUS_M,
  RADII_M,
  activeFilterCount,
  classifyInput,
  depthFor,
  filtersOnKey,
  nearbyPlace,
  searchBody
} from './find-input.ts'
import {
  type Flow,
  type FlowAction,
  type PlaceRow,
  checkProgress,
  searchAnswer,
  selectedCandidates,
  socialStatsOffered
} from './flow.ts'
import { localStore } from './column-prefs.ts'
import { openingStep, readLastSearch, readPlace, writeLastSearch, writePlace } from './find-memory.ts'
import {
  type LocationState,
  findLocation,
  geolocationPermission,
  locationNoteShown,
  quietLocation
} from './location.ts'
import { PlaceBox } from './place-box.tsx'
import { PUBLIC_RADII_M, handedKey, openPublicPick, takePublicPick } from './public-pick.ts'
import { researchMoving, usePublicResearch } from './public-research.ts'
import { type Suggestion, createSuggester, pickedArea } from './place-suggest.ts'
import type { RequestIds } from './request-ids.ts'
import { findParts } from './find-parts.ts'
import { ResultsView } from './results.tsx'
import { newUuid } from './uuid.ts'
import { rankingFor } from './row-actions.ts'
import { sourceLabel } from './cms-label.ts'
import type { Translate } from './strings.ts'

const DEPTH_LIMITS: Readonly<Record<Depth, number>> = { quick: 20, standard: 60 }
const QUICK_UP_TO_M = 3000

/** "3 km" / "500 m" in the interface language, by the platform's own unit formatter. */
function radiusLabel(m: number): string {
  const km = m >= 1000
  return new Intl.NumberFormat(interfaceLocale(), {
    style: 'unit',
    unit: km ? 'kilometer' : 'meter',
    unitDisplay: 'short'
  }).format(km ? m / 1000 : m)
}

/** The city the server places this person in, asked once per page: the place hint names it, never a fixed city. */
let nearbyAsk: Promise<string | null> | null = null
function useNearbyPlace(api: Api, enabled = true): [string | null, (label: string) => void] {
  const [place, setPlace] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    nearbyAsk ??= api
      .approxLocation()
      .then((answer) =>
        answer.ok && typeof answer.body?.label === 'string' ? nearbyPlace(answer.body.label) : null
      )
      .catch(() => null)
    void nearbyAsk.then((found) => {
      if (live && found !== null) setPlace((shown) => shown ?? found)
    })
    return () => {
      live = false
    }
  }, [api, enabled])
  return [place, (label) => setPlace((shown) => nearbyPlace(label) ?? shown)]
}

/** What this server can do; null until it answered (or when it could not be read). */
export function useCapabilities(api: Api): Capabilities | null {
  const [caps, setCaps] = useState<Capabilities | null>(null)
  useEffect(() => {
    let live = true
    void api.capabilities().then((answer) => {
      if (live && answer.ok) setCaps(answer.body ?? null)
    })
    return () => {
      live = false
    }
  }, [api])
  return caps
}

/**
 * The sign-in-free Find (`public-find.tsx`). It governs effects as well as buttons: no history read
 * or write, no locating or searching on mount, no hand-over intake, no suggestions, no link input,
 * no server-side filter, the public radii only, and Continue. Research runs on the shared place job
 * (`public-research.ts`); Build demo hands one researched place over through sign-in (`onBuild`).
 */
export interface PublicMode {
  maxPicks: number
  onContinue(rows: PlaceRow[], area: { lat: number; lon: number; radiusM: number }): void
  onBuild(row: PlaceRow, area: { lat: number; lon: number; radiusM: number }): void
}

/** A public pick as a point (Place Details in the typing session), else its words as an area name. */
async function publicPickedArea(
  resolve: (placeId: string) => ReturnType<Api['resolvePlace']>,
  choice: Suggestion
): Promise<SearchArea> {
  const answer = await resolve(choice.placeId).catch(() => null)
  const body = answer?.ok ? answer.body : null
  const lat = body?.lat
  const lon = body?.lon
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)
    ? { kind: 'point', lat, lon, label: choice.text }
    : { kind: 'place', query: choice.text }
}

/** What the public search door takes: an area name or a point, and a radius. Nothing else. */
function publicSearchBody(area: SearchArea, radiusM: number): Record<string, unknown> {
  return area.kind === 'point'
    ? { lat: area.lat, lon: area.lon, radiusM }
    : { query: area.query.trim(), radiusM }
}

export function FindView({
  t,
  api,
  ids,
  flow,
  dispatch,
  onSent,
  publicMode
}: {
  t: Translate
  api: Api
  ids: RequestIds
  flow: Flow
  dispatch: Dispatch<FlowAction>
  onSent: () => void
  publicMode?: PublicMode
}): JSX.Element {
  const isPublic = publicMode !== undefined
  const [logoWait, setLogoWait] = useState(false)
  const beginDemoChat = useDemoChatNavigation(api, !isPublic, setLogoWait)
  const inputId = useId()
  const radiusId = useId()
  const advancedId = useId()
  const caps = useCapabilities(api)
  const [near, setNear] = useNearbyPlace(api, !isPublic)
  const [text, setText] = useState('')
  const inputVersion = useRef(0)
  const searchVersion = useRef(0)
  const [radius, setRadius] = useState(DEFAULT_RADIUS_M)
  const [searchedRadius, setSearchedRadius] = useState(DEFAULT_RADIUS_M)
  const [location, setLocation] = useState<LocationState>({ state: 'idle' })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advanced, setAdvanced] = useState<AdvancedOptions>(DEFAULT_ADVANCED)
  const [filters, setFilters] = useState<ResultFilters>(DEFAULT_FILTERS)
  const [lastArea, setLastArea] = useState<SearchArea | null>(null)
  const [sending, setSending] = useState(false)
  const [failedNames, setFailedNames] = useState<string[] | null>(null)
  const [mode, setMode] = useState<FindMode>('search')
  const [linkRows, setLinkRows] = useState<string[]>(() => rowsOf())
  const [linkName, setLinkName] = useState('')
  /** A link submitted from the search field: links mode sends it as soon as it opens. */
  const [linksAuto, setLinksAuto] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const publicResearch = usePublicResearch(api, dispatch, isPublic)
  /** Build demo handed over from the public Find: acted on once the signed-in rows are in. */
  const [handedBuild, setHandedBuild] = useState<string | null>(null)
  const anchor = useComboboxAnchor()
  const suggester = useMemo(
    () =>
      createSuggester({
        ask: (q, session) => api.suggestPlaces(q, session, interfaceLocale()),
        onSuggestions: (list) => {
          setSuggestions(list)
          // The combobox only opens on a keystroke; answers arrive later, so open for them while the box has focus.
          setSuggestOpen(list.length > 0 && anchor.current?.contains(document.activeElement) === true)
        }
      }),
    [api, anchor]
  )
  useEffect(() => () => suggester.stop(), [suggester])
  const classified = classifyInput(text)
  // The public door only geocodes an area: whatever is typed is an area name there.
  const input =
    isPublic && classified.kind === 'link' ? { kind: 'place' as const, query: text.trim() } : classified
  const searching = flow.search.phase === 'searching'
  const picks = selectedCandidates(flow)
  const maxRadius = caps?.search?.maxRadiusM
  const radii = isPublic
    ? PUBLIC_RADII_M
    : typeof maxRadius === 'number'
      ? RADII_M.filter((m) => m <= maxRadius)
      : RADII_M
  const depthLimits = { ...DEPTH_LIMITS, ...caps?.search?.depths }
  const cuisines = caps?.cuisines?.length ? caps.cuisines : CUISINES

  /** `label`: the words the place field shows for this search, remembered with it. */
  /** The place ids it shows; null when it failed or a newer search replaced it. */
  const runSearch = async (
    area: SearchArea,
    options: AdvancedOptions = advanced,
    label = text,
    within = radius
  ): Promise<readonly string[] | null> => {
    suggester.reset()
    setSuggestOpen(false)
    setLastArea(area)
    setSearchedRadius(within)
    const requestVersion = ++searchVersion.current
    dispatch({ type: 'search-start' })
    const answer = await api.search(
      isPublic ? publicSearchBody(area, within) : searchBody(area, within, options)
    )
    if (requestVersion !== searchVersion.current) return null
    if (!answer.ok) {
      dispatch({ type: 'search-failed', code: answer.code })
      return null
    }
    const found = searchAnswer(answer.body)
    dispatch({ type: 'search-done', ...found })
    // The next visit opens on these results (a day), or searches this place again (90 days).
    if (found.center !== null && !isPublic) {
      const place = {
        ...(area.kind === 'text' ? { search: { ...area, sessionToken: undefined } } : {}),
        lat: found.center.lat,
        lon: found.center.lon,
        label: area.kind !== 'point' ? area.query : label
      }
      const now = Date.now()
      writePlace(localStore(), place, now)
      const kept = writeLastSearch(localStore(), { place, radius: within, answer: answer.body }, now)
      // Seen in the console only: the next visit searches again instead of reopening on these results.
      if (kept === 'none')
        console.warn('[tracy-website-opportunities] the last search could not be remembered on this device')
    }
    return found.candidates.map((row) => row.providerId)
  }

  // Opening Find: the last results, else a search around the remembered place, else around where the
  // person is (no permission prompt: the browser's position only when already allowed). Once a tab.
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    // The public Find searches only when the visitor asks: no hand-over, history or location here.
    if (isPublic) return
    // Picks handed over from the sign-in-free /find page win over every remembered search.
    const handed = takePublicPick({
      location: window.location,
      replaceUrl: (url) => window.history.replaceState(window.history.state, '', url)
    })
    if (handed !== null) {
      setText('')
      if (RADII_M.includes(handed.radiusM)) setRadius(handed.radiusM)
      let mine = -1
      const session = newUuid()
      void openPublicPick(handed, {
        search: async (area, within) => {
          const shown = await runSearch(area, advanced, '', within)
          mine = searchVersion.current
          return shown
        },
        api,
        session: () => session,
        lang: interfaceLocale(),
        current: () => searchVersion.current === mine,
        dispatch,
        onBuild: setHandedBuild
      })
      return
    }
    const now = Date.now()
    const step = openingStep({
      shown: flow.search.phase !== 'idle',
      last: readLastSearch(localStore(), now),
      place: readPlace(localStore(), now)
    })
    if (step.kind === 'restore') {
      const { place, radius: within, answer } = step.last
      setText(place.label)
      if (RADII_M.includes(within)) setRadius(within)
      setLastArea(place.search ?? { kind: 'point', lat: place.lat, lon: place.lon })
      dispatch({ type: 'search-done', ...searchAnswer(answer) })
    } else if (step.kind === 'search') {
      setText(step.place.label)
      void runSearch(
        step.place.search ?? { kind: 'point', lat: step.place.lat, lon: step.place.lon },
        advanced,
        step.place.label
      )
    } else if (step.kind === 'locate') {
      const version = inputVersion.current
      void (async () => {
        const permission = await geolocationPermission()
        const answer = await quietLocation(
          { secure: window.isSecureContext === true, geolocation: navigator.geolocation, permission },
          () => api.approxLocation()
        )
        if (version !== inputVersion.current || (answer.state !== 'found' && answer.state !== 'approx'))
          return
        const label = answer.state === 'approx' ? answer.label : ''
        if (label !== '') {
          setText(label)
          setNear(label)
        }
        await runSearch({ kind: 'point', lat: answer.lat, lon: answer.lon }, advanced, label)
      })()
    }
    // Once, on the first render of the tab's Find: later visits keep what is on screen.
  }, [])

  // The signed-in rows say whether this account may build that place now (`findAction`: the published
  // research is usable, no demo pending or live); otherwise the place stays selected and nothing starts.
  useEffect(() => {
    if (handedBuild === null || flow.search.phase !== 'done') return
    const row = flow.search.candidates.find((candidate) => candidate.providerId === handedBuild)
    setHandedBuild(null)
    if (row?.findAction?.kind === 'build') void act(row)
  }, [handedBuild, flow.search])

  const locate = async (): Promise<void> => {
    const version = ++inputVersion.current
    setLocation({ state: 'asking' })
    const answer = await findLocation(
      {
        secure: window.isSecureContext === true,
        geolocation: typeof navigator === 'undefined' ? undefined : navigator.geolocation
      },
      () => api.approxLocation()
    )
    if (version !== inputVersion.current) return
    setLocation(answer)
    if (answer.state === 'approx') {
      setText(answer.label)
      setNear(answer.label)
    }
    if (answer.state === 'found' || answer.state === 'approx')
      await runSearch(
        { kind: 'point', lat: answer.lat, lon: answer.lon },
        advanced,
        answer.state === 'approx' ? answer.label : ''
      )
  }

  /** The person's own edit: the location note no longer describes the box. */
  const type = (next: string): void => {
    inputVersion.current++
    setText(next)
    setLocation({ state: 'idle' })
    suggester.type(next)
  }

  const pick = async (choice: Suggestion): Promise<void> => {
    const version = ++inputVersion.current
    const session = suggester.session()
    setText(choice.text)
    setLocation({ state: 'idle' })
    setSuggestOpen(false)
    const resolve = (placeId: string) => api.resolvePlace(placeId, session, interfaceLocale())
    // The public door searches an area only: every pick becomes its point (no `intent: 'place'`).
    const area = isPublic ? await publicPickedArea(resolve, choice) : await pickedArea(resolve, choice)
    if (version !== inputVersion.current) return
    await runSearch(
      area.kind === 'text' && area.placeId ? { ...area, sessionToken: session } : area,
      advanced,
      choice.text
    )
  }

  const submit = async (): Promise<void> => {
    if (input.kind === 'place') await runSearch({ kind: 'text', query: input.query })
    // One link typed in the search field is added in links mode, where its refusals and picker live.
    if (input.kind === 'link') {
      setLinkRows(rowsOf([text.trim()]))
      setLinkName('')
      setText('')
      setLinksAuto(true)
      setMode('links')
    }
  }

  const switchMode = (next: FindMode): void => {
    setLinksAuto(false)
    setMode(next)
  }

  /** Several links pasted into the search field go to the link rows, one per row. */
  const pasteLinks = (pasted: string): boolean => {
    const spread = spreadPaste(rowsOf(), 0, pasted)
    if (spread === null) return false
    setLinkRows(spread.rows)
    setLinkName(spread.name)
    setLinksAuto(false)
    setMode('links')
    return true
  }

  const linksDone = (): void => {
    setLinkRows(rowsOf())
    setLinkName('')
    setLinksAuto(false)
    onSent()
  }

  const apply = (next: { advanced: AdvancedOptions; filters: ResultFilters }): void => {
    const googleChanged =
      JSON.stringify(searchBody({ kind: 'place', query: '' }, radius, advanced)) !==
      JSON.stringify(searchBody({ kind: 'place', query: '' }, radius, next.advanced))
    setAdvanced(next.advanced)
    setFilters(next.filters)
    setAdvancedOpen(false)
    if (googleChanged && lastArea !== null) void runSearch(lastArea, next.advanced)
  }

  const act = async (row: import('@tracy/wo-views').PlaceRow): Promise<void> => {
    if (sending) return
    const action = row.findAction
    if (action?.kind === 'view' && action.siteKey) {
      window.location.assign(`/${encodeURIComponent(action.siteKey)}/`)
      return
    }
    if (action?.kind !== 'build') return send([row])
    const followChat = beginDemoChat()
    setSending(true)
    setFailedNames(null)
    let selection
    try {
      // A place already saved is ranked by its trade; a new one is saved only after the pick, so it opens ungrouped.
      const ranking = action.opportunityId ? await rankingFor(api, [action.opportunityId]) : null
      selection = await requestTemplatePick(undefined, { ranking })
    } catch {
      setFailedNames([row.name])
      setSending(false)
      return
    }
    if (!selection) {
      setSending(false)
      return
    }
    const created = action.opportunityId ? null : await api.create({ candidate: row })
    const made = action.opportunityId ?? (created?.ok ? created.body?.opportunity?.id : undefined)
    if (!made) {
      setFailedNames([row.name])
      setSending(false)
      return
    }
    const key = `find-demo:${made}:${selection.cms}:${selection.design}:${selection.quickstart}`
    const request = ids.begin(key)
    const answer = await api.buildDemo(made, request.id, undefined, selection, undefined, true)
    setSending(false)
    if (answer.ok) {
      ids.succeed(key)
      if (answer.body.actions?.some((item) => item.workflow === 'agent-demo/1')) {
        if (!(await followChat(answer.body.actions))) setFailedNames([row.name])
      } else dispatch({ type: 'open', view: { name: 'detail', id: made } })
    } else {
      ids.fail(key)
      setFailedNames([row.name])
    }
  }

  const send = async (rows = picks): Promise<void> => {
    if (sending || rows.length === 0) return
    setSending(true)
    setFailedNames(null)
    const outcome = await sendPicks(api, rows, ids)
    setSending(false)
    if (outcome.failed.length > 0) setFailedNames(outcome.failed)
    else {
      dispatch({ type: 'sent' })
      onSent()
    }
  }

  const searchedArea = (): { lat: number; lon: number; radiusM: number } | null => {
    const at = flow.search.center ?? (lastArea?.kind === 'point' ? lastArea : null)
    return at ? { lat: at.lat, lon: at.lon, radiusM: searchedRadius } : null
  }
  const toResearch = picks.filter(
    (row) => !row.research && !researchMoving(publicResearch.states[row.providerId])
  )

  const locationNote = !locationNoteShown(location, text)
    ? null
    : location.state === 'asking'
      ? 'find.location.asking'
      : `find.location.${location.state}`
  const auto = advanced.depth === undefined || advanced.depth === 'auto'
  const depthWord = t(`advanced.depth.${auto ? depthFor(radius) : advanced.depth}`)
  const depthSummary = auto
    ? t('find.summary.auto', { depth: depthWord })
    : t('find.summary.fixed', { depth: depthWord })
  const filterCount = activeFilterCount(advanced, filters)
  const summary = isPublic
    ? filterCount === 0
      ? ''
      : t(filtersOnKey(filterCount, interfaceLocale()), { count: filterCount })
    : filterCount === 0
      ? depthSummary
      : t('find.advancedSummary', {
          depth: depthSummary,
          filters: t(filtersOnKey(filterCount, interfaceLocale()), { count: filterCount })
        })

  const parts = findParts(mode, isPublic)
  return (
    <div className="tracy-wo-stack">
      {!isPublic && (
        <ModeSwitch
          mode={mode}
          onMode={switchMode}
          search={
            <>
              <Search aria-hidden="true" />
              {t('find.mode.search')}
            </>
          }
          links={
            <>
              <Link2 aria-hidden="true" />
              {t('find.mode.links')}
            </>
          }
        />
      )}
      {parts.linksForm && (
        <FindLinks
          t={t}
          api={api}
          ids={ids}
          rows={linkRows}
          onRows={setLinkRows}
          name={linkName}
          onName={setLinkName}
          onDone={linksDone}
          autoSubmit={linksAuto}
        />
      )}
      {mode === 'search' && (
        <form
          className="tracy-wo-search"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div
            className="tracy-wo-field tracy-wo-search-place"
            onPasteCapture={(event) => {
              if (!isPublic && pasteLinks(event.clipboardData.getData('text'))) event.preventDefault()
            }}
          >
            <label className="tracy-wo-label" htmlFor={inputId}>
              {t(isPublic ? 'public.input.label' : 'find.input.label')}
            </label>
            <PlaceBox
              id={inputId}
              placeholder={
                isPublic
                  ? t('public.input.placeholder')
                  : near === null
                    ? t('find.input.placeholder')
                    : t('find.input.placeholderNear', { place: near })
              }
              listLabel={t('find.suggest.label')}
              anchor={anchor}
              text={text}
              suggestions={suggestions}
              open={suggestOpen}
              onOpenChange={setSuggestOpen}
              onType={type}
              onPick={(choice) => void pick(choice)}
            >
              <InputGroupAddon>
                <MapPin aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  disabled={location.state === 'asking' || searching}
                  onClick={() => void locate()}
                >
                  <LocateFixed aria-hidden="true" />
                  {t('find.useLocation')}
                </InputGroupButton>
              </InputGroupAddon>
            </PlaceBox>
          </div>
          {input.kind !== 'link' && (
            <div className="tracy-wo-field">
              <label className="tracy-wo-label" htmlFor={radiusId}>
                {t('find.radius.label')}
              </label>
              <NativeSelect
                id={radiusId}
                value={String(radius)}
                onChange={(event) => setRadius(Number(event.target.value))}
              >
                {radii.map((m) => (
                  <NativeSelectOption key={m} value={String(m)}>
                    {radiusLabel(m)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          <Button type="submit" disabled={input.kind === 'empty' || searching || sending}>
            {input.kind === 'link' ? <Globe aria-hidden="true" /> : <Search aria-hidden="true" />}
            {input.kind === 'link' ? t('find.addLink') : t('find.search')}
          </Button>
        </form>
      )}
      {mode === 'search' && locationNote !== null && (
        <p className="tracy-wo-note" role="status">
          {location.state === 'approx' ? t(locationNote, { place: location.label }) : t(locationNote)}
        </p>
      )}
      {mode === 'search' && input.kind === 'link' && (
        <p className="tracy-wo-note">{t('find.linkHint', { source: sourceLabel(t, input.source) })}</p>
      )}

      {mode === 'search' && input.kind !== 'link' && (
        <div className="tracy-wo-row tracy-wo-wrap">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="tracy-wo-adv-toggle"
            aria-expanded={advancedOpen}
            aria-controls={advancedId}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden="true" />
            {t('find.advanced')}
            <ChevronDown aria-hidden="true" className="tracy-wo-chev" />
          </Button>
          <span className="tracy-wo-small tracy-wo-muted">{summary}</span>
        </div>
      )}
      {mode === 'search' && advancedOpen && input.kind !== 'link' && (
        <AdvancedPanel
          t={t}
          id={advancedId}
          advanced={advanced}
          filters={filters}
          cuisines={cuisines}
          depthLimits={depthLimits}
          autoDepth={depthFor(radius)}
          quickUpTo={radiusLabel(QUICK_UP_TO_M)}
          checking={isPublic ? null : checkProgress(flow)}
          onApply={apply}
          publicMode={isPublic}
        />
      )}

      {flow.search.preselected !== undefined && flow.search.phase === 'done' && (
        <p className="tracy-wo-note" role="status">
          {t(handedKey(flow.search.preselected, interfaceLocale()), { count: flow.search.preselected })}
        </p>
      )}
      {failedNames !== null && picks.length === 0 && (
        <p className="tracy-wo-error" role="alert">
          {t('find.sentFailed', { names: failedNames.join(', ') })}
        </p>
      )}
      {logoWait ? (
        <p className="tracy-wo-note" role="status">
          {t('demo.logoPending')}
        </p>
      ) : null}
      {parts.results && (
        <ResultsView
          t={t}
          api={api}
          flow={flow}
          dispatch={dispatch}
          filters={filters}
          mapsKey={caps?.maps?.browserKey ?? null}
          socialStats={!isPublic && socialStatsOffered(caps)}
          {...(isPublic
            ? {
                publicMode: {
                  maxPicks: publicMode.maxPicks,
                  research: {
                    states: publicResearch.states,
                    onResearch: (row: PlaceRow) => void publicResearch.research([row.providerId]),
                    again: {
                      preview: (placeId: string) => api.publicAgainPreview(placeId),
                      start: publicResearch.researchAgain
                    },
                    onBuild: (row: PlaceRow) => {
                      const area = searchedArea()
                      if (area) publicMode.onBuild(row, area)
                    }
                  }
                }
              }
            : { onResearch: (row: PlaceRow) => void act(row) })}
          busy={sending}
        />
      )}
      {isPublic && flow.search.phase === 'done' && (
        <>
          <p className="tracy-wo-note">{t('public.top')}</p>
          <p className="tracy-wo-note">{t('public.credit')}</p>
        </>
      )}

      {isPublic && flow.search.phase === 'done' && picks.length > 0 && (
        <div className="tracy-wo-sticky" data-public-continue="">
          {picks.length >= publicMode.maxPicks && (
            <p className="tracy-wo-note" role="status">
              {t('public.limit', { count: publicMode.maxPicks })}
            </p>
          )}
          <div className="tracy-wo-sticky-row">
            <span className="tracy-wo-small tracy-wo-muted tracy-wo-sticky-note">{t('public.next')}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'clear-selection' })}
            >
              {t('find.clear')}
            </Button>
            {toResearch.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void publicResearch.research(toResearch.map((row) => row.providerId))}
              >
                {t(
                  new Intl.PluralRules(interfaceLocale()).select(toResearch.length) === 'one'
                    ? 'public.research.selected.one'
                    : 'public.research.selected.other',
                  { count: toResearch.length }
                )}
              </Button>
            )}
            <Button
              type="button"
              className="tracy-wo-sticky-send"
              onClick={() => {
                const area = searchedArea()
                if (area) publicMode.onContinue(picks, area)
              }}
            >
              {t(
                new Intl.PluralRules(interfaceLocale()).select(picks.length) === 'one'
                  ? 'public.continue.one'
                  : 'public.continue.other',
                { count: picks.length }
              )}
            </Button>
          </div>
        </div>
      )}
      {/* Only while something is picked: an empty bar would offer nothing to do. */}
      {parts.results && !isPublic && flow.search.phase === 'done' && picks.length > 0 && (
        <div className="tracy-wo-sticky">
          {failedNames !== null && (
            <p className="tracy-wo-error" role="alert">
              {t('find.sentFailed', { names: failedNames.filter(Boolean).join(', ') })}
            </p>
          )}
          <div className="tracy-wo-sticky-row">
            <span className="tracy-wo-small tracy-wo-muted tracy-wo-sticky-note">
              {t('find.selected', { count: picks.length })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending}
              onClick={() => dispatch({ type: 'clear-selection' })}
            >
              {t('find.clear')}
            </Button>
            <Button
              type="button"
              className="tracy-wo-sticky-send"
              disabled={sending}
              onClick={() => void send()}
            >
              {sending ? <Spinner label={t('find.sending')} /> : null}
              {sending ? t('find.sending') : t('find.send', { count: picks.length })}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
