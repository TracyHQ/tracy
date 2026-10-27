/**
 * The undo of one chat turn, as every door that offers it reads it: the card under a chat turn
 * (`tracy-chat-input` `TurnUndoCard.tsx`) and the Site changes row of that turn (`site-tabs`
 * `ActivityEventRow.tsx`). Kept free of React so both packages' tests can hold it. The contract it
 * reads is `tasks/undo-change/api-contract.md`: `GET /api/sites/:key/turns?session=` says, per turn,
 * what it changed and whether it can be undone; `POST /api/sites/:key/turns/undo` undoes it.
 *
 * 🔒 THE SERVER DECIDES, THE DOOR DRAWS. Whether a turn can be undone depends on things only the
 * server sees: an edit made in the CMS admin after the turn, a turn open on the site right now, the
 * viewer's toolsets. No door works any of that out from dsh's own state (`running` and
 * `sessionStatus` say `false` to a seat for the whole turn, `tracy-site-tabs` `site-reload.mjs`);
 * it reads the door again whenever something may have moved, and the POST is checked again in full.
 *
 * Every word goes through `say(key, params)` (the caller's translator), so this file holds string
 * KEYS (`TurnUndoKey` in `index.d.mts`), never English sentences: each package that uses it ships
 * those keys in its own namespace, with the same English. Data the server left out is left out of
 * the sentence too: a shorter, true sentence, never a guessed name or time.
 */

/**
 * @typedef {{ kind: string | null, id: string | null, title: string | null }} Target
 * @typedef {{ applyId: string, action: string, target: Target | null, at: string | null }} ContentWrite
 * @typedef {{ undo: string, at: string | null }} LookWrite
 * @typedef {{ code: string, [field: string]: unknown }} Reason
 * @typedef {{
 *   turnId: string, turn: number, title: string | null, openedAt: string | null, closedAt: string | null,
 *   changed: boolean,
 *   files: { count: number, commits: string[], zones: Record<string, number> },
 *   content: ContentWrite[],
 *   look: LookWrite[],
 *   undo: { state: 'available' | 'blocked' | 'undone' | 'none', latest: boolean, reasons: Reason[], needs: { code: boolean, content: boolean } }
 * }} Turn
 * @typedef {{
 *   applyId: string, id: string, name: string | null, previous: { id: string, name: string | null } | null,
 *   at: string, by: string | null, undone: boolean, canUndo: boolean
 * }} DesignSystemApply
 *   the site's newest design system apply (`/turns` `designSystem`, the Design system door's `last`):
 *   site-wide, not the chat's — the site browser's Undo offers it when it is newer than the chat's
 *   newest change. `canUndo`: this seat holds the toolset its undo needs.
 * @typedef {{ cms: string | null, siteBusy: boolean, turns: Turn[], designSystem: DesignSystemApply | null }} TurnsAnswer
 * @typedef {import('./index.d.mts').TurnUndoKey} StringKey
 * @typedef {(key: StringKey, params?: Record<string, string | number>) => string} Say
 * @typedef {{ key: StringKey, params?: Record<string, string | number> }} Words
 * @typedef {'undo' | 'goBack'} Action
 * @typedef {{ kind: 'ready', turn: Turn, action: Action, later: number }
 *   | { kind: 'disabled', turn: Turn, action: Action, note: Words }
 *   | { kind: 'blocked', turn: Turn, ask: boolean }
 *   | { kind: 'emdash', turn: Turn }
 *   | { kind: 'undone', turn: Turn }} Card
 *   `later`: how many later turns of the chat a Go back to here sweeps along with this one. A
 *   blocked card's sentence is `reasonWords` of `turn.undo.reasons[0]`, said by the door that draws
 *   it: it names the record in the reader's words and the time in their clock, which this pure
 *   decision holds neither of.
 */

/** The turns door of one site and chat session. */
export function turnsUrl(/** @type {string} */ siteKey, /** @type {string} */ sessionId) {
  return `/api/sites/${encodeURIComponent(siteKey)}/turns?${new URLSearchParams({ session: sessionId })}`
}

const isObject = (/** @type {unknown} */ v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (/** @type {unknown} */ v) => (typeof v === 'string' && v !== '' ? v : null)

/** @returns {Target | null} */
function readTarget(/** @type {unknown} */ raw) {
  if (!isObject(raw)) return null
  const t = /** @type {Record<string, unknown>} */ (raw)
  const id = typeof t.id === 'number' ? String(t.id) : text(t.id)
  const target = { kind: text(t.kind), id, title: text(t.title) }
  return target.kind === null && target.id === null && target.title === null ? null : target
}

/**
 * One turn as the card may trust it, or null when the row is not one. A field the server left out
 * reads as "nothing", never as a guess: no zones is `{}`, no reason list is `[]`.
 * @returns {Turn | null}
 */
function readTurn(/** @type {unknown} */ raw) {
  if (!isObject(raw)) return null
  const r = /** @type {Record<string, any>} */ (raw)
  if (typeof r.turn !== 'number' || typeof r.turnId !== 'string') return null
  const files = isObject(r.files) ? r.files : {}
  const undo = isObject(r.undo) ? r.undo : {}
  const state = ['available', 'blocked', 'undone', 'none'].includes(undo.state) ? undo.state : 'none'
  /** @type {Record<string, number>} */
  const zones = {}
  for (const [zone, count] of Object.entries(isObject(files.zones) ? files.zones : {}))
    if (typeof count === 'number' && count > 0) zones[zone] = count
  return {
    turnId: r.turnId,
    turn: r.turn,
    title: text(r.title),
    openedAt: text(r.openedAt),
    closedAt: text(r.closedAt),
    changed: r.changed === true,
    files: {
      count: typeof files.count === 'number' && files.count > 0 ? files.count : 0,
      commits: Array.isArray(files.commits)
        ? files.commits.filter((/** @type {unknown} */ c) => typeof c === 'string')
        : [],
      zones
    },
    content: (Array.isArray(r.content) ? r.content : [])
      .filter((c) => isObject(c) && typeof c.applyId === 'string')
      .map((c) => ({
        applyId: c.applyId,
        action: typeof c.action === 'string' ? c.action : '',
        target: readTarget(c.target),
        at: text(c.at)
      })),
    look: (Array.isArray(r.look) ? r.look : [])
      .filter((l) => isObject(l) && typeof l.undo === 'string' && l.undo !== '')
      .map((l) => ({ undo: l.undo, at: text(l.at) })),
    undo: {
      state,
      latest: undo.latest === true,
      // A blocked turn always carries at least one reason (contract); one that came without gets
      // a reason the card words as "can't undo right now", never an empty warning.
      reasons: (Array.isArray(undo.reasons) ? undo.reasons : []).filter(
        (/** @type {unknown} */ x) => isObject(x) && typeof (/** @type {any} */ (x).code) === 'string'
      ),
      needs: {
        code: isObject(undo.needs) && undo.needs.code === true,
        content: isObject(undo.needs) && undo.needs.content === true
      }
    }
  }
}

/**
 * The site's newest design system apply as the toolbar may trust it, or null (none, an older server,
 * a row missing what an undo needs).
 * @returns {DesignSystemApply | null}
 */
function readDesignSystemApply(/** @type {unknown} */ raw) {
  if (!isObject(raw)) return null
  const r = /** @type {Record<string, any>} */ (raw)
  if (typeof r.applyId !== 'string' || !/^[0-9a-f]{12}$/.test(r.applyId)) return null
  if (text(r.id) === null || text(r.at) === null || Number.isNaN(Date.parse(r.at))) return null
  return {
    applyId: r.applyId,
    id: r.id,
    name: text(r.name),
    previous:
      isObject(r.previous) && text(r.previous.id) !== null
        ? { id: r.previous.id, name: text(r.previous.name) }
        : null,
    at: r.at,
    by: text(r.by),
    undone: r.undone === true,
    canUndo: r.canUndo === true
  }
}

/**
 * Read the door's answer. Only a 2xx whose body has a `turns` array is an answer; anything else (a
 * 404 from a server that has no door yet, a login page, a 5xx) says nothing about the turns.
 * @param {number} status
 * @param {unknown} body
 * @returns {TurnsAnswer | null}
 */
export function readTurnsAnswer(status, body) {
  if (status < 200 || status >= 300 || !isObject(body)) return null
  const b = /** @type {Record<string, unknown>} */ (body)
  if (!Array.isArray(b.turns)) return null
  return {
    cms: text(b.cms),
    siteBusy: b.siteBusy === true,
    turns: /** @type {Turn[]} */ (b.turns.map(readTurn).filter((t) => t !== null)),
    designSystem: readDesignSystemApply(b.designSystem)
  }
}

/**
 * What the site browser's Undo takes back for one chat: the newest of (a) the chat's newest change
 * not undone (the server's `latest` turn) and (b) the site's newest design system apply not undone —
 * newest first, as every undo here goes. A turn whose time is unknown never hides a recorded apply.
 * @param {TurnsAnswer} answer
 * @returns {{ kind: 'turn', turn: Turn } | { kind: 'design-system', apply: DesignSystemApply } | null}
 */
export function newestUndoOf(answer) {
  const turn = answer.turns.filter((t) => t.changed && t.undo.latest).at(-1)
  const apply = answer.designSystem && !answer.designSystem.undone ? answer.designSystem : null
  if (apply !== null) {
    const turnAt = turn === undefined ? Number.NaN : Date.parse(turn.closedAt ?? turn.openedAt ?? '')
    if (!(turnAt >= Date.parse(apply.at))) return { kind: 'design-system', apply }
  }
  return turn === undefined ? null : { kind: 'turn', turn }
}

/**
 * @typedef {{
 *   status: 'loading' | 'ready' | 'failed', answer: TurnsAnswer | null, signal: string,
 *   startedAt: number, answerFrom: number, undoing: boolean
 * }} BookEntry
 *   what the page knows about one (site, session). The last answer is kept while a newer read runs,
 *   so a card does not blink on every re-read. `startedAt` stamps the latest read and `answerFrom`
 *   the read the answer came from, on the book's own clock (`mark`). `undoing`: an undo of this
 *   chat is in flight, so no card of the chat may start another.
 */

/**
 * One read of the turns door per (site, session, signal), shared by every card of that chat: a
 * chat with twenty turns draws twenty cards, and they must not ask twenty times.
 *
 * `signal` is what the cards saw change (the chat's turn count and whether its last turn ended);
 * every card of a chat computes the same one, so the first card to see a change reads and the rest
 * wait for that answer. `refresh` reads again whatever the signal (after an undo). An answer that
 * arrives after a newer read started is dropped: the newer one speaks for the site.
 *
 * 🔒 A CARD THAT ARRIVES IN A CHAT WAITS FOR A FRESH READ (#802 fence, kept from the old card). A
 * card takes `mark()` when it is shown for a chat, and draws only an answer from a read started
 * after that mark (`wantSince`): coming back to a chat must never offer what was read on an earlier
 * visit, which may have been undone since. Cards entering together share one mark, so one read.
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export function createTurnsBook({ fetchImpl } = {}) {
  /** @type {Map<string, BookEntry>} */
  const entries = new Map()
  /** @type {Set<() => void>} */
  const listeners = new Set()
  let clock = 0
  const keyOf = (/** @type {string} */ siteKey, /** @type {string} */ sessionId) =>
    JSON.stringify([siteKey, sessionId])
  const tell = () => {
    for (const listener of listeners) listener()
  }
  const read = (
    /** @type {string} */ siteKey,
    /** @type {string} */ sessionId,
    /** @type {string} */ signal
  ) => {
    const key = keyOf(siteKey, sessionId)
    const before = entries.get(key)
    clock += 1
    const startedAt = clock
    entries.set(key, {
      status: 'loading',
      answer: before?.answer ?? null,
      signal,
      startedAt,
      answerFrom: before?.answerFrom ?? 0,
      undoing: before?.undoing ?? false
    })
    tell()
    const call = fetchImpl ?? globalThis.fetch.bind(globalThis)
    /** @type {Promise<void>} */
    const done = Promise.resolve()
      .then(() =>
        call(turnsUrl(siteKey, sessionId), {
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
      )
      .then(async (res) => readTurnsAnswer(res.status, await res.json().catch(() => null)))
      .catch(() => null)
      .then((answer) => {
        const now = entries.get(key)
        if (now?.startedAt !== startedAt) return
        entries.set(
          key,
          answer === null
            ? { ...now, status: 'failed' }
            : { ...now, status: 'ready', answer, answerFrom: startedAt }
        )
        tell()
      })
    return done
  }
  const setUndoing = (/** @type {string} */ key, /** @type {boolean} */ undoing) => {
    const entry = entries.get(key)
    if (entry === undefined) return
    entries.set(key, { ...entry, undoing })
    tell()
  }
  return {
    /** @returns {BookEntry | undefined} */
    get(/** @type {string} */ siteKey, /** @type {string} */ sessionId) {
      return entries.get(keyOf(siteKey, sessionId))
    },
    /** The book's clock now: a card shown from here on draws only answers read after it. */
    mark() {
      return clock
    },
    /** Read the door unless a read for this signal already ran or runs. */
    want(/** @type {string} */ siteKey, /** @type {string} */ sessionId, /** @type {string} */ signal) {
      const entry = entries.get(keyOf(siteKey, sessionId))
      if (entry !== undefined && entry.signal === signal) return
      void read(siteKey, sessionId, signal)
    },
    /** Read the door unless a read started after `mark` already runs or ran. */
    wantSince(/** @type {string} */ siteKey, /** @type {string} */ sessionId, /** @type {number} */ mark) {
      const entry = entries.get(keyOf(siteKey, sessionId))
      if (entry !== undefined && entry.startedAt > mark) return
      void read(siteKey, sessionId, entry?.signal ?? '')
    },
    /** Read the door again now, keeping the signal (after an undo). */
    refresh(/** @type {string} */ siteKey, /** @type {string} */ sessionId) {
      return read(siteKey, sessionId, entries.get(keyOf(siteKey, sessionId))?.signal ?? '')
    },
    /**
     * Claim the chat for one undo; false when one is already in flight (from any card of the chat).
     * @returns {boolean}
     */
    begin(/** @type {string} */ siteKey, /** @type {string} */ sessionId) {
      const key = keyOf(siteKey, sessionId)
      if (entries.get(key)?.undoing === true) return false
      if (!entries.has(key))
        entries.set(key, {
          status: 'loading',
          answer: null,
          signal: '',
          startedAt: 0,
          answerFrom: 0,
          undoing: false
        })
      setUndoing(key, true)
      return true
    },
    /** Release the chat after its undo answered. */
    end(/** @type {string} */ siteKey, /** @type {string} */ sessionId) {
      setUndoing(keyOf(siteKey, sessionId), false)
    },
    subscribe(/** @type {() => void} */ listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}

/**
 * @typedef {{ kind: 'done' }
 *   | { kind: 'partial', unsure: boolean }
 *   | { kind: 'refused', code: string }
 *   | { kind: 'unsure', code: string }} UndoOutcome
 *   `refused`: a clean no, nothing was written (the server checks everything before it writes).
 *   `unsure`: nobody knows; the undo may have landed (#802: silence is not a refusal).
 */

// ── One undo, every door told (toolbar contract `tasks/undo-change/toolbar-contract.md` §3) ────────

/**
 * Said on `window` right after an undo that took anything back (done or partial), by whichever door
 * pressed it: the chat card, the Site changes row, the preview's Undo. Every other door on the page
 * reads again (the chat's turns book for that session, the Site changes list for that site), so an
 * undo shows everywhere without a reload. `undoTurn` says it itself, so no door can forget to.
 *
 * 🔒 NO ECHO. A door that hears it only READS again; it never says it again, and a read never says
 * it (only `undoTurn` does, after a POST answered).
 */
export const TURN_UNDONE_EVENT = 'tracy:turn-undone'

/**
 * @typedef {{ sessionId: string, siteKey: string, turnIds: string[] }} TurnUndone
 */

/**
 * The event's detail as a listener may trust it, or null when it is not one.
 * @param {unknown} detail
 * @returns {TurnUndone | null}
 */
export function readTurnUndone(detail) {
  if (!isObject(detail)) return null
  const d = /** @type {Record<string, unknown>} */ (detail)
  const sessionId = text(d.sessionId)
  const siteKey = text(d.siteKey)
  if (sessionId === null || siteKey === null) return null
  const turnIds = Array.isArray(d.turnIds)
    ? d.turnIds.filter((/** @type {unknown} */ id) => typeof id === 'string' && id !== '')
    : []
  return { sessionId, siteKey, turnIds }
}

/**
 * Say that an undo took something back. No target (a server, a test without one): nothing.
 * @param {TurnUndone} detail
 * @param {EventTarget | undefined} [target]
 */
export function announceTurnUndone(detail, target = defaultTarget()) {
  if (target === undefined) return
  // The target's own realm makes the event when it has one (a window): a CustomEvent of another
  // realm is refused by some DOMs. A plain EventTarget takes this realm's.
  const Make =
    /** @type {{ CustomEvent?: typeof CustomEvent }} */ (target).CustomEvent ?? globalThis.CustomEvent
  if (typeof Make !== 'function') return
  try {
    target.dispatchEvent(new Make(TURN_UNDONE_EVENT, { detail }))
  } catch (error) {
    // The undo itself is done: a listener that throws, or a DOM that refuses the event, must not
    // turn a landed undo into a failure for the door that pressed it.
    console.warn('[tracy] could not say the undo on the page', error)
  }
}

/**
 * Hear every undo said on the page.
 * @param {(detail: TurnUndone) => void} listener
 * @param {EventTarget | undefined} [target]
 * @returns {() => void} stop hearing.
 */
export function onTurnUndone(listener, target = defaultTarget()) {
  if (target === undefined) return () => {}
  const hear = (/** @type {Event} */ event) => {
    const detail = readTurnUndone(/** @type {CustomEvent} */ (event).detail)
    if (detail !== null) listener(detail)
  }
  target.addEventListener(TURN_UNDONE_EVENT, hear)
  return () => target.removeEventListener(TURN_UNDONE_EVENT, hear)
}

// ── A design system put on or taken off (the Design system door) ─────────────────────────────────

/**
 * Said on `window` after a design system was put on a site or taken off it, by whichever door pressed
 * it: the Design system panel, the site browser's Undo, the apply's Site changes row. Every other door
 * on the page reads again (the panel its read, the toolbar its chat's turns, Site changes its list).
 * 🔒 NO ECHO, as {@link TURN_UNDONE_EVENT}: a door that hears it only reads again.
 */
export const DESIGN_SYSTEM_CHANGED_EVENT = 'tracy:design-system-changed'

/**
 * @typedef {{ siteKey: string, applyId: string | null, undone: boolean }} DesignSystemChanged
 */

/**
 * Say that a design system was put on (`undone: false`) or taken off a site.
 * @param {DesignSystemChanged} detail
 * @param {EventTarget | undefined} [target]
 */
export function announceDesignSystemChanged(detail, target = defaultTarget()) {
  if (target === undefined) return
  const Make =
    /** @type {{ CustomEvent?: typeof CustomEvent }} */ (target).CustomEvent ?? globalThis.CustomEvent
  if (typeof Make !== 'function') return
  try {
    target.dispatchEvent(new Make(DESIGN_SYSTEM_CHANGED_EVENT, { detail }))
  } catch (error) {
    console.warn('[tracy] could not say the design system change on the page', error)
  }
}

/**
 * Hear every design system change said on the page.
 * @param {(detail: DesignSystemChanged) => void} listener
 * @param {EventTarget | undefined} [target]
 * @returns {() => void} stop hearing.
 */
export function onDesignSystemChanged(listener, target = defaultTarget()) {
  if (target === undefined) return () => {}
  const hear = (/** @type {Event} */ event) => {
    const d = /** @type {CustomEvent} */ (event).detail
    if (!isObject(d) || text(d.siteKey) === null) return
    listener({ siteKey: d.siteKey, applyId: text(d.applyId), undone: d.undone === true })
  }
  target.addEventListener(DESIGN_SYSTEM_CHANGED_EVENT, hear)
  return () => target.removeEventListener(DESIGN_SYSTEM_CHANGED_EVENT, hear)
}

// ── A Sync from live that brought the live site's changes in (the Sync from live dialog) ─────────

/**
 * Said on `window` when a Sync from live was applied and brought something from the live site — a
 * file, a record, a table — so every open Browser tab on that site shows it (the chat's preview
 * reload). A sync that brought nothing is not said: the page is the same.
 * 🔒 NO ECHO, as {@link TURN_UNDONE_EVENT}: a door that hears it only reloads or reads again.
 */
export const SITE_SYNCED_EVENT = 'tracy:site-synced'

/**
 * @typedef {{ siteKey: string, syncId: string }} SiteSynced
 */

/**
 * Say that a Sync from live brought the live site's changes into a site.
 * @param {SiteSynced} detail
 * @param {EventTarget | undefined} [target]
 */
export function announceSiteSynced(detail, target = defaultTarget()) {
  if (target === undefined) return
  const Make =
    /** @type {{ CustomEvent?: typeof CustomEvent }} */ (target).CustomEvent ?? globalThis.CustomEvent
  if (typeof Make !== 'function') return
  try {
    target.dispatchEvent(new Make(SITE_SYNCED_EVENT, { detail }))
  } catch (error) {
    console.warn('[tracy] could not say the sync on the page', error)
  }
}

/**
 * Hear every Sync from live said on the page.
 * @param {(detail: SiteSynced) => void} listener
 * @param {EventTarget | undefined} [target]
 * @returns {() => void} stop hearing.
 */
export function onSiteSynced(listener, target = defaultTarget()) {
  if (target === undefined) return () => {}
  const hear = (/** @type {Event} */ event) => {
    const d = /** @type {CustomEvent} */ (event).detail
    if (!isObject(d) || text(d.siteKey) === null) return
    listener({ siteKey: d.siteKey, syncId: text(d.syncId) ?? '' })
  }
  target.addEventListener(SITE_SYNCED_EVENT, hear)
  return () => target.removeEventListener(SITE_SYNCED_EVENT, hear)
}

/**
 * Take one design system apply off its site through the Design system door (`POST …/design-system/
 * undo`) — the same door the panel presses, with its rules: only the newest apply, only while the
 * site still holds what it wrote (`DS_CHANGED_SINCE` otherwise, nothing written), never a Viewer.
 * Asked once, never retried. A done undo is said on the page ({@link DESIGN_SYSTEM_CHANGED_EVENT}).
 * @param {{ siteKey: string, applyId: string, fetchImpl?: typeof fetch, target?: EventTarget }} ask
 * @returns {Promise<{ kind: 'done', worn: { name: string } | null } | { kind: 'refused', code: string } | { kind: 'unsure', code: string }>}
 */
export async function undoDesignSystemApply(ask) {
  const call = ask.fetchImpl ?? globalThis.fetch.bind(globalThis)
  /** @type {Response} */
  let res
  try {
    res = await call(`/api/sites/${encodeURIComponent(ask.siteKey)}/design-system/undo`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ applyId: ask.applyId })
    })
  } catch {
    return { kind: 'unsure', code: 'UNREACHABLE' }
  }
  const raw = /** @type {unknown} */ (await res.json().catch(() => null))
  const body = isObject(raw) ? /** @type {Record<string, any>} */ (raw) : null
  const code = text(body?.code)
  if (res.ok && body?.ok === true) {
    announceDesignSystemChanged(
      { siteKey: ask.siteKey, applyId: ask.applyId, undone: true },
      'target' in ask ? ask.target : defaultTarget()
    )
    const name = isObject(body.worn) ? text(body.worn.name) : null
    return { kind: 'done', worn: name === null ? null : { name } }
  }
  // A write the host may or may not have finished: said as not known, never as "nothing changed".
  if (res.status >= 500 || code === 'DS_WRITE_FAILED' || (res.ok && body?.ok !== false))
    return { kind: 'unsure', code: code ?? `HTTP_${res.status}` }
  return { kind: 'refused', code: code ?? `HTTP_${res.status}` }
}

/** The page's `window`, or undefined where there is none (node). */
function defaultTarget() {
  return typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' ? window : undefined
}

/**
 * Whether two site keys name the same site: their labels (the first part) compared without case, as
 * `tracy-chat-input` `comment-status.mjs` `sameSite` does. The chat reads its key from the page's
 * path; Site changes from its picker, and an alias names the same label.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameSiteKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const label = (/** @type {string} */ k) => k.trim().toLowerCase().split('.')[0]
  return label(a) !== '' && label(a) === label(b)
}

/**
 * Ask the server to undo one turn (`scope: 'turn'`, the latest) or to go back to before it
 * (`'from-here'`). Asked once, never retried here. A done or partial answer is said on the page
 * (`TURN_UNDONE_EVENT`, on `target`, the page's window by default) before this resolves.
 * @param {{ siteKey: string, sessionId: string, turnId: string, scope: 'turn' | 'from-here', idemKey?: string, fetchImpl?: typeof fetch, target?: EventTarget }} ask
 * @returns {Promise<UndoOutcome>}
 */
export async function undoTurn(ask) {
  const outcome = await postUndo(ask)
  if (outcome.kind === 'done' || outcome.kind === 'partial')
    announceTurnUndone(
      { sessionId: ask.sessionId, siteKey: ask.siteKey, turnIds: outcome.turnIds ?? [ask.turnId] },
      'target' in ask ? ask.target : defaultTarget()
    )
  // The turn ids are the event's; callers read the outcome as before.
  if (outcome.kind === 'done') return { kind: 'done' }
  if (outcome.kind === 'partial') return { kind: 'partial', unsure: outcome.unsure }
  return outcome
}

/**
 * The POST itself. A done or partial outcome also carries the turns the server's answer names
 * (`turns[].turnId`), or none when it named none.
 * @param {{ siteKey: string, sessionId: string, turnId: string, scope: 'turn' | 'from-here', idemKey?: string, fetchImpl?: typeof fetch }} ask
 * @returns {Promise<{ kind: 'done', turnIds?: string[] } | { kind: 'partial', unsure: boolean, turnIds?: string[] } | { kind: 'refused', code: string } | { kind: 'unsure', code: string }>}
 */
async function postUndo({ siteKey, sessionId, turnId, scope, idemKey, fetchImpl }) {
  const call = fetchImpl ?? globalThis.fetch.bind(globalThis)
  /** @type {Response} */
  let res
  try {
    res = await call(`/api/sites/${encodeURIComponent(siteKey)}/turns/undo`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-tracy-session': sessionId
      },
      body: JSON.stringify({ session: sessionId, turnId, scope, ...(idemKey ? { idemKey } : {}) })
    })
  } catch {
    return { kind: 'unsure', code: 'UNREACHABLE' }
  }
  const raw = /** @type {unknown} */ (await res.json().catch(() => null))
  const body = isObject(raw) ? /** @type {Record<string, any>} */ (raw) : null
  const code = text(body?.code)
  if (res.ok && body?.ok === true) {
    const turns = Array.isArray(body.turns) ? body.turns : []
    const named = turns
      .map((/** @type {any} */ t) => t?.turnId)
      .filter((/** @type {unknown} */ id) => typeof id === 'string' && id !== '')
    const turnIds = named.length > 0 ? named : undefined
    if (body.complete === true) return { kind: 'done', turnIds }
    const unsure = turns.some(
      (/** @type {any} */ t) =>
        t?.files?.status === 'unsure' ||
        (Array.isArray(t?.content?.unsure) && t.content.unsure.length > 0) ||
        (Array.isArray(t?.look?.unsure) && t.look.unsure.length > 0)
    )
    return { kind: 'partial', unsure, turnIds }
  }
  if (res.status >= 500 || (res.ok && body?.ok !== false))
    return { kind: 'unsure', code: code ?? (res.ok ? 'OUTCOME_UNKNOWN' : `HTTP_${res.status}`) }
  return { kind: 'refused', code: code ?? `HTTP_${res.status}` }
}

/**
 * The string key of the line a finished undo leaves on the card, or null when the re-read card
 * says it all (done; or refused because the turn is blocked or no longer the latest, which the
 * fresh answer draws as such).
 * @param {UndoOutcome} outcome
 * @returns {'undo.result.partial' | 'undo.result.partialUnsure' | 'undo.result.unsure' | 'undo.result.signedOut' | 'undo.result.role' | 'undo.result.busy' | 'undo.result.other' | null}
 */
export function outcomeKey(outcome) {
  switch (outcome.kind) {
    case 'done':
      return null
    case 'partial':
      return outcome.unsure ? 'undo.result.partialUnsure' : 'undo.result.partial'
    case 'unsure':
      return 'undo.result.unsure'
    default:
      break
  }
  switch (outcome.code) {
    case 'BLOCKED':
    case 'NOT_LATEST':
    // The server found nothing left to undo: the card is behind the site, and the re-read it does
    // after every answer redraws it.
    case 'NOTHING_TO_UNDO':
      return null
    case 'NOT_SIGNED_IN':
    case 'NO_VIEWER':
      return 'undo.result.signedOut'
    case 'FORBIDDEN_WRITE':
    case 'TOOLSET_NOT_GRANTED':
    case 'SEAT_NOT_AUTHORIZED':
      return 'undo.result.role'
    case 'SITE_BUSY':
      return 'undo.result.busy'
    default:
      return 'undo.result.other'
  }
}

// ── What a turn changed, and why it cannot be undone (was `tracy-chat-input` `turn-card.mjs`) ──

/** File zones in the order the card names them (`webroot-zones.cjs`); others read "Other files". */
const ZONES = /** @type {const} */ (['design', 'function', 'addons', 'content', 'core', 'system'])
/** @type {Record<string, StringKey>} */
const ZONE_KEY = {
  design: 'undo.zone.design',
  function: 'undo.zone.function',
  addons: 'undo.zone.addons',
  content: 'undo.zone.content',
  core: 'undo.zone.core',
  system: 'undo.zone.system'
}
/** How many content targets the line names before "+N more". */
const TARGETS_SHOWN = 3
const CMS_NAME = /** @type {Record<string, string>} */ ({
  wordpress: 'WordPress',
  joomla: 'Joomla',
  emdash: 'EmDash'
})

/**
 * The word a record's kind is named by, keyed by the kind as the write stored it, lower-cased. The
 * kinds are the ones writes really carry: the WordPress plugin's `SiteWriter::KINDS` (`post`,
 * `postmeta`, `option`, `templatePart`, `template`, `term`, `menuItem`), the Joomla plugin's
 * (`article`, `category`, `tag`, `menuItem`, `menutype`, `module`, `templateStyle`, `field`, …),
 * and an EmDash collection slug (`posts`, `pages`; the `/changed` door's `writeTargetOf`), plus the
 * CMS names the Site changes tab maps the same way (`activity-v2.ts` `UNIT_OF`).
 *
 * Two kinds name more than one thing, so they get a word that says so rather than a wrong one:
 * WordPress keeps pages, posts and navigation menus under one `post` kind (the post type is not
 * in the target), and categories and tags under one `term`. A kind this list does not know is
 * "an item": an EmDash site's own collection (`services`, `team`) is a slug in its owner's
 * language, never a word the reader's language can be trusted to hold.
 */
const KIND_WORD = /** @type {Record<string, string>} */ ({
  posts: 'post',
  page: 'page',
  pages: 'page',
  post: 'postOrPage',
  article: 'article',
  articles: 'article',
  category: 'category',
  categories: 'category',
  tag: 'tag',
  tags: 'tag',
  term: 'categoryOrTag',
  menu: 'menu',
  menutype: 'menu',
  nav_menu: 'menu',
  wp_navigation: 'menu',
  menuitem: 'menuItem',
  menu_item: 'menuItem',
  module: 'module',
  templatepart: 'templatePart',
  wp_template_part: 'templatePart',
  template: 'template',
  wp_template: 'template',
  media: 'media',
  attachment: 'media',
  image: 'media',
  option: 'setting',
  options: 'setting',
  setting: 'setting',
  settings: 'setting',
  extensionparams: 'setting',
  templatestyle: 'setting',
  field: 'field',
  fieldvalue: 'field',
  postmeta: 'field',
  userprofile: 'profile',
  usermeta: 'profile',
  entry: 'entry',
  entries: 'entry'
})
/** A write that named no kind is still named by what its action reaches (`media.delete` names an id only). */
const ACTION_WORD = /** @type {Record<string, string>} */ ({
  'media.upload': 'media',
  'media.delete': 'media',
  'site.identity': 'setting',
  'template.siteSettings': 'setting',
  'template.languageOverrides': 'setting'
})
/** The words whose kind is too broad to stand before a title: a titled one reads the title alone. */
const UNTITLED_ONLY = new Set(['postOrPage', 'categoryOrTag', 'item'])

/**
 * The card for turn `n`, or null for no card: the door has no row for it, or the turn changed
 * nothing on the site.
 * @param {TurnsAnswer} answer
 * @param {number} n - dsh's turn number (`TurnLocation.turn`).
 * @returns {Card | null}
 */
export function cardOf(answer, n) {
  const turn = answer.turns.find((t) => t.turn === n)
  if (turn === undefined || !turn.changed || turn.undo.state === 'none') return null
  const { state, latest, reasons } = turn.undo
  if (state === 'undone') return { kind: 'undone', turn }
  // EmDash keeps no receipts and no file history: the card says what changed and offers only
  // Ask Tracy to revert, whatever else is going on (ADR 0024 §3).
  if (answer.cms === 'emdash' || reasons.some((r) => r.code === 'NO_UNDO_ON_EMDASH'))
    return { kind: 'emdash', turn }
  /** @type {Action} */
  const action = latest ? 'undo' : 'goBack'
  if (state === 'available')
    return { kind: 'ready', turn, action, later: latest ? 0 : laterTurns(answer, n).length }
  const first = reasons[0]
  if (first?.code === 'TURN_OPEN') return { kind: 'disabled', turn, action, note: { key: 'undo.working' } }
  if (first?.code === 'MISSING_TOOLSET')
    return {
      kind: 'disabled',
      turn,
      action,
      note: { key: first.toolset === 'content' ? 'undo.needsContent' : 'undo.needsCode' }
    }
  return { kind: 'blocked', turn, ask: true }
}

/**
 * The turns of the chat after `n` that a Go back to here undoes with it: those that changed the
 * site and are not undone yet, newest last.
 * @param {TurnsAnswer} answer
 * @param {number} n
 * @returns {Turn[]}
 */
export function laterTurns(answer, n) {
  return answer.turns.filter(
    (t) => t.turn > n && t.changed && (t.undo.state === 'available' || t.undo.state === 'blocked')
  )
}

/**
 * How one content target reads to the customer, in the reader's language: the kind's word and the
 * title (`page “Home”`) when the write kept a title, else the kind's word alone (`a post`), and "an
 * item" for a kind `KIND_WORD` does not know. 🔒 NEVER A RECORD ID (council D1, 20/10/2026): the card
 * said "Content · article 4" — the CMS's raw kind and a number nobody can look up from the chat.
 * The title is a label the host read from the same record (`x-tracy-write-title` on the Apply door);
 * it decides nothing about what is undone.
 * @param {Target} target
 * @param {Say} say
 * @param {string | null} [action] - the write's action, which names the kind when the target does not.
 * @returns {string}
 */
export function targetText(target, say, action = null) {
  // Own keys only: a kind is data from the site, and `constructor` must read "an item", not Object's.
  const own = (/** @type {Record<string, string>} */ map, /** @type {string | null} */ key) =>
    key !== null && Object.hasOwn(map, key) ? map[key] : undefined
  const unit =
    own(KIND_WORD, target.kind === null ? null : target.kind.toLowerCase()) ??
    own(ACTION_WORD, action) ??
    'item'
  if (target.title !== null)
    return UNTITLED_ONLY.has(unit)
      ? say('undo.named.any', { title: target.title })
      : say(/** @type {StringKey} */ (`undo.named.${unit}`), { title: target.title })
  return say(/** @type {StringKey} */ (`undo.unnamed.${unit}`))
}

/**
 * The words of a turn's named content writes, one per RECORD (the same record written twice is
 * one), in the order first met. Records that read the same (two untitled posts are both "a post")
 * are said once and counted in `repeats`, so the line never says "a post, a post".
 * @param {ContentWrite[]} content
 * @param {Say} say
 * @returns {{ words: string[], repeats: number, unnamed: boolean }}
 */
function contentWords(content, say) {
  /** @type {Set<string>} */
  const records = new Set()
  /** @type {string[]} */
  const words = []
  let repeats = 0
  let unnamed = false
  for (const write of content) {
    if (write.target === null) {
      unnamed = true
      continue
    }
    const t = write.target
    const record = JSON.stringify(t.id === null ? [t.kind, null, t.title] : [t.kind, t.id])
    if (records.has(record)) continue
    records.add(record)
    const said = targetText(t, say, write.action)
    if (words.includes(said)) repeats += 1
    else words.push(said)
  }
  return { words, repeats, unnamed }
}

/**
 * The "what changed" line: `Design · 2 files` for files, `Content · a post` or `Content · page
 * “Home”` for page edits, `Design · Additional CSS` for a WordPress look, joined by "; ". Empty when
 * the turn named none (the server then says why it can't undo).
 * @param {Turn} turn
 * @param {Say} say
 * @returns {string}
 */
export function whatOf(turn, say) {
  /** @type {string[]} */
  const parts = []
  if (turn.files.count > 0) {
    const names = Object.keys(turn.files.zones)
    const known = ZONES.filter((z) => names.includes(z)).map((z) =>
      say(/** @type {StringKey} */ (ZONE_KEY[z]))
    )
    if (names.some((z) => !(/** @type {readonly string[]} */ (ZONES).includes(z))))
      known.push(say('undo.zone.other'))
    const files = say(turn.files.count === 1 ? 'undo.files.one' : 'undo.files.other', {
      count: turn.files.count
    })
    parts.push(known.length > 0 ? `${known.join(', ')} · ${files}` : files)
  }
  const { words, repeats } = contentWords(turn.content, say)
  if (words.length > 0) {
    const shown = words.slice(0, TARGETS_SHOWN)
    const more = words.length - shown.length + repeats
    if (more > 0) shown.push(say('undo.more', { count: more }))
    parts.push(`${say('undo.part.content')} · ${shown.join(', ')}`)
  } else if (turn.content.length > 0) parts.push(say('undo.part.content'))
  if ((turn.look ?? []).length > 0) parts.push(say('undo.part.look'))
  return parts.join('; ')
}

/**
 * What an undo of this turn puts back, one item per line of a confirm dialog's "Puts back:" list:
 * the files (`Design · 2 files`, as `whatOf` says them), then each content target by name
 * (`page “Home”`, `a post`) with "+N more" for records that read the same, then "Content" once for
 * writes that named none, then the WordPress look once (`Design · Additional CSS`). Empty when the
 * turn named none.
 * @param {Turn} turn
 * @param {Say} say
 * @returns {string[]}
 */
export function putsBackOf(turn, say) {
  /** @type {string[]} */
  const items = []
  if (turn.files.count > 0) items.push(whatOf({ ...turn, content: [] }, say))
  const { words, repeats, unnamed } = contentWords(turn.content, say)
  items.push(...words)
  if (repeats > 0) items.push(say('undo.more', { count: repeats }))
  if (unnamed) items.push(say('undo.part.content'))
  if ((turn.look ?? []).length > 0) items.push(say('undo.part.look'))
  return items
}

/**
 * The one sentence a blocked card says, from the first reason the server gives (it orders them).
 * `CONTENT_CHANGED_AFTER` names who, what and when as far as the record holds them.
 * @param {Reason | undefined} reason
 * @param {string | null} cms - the answer's `cms`.
 * @param {Say} say - the reader's translator: the record the sentence names is said in their words.
 * @param {(iso: string) => string} [timeOf] - how a time reads in the reader's language.
 * @returns {Words}
 */
export function reasonWords(reason, cms, say, timeOf = (iso) => iso) {
  const str = (/** @type {unknown} */ v) => (typeof v === 'string' && v !== '' ? v : null)
  const time = (/** @type {unknown} */ v) => {
    const iso = str(v)
    return iso === null || Number.isNaN(Date.parse(iso)) ? null : timeOf(iso)
  }
  switch (reason?.code) {
    case 'CONTENT_CHANGED_AFTER': {
      const target = /** @type {Target | null} */ (
        typeof reason.target === 'object' && reason.target !== null
          ? {
              kind: str(/** @type {any} */ (reason.target).kind),
              id: str(String(/** @type {any} */ (reason.target).id ?? '')),
              title: str(/** @type {any} */ (reason.target).title)
            }
          : null
      )
      // A reason that names no record at all keeps the generic sentence, never "an item was edited".
      const what =
        target === null || (target.kind === null && target.id === null && target.title === null)
          ? ''
          : targetText(target, say)
      const at = time(reason.at)
      const by = str(reason.by)
      const platform = cms === null ? null : (CMS_NAME[cms] ?? null)
      if (what === '' || at === null) return { key: 'undo.blocked.content' }
      if (reason.via === 'cms-admin' && platform !== null)
        return by === null
          ? { key: 'undo.blocked.contentAdminNoBy', params: { what, cms: platform, time: at } }
          : { key: 'undo.blocked.contentAdmin', params: { what, cms: platform, by, time: at } }
      if (reason.via === 'tracy')
        return by === null
          ? { key: 'undo.blocked.contentTracyNoBy', params: { what, time: at } }
          : { key: 'undo.blocked.contentTracy', params: { what, by, time: at } }
      return { key: 'undo.blocked.content' }
    }
    case 'FILES_CHANGED_AFTER': {
      const files = Array.isArray(reason.files)
        ? reason.files.filter((f) => typeof f === 'string' && f !== '')
        : []
      if (files.length === 0) return { key: 'undo.blocked.filesNoList' }
      const shown = files.slice(0, TARGETS_SHOWN).join(', ')
      return {
        key: 'undo.blocked.files',
        params: { files: files.length > TARGETS_SHOWN ? `${shown} +${files.length - TARGETS_SHOWN}` : shown }
      }
    }
    case 'RESTORED_AFTER': {
      const at = time(reason.at)
      return at === null
        ? { key: 'undo.blocked.restoredNoTime' }
        : { key: 'undo.blocked.restored', params: { time: at } }
    }
    // The site's Additional CSS (a WordPress look) was changed after it, by Tracy or in the admin.
    case 'LOOK_CHANGED_AFTER':
      return { key: 'undo.blocked.look' }
    case 'NOT_RECORDED':
      return {
        key:
          reason.part === 'content'
            ? 'undo.blocked.notRecordedContent'
            : reason.part === 'look'
              ? 'undo.blocked.notRecordedLook'
              : 'undo.blocked.notRecordedFiles'
      }
    case 'LATER_TURN_BLOCKED':
      return { key: 'undo.blocked.later' }
    // Its files or writes are shared with another request (one apply id across turns, two turns open
    // at once): one sentence. A turn whose opening seal did not land in time (`cause: 'unsealed'`) is
    // not known to share anything with another request — what is true is that its start was not
    // recorded, so its file changes cannot be told from earlier ones (dskeepjo, 09/10/2026: the
    // Joomla seal outlived the door's wait and the card said "mixed with another request's").
    case 'SHARED_CHANGE':
      // A whole-site build's first turn (`cause: 'built'`) made the site itself: there is no earlier site to go back to.
      return {
        key:
          reason.cause === 'unsealed'
            ? 'undo.blocked.unsealed'
            : reason.cause === 'built'
              ? 'undo.blocked.built'
              : 'undo.blocked.shared'
      }
    default:
      return { key: 'undo.blocked.other', params: { code: reason?.code ?? 'UNKNOWN' } }
  }
}
