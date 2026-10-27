/**
 * The address of a side-card tab (tasks/todo-deeplink-tab.md, 06/09).
 *
 * dsh writes the session to the path (`<base>s/<sessionId>`) and carries `?search` and `#hash`
 * through untouched; the side card keeps its layout in localStorage and says nothing on the
 * address bar. These functions fill the gap for Tracy's tabs — the ones typed `tracy:*`:
 *
 *   ?tab=<type>&site=<siteKey>          what the address bar mirrors while such a tab is in sight
 *   ?tab=<type>&site=<siteKey>&s=<id>   a shareable link (`buildTabLink`) — the session LAST, so
 *                                        cutting it off leaves a link that opens the tab in the
 *                                        reader's own session instead of the sender's. Nothing
 *                                        hands it out since better-sidebar 0.21.1: the side card's
 *                                        "Copy link" left with its own right column.
 *
 * No `window`: the services a function reads (the side card, dsh's right column) are passed in.
 * `@tracy/dsh-tab-link` wires them to the address bar.
 */

export const TAB_PARAM = 'tab'
export const SITE_PARAM = 'site'
export const SESSION_PARAM = 's'
/**
 * What a visitor pressed on the public Design inspiration page, carried here so the tab knows what
 * it was opened FOR. An intent, not a description of the tab: spent on arrival and stripped from
 * the address, so mirroring cannot re-open a build and a copied link cannot start one in the
 * reader's own lane.
 */
export const INSPIRATION_PARAM = 'inspiration'
export const PLATFORM_PARAM = 'platform'

/**
 * The right panel width a form tab (Add site) declares as `preferredWidth`: its content is at
 * most 520px wide, so a wider panel only leaves empty space the conversation could use. A tab that
 * previews a site declares nothing and gets the frame default, room for a site at desktop width.
 * It sets the panel only until the customer drags the divider.
 *
 * Since 14/10/2026 dsh records but does not apply a tab's preferred width: every tab opens beside a
 * narrow 300px conversation (Claude Design layout; dsh fork `ui-layout` columns.ts). The
 * declarations stay so the widths each surface was designed for remain on record.
 */
export const FORM_PANEL_WIDTH = 600

/**
 * The right panel width the My Sites table declares as `preferredWidth`. Six columns since 01/10
 * (the Status column went; the row's state sits after the site's address): measured in Chrome on
 * the e2e fixture, CMS 51px, Role 101, Team 109, Created 104 and the menu 52 take 417px, and the
 * panel adds 26px around the table, so 720 shows every column and leaves the Site column 277px for
 * the address and its state (Managing, Start the agent, an invitation...). At 600 (the form width,
 * which the table had until 30/09) the table scrolled sideways on every screen. Narrower panels,
 * where the frame keeps the conversation at its 360px floor, are handled by the table itself: the
 * address truncates, then Created, the CMS logo, Role and Team give way (`tracy-my-sites` styles).
 */
export const LIST_PANEL_WIDTH = 720

/**
 * A Tracy tab type: `tracy:` and a kebab-case page name, with one more kebab-case segment for the
 * types that are split per CMS — `tracy:build:joomla`, `tracy:build:wordpress`,
 * `tracy:build:emdash` (one Build plugin per CMS since 09/09). Never a tab id, which carries a
 * SITE after the type: a site key is a hostname and always has a dot, which this pattern refuses.
 *
 * 🔒 THE THIRD SEGMENT IS NOT OPTIONAL POLISH. Until 21/09 the pattern stopped at two, and a
 * `?tab=tracy:build:joomla` — the address the claim answers, and `buildTabFor` makes — read as no
 * tab at all: `parseTabLink` opened nothing from it, and `activeTracyTab` saw no tab in sight while
 * the Build tab was open, so the mirror stripped `?tab=` off a page that had just loaded with it
 * (measured 21/09 on dev: one address change per page, for nothing).
 */
const TAB_TYPE = /^tracy:[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/
/** A site key is a hostname. */
const SITE_KEY = /^[a-z0-9][a-z0-9.-]*$/i
/** A session id as dsh accepts it in a path segment (`url-state.ts`): no slashes, no dots. */
const SESSION_ID = /^[A-Za-z0-9_-]+$/
/**
 * The Build tabs' common prefix (`buildTabFor`). An intent no longer asks for it — since 24/09 a
 * press opens `creationTabFor()`, from the address too since #392 — but the intent still names its
 * tab by itself: the public Design inspiration page's link carries nothing else — no `tab=`,
 * measured 08/09. Without that an intent from that page opened nothing at all, and appeared to work
 * only in a session that already had the tab open, where the mirror had written `tab=` on an
 * earlier visit.
 */
const BUILD_TAB = 'tracy:build'
/** A catalog id, or a site's own brand (`brand:<host>`). Never a path — this ends up in a URL. */
const INSPIRATION_ID = /^[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9.-]*)?$/
/** The three a build knows. A fourth would be a build that cannot run, so it is dropped here. */
const PLATFORMS = new Set(['wordpress', 'joomla', 'emdash'])

/**
 * The intent as a cookie, for a page that is entered ALREADY on its session.
 *
 * Since 20/09 `tracy-web` makes the creation session before the browser moves and sends the press
 * to `/new/s/<id>?tab=…` — an address with no intent on it, because an intent on the address is
 * spent on read and stripped, and that strip is one more address change on a page that just
 * loaded (the whole journey measured 7 on dev; the target was "one or two left is fine"). The press travels in
 * this cookie instead: `tracy-web` writes it on the redirect, `@tracy/dsh-tab-link` reads it once
 * on arrival into its stash and deletes it. Not HttpOnly — the plugin must read it — and not a
 * permission: it names what to build, and only the seat says whether one may.
 */
export const INTENT_COOKIE = 'tracy_intent'

/**
 * The intent a `document.cookie` string carries, or null. The value is the
 * `inspiration=…&platform=…` pair URL-encoded once, exactly as `tracy-web`'s `intentCookie` writes
 * it; anything else — a missing or malformed inspiration, a platform this side does not build —
 * reads as no intent at all, never as a partial one.
 * @param cookies - `document.cookie` (or a Cookie header).
 */
export function intentFromCookie(cookies: string): { inspiration: string; platform?: string } | null {
  for (const part of cookies.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1 || part.slice(0, eq).trim() !== INTENT_COOKIE) continue
    let decoded = ''
    try {
      decoded = decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return null
    }
    const params = new URLSearchParams(decoded)
    const inspiration = params.get(INSPIRATION_PARAM)
    if (inspiration === null || !INSPIRATION_ID.test(inspiration)) return null
    const platform = params.get(PLATFORM_PARAM)
    return platform !== null && PLATFORMS.has(platform) ? { inspiration, platform } : { inspiration }
  }
  return null
}

/**
 * The Build tab of one CMS's plugin: `tracy:build:wordpress`, `tracy:build:joomla`,
 * `tracy:build:emdash`. There is one Build plugin per CMS (tasks/todo-tach-build-theo-cms.md,
 * 09/09), and the press — or the link — picks which by naming the platform. A link that names
 * none still opens SOMETHING rather than nothing: the WordPress tab, the default the form used to
 * fall back to before the split.
 *
 * 🔒 EMDASH IS ITS OWN TAB SINCE 15/09. Until then the fallback swallowed it — "not Joomla, so
 * WordPress" — and a press on Create with EmDash opened the WordPress Build with no error
 * anywhere; the customer picked a CMS and got another. `PLATFORMS` above already knew three.
 * @param platform - the CMS the link asks for, when it names one.
 */
export function buildTabFor(platform: string | undefined): string {
  return `${BUILD_TAB}:${platform === 'joomla' || platform === 'emdash' ? platform : 'wordpress'}`
}

/** The Add site tab: the one place a new site is made. */
export const CREATION_TAB = 'tracy:add-site'

/**
 * Where a press that asks for a NEW SITE lands — the Add site wizard, whichever CMS and whichever
 * design the press named.
 *
 * 🔒 ONE CREATION FLOW (24/09/2026). Until now a press in Design inspiration's gallery went
 * to a Build tab instead: its own form of four questions, its own `POST /api/sites/claim` before
 * a single question was asked — measured 24/09 on dev, pressing *Create with Joomla* just to LOOK
 * at the form left a claimed site (`j-fq0j3y`) behind — and its own wait, budgeted at thirty
 * minutes. The wizard asks three things, makes the site through `POST /api/sites`, and the
 * gallery's pick rides along as the `design` that door already accepts. So the gallery becomes a
 * step inside one flow rather than the entrance to a second one.
 *
 * {@link buildTabFor} stays: the Build tab and the questions it asks are not deleted, only no
 * longer the way in. Bringing them back is pointing these call sites at it again.
 *
 * @returns the tab id to open.
 */
export function creationTabFor(): string {
  return CREATION_TAB
}

/**
 * Tab types Tracy retired, each with the type that took over from it.
 *
 * Releases and History (`tracy:releases`, `tracy:history`) went when backups became the milestones
 * of Site changes (ADR 0024): their points are created, listed and restored there. An address or a
 * saved layout can still name them — a bookmark, a staff member's mirrored address, the right column
 * restored from before — and either used to land on nothing at all: a deep link was refused with
 * only a console warning, a restored tab drew "Nothing here can view this kind of content yet." Both
 * now land on the type that took over, through this one table: `parseTabLink` reads a retired type
 * as its successor, and `replaceRetiredTab` swaps a retired tab in sight for it.
 */
export const RETIRED_TABS: Readonly<Record<string, string>> = Object.freeze({
  'tracy:releases': 'tracy:changes',
  'tracy:history': 'tracy:changes'
})

/** The type to open for `type`: its successor when Tracy retired it, else itself. */
export function currentTabType(type: string): string {
  return Object.hasOwn(RETIRED_TABS, type) ? (RETIRED_TABS[type] as string) : type
}

/** The tab an address names. */
export interface TabRef {
  type: string
  siteKey?: string
}

/** What `?tab=` (with `site`, `s`, and any build intent) in an address asks for. */
export interface TabLink extends TabRef {
  sessionId?: string
  /** The inspiration a visitor pressed Create with on, when the link carries one. */
  inspiration?: string
  /** The CMS they pressed it for. */
  platform?: string
}

/** The tab a Tracy plugin opens for a site: `<type>:<siteKey>`, or the bare type for a tab without a site. */
export function tabIdOf(type: string, siteKey?: string): string {
  return siteKey === undefined ? type : `${type}:${siteKey}`
}

/**
 * Read the tab an address asks for, or null when it asks for none. A malformed site or session
 * is dropped rather than failing the whole link: the tab is still worth opening.
 */
export function parseTabLink(search: string): TabLink | null {
  const params = new URLSearchParams(search)
  const asked = params.get(INSPIRATION_PARAM)
  const intent = asked !== null && INSPIRATION_ID.test(asked) ? asked : null
  const type = params.get(TAB_PARAM)
  // A creation intent names its own tab, and outranks whatever tab the address was mirroring: a
  // press is a request to make a site, not a request to look at the page that happened to be in
  // sight.
  //
  // 🔒 THE SAME TAB AS EVERY OTHER PRESS (#392, 26/09/2026). The cookie and the stash have opened
  // `creationTabFor()` since 24/09, and so does a press inside the creation workspace; this branch
  // still said `buildTabFor(platform)`. A press made in a SITE's workspace navigates to
  // `/new/?inspiration=…&platform=…` (`onboardingBuildUrl`), and whenever tracy-web forwards that
  // address as it stands — dsh did not answer ahead, or a `/new/s/<id>?inspiration=…` link — this
  // is its only reader, so the customer got the retired Build form instead of Add site. The CMS
  // still travels as `platform`; the wizard reads it from the tab's meta (`platformPressOf`).
  if (intent === null && (type === null || !TAB_TYPE.test(type))) return null
  const askedPlatform = params.get(PLATFORM_PARAM)
  const platform = askedPlatform !== null && PLATFORMS.has(askedPlatform) ? askedPlatform : undefined
  // A retired type opens the one that took over from it, for the same site (`RETIRED_TABS`).
  const link: TabLink = { type: intent !== null ? creationTabFor() : currentTabType(type as string) }
  const siteKey = params.get(SITE_PARAM)
  if (siteKey !== null && SITE_KEY.test(siteKey)) link.siteKey = siteKey
  const sessionId = params.get(SESSION_PARAM)
  if (sessionId !== null && SESSION_ID.test(sessionId)) link.sessionId = sessionId
  if (intent !== null) link.inspiration = intent
  if (platform !== undefined) link.platform = platform
  return link
}

/**
 * The tab a clicked link asks for, when the link is one of Tracy's own tab links to THIS workspace —
 * or null, and the browser follows the link as it always did.
 *
 * WHY. The site agent answers "where do I connect my domain" with a link to the Publish tab
 * (`<origin>/<site>/?tab=tracy:site-publish&site=<site>`, from `tracy_guide`). dsh draws an https link
 * in the chat as an external one: a new browser tab, which loads the whole page again and loses the
 * conversation the person was in. The same address can be opened where they are, as a tab of the column.
 *
 * 🔒 ONLY THE SAME ORIGIN AND THE SAME WORKSPACE. A link to another host, another site's workspace
 * (a different path) or one without a Tracy tab is left alone, so the rule can never swallow a link
 * that is not ours; the tab type goes through `parseTabLink`, so a malformed one is refused there.
 * @param href - the anchor's href, as written (absolute or relative)
 * @param here - the page: its origin and the path of dsh's root (`<base href>`), ending in `/`
 */
export function tabLinkOfClick(href: string, here: { origin: string; basePath: string }): TabLink | null {
  let url: URL
  try {
    url = new URL(href, `${here.origin}${here.basePath}`)
  } catch {
    return null
  }
  if (url.origin !== here.origin) return null
  const norm = (path: string): string => (path.endsWith('/') ? path : `${path}/`)
  if (norm(url.pathname) !== norm(here.basePath)) return null
  if (!url.searchParams.has(TAB_PARAM)) return null
  const link = parseTabLink(url.search)
  // A creation intent starts a session of its own (the public page's Create with): not a click-open.
  if (link === null || link.inspiration !== undefined) return null
  return link
}

/** `URLSearchParams` escapes the colon a tab type carries; the address reads better with it bare. */
function readable(query: string): string {
  return query.replace(/%3A/gi, ':')
}

/**
 * The search string with `tab` and `site` set to `tab` (or removed for null), every other
 * parameter kept in place, and `s` always removed — the path already names the session.
 * Returns '' when nothing is left, else a string starting with '?'.
 */
export function withTabParams(search: string, tab: TabRef | null): string {
  const params = new URLSearchParams(search)
  params.delete(TAB_PARAM)
  params.delete(SITE_PARAM)
  params.delete(SESSION_PARAM)
  // Spent on arrival, like the session: an intent left in the address is an intent acted on twice.
  params.delete(INSPIRATION_PARAM)
  params.delete(PLATFORM_PARAM)
  if (tab !== null) {
    params.set(TAB_PARAM, tab.type)
    if (tab.siteKey !== undefined) params.set(SITE_PARAM, tab.siteKey)
  }
  const query = readable(params.toString())
  return query === '' ? '' : `?${query}`
}

/**
 * The address the mirror writes: the query tended by `withTabParams`, and — when the page still
 * sits at its bare base while a session is already known — that session written into the path in
 * the SAME stroke, as `<base>s/<id>`.
 *
 * WHY THE PATH TOO. dsh writes `s/<id>` itself (`ui-workspace/url-state.ts`), a beat after the
 * list is real; this plugin used to clean the query in a `replaceState` of its own a beat before.
 * Two strokes, two flickers, on every load — measured 20/09 as two of the eight address changes
 * of one create (tasks/pa-dia-chi-mot-duong-cho-site.md §1.2, #2 and #5). Written here first, dsh
 * finds `next === current` and writes nothing.
 *
 * 🔒 ONLY INTO A BARE BASE. A path that already names a session is dsh's history entry — when a
 * person changes session dsh *pushes* the new one, and rewriting it here would eat the Back step.
 * With no session known (list pending) the path is left alone.
 */
export function mirroredPath(input: {
  pathname: string
  search: string
  hash?: string
  base: string
  sessionId: string | null | undefined
  tab: TabRef | null
}): string {
  const query = withTabParams(input.search, input.tab)
  const bare = input.pathname === input.base || `${input.pathname}/` === input.base
  const id = input.sessionId
  const path =
    bare && id !== null && id !== undefined && SESSION_ID.test(id) ? `${input.base}s/${id}` : input.pathname
  return `${path}${query}${input.hash ?? ''}`
}

/**
 * A shareable address for a tab on the page base, the session last so it can be cut off.
 *
 * `search` is the address as it stands, and everything on it that is not this function's own
 * business rides along: it is how a tab that keeps state there — the Design inspiration tab's
 * `?cat=` and `?open=` — is copied AS LOOKED AT rather than from the top. The three parameters
 * this function writes are replaced, and the two intent ones (`inspiration`, `platform`) are
 * dropped for the same reason mirroring drops them: an intent acted on twice is a bug.
 */
export function buildTabLink(
  base: string,
  tab: TabRef,
  sessionId: string | null | undefined,
  search = ''
): string {
  const carried = new URLSearchParams(search)
  for (const name of [TAB_PARAM, SITE_PARAM, SESSION_PARAM, INSPIRATION_PARAM, PLATFORM_PARAM])
    carried.delete(name)
  const params = new URLSearchParams()
  params.set(TAB_PARAM, tab.type)
  if (tab.siteKey !== undefined) params.set(SITE_PARAM, tab.siteKey)
  for (const [name, value] of carried) params.append(name, value)
  if (sessionId !== null && sessionId !== undefined && SESSION_ID.test(sessionId))
    params.set(SESSION_PARAM, sessionId)
  return `${base}?${readable(params.toString())}`
}

/** The tab in sight: id, type and the site it shows. */
export interface ActiveTab extends TabRef {
  id: string
}

/**
 * The slice of dsh's native right Sidebar (`ctx.sidebarRight`, dsh 0.1.7) that Tracy reads.
 * Structural on purpose: importing dsh's types would bundle the package into every plugin.
 *
 * Since better-sidebar 0.19 the side card no longer draws a right column of its own: every Tracy tab
 * is a page kind of this native column, which also owns the layout (which tab is active, whether the
 * column is open). better-sidebar's own snapshot keeps only its bottom panel.
 */
export interface SidebarRight {
  /** The active tab of the active pane, or undefined while no seat is mounted. */
  active(): { id: string; kind: string } | undefined
  /** Whether the column shows its panel (false while collapsed to its rail). */
  isExpanded(): boolean
  /** Collapse the column, or expand it. */
  toggleExpanded(): void
  /** Focus a tab and the pane holding it; a missing tab is left alone. */
  focus(tabId: string): void
  /** Close one tab of the mounted session (absent on a host older than dsh 0.1.7). */
  close?(tabId: string): void
  /** The session whose seat is on screen. */
  mounted?: { getSnapshot(): string | undefined; subscribe(listener: () => void): () => void }
  /**
   * Membership of every session's open tabs: fires when a tab opens or closes, not on activation.
   * Each session's column is its own; `getSnapshot` names the session of every tab (saved layouts
   * included), which is how a reader tells one conversation's column from another's.
   */
  openTabs?: {
    subscribe(listener: () => void): () => void
    getSnapshot?(): readonly { sessionId: string; tabId: string; kind: string }[]
  }
}

/** One open tab as better-sidebar's `openTabsOf(type)` answers (its native records carry the meta). */
export interface OpenTab {
  id: string
  type: string
  meta?: unknown
}

/** The side card service, as far as reading its open tabs goes. */
export interface TabRecords {
  /** better-sidebar 0.21.1-tracy.1+: the open tabs of one type (absent on an older side card). */
  openTabsOf?: (type: string) => readonly OpenTab[]
}

/**
 * `ctx.sidebarRight`, or undefined when the host has none (an older dsh, a profile without the right
 * column). Probed, not injected: the side card itself reaches it the same way, and a plugin that
 * declared it would stay pending on a host without it.
 * @param ctx - the plugin's client context.
 */
export function sidebarRightOf(ctx: { get?: (name: string) => unknown }): SidebarRight | undefined {
  let right: unknown
  try {
    right = ctx.get?.('sidebarRight')
  } catch {
    return undefined
  }
  const shaped = right as Partial<SidebarRight> | null | undefined
  return shaped &&
    typeof shaped.active === 'function' &&
    typeof shaped.isExpanded === 'function' &&
    typeof shaped.toggleExpanded === 'function' &&
    typeof shaped.focus === 'function'
    ? (shaped as SidebarRight)
    : undefined
}

/** What the right column shows, read once: open or not, its active tab, and that tab's record. */
export interface ColumnView {
  expanded: boolean
  active?: { id: string; kind: string }
  /** The open tabs of the active tab's kind — where its `meta` (and so its site) is read. */
  tabs: readonly OpenTab[]
}

/**
 * Read the column once. Every read is guarded: both services are the host's, and a throw here would
 * take the address mirror down with it.
 * @param right - `ctx.sidebarRight`.
 * @param sidebar - `ctx.betterSidebar`.
 */
export function columnView(right: SidebarRight | undefined, sidebar: TabRecords): ColumnView | null {
  if (right === undefined) return null
  try {
    const active = right.active()
    const tabs = active === undefined ? [] : (sidebar.openTabsOf?.(active.kind) ?? [])
    return active === undefined
      ? { expanded: right.isExpanded(), tabs }
      : { expanded: right.isExpanded(), active: { id: active.id, kind: active.kind }, tabs }
  } catch {
    return null
  }
}

/**
 * The Tracy tab the person is looking at, or null: the column's active tab when it is typed
 * `tracy:*` and the column is open. The site comes from that tab's `meta.siteKey`, as its record
 * holds it — a tab whose record is not there (not mounted yet) is in sight without a site.
 * @param view - {@link columnView}.
 */
export function activeTracyTab(view: ColumnView | null): ActiveTab | null {
  if (view === null || !view.expanded || view.active === undefined) return null
  const { id, kind } = view.active
  if (!TAB_TYPE.test(kind)) return null
  const meta = view.tabs.find((tab) => tab.id === id)?.meta as { siteKey?: unknown } | undefined
  const siteKey = typeof meta?.siteKey === 'string' && SITE_KEY.test(meta.siteKey) ? meta.siteKey : undefined
  return siteKey === undefined ? { id, type: kind } : { id, type: kind, siteKey }
}

/**
 * Swap a retired tab in sight for the type that took over from it (`RETIRED_TABS`): open that type
 * for the page's site, then close the retired tab.
 *
 * WHY "IN SIGHT". dsh restores the right column from the layout it saved, retired tabs included,
 * and its face names only the ACTIVE tab (`active()`), not the others. So a restored Releases tab
 * the person is looking at becomes Site changes at once; one waiting behind another tab keeps its
 * saved title until it is clicked, and becomes Site changes then. Nothing happens while the column
 * is collapsed: opening a tab expands it, and the person did not ask for that.
 *
 * 🔒 NEVER CLOSE WHAT NOTHING REPLACED. The saved layout is restored before the page is ready for
 * the open: the site-tabs plugin may not have registered Site changes yet, and the side card may not
 * be bound to the session on screen — dsh then drops the open without a word (`whenSeated` in
 * tracy-my-sites, 28/09). The swap used to close the retired tab all the same, so a reload lost it
 * with nothing in its place (REG-016 on the scv2 stand, 03/10: gone 120 ms after load). Until both
 * hold, it waits, and the mirror's next pulse tries again. Then the retired tab is closed only once
 * the open has put Site changes in sight; an open that did not land leaves it where it is.
 *
 * Once per tab (`done`). The one close without an open: a Site changes this deployment switched off
 * (`tab-changes`, or the viewer's own switch) never opens, and the retired tab can never show
 * anything again.
 * @param right - `ctx.sidebarRight`.
 * @param sidebar - `ctx.betterSidebar`: whether the successor is registered and enabled, the session
 *   it is bound to, and the open.
 * @param done - the retired tab ids already handled on this page.
 * @returns the id of the tab replaced, or null when the tab in sight is not a retired one or the page
 *   is not ready to replace it yet.
 */
export function replaceRetiredTab(
  right: SidebarRight | undefined,
  sidebar: {
    getTab?: (type: string) => unknown
    isTabEnabled?: (type: string) => boolean
    getSnapshot?: () => { sessionId?: string }
    openTab?: (seed: { type: string }) => void
  },
  done: Set<string>
): string | null {
  if (right === undefined || typeof right.close !== 'function') return null
  let active: { id: string; kind: string } | undefined
  try {
    if (!right.isExpanded()) return null
    active = right.active()
  } catch {
    return null
  }
  if (active === undefined || !Object.hasOwn(RETIRED_TABS, active.kind) || done.has(active.id)) return null
  const next = currentTabType(active.kind)
  if (sidebar.isTabEnabled?.(next) === false) {
    done.add(active.id)
    right.close(active.id)
    return active.id
  }
  if (sidebar.getTab?.(next) === undefined || !seated(right, sidebar)) return null
  done.add(active.id)
  // No meta: Site changes takes the site this page is on, as when it is opened from the + menu.
  sidebar.openTab?.({ type: next })
  let landed = false
  try {
    landed = right.active()?.kind === next
  } catch {
    landed = false
  }
  if (!landed) return null
  right.close(active.id)
  return active.id
}

/**
 * Whether the side card follows the session the column shows — the moment an open lands instead of
 * being dropped (the rule `whenSeated` in tracy-my-sites waits for). A host that cannot say (no
 * `mounted`, no snapshot) is taken as seated, as it always was.
 */
function seated(right: SidebarRight, sidebar: { getSnapshot?: () => { sessionId?: string } }): boolean {
  if (right.mounted === undefined || sidebar.getSnapshot === undefined) return true
  try {
    const onScreen = right.mounted.getSnapshot()
    return onScreen !== undefined && sidebar.getSnapshot().sessionId === onScreen
  } catch {
    return false
  }
}

/**
 * The id of the tab an `openTab` of `type` landed on, read right after the open — or null when the
 * column does not show one.
 *
 * The native column keeps ONE tab per page kind in a pane: an open of a kind the active pane already
 * shows focuses that tab and navigates it, and an open of a new one creates it there. Either way the
 * landed tab is the active one. Its id is minted by dsh, never the seed's (`seed.id` is ignored).
 * @param view - {@link columnView}, read after the open.
 * @param type - the tab type that was opened.
 */
export function landedTabId(view: ColumnView | null, type: string): string | null {
  return view?.active?.kind === type ? view.active.id : null
}

/** The side card service, as far as opening a tab and patching what it remembers goes. */
export interface TabOpener extends TabRecords {
  openTab?: (seed: { type: string; title?: string; meta?: unknown }, scope?: { sessionId: string }) => void
  updateTab?: (tabId: string, patch: { title?: string; meta?: unknown }) => void
  getSnapshot?: () => { sessionId?: string }
}

/**
 * Open a Tracy tab that remembers something (`meta`: its site, a press), and make sure the tab it
 * lands on remembers THIS.
 *
 * WHY THE PATCH. A native navigation of a tab already open carries the new `meta` in its params, but
 * the side card only refreshes `path` and `url` from them (`native/tab-adapter.tsx` `ensure`): the
 * record keeps the meta it was minted with. So opening the Team tab for site B while it shows site A
 * would focus it and leave it on A. The open is therefore followed by `updateTab` on the landed tab —
 * a tab created by this open has no record yet, which is harmless: its first mount reads the meta
 * from the params.
 *
 * Only for the session on screen: `updateTab` has no scope, and a targeted open of another session
 * must not rewrite a tab of the one in sight.
 * @param sidebar - `ctx.betterSidebar`.
 * @param right - `ctx.sidebarRight`.
 * @param seed - the tab type, its meta, and an optional title.
 * @param scope - the session the tab lands in; absent = the one on screen.
 */
export function openTabWithMeta(
  sidebar: TabOpener,
  right: SidebarRight | undefined,
  seed: { type: string; title?: string; meta?: unknown },
  scope?: { sessionId: string }
): void {
  if (typeof sidebar.openTab !== 'function') return
  sidebar.openTab(seed, scope)
  if (seed.meta === undefined || typeof sidebar.updateTab !== 'function') return
  let onScreen: string | undefined
  try {
    onScreen = right?.mounted?.getSnapshot() ?? sidebar.getSnapshot?.().sessionId
  } catch {
    return
  }
  if (scope !== undefined && scope.sessionId !== onScreen) return
  const id = landedTabId(columnView(right, sidebar), seed.type)
  if (id !== null) sidebar.updateTab(id, { meta: seed.meta })
}

/**
 * Bring one open tab into sight: focus it, and open the column when it is collapsed. Throws when
 * no seat is mounted — dsh's column refuses a command it has no session for.
 * @param right - `ctx.sidebarRight`.
 * @param tabId - a native tab id (`openTabsOf`).
 */
export function revealTab(right: SidebarRight, tabId: string): void {
  right.focus(tabId)
  if (!right.isExpanded()) right.toggleExpanded()
}

/**
 * Below this frame width dsh draws the right column fullscreen, over the conversation and its
 * composer (`ui-sidebar-right` `autoFullscreen = viewportWidth < 768`).
 */
export const NARROW_FRAME_PX = 768

/**
 * Whether the column, once open, would cover the conversation.
 * @param width - the frame's width; defaults to the window's.
 */
export function isNarrowFrame(width: number | undefined = globalThis.innerWidth): boolean {
  return typeof width === 'number' && width < NARROW_FRAME_PX
}

/**
 * Run an open nobody asked for on this load (a site page's own preview) so that, on a narrow
 * frame, it never covers the conversation: a column that was collapsed before the open is
 * collapsed again in the same synchronous stretch, with the tab in it for the toggle to show.
 *
 * 🔒 NOT LEFT TO THE FORK'S RULE. dsh (fork tracy.41) keeps an open behind the toggle below 768px
 * only when `navigator.userActivation.isActive` is false, and that stays true for seconds after any
 * tap on the page — dismissing the Getting started dialog, tapping the composer while the page
 * boots. A load's open that lands in that window passed as pressed (dev acceptance 12/10/2026).
 * A wide frame is left to dsh: the column opens beside the chat.
 * @param right - `ctx.sidebarRight`, or undefined when it cannot be read (then just open).
 * @param open - the open.
 * @param narrow - whether the frame is narrow; read at call time by default.
 */
export function openUnasked(
  right: SidebarRight | undefined,
  open: () => void,
  narrow = isNarrowFrame()
): void {
  const wasOpen = right?.isExpanded() ?? true
  open()
  if (!narrow || wasOpen || right === undefined) return
  if (right.isExpanded()) right.toggleExpanded()
}

/**
 * {@link revealTab} for a tab nobody asked for on this load: on a narrow frame the tab is only
 * focused, so the toggle shows it; on a wide one it is revealed as before.
 * @param right - `ctx.sidebarRight`.
 * @param tabId - a native tab id.
 * @param narrow - whether the frame is narrow; read at call time by default.
 */
export function focusUnasked(right: SidebarRight, tabId: string, narrow = isNarrowFrame()): void {
  if (narrow) right.focus(tabId)
  else revealTab(right, tabId)
}
