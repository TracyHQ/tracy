/**
 * `tracy-tab-link` — the address of a side-card tab (tasks/todo-deeplink-tab.md, 06/09).
 *
 * dsh keeps the session on the path (`<base>s/<sessionId>`) and carries `?search` and `#hash`
 * through every session change; the side card keeps its tabs in localStorage and says nothing
 * on the address bar. This plugin draws nothing and closes that gap for Tracy's tabs (`tracy:*`):
 *
 *   1. MIRROR   — while such a tab is in sight, the address reads `?tab=<type>&site=<site name>`,
 *                 written with `replaceState` so Back and Forward keep meaning "previous session"
 *                 and never "previous tab". Any other parameter, and the hash, stay as they are.
 *   2. OPEN     — an address carrying `?tab=` opens (or focuses) that tab and reveals the column.
 *                 A trailing `&s=<sessionId>` first switches to that session when the lane lists
 *                 it; an unlisted one is ignored, and the person stays where they were.
 *   3. RESET    — a double-click on the empty gap of the column's tab strip puts the column back
 *                 at its tab's declared width, as a double-click on the divider does
 *                 (`strip-fill-reset.ts`). It lives here because this is the plugin that already
 *                 wires Tracy's behaviour onto dsh's native right column and draws nothing.
 *   4. MENU     — the `+` launcher menu this plugin registers is painted opaque, as Tracy's own
 *                 menus are, by one scoped style rule (`launcher-menu-opaque.ts`).
 *   5. RETIRED  — a type Tracy retired (Releases, History: ADR 0024) lands on the type that took
 *                 over from it (`RETIRED_TABS`, Site changes): a `?tab=` naming it opens the
 *                 successor, and a tab of it restored from the saved layout gives its place to one
 *                 once the page can open it (`replaceRetiredTab` waits; it never closes the tab
 *                 before its successor is in sight).
 *   6. RENAMED  — after Settings › Site URL, `site=` names the site by its new address (tabs keep
 *                 the immutable key in their meta; a link naming any of its names still opens it),
 *                 and a Browser tab on the old address moves to the same page at the new one.
 *
 * "Copy link" is gone since better-sidebar 0.21.1: it lived in the side card's own right column,
 * which upstream dropped for dsh's native one (the `sidebarRight` service), and the side card no longer
 * asks any plugin for a tab's address (`registerTabLink` was removed with it).
 *
 * Every Tracy tab now opens in that native column, so "the tab in sight" is read from it
 * (`columnView`), not from the side card's snapshot, which keeps only its bottom panel.
 *
 * The half that knows what an address means, and how it is rewritten, is `@tracy/core/tab-link`;
 * this file only wires it to `betterSidebar`, `sidebarRight` and `sessions`.
 */
import {
  INTENT_COOKIE,
  activeTracyTab,
  columnView,
  creationTabFor,
  intentFromCookie,
  mirroredPath,
  openTabWithMeta,
  parseTabLink,
  replaceRetiredTab,
  sidebarRightOf,
  tabLinkOfClick,
  type OpenTab,
  type TabLink
} from '@tracy/core/tab-link'
import { mainSessionOf } from '@tracy/core/session'
import { followedAddress, siteKeyFor, siteNameFor, siteRowFor, type NamedSiteRow } from '@tracy/core/site-key'
import { SITES_CHANGED, readSites } from '../../../tracy-sidebar/src/client/sites.mjs'

import { pageBase } from './dsh-url'
import { en, NS } from './strings'
import { LAUNCHER_TABS } from '@tracy/core/ui-switches'
import { installStripFillReset } from './strip-fill-reset'
import { installLauncherMenuOpaque } from './launcher-menu-opaque'

/** Native launcher presentation; tab registration and permissions stay with their owners. */
interface LauncherHost {
  registerLauncher: (launcher: { kinds: readonly string[]; label: string; emptyLabel: string }) => () => void
}

interface Locale {
  register: (namespace: string, dictionaries: Record<string, Record<string, string>>) => () => void
  bind: (namespace: string) => (key: string) => string
}

/** The slice of `dsh-better-sidebar`'s service this plugin reads. Structural on purpose: importing the vendor's types would bundle the side card. */
interface BetterSidebar {
  getTab: (type: string) => { hidden?: boolean } | undefined
  /** False for a type this deployment (or the viewer) switched off: `openTab` refuses it. */
  isTabEnabled?: (type: string) => boolean
  /** Registry changes: a tab type registered or disposed. */
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => { sessionId?: string; state?: unknown }
  /** The side card's own changes: its bottom panel, and the session it follows. */
  subscribeState: (listener: () => void) => () => void
  openTab: (seed: { type: string; title?: string; meta?: unknown }) => void
  /** Patches an open tab's meta; absent on an older side card, where a press only opens (#381). */
  updateTab?: (tabId: string, patch: { title?: string; meta?: unknown }) => void
  /** 0.21.1-tracy.1+: the open tabs of one type, native records first (their `meta` holds the site). */
  openTabsOf?: (type: string) => readonly OpenTab[]
}

/** The slice of dsh's sessions service this plugin reads. */
interface Sessions {
  list: {
    getSnapshot: () => {
      byId: Record<string, { retainedBy?: Partial<Record<string, number>> } | undefined>
      phase: string
    }
    subscribe: (listener: () => void) => () => void
  }
}

/** How long a pasted `?tab=` waits for its tab type to register before giving up (a lane without that plugin). */
const OPEN_DEADLINE_MS = 20_000
/**
 * How often the mirror looks again. dsh's right column publishes no event when the person merely
 * switches tab (`openTabs` fires when a tab opens or closes, `mounted` when the seat changes), so a
 * click from one tab to another would otherwise leave the address naming the previous one. One read
 * of two getters, and an address write only when it would change.
 */
const MIRROR_PULSE_MS = 500
/**
 * How long the open waits for the session a build link asked for.
 *
 * `startSession` returns BEFORE that session exists — measured on production 08/09 at about a
 * second for the request it fires — so opening the moment it returns lands the tab in the session
 * the person was already in, which is the one thing a fresh session exists to avoid. Bounded: when
 * the wait runs out the tab still opens where it can, because losing the press is worse than
 * landing it a session early.
 */
const FRESH_SESSION_WAIT_MS = 8_000

/** A registered Tracy tab keeps its address even when absent from the launcher. */
function linkable(sidebar: BetterSidebar, type: string): boolean {
  // Browser owns its page + mode URL through tracy-site-tabs. Mirroring a
  // second tab/site intent would reopen the homepage over that page on reload.
  return type !== 'tracy:browser' && type.startsWith('tracy:') && sidebar.getTab(type) !== undefined
}

/** The slice of dsh's `ui-workspace` this plugin uses: one call, the same the rail's + button makes. */
interface Workspace {
  startSession: (workspaceId?: unknown) => void
  // dsh 0.1.6-alpha.2: switching the main view is `ui-workspace`'s, not the sessions service's.
  openSession: (sessionId: string) => void
}

/**
 * Where a build intent waits out the navigation that starting a session causes.
 *
 * Starting a session is a route change, and dsh carries `?search` through it — so the intent
 * cannot simply be left in the address (it would start another session, and another), and it
 * cannot only live in memory either, in case the change reloads the page. It goes here, is put
 * back only when the address has none, and is dropped the moment the tab opens.
 *
 * `sessionStorage`, not `localStorage`: an intent belongs to the browser tab that was pressed in,
 * and must not reach a second window or survive the browser closing.
 */
const INTENT_KEY = 'tracy-tab-link:intent'

/** @param link - the link whose intent to keep; nothing is written when it carries none. */
function stashIntent(link: TabLink): void {
  try {
    sessionStorage.setItem(
      INTENT_KEY,
      JSON.stringify({ inspiration: link.inspiration, platform: link.platform })
    )
  } catch {
    // A private window, or site data blocked. The intent then lives only in memory, which is
    // enough whenever the session change does not reload the page.
  }
}

/**
 * The stashed intent, or null when there is none (or it cannot be read).
 *
 * The stash is filled from two places: the address (`stashIntent`, a press that arrived as
 * `?inspiration=`), and — since 20/09 — the cookie `tracy-web` writes when it sends a press
 * straight to its session (`/new/s/<id>?tab=…`, `INTENT_COOKIE` says why). The cookie is read
 * ONCE, moved into the stash so a reload still finds it, and deleted: a cookie left standing
 * would make the next plain visit to `/new/` a press.
 */
function stashedIntent(): { inspiration: string; platform?: string } | null {
  let raw = null
  try {
    raw = sessionStorage.getItem(INTENT_KEY)
  } catch {
    return null
  }
  if (raw === null) {
    const fromCookie = intentFromCookie(document.cookie)
    if (fromCookie === null) return null
    // The path `tracy-web` wrote it on: the page base without its trailing slash (`/new`). A
    // delete on any other path is a different cookie, and the press would be read again.
    const path = new URL(pageBase()).pathname.replace(/\/$/, '') || '/'
    document.cookie = `${INTENT_COOKIE}=; Path=${path}; Max-Age=0`
    // A press asking for a new site opens the Add site wizard, not a Build tab — one creation
    // flow (`creationTabFor`). The intent keeps its shape: the design and the CMS still travel
    // with it, and the wizard is what reads them now.
    stashIntent({ type: creationTabFor(), ...fromCookie })
    return fromCookie
  }
  try {
    const kept = JSON.parse(raw) as { inspiration?: unknown; platform?: unknown }
    if (typeof kept.inspiration !== 'string') return null
    return {
      inspiration: kept.inspiration,
      ...(typeof kept.platform === 'string' ? { platform: kept.platform } : {})
    }
  } catch {
    return null
  }
}

/** The link with the stashed intent put back, when it has none of its own. */
function withStashedIntent(link: TabLink): TabLink {
  const kept = stashedIntent()
  return kept === null ? link : { ...link, ...kept }
}

/**
 * A link made from the stash alone — the reload case. The mirror cleans `?inspiration=` off the
 * address on its first pass, so after a reload the address asks for nothing at all; the stash is
 * then the only record of the press, and it asks for the same tab the address did.
 */
function linkFromStash(): TabLink | null {
  const kept = stashedIntent()
  return kept === null ? null : { type: creationTabFor(), ...kept }
}

/**
 * Spent. Called when the tab opens — and ONLY then. An open that gives up (the deadline ran out:
 * the Build plugin never registered, the session list never settled) keeps the stash, so a
 * reload of the same tab tries again with the same intent instead of arriving with none. The
 * address was already cleaned by the mirror; the stash is the only copy left, and dropping it on
 * a timeout was dropping the press. Plan first-site-build-onboarding §3: an intent is consumed
 * when the tab it asked for is open, never by a timeout.
 */
function dropIntent(): void {
  try {
    sessionStorage.removeItem(INTENT_KEY)
  } catch {
    // Nothing to drop.
  }
}

export const inject = ['betterSidebar', 'sessions', 'uiWorkspace', 'sidebarRight', 'locale']

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  get: (name: string) => unknown
  betterSidebar: BetterSidebar
  sessions: Sessions
}): void {
  const locale = ctx.get('locale') as Locale
  const launcherHost = ctx.get('sidebarRight') as LauncherHost
  ctx.effect(() => locale.register(NS, { en }), 'tracy-tab-link: dictionaries')
  ctx.effect(() => {
    const t = locale.bind(NS)
    return launcherHost.registerLauncher({
      // Every tab a `launch-*` switch names (/ops › User Interface); which of them show is the
      // switches' call, through the side card's tab policy — not a list fixed here.
      kinds: LAUNCHER_TABS,
      get label() {
        return t('launcher.open')
      },
      get emptyLabel() {
        return t('launcher.empty')
      }
    })
  }, 'tracy-tab-link: native launcher')
  // The launcher's menu is opaque, as Tracy's own menus are (`launcher-menu-opaque.ts`).
  ctx.effect(() => installLauncherMenuOpaque(document), 'tracy-tab-link: opaque launcher menu')
  // 3. RESET — the strip gap resets the column width (see the file header).
  ctx.effect(() => installStripFillReset(document), 'tracy-tab-link: strip gap resets the width')
  const sidebar = ctx.betterSidebar
  const sessions = ctx.sessions
  // A service, not a property on the context: `ui-sidebar` reads it the same way, and reaching for
  // `ctx.uiWorkspace` gets undefined.
  const workspace = ctx.get('uiWorkspace') as Workspace | undefined
  // Read what the address asks for BEFORE the mirror below runs once: with the panel collapsed
  // (a fresh conversation) the mirror's first pass strips `?tab=` from the address, and an open
  // that parsed the address after that would find nothing to open. Measured 06/09 on the local
  // native profile — the link landed on the right session and did nothing else.
  const fromUrl = parseTabLink(location.search)
  // A build intent survives the navigation that acting on it causes; see `stashIntent`. The
  // address is the truth when it still carries one, and the stash only fills a gap it left.
  const asked =
    fromUrl === null
      ? linkFromStash()
      : fromUrl.inspiration === undefined
        ? withStashedIntent(fromUrl)
        : fromUrl

  // A link that names an inspiration was pressed on the public Design inspiration page, and it
  // asks for a BUILD — so it gets a session of its own (07/09: "open a new session, keep the
  // users' current workspace as it is"). Without this the build lands in whatever conversation
  // the person had open, on top of whatever that lane last built — measured 08/09 on lucaswp: a
  // press of Build with WordPress landed on a finished Joomla build from another session.
  //
  // Only when the intent came from the ADDRESS. Started from the stash it would loop: the stash
  // exists precisely because the address may have been cleaned already.
  // What the open below must wait for, written by the effect that starts the session.
  const fresh: { before?: string; until: number } = { until: 0 }
  // While the open is in flight the mirror holds its hand (see the mirror). Set here, before any
  // effect runs, so the mirror's first pass already knows.
  let opening = asked !== null

  // A site's KEY never changes; its NAME does (Settings › Site URL). Tabs keep the key in their
  // meta; the address shows the name (`site=<current address>`), and a link naming any name of the
  // site opens the tab for its key. The page's one `/api/sites` answer says which is which, read
  // again whenever the viewer's sites change (bug 03/10/2026: `site=` kept the old address).
  let siteRows: readonly NamedSiteRow[] = []
  /** Whether the list has answered once (a failed read counts: the open must not wait forever). */
  let siteRowsRead = false
  ctx.effect(() => {
    let alive = true
    const read = (): void => {
      void readSites().then((answer) => {
        if (!alive) return
        siteRowsRead = true
        const sites = (answer.body as { sites?: unknown } | null)?.sites
        if (answer.status >= 200 && answer.status < 300 && Array.isArray(sites)) siteRows = sites
      })
    }
    read()
    window.addEventListener(SITES_CHANGED, read)
    return () => {
      alive = false
      window.removeEventListener(SITES_CHANGED, read)
    }
  }, 'tracy-tab-link: site names')

  ctx.effect(() => {
    if (fromUrl?.inspiration === undefined) return
    // Stashed BEFORE the workspace check, not after it: the mirror below cleans the address on
    // its first pass either way, and on a shell without `uiWorkspace` the intent used to be
    // dropped right there — the tab opened in the session in sight, and a reload found nothing.
    stashIntent(fromUrl)
    if (workspace === undefined) return
    let done = false
    const start = (): void => {
      if (done) return
      // Not before dsh knows what sessions there are: `startSession` picks the workspace to start
      // in, and asked too early it has nothing to pick from.
      if (sessions.list.getSnapshot().phase === 'pending') return
      done = true
      fresh.before = sidebar.getSnapshot().sessionId
      fresh.until = Date.now() + FRESH_SESSION_WAIT_MS
      try {
        workspace.startSession()
      } catch {
        // A side card without a workspace behind it: the tab still opens, in the session in sight.
        fresh.until = 0
      }
    }
    const stop = sessions.list.subscribe(start)
    start()
    return stop
  }, 'tracy-tab-link: a build link gets its own session')

  // 1. MIRROR — the address follows the tab in sight. `replaceState`, never `pushState`: dsh's
  // own session changes are the only history entries, so Back stays "previous session".
  //
  // Since 20/09 the mirror also writes the session into a BARE base in the same stroke — the one
  // dsh would otherwise write a beat later, in a second `replaceState` (`mirroredPath` says why,
  // and why never into a path that already names one). The session comes from dsh's list, not the
  // path: at that moment the path does not have it yet.
  // Retired tab ids already swapped for their successor on this page (`replaceRetiredTab`).
  const replaced = new Set<string>()
  /**
   * 6. RENAMED — a Browser tab still on a site's OLD address moves to the same page at the address
   * the site answers at now (`followedAddress`). Its record's `meta.url` is what the tab loads and
   * what its chip is titled after, so a rename left the chip and the page on the old host
   * (bug 03/10/2026). Only tabs with a live record can be moved; one restored behind another tab
   * gets its record when it is shown, and the next pulse moves it then.
   */
  const followRenamedSites = (): void => {
    if (siteRows.length === 0 || typeof sidebar.updateTab !== 'function') return
    let tabs: readonly OpenTab[] = []
    try {
      tabs = sidebar.openTabsOf?.('tracy:browser') ?? []
    } catch {
      return
    }
    for (const tab of tabs) {
      const meta = (typeof tab.meta === 'object' && tab.meta !== null ? tab.meta : {}) as { url?: unknown }
      if (typeof meta.url !== 'string') continue
      const next = followedAddress(meta.url, siteRows)
      if (next === null) continue
      sidebar.updateTab(tab.id, { meta: { ...meta, url: next }, title: new URL(next).hostname })
    }
  }

  ctx.effect(() => {
    const mirror = (): void => {
      const list = sessions.list.getSnapshot()
      // Not before the list is real: a mirror that runs while it is pending can only tend the
      // query, and the session write a beat later is then a second stroke — measured 20/09 on
      // dev as `/new/?intent → /new/ → /new/s/<id>`. Waiting folds the two into one.
      if (list.phase === 'pending') return
      // Nor while an open is in flight: the address names the tab about to open, and a mirror
      // that runs between the list turning real and the tab appearing sees no tab in sight,
      // strips `?tab=` — and writes it back a beat later when the tab is there. Two strokes for
      // an address that was right all along. The open's `finish` lifts this, and the state change
      // `openTab` makes brings the mirror round with the tab in sight.
      if (opening) return
      // A tab of a retired type restored from the saved layout (Releases, History) shows nothing:
      // the one that took over from it opens in its place (`RETIRED_TABS`). The same pulses that
      // keep the address on the tab in sight find it, a click away from another tab included.
      replaceRetiredTab(sidebarRightOf(ctx), sidebar, replaced)
      followRenamedSites()
      const tab = activeTracyTab(columnView(sidebarRightOf(ctx), sidebar))
      const ref =
        tab === null || !linkable(sidebar, tab.type)
          ? null
          : tab.siteKey === undefined
            ? tab
            : { ...tab, siteKey: siteNameFor(siteRows, tab.siteKey) }
      const next = mirroredPath({
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        base: new URL(pageBase()).pathname,
        sessionId: list.phase === 'pending' ? null : mainSessionOf(list),
        tab: ref
      })
      if (next === `${location.pathname}${location.search}${location.hash}`) return
      history.replaceState(history.state, '', next)
    }
    const stop = sidebar.subscribeState(mirror)
    // dsh's list is what tells the session before the path does — mirror on it as well.
    const stopList = sessions.list.subscribe(mirror)
    // The right column: a tab opened or closed, and the seat changing session.
    const right = sidebarRightOf(ctx)
    const stopTabs = right?.openTabs?.subscribe(mirror)
    const stopMounted = right?.mounted?.subscribe(mirror)
    // And a switch between two open tabs, which the column announces nowhere (`MIRROR_PULSE_MS`).
    const pulse = window.setInterval(mirror, MIRROR_PULSE_MS)
    // dsh's Back/Forward writes the address it recorded — the old search included — before the
    // side card follows the session; mirroring on popstate as well closes that gap.
    window.addEventListener('popstate', mirror)
    mirror()
    return () => {
      stop()
      stopList()
      stopTabs?.()
      stopMounted?.()
      window.clearInterval(pulse)
      window.removeEventListener('popstate', mirror)
    }
  }, 'tracy-tab-link: mirror')

  // 2. OPEN — what a pasted address asks for. Three things must be true before the open lands
  // in the right place: the session list is real (so `&s=` can be judged), the side card is
  // bound to the session the link names (or to whatever session the page restored, when the
  // link names none or an unlisted one), and the tab type is registered.
  ctx.effect(() => {
    if (asked === null) return
    let done = false
    let switching = false
    let browserAddress: string | undefined
    let browserPending = asked.type === 'tracy:browser' && asked.siteKey !== undefined
    const disposers: (() => void)[] = []
    const finish = (opened: boolean): void => {
      done = true
      opening = false
      if (opened) dropIntent()
      for (const dispose of disposers.splice(0)) dispose()
    }
    const tryOpen = (): void => {
      if (done) return
      if (browserPending) return
      const list = sessions.list.getSnapshot()
      if (list.phase === 'pending') return
      if (asked.sessionId !== undefined) {
        if (list.byId[asked.sessionId] === undefined || workspace === undefined) {
          // Unknown session — or a shell that cannot switch (no `uiWorkspace`): open where we are.
          delete asked.sessionId
        } else if (mainSessionOf(list) !== asked.sessionId) {
          if (!switching) {
            switching = true
            workspace.openSession(asked.sessionId)
          }
          return
        }
      }
      const bound = sidebar.getSnapshot().sessionId
      if (bound === undefined || bound !== mainSessionOf(list)) return
      // A build link asked for a session of its own, and that session does not exist yet at the
      // moment `startSession` returns. Opening here would put the tab back in the conversation the
      // person was already having.
      if (fresh.until > Date.now() && bound === fresh.before) return
      if (sidebar.getTab(asked.type) === undefined) return
      // A link names the site by any of its names; the tab is keyed by the site's key.
      if (asked.siteKey !== undefined && !siteRowsRead) return
      const siteKey =
        asked.siteKey === undefined ? undefined : (siteKeyFor(siteRows, asked.siteKey) ?? asked.siteKey)
      finish(true)
      // No `id`: the native column mints its own and keeps one tab per kind in a pane, so a second
      // press FOCUSES the tab of that kind already there (a navigation that keeps its old meta).
      const seed = {
        type: asked.type,
        ...(browserAddress === undefined
          ? {}
          : { url: browserAddress, title: siteNameFor(siteRows, asked.siteKey ?? '') }),
        // `id` is what the Build tab calls an inspiration; `siteKey` is the site the tab is for.
        // Anything absent stays absent — an empty key in meta reads as "asked for nothing", which
        // is not the same as "did not ask".
        meta: {
          ...(siteKey !== undefined ? { siteKey } : {}),
          ...(browserAddress === undefined ? {} : { url: browserAddress }),
          ...(asked.inspiration !== undefined ? { id: asked.inspiration } : {}),
          ...(asked.platform !== undefined ? { platform: asked.platform } : {}),
          // An intent from the address is a press (the public page's Create with): stamped so the
          // Build tab may act on it now, and not again when the side card restores it later.
          ...(asked.inspiration !== undefined ? { pressedAt: Date.now() } : {})
        }
      }
      // What the link asks for must reach the tab that is now in sight. A tab of that kind already
      // open — from the `+` list, for another card, or on another site — is only FOCUSED by the open,
      // its meta untouched: a press's platform and card were lost that way (#381), and a link naming
      // another site would show the old one. So the link's meta is written onto the tab the open
      // landed on. A link that names nothing (no site, no press) leaves that tab's meta alone.
      if (Object.keys(seed.meta).length > 0) openTabWithMeta(sidebar, sidebarRightOf(ctx), seed)
      else sidebar.openTab({ type: seed.type })
      // An address naming a tab is the person asking to see it, so the column opens even on a narrow
      // frame, where dsh leaves an open no gesture caused behind its toggle (fork, TCH K1): a page
      // load carries no gesture, so without this a phone would land on the chat with the tab hidden.
      const right = sidebarRightOf(ctx)
      try {
        if (right !== undefined && !right.isExpanded()) right.toggleExpanded()
      } catch {
        // No seat mounted yet: dsh refuses the command, and the open above already placed the tab.
      }
    }
    disposers.push(
      sessions.list.subscribe(tryOpen),
      sidebar.subscribeState(tryOpen),
      sidebar.subscribe(tryOpen)
    )
    const deadline = window.setTimeout(() => finish(false), OPEN_DEADLINE_MS)
    disposers.push(() => window.clearTimeout(deadline))
    // Subscriptions fire on change; a wait that simply runs out changes nothing, so it wakes the
    // open itself. Cheap, and it only exists while a build link is in flight.
    const ticker = window.setInterval(tryOpen, 250)
    disposers.push(() => window.clearInterval(ticker))
    if (browserPending) {
      const controller = new AbortController()
      disposers.push(() => controller.abort())
      fetch('/api/sites', { credentials: 'same-origin', signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('Site lookup failed')
          return (await response.json()) as {
            sites?: Array<{ siteKey?: unknown; status?: unknown; copyUrl?: unknown }>
          }
        })
        .then((body) => {
          if (done) return
          // Any name of the site finds it: a link written before a rename still opens it.
          const found = siteRowFor(Array.isArray(body.sites) ? body.sites : [], asked.siteKey)
          const site = found?.status === 'accepted' ? found : undefined
          if (typeof site?.copyUrl !== 'string') {
            finish(false)
            return
          }
          const address = new URL(site.copyUrl)
          if (address.protocol !== 'https:' && address.protocol !== 'http:') {
            finish(false)
            return
          }
          browserAddress = address.href
          browserPending = false
          tryOpen()
        })
        .catch(() => {
          if (!done) finish(false)
        })
    }
    tryOpen()
    // Disposal (a plugin reload) is not a spent intent either.
    return () => finish(false)
  }, 'tracy-tab-link: open')

  // 7. CLICK — a Tracy tab link in the chat opens its tab where the person is. The site agent answers
  // "where do I connect my domain" with `…/<site>/?tab=tracy:site-publish&site=<site>` (`tracy_guide`);
  // dsh draws an https link as external, so a click opened a new browser tab and loaded the page again.
  // Here the click is taken in the CAPTURE phase, before dsh's anchor handler, and only when the link is
  // one of ours to THIS workspace (`tabLinkOfClick`); anything else — another host, another site, a
  // modifier key, a middle click — goes to the browser as before. The tab opens through the same call the
  // address uses (`openTabWithMeta`), so a tab of that kind already open is focused and given the site.
  ctx.effect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (anchor === null || anchor === undefined) return
      if (anchor.target === '_blank' && anchor.rel.includes('external')) return
      const base = new URL(pageBase())
      const link = tabLinkOfClick(anchor.getAttribute('href') ?? '', {
        origin: base.origin,
        basePath: base.pathname
      })
      if (link === null || sidebar.getTab(link.type) === undefined) return
      const siteKey =
        link.siteKey === undefined ? undefined : (siteKeyFor(siteRows, link.siteKey) ?? link.siteKey)
      event.preventDefault()
      event.stopPropagation()
      if (siteKey === undefined) sidebar.openTab({ type: link.type })
      else openTabWithMeta(sidebar, sidebarRightOf(ctx), { type: link.type, meta: { siteKey } })
      const right = sidebarRightOf(ctx)
      try {
        if (right !== undefined && !right.isExpanded()) right.toggleExpanded()
      } catch {
        // No seat mounted yet: the open above already placed the tab.
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, 'tracy-tab-link: tab links open in place')
}
