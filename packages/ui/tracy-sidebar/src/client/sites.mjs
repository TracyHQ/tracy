import { tracyWebPath } from '@tracy/core/web-path'
/**
 * ONE WORKSPACE, ONE SITE (15/09/2026) — the sites the left column lists besides the one open.
 *
 * Each site is its own seat on the host dsh, so the page can list the SESSIONS of the site it is
 * open on only (dsh's workspace tree, filtered by the gate to that site's folder). Every other site
 * the viewer holds is one collapsed row here; choosing it opens that site's workspace
 * (`/<siteKey>/`), which mints that site's seat.
 *
 * Pure, so `test/sites.test.mjs` pins every rule.
 */

/** The creation workspace tracy-web serves under `<base href="/new/">` (`apps/tracy-web/src/workspace/scope.js`). */
export const CREATION_BASE = '/new/'

/** A site key in a path's first segment: a hostname, so it has a dot (`scope.js` SITE_PATH). */
const SITE_SEGMENT = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/|$)/

/** dsh's own root files that share a site key's shape (`scope.js` DSH_ROOT_FILES). */
const DSH_ROOT_FILES = new Set(['manifest.webmanifest', 'favicon.svg'])

/**
 * @param {string} basePathname - the pathname of the page's `<base href>`.
 * @returns {boolean} true on the creation workspace, where no site is open.
 */
export function inCreationWorkspace(basePathname) {
  return basePathname === CREATION_BASE
}

/**
 * The site this page is open on, or null.
 *
 * The path names it on arrival (`/<siteKey>/…`); once dsh writes the session into the address the
 * page sits at the root, and tracy-web's `tracy_site` pointer cookie is what names it — the same
 * order tracy-web itself resolves a root request in.
 * @param {{ pathname: string, basePathname: string, cookie: string }} input
 * @returns {string | null}
 */
export function currentSiteKey({ pathname, basePathname, cookie }) {
  if (inCreationWorkspace(basePathname)) return null
  const named = SITE_SEGMENT.exec(pathname)
  if (named && !DSH_ROOT_FILES.has(named[1])) return named[1]
  const pointer = /(?:^|;\s*)tracy_site=([^;]+)/.exec(cookie)
  if (!pointer) return null
  try {
    return decodeURIComponent(pointer[1]).trim() || null
  } catch {
    return null
  }
}

/**
 * The rows to list: every site the viewer holds an accepted seat on, except the one open, by key.
 * The open one is left out by ANY of its names: the address carries the name a rename gave it,
 * the row its immutable key (bug 03/10/2026).
 * @param {unknown} body - `GET /api/sites`'s answer.
 * @param {string | null} current - `currentSiteKey`.
 * @returns {string[]}
 */
export function otherSites(body, current) {
  const sites =
    body && typeof body === 'object' && Array.isArray(/** @type {{sites?: unknown}} */ (body).sites)
      ? /** @type {{sites: unknown[]}} */ (body).sites
      : []
  const keys = new Set()
  for (const row of sites) {
    if (!row || typeof row !== 'object') continue
    const { siteKey, status, aliases } =
      /** @type {{ siteKey?: unknown, status?: unknown, aliases?: unknown }} */ (row)
    if (typeof siteKey !== 'string' || siteKey === '' || siteKey === current) continue
    if (current !== null && Array.isArray(aliases) && aliases.includes(current)) continue
    if (status !== undefined && status !== 'accepted') continue
    keys.add(siteKey)
  }
  return [...keys].sort()
}

/**
 * Where choosing a site goes: its own workspace, tracy-web's door (root-absolute, never via dsh).
 * @param {string} siteKey
 * @returns {string}
 */
export function siteWorkspacePath(siteKey) {
  return `/${siteKey}/`
}

/**
 * Whether a site row has a page worth opening in the side card's browser tab.
 *
 * `agent` turns `'/'` only when the build is done (`setAttached` in tracy-web). Before that the row
 * is a CLAIM: Build takes the site by its name first (`POST /api/sites/claim`) and the address it
 * hands out answers "Site unavailable". A tab opened on it lands on top of the Build tab the press
 * moved the customer there to fill in (measured 17/09) — so nothing opens it on its own.
 * @param {{ copyUrl?: string | null, agent?: string | null } | null | undefined} row
 * @returns {boolean}
 */
export function hasPageToShow(row) {
  return (
    typeof row?.copyUrl === 'string' && row.copyUrl !== '' && row.agent !== null && row.agent !== undefined
  )
}

/** Fired when the viewer's list of sites really changed: a site made, deleted or left. */
export const SITES_CHANGED = 'tracy:sites-changed'

/**
 * How long one `/api/sites` answer serves every reader on the page before the next read asks again.
 * Nothing re-reads on a timer: a stale answer is replaced only when somebody reads.
 */
export const SITES_FRESH_MS = 30_000

/**
 * How long a failed ask (no answer, or a 5xx) holds the next read back. Short: it only stops a page
 * whose door is down from asking again on every event of a turn.
 */
export const SITES_RETRY_MS = 5_000

/**
 * Where the page keeps its one `/api/sites` answer: a global symbol, because every plugin bundles its
 * own copy of this file. `v2` since #340: the value is no longer a bare promise, and a page must not
 * read an older bundle's promise as this state.
 */
const SITES_STATE = Symbol.for('tracy.api.sites.v2')

/**
 * @typedef {{ status: number, body: unknown }} SitesAnswer
 *   `status` is the HTTP status; `0` means no answer came back at all (the network, a lane restarting).
 * @typedef {{ promise: Promise<SitesAnswer>, seq: number, joinable: boolean }} SitesAsk
 * @typedef {SitesAnswer & { at: number, failed: boolean, seq: number }} SitesKept
 * @typedef {{ after: SitesAsk, promise: Promise<SitesAnswer> }} SitesQueued
 * @typedef {{
 *   seq: number,
 *   minSeq: number,
 *   answer: SitesKept | null,
 *   asking: SitesAsk | null,
 *   queued: SitesQueued | null,
 *   listening: boolean
 * }} SitesState
 *   `seq` numbers every ask in the order it left; `minSeq` is the first one sent after the last
 *   `tracy:sites-changed` — an ask numbered below it may still carry a site that is gone. `queued` is
 *   the one read waiting for `asking` to come back, shared by every refresh that arrived meanwhile.
 * @typedef {{
 *   refresh?: boolean,
 *   fetch?: typeof globalThis.fetch,
 *   scope?: Record<symbol, unknown>,
 *   now?: () => number,
 *   freshMs?: number,
 *   retryMs?: number
 * }} SitesOptions
 */

/** @param {Record<symbol, unknown>} scope @returns {SitesState} */
function stateOf(scope) {
  let state = /** @type {SitesState | undefined} */ (scope[SITES_STATE])
  if (!state) {
    state = { seq: 0, minSeq: 0, answer: null, asking: null, queued: null, listening: false }
    scope[SITES_STATE] = state
  }
  if (!state.listening) {
    const target =
      /** @type {{ addEventListener?: (type: string, fn: () => void, capture?: boolean) => void }} */ (scope)
    if (typeof target.addEventListener === 'function') {
      const kept = state
      // Capture: at the target, capture listeners run before every plain one, so a plugin refreshing
      // on the same event already reads past the change.
      target.addEventListener(SITES_CHANGED, () => forget(kept), true)
      state.listening = true
    }
  }
  return state
}

/**
 * The viewer's list changed: every ask already sent, and the answer kept, may carry a site that is
 * gone. Idempotent until the next ask leaves, so one event heard twice still costs one ask.
 * @param {SitesState} state
 */
function forget(state) {
  state.minSeq = state.seq + 1
  state.answer = null
}

/**
 * What the readers of `ask` receive: its own answer while nothing newer is known; otherwise the newer
 * answer (an older ask finishing last must not paint over a newer one), or — when a change came after
 * it left — a fresh read, so a caller holding an old ask never applies a site that was deleted.
 * @param {SitesState} state @param {SitesAsk} ask @param {SitesOptions} options
 * @returns {Promise<SitesAnswer>}
 */
function settle(state, ask, options) {
  return ask.promise.then((answer) => {
    if (ask.seq < state.minSeq) return readSites({ ...options, refresh: false })
    const kept = state.answer
    if (kept && kept.seq > ask.seq) return { status: kept.status, body: kept.body }
    return answer
  })
}

/**
 * `GET /api/sites`, shared by every plugin on the page that reads it (the left column, Add site, My
 * Sites, the Mode chip, the site tabs, the Build menus).
 *
 * 🔒 ONE ASK SERVES THE PAGE (#340). Each plugin used to ask on its own schedule, and the Mode chip
 * asked on every `sessions.list` change — dozens per agent turn. Measured 24/09 on dev: 53 asks slower
 * than 1 s in one 10 s WordPress turn, 140 in one 53 s EmDash turn, each queued behind the last (up to
 * 7.9 s and 18.6 s). Now:
 *
 * - reads while an ask is on the wire share it;
 * - an answer serves every reader for `SITES_FRESH_MS`, an empty list included (an empty list is an
 *   answer); then the next read asks again — there is no timer;
 * - `refresh` (after a write, a poll waiting for an agent) never takes the kept answer: it shares an
 *   ask sent in this same task; if an older ask is still on the wire it waits for it and then shares
 *   ONE more ask with every refresh that arrived meanwhile — never two asks on the wire at once, so a
 *   5 s poll against an 18 s answer does not stack asks;
 * - `tracy:sites-changed` retires the kept answer AND every ask already on the wire: their readers get
 *   a fresh read instead, so an ask sent before a site was deleted never brings that site back;
 * - a failed ask (status `0`: no answer came back; or a 5xx) is kept only `SITES_RETRY_MS`, so the
 *   door is tried again soon but not on every event. A 401 is kept like any answer — a signed-out
 *   page does not ask again on every event either, and the reader tells it apart from a failure.
 *
 * @param {SitesOptions} [options]
 * @returns {Promise<SitesAnswer>}
 */
export function readSites(options = {}) {
  const scope = /** @type {Record<symbol, unknown>} */ (options.scope ?? globalThis)
  const now = options.now ?? Date.now
  const freshMs = options.freshMs ?? SITES_FRESH_MS
  const retryMs = options.retryMs ?? SITES_RETRY_MS
  const state = stateOf(scope)
  const onWire = state.asking && state.asking.seq >= state.minSeq ? state.asking : null
  if (onWire && (!options.refresh || onWire.joinable)) return settle(state, onWire, options)
  if (onWire) return queueAfter(state, onWire, options)
  if (
    !options.refresh &&
    state.answer &&
    now() - state.answer.at < (state.answer.failed ? retryMs : freshMs)
  ) {
    return Promise.resolve({ status: state.answer.status, body: state.answer.body })
  }
  const call = options.fetch ?? globalThis.fetch.bind(globalThis)
  state.seq += 1
  /** @type {SitesAsk} */
  const ask = { seq: state.seq, joinable: true, promise: Promise.resolve({ status: 0, body: null }) }
  // tracy-web's own door, root-absolute: the Worker-era rule `/api/sites` has always followed.
  ask.promise = call(tracyWebPath('/api/sites'), {
    headers: { accept: 'application/json' },
    credentials: 'same-origin'
  })
    .then(async (res) => {
      const status = typeof res.status === 'number' ? res.status : res.ok ? 200 : 500
      /** @type {unknown} */
      let body = null
      try {
        body = await res.json()
      } catch {
        body = null
      }
      return { status, body }
    })
    .catch(() => ({ status: 0, body: null }))
    .then((answer) => {
      if (state.asking === ask) state.asking = null
      const failed = answer.status === 0 || answer.status >= 500
      // Kept only while nothing retired it and nothing newer already came back.
      if (ask.seq >= state.minSeq && (!state.answer || state.answer.seq < ask.seq)) {
        state.answer = { ...answer, at: now(), failed, seq: ask.seq }
      }
      return answer
    })
  state.asking = ask
  // Joinable by a refresh only for the rest of this task: a refresh from a later one may follow a
  // later write.
  setTimeout(() => {
    ask.joinable = false
  }, 0)
  return settle(state, ask, options)
}

/**
 * A refresh that came while `ask` is on the wire: one read after it comes back, shared by every
 * refresh that came meanwhile. When it comes back, a newer ask already on the wire (sent after a
 * change retired `ask`) or a newer answer already kept serves it instead of another ask.
 * @param {SitesState} state @param {SitesAsk} ask @param {SitesOptions} options
 * @returns {Promise<SitesAnswer>}
 */
function queueAfter(state, ask, options) {
  if (state.queued && state.queued.after === ask) return state.queued.promise
  /** @type {SitesQueued} */
  const queued = { after: ask, promise: Promise.resolve({ status: 0, body: null }) }
  queued.promise = ask.promise.then(() => {
    if (state.queued === queued) state.queued = null
    const newer = state.asking && state.asking.seq > ask.seq && state.asking.seq >= state.minSeq
    if (newer) return settle(state, /** @type {SitesAsk} */ (state.asking), options)
    const kept = state.answer
    if (kept && kept.seq > ask.seq) return { status: kept.status, body: kept.body }
    return readSites(options)
  })
  state.queued = queued
  return queued.promise
}

/**
 * Tell every reader on the page that the viewer's list of sites changed: the next read asks again.
 * Fires `tracy:sites-changed`, which the left column and Add site also listen to.
 */
export function sitesChanged() {
  if (typeof window === 'undefined') return
  forget(stateOf(/** @type {Record<symbol, unknown>} */ (/** @type {unknown} */ (window))))
  window.dispatchEvent(new Event(SITES_CHANGED))
}

/**
 * The parsed answer when it is a 2xx, else null — the shape the left column and Add site read.
 * @param {SitesOptions} [options]
 * @returns {Promise<unknown>}
 */
export function sharedSites(options = {}) {
  return readSites(options).then((answer) =>
    answer.status >= 200 && answer.status < 300 ? answer.body : null
  )
}
