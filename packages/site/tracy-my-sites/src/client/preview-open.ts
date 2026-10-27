import { openTabWithMeta, type SidebarRight, type TabOpener } from '@tracy/core/tab-link'

/**
 * Whether the preload of a site's preview (the Browser tab My Sites opens once when a site
 * workspace loads) must stand down because a Browser tab already shows that site.
 *
 * 🔒 A PAGE SOMEONE ASKED FOR BEATS THE DEFAULT. A link `?open=browser&page=/about/&mode=edit`
 * (read by `@tracy/dsh-site-tabs`) opens the Browser tab on that page. The preload used to open
 * `copyUrl` — the site's root — a beat later, and the native column keeps one Browser tab per
 * pane, so it retargeted the SAME tab back to `/` (measured 27/09 on the stand: `/about/` at
 * 1167 ms, `/` at 1279 ms). Checking the open tabs right before the open is race-free in both
 * orders: preload first → the link's open lands after it and wins; link first → the preload sees
 * the tab and does nothing. It is also simply right on its own — preloading a site already on
 * screen adds nothing, and moving that tab would throw away whatever page the person is on.
 *
 * Matched by HOSTNAME, like the reload rules (`tracy-site-tabs` `browserTabsOn`): a tab on any page
 * of the site counts.
 * @param tabs - `openTabsOf('tracy:browser')`; absent on an older side card (nothing counts).
 * @param copyUrl - the address the site is served at.
 */
export function previewAlreadyOpen(
  tabs: readonly { type?: unknown; path?: unknown; meta?: unknown }[] | undefined,
  copyUrl: string
): boolean {
  const host = hostOf(copyUrl)
  if (host === null || !Array.isArray(tabs)) return false
  return tabs.some((tab) => {
    if (tab?.type !== 'tracy:browser') return false
    const url = (tab.meta as { url?: unknown } | undefined)?.url
    return hostOf(typeof url === 'string' && url !== '' ? url : tab.path) === host
  })
}

/**
 * Whether one conversation's right column already holds a Browser tab, or undefined when dsh cannot
 * say (no `openTabs` listing, or no session known) — the caller then falls back to
 * {@link previewAlreadyOpen}.
 *
 * 🔒 PER SESSION, NOT `openTabsOf`. dsh keeps one column per conversation, and the side card's
 * `openTabsOf` lists the records of every conversation's Browser tab (one left behind stays mounted),
 * so a second conversation read it as "already open" and was left with an empty column. Any Browser
 * tab counts, on whatever page: it is the one this column keeps (dsh `keepLast`), and a link that
 * opened it on `/about/` must keep its page.
 * @param openTabs - `ctx.sidebarRight.openTabs` (every session's tabs, each naming its session).
 * @param sessionId - the conversation whose column is asked about.
 */
export function browserInColumn(
  openTabs: { getSnapshot?(): readonly { sessionId: string; kind: string }[] } | undefined,
  sessionId: string | undefined
): boolean | undefined {
  if (sessionId === undefined || typeof openTabs?.getSnapshot !== 'function') return undefined
  return openTabs.getSnapshot().some((tab) => tab.sessionId === sessionId && tab.kind === 'tracy:browser')
}

/** The part of dsh's right column an open behind the person's tab needs (`sidebarRightOf`). */
export interface RightColumn {
  active(): { id: string; kind?: string } | undefined
  focus(id: string): void
  isExpanded(): boolean
  toggleExpanded(): void
}

/**
 * Open the site preview BEHIND whatever the person is on. An open lands in sight — it activates its
 * tab and expands dsh's right column — and the preload arrives seconds after boot, on top of the
 * tab somebody just picked or a link just opened (measured 05/09 on the old side card). So: note
 * the tab in sight and whether the column was open, open, then hand both back. The note, the open
 * and the hand-back run in one synchronous stretch, so a tab a link opens — before or after — is
 * still the one in sight; that is why a `?tab=` link no longer cancels the preload (28/09: a
 * `?tab=tracy:my-sites` session had no Browser tab on its own site at all).
 * @param right - dsh's right column, or undefined when it cannot be read (then just open).
 * @param open - opens the preview tab.
 */
export function openBehind(right: RightColumn | undefined, open: () => void): void {
  // dsh's guide is the column's "nothing picked yet" page: with the + launcher it is hidden from the
  // strip and its body reads "Click + to start". Handing focus back to it left a fresh conversation's
  // column blank beside its Browser chip (measured 03/10 on a stand), so only a real tab gets it back.
  const active = right?.active()
  const before = active === undefined || active.kind === 'guide' ? undefined : active.id
  const wasOpen = right?.isExpanded() ?? false
  open()
  if (right === undefined) return
  if (before !== undefined) right.focus(before)
  if (!wasOpen && right.isExpanded()) right.toggleExpanded()
}

/**
 * Run `open` for every conversation the side card comes to follow while it is the one on screen:
 * once when the page binds its first session, and once more for each other session it is moved to
 * (a new chat, another conversation picked in the sidebar). Each session's right column is its own
 * (dsh keeps one surface per session), so a Browser tab opened for the first conversation is not in
 * the second one's column — the site workspace's own page has to be put in each (Brian 03/10/2026).
 *
 * WHY WAIT FOR THE SEAT. The site list answers before the page has bound a session (measured 28/09:
 * `bound` and `mounted` both undefined, the path still `/<site>/`), and dsh's column refuses an open
 * it has no session for — the preview was dropped without a word, and the session bound three
 * seconds later with no Browser tab on its own site. So a session counts once the side card follows
 * the one the column shows.
 *
 * Once per session per page: what `open` does with a column that already holds the site is its own
 * check (`previewAlreadyOpen`). Without a way to read the seat (an older side card) it runs once at
 * once, as it always did.
 * @param sidebar - the side card: the session it follows, and its change feed.
 * @param right - dsh's right column: the session on screen, and its change feed.
 * @param open - what to run for a newly seated session.
 * @returns stop following.
 */
export function everySeat(
  sidebar: {
    getSnapshot?: () => { sessionId?: string }
    subscribeState?: (listener: () => void) => () => void
  },
  right:
    | { mounted?: { getSnapshot(): string | undefined; subscribe(listener: () => void): () => void } }
    | undefined,
  open: (sessionId: string | undefined) => void
): () => void {
  const mounted = right?.mounted
  if (mounted === undefined || sidebar.getSnapshot === undefined) {
    open(undefined)
    return () => {}
  }
  const done = new Set<string>()
  const check = (): void => {
    const onScreen = mounted.getSnapshot()
    if (onScreen === undefined || sidebar.getSnapshot?.().sessionId !== onScreen) return
    if (done.has(onScreen)) return
    done.add(onScreen)
    open(onScreen)
  }
  const stops = [mounted.subscribe(check)]
  if (sidebar.subscribeState !== undefined) stops.push(sidebar.subscribeState(check))
  check()
  return () => {
    for (const stop of stops.splice(0)) stop()
  }
}

function hostOf(value: unknown): string | null {
  try {
    return typeof value === 'string' && value !== '' ? new URL(value).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * What a `?open=my-sites&team=<siteKey>&member=<email>` link opens (Lee 04/09; `readDeepLink`).
 *
 * 🔒 WAIT UNTIL THE SIDE CARD FOLLOWS A SESSION, THEN OPEN THE TEAM TAB ITSELF. Measured 04/10 on
 * the stand: the link's open ran at boot, when dsh's right column could not be read yet (so
 * the old seat wait saw no column and opened at once) and the side card followed no session, and dsh
 * drops an open it has no session for. The request was left for the My Sites tab to consume when it
 * mounted, but a saved layout with the Browser tab in sight never mounts it, so a team mail landed
 * on the Browser tab. This waits the way `?open=browser` does (`tracy-site-tabs` `openBrowserLink`):
 * it asks again every `LINK_TICK_MS` until the side card follows the session on screen, reading the
 * column afresh each time.
 *
 * 🔒 NO GIVING UP BEFORE A SESSION IS BOUND, AND NOT DONE UNTIL THE TAB IS IN SIGHT (mail audit
 * 04/10/2026). The bare address Akemi copied from a "View team" press was the bar AFTER the query
 * was stripped: the link was read, then the Team tab never opened. A cold load right after a deploy
 * can take longer than the old 20 s budget to bind a session, and an open the column swallowed was
 * never sent again. Now the wait for a session has no deadline (the page stops it on unload), an
 * open is re-sent each tick until the column's active tab is the one asked for, `timeoutMs` bounds
 * only those re-sends, and `onOpened` (where the caller strips the query) runs once it landed.
 *
 * 🔒 THE LINK STAYS AUTHORITATIVE FOR `guardMs` AFTER IT LANDED. Live on cowork.tracy.site 04/10, one
 * click in two: the Team tab opened, then the session's restored Browser tab took focus back (and
 * the address became `?open=browser&page=/`). For `guardMs` after landing, a move away from the
 * asked tab that the person did not make is undone; their first pointer or key press ends it.
 * @param asked - the link's request (`readDeepLink`).
 * @param sidebar - the side card.
 * @param rightOf - reads dsh's right column; undefined until the page has one.
 * @param tabs - the Team tab type and the My Sites tab id.
 * @param options - `timeoutMs`: how long to keep re-sending once a session is bound; `onOpened`:
 *   called once, when the asked tab is open (or cannot be checked); a bare number is `timeoutMs`.
 * @returns a disposer that stops the wait.
 */
export function openFromLink(
  asked: { team: string | null; member: string | null },
  sidebar: TabOpener & { getSnapshot?: () => { sessionId?: string } },
  rightOf: () => SidebarRight | undefined,
  tabs: { team: string; list: string },
  options:
    | number
    | { timeoutMs?: number; onOpened?: () => void; guardMs?: number; input?: EventTarget | null } = {}
): () => void {
  const {
    timeoutMs = SEAT_WAIT_MS,
    onOpened,
    guardMs = LINK_GUARD_MS,
    input = typeof document === 'undefined' ? null : document
  } = typeof options === 'number' ? { timeoutMs: options } : options
  const type = asked.team === null ? tabs.list : tabs.team
  let done = false
  let boundAt: number | null = null
  let landedAt: number | null = null
  let guarding = true
  const stopGuard = (): void => {
    guarding = false
    input?.removeEventListener('pointerdown', stopGuard, true)
    input?.removeEventListener('keydown', stopGuard, true)
  }
  input?.addEventListener('pointerdown', stopGuard, true)
  input?.addEventListener('keydown', stopGuard, true)
  const finish = (): void => {
    done = true
    clearInterval(ticker)
    stopGuard()
  }
  const open = (right: SidebarRight | undefined): void => {
    if (asked.team === null) sidebar.openTab?.({ type: tabs.list })
    else {
      const meta = asked.member ? { siteKey: asked.team, member: asked.member } : { siteKey: asked.team }
      openTabWithMeta(sidebar, right, { type: tabs.team, meta })
    }
  }
  const landed = (): void => {
    if (landedAt !== null) return
    landedAt = Date.now()
    onOpened?.()
    if (!guarding || guardMs <= 0) finish()
  }
  /** After landing: undo a focus move the person did not make, until `guardMs` or their first input. */
  const guard = (): void => {
    if (!guarding || landedAt === null || Date.now() - landedAt > guardMs) return finish()
    const right = rightOf()
    let active: string | undefined
    try {
      active = right?.active?.()?.kind
    } catch {
      return
    }
    if (active !== undefined && active !== type) open(right)
  }
  const tryOpen = (): void => {
    if (done || typeof sidebar.openTab !== 'function') return
    if (landedAt !== null) return guard()
    const bound = sidebar.getSnapshot?.().sessionId
    if (typeof sidebar.getSnapshot === 'function' && bound === undefined) return
    const right = rightOf()
    let onScreen: string | undefined
    try {
      onScreen = right?.mounted?.getSnapshot()
    } catch {
      return
    }
    if (right?.mounted !== undefined && onScreen !== bound) return
    boundAt ??= Date.now()
    // Already the active tab (an earlier open landed): done.
    let active: string | undefined
    try {
      active = right?.active?.()?.kind
    } catch {
      active = undefined
    }
    if (active === type) return landed()
    open(right)
    // A column that cannot say which tab is active cannot be checked: the open is all there is.
    if (typeof right?.active !== 'function') return landed()
    try {
      if (right.active()?.kind === type) return landed()
    } catch {
      return landed()
    }
    if (Date.now() - boundAt > timeoutMs) landed()
  }
  const ticker = setInterval(tryOpen, LINK_TICK_MS)
  tryOpen()
  return finish
}

/** How long a landed link undoes focus moves the person did not make (a restored tab). */
export const LINK_GUARD_MS = 6_000

/** How often a link's open asks again whether the side card follows a session yet. */
export const LINK_TICK_MS = 250

/** How long a link keeps re-sending its open once a session is bound (it waits for one without a deadline). */
export const SEAT_WAIT_MS = 20_000
