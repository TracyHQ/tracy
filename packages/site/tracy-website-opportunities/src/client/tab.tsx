/**
 * The Website Opportunities tab. Off (the operator's switch) it draws a plain notice and asks
 * nothing; until `/api/ui` has answered it waits, so a page load never flashes the notice.
 *
 * On: two sub-tabs, Find places | My opportunities N (plan D5). It opens on My opportunities when the
 * account has any, else on Find; the sub-tab, the list's filter and search, the row in the Inspector
 * and the Details or Brief page live in the page address (`my-address.ts`), so a reload lands back.
 */
import { type JSX, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { List, Search } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, useTabLoading } from '@tracy/ui'

import type { Api } from './api.ts'
import type { BriefTabSeed } from './brief-tab.tsx'
import { DetailView, RevisionView } from './detail.tsx'
import { FindView } from './find.tsx'
import { localStore, readHiddenColumns } from './column-prefs.ts'
import { flowReducer, initialFlow } from './flow.ts'
import { CMS_ORDER, settingsView } from './gate.ts'
import { MyOpportunitiesView } from './list.tsx'
import { type MyAddress, type SubTab, addressFromSearch, searchWithAddress } from './my-address.ts'
import { type AccountCounts, type Counts, legacyView, pageAnswer, startingSubTab } from './my-list.ts'
import { onBackInSight, usePoll } from './poll.ts'
import type { RequestIds } from './request-ids.ts'
import type { Translate } from './strings.ts'

export type FeatureState = 'pending' | 'on' | 'off'

/** Stage counts are asked again this often, and after every press (council 19/10), not every poll. */
export const COUNTS_MS = 15_000

export function OffNotice({ t }: { t: Translate }): JSX.Element {
  return (
    <div className="tracy-wo-empty">
      <p className="tracy-wo-name">{t('off.title')}</p>
      <p className="tracy-wo-muted">{t('off.body')}</p>
    </div>
  )
}

/** The account's Default CMS, for the template picker; null when it cannot be read. */
function useDefaultCms(api: Api): string | null {
  const [cms, setCms] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void api.settings().then((answer) => {
      if (!live || !answer.ok) return
      const view = settingsView(answer.body)
      if (view !== null && CMS_ORDER.includes(view.cms)) setCms(view.cms)
    })
    return () => {
      live = false
    }
  }, [api])
  return cms
}

/** Counts for the stage bar and the sub-tab, every 15 s, when the page comes back in sight, and on demand. */
function useAccountCounts(api: Api): AccountCounts {
  const [state, setState] = useState<{ counts: Counts | null; legacy: boolean }>({
    counts: null,
    legacy: false
  })
  const refresh = useCallback(async () => {
    const answer = await api.listPage('limit=1')
    const page = answer.ok ? pageAnswer(answer.body) : null
    if (page === null) return
    setState(
      page.paged
        ? { counts: page.counts, legacy: false }
        : { counts: legacyView(page.rows, 'all', '').counts, legacy: true }
    )
  }, [api])
  useEffect(() => {
    void refresh()
  }, [refresh])
  usePoll(refresh, true, COUNTS_MS)
  useEffect(() => onBackInSight(() => void refresh()), [refresh])
  return { ...state, refresh }
}

/** The address state, read once on mount and written on every press (never on a render). */
function useAddress(): [MyAddress, (next: MyAddress) => void] {
  const [address, setAddress] = useState<MyAddress>(() =>
    typeof window === 'undefined' ? addressFromSearch('') : addressFromSearch(window.location.search)
  )
  const write = useCallback((next: MyAddress) => {
    setAddress(next)
    if (typeof window === 'undefined') return
    const { pathname, search, hash } = window.location
    const target = `${pathname}${searchWithAddress(search, next)}${hash}`
    if (target !== `${pathname}${search}${hash}`)
      window.history.replaceState(window.history.state, '', target)
  }, [])
  return [address, write]
}

function SubTabs({
  t,
  value,
  counts,
  onChange
}: {
  t: Translate
  value: SubTab
  counts: Counts | null
  onChange: (value: SubTab) => void
}): JSX.Element {
  const research = counts?.research ?? 0
  return (
    <div className="tracy-wo-sub">
      <Tabs value={value} onValueChange={(v) => onChange(v === 'find' ? 'find' : 'mine')}>
        <TabsList variant="line" aria-label={t('tab.title')} className="tracy-wo-sub-list">
          <TabsTrigger value="find">
            <Search aria-hidden="true" />
            {t('find.title')}
          </TabsTrigger>
          <TabsTrigger value="mine">
            <List aria-hidden="true" />
            {t('list.title')}
            {counts !== null ? <span className="tracy-wo-sub-n">{counts.all}</span> : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <span className="tracy-wo-stages-grow" aria-hidden="true" />
      {research > 0 ? (
        <span className="tracy-wo-sub-live" role="status">
          {t('v3.research')} {research}
        </span>
      ) : null}
    </div>
  )
}

function Flow({
  t,
  api,
  ids,
  openBriefTab
}: {
  t: Translate
  api: Api
  ids: RequestIds
  openBriefTab: ((seed: BriefTabSeed) => void) | null
}): JSX.Element {
  const [flow, dispatch] = useReducer(flowReducer, undefined, () =>
    initialFlow(readHiddenColumns(localStore()))
  )
  const cms = useDefaultCms(api)
  const account = useAccountCounts(api)
  const [address, setAddress] = useAddress()
  // "Build demo site" opens the Brief page with the name field focused; a reload does not refocus it.
  const [focusName, setFocusName] = useState(false)
  // The opening sub-tab is decided once; afterwards only a press changes it.
  const decided = useRef<SubTab | null>(null)
  if (decided.current === null) decided.current = startingSubTab(address.view, account.counts?.all ?? null)
  const sub: SubTab | null = address.view ?? decided.current
  useTabLoading(sub === null)
  if (sub === null) return <div className="tracy-wo-empty" aria-busy="true" />

  const go = (patch: Partial<MyAddress>): void => setAddress({ ...address, view: sub, ...patch })
  const toList = (): void => go({ view: 'mine', page: null, brief: null })
  const openBrief = (opp: string, revisionId: string, focus: boolean): void => {
    setFocusName(focus)
    go({ view: 'mine', opp, page: 'brief', brief: revisionId })
  }
  const page = sub === 'mine' ? address.page : null

  return (
    <>
      <SubTabs
        t={t}
        value={sub}
        counts={account.counts}
        onChange={(view) => go({ view, page: null, brief: null })}
      />
      <div className="tracy-wo-body">
        {sub === 'find' && (
          <FindView
            t={t}
            api={api}
            ids={ids}
            flow={flow}
            dispatch={dispatch}
            onSent={() => {
              void account.refresh()
              go({ view: 'mine', stage: 'all', q: '', opp: null, page: null, brief: null })
            }}
          />
        )}
        {sub === 'mine' && (
          // Kept mounted under a page, so going back finds the loaded rows, the selection and the scroll as left.
          <div hidden={page !== null} className="tracy-wo-mine">
            <MyOpportunitiesView
              t={t}
              api={api}
              ids={ids}
              cms={cms}
              address={address}
              account={account}
              onAddress={(patch) => go(patch)}
              onOpenBrief={(opp, revisionId) => openBrief(opp, revisionId, true)}
            />
          </div>
        )}
        {page === 'details' && address.opp !== null && (
          <DetailView
            t={t}
            api={api}
            ids={ids}
            id={address.opp}
            cms={cms}
            onList={toList}
            onChanged={() => void account.refresh()}
            onOpenRevision={(revisionId, focus) => openBrief(address.opp ?? '', revisionId, focus)}
            openBriefTab={openBriefTab}
          />
        )}
        {page === 'brief' && address.opp !== null && address.brief !== null && (
          <RevisionView
            t={t}
            api={api}
            ids={ids}
            opportunityId={address.opp}
            revisionId={address.brief}
            focusName={focusName}
            onList={toList}
            onDetails={() => go({ page: 'details', brief: null })}
          />
        )}
      </div>
    </>
  )
}

export function WebsiteOpportunitiesTab({
  t,
  api,
  ids,
  feature,
  openBriefTab = null
}: {
  t: Translate
  api: Api
  ids: RequestIds
  feature: FeatureState
  /** Opens a brief in its own side-card tab; null where dsh's side card cannot open one. */
  openBriefTab?: ((seed: BriefTabSeed) => void) | null
}): JSX.Element {
  return (
    <div className="tracy-wo tracy-wo-tab">
      {feature === 'pending' ? (
        <div className="tracy-wo-empty" aria-busy="true" />
      ) : feature === 'off' ? (
        <OffNotice t={t} />
      ) : (
        <Flow t={t} api={api} ids={ids} openBriefTab={openBriefTab} />
      )}
    </div>
  )
}
