/**
 * `tracy-site-tabs` — Team · Site changes · Settings · Diff as tab TYPES of dsh-better-sidebar
 * (Lee, 04/09; `tasks/plan-my-sites-tabs.md`). One package, one registration per type: the tabs
 * share the header with the site picker, the fetches, and this locale namespace, so a package per
 * tab would be several declarations of one thing.
 *
 * Releases and History are retired (ADR 0024): backups are the milestones of Site changes. A link or
 * a saved layout naming either type lands on Site changes (`RETIRED_TABS` in `@tracy/core/tab-link`).
 *
 * A tab shows ONE site, named in `tab.meta.siteKey`. A tab opened from the `+` menu carries no
 * meta and takes the site this page is on; the header's picker changes it. The title follows
 * (`Team · fijitrips.example`) through `updateTab`.
 *
 * 🔒 THIS PLUGIN HOLDS NO SECRET AND KNOWS NO SEAT. Every read goes to `cowork-web`'s doors with
 * the viewer's cookie; the Worker signs the assertion the seat book and the fleet want.
 */
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { FileDiff, Globe, ListChecks, RotateCcw, Settings, Users } from 'lucide-react'
import {
  type AskRevertResult,
  ChangesView,
  type CommentRef,
  commentLink,
  type ConversationRef,
  type OpenInTracy,
  REVERT_FENCE,
  PublishView,
  revertBlockTitle,
  SettingsView,
  type DiffRenderer,
  FileDiffView,
  type PickableSite,
  TeamView
} from '@tracy/core/site-tabs'
import { TabLoadingScope } from '@tracy/ui'
import { helloUntilGone } from '@tracy/core/hello'
import {
  type OpenTab,
  type SidebarRight,
  openTabWithMeta,
  openUnasked,
  sidebarRightOf
} from '@tracy/core/tab-link'

import { dshUrl } from './dsh-url'
import { acceptedSites, canonicalSiteKey } from './accepted-sites.mjs'
import { type ConversationFace, type SessionFace, sendToChat } from './chat-send'
import {
  COMMENT_OPEN_EVENT,
  readCommentOpen,
  readCommentParam,
  revealComment,
  stripCommentParam
} from './comment-reveal.mjs'
import {
  BOOT_COVER,
  readMessageParam,
  revealMessage,
  sessionOfPath,
  stripMessageParam
} from './conversation-scroll.mjs'
import { followTurnEnds, hostsOfSite, siteTabReloader } from './site-reload.mjs'
import { followShownAgain, paneShown } from './shown-again.mjs'
import {
  type BrowserDeepLink,
  browserTargetOnHost,
  mirroredBrowserSearch,
  readBrowserDeepLink,
  sitePathKey,
  stripBrowserDeepLink
} from './browser-link.mjs'
import { type OpenDecision, routeDesktopOpen } from './desktop-open.mjs'
import { mainSessionOf } from '@tracy/core/session'
import { siteKeyHere, siteNameFor } from '@tracy/core/site-key'
import { uiSwitches } from '@tracy/core/ui-switches'
import { unseenBadgeOf, watchChangesUnseen } from './changes-unseen-badge.mjs'
import { en, NS, type Translate } from './strings'
import { TAILWIND, WIZARD_SHELL_CSS } from './styles'
import { useInterfaceLocale } from '@tracy/core/interface-languages/react'

const TEAM = 'tracy:team'
const CHANGES = 'tracy:changes'
const DIFF = 'tracy:diff'
const SETTINGS = 'tracy:site-settings'
const PUBLISH = 'tracy:site-publish'

/** The site tabs this plugin registers; `tab.<kind>` is each one's title. */
type SiteTabKind = 'team' | 'changes' | 'diff' | 'settings' | 'publish'

/** What a tab of ours remembers across reloads — `SidebarTab.meta`, JSON only. */
interface Meta {
  siteKey?: string
  /** The file a diff tab shows. Only that tab reads it. */
  path?: string
  /** The moment a diff tab shows the file IN (`SHA^ → SHA`); absent: since the latest backup. */
  sha?: string
  /** The address a link pointed at (Team): that row is marked once. */
  member?: string
  /** Open the invite wizard on arrival (Team): My Sites' "Invite member" lands here. */
  invite?: boolean
  /**
   * Open a flow on arrival (Publish): the ZIP flow for My Sites' "Export site as ZIP" and "Sync from
   * live", the Sync to live flow for "Sync to live".
   */
  publishEntry?: 'zip' | 'sync' | 'push'
}

interface SidebarTabLike {
  id: string
  type: string
  title: string
  meta?: unknown
}

interface BetterSidebar {
  registerTab: (descriptor: Record<string, unknown>) => () => void
  /** Lands in dsh's native right column and expands it (better-sidebar 0.21.1). */
  openTab: (seed: { type: string; title?: string; url?: string; meta?: unknown }) => void
  /** v0.12+: rename a tab, or change what it remembers. */
  updateTab?: (tabId: string, patch: { title?: string; meta?: unknown }) => void
  /** v0.12+: which conversation the side card follows. */
  getSnapshot?: () => { sessionId?: string; state?: unknown }
  /** 0.21.1-tracy.1+ (feature `reloadTab`): ask one open tab to re-fetch what it shows, by `mode`. */
  reloadTab?: (tabId: string, mode?: string) => void
  /** 0.21.1-tracy.1+: the open tabs of one type — native ids are minted by dsh, so this finds them. */
  openTabsOf?: (type: string) => readonly OpenTab[]
  /** The side card's diff renderer (0.17.1-tracy.25+); absent on an older one. */
  DiffView?: DiffRenderer
  /** 0.21.1-tracy.13+ (feature `setTabPolicy`): the host's policy over which tab types exist and are listed. */
  setTabPolicy?: (policy: { isAllowed(id: string): boolean; isListed(id: string): boolean }) => () => void
}

/**
 * The dsh client sessions service: the list says which conversation the main view shows, and that
 * conversation's binding carries its event stream — where the page learns a turn has ended
 * (`followTurnEnds` says why it is the stream and not a `running` flag).
 */
interface SessionsService {
  list: {
    getSnapshot: () => {
      byId: Record<string, { retainedBy?: Readonly<Partial<Record<string, number>>> } | undefined>
    }
    subscribe: (listener: () => void) => () => void
  }
  binding?: (id: string) =>
    | {
        /**
         * The conversation itself: older history is paged in through it (`loadOlder`), and a revert
         * request is sent to it (`chat-send.ts`).
         */
        session?: {
          loadOlder?: () => Promise<void>
          getSnapshot?: () => { hasMore?: boolean; subagent?: unknown; removed?: boolean }
        }
        eventSource?: {
          getSnapshot: () => {
            revision?: number
            change?: {
              kind?: string
              entries?: readonly ({ type?: string; event?: { type?: string } } | undefined)[]
            }
          }
          subscribe: (listener: () => void) => () => void
        }
      }
    | undefined
}

interface LocaleRuntime {
  bind: (ns: string) => Translate
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void
}

/**
 * The site this page is on, by the one rule in `@tracy/core/site-key`: the address first, the
 * pointer cookie the Worker plants second, and NO site on the creation workspace (`/new/`), where
 * that cookie only names the last site visited (bug 01/10/2026).
 */
function currentSiteKey(): string | null {
  return siteKeyHere()
}

async function pickableSites(): Promise<PickableSite[]> {
  return (await acceptedSites()).map((s) => ({
    siteKey: s.siteKey,
    ...(typeof s.displayName === 'string' ? { displayName: s.displayName } : {}),
    role: s.role,
    aliases: s.aliases,
    platform: s.platform ?? null,
    imported: s.imported === true
  }))
}

/**
 * Open one file's diff. dsh's right column keeps one diff tab in a pane, so a press on another file
 * retargets it — the site and path reach the tab already open through `openTabWithMeta`.
 */
function openDiff(
  sidebar: BetterSidebar,
  right: SidebarRight | undefined,
  siteKey: string,
  path: string,
  sha?: string
): void {
  openTabWithMeta(sidebar, right, { type: DIFF, meta: sha ? { siteKey, path, sha } : { siteKey, path } })
}

/** The side card's site preview, a page kind of dsh's native right column (better-sidebar 0.21.1-tracy.1). */
const PREVIEW_TAB = 'tracy:browser'

/**
 * Tell the lane's host half who is looking, so a moment it records can be signed as them. Stops for
 * good once the server answers that the site behind this page is gone (#340).
 */
const greeter = helloUntilGone(() =>
  fetch(dshUrl('/api/tracy-site-tabs/hello'), { method: 'POST', credentials: 'same-origin' })
)
function hello(): void {
  void greeter.hello()
}

/**
 * A conversation just finished a turn: if that turn changed its site, reload the Browser tabs
 * showing it.
 *
 * WHY THE PAGE ASKS INSTEAD OF BEING TOLD. The turn's end is visible here (the conversation's own
 * event stream), and the tabs are here; what is NOT here is what the agent did — that is in the
 * session log, on the host. So this asks one question per finished turn and acts on the answer. A turn that only looked
 * answers `changed: false` and nothing moves, which is the half of the promise that is easy to
 * break and hard to notice.
 *
 * Every step is allowed to come back empty and mean it: no answer, no site named, no address known,
 * no tab on that address. A failed reload costs the person the refresh button they had before.
 * @param sidebar - the side card service.
 * @param sessionId - the conversation whose turn ended.
 */
async function turnEnded(sidebar: BetterSidebar, sessionId: string): Promise<void> {
  if (
    typeof sidebar.getSnapshot !== 'function' ||
    typeof sidebar.reloadTab !== 'function' ||
    typeof sidebar.openTabsOf !== 'function'
  )
    return
  let answer: { changed?: boolean; siteKey?: string | null; mode?: string }
  try {
    const res = await fetch(dshUrl('/api/tracy-site-tabs/turn'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sessionId })
    })
    if (!res.ok) return
    answer = (await res.json()) as { changed?: boolean; siteKey?: string | null; mode?: string }
  } catch {
    return
  }
  if (answer.changed !== true || typeof answer.siteKey !== 'string' || answer.siteKey === '') return
  // Every Browser tab on the site is asked once; each tab decides whether that is a reload
  // (`siteTabReloader` says why the decision is the tab's).
  const reloadOn = siteTabReloader(
    {
      getSnapshot: () => sidebar.getSnapshot!(),
      openTabsOf: (type) => sidebar.openTabsOf!(type),
      reloadTab: (tabId, mode) => sidebar.reloadTab!(tabId, mode)
    },
    sessionId,
    answer.mode
  )
  // 🔒 WHAT THE ANSWER ALONE NAMES IS RELOADED FIRST, WITHOUT WAITING FOR `/api/sites`. On
  // production the site key IS the address a tab holds, and that second request is only for the
  // addresses a laptop serves a site at (`demo.localhost:8080`). Measured 23/09 on the local stand:
  // with the page's own requests stalled on the same origin, `/api/sites` took 14–19 s, and a
  // reload waiting on it never came inside a 25 s window although the turn door had said `changed`.
  reloadOn(hostsOfSite(answer.siteKey, []))
  reloadOn(hostsOfSite(answer.siteKey, await acceptedSites()))
}

/**
 * A Chat row's "Undo this request" in Site changes changed the site: every open Browser tab on it is
 * asked once to reload, mode `undo` (dsh-better-sidebar 0.24.1-tracy.77+, TCH #957) — a NEW change,
 * never taken for a turn's own reload the tab already absorbed. The previews belong to the
 * conversation on screen now, whichever chat the undone request came from.
 * @param sidebar - the side card service.
 * @param siteKey - the site whose request was undone.
 */
async function reloadAfterUndo(sidebar: BetterSidebar, siteKey: string): Promise<void> {
  if (
    typeof sidebar.getSnapshot !== 'function' ||
    typeof sidebar.reloadTab !== 'function' ||
    typeof sidebar.openTabsOf !== 'function'
  )
    return
  const sessionId = sidebar.getSnapshot().sessionId
  if (typeof sessionId !== 'string' || sessionId === '') return
  const reloadOn = siteTabReloader(
    {
      getSnapshot: () => sidebar.getSnapshot!(),
      openTabsOf: (type) => sidebar.openTabsOf!(type),
      reloadTab: (tabId, mode) => sidebar.reloadTab!(tabId, mode)
    },
    sessionId,
    'undo'
  )
  reloadOn(hostsOfSite(siteKey, []))
  reloadOn(hostsOfSite(siteKey, await acceptedSites()))
}

/**
 * What the side card's Browser tab announces on `window` whenever the page or the mode it shows
 * changes, once when it mounts, and with `url: null` when it goes away (`BrowserView` in the
 * better-sidebar fork). Re-declared, not imported: a Tracy plugin does not reach into the fork.
 */
const BROWSER_VIEW_EVENT = 'tracy:browser-view'

interface BrowserViewDetail {
  tabId?: unknown
  sessionId?: unknown
  url?: unknown
  mode?: unknown
}

/** The desktop app's link bridge (`tracy-desktop` shell/preload.ts), present only in the app's window. */
interface DesktopLinks {
  route(handler: {
    /** This page can answer a Cmd+click with a second window; an app that sees it asks about one. */
    windows: true
    /** `how.disposition`: how the link was pressed; an older app leaves it out (a plain click). */
    decide(url: string, how?: { disposition?: string }): Promise<OpenDecision>
    execute(decision: OpenDecision): void
  }): () => void
  openExternal?(url: string): void
}

/** How long a link's open waits for the side card to be bound to the conversation on screen. */
const LINK_OPEN_DEADLINE_MS = 30_000

/**
 * Open the Browser tab a link asked for (`?open=browser&page=&mode=`, `browser-link.mjs`).
 *
 * WHERE THE SITE IS. The page is resolved against the address this deployment serves the site at —
 * `copyUrl` of the page's shared `/api/sites` answer, the same string My Sites opens the Browser
 * tab with — never guessed from the site key: on a laptop the key is `demo.tracy.site` and the
 * site answers at `http://demo.localhost:8080/`. A site with no address opens nothing, and says so
 * in the console.
 *
 * WHEN. Like `@tracy/dsh-tab-link`'s link open: only once the side card is bound to the
 * conversation the main view shows — an open before that lands in no seat, or in the wrong one.
 * Subscriptions wake it, a 250 ms ticker covers a wait that ends without a change, and a deadline
 * ends the wait for good.
 *
 * The mode travels as the Browser tab's own `?mode=` on the opened address: the tab takes it off
 * before anything loads and keeps it as the tab's mode, next to the zoom it leaves alone.
 *
 * 🔒 TWO OTHER OPENS USED TO UNDO THIS ONE. The column keeps one Browser tab per pane, so any later
 * open of the site's root lands on the link's tab and sends it back to `/` (measured 27/09 on the
 * stand). Both default opens now stand down when a Browser tab is already on the site's host,
 * checked right before they open: My Sites' preview preload (`tracy-my-sites`
 * `previewAlreadyOpen`) and Add site's `openSite` after its credentials request (`tracy-add-site`
 * `browserTabOn`). A new default open of the site's preview needs the same guard.
 *
 * 🔒 BEHIND THE TOGGLE ON A NARROW FRAME (12/10/2026). The address mirror writes this same
 * `?open=browser&page=` on every view (`mirroredBrowserSearch`), so a reload or a copied bar reads
 * exactly like a link and nothing tells them apart. Below 768px the tab is put in the column and
 * the conversation keeps the screen (`openUnasked`); the person opens it with the toggle. A
 * `?tab=` address is the one that opens the column (`@tracy/dsh-tab-link`), and so is a comment
 * link (`&comment=`, never written by the mirror): it names a thread to land on.
 * @param right - reads dsh's right column at open time.
 * @param asked - the link names something to land on (a comment): the column opens on any frame.
 * @returns stop waiting.
 */
function openBrowserLink(
  sidebar: BetterSidebar,
  sessions: SessionsService,
  siteKey: string,
  link: BrowserDeepLink,
  right: () => SidebarRight | undefined,
  asked: boolean
): () => void {
  return openBrowserWhenBound(
    sidebar,
    sessions,
    acceptedSites().then((rows) => {
      const row = rows.find((r) => canonicalSiteKey(siteKey, [r]) !== null)
      const target = browserTargetOnHost(row?.copyUrl, link, hostsOfSite(siteKey, rows))
      if (target === null)
        console.warn(
          `[tracy-site-tabs] a link asked for the Browser tab, but ${siteKey} has no address to open`
        )
      return target
    }),
    (open) => {
      if (!asked) return openUnasked(right(), open)
      open()
      const column = right()
      try {
        if (column !== undefined && !column.isExpanded()) column.toggleExpanded()
      } catch {
        // No seat mounted yet: dsh refuses the command, and the open above already placed the tab.
      }
    }
  )
}

/**
 * Open the Browser tab on `target` once the side card is bound to the conversation the main view
 * shows (the WHEN of {@link openBrowserLink}); a null target opens nothing.
 * @returns stop waiting.
 */
function openBrowserWhenBound(
  sidebar: BetterSidebar,
  sessions: SessionsService,
  address: Promise<string | null>,
  place: (open: () => void) => void = (open) => open()
): () => void {
  let done = false
  let target: string | null = null
  const disposers: (() => void)[] = []
  const finish = (): void => {
    done = true
    for (const dispose of disposers.splice(0)) dispose()
  }
  const tryOpen = (): void => {
    if (done || target === null || typeof sidebar.openTab !== 'function') return
    const main = mainSessionOf(sessions.list.getSnapshot())
    if (main === undefined) return
    const bound = sidebar.getSnapshot?.().sessionId
    if (typeof sidebar.getSnapshot === 'function' && bound !== main) return
    finish()
    const url = target
    place(() => sidebar.openTab?.({ type: PREVIEW_TAB, url }))
  }
  void address.then((resolved) => {
    if (done) return
    target = resolved
    if (target === null) {
      finish()
      return
    }
    tryOpen()
  })
  disposers.push(sessions.list.subscribe(tryOpen))
  const ticker = window.setInterval(tryOpen, 250)
  disposers.push(() => window.clearInterval(ticker))
  const deadline = window.setTimeout(finish, LINK_OPEN_DEADLINE_MS)
  disposers.push(() => window.clearTimeout(deadline))
  return finish
}

/**
 * The desktop app's link routing, the page's half (tasks/todo-desktop-window-shell.md): the app's
 * window asks where a link it was asked to open goes; `routeDesktopOpen` decides from the sites this
 * viewer has and the one on screen; the app checks the decision and hands a navigate or tab back to
 * be carried out here. A Cmd+click on another site or a Tracy screen is answered with a second window,
 * which the app opens itself (tasks/todo-desktop-multi-window.md). A tab opens like a link's Browser tab ({@link openBrowserWhenBound}: only into
 * the side card of the conversation on screen).
 *
 * 🔒 ONLY IN THE APP. The bridge (`tracyDesktop.links`) exists only in the app's own window; on the
 * web there is none, nothing registers, and links behave exactly as before.
 * @returns unregister.
 */
function routeDesktopLinks(
  sidebar: BetterSidebar,
  sessions: SessionsService,
  pageSite: string | null
): (() => void) | void {
  const links = (globalThis as { tracyDesktop?: { links?: DesktopLinks } }).tracyDesktop?.links
  if (typeof links?.route !== 'function') return
  let stopOpen: (() => void) | null = null
  const unregister = links.route({
    windows: true,
    decide: async (url, how) => {
      const rows = await acceptedSites()
      return routeDesktopOpen(
        url,
        {
          origin: location.origin,
          currentSite: pageSite === null ? null : (canonicalSiteKey(pageSite, rows) ?? pageSite),
          sites: rows
        },
        { disposition: how?.disposition }
      )
    },
    execute: (decision) => {
      if (decision.kind === 'navigate') location.assign(decision.url)
      else if (decision.kind === 'tab') {
        stopOpen?.()
        stopOpen = openBrowserWhenBound(sidebar, sessions, Promise.resolve(decision.url))
      }
    }
  })
  return () => {
    stopOpen?.()
    unregister()
  }
}

/**
 * Keep the page's real address on what the Browser tab shows (`mirroredBrowserSearch`), so the
 * address Chrome shows is a link that reopens that page in that mode.
 *
 * 🔒 `replaceState`, NEVER `pushState`, AND NEVER THE PATH. The path is dsh's (`/s/<session>`), and a
 * history entry per page the tab visits would turn Back into a walk through the preview. Only
 * `open`, `page` and `mode` are touched; every other parameter keeps its place.
 *
 * Several Browser tabs can be open (panes, the bottom panel): the one that changed last is the one
 * the address follows; when the last one goes, the three parameters go with it.
 * @returns stop mirroring.
 */
function mirrorBrowserView(siteKey: string): () => void {
  const views = new Map<string, { url: string; mode: string; at: number }>()
  let hosts = hostsOfSite(siteKey, [])
  let sitesForPath: Awaited<ReturnType<typeof acceptedSites>> = []
  let seq = 0
  let alive = true
  const write = (): void => {
    const pathName = sitePathKey(location.pathname)
    if (pathName !== siteKey && canonicalSiteKey(pathName, sitesForPath) !== siteKey) return
    let latest: { url: string; mode: string; at: number } | null = null
    for (const view of views.values()) if (latest === null || view.at > latest.at) latest = view
    const next = mirroredBrowserSearch(
      location.search,
      latest === null ? null : { url: latest.url, mode: latest.mode as 'interactive' | 'edit' },
      hosts
    )
    if (next === location.search) return
    try {
      history.replaceState(history.state, '', `${location.pathname}${next}${location.hash}`)
    } catch {
      /* an address we cannot rewrite leaves the tab working as before */
    }
  }
  const onView = (event: Event): void => {
    const detail = ((event as CustomEvent).detail ?? {}) as BrowserViewDetail
    if (typeof detail.tabId !== 'string') return
    const key = `${typeof detail.sessionId === 'string' ? detail.sessionId : ''}:${detail.tabId}`
    if (typeof detail.url === 'string' && detail.url !== '' && typeof detail.mode === 'string') {
      seq += 1
      views.set(key, { url: detail.url, mode: detail.mode, at: seq })
    } else {
      views.delete(key)
    }
    write()
  }
  window.addEventListener(BROWSER_VIEW_EVENT, onView)
  // The key alone names the site on production; the served address (`copyUrl`) is what a laptop
  // shows it at, and arrives with the shared `/api/sites` answer.
  void acceptedSites().then((rows) => {
    if (!alive) return
    sitesForPath = rows
    hosts = hostsOfSite(siteKey, rows)
    if (views.size > 0) write()
  })
  return () => {
    alive = false
    window.removeEventListener(BROWSER_VIEW_EVENT, onView)
  }
}

/**
 * A counter every open tab of a kind follows, to read its list again. Module state because the tabs
 * are separate component trees the sidebar mounts independently.
 */
function tickStore(): { bump: () => void; useTick: () => number } {
  let tick = 0
  const listeners = new Set<() => void>()
  return {
    bump: () => {
      tick += 1
      for (const on of listeners) on()
    },
    useTick: () => {
      const [seen, setSeen] = useState(tick)
      useEffect(() => {
        const on = (): void => setSeen(tick)
        listeners.add(on)
        return () => {
          listeners.delete(on)
        }
      }, [])
      return seen
    }
  }
}
/**
 * Bumped when a turn of the conversation on screen ends (`followTurnEnds`, the same signal the
 * Browser tab's reload follows): every open Site changes tab reads its list again, so the turn's row
 * shows without F5 (Brian, 03/10). Not gated on the turn door's `changed`: a turn that only wrote
 * content is a row too, and the door answers for the preview, not for the list.
 */
const changes = tickStore()

function SiteTab({
  kind,
  tab,
  askRevert,
  openInTracy,
  sidebar,
  right,
  t
}: {
  kind: SiteTabKind
  tab: SidebarTabLike
  /** Send a revert request to the conversation on screen (`chat-send.ts`). */
  askRevert: (message: string) => Promise<AskRevertResult>
  /** Open a row's chat or comment inside Tracy; false: the row opens a new window instead. */
  openInTracy: (target: OpenInTracy) => boolean
  sidebar: BetterSidebar
  /** dsh's right column, read when a diff is opened (`sidebarRightOf`). */
  right: () => SidebarRight | undefined
  t: Translate
}): JSX.Element {
  const meta = (tab.meta ?? {}) as Meta
  const [siteKey, setSiteKey] = useState<string | null>(meta.siteKey ?? currentSiteKey())
  const [sites, setSites] = useState<PickableSite[]>([])
  // Site changes reads its list again when a turn ends and when its pane is shown again; the view
  // folds signals that arrive together into one read (`ChangesView` `reloadKey`).
  const turnTick = changes.useTick()
  const [shownTick, setShownTick] = useState(0)
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (kind !== 'changes' || root === null) return
    return followShownAgain(root, () => setShownTick((n) => n + 1))
  }, [kind, root])
  // The link's request is consumed on the first mount; a reopened tab starts clean.
  const [arrival, setArrival] = useState(() => ({
    member: meta.member ?? null,
    invite: meta.invite === true,
    publish: meta.publishEntry ?? null,
    n: 0
  }))
  // 🔒 FOLLOW AN OPEN THAT RETARGETS THIS TAB. dsh's right column keeps one tab of a kind in a pane
  // (better-sidebar 0.21.1), so "Team of another site" is this same tab with new meta
  // (`openTabWithMeta`), not a second tab. Adjusted during render, not in an effect: the naming
  // effect below would otherwise run first with the old site and write it back over the new meta.
  const incoming = `${meta.siteKey ?? ''}|${meta.member ?? ''}|${meta.invite === true ? 1 : 0}|${meta.publishEntry ?? ''}`
  const [seen, setSeen] = useState(incoming)
  if (incoming !== seen) {
    setSeen(incoming)
    if (meta.siteKey !== undefined && meta.siteKey !== siteKey) setSiteKey(meta.siteKey)
    if (meta.member !== undefined || meta.invite === true || meta.publishEntry !== undefined)
      setArrival({
        member: meta.member ?? null,
        invite: meta.invite === true,
        publish: meta.publishEntry ?? null,
        n: arrival.n + 1
      })
    // A menu landing on the Publish tab belongs to that one press: an open of another site with no
    // `publishEntry` (a plain "Publish") must not land its wizard on the ZIP flow again. The same
    // site's meta coming back without it is this tab's own rewrite below, the landing not yet read.
    else if (arrival.publish !== null && meta.siteKey !== undefined && meta.siteKey !== siteKey)
      setArrival({ ...arrival, publish: null })
  }

  /**
   * The list behind the header's picker. Asked again while it comes back empty: at lane boot the
   * panel fires several requests at once and this one can lose, and a picker with one row (the
   * site you are on) is not wrong — it is just the whole list missing, silently, until a reload.
   * Three tries, widening, then it stands as it is. Each try reads the page's shared answer
   * (`readSites`), so a kept answer — an empty list included — costs no request; only a failed read,
   * held back `SITES_RETRY_MS`, is asked again by the last try (#340).
   */
  // Whether the list has answered: the Publish tab makes its plan (Sync or not) only from an answer.
  const [sitesState, setSitesState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [sitesAsk, setSitesAsk] = useState(0)
  useEffect(() => {
    let alive = true
    let attempt = 0
    setSitesState((now) => (now === 'failed' ? 'loading' : now))
    const ask = (): void => {
      void pickableSites().then((rows) => {
        if (!alive) return
        if (rows.length > 0) {
          setSites(rows)
          setSitesState('ready')
          setSiteKey((current) => (current ? (canonicalSiteKey(current, rows) ?? current) : current))
          return
        }
        attempt += 1
        if (attempt < 3) window.setTimeout(ask, attempt * 2000)
        else setSitesState((now) => (now === 'ready' ? now : 'failed'))
      })
    }
    ask()
    return () => {
      alive = false
    }
  }, [sitesAsk])
  const retrySites = useCallback(() => setSitesAsk((n) => n + 1), [])

  // Read so a language switch re-renders this body and the title effect below renames the open
  // tab in the new language (spec #730).
  useInterfaceLocale()
  const label = t(`tab.${kind}`)
  // Name the tab after its site, and remember the site: a tab opened from the `+` menu arrives
  // titled "Team" with no meta, and a reload must bring back the same site. The meta keeps the KEY;
  // the title shows the site's current NAME, so a renamed site's tab follows the new address
  // (bug 03/10/2026: the chip kept "Settings · <old address>").
  const siteName = siteKey === null ? null : siteNameFor(sites, siteKey)
  useEffect(() => {
    if (siteKey === null || siteName === null || typeof sidebar.updateTab !== 'function') return
    const file = meta.path ?? ''
    const title =
      kind === 'diff' ? `${file.split('/').pop() ?? label} · ${siteName}` : `${label} · ${siteName}`
    const next: Meta =
      kind === 'diff' ? { siteKey, path: file, ...(meta.sha ? { sha: meta.sha } : {}) } : { siteKey }
    if (
      tab.title !== title ||
      meta.siteKey !== siteKey ||
      meta.member !== undefined ||
      meta.invite !== undefined ||
      meta.publishEntry !== undefined
    ) {
      sidebar.updateTab(tab.id, { title, meta: next })
    }
  }, [
    siteKey,
    siteName,
    label,
    sidebar,
    tab.id,
    tab.title,
    meta.siteKey,
    meta.member,
    meta.invite,
    meta.publishEntry
  ])

  // The header's picker opens another site at the wizard's start, never on an earlier menu landing.
  const pick = useCallback((next: string) => {
    setSiteKey(next)
    setArrival((now) => (now.publish === null ? now : { ...now, publish: null }))
  }, [])
  const role = useMemo(() => sites.find((s) => s.siteKey === siteKey)?.role ?? null, [sites, siteKey])

  if (siteKey === null) {
    return (
      <div className="tracy-site-tabs h-full min-h-0 overflow-y-auto px-3 py-4 text-muted-foreground text-sm">
        <p className="m-0">{t('state.noSite')}</p>
      </div>
    )
  }
  const shared = { siteKey, role, sites, onPick: pick, t }
  return (
    // The side card's tab body clips (overflow: hidden) and its native host is a fixed-height
    // column, so this root must be the scrollport; without it Site changes ends at the first
    // screen and the wheel does nothing (measured on wptest0929, 30/09: root 16201 px tall, pane
    // 1049 px, nothing in the chain scrollable).
    <div
      ref={setRoot}
      className="tracy-site-tabs tv-site-tabs-frame h-full min-h-0 overflow-y-auto text-foreground text-sm"
      // Which view this frame holds: the centred card (site-tabs-rules.css) is sized per kind, and
      // Diff keeps the full width a code diff needs.
      data-tab-kind={kind}
    >
      {/* One loading bar for the tab, fed by whichever view is reading. It renders after the view,
          so the view's header stays this root's first child — the sticky one. */}
      <TabLoadingScope label={t('loading.label')}>
        {kind === 'team' && (
          // `arrival.n` in the key: a second request on the same site (Invite member while Team is open)
          // mounts the view again, which is the only moment it reads `inviteOnOpen`.
          <TeamView
            key={`${siteKey}:${arrival.n}`}
            {...shared}
            highlight={arrival.member}
            inviteOnOpen={arrival.invite}
          />
        )}
        {kind === 'settings' && <SettingsView key={siteKey} {...shared} />}
        {/* The Publish wizard: "Publish" in My Sites, and its "Export site as ZIP" / "Sync from live",
            which land on the ZIP flow (`arrival.publish`). */}
        {kind === 'publish' && (
          <PublishView
            key={siteKey}
            {...shared}
            arrival={arrival.publish ? { entry: arrival.publish, n: arrival.n } : null}
            sitesState={sitesState}
            onRetrySites={retrySites}
          />
        )}
        {kind === 'changes' && (
          <ChangesView
            key={siteKey}
            {...shared}
            reloadKey={turnTick + shownTick}
            isShown={() => paneShown(root)}
            onOpenFile={(path, sha) => openDiff(sidebar, right(), siteKey, path, sha)}
            onAskRevert={askRevert}
            onOpen={openInTracy}
            onUndone={(undoneOn) => void reloadAfterUndo(sidebar, undoneOn)}
          />
        )}
        {kind === 'diff' && (
          <FileDiffView
            key={`${siteKey}:${meta.path ?? ''}:${meta.sha ?? ''}`}
            {...shared}
            path={meta.path ?? ''}
            sha={meta.sha}
            render={sidebar.DiffView}
          />
        )}
      </TabLoadingScope>
    </div>
  )
}

/**
 * 🔒 `betterSidebar` is a CLIENT-ONLY service, and cordis throws the moment a property outside
 * `inject` is READ. Declaring it means this plugin only activates once better-sidebar is up; on a
 * profile without it, cordis leaves the plugin PENDING — silent, and the right failure.
 */
export const inject = ['betterSidebar', 'locale', 'sessions']

/** dsh's `uiWorkspace` (`ui-workspace/src/client/navigation.ts`): switches the main view. */
interface UiWorkspace {
  openSession: (sessionId: string) => void
}

/** dsh's `uiConversation.userTextFolds` (`ui-primitives/src/user-text-folds.ts`). */
interface UserTextFolds {
  register: (fold: {
    fence: string
    fold: (block: string, after: string) => { label: string; title?: string; icon?: unknown } | null
  }) => () => void
}

/** A service by name, or undefined: read at the moment of use, never at activation. */
function serviceOf<T>(ctx: { get?: (name: string) => unknown }, name: string): T | undefined {
  try {
    return (ctx.get?.(name) ?? undefined) as T | undefined
  } catch {
    return undefined
  }
}

/** The page's own scroll-to-message, for the session `sessionId` once the main view shows it. */
function scrollToMessage(
  sessions: SessionsService,
  sessionId: string,
  messageId: string,
  shown: () => boolean = () => true
): () => void {
  let alive = true
  const session = () => sessions.binding?.(sessionId)
  void revealMessage(messageId, {
    // Nothing is looked for until the main view shows that conversation: right after a switch the
    // old one's nodes are still in the page.
    find: (selector) => (alive && shown() ? document.querySelector<HTMLElement>(selector) : null),
    loadOlder: () => session()?.session?.loadOlder?.(),
    hasOlder: () => session()?.session?.getSnapshot?.()?.hasMore ?? null,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    covered: () => document.querySelector(BOOT_COVER) !== null,
    place: (el) => ({ top: (el as HTMLElement).getBoundingClientRect().top, viewport: window.innerHeight })
  })
  return () => {
    alive = false
  }
}

/** Show comment `id` in the Browser tab of the conversation on screen (`comment-reveal.mjs`). */
function showComment(sessions: SessionsService, id: string): () => void {
  return revealComment(id, {
    target: window,
    event: (type, detail) => new CustomEvent(type, { detail }),
    mainSession: () => mainSessionOf(sessions.list.getSnapshot()),
    covered: () => document.querySelector(BOOT_COVER) !== null,
    now: () => Date.now(),
    every: (fn, ms) => {
      const timer = window.setInterval(fn, ms)
      return () => window.clearInterval(timer)
    },
    // `tracy-chat-input` opens the conversation's Comments view on this event (`comments-open.mjs`,
    // the one the Browser toolbar's Comments button sends) — re-declared: plugins share no imports.
    openComments: (sessionId) =>
      window.dispatchEvent(new CustomEvent(COMMENTS_OPEN_EVENT, { detail: { sessionId } }))
  })
}

/** `tracy-chat-input` `comments-open.mjs` `OPEN_EVENT`. */
const COMMENTS_OPEN_EVENT = 'tracy:comments-open'

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  /**
   * Services read by name at the moment of use, not injected: dsh's right column
   * (`sidebarRightOf`), `uiWorkspace` (open a conversation in place) and `conversation` (send).
   */
  get?: (name: string) => unknown
  /** A nested activation once a service is up: the `tracy-revert` chip waits for `uiConversation`. */
  inject?: (deps: string[], callback: (scope: Record<string, unknown>) => void) => void
  betterSidebar: BetterSidebar
  locale: LocaleRuntime
  sessions: SessionsService
}): void {
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-site-tabs="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracySiteTabs = '1'
    // The Publish tab draws on the Add site wizard shell (`@tracy/core/wizard-shell`): its rules
    // ride in this sheet, scoped to `.tas-root`, so the tab looks the same with or without Add site.
    el.textContent = `${TAILWIND}\n${WIZARD_SHELL_CSS}`
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-site-tabs: styles')

  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-site-tabs: dictionaries')
  const t = ctx.locale.bind(NS)

  // A link may ask for the Browser tab: `?open=browser&page=<path>&mode=<mode>` (Brian, 27/09). It is
  // read once, taken off the address before anything else rewrites it, and opened when the side
  // card can take it. Only on a site page: the path names the site whose page is meant.
  const pageSite = sitePathKey(location.pathname)
  const explicitTab = new URLSearchParams(location.search).has('tab')
  const browserLink = pageSite === null || explicitTab ? null : readBrowserDeepLink(location.search)
  // "Open conversation" from a Site changes row: the message to scroll to, read once like the rest.
  const messageLink = pageSite === null ? null : readMessageParam(location.search)
  const messageSession = sessionOfPath(location.pathname)
  // "Open comment", and a comment's ⋮ Copy link: the thread to land on (W-F2). Taken off with the
  // rest, so the Browser tab's own one-shot reader never competes with `showComment`.
  const commentParam = pageSite === null ? null : readCommentParam(location.search)
  if (browserLink !== null || messageLink !== null || commentParam !== null) {
    try {
      const rest = stripCommentParam(stripMessageParam(stripBrowserDeepLink(location.search)))
      history.replaceState(history.state, '', `${location.pathname}${rest}${location.hash}`)
    } catch {
      /* a URL we cannot rewrite is still a page we can open */
    }
  }
  ctx.effect(() => {
    if (pageSite === null || browserLink === null) return
    return openBrowserLink(
      ctx.betterSidebar,
      ctx.sessions,
      pageSite,
      browserLink,
      () => sidebarRightOf(ctx),
      commentParam !== null
    )
  }, 'tracy-site-tabs: open the Browser tab a link asks for')
  ctx.effect(() => {
    if (pageSite === null) return
    return mirrorBrowserView(pageSite)
  }, 'tracy-site-tabs: the address follows the Browser tab')
  ctx.effect(
    () => routeDesktopLinks(ctx.betterSidebar, ctx.sessions, pageSite),
    'tracy-site-tabs: route the links the desktop app is asked to open'
  )
  ctx.effect(() => {
    if (messageLink === null || messageSession === null) return
    return scrollToMessage(ctx.sessions, messageSession, messageLink)
  }, 'tracy-site-tabs: scroll to the message a row opened')
  ctx.effect(() => {
    if (commentParam === null) return
    return showComment(ctx.sessions, commentParam)
  }, 'tracy-site-tabs: land on the comment a link names')

  /**
   * W-F3: a row's "Open chat" / "Open comment" opens INSIDE Tracy. False — the row then opens a new
   * window on the same address, as before — only where this page cannot: no `uiWorkspace`, a
   * conversation dsh does not list (archived, another account's), a comment with no id (an older
   * server), or not on a site page.
   */
  let inFlight: (() => void) | null = null
  const openInTracy = (target: OpenInTracy): boolean => {
    if (target.kind === 'chat') return openConversation(target.conversation)
    return openComment(target.comment)
  }
  const openConversation = (c: ConversationRef): boolean => {
    const workspace = serviceOf<UiWorkspace>(ctx, 'uiWorkspace')
    const list = ctx.sessions.list.getSnapshot()
    if (typeof workspace?.openSession !== 'function' || list.byId[c.sessionId] === undefined) return false
    inFlight?.()
    // Already on screen: no switch, only the scroll. Otherwise dsh's own navigation (the session tab
    // the sidebar would open), which also writes `/s/<id>` into the address.
    if (mainSessionOf(list) !== c.sessionId) workspace.openSession(c.sessionId)
    inFlight = c.promptMessageId
      ? scrollToMessage(
          ctx.sessions,
          c.sessionId,
          c.promptMessageId,
          () => mainSessionOf(ctx.sessions.list.getSnapshot()) === c.sessionId
        )
      : null
    return true
  }
  const openComment = (comment: CommentRef): boolean => {
    const siteKey = pageSite
    if (siteKey === null) return false
    // The Browser tab opens in the side card of the conversation on screen: none, nowhere to open.
    if (mainSessionOf(ctx.sessions.list.getSnapshot()) === undefined) return false
    if (typeof ctx.betterSidebar.openTab !== 'function') return false
    // The very link the row's href carries (`commentLink`: Tracy's own parameters dropped, the
    // comment's page in Edit), read back by the same rules a pasted link is read with. A comment
    // with no id (an older server) links to the page alone: that stays a new window.
    const href = commentLink(siteKey, comment)
    if (href === null) return false
    const search = new URL(href, location.origin).search
    const link = readBrowserDeepLink(search)
    const id = readCommentParam(search)
    if (link === null || id === null) return false
    inFlight?.()
    const stopOpen = openBrowserLink(
      ctx.betterSidebar,
      ctx.sessions,
      siteKey,
      link,
      () => sidebarRightOf(ctx),
      true
    )
    const stopReveal = showComment(ctx.sessions, id)
    inFlight = () => {
      stopOpen()
      stopReveal()
    }
    return true
  }

  // The chat column's Comments row pressed while no Browser tab holds its comment (Brian 03/10): the
  // same road, so the tab opens on the comment's page and lands on its thread.
  ctx.effect(() => {
    const onOpen = (event: Event): void => {
      const asked = readCommentOpen((event as CustomEvent).detail)
      if (asked !== null) openComment(asked)
    }
    window.addEventListener(COMMENT_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(COMMENT_OPEN_EVENT, onOpen)
  }, 'tracy-site-tabs: open a comment the Comments list asks for')

  // The chip a revert request shows in the chat: dsh folds the `tracy-revert` block of a sent user
  // message (presentation only — the model still reads the whole block). A nested activation, so
  // the plugin never waits on `uiConversation` and a shell without it keeps the raw block.
  ctx.inject?.(['uiConversation'], (scope) => {
    const folds = (scope.uiConversation as { userTextFolds?: UserTextFolds } | undefined)?.userTextFolds
    const effect = scope.effect as typeof ctx.effect | undefined
    if (typeof folds?.register !== 'function' || typeof effect !== 'function') return
    effect(
      () =>
        folds.register({
          fence: REVERT_FENCE,
          fold: (block) => {
            const title = revertBlockTitle(block)
            if (title === null) return null
            return {
              label: t('event.revertChip'),
              title,
              icon: <RotateCcw style={{ width: '1em', height: '1em' }} aria-hidden="true" />
            }
          }
        }),
      'tracy-site-tabs: the revert chip'
    )
  })

  // Who is looking, told to the lane once per page and again whenever the page comes back into
  // view: the moment recorded at the end of an agent turn is signed with this viewer's session.
  ctx.effect(() => {
    hello()
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') hello()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, 'tracy-site-tabs: hello')

  // The site the conversation on screen just changed, shown without anyone pressing refresh. When a
  // turn counts as ended is `followTurnEnds`'s rule, kept pure so a test holds it.
  ctx.effect(
    () =>
      followTurnEnds(ctx.sessions, (id) => {
        changes.bump()
        void turnEnded(ctx.betterSidebar, id)
      }),
    'tracy-site-tabs: reload the site a finished turn changed, and re-read Site changes'
  )

  // Which tab types exist for customers and which the + menu lists: the operator's right-column
  // switches (/ops › User Interface), handed to the side card as its tab policy. This plugin is the
  // one Tracy plugin that already holds the side card on every profile, so it carries the policy
  // for every registrant, dsh's built-in tabs included.
  ctx.effect(() => uiSwitches().followTabPolicy(ctx.betterSidebar), 'tracy-site-tabs: tab policy')

  // "Ask Tracy to revert" SENDS to the conversation on screen at one press (`chat-send.ts`); the
  // composer and whatever the person is typing in it are left alone.
  const askRevert = (message: string): Promise<AskRevertResult> =>
    sendToChat(
      mainSessionOf(ctx.sessions.list.getSnapshot()),
      (id) => {
        const session = ctx.sessions.binding?.(id)?.session
        return typeof session?.getSnapshot === 'function' ? (session as SessionFace) : undefined
      },
      serviceOf<ConversationFace>(ctx, 'conversation'),
      message
    )

  // The Site changes tab carries the start card's count (plan todo-site-changes-badge-count §4): the
  // chat column says it over `tracy:changes-unseen`, this plugin keeps it and tells the fork it moved.
  ctx.effect(() => {
    if (pageSite === null) return
    return watchChangesUnseen({
      target: window,
      siteKey: pageSite,
      sidebar: ctx.betterSidebar
    })
  }, 'tracy-site-tabs: unseen changes count on the tab')

  const descriptors: {
    id: string
    kind: SiteTabKind
    order: number
    hidden?: boolean
    icon: (size: number) => JSX.Element
    /** The fork's tab-strip badge: read on every tab-bar render, so it only looks up a kept number. */
    badge?: () => number | null
  }[] = [
    {
      id: SETTINGS,
      kind: 'settings',
      order: 3,
      hidden: true,
      icon: (size) => <Settings size={size} aria-hidden="true" />
    },
    // Hidden from the `+` menu, as Settings is: reached from "Publish" in a My Sites row's menu.
    {
      id: PUBLISH,
      kind: 'publish',
      order: 3,
      hidden: true,
      icon: (size) => <Globe size={size} aria-hidden="true" />
    },
    {
      id: TEAM,
      kind: 'team',
      order: 3,
      icon: (size) => <Users size={size} strokeWidth={1.8} aria-hidden="true" />
    },
    // Listed like Team: the + menu and the Start guide offer it once the operator turns
    // `launch-changes` on (/ops › User Interface); off by default, as the catalogue says.
    {
      id: CHANGES,
      kind: 'changes',
      order: 4,
      icon: (size) => <ListChecks size={size} strokeWidth={1.8} aria-hidden="true" />,
      badge: () => unseenBadgeOf(pageSite)
    },
    // Hidden from the `+` menu: a diff tab with no file to show would be an empty screen and a
    // question nobody can answer. It is reached by pressing a file on the Changes tab.
    {
      id: DIFF,
      kind: 'diff',
      order: 6,
      hidden: true,
      icon: (size) => <FileDiff size={size} strokeWidth={1.8} aria-hidden="true" />
    }
  ]
  for (const d of descriptors) {
    // 🔒 Wrapped in `ctx.effect`: `registerTab` returns a disposer; without it HMR or a plugin
    // toggle leaves the old registration and the next activation throws "already registered".
    ctx.effect(
      () =>
        ctx.betterSidebar.registerTab({
          id: d.id,
          title: () => t(`tab.${d.kind}`),
          icon: d.icon,
          order: d.order,
          ...(d.hidden === true ? { hidden: true } : {}),
          ...(d.badge !== undefined ? { badge: d.badge } : {}),
          // One tab per site, not one per type: `dedupeKey` folds a second open of the same site
          // onto the existing tab, and lets two sites sit side by side.
          dedupeKey: (tab: SidebarTabLike) => `${d.id}:${((tab.meta ?? {}) as Meta).siteKey ?? ''}`,
          component: ({ tab }: { tab: SidebarTabLike }) => (
            <SiteTab
              kind={d.kind}
              tab={tab}
              askRevert={askRevert}
              openInTracy={openInTracy}
              sidebar={ctx.betterSidebar}
              right={() => sidebarRightOf(ctx)}
              t={t}
            />
          )
        }),
      `tracy-site-tabs: ${d.kind}`
    )
  }
}
