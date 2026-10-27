/**
 * The viewer's seat role on the site this page is (ADR 0028): `viewer`, `editor` or `owner`, as the
 * site's row in `GET /api/sites` says it (`role`, the same field the site tabs' picker reads). A
 * Viewer sees the site and asks about it; the agent is read-only for them, so the start screen asks
 * a question instead of offering Edit, and no Undo is drawn for them.
 *
 * Only `viewer` changes anything. An unknown role, a role not read yet, or a read that failed keeps
 * the page as every other seat sees it: the server still refuses what a Viewer may not do, and a
 * screen that guessed "viewer" would hide controls from someone who may press them.
 *
 * Pure apart from the `read` and `fetch` handed in, so `test/seat-role.test.mjs` pins every rule.
 */

/** The one role that hides the editing controls. */
export const VIEWER_ROLE = 'viewer'

/**
 * @param {unknown} role
 * @returns {boolean} true only for a Viewer seat.
 */
export function isViewerRole(role) {
  return role === VIEWER_ROLE
}

/**
 * The role on one site from a `GET /api/sites` answer, found by its key or one of its aliases (a
 * renamed site keeps its key; the address may carry the new name).
 * @param {unknown} body - the door's JSON answer.
 * @param {string} siteKey
 * @returns {string | null}
 */
export function siteRoleOf(body, siteKey) {
  const row = siteRowOf(body, siteKey)
  return row !== null && typeof row.role === 'string' ? row.role : null
}

/**
 * Whether the seat's own request for edit access is still waiting, from the same answer
 * (`editRequestedAt`, ADR 0028 §6): after a reload the Viewer bar says "sent" instead of offering
 * the press again. An older server without the field says nothing, which reads as not asked.
 * @param {unknown} body - the door's JSON answer.
 * @param {string} siteKey
 * @returns {boolean}
 */
export function editRequestedOf(body, siteKey) {
  const row = siteRowOf(body, siteKey)
  return row !== null && typeof row.editRequestedAt === 'string' && row.editRequestedAt !== ''
}

/**
 * One site's row of a `GET /api/sites` answer, by key or alias; null when the answer has none.
 * @param {unknown} body
 * @param {string} siteKey
 * @returns {{ siteKey?: unknown, aliases?: unknown, role?: unknown, editRequestedAt?: unknown } | null}
 */
function siteRowOf(body, siteKey) {
  const sites = /** @type {{ sites?: unknown } | null} */ (body)?.sites
  if (!Array.isArray(sites)) return null
  for (const row of sites) {
    if (row === null || typeof row !== 'object') continue
    const r =
      /** @type {{ siteKey?: unknown, aliases?: unknown, role?: unknown, editRequestedAt?: unknown }} */ (row)
    if (r.siteKey === siteKey || (Array.isArray(r.aliases) && r.aliases.includes(siteKey))) return r
  }
  return null
}

/**
 * @typedef {{
 *   getSnapshot: () => string | null,
 *   isRemoved: () => boolean,
 *   subscribe: (fn: () => void) => () => void,
 *   onChange: (fn: (prev: string | null, next: string | null) => void) => () => void,
 *   refresh: () => Promise<void>,
 *   stop: () => void
 * }} SeatRoleStore
 */

/**
 * A store of this page's role, read from `read` (the sidebar's shared `readSites`) when the page
 * loads and again on every `refresh()`: an Owner may approve a Viewer's request or change anyone's
 * role while the page is open, and the server re-mints the seat at once, so the page follows without
 * a reload (#1036, `watchRoleSignals` says when).
 *
 * - The first read also says whether the seat's request for edit access is waiting: `asked` is marked
 *   for the site, so the Viewer bar starts in its "sent" state.
 * - A later read that finds a different role tells `subscribe` listeners (they re-read the snapshot)
 *   and `onChange` listeners (they get the old and new role, for the one-time notice). A role change
 *   answers a waiting request, so `asked` is cleared for the site and a seat made Viewer again is
 *   offered the button again.
 * - A read whose row is gone (the seat was removed) keeps the role it knew: the page does not turn
 *   into an editing screen for someone who no longer edits; the server refuses either way. It
 *   marks the seat removed instead (`isRemoved`), when an earlier read had the row, so the page can
 *   say so and offer the way out (J7.8). A later read that finds a row again clears the mark.
 * - Only the newest read may write: an older answer arriving last never paints over a newer one.
 *
 * @param {{
 *   siteKey: string | null,
 *   read: (options?: { refresh?: boolean }) => Promise<{ status: number, body: unknown }>,
 *   asked?: { mark: (siteKey: string) => void, clear?: (siteKey: string) => void }
 * }} deps
 * @returns {SeatRoleStore}
 */
export function createSeatRole({ siteKey, read, asked }) {
  /** @type {string | null} */
  let role = null
  let removed = false
  let stopped = false
  let latest = 0
  /** @type {Set<() => void>} */
  const listeners = new Set()
  /** @type {Set<(prev: string | null, next: string | null) => void>} */
  const changes = new Set()
  /** @param {boolean} refresh */
  const load = (refresh) => {
    if (siteKey === null || stopped) return Promise.resolve()
    const mine = ++latest
    return Promise.resolve()
      .then(() => read(refresh ? { refresh: true } : undefined))
      .then(({ status, body }) => {
        if (stopped || mine !== latest || status < 200 || status >= 300) return
        const next = siteRoleOf(body, siteKey)
        if (asked && editRequestedOf(body, siteKey)) asked.mark(siteKey)
        // The row is gone after the page had one: the seat was taken back (J7.8). Only an answer
        // that is a list says so; the role the page knew stays, so nothing turns into an editor.
        const gone = next === null && role !== null && Array.isArray(/** @type {any} */ (body)?.sites)
        if (gone !== removed) {
          removed = gone
          for (const fn of listeners) fn()
        }
        if (next === role || (next === null && role !== null)) return
        const prev = role
        role = next
        if (prev !== null) asked?.clear?.(siteKey)
        for (const fn of listeners) fn()
        for (const fn of changes) fn(prev, next)
      })
      .catch(() => {
        // No answer: the page stays as it was drawn, and the server still decides.
      })
  }
  void load(false)
  return {
    getSnapshot: () => role,
    isRemoved: () => removed,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    onChange(fn) {
      changes.add(fn)
      return () => changes.delete(fn)
    },
    refresh: () => load(true),
    stop() {
      stopped = true
      listeners.clear()
      changes.clear()
    }
  }
}

/** The roles that edit the site (ADR 0028 §2): what a Viewer becomes when an Owner approves. */
const EDITING_ROLES = new Set(['editor', 'owner'])

/**
 * What one role change means for the page's notice: `promoted` when a Viewer now edits, `demoted`
 * when an editing seat is a Viewer again, null for anything else (the first read, an unknown role,
 * Editor to Owner).
 * @param {string | null} prev
 * @param {string | null} next
 * @returns {'promoted' | 'demoted' | null}
 */
export function roleShift(prev, next) {
  if (isViewerRole(prev) && typeof next === 'string' && EDITING_ROLES.has(next)) return 'promoted'
  if (typeof prev === 'string' && EDITING_ROLES.has(prev) && isViewerRole(next)) return 'demoted'
  return null
}

/** How long "You can now edit this site." stays above the chat box. */
export const PROMOTED_NOTICE_MS = 8000

/**
 * The one short notice a Viewer gets when an Owner makes them an Editor: shown on the change, gone
 * after `ms` or as soon as the seat is a Viewer again. A demotion draws no notice of its own: the
 * screen switching back is the change, and the server already sent the Inbox row and the email.
 * @param {{
 *   seatRole: Pick<SeatRoleStore, 'onChange'>,
 *   setTimer: (fn: () => void, ms: number) => unknown,
 *   clearTimer: (handle: unknown) => void,
 *   ms?: number
 * }} deps
 * @returns {{ getSnapshot: () => boolean, subscribe: (fn: () => void) => () => void, stop: () => void }}
 */
export function createPromotedNotice({ seatRole, setTimer, clearTimer, ms = PROMOTED_NOTICE_MS }) {
  let shown = false
  /** @type {unknown} */
  let timer = null
  /** @type {Set<() => void>} */
  const listeners = new Set()
  const cancel = () => {
    if (timer !== null) clearTimer(timer)
    timer = null
  }
  /** @param {boolean} next */
  const set = (next) => {
    if (shown === next) return
    shown = next
    for (const fn of listeners) fn()
  }
  const off = seatRole.onChange((prev, next) => {
    const shift = roleShift(prev, next)
    if (shift === 'promoted') {
      cancel()
      set(true)
      timer = setTimer(() => {
        timer = null
        set(false)
      }, ms)
    } else if (shift === 'demoted') {
      cancel()
      set(false)
    }
  })
  return {
    getSnapshot: () => shown,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    stop() {
      off()
      cancel()
      listeners.clear()
    }
  }
}

/** Do not ask again on a page that comes back into sight sooner than this after the last ask. */
export const ROLE_RECHECK_GAP_MS = 10_000

/**
 * When the page reads its role again (#1036). Two signals, no timer of its own:
 *
 * - `event` on `target`: the page's existing "this site's book changed" event
 *   (`tracy:team-changed`). The Inbox sends it when its 30-second unread poll finds a new `team.*`
 *   row (an approval, a role change, a removal: the server writes one for the affected person), and
 *   the Team tab after its own writes. Riding it costs no request of its own.
 * - The page coming back into sight (`visibilitychange`), at most once per `minGapMs`: a person who
 *   turned the Inbox channel off for role changes gets no row, so no event; switching back to the
 *   tab is when they look, and one read then is cheaper than a poll.
 *
 * @param {{
 *   refresh: () => unknown,
 *   event: string,
 *   target: { addEventListener: (type: string, fn: () => void) => void, removeEventListener: (type: string, fn: () => void) => void },
 *   doc: {
 *     readonly visibilityState: string,
 *     addEventListener: (type: 'visibilitychange', fn: () => void) => void,
 *     removeEventListener: (type: 'visibilitychange', fn: () => void) => void
 *   },
 *   now?: () => number,
 *   minGapMs?: number
 * }} deps
 * @returns {() => void} stop listening.
 */
export function watchRoleSignals({
  refresh,
  event,
  target,
  doc,
  now = Date.now,
  minGapMs = ROLE_RECHECK_GAP_MS
}) {
  let last = Number.NEGATIVE_INFINITY
  const ask = () => {
    last = now()
    refresh()
  }
  const onVisible = () => {
    if (doc.visibilityState !== 'visible' || now() - last < minGapMs) return
    ask()
  }
  target.addEventListener(event, ask)
  doc.addEventListener('visibilitychange', onVisible)
  return () => {
    target.removeEventListener(event, ask)
    doc.removeEventListener('visibilitychange', onVisible)
  }
}

/**
 * Keep a boolean attribute on `root` true exactly while the seat is a Viewer: composer-styles.ts
 * and the comment layer in `dsh-better-sidebar` read it. Follows every role change.
 * @param {{ toggleAttribute: (name: string, force: boolean) => unknown, removeAttribute: (name: string) => void }} root
 * @param {Pick<SeatRoleStore, 'getSnapshot' | 'subscribe'>} seatRole
 * @param {string} attr
 * @returns {() => void} stop following, and take the attribute off.
 */
export function mirrorViewerAttr(root, seatRole, attr) {
  const sync = () => {
    root.toggleAttribute(attr, isViewerRole(seatRole.getSnapshot()))
  }
  sync()
  const off = seatRole.subscribe(sync)
  return () => {
    off()
    root.removeAttribute(attr)
  }
}

/** A store that never says anything: no site, or a surface without the page's store. */
export const NO_ROLE = {
  getSnapshot: () => /** @type {string | null} */ (null),
  isRemoved: () => false,
  subscribe: () => () => {},
  /** @param {(prev: string | null, next: string | null) => void} _fn */
  onChange: (_fn) => () => {},
  refresh: () => Promise.resolve(),
  stop: () => {}
}

/**
 * The sites this page has already asked edit access for, once the door accepted. One store per page:
 * the Viewer bar is drawn twice (in the start block, and above the chat box once the session runs),
 * and an ask the start screen sent must still read as sent after the first message.
 * `clear` forgets a site once its role changed: the change answered the request.
 * @returns {{ has: (siteKey: string) => boolean, mark: (siteKey: string) => void, clear: (siteKey: string) => void, subscribe: (fn: () => void) => () => void }}
 */
export function createAskedSites() {
  /** @type {Set<string>} */
  const asked = new Set()
  /** @type {Set<() => void>} */
  const listeners = new Set()
  return {
    has: (siteKey) => asked.has(siteKey),
    mark(siteKey) {
      if (asked.has(siteKey)) return
      asked.add(siteKey)
      for (const fn of listeners) fn()
    },
    clear(siteKey) {
      if (!asked.delete(siteKey)) return
      for (const fn of listeners) fn()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
  }
}

/**
 * The door a Viewer asks the site's Owners through (Q13: the join-request pipeline on their own
 * seat row): every Owner gets an Inbox item and an email.
 * @param {string} siteKey
 */
export const editAccessPath = (siteKey) => `/api/sites/${encodeURIComponent(siteKey)}/edit-access-request`

/**
 * Ask for edit access.
 * @param {{ siteKey: string, fetch: typeof globalThis.fetch }} deps
 * @returns {Promise<{ kind: 'sent' } | { kind: 'failed', code: string }>}
 */
export async function askForEditAccess({ siteKey, fetch }) {
  let res
  try {
    res = await fetch(editAccessPath(siteKey), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: '{}'
    })
  } catch {
    return { kind: 'failed', code: 'UNREACHABLE' }
  }
  if (res.ok) return { kind: 'sent' }
  /** @type {unknown} */
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  const code = /** @type {{ code?: unknown } | null} */ (body)?.code
  return { kind: 'failed', code: typeof code === 'string' && code !== '' ? code : `HTTP_${res.status}` }
}

/**
 * The line the bar shows after a press, as a string key and its parameters: the server's refusal
 * is named by its code, in the words the turn card uses for a refused undo.
 * @param {{ kind: 'sent' } | { kind: 'failed', code: string }} outcome
 * @returns {{ key: 'viewer.ask.sent' | 'viewer.ask.signedOut' | 'viewer.ask.alreadyEditor' | 'viewer.ask.failed', params?: { code: string } }}
 */
export function askOutcomeLine(outcome) {
  if (outcome.kind === 'sent') return { key: 'viewer.ask.sent' }
  // The seat already edits (approved meanwhile, or the role changed): the bar asks the page to read
  // the role again (`onAlreadyEditor`), and this line stays only if that read did not come back.
  if (outcome.code === 'ALREADY_EDITOR') return { key: 'viewer.ask.alreadyEditor' }
  if (outcome.code === 'NOT_SIGNED_IN' || outcome.code === 'NO_VIEWER' || outcome.code === 'HTTP_401')
    return { key: 'viewer.ask.signedOut' }
  return { key: 'viewer.ask.failed', params: { code: outcome.code } }
}
