import { tracyWebPath } from '../web-path/index.mjs'
/**
 * Who is looking at this surface — and therefore which side-card tabs may exist for them.
 *
 * ## The invariant this file carries
 *
 * Two Tracy tabs only mean something to a person who holds a seat, or who signed in and is
 * about to be offered one:
 *
 *   tracy:add-site   builds a real site on the fleet — a container, a DNS record, a seat
 *   tracy:my-sites   lists the sites a person holds, and switches the workbench to one
 *
 * Until 06/09/2026 that invariant was held by ARCHITECTURE: an anonymous visitor landed in a
 * different container carrying `@tracy/dsh-guest-bundle`, and `scripts/check-lane-tabs.ts`
 * guarded exactly that bundle's `seedTabs`. ADR 0014 turned the visitor into a ROLE (`guest`)
 * inside the SAME dsh, served by the SAME `native` profile — so both legs went at once: the
 * separate bundle, and the gate over it. A stranger opening a public landing page then met
 * "Add site" already open, walked the wizard, and collected a 403 at `POST /api/sites`.
 *
 * The profile's `seedTabs` cannot answer this: it is deployment configuration, and the
 * deployment serves both roles. So the decision moves to the only place that can see the
 * viewer — the browser — and this is the one copy of it. Both plugins call `seatOnlyTab`.
 *
 * ## Where the answer comes from
 *
 * `/auth/me` on `apps/tracy-web` (`src/identity/route.js`, a root door: it is asked root-absolute
 * from every site-prefixed path). It returns `{ email, defaultSite, face, name }`; this file reads `email`:
 *
 *   email: "lee@example.com"   somebody signed in — they hold seats, or the surface exists to
 *                           give them their first one (`apiSites` answers `{ sites: [] }` for
 *                           a fresh account ON PURPOSE, and Add site is what that person needs)
 *   email: null             nobody signed in — the guest/bot session tracy-web mints for a
 *                           public landing (`src/public/route.js`, `grant: { role: 'guest' }`)
 *
 * There is no cheaper question. `tracy_lane` carries the stamped role but is `HttpOnly`, the
 * seat door's `/gateway/seat/whoami` is signed and unreachable from a page, and `/api/sites`
 * cannot tell "no seats yet" from "not signed in" without the same door anyway.
 *
 * ## Fail closed, and the one place it does not
 *
 * An unreadable answer is NOT a seat: a tracy-web outage must not hand a stranger the wizard.
 * The single exception is a LOOPBACK surface (`localhost`, `127.0.0.1`, `::1`). On a bare dsh
 * profile the answer cannot exist there because that profile has no tracy-web in front (the local
 * compose stack does serve tracy-web on loopback, and there the door answers) — and a guest cannot
 * exist either, since every guest session is minted by tracy-web under a public hostname. Without
 * that carve-out `./run.sh native` loses both tabs entirely, which is a break nobody asked for
 * and which no test on this machine would explain.
 *
 * ## The seed, and why the sweep stays
 *
 * Until better-sidebar 0.21.1 the refusal was not enough on its own: `reconcileSeed` seeded the
 * deployment's `seedTabs` by TYPE STRING, before and regardless of any registration, and the side
 * card rendered an unknown type as `OrphanedTab` — a tab titled `tracy:add-site` saying the plugin
 * is not loaded. 0.21.1 has no `seedTabs` at all (upstream dropped it with its own right column; the
 * native column starts collapsed on dsh's guide), so nothing puts a Tracy tab in front of a viewer
 * any more and the invariant holds by construction.
 *
 * The sweep stays for what is left: a tab of this type the side card still knows — its bottom panel,
 * restored from what a browser saved, or a native record (`openTabsOf`) — is closed for a viewer who
 * may not have it, and stays watched.
 */

/** The shell door that names the viewer. */
export const VIEWER_DOOR = '/auth/me'

/** Somebody signed in: they hold seats, or the surface will offer them a first one. */
export const SEAT = 'seat'
/** Nobody signed in: the guest (or bot) session a public landing mints. */
export const GUEST = 'guest'
/** Nobody answered — an outage, or a bare dsh profile, which has no tracy-web in front of it. */
export const UNKNOWN = 'unknown'

/**
 * Read the door's answer.
 *
 * The shape is checked, not just the status: a 200 that is not this door's answer (a login
 * page, an app shell served for an unknown path) says nothing about the viewer, and reading a
 * missing `email` as "not signed in" would turn every such surface into a guest.
 * @param {number} status HTTP status of the answer.
 * @param {unknown} body The parsed body, or null when it did not parse.
 * @returns {string} `SEAT`, `GUEST` or `UNKNOWN`.
 */
export function viewerFromAnswer(status, body) {
  if (status === 401 || status === 403) return GUEST
  if (status < 200 || status >= 300) return UNKNOWN
  if (body === null || typeof body !== 'object') return UNKNOWN
  if (!Object.hasOwn(/** @type {object} */ (body), 'email')) return UNKNOWN
  const email = /** @type {{ email: unknown }} */ (body).email
  if (typeof email === 'string' && email.trim() !== '') return SEAT
  if (email === null) return GUEST
  return UNKNOWN
}

/**
 * Whether the page is served from this machine — the one place an unreadable answer is not a
 * refusal. A guest session is always minted by tracy-web under a public hostname, so no
 * loopback viewer can be one.
 * @param {string} hostname `location.hostname`, which drops the brackets of an IPv6 host.
 * @returns {boolean} True for a loopback surface.
 */
export function isLocalSurface(hostname) {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')
}

/**
 * Whether this viewer may have a seat-only tab at all.
 * @param {string} viewer One of `SEAT` / `GUEST` / `UNKNOWN`.
 * @param {string} hostname The surface's hostname.
 * @returns {boolean} True only for a viewer proven to be signed in, or a loopback surface.
 */
export function mayHoldSeatOnlyTab(viewer, hostname) {
  if (viewer === SEAT) return true
  if (viewer === GUEST) return false
  return isLocalSurface(hostname)
}

/**
 * Where the page's one answer hangs: the document in a page, the global object anywhere else.
 * Not this module — each plugin bundles its own copy of it (`site-tabs/Popover.tsx` says why).
 * @returns {Record<symbol, unknown>} The holder.
 */
export function pageHolder() {
  return /** @type {Record<symbol, unknown>} */ (
    /** @type {unknown} */ (typeof document === 'undefined' ? globalThis : document)
  )
}

/** The registry key of the door's answer on the page holder. */
const VIEWER_ANSWER = Symbol.for('tracy.viewer.answer')

/**
 * The door's raw answer for this page, asked once and shared by every bundle on it — `readViewer`
 * here and the viewer store (`./viewer.tsx`) alike. Only an answer is kept: an unreachable door or
 * a 5xx is asked again by the next read.
 * @param {{ fresh?: boolean }} [options] `fresh` asks the door again and shares the new answer.
 * @returns {Promise<{ status: number, body: unknown } | null>} null when the door could not be
 *   reached at all.
 */
export function viewerDoorAnswer(options = {}) {
  const holder = pageHolder()
  const known = /** @type {Promise<{ status: number, body: unknown } | null> | undefined} */ (
    holder[VIEWER_ANSWER]
  )
  if (known !== undefined && options.fresh !== true) return known
  const asked = fetchDoor(globalThis.fetch.bind(globalThis))
  holder[VIEWER_ANSWER] = asked
  // A door that could not be reached, or failed on the server, has not answered for the page: the
  // next read asks again. A guest (401, `email: null`) IS an answer and is kept.
  void asked.then((answer) => {
    if ((answer === null || answer.status >= 500) && holder[VIEWER_ANSWER] === asked) {
      delete holder[VIEWER_ANSWER]
    }
  })
  return asked
}

/** Drop the page's answer, so the next read asks the door again (after signing out). */
export function forgetViewerAnswer() {
  delete pageHolder()[VIEWER_ANSWER]
}

/**
 * The viewer of this page. Every bundle on the page shares one read of the door.
 * @param {{ fetch?: typeof globalThis.fetch }} [options] Injection seam for tests.
 * @returns {Promise<string>} `SEAT`, `GUEST` or `UNKNOWN`.
 */
export function readViewer(options = {}) {
  const call = options.fetch
  return (call !== undefined ? fetchDoor(call) : viewerDoorAnswer()).then((answer) =>
    answer === null ? UNKNOWN : viewerFromAnswer(answer.status, answer.body)
  )
}

/**
 * One read of the door, never throwing.
 * @param {typeof globalThis.fetch} call The fetch to use.
 * @returns {Promise<{ status: number, body: unknown } | null>} The status and the parsed body (null
 *   when it is not JSON), or null when the door could not be reached.
 */
async function fetchDoor(call) {
  try {
    const res = await call(tracyWebPath(VIEWER_DOOR), {
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    })
    let body = null
    try {
      body = await res.json()
    } catch {
      // A door that answers with something other than JSON has not answered this question.
    }
    return { status: res.status, body }
  } catch {
    return null
  }
}

/**
 * The ids of every tab of one type in the side card's own state — its bottom panel, the one layout
 * better-sidebar still keeps itself (the right column is dsh's since 0.21.1). Pure, so the sweep
 * below is testable without a side card.
 * @param {unknown} state A `SidebarState`, or undefined before a session is active.
 * @param {string} type The tab type to look for.
 * @returns {string[]} The tab ids, in the order they were found.
 */
export function tabIdsOfType(state, type) {
  /** @type {string[]} */
  const ids = []
  if (state === null || typeof state !== 'object') return ids
  /** @param {unknown} node A split node. */
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return
    const split = /** @type {{ kind?: unknown, tabs?: unknown, children?: unknown }} */ (node)
    if (split.kind === 'leaf') {
      for (const tab of Array.isArray(split.tabs) ? split.tabs : []) {
        if (tab !== null && typeof tab === 'object' && tab.type === type && typeof tab.id === 'string') {
          ids.push(tab.id)
        }
      }
      return
    }
    for (const child of Array.isArray(split.children) ? split.children : []) walk(child)
  }
  walk(/** @type {{ bottomSplits?: unknown }} */ (state).bottomSplits)
  return ids
}

/**
 * Register a seat-only side-card tab, for a viewer allowed to have one.
 *
 * Call it INSIDE `ctx.effect`: it returns a disposer synchronously, the way cordis wants, while
 * the answer is still in flight. A viewer who may not have the tab gets no registration and a
 * standing sweep of restored occurrences instead.
 * @param {{
 *   registerTab: (descriptor: Record<string, unknown>) => () => void,
 *   closeTab?: (tabId: string) => void,
 *   getSnapshot?: () => { state?: unknown },
 *   subscribeState?: (listener: () => void) => () => void
 * }} sidebar The `betterSidebar` service.
 * @param {string} type The tab type, which is also the descriptor id.
 * @param {() => Record<string, unknown>} describe Builds the descriptor — called only when the
 *   tab is actually registered, so a refused viewer never pays for it.
 * @param {{ readViewer?: () => Promise<string>, hostname?: string, nativeSidebar?: () => {
 *   mounted?: { getSnapshot(): string | undefined, subscribe(listener: () => void): () => void },
 *   openTabs?: { getSnapshot(): readonly { sessionId: string, tabId: string, kind: string }[], subscribe(listener: () => void): () => void },
 *   close?: (tabId: string) => void
 * } | undefined }} [options] Test seam.
 * @returns {() => void} The disposer.
 */
export function seatOnlyTab(sidebar, type, describe, options = {}) {
  const ask = options.readViewer ?? (() => readViewer())
  const hostname = options.hostname ?? globalThis.location?.hostname ?? ''
  /** @type {(() => void) | undefined} */
  let release
  let disposed = false
  const settle = (/** @type {string} */ viewer) => {
    if (disposed) return
    release = mayHoldSeatOnlyTab(viewer, hostname)
      ? sidebar.registerTab(describe())
      : sweepSeededTabs(sidebar, type, options.nativeSidebar)
  }
  void ask().then(settle, () => {
    settle(UNKNOWN)
  })
  return () => {
    disposed = true
    release?.()
    release = undefined
  }
}

/**
 * Close every tab of one type, now and whenever one appears: the side card's own panel, and every
 * record it answers for through `openTabsOf` (0.21.1-tracy.1+, which covers both halves).
 * @param {{
 *   closeTab?: (tabId: string) => void,
 *   getSnapshot?: () => { state?: unknown },
 *   subscribeState?: (listener: () => void) => () => void,
 *   openTabsOf?: (type: string) => readonly { id: string }[]
 * }} sidebar The `betterSidebar` service.
 * @param {string} type The tab type to sweep.
 * @param {() => { mounted?: { getSnapshot(): string | undefined, subscribe(listener: () => void): () => void },
 *   openTabs?: { getSnapshot(): readonly { sessionId: string, tabId: string, kind: string }[], subscribe(listener: () => void): () => void },
 *   close?: (tabId: string) => void } | undefined} [getNativeSidebar] Reads the native right Sidebar when available.
 * @returns {(() => void) | undefined} The disposer of the watch, if the service offers one.
 */
export function sweepSeededTabs(sidebar, type, getNativeSidebar) {
  const close = sidebar.closeTab?.bind(sidebar)
  const snapshot = sidebar.getSnapshot?.bind(sidebar)
  if (close === undefined || snapshot === undefined) return undefined
  const sweep = () => {
    const ids = new Set(tabIdsOfType(snapshot().state, type))
    for (const tab of sidebar.openTabsOf?.(type) ?? []) ids.add(tab.id)
    for (const id of ids) close(id)
  }
  sweep()
  const disposers = [sidebar.subscribeState?.(sweep)]
  const right = getNativeSidebar?.()
  const closeNative = right?.close?.bind(right)
  if (right !== undefined && closeNative !== undefined) {
    let sweepingNative = false
    const sweepNative = () => {
      if (sweepingNative) return
      let mounted
      let inventory
      try {
        mounted = right.mounted?.getSnapshot()
        inventory = right.openTabs?.getSnapshot() ?? []
      } catch {
        return
      }
      if (mounted === undefined) return
      sweepingNative = true
      try {
        for (const tab of inventory) {
          if (tab.sessionId === mounted && tab.kind === type) closeNative(tab.tabId)
        }
      } finally {
        sweepingNative = false
      }
    }
    sweepNative()
    disposers.push(right.openTabs?.subscribe(sweepNative), right.mounted?.subscribe(sweepNative))
  }
  const active = disposers.filter((dispose) => typeof dispose === 'function')
  return active.length === 0 ? undefined : () => active.forEach((dispose) => dispose())
}
