/**
 * How a turn of the conversation on screen is going — the chat's half of the fork's Refresh button
 * (stage 6 of "Comment → edit", contract `tasks/evidence/comment-people/contract.md` §H2; rule 10 of
 * the story file: progress lives on Refresh, never on the page).
 *
 * Until stage 6 this module coloured each numbered pin by what the agent did for that number, and
 * said it as `tracy:comment-status` (working / done / failed / asked, the question, the answer line).
 * Comments carry no status any more (Brian 29/09: a Send to Tracy is a chat message, and Tracy answers
 * in the chat), so that event, the answer-line reader, the question splitter and the stuck-turn
 * `asked` are gone. What is left is four facts about the TURN, each said on `window` as
 * `{sessionId, requestId, siteKey}`:
 *
 *   `tracy:tracy-working`  a turn has started (a Send to Tracy's message opened it, or any turn of a
 *                          conversation standing in this page's site began — see below), or goes on
 *                          after the person answered its question card;
 *   `tracy:tracy-asking`   the turn waits on the person: it asked a question card (`ask_user_question`)
 *                          — Refresh stops spinning until it is answered (stage 6 acceptance F3);
 *   `tracy:site-changed`   a write of `tracy_site` / `tracy_emdash` in that turn went through — the
 *                          sender's Refresh can offer the new version;
 *   `tracy:turn-end`       the turn ended (or was let go after {@link DROP_MS} without an end, so the
 *                          Refresh button never spins forever).
 *
 * 🔒 THE SESSION'S OWN EVENTS, APPENDS ONLY. The same feed `tracy-site-tabs` `site-reload.mjs` reads
 * (`ctx.sessions.binding(id).eventSource`): on a seat no `running` flag and no `emit` frame arrives,
 * and the event stream is the one live feed (measured 23/09 there). Only `kind === 'append'` is news;
 * a `replace` (the history loaded on arrival or after a reconnect) and a `prepend` (older history
 * scrolled into view) carry turns long over.
 *
 * 🔒 A REQUEST IS TIED TO ITS TURN BY ITS TEXT, AND ONLY WHEN THE TURN TAKES IT. `comment-send.mjs`
 * files every turn it sends in `sentTurns` (requestId → `{sessionId, siteKey, text}`); the
 * `user/message` whose text is exactly that turn — in that session, typed by a person — binds the
 * request to the turn then running. A queued request therefore says working when its own turn starts,
 * never earlier. The message may reach this feed before the sender has filed it (the send is awaited
 * on the other side), so an unmatched message is tried again on every later event of the same turn.
 *
 * 🔒 EVERY TURN OF THE CONVERSATION ON SCREEN, NOT ONLY A SEND TO TRACY (fix/refresh-chat-turns,
 * 30/09/2026). Brian typed a task in the chat of a conversation on r1e1734; Tracy wrote the site several
 * times in that turn, and the Browser tab's Refresh said "New version ready" mid-turn: the fork's 15 s
 * poll saw Tracy's own write while the tab, never told a turn had started, was idle. So a turn that no
 * sent request binds is said too, as a CHAT TURN (`requestId` `turn:<sessionId>:<n>`), when the session
 * stands in the site this page is the workspace of (`siteOf`: its `cwd` is `/site/<label>` and the label
 * is the first part of the page's site key); a conversation on another site, or on none, says nothing.
 * It opens at the first event after `turn/start` (normally the message), so a Send to Tracy's message
 * binds its request first and is said once, under its own id; a request filed only after its message
 * landed takes the chat turn over without a second `working` (the fork would drop the turn's writes).
 * The seam is here and not in the fork because this module already reads the one live feed a seat has
 * and already knows which calls write; the fork's reducer (`refresh-progress.ts`) needed nothing new:
 * a poll change while `working` is ignored, and the turn end reloads once (the site tabs' request of the
 * same change is absorbed). History loaded again (a `replace`, e.g. the conversation reopened after a
 * switch) never opens a turn, but a `turn/end` in it closes one still open, so no spinner stays.
 *
 * 🔒 WHICH CALLS ARE WRITES is each door's own reading, restated for the page (the door's tables live
 * in host code that reads the disk, `tracy-site-tools` `site-context.mjs` / `site.mjs`
 * `canonicalCall` / `emdash.mjs`); a test holds it equal to the preview reload's `callChangedSite`.
 * - `tracy_site`: `content.replace` and `content.update`, `content.contract` with an operation that
 *   writes (`contract.apply` alias included; inspect / `*.plan` / `*.verify` read), `apply.revert`, and
 *   `content.delete` / `content.batch` / `media.delete`; a `dryRun` writes nothing.
 * - `tracy_emdash`: every EmDash tool EmDash does not mark read-only (`EMDASH_READS` below, 22 of 59
 *   on 0.38), and any tool a later EmDash adds that is not a read. Dotted names are the same tool
 *   (`content.update`). Not writes: `{list:true}`, `page.text` / `page.look` (answered as
 *   `tracy_site`'s page reads) and the receipt door names, which EmDash does not have.
 * Whether one went through is the result's: `isError`, dsh's error identity, or a JSON answer whose
 * own `ok` is false. A call whose `arguments` cannot be read is judged from its result: a receipt
 * (`applyId` / `apply_id` / `undo`) stands for a write. Which comment number a write names does not
 * matter here: any write of the bound turn changed the site. A LOOK change (acceptance F2) is written
 * with a file tool or a shell, and counts when its result carries the look-undo note (`LOOK_TOOLS`).
 *
 * The tracker is pure (`createTurnProgressTracker`: changes in, events out); `watchTurnProgress` is
 * the thin wiring `index.tsx` runs. The parsers of old comment turns live in `comment-turn.mjs` and
 * still read every turn sent before stage 6.
 */
import { mainSessionOf } from '@tracy/core/session'
import * as commentSend from './comment-send.mjs'

export const WORKING_EVENT = 'tracy:tracy-working'
export const SITE_CHANGED_EVENT = 'tracy:site-changed'
export const TURN_END_EVENT = 'tracy:turn-end'
export const ASKING_EVENT = 'tracy:tracy-asking'
/**
 * The Browser tab asks whether a turn runs in its conversation (round 9, V5S-3): it dispatches this with
 * `detail = { sessionId }`, synchronously, and reads `detail.running` back — `true` / `false` when the
 * conversation is the one on screen and its window has events, left unset otherwise (nobody knows).
 */
export const TURN_STATE_EVENT = 'tracy:turn-state'

/** dsh's question card: the turn stops until the person answers it (its `tool/result`). */
const QUESTION_TOOL = 'ask_user_question'

/**
 * @typedef {{ readonly sessionId: string, readonly siteKey?: string, readonly text: string }} SentTurn
 *   one turn `comment-send.mjs` sent: its session, its site, its exact text.
 * @typedef {{ entries(): Iterable<[string, SentTurn]> }} SentTurns
 *   requestId → SentTurn; a `Map` (`sentTurns` in `comment-send.mjs`).
 * @typedef {typeof WORKING_EVENT | typeof SITE_CHANGED_EVENT | typeof TURN_END_EVENT | typeof ASKING_EVENT} ProgressEvent
 * @typedef {{ sessionId: string, requestId: string, siteKey: string }} ProgressDetail
 * @typedef {{ readonly kind?: string, readonly entries?: readonly ({ readonly type?: string, readonly event?: { readonly type?: string, readonly data?: any } } | undefined)[] }} EventChange
 *   one change of a session's event window — dsh's `SessionEventChange`, the fields read here.
 * @typedef {{ getSnapshot(): { readonly revision?: number, readonly change?: EventChange }, subscribe(listener: () => void): () => void }} EventSourceLike
 * @typedef {{
 *   readonly list: {
 *     getSnapshot(): { readonly byId: Readonly<Record<string, { readonly retainedBy?: Readonly<Partial<Record<string, number>>> } | undefined>> },
 *     subscribe(listener: () => void): () => void
 *   },
 *   binding?(id: string): { readonly eventSource?: EventSourceLike } | undefined
 * }} SessionsLike
 */

/** The two doors that write a site: `tracy_site`, and `tracy_emdash` on an EmDash site. */
const DOORS = new Set(['tracy_site', 'tracy_emdash'])

/** Request ids remembered as bound, so a turn's text sent again later never re-binds an old request. */
const REMEMBERED = 256

/** Actions that change the site whatever their params (a `dryRun` aside). */
const WRITES = new Set([
  'content.replace',
  'content.update',
  'content.delete',
  'media.delete',
  'content.batch',
  'apply.revert',
  // Acceptance F2: putting a look change back rewrites the site's stylesheet (`site-context.mjs` classes it `write`).
  'look.revert'
])

/**
 * The dsh tools a LOOK change is written through (acceptance F2): the agent edits a template's
 * stylesheet with a file tool or a shell, not a door, and `tracy-site-tools` then appends the undo
 * note to that result (`look-undo.mjs` `lookUndoNote`: a text block `undo: <6 hex> — …`). That note,
 * on a result with no error, is the one sign the site's look changed; any other file write here is
 * not read as one (a note-less edit may be anything the agent keeps beside the site).
 */
const LOOK_TOOLS = new Set(['write', 'edit', 'str_replace_editor', 'bash', 'pwsh'])

/** The first line of the look-undo note: `undo: ` and the six hex digits of its id. */
const LOOK_UNDO_NOTE = /^undo: [0-9a-f]{6}\b/

/** `canonicalCall`'s aliases that name the contract (`tracy-site-tools` `site.mjs` `ACTION_ALIASES`). */
const CONTRACT_ALIASES = /** @type {Record<string, string | null>} */ ({
  content_contract: null,
  contract: null,
  'contract.inspect': 'inspect',
  'content.contract.inspect': 'inspect',
  'contract.apply': 'apply',
  'content.contract.apply': 'apply'
})

/** @param {unknown} value @returns {Record<string, unknown> | null} */
function objectOf(value) {
  let v = value
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? /** @type {Record<string, unknown>} */ (v)
    : null
}

/** @param {unknown} v */
const absent = (v) => v === undefined || v === null

/**
 * EmDash 0.38's read-only tools (`readOnlyHint`) — `tracy-site-tools` `emdash.mjs` `EMDASH_READ_TOOLS`,
 * restated because that file is host code; `test/comment-status.test.mjs` holds the two readings equal
 * over all 59 tools of the pinned catalogue.
 */
const EMDASH_READS = new Set([
  'content_list',
  'content_get',
  'content_compare',
  'content_list_trashed',
  'content_translations',
  'byline_list',
  'byline_get',
  'byline_translations',
  'schema_list_collections',
  'schema_get_collection',
  'media_list',
  'media_get',
  'search',
  'taxonomy_list',
  'taxonomy_get',
  'taxonomy_list_terms',
  'taxonomy_term_translations',
  'menu_list',
  'menu_get',
  'menu_translations',
  'revision_list',
  'settings_get'
])

/** Names `tracy_emdash` answers without reaching an EmDash tool: `tracy_site`'s page reads, the receipt door. */
const EMDASH_NOT_TOOLS = new Set([
  'page.text',
  'page_text',
  'page.look',
  'page_look',
  'apply.list',
  'apply_list',
  'apply.revert',
  'apply_revert'
])

/**
 * Whether a `tracy_emdash` call reaches an EmDash tool that writes, read through the door's own shape
 * repair (`normalizeEmdashShape`): `{list:true}` lists; `args`/`params`/`input` stand for `arguments`;
 * the whole call nested again inside `arguments` is the inner one; `content.update` is `content_update`.
 * @param {Record<string, unknown>} a
 * @returns {boolean}
 */
function emdashWrites(a) {
  if (a.list === true) return false
  let tool = typeof a.tool === 'string' ? a.tool.trim() : ''
  let inner = a.arguments
  if (inner === undefined)
    inner = ['args', 'params', 'input'].map((k) => objectOf(a[k])).find((v) => v !== null)
  const nested = objectOf(inner)
  const same = (/** @type {string} */ x, /** @type {string} */ y) =>
    x.trim().replace(/[.-]/g, '_') === y.trim().replace(/[.-]/g, '_')
  if (
    nested &&
    typeof nested.tool === 'string' &&
    objectOf(nested.arguments) &&
    (tool === '' || same(nested.tool, tool))
  )
    tool = tool === '' ? nested.tool.trim() : tool
  if (tool === '' || EMDASH_NOT_TOOLS.has(tool)) return false
  return !EMDASH_READS.has(tool.replace(/[.-]/g, '_'))
}

/**
 * Whether a `tracy_site` or `tracy_emdash` call asks to change the site, read as its door reads it.
 * @param {string} name - the tool.
 * @param {Record<string, unknown>} args
 * @returns {boolean}
 */
export function callWrites(name, args) {
  if (name === 'tracy_emdash') return emdashWrites(args)
  const asked = typeof args.action === 'string' ? args.action.trim() : ''
  const params = objectOf(args.params) ?? {}
  const dry = !absent(params.dryRun)
    ? params.dryRun
    : !absent(params.dry_run)
      ? params.dry_run
      : (args.dryRun ?? args.dry_run)
  if (dry === true) return false
  if (asked === 'content.contract' || Object.hasOwn(CONTRACT_ALIASES, asked)) {
    const op = !absent(params.operation)
      ? params.operation
      : !absent(args.operation)
        ? args.operation
        : (CONTRACT_ALIASES[asked] ?? null)
    const o = typeof op === 'string' ? op.trim() : ''
    return o !== '' && o !== 'inspect' && !/\.(plan|verify)$/.test(o)
  }
  return WRITES.has(asked)
}

/** @param {unknown} content @returns {string[]} */
function textsOf(content) {
  return Array.isArray(content)
    ? content.flatMap((part) => (part && typeof part.text === 'string' ? [part.text] : []))
    : []
}

/**
 * The answer JSON objects of one `tool/result`, the echo line skipped.
 * @param {any} data
 * @returns {Record<string, unknown>[]}
 */
function answersOf(data) {
  return textsOf(data?.message?.content).flatMap((text) => {
    const a = objectOf(text)
    return a === null ? [] : [a]
  })
}

/** @param {any} data @returns {boolean} */
function wentThrough(data) {
  if (data?.message?.isError === true || data?.error !== undefined) return false
  return !answersOf(data).some((a) => a.ok === false)
}

/** @param {any} data @returns {string | null} */
function resultCallId(data) {
  const id = data?.message?.toolCallId ?? data?.message?.source?.callId ?? data?.callId
  return typeof id === 'string' ? id : null
}

/** @param {any} data @returns {string} */
function messageText(data) {
  return textsOf(data?.content).join('\n')
}

/** After this, a request whose turn never ended is let go, with its `tracy:turn-end`. */
export const DROP_MS = 60 * 60_000

/**
 * How recent a still-running turn must be to be caught up when a window picks the feed up after it
 * started (a `replace`, or the first follow of a session): stage-6 acceptance S12 (30/09) — the window
 * that SENT a chat task began following the conversation only because the prompt changed the sessions
 * list, took the running turn's `turn/start` and message as history, and never said the turn. An
 * unfinished turn older than this (a turn whose end the log never got) stays history, so no Refresh
 * button spins for {@link DROP_MS}.
 */
export const FRESH_TURN_MS = 15 * 60_000

/** How often the tracker's own timer looks at open requests. */
const TICK_MS = 30_000

/**
 * @typedef {{ requestId: string, sessionId: string, siteKey: string, turn: number | null, boundAt: number, chat?: true }} Bound
 *   a request whose turn is running; `chat`: a turn no sent request bound (a chat turn).
 * @typedef {{ revision: number | undefined, turn: number | null, unmatched: string[], starting: boolean,
 *   calls: Map<string, boolean | null | 'look'>, results: Set<string>, asks: Set<string> }} SessionState
 *   `starting`: a `turn/start` was seen and the turn is not said yet (its first event says it);
 *   `calls`: callId → whether the call writes (null: arguments unreadable, the result decides;
 *   `'look'`: a file tool or shell, a site change only when its result carries the look-undo note);
 *   `asks`: the question cards of the turn still waiting for an answer.
 */

/**
 * The events of a window's entries, in order.
 * @param {NonNullable<EventChange['entries']>} entries
 * @returns {{ type: string, data?: any, time?: unknown }[]}
 */
function eventsOf(entries) {
  return entries.flatMap((e) =>
    e?.type === 'event' && e.event && typeof e.event.type === 'string' ? [/** @type {any} */ (e.event)] : []
  )
}

/**
 * Whether a turn runs at the end of these events: the last turn mark is a `turn/start`.
 * @param {{ type: string }[]} events
 * @returns {boolean}
 */
function turnRuns(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === 'turn/end') return false
    if (events[i].type === 'turn/start') return true
  }
  return false
}

/**
 * The pure state machine: feed it each session's `eventSource` snapshots; it says the three events.
 * @param {{
 *   sentTurns: SentTurns,
 *   emit: (type: ProgressEvent, detail: ProgressDetail) => void,
 *   siteOf?: (sessionId: string) => string | null,
 *   now?: () => number,
 *   every?: (fn: () => void, ms: number) => () => void
 * }} deps
 * @returns {{
 *   feed(sessionId: string, snapshot: { revision?: number, change?: EventChange } | undefined): void,
 *   catchUp(sessionId: string, entries: EventChange['entries']): void,
 *   reconcile(sessionId: string, entries: EventChange['entries']): void,
 *   tick(): void,
 *   dispose(): void
 * }} `catchUp`: read a window picked up mid-turn — the running turn, if fresh, as if it just arrived.
 */
export function createTurnProgressTracker({
  sentTurns,
  emit,
  siteOf = () => null,
  now = () => Date.now(),
  every = (fn, ms) => {
    const id = setInterval(fn, ms)
    // Never what keeps a process alive (Node tests, a host that imports this): the page has its own loop.
    const handle = /** @type {{ unref?: () => void }} */ (/** @type {unknown} */ (id))
    handle.unref?.()
    return () => clearInterval(id)
  }
}) {
  /** @type {Map<string, SessionState>} */
  const sessions = new Map()
  /** Requests bound to a running turn, by requestId. @type {Map<string, Bound>} */
  const open = new Map()
  /** @type {Set<string>} */
  const bound = new Set()
  /** @type {(() => void) | null} */
  let cancelTimer = null

  /** @param {string} id @returns {SessionState} */
  const stateOf = (id) => {
    let s = sessions.get(id)
    if (!s) {
      s = {
        revision: undefined,
        turn: null,
        unmatched: [],
        starting: false,
        calls: new Map(),
        results: new Set(),
        asks: new Set()
      }
      sessions.set(id, s)
    }
    return s
  }

  /** @param {ProgressEvent} type @param {Bound} b */
  const say = (type, b) => emit(type, { sessionId: b.sessionId, requestId: b.requestId, siteKey: b.siteKey })

  /** The timer runs while a request is open, and only then. */
  const idle = () => {
    if (open.size === 0 && cancelTimer !== null) {
      cancelTimer()
      cancelTimer = null
    }
  }

  /** @param {Bound} b */
  const end = (b) => {
    open.delete(b.requestId)
    say(TURN_END_EVENT, b)
  }

  const tick = () => {
    const at = now()
    for (const b of open.values()) if (at - b.boundAt >= DROP_MS) end(b)
    idle()
  }

  /** @param {Bound} b */
  const opened = (b) => {
    open.set(b.requestId, b)
    if (cancelTimer === null) cancelTimer = every(tick, TICK_MS)
    say(WORKING_EVENT, b)
  }

  /** Say the turn just started as a chat turn, when the session stands in this page's site. @param {string} sessionId @param {SessionState} s */
  const openChat = (sessionId, s) => {
    if (!s.starting) return
    s.starting = false
    const siteKey = siteOf(sessionId)
    if (typeof siteKey !== 'string' || siteKey === '') return
    opened({
      requestId: `turn:${sessionId}:${s.turn ?? ''}`,
      sessionId,
      siteKey,
      turn: s.turn,
      boundAt: now(),
      chat: true
    })
  }

  /** Bind the first unbound sent turn of this session whose text is `text`. @param {string} sessionId @param {SessionState} s @param {string} text */
  const bind = (sessionId, s, text) => {
    for (const [requestId, turn] of sentTurns.entries()) {
      if (bound.has(requestId) || turn?.sessionId !== sessionId || turn.text !== text) continue
      bound.add(requestId)
      while (bound.size > REMEMBERED) bound.delete(/** @type {string} */ (bound.values().next().value))
      s.starting = false
      // Already said as a chat turn (its request was filed after the message landed): the request
      // takes that turn over, silently — a second `working` would make the fork forget its writes.
      const chat = ofTurn(sessionId, s.turn).find((b) => b.chat === true)
      if (chat !== undefined) {
        open.delete(chat.requestId)
        open.set(requestId, { ...chat, requestId, chat: undefined })
        return true
      }
      /** @type {Bound} */
      const b = {
        requestId,
        sessionId,
        siteKey: typeof turn.siteKey === 'string' ? turn.siteKey : '',
        turn: s.turn,
        boundAt: now()
      }
      opened(b)
      return true
    }
    return false
  }

  /** Try the turn's unmatched messages again (the sender may have filed its turn since). @param {string} sessionId @param {SessionState} s */
  const retry = (sessionId, s) => {
    if (s.unmatched.length === 0) return
    s.unmatched = s.unmatched.filter((text) => !bind(sessionId, s, text))
  }

  /** The open requests of this session's `turn` (one bound before any turn number took the first). @param {string} sessionId @param {number | null} turn */
  const ofTurn = (sessionId, turn) =>
    [...open.values()].filter((b) => b.sessionId === sessionId && (b.turn === turn || b.turn === null))

  /** @param {string} sessionId @param {SessionState} s @param {{ type?: string, data?: any }} event */
  const step = (sessionId, s, event) => {
    const data = event.data ?? {}
    const turn = typeof data.turn === 'number' ? data.turn : null
    if (turn !== null && event.type !== 'turn/end') {
      if (event.type === 'turn/start' && turn !== s.turn) s.unmatched = []
      if (event.type === 'turn/start' && !ofTurn(sessionId, turn).some((b) => b.turn === turn))
        s.starting = true
      s.turn = turn
      // A request bound before any turn number was seen takes the first one that arrives.
      for (const b of open.values()) if (b.sessionId === sessionId && b.turn === null) b.turn = turn
    }
    switch (event.type) {
      case 'user/message': {
        const kind = data.source?.kind
        if (kind !== undefined && kind !== 'user') return
        const text = messageText(data)
        if (!bind(sessionId, s, text)) {
          s.unmatched.push(text)
          openChat(sessionId, s)
        }
        return
      }
      case 'tool/call': {
        retry(sessionId, s)
        openChat(sessionId, s)
        const callId = typeof data.callId === 'string' ? data.callId : null
        if (callId !== null && data.name === QUESTION_TOOL && !s.asks.has(callId)) {
          s.asks.add(callId)
          for (const b of ofTurn(sessionId, s.turn)) say(ASKING_EVENT, b)
          return
        }
        if (callId === null || s.calls.has(callId)) return
        if (LOOK_TOOLS.has(data.name)) {
          s.calls.set(callId, 'look')
          return
        }
        if (!DOORS.has(data.name)) return
        const args = objectOf(data.arguments)
        s.calls.set(callId, args === null ? null : callWrites(data.name, args))
        return
      }
      case 'tool/result': {
        openChat(sessionId, s)
        const callId = resultCallId(data)
        if (callId !== null && s.asks.delete(callId)) {
          // Answered (or dismissed): the turn goes on.
          for (const b of ofTurn(sessionId, s.turn)) say(WORKING_EVENT, b)
          return
        }
        if (callId === null || s.results.has(callId) || !s.calls.has(callId)) return
        s.results.add(callId)
        const known = s.calls.get(callId)
        const write =
          known === 'look'
            ? textsOf(data?.message?.content).some((text) => LOOK_UNDO_NOTE.test(text.trim()))
            : (known ??
              answersOf(data).some((a) => !absent(a.applyId) || !absent(a.apply_id) || !absent(a.undo)))
        if (!write || !wentThrough(data)) return
        for (const b of ofTurn(sessionId, s.turn)) say(SITE_CHANGED_EVENT, b)
        return
      }
      case 'turn/end': {
        retry(sessionId, s)
        // A turn that ended before saying anything (no message, no call) was nothing to show.
        s.starting = false
        for (const b of ofTurn(sessionId, turn ?? s.turn)) end(b)
        idle()
        s.unmatched = []
        s.calls.clear()
        s.results.clear()
        s.asks.clear()
        return
      }
      default:
    }
  }

  /**
   * Round 9 (acceptance v5 V5S-3): what an open request missed while its conversation was not followed.
   * Only the conversation on screen is followed, so a turn that went on — or ended — while the person
   * looked at another conversation told its (hidden, still mounted) Browser tab nothing, and back on
   * screen the window holding the finished turn was read as history: Refresh spun for {@link DROP_MS}.
   * Now each request still open in this session replays its own turn from the window (after its
   * `turn/start`, to its `turn/end` or the window's end): the writes it missed, then its end. Reading
   * what was already said says nothing again (a call's result is read once, a request binds once). A
   * request whose turn is no longer in the window ends when no turn runs there.
   * @param {string} sessionId
   * @param {EventChange['entries']} entries
   */
  const reconcile = (sessionId, entries) => {
    if (!Array.isArray(entries)) return
    const events = eventsOf(entries)
    const s = stateOf(sessionId)
    for (const b of open.values()) {
      if (b.sessionId !== sessionId || !open.has(b.requestId)) continue
      const start =
        b.turn === null ? -1 : events.findIndex((e) => e.type === 'turn/start' && e.data?.turn === b.turn)
      if (start === -1) {
        if (!turnRuns(events)) end(b)
        continue
      }
      for (const event of events.slice(start + 1)) {
        step(sessionId, s, event)
        if (!open.has(b.requestId)) break
      }
    }
    idle()
  }

  /**
   * The events of the turn still running at the end of `entries` — its `turn/start` (no `turn/end`
   * after it, started within {@link FRESH_TURN_MS}) and everything after — read as news. Reading a turn
   * already said says nothing again: a bound request is not bound twice, a call's result is read once.
   * @param {string} sessionId
   * @param {EventChange['entries']} entries
   */
  const catchUp = (sessionId, entries) => {
    if (!Array.isArray(entries)) return
    const events = eventsOf(entries)
    let start = -1
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i].type === 'turn/end') break
      if (events[i].type === 'turn/start') {
        start = i
        break
      }
    }
    if (start === -1) return
    const at = /** @type {{ time?: unknown }} */ (events[start]).time
    if (typeof at !== 'number' || !Number.isFinite(at) || now() - at > FRESH_TURN_MS) return
    const s = stateOf(sessionId)
    for (const event of events.slice(start)) step(sessionId, s, event)
  }

  return {
    catchUp,
    reconcile,
    feed(sessionId, snapshot) {
      if (typeof sessionId !== 'string') return
      const s = stateOf(sessionId)
      const revision = snapshot?.revision
      if (revision !== undefined && revision === s.revision) return
      s.revision = revision
      const change = snapshot?.change
      if (!Array.isArray(change?.entries)) return
      if (change.kind === 'replace') {
        // History is not news, but the turn a request is still open on is: what it missed is said,
        // and its end closes it (round 9, V5S-3 — before, the end closed it without its writes).
        reconcile(sessionId, change.entries)
        // S12: a turn still running in the window loaded again is caught up, not left as history.
        catchUp(sessionId, change.entries)
        return
      }
      if (change.kind !== 'append') return
      for (const entry of change.entries)
        if (entry?.type === 'event' && entry.event && typeof entry.event.type === 'string')
          step(sessionId, s, entry.event)
    },
    tick,
    dispose() {
      cancelTimer?.()
      cancelTimer = null
    }
  }
}

/**
 * Whether a session standing in `cwd` works on the site `siteKey`. On the host's one dsh (ADR 0014)
 * a site's session stands in `/site/<label>`, and the label is the first part of the site key
 * (`tracy-site-build-core` `site-platform.mjs` `labelOfCwd`; the host reads the same folder in
 * `tracy-site-tabs` `turn.mjs` `sessionSiteKey`). The creation workspace and anything else is no site.
 * @param {unknown} cwd - the session's working directory (`sessions.list` row `cwd`).
 * @param {string} siteKey - the page's site key.
 * @returns {boolean}
 */
export function sessionOnSite(cwd, siteKey) {
  if (typeof cwd !== 'string' || typeof siteKey !== 'string') return false
  const m = /^\/site\/([A-Za-z0-9][A-Za-z0-9._-]*)\/?$/.exec(cwd.trim())
  const label = siteKey.trim().toLowerCase().split('.')[0]
  return m !== null && label !== '' && m[1].toLowerCase() === label
}

/**
 * Whether two site keys name the same site (their labels, the first part, compared without case).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameSite(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const label = (/** @type {string} */ k) => k.trim().toLowerCase().split('.')[0]
  return label(a) !== '' && label(a) === label(b)
}

/**
 * Follow the conversation on screen and say the progress of its sent turns on `target` —
 * `site-reload.mjs`'s choice (`followTurnEnds`): the session the main view SHOWS (`mainSessionOf`),
 * because only the main view retains a binding whose `eventSource` is live; a switch moves the
 * subscription. A Send to Tracy switches the column to that conversation's Chat tab, so the turn it
 * made is the one on screen. Every other turn of that conversation is said too when the session stands
 * in the site this page is the workspace of ({@link sessionOnSite}).
 * @param {{ sessions: unknown, target: EventTarget, sentTurns?: SentTurns | undefined, siteKey?: () => string | null,
 *   tabSite?: (sessionId: string) => string | null }} deps -
 *   `sentTurns` defaults to `comment-send.mjs`'s registry; none follows nothing. `siteKey`: the site
 *   this page is the workspace of (`<base href="/<siteKey>/">`); absent or null, only sent turns count.
 *   `tabSite`: the site a Browser tab of that session lists (`tracy:comment-list`), read only for a row
 *   with no `cwd` yet — a conversation dsh has just created (S12, e2e v4).
 * @returns {() => void} stop following.
 */
export function watchTurnProgress(deps) {
  const registry = Object.hasOwn(deps, 'sentTurns')
    ? deps.sentTurns
    : /** @type {{ sentTurns?: SentTurns }} */ (/** @type {unknown} */ (commentSend)).sentTurns
  const sessions = /** @type {SessionsLike | undefined} */ (deps.sessions)
  if (!registry || typeof registry.entries !== 'function' || !sessions?.list) return () => {}
  const tracker = createTurnProgressTracker({
    sentTurns: registry,
    siteOf: (id) => {
      const page = deps.siteKey?.() ?? null
      if (page === null) return null
      const row = /** @type {{ cwd?: unknown } | undefined} */ (sessions.list.getSnapshot().byId[id])
      if (sessionOnSite(row?.cwd, page)) return page
      // S12 (e2e v4): a conversation dsh just created in the site's workspace is a placeholder row with
      // no `cwd` until the host list is read again (dsh `manager.ts` `create`). Its own Browser tab says
      // which site it shows; a row that does carry a `cwd` is never overruled by it.
      if (row !== undefined && row.cwd !== undefined) return null
      return sameSite(deps.tabSite?.(id) ?? null, page) ? page : null
    },
    emit: (type, detail) => deps.target.dispatchEvent(new CustomEvent(type, { detail }))
  })
  /** @type {{ id: string, source: EventSourceLike, stop: () => void } | undefined} */
  let followed
  const follow = () => {
    const id = mainSessionOf(sessions.list.getSnapshot())
    const source = id === undefined ? undefined : sessions.binding?.(id)?.eventSource
    // The conversation on screen, read live: the same id with a new binding generation is a new feed.
    if (followed !== undefined && followed.id === id && followed.source === source) return
    followed?.stop()
    followed = undefined
    if (id === undefined) return
    if (source === undefined) return
    // What is already in the window is history — but for a turn still running in it (S12: the window
    // that sent a chat task follows the session only once the prompt changed the list), which is caught
    // up; what arrives after this is fed.
    const first = source.getSnapshot()
    const entries = /** @type {{ entries?: EventChange['entries'] }} */ (first).entries
    tracker.feed(id, { revision: first.revision, change: undefined })
    // Round 9 (V5S-3): a request left open while this conversation was not on screen takes what its
    // turn did meanwhile — its writes, its end — so its Browser tab stops spinning and offers the change.
    tracker.reconcile(id, entries)
    tracker.catchUp(id, entries)
    const stop = source.subscribe(() => tracker.feed(id, source.getSnapshot()))
    followed = { id, source, stop }
  }
  follow()
  const stopList = sessions.list.subscribe(follow)
  /** `tracy:turn-state`: whether a turn runs in the conversation on screen, read from its live window. @param {Event} event */
  const answer = (event) => {
    const detail = /** @type {CustomEvent} */ (event).detail
    if (
      detail === null ||
      typeof detail !== 'object' ||
      followed === undefined ||
      detail.sessionId !== followed.id
    )
      return
    const entries = /** @type {{ entries?: EventChange['entries'] }} */ (followed.source.getSnapshot())
      .entries
    if (!Array.isArray(entries) || entries.length === 0) return
    detail.running = turnRuns(eventsOf(entries))
  }
  deps.target.addEventListener(TURN_STATE_EVENT, answer)
  return () => {
    deps.target.removeEventListener(TURN_STATE_EVENT, answer)
    stopList()
    followed?.stop()
    followed = undefined
    tracker.dispose()
  }
}
