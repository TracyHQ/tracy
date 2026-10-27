/**
 * A chat turn tells a dsh deploy it is running, and a message sent while that deploy waits is held
 * in the conversation's queue instead of starting a turn the deploy would cut (#295).
 *
 * WHY. One dsh serves every site on a host, and every dsh deploy recreates it. Measured 24/09 on
 * `qc-hano-wp-0923-01`: a turn that had already written six changes died at 02:33Z with the site
 * half in Vietnamese and nobody told, and again at 03:51Z after 14m40s. The deploy drain existed,
 * but only imports held a lease, so it saw nothing running and recreated dsh five seconds later.
 *
 * THREE PARTS, ALL ON `$DSH_HOME`, the one folder the deploy and this process both see:
 *
 *   - A running turn holds `leases/chat-<session>.json` (`@tracy/core/lease`). The deploy waits
 *     for it like it waits for an import.
 *   - While `draining` is fresh, `api-session/prompt-hold` answers true: dsh keeps the follow-up in
 *     the session's saved next-turn queue (the customer sees it queued, can edit or remove it) and
 *     starts no turn. Refusing it instead would make the customer type it again later.
 *   - The held sessions are written to `held-prompts.json`, because the process that held them is
 *     the one the deploy replaces. The next process reads the file and releases them once the drain
 *     is over.
 *
 * 🔒 THE QUEUE MUST SURVIVE THE PROCESS THE DEPLOY REPLACES (#517). dsh disposes every live agent
 * when it stops, and its disposal is `cancel({ kind: 'disposed' })` WITHOUT `keepInbox`
 * (`@deepseek-ai/dsh-agent-loop` `prepare().dispose`), which durably cancels every queued message.
 * Seen 28/09 on dev (`qaem643`): two messages held during a 20-minute drain never ran after the
 * recreate. Reproduced against dsh's own agent loop and session store in
 * `test/deploy-hold-restart.test.mjs`: the disposal writes a cancelling splice, so the next process
 * resumes an empty queue and has nothing to release. `keepHeldInbox` turns that one cancel into a
 * `keepInbox` cancel for a session this file still holds; every other cancel (the stop button,
 * archive, a queue edit) is dsh's own.
 *
 * 🔒 A HELD MESSAGE IS FOLLOWED BY ID UNTIL ITS TURN ENDED OR ITS AUTHOR REMOVED IT. "Released 0"
 * means three things in dsh (still held, agent running, nothing pending), so a count never ends the
 * record on its own: the session's own log says what became of each message. Taken from the queue
 * by a turn is not "ran": dsh claims the message before the pre-step and before the model is asked,
 * so a process that stops in between leaves a claimed message nothing answered. Logged in its step is
 * not "ran" either: dsh builds the request after that line and may fail before asking the model.
 * Only a model answer logged after it, then the `turn/end` of its turn, ends it as run; a turn the
 * update cut after the model was asked (disposal, crash recovery), or one with no turn end and no
 * turn running, is `unknown` — never replayed, since the turn may have written to the site. Each
 * message is judged on its own: one that surely did not run is told so beside one in doubt. A removal by its author drops the id. The release's own splice (the one
 * `splice('next-turn', 0, Infinity, [])` in dsh, marked by `markReleaseSplice`) is never taken for
 * one: a message it took out and could not send back is a cancel nobody asked for, a message that
 * did not run (`failed`). A message the log cannot account for is `unknown`. Both are shown to the
 * author (`POST …/held`).
 *
 * 🔒 ONLY THE SESSION'S LOG ENDS A RECORD AS A NOTICE, NEVER A COUNT OF FAILED TRIES. A message
 * that may still run is never given up on, withdrawn or replaced: a session dsh cannot wake or
 * read stays `held` and is released again every pass, for as long as it takes, and from
 * MAX_ATTEMPTS its author is shown `delayed` ("it runs as soon as Tracy can") — not a notice asking
 * to send again, which would have the old message run beside the new one. A message the author
 * sends meanwhile simply queues behind the held one, and a turn claims them in order. Only a record
 * whose log was read and holds nothing of it in the queue any more ends as a notice (`failed`,
 * `unknown`); nothing of it can run then, so answering a notice (`supersede`: sending again, or a
 * turn starting) only ends the notice.
 *
 * 🔒 A NOTICE NOBODY SAW IS NEVER DROPPED. It stays until its author's page confirms it drew it
 * (`seen`, a second call the page makes after drawing the notice — never the answer that carried it,
 * which may not have arrived). Only after that does sending again or a turn starting end it, or
 * NOTICE_TTL_MS pass: a third message sent after the update, before the page ever asked, must not
 * wipe the notice about the two before it.
 */

// A relative path, not `@tracy/core/lease`: this plugin's host bundle keeps packages external, and
// the plugin folder the image copies has no node_modules to resolve a bare import from.
import {
  draining as defaultDraining,
  holdLease as defaultHoldLease
} from '../../../../core/tracy-core/src/lease/index.mjs'
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync
} from 'node:fs'
import path from 'node:path'

export const HELD_FILE = 'held-prompts.json'
export const HELD_VERSION = 2
/** Release passes that may fail (dsh not ready, resume refused) before the author is shown `delayed`. */
export const MAX_ATTEMPTS = 5
/**
 * How long a notice (did not run, cannot be accounted for) is kept after its author's page confirmed
 * it drew it (`seen`), unless they send again first. A notice never confirmed is kept.
 */
export const NOTICE_TTL_MS = 7 * 24 * 60 * 60_000
/**
 * A session id as dsh keys it: its own `session-…`, and the ids tracy-web gives the sessions it opens itself
 * (`opportunities-build/demo-actions.js` `wo-demo-<uuid>`, `editorial-pilot.js` `wo-editorial-…`). `session-` alone
 * refused every Website Opportunities demo chat's `/held`, ~500 times a chat (e2e dev 24/10/2026).
 */
export const SESSION_ID = /^(?:session|wo-demo|wo-editorial)-[a-z0-9-]{1,100}$/i
/** A notice's id (`randomUUID`): what the author's page names when it confirms drawing that notice. */
export const NOTICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * @typedef {'held' | 'released' | 'failed' | 'unknown'} HeldState
 * @typedef {HeldState | 'delayed' | 'unsaved'} ShownState - `delayed`: still held, dsh refused
 *   MAX_ATTEMPTS releases. `unsaved`: still held and released by this process, but a change to it
 *   could not be written down yet — it still runs; only its account after a restart may be lost.
 * @typedef {{
 *   site: string | null,
 *   heldAt: number,
 *   messages: string[],
 *   state: HeldState,
 *   attempts: number,
 *   legacy?: true,
 *   reason?: string,
 *   updatedAt: number,
 *   notice?: string,
 *   seenAt?: number,
 *   earlier?: HeldNotice[],
 *   resent?: true
 * }} HeldRecord
 * `legacy`: read from a version 1 file (#295), which named the session and none of its messages.
 * `notice`: the id of a `failed` or `unknown` record's notice (exactly those carry one), new each
 * time what it says changes, so a page's confirmation of an older one never counts for it.
 * `seenAt`: when the author's page first confirmed it drew this notice.
 * `resent`: the record's messages surely did not run once already and were sent once more
 * (`mayResend`); a second time they are told as a notice. A process from before this key reads a
 * file holding it as a failed read (a rollback while a resent message waits).
 * `earlier`: notices about an earlier deploy's messages, kept beside a newer hold or notice of the
 * same conversation until its author's page confirms drawing each, never replaced by it: at most
 * one per state, and none of the record's own state when the record is a notice (a notice of the
 * same state says the same thing, so the two become one new notice).
 * @typedef {{
 *   id: string,
 *   state: 'failed' | 'unknown',
 *   messages: string[],
 *   reason?: string,
 *   updatedAt: number,
 *   seenAt?: number
 * }} HeldNotice
 * @typedef {{ ok: true, sessions: Map<string, HeldRecord> } | { ok: false, reason: string }} HeldRead
 * @typedef {'pending' | 'claimed' | 'entered' | 'sent' | 'ran' | 'interrupted' | 'dropped' | 'canceled'} MessageFate
 * `claimed`: taken by a turn that has not logged it in a step yet; `entered`: a step logged it by id,
 * no model answer logged after it yet (the request is being built, streams, or failed — a logged
 * `assistant/attempt` is a failed request, not an answer); `sent`: a model answer was logged after
 * it, its turn not ended; `ran`: that turn ended; `interrupted`:
 * that turn was cut by something other than its author (the update's disposal, crash recovery) after
 * a step logged it, or the process stopped while its request may have been streaming; `dropped`: its
 * turn ended before any step logged it (a pre-step refused, emptied or replaced it, or a cut), or
 * ended without a cut before the model was asked (an error building the request), so the model
 * never saw it.
 * @typedef {{
 *   fates: () => Map<string, MessageFate> | undefined,
 *   resend?: (ids: string[]) => boolean
 * }} LiveSession - a session dsh has loaded: what its log says about each message, and putting
 * messages that surely did not run back at the head of its queue (`mayResend`)
 * @typedef {{ kind: 'pending' }
 *   | { kind: 'ran' }
 *   | { kind: 'failed', notRun: string[] }
 *   | { kind: 'unknown', reason: string, unsure?: string[] }
 *   | { kind: 'split', notRun: string[], unsure: string[], reason: string }} Verdict
 * `unknown.unsure`: the ids nobody can account for, when the record names its messages. `split`: some
 * of a record's messages surely did not run and others cannot be accounted for — two notices, never
 * one that says less than is known.
 */

const STATES = new Set(['held', 'released', 'failed', 'unknown'])

function home() {
  return process.env.DSH_HOME ?? process.cwd()
}

const message = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error))

/** @param {unknown} value */
const isPlain = (value) =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
/** @param {unknown} value */
const isIds = (value) => Array.isArray(value) && value.every((m) => typeof m === 'string' && m.length > 0)
/** @param {object} value @param {readonly string[]} allowed */
const onlyKeys = (value, allowed) => Object.keys(value).every((k) => allowed.includes(k))
const RECORD_KEYS = /** @type {const} */ ([
  'site',
  'heldAt',
  'messages',
  'state',
  'attempts',
  'legacy',
  'reason',
  'updatedAt',
  'notice',
  'seenAt',
  'earlier',
  'resent'
])
const NOTICE_KEYS = /** @type {const} */ (['id', 'state', 'messages', 'reason', 'updatedAt', 'seenAt'])
/** @param {unknown} value */
const isNoticeId = (value) => typeof value === 'string' && NOTICE_ID.test(value)

/**
 * One kept notice (`HeldRecord.earlier`) exactly as this file writes it, or null.
 * @param {unknown} value @returns {HeldNotice | null}
 */
function noticeOf(value) {
  if (!isPlain(value)) return null
  const n = /** @type {Record<string, unknown>} */ (value)
  if (!onlyKeys(n, NOTICE_KEYS)) return null
  if (!isNoticeId(n.id)) return null
  if (n.state !== 'failed' && n.state !== 'unknown') return null
  if (!isIds(n.messages) || !Number.isFinite(n.updatedAt)) return null
  if (n.reason !== undefined && typeof n.reason !== 'string') return null
  if (n.seenAt !== undefined && !Number.isFinite(n.seenAt)) return null
  return {
    id: /** @type {string} */ (n.id),
    state: n.state,
    messages: [.../** @type {string[]} */ (n.messages)],
    ...(typeof n.reason === 'string' ? { reason: n.reason } : {}),
    updatedAt: /** @type {number} */ (n.updatedAt),
    ...(typeof n.seenAt === 'number' ? { seenAt: n.seenAt } : {})
  }
}

/**
 * One record exactly as this file writes it, or null: a plain object with no key it does not
 * know, every field of its type.
 * @param {unknown} value @returns {HeldRecord | null}
 */
function recordOf(value) {
  if (!isPlain(value)) return null
  const r = /** @type {Record<string, unknown>} */ (value)
  if (!onlyKeys(r, RECORD_KEYS)) return null
  if (!(r.site === null || typeof r.site === 'string')) return null
  if (!isIds(r.messages)) return null
  if (typeof r.state !== 'string' || !STATES.has(r.state)) return null
  if (!Number.isFinite(r.heldAt) || !Number.isInteger(r.attempts) || !Number.isFinite(r.updatedAt))
    return null
  if (/** @type {number} */ (r.attempts) < 0) return null
  if (r.reason !== undefined && typeof r.reason !== 'string') return null
  if (r.legacy !== undefined && r.legacy !== true) return null
  if (r.seenAt !== undefined && !Number.isFinite(r.seenAt)) return null
  if (r.resent !== undefined && r.resent !== true) return null
  // A notice record, and only one, carries its notice's id.
  const noticeRecord = r.state === 'failed' || r.state === 'unknown'
  if (noticeRecord ? !isNoticeId(r.notice) : r.notice !== undefined) return null
  /** @type {HeldNotice[] | undefined} */
  let earlier
  if (r.earlier !== undefined) {
    if (!Array.isArray(r.earlier) || r.earlier.length === 0) return null
    earlier = []
    for (const value of r.earlier) {
      const n = noticeOf(value)
      if (n === null) return null
      earlier.push(n)
    }
    // At most one per state, none of a notice record's own.
    const states = earlier.map((n) => n.state)
    if (new Set(states).size !== states.length) return null
    if (noticeRecord && states.includes(/** @type {'failed' | 'unknown'} */ (r.state))) return null
  }
  return {
    site: /** @type {string | null} */ (r.site),
    heldAt: /** @type {number} */ (r.heldAt),
    messages: [.../** @type {string[]} */ (r.messages)],
    state: /** @type {HeldState} */ (r.state),
    attempts: /** @type {number} */ (r.attempts),
    ...(typeof r.reason === 'string' ? { reason: r.reason } : {}),
    ...(r.legacy === true ? { legacy: /** @type {true} */ (true) } : {}),
    updatedAt: /** @type {number} */ (r.updatedAt),
    ...(noticeRecord ? { notice: /** @type {string} */ (r.notice) } : {}),
    ...(typeof r.seenAt === 'number' ? { seenAt: r.seenAt } : {}),
    ...(earlier ? { earlier } : {}),
    ...(r.resent === true ? { resent: /** @type {true} */ (true) } : {})
  }
}

/**
 * The held sessions as the last process left them.
 *
 * 🔒 ONLY A MISSING FILE IS AN EMPTY LIST, AND ONLY THE TWO SHAPES EVER WRITTEN ARE READ. An empty,
 * unparsable or other-shaped file (an array where a map belongs, a key nobody writes, one bad
 * entry), or a path that is not a plain file (a symlink, a FIFO a read would block on, a
 * directory), is a failed read: the caller keeps it as evidence and holds nothing new, because
 * writing an empty list over it would erase the one record of whose messages are waiting.
 *
 * @param {string} [dir]
 * @param {number} [now]
 * @returns {HeldRead}
 */
export function readHeldFile(dir = home(), now = Date.now()) {
  const file = path.join(dir, HELD_FILE)
  let text
  try {
    const stat = lstatSync(file)
    if (!stat.isFile()) return { ok: false, reason: `${file} is not a plain file` }
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT')
      return { ok: true, sessions: new Map() }
    return { ok: false, reason: `${file}: ${message(error)}` }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { ok: false, reason: `${file}: ${message(error)}` }
  }
  /** @type {Map<string, HeldRecord>} */
  const sessions = new Map()
  const bad = (/** @type {string} */ what) => ({
    ok: /** @type {const} */ (false),
    reason: `${file}: ${what}`
  })
  if (!isPlain(parsed)) return bad('not a held file')
  // Version 1 (#295): `{ sessions: [<session id>…] }`, nothing about their messages or their site.
  // The first process carrying #517 reads one written by the process it replaced; its site is
  // learned when dsh loads the session (`place`), its messages when the release sends them again.
  if (!('version' in parsed)) {
    if (!onlyKeys(parsed, ['sessions']) || !Array.isArray(parsed.sessions))
      return bad('not a version 1 held file')
    for (const id of parsed.sessions) {
      if (typeof id !== 'string' || !SESSION_ID.test(id)) return bad(`bad entry ${JSON.stringify(id)}`)
      sessions.set(id, {
        site: null,
        heldAt: now,
        messages: [],
        state: 'held',
        attempts: 0,
        legacy: true,
        updatedAt: now
      })
    }
    return { ok: true, sessions }
  }
  if (
    parsed.version !== HELD_VERSION ||
    !onlyKeys(parsed, ['version', 'sessions']) ||
    !isPlain(parsed.sessions)
  )
    return bad(`not a version ${HELD_VERSION} held file`)
  for (const [id, value] of Object.entries(parsed.sessions)) {
    const record = recordOf(value)
    if (!SESSION_ID.test(id) || record === null) return bad(`bad entry for ${JSON.stringify(id)}`)
    sessions.set(id, record)
  }
  return { ok: true, sessions }
}

/**
 * Write every byte of `buffer`: `writeSync` may write fewer than asked, and a file renamed into
 * place after a short write is a cut record the next process cannot read.
 * @param {number} fd @param {Buffer} buffer
 * @param {(fd: number, buffer: Buffer, offset: number, length: number) => number} [write]
 */
export function writeAll(fd, buffer, write = writeSync) {
  let offset = 0
  while (offset < buffer.length) {
    const n = write(fd, buffer, offset, buffer.length - offset)
    if (!Number.isInteger(n) || n <= 0)
      throw new Error(`short write: ${offset} of ${buffer.length} bytes written`)
    offset += n
  }
}

/**
 * Write the held sessions: a fresh temp file (`wx`, so nothing already at that name — a symlink
 * planted there — is followed), written whole and flushed, then renamed over the old one, so a
 * process killed mid-write leaves the previous list whole.
 *
 * @param {Map<string, HeldRecord>} sessions
 * @param {string} [dir]
 * @param {{ write?: (fd: number, buffer: Buffer, offset: number, length: number) => number }} [io]
 * @returns {string | null} null when saved, else why not
 */
export function writeHeldFile(sessions, dir = home(), { write = writeSync } = {}) {
  const file = path.join(dir, HELD_FILE)
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  let fd = null
  try {
    const bytes = Buffer.from(
      JSON.stringify({ version: HELD_VERSION, sessions: Object.fromEntries(sessions) }),
      'utf8'
    )
    mkdirSync(dir, { recursive: true })
    fd = openSync(tmp, 'wx', 0o600)
    writeAll(fd, bytes, write)
    fsyncSync(fd)
    closeSync(fd)
    fd = null
    renameSync(tmp, file)
    return null
  } catch (error) {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {}
    }
    rmSync(tmp, { force: true })
    return `${file}: ${message(error)}`
  }
}

/**
 * Whether a `turn/end` reason is a turn cut by something other than its author: the update's
 * disposal, a parent or hook cancel, crash recovery closing an open turn (`interrupted`), a fork cut.
 * The author's own stop, an error dsh showed, a completed or blocked turn are all an answer.
 * @param {unknown} reason
 */
const cut = (reason) => {
  const r = /** @type {{ kind?: unknown, reason?: { kind?: unknown } } | null | undefined} */ (reason)
  if (r?.kind === 'aborted') return r.reason?.kind !== 'user'
  return r?.kind === 'interrupted' || r?.kind === 'forked'
}

/**
 * Where each message of a session's queue went, read from the session's own log: `pending` while it
 * waits in either inbox list, `canceled` once somebody removed or replaced it. A turn taking it (the
 * splice without `outcome` is dsh's `inbox.claim`, made before the pre-step and the model call) makes
 * it `claimed` — not yet run: the pre-step may still refuse it (`blocked`), fail, empty the entry or
 * replace it with other messages. A `user/message` carrying that message's own id makes it `entered`
 * (dsh logs the step's entered batch after `prepareRequest`) — still not run: dsh builds the request
 * after that line and may fail there, before any model call. Only a model answer logged after it in
 * the same turn (`assistant/message`) shows the model answered it: `sent`. An `assistant/attempt` is
 * no such evidence — dsh writes it for any stream that failed once started, a stream middleware
 * throwing before the model was reached as much as a model that refused or cut the request, and no
 * tool ran from it; a retry that then answers logs its `assistant/message`. A `step/start` names no
 * message, so it is evidence for none.
 *
 * The turn's `turn/end` then settles each: `sent` becomes `ran`, or `interrupted` when the end says
 * the turn was cut (`cut`); `claimed` becomes `dropped` whatever the reason — no step ever logged it.
 * `entered` becomes `dropped` when the turn ended without a cut (an error building the request, or a
 * request that failed with no answer), and `interrupted` when it was cut or has no end (the process stopped: a new turn
 * starts over it), since dsh logs nothing while a request streams. A
 * message sent back into the queue (a release re-queues, a queue row moved to steering) is pending
 * again, so the last event decides.
 *
 * @param {readonly { type?: string, data?: any }[]} events - `session.snapshotEvents()`
 * @returns {Map<string, MessageFate>}
 */
export function messageFates(events) {
  /** @type {Map<string, MessageFate>} */
  const fates = new Map()
  /** @type {Record<string, string[]>} */
  const lists = { 'next-turn': [], 'next-step': [] }
  /** Messages the open turn took, waiting for its end. @type {string[]} */
  let open = []
  /**
   * @param {boolean} wasCut - the turn was cut, or its end is missing
   * @param {boolean} ended - the turn logged its end (false: the process stopped inside it)
   */
  const endTurn = (wasCut, ended) => {
    for (const id of open) {
      const fate = fates.get(id)
      if (fate === 'claimed') fates.set(id, 'dropped')
      // An end that is not a cut (an error building the request, a request that failed with no
      // answer) left it unanswered, and no tool ran from it; a cut may
      // have come while the request streamed, which dsh logs nothing for.
      else if (fate === 'entered') fates.set(id, ended && !wasCut ? 'dropped' : 'interrupted')
      else if (fate === 'sent') fates.set(id, wasCut ? 'interrupted' : 'ran')
    }
    open = []
  }
  for (const event of events) {
    if (event?.type === 'agent/inbox/spliced') {
      const { target, start, removedCount = 0, inserted = [], outcome } = event.data ?? {}
      const list = lists[target]
      if (!list || !Number.isInteger(start)) continue
      const removed = list.splice(start, removedCount, ...inserted.map((/** @type {any} */ m) => m?.id))
      for (const id of removed) {
        if (typeof id !== 'string') continue
        if (outcome === 'canceled') fates.set(id, 'canceled')
        else {
          fates.set(id, 'claimed')
          if (!open.includes(id)) open.push(id)
        }
      }
      for (const m of inserted) if (typeof m?.id === 'string') fates.set(m.id, 'pending')
    } else if (event?.type === 'user/message' && typeof event.data?.id === 'string') {
      // The entered batch itself: a message logged with no claim before it (older logs) went in too.
      const id = event.data.id
      if (fates.get(id) === 'ran') continue
      fates.set(id, 'entered')
      if (!open.includes(id)) open.push(id)
    } else if (event?.type === 'assistant/message') {
      // The model answered: every message this turn entered so far went to it. A failed attempt
      // (`assistant/attempt`) is no answer and leaves them `entered`.
      for (const id of open) if (fates.get(id) === 'entered') fates.set(id, 'sent')
    } else if (event?.type === 'turn/start') {
      // A turn that starts over an open one lost its end (the process stopped): cut, never "ran".
      endTurn(true, false)
    } else if (event?.type === 'turn/end') {
      endTurn(cut(event.data?.reason), true)
    }
  }
  return fates
}

export const GONE = 'the held message is no longer in the conversation'
export const CUT = 'the update stopped Tracy while it was working on the held message'
export const NOT_RUN = 'the held message never reached Tracy after the update'

/**
 * What a session's log says about the messages a record follows, message by message.
 *
 * - `pending`: one still waits in the queue — for a record that names none, anything waits in it
 *   (it may be theirs) — or one is taken by the turn running now (`claimed`, `entered` or `sent`).
 * - Otherwise each message is either unsure or did not run (or ran):
 *   - unsure: one the log never saw (`GONE`); or one that may have reached the model in a turn the
 *     update cut, or that never ended and is not running (the process stopped between the step and
 *     the answer) — it may have run in part, so it is never replayed (`CUT`). A record that names
 *     none (a version 1 record, or a hold whose message id could not be written down) with nothing
 *     queued is unsure as a whole.
 *   - did not run: cancelled without its author asking (a release that failed half way, a disposal
 *     that cleared the queue), or taken by a turn that ended — or stopped, nothing running it now —
 *     before the model was asked (a pre-step refused it, an error building the request). An
 *     author's own removal never gets here: it drops the id from the record (`removed`).
 * - `unknown` when every one not run is unsure, `failed` when none is unsure and some did not run,
 *   `split` when both kinds are there — each told as its own notice; `ran` when all ran.
 *
 * @param {Pick<HeldRecord, 'messages'>} record
 * @param {Map<string, MessageFate>} seen - `messageFates` of the session
 * @param {boolean} [running] - whether the session's agent is running a turn now
 * @returns {Verdict}
 */
export function verdict(record, seen, running = false) {
  const ids = record.messages
  const fates = ids.length === 0 ? [...seen.values()] : ids.map((id) => seen.get(id))
  if (fates.includes('pending')) return { kind: 'pending' }
  if (running && (fates.includes('claimed') || fates.includes('entered') || fates.includes('sent')))
    return { kind: 'pending' }
  if (ids.length === 0) return { kind: 'unknown', reason: GONE }
  const gone = ids.filter((id) => seen.get(id) === undefined)
  const unsure = ids.filter((id) => {
    const fate = seen.get(id)
    return fate === undefined || fate === 'entered' || fate === 'sent' || fate === 'interrupted'
  })
  // `claimed` with nothing running: its turn stopped before a step took it.
  const notRun = ids.filter((id) => {
    const fate = seen.get(id)
    return fate === 'canceled' || fate === 'dropped' || fate === 'claimed'
  })
  const reason = gone.length > 0 ? GONE : CUT
  if (unsure.length > 0 && notRun.length > 0) return { kind: 'split', notRun, unsure, reason }
  if (unsure.length > 0) return { kind: 'unknown', reason, unsure }
  return notRun.length > 0 ? { kind: 'failed', notRun } : { kind: 'ran' }
}

/**
 * Where a message stopped that may be sent once more: taken out of the queue without its author
 * asking (a release that failed half way, a disposal that cleared the queue), or taken by a turn
 * that stopped before any step logged it. Both are the update's doing, and the model never saw the
 * message. `dropped` is not: a turn ended before the model was asked — a pre-step refused it or the
 * request could not be built — and would end the same way again.
 */
const RESENDABLE = new Set(['canceled', 'claimed'])

/**
 * Whether the messages a `failed` verdict names are sent once more instead of told as a notice
 * (#1403 item 11). Only once per record (`resent`), only for messages the update stopped before the
 * model saw them (`RESENDABLE`), and only while the author wrote nothing after them: a message they
 * sent since is their answer, and the notice tells them what did not run before it.
 * @param {Pick<HeldRecord, 'messages' | 'resent' | 'legacy'>} record
 * @param {Verdict} v
 * @param {Map<string, MessageFate>} seen - `messageFates` of the session, in the order the log
 *   first named each message
 */
export function mayResend(record, v, seen) {
  if (v.kind !== 'failed' || record.resent === true || record.legacy === true) return false
  if (!v.notRun.every((id) => RESENDABLE.has(/** @type {string} */ (seen.get(id))))) return false
  const order = [...seen.keys()]
  const last = Math.max(...record.messages.map((id) => order.indexOf(id)))
  if (last < 0) return false
  return order.slice(last + 1).every((id) => record.messages.includes(id))
}

/**
 * The messages `ids` as the log last queued them (`agent/inbox/spliced` `inserted`), in `ids`
 * order; null when the log does not hold every one.
 * @param {readonly { type?: string, data?: any }[]} events
 * @param {readonly string[]} ids
 * @returns {object[] | null}
 */
export function queuedMessages(events, ids) {
  /** @type {Map<string, object>} */
  const last = new Map()
  for (const event of events) {
    if (event?.type !== 'agent/inbox/spliced' || !Array.isArray(event.data?.inserted)) continue
    for (const m of event.data.inserted)
      if (typeof m?.id === 'string' && ids.includes(m.id)) last.set(m.id, m)
  }
  const found = ids.map((id) => last.get(id))
  return found.every((m) => m !== undefined) ? /** @type {object[]} */ (found) : null
}

const KEEP = Symbol.for('tracy.site-tools.keep-held-inbox')

/**
 * Make dsh's disposal of this agent keep its queue while `keeps()` says the session is held (#517).
 *
 * dsh's disposal calls `cancel({ kind: 'disposed' })` on the agent object it published — the same
 * object `agents.get` and `agent/created` hand out — so an own `cancel` on that object is what the
 * disposal calls. Only that one cause is changed; installed once per agent, and a later call only
 * swaps the question it asks (a plugin reload must not stack wrappers).
 *
 * @param {unknown} agent
 * @param {() => boolean} keeps
 * @returns {boolean} whether the agent now keeps a held queue through disposal
 */
export function keepHeldInbox(agent, keeps) {
  const a = /** @type {{ cancel?: unknown, [KEEP]?: { keeps: () => boolean } } | null} */ (agent)
  if (typeof a !== 'object' || a === null || typeof a.cancel !== 'function') return false
  const installed = a[KEEP]
  if (installed) {
    installed.keeps = keeps
    return true
  }
  const original = /** @type {(cause: unknown, options?: { keepInbox?: boolean }) => void} */ (a.cancel)
  const state = { keeps }
  /** @this {unknown} @param {{ kind?: unknown } | undefined} cause @param {{ keepInbox?: boolean }} [options] */
  function cancel(cause, options = {}) {
    if (cause?.kind === 'disposed' && options?.keepInbox !== true && state.keeps())
      return original.call(this, cause, { ...options, keepInbox: true })
    return original.call(this, cause, options)
  }
  Object.defineProperty(a, 'cancel', { value: cancel, configurable: true, writable: true })
  Object.defineProperty(a, KEEP, { value: state })
  return true
}

const RELEASING = Symbol.for('tracy.site-tools.release-splice')

/**
 * Mark the one splice that is dsh's release (#517): `releaseHeldPrompts` empties the next-turn queue
 * with `splice('next-turn', 0, Infinity, [])` and sends each message back, and that call is the only
 * one in dsh with an `Infinity` count on that list (an author's removal, an edit and dsh's own
 * `clear()` all count what they take). While it runs, `releaseSplicing(agent)` is true, so the
 * `agent/inbox/discarded` it emits — synchronously, inside the call — is known for the release's and
 * never for its author's removal: a message it took out and could not send back is then a message
 * that did not run, told to its author, not dropped as removed.
 *
 * Installed once per agent, on the inbox object dsh's release calls (its own `splice`, which dsh's
 * `remove` and `replace` also reach through `this`).
 *
 * @param {unknown} agent
 * @returns {boolean} whether the agent's release splice is now marked
 */
export function markReleaseSplice(agent) {
  const inbox = /** @type {{ splice?: unknown, [RELEASING]?: { on: boolean } } | undefined} */ (
    /** @type {{ inbox?: unknown } | null} */ (agent)?.inbox
  )
  if (typeof inbox !== 'object' || inbox === null || typeof inbox.splice !== 'function') return false
  if (inbox[RELEASING]) return true
  const original = /** @type {(...args: unknown[]) => unknown} */ (inbox.splice)
  const state = { on: false }
  /** @this {unknown} @param {unknown[]} args */
  function splice(...args) {
    const [target, start, count, inserted] = args
    const release =
      target === 'next-turn' &&
      start === 0 &&
      count === Infinity &&
      Array.isArray(inserted) &&
      inserted.length === 0
    if (!release || state.on) return original.apply(this, args)
    state.on = true
    try {
      return original.apply(this, args)
    } finally {
      state.on = false
    }
  }
  Object.defineProperty(inbox, 'splice', { value: splice, configurable: true, writable: true })
  Object.defineProperty(inbox, RELEASING, { value: state })
  return true
}

/**
 * Whether dsh's release splice (`markReleaseSplice`) of this agent is running right now.
 * @param {unknown} agent
 */
export function releaseSplicing(agent) {
  const inbox = /** @type {{ [RELEASING]?: { on: boolean } } | undefined} */ (
    /** @type {{ inbox?: unknown } | null} */ (agent)?.inbox
  )
  return inbox?.[RELEASING]?.on === true
}

/**
 * The session an agent event is about: the key `agent/status` and `user-questions/request` share.
 * @param {{ id?: unknown, session?: { id?: unknown } } | null | undefined} agent
 * @returns {string | null}
 */
export function chatSessionId(agent) {
  const id = agent?.id ?? agent?.session?.id
  return typeof id === 'string' ? id : null
}

/**
 * The chat half of the deploy lease: one lease per running session, released when it stops.
 *
 * 🔒 A TURN WAITING ONLY ON ITS CUSTOMER HOLDS NO LEASE (#561). dsh's `agent/status` has two
 * values, `idle` and `running` (`@deepseek-ai/dsh-agent` `AgentStatus`), and a turn paused in
 * `ask_user_question` stays `running` until the answer comes. Measured 29/09 on dev: one such turn,
 * on a site deleted half an hour earlier, held a deploy for the full 1200 s drain. `waitingForUser`
 * releases the lease while the question is pending and takes it again before the turn goes on
 * working; the question's own lifetime is the `user-questions/request` waterfall
 * (`questionLeaseWaterfall`).
 *
 * @param {{ holdLease?: typeof defaultHoldLease }} [deps]
 */
export function chatLeases({ holdLease = defaultHoldLease } = {}) {
  /**
   * One running turn per session: its lease, or null while every question it asked is pending.
   * @type {Map<string, { siteKey: string, lease: { release(): void } | null, waiting: number }>}
   */
  const turns = new Map()
  /** @param {string} sessionId @param {string} siteKey */
  const take = (sessionId, siteKey) => holdLease(`chat-${sessionId}`, { kind: 'chat', siteKey, sessionId })
  return {
    /**
     * One `agent/status` change. `siteKey` is null for a conversation outside any site's
     * workspace; such a turn holds no lease.
     * @param {string} sessionId @param {string} status @param {string | null} siteKey
     */
    status(sessionId, status, siteKey) {
      if (status === 'running') {
        if (turns.has(sessionId) || siteKey === null) return
        turns.set(sessionId, { siteKey, lease: take(sessionId, siteKey), waiting: 0 })
        return
      }
      turns.get(sessionId)?.lease?.release()
      turns.delete(sessionId)
    },
    /**
     * The session's running turn asked its customer a question and now waits on the answer only:
     * its lease goes until the returned `resume` is called (once the question settled, answered or
     * not). `resume` is idempotent, and takes the lease back only for the turn that asked: a turn
     * that ended meanwhile (idle, cancel, disposal) or was replaced by a later one is left alone.
     * A session with no running turn in a site holds nothing and gets a no-op.
     * @param {string} sessionId
     * @returns {() => void} resume
     */
    waitingForUser(sessionId) {
      const turn = turns.get(sessionId)
      if (turn === undefined) return () => {}
      turn.waiting++
      turn.lease?.release()
      turn.lease = null
      let settled = false
      return () => {
        if (settled) return
        settled = true
        turn.waiting--
        if (turns.get(sessionId) !== turn || turn.waiting > 0 || turn.lease !== null) return
        turn.lease = take(sessionId, turn.siteKey)
      }
    },
    /** The sessions holding a lease right now. @returns {string[]} */
    running() {
      return [...turns].filter(([, turn]) => turn.lease !== null).map(([sessionId]) => sessionId)
    },
    releaseAll() {
      for (const turn of turns.values()) turn.lease?.release()
      turns.clear()
    }
  }
}

/**
 * The `user-questions/request` listener that lets a turn's lease go while its question is pending
 * (`chatLeases` says why). dsh awaits the whole waterfall inside the `ask_user_question` call
 * (`@deepseek-ai/dsh-user-questions` `ask`), so the chain's settling is the moment the turn goes on.
 * It must be registered with `prepend`, outside every answerer: a listener behind the one that
 * answers is never called. It delegates exactly once and changes nothing of the answer or the error.
 * `ask_user_question` runs alone in its step (it declares no `isConcurrencySafe`), so no other tool
 * call of the turn works while the lease is gone; a subagent's turn is its own session with its own lease.
 *
 * @param {Pick<ReturnType<typeof chatLeases>, 'waitingForUser'>} chats
 * @returns {(request: { agent?: unknown } | null | undefined, next: () => Promise<unknown>) => Promise<unknown>}
 */
export function questionLeaseWaterfall(chats) {
  return async (request, next) => {
    const sessionId = chatSessionId(/** @type {Parameters<typeof chatSessionId>[0]} */ (request?.agent))
    if (sessionId === null) return next()
    const resume = chats.waitingForUser(sessionId)
    try {
      return await next()
    } finally {
      resume()
    }
  }
}

/**
 * The hold half: which sessions have a follow-up waiting for the drain to end, and letting them go.
 *
 * @param {{
 *   draining?: () => boolean,
 *   dir?: string,
 *   warn?: (line: string) => void,
 *   now?: () => number
 * }} [deps]
 */
export function heldPrompts({
  draining = defaultDraining,
  dir = home(),
  warn = console.warn,
  now = Date.now
} = {}) {
  const read = readHeldFile(dir, now())
  /** Why the file could not be read; while set, nothing new is held and the file is never written. */
  const broken = read.ok ? null : read.reason
  if (broken) warn(`[site-tools] held follow-ups unreadable, holding nothing new: ${broken}`)
  /** @type {Map<string, HeldRecord>} */
  const sessions = read.ok ? read.sessions : new Map()
  /**
   * Sessions whose held messages changed after the last write that failed: the next process would
   * not know them, so their authors are not told "will run" while it stays so. Every pass writes
   * again; the first write that lands empties it.
   * @type {Set<string>}
   */
  const unsaved = new Set()
  /** @param {string} [sessionId] - the session whose change this write carries @returns {string | null} */
  const save = (sessionId) => {
    if (broken) return broken
    const failed = writeHeldFile(sessions, dir)
    if (failed) {
      warn(`[site-tools] could not write held follow-ups: ${failed}`)
      if (sessionId !== undefined) unsaved.add(sessionId)
    } else unsaved.clear()
    return failed
  }
  /** @param {HeldRecord} record @param {HeldState} state @param {string} [reason] */
  const settle = (record, state, reason) => {
    record.state = state
    record.updatedAt = now()
    if (reason === undefined) delete record.reason
    else record.reason = reason
    // A notice says something new: a new id, not yet drawn.
    delete record.seenAt
    if (state === 'failed' || state === 'unknown') record.notice = randomUUID()
    else delete record.notice
  }
  /** @param {HeldRecord} record */
  const isNotice = (record) => record.state === 'failed' || record.state === 'unknown'
  /**
   * What the author is shown. A record still followed is `unsaved` while the next process would
   * not know all of it (this process still releases it: it runs, and must not be sent again), and
   * `delayed` while dsh keeps refusing its release (MAX_ATTEMPTS and on) — it still runs once dsh
   * can run it. Neither is settled: the next pass may change it. Only a notice says `unknown`.
   * @param {string} sessionId @param {HeldRecord} record @returns {ShownState}
   */
  const shown = (sessionId, record) => {
    if (isNotice(record)) return record.state
    if (unsaved.has(sessionId)) return 'unsaved'
    return record.attempts >= MAX_ATTEMPTS ? 'delayed' : record.state
  }
  /** @param {LiveSession | undefined} live @returns {Map<string, MessageFate> | undefined} */
  const fatesOf = (live) => {
    try {
      return live?.fates()
    } catch (error) {
      warn(`[site-tools] held follow-ups: the conversation could not be read: ${message(error)}`)
      return undefined
    }
  }
  /**
   * The record of `sessionId`, for a page standing in `site` (see `status`), or undefined.
   * @param {string} sessionId @param {string | null | undefined} site
   */
  const mine = (sessionId, site) => {
    const record = sessions.get(sessionId)
    if (!record || (site !== undefined && record.site !== null && record.site !== site)) return undefined
    return record
  }
  /**
   * Settle a record by its verdict; a `pending` one is left as it is.
   * @param {string} sessionId @param {HeldRecord} record @param {Verdict} v
   * @returns {boolean} whether the record changed
   */
  const conclude = (sessionId, record, v) => {
    if (v.kind === 'pending') return false
    const kept = record.earlier ?? []
    delete record.earlier
    if (v.kind === 'ran') {
      // What is left to say is only the earlier notices, if any.
      promote(sessionId, record, kept)
      return true
    }
    /** A second notice of this pass, beside the record (`split`): the unsure messages. @type {HeldNotice | null} */
    let beside = null
    if (v.kind === 'failed' || v.kind === 'split') {
      record.messages = v.notRun
      settle(record, 'failed', NOT_RUN)
      warn(`[site-tools] held follow-ups of ${sessionId} did not run: ${record.reason}`)
    } else {
      if (v.unsure) record.messages = v.unsure
      settle(record, 'unknown', v.reason)
      warn(`[site-tools] held follow-ups of ${sessionId} cannot be accounted for: ${record.reason}`)
    }
    if (v.kind === 'split') {
      beside = { id: randomUUID(), state: 'unknown', messages: v.unsure, reason: v.reason, updatedAt: now() }
      warn(`[site-tools] other held follow-ups of ${sessionId} cannot be accounted for: ${v.reason}`)
    }
    // A kept notice of the same state says the same thing: one notice for both, the earlier
    // messages first, under the new id (its author has seen neither in this form). `failed` and
    // `unknown` never fold into one another: each state is its own line.
    const same = kept.find((n) => n.state === record.state)
    if (same) record.messages = [...same.messages, ...record.messages]
    let rest = kept.filter((n) => n !== same)
    if (beside) {
      const b = beside
      const sameAsBeside = rest.find((n) => n.state === b.state)
      if (sameAsBeside) b.messages = [...sameAsBeside.messages, ...b.messages]
      rest = [...rest.filter((n) => n !== sameAsBeside), b]
    }
    if (rest.length > 0) record.earlier = rest
    return true
  }
  /**
   * The session's record becomes its first kept notice, the others kept beside it; or it ends, when
   * there is none: the hold or notice it replaces ended with nothing more to say.
   * @param {string} sessionId @param {HeldRecord} record - the ending record @param {HeldNotice[]} kept
   */
  const promote = (sessionId, record, kept) => {
    const [first, ...rest] = kept
    if (!first) {
      sessions.delete(sessionId)
      return
    }
    sessions.set(sessionId, {
      site: record.site,
      heldAt: record.heldAt,
      messages: [...first.messages],
      state: first.state,
      attempts: 0,
      ...(first.reason === undefined ? {} : { reason: first.reason }),
      updatedAt: now(),
      notice: first.id,
      ...(first.seenAt === undefined ? {} : { seenAt: first.seenAt }),
      ...(rest.length > 0 ? { earlier: rest } : {})
    })
  }
  /**
   * The notices of `record` to keep beside a new hold: every kept one, and the record's own when it
   * is a notice its author's page has not confirmed drawing (a confirmed one is answered by the new
   * message, `supersede`).
   * @param {HeldRecord | undefined} record @returns {HeldNotice[]}
   */
  const keptNotices = (record) => {
    if (!record) return []
    const kept = [...(record.earlier ?? [])]
    if (!isNotice(record) || record.seenAt !== undefined || record.notice === undefined) return kept
    kept.push({
      id: record.notice,
      state: /** @type {'failed' | 'unknown'} */ (record.state),
      messages: [...record.messages],
      ...(record.reason === undefined ? {} : { reason: record.reason }),
      updatedAt: record.updatedAt
    })
    return kept
  }
  /**
   * The author answers a notice — sends again, or a turn starts. A notice is only ever settled from
   * a log with none of its messages left in the queue, so nothing of the old message can run behind
   * the new one: answering it only ends it. A record still followed (`held`, `released`, shown
   * `delayed` or `unsaved` meanwhile) is left alone — its message still runs, ahead of the new one.
   * A notice the author's page has not confirmed drawing (`seen`) is left too: sending again before
   * reading it answers nothing, and it would be gone before it was ever shown.
   * @param {string} sessionId
   */
  function supersede(sessionId) {
    const record = sessions.get(sessionId)
    if (!record) return
    // A kept notice is answered the same way; a hold beside it is left alone.
    const kept = (record.earlier ?? []).filter((n) => n.seenAt === undefined)
    let changed = kept.length !== (record.earlier?.length ?? 0)
    if (kept.length > 0) record.earlier = kept
    else delete record.earlier
    if (isNotice(record) && record.seenAt !== undefined) {
      promote(sessionId, record, kept)
      changed = true
    }
    if (changed) save(sessionId)
  }
  /**
   * @param {HeldRecord} record @param {number} attempts @param {string} [reason]
   * @returns {boolean} whether anything the file holds changed
   */
  const attempted = (record, attempts, reason) => {
    const next = Math.min(attempts, MAX_ATTEMPTS)
    const changed = next !== record.attempts || (reason !== undefined && reason !== record.reason)
    record.attempts = next
    if (reason !== undefined) record.reason = reason
    if (changed) record.updatedAt = now()
    return changed
  }
  /**
   * Put `ids` back at the head of the session's queue; false when dsh cannot (no live agent, a
   * running turn, a message the log no longer holds).
   * @param {string} sessionId @param {(sessionId: string) => LiveSession | undefined} live
   * @param {string[]} ids
   */
  const resend = (sessionId, live, ids) => {
    try {
      return live(sessionId)?.resend?.(ids) === true
    } catch (error) {
      warn(`[site-tools] held follow-ups of ${sessionId} could not be sent once more: ${message(error)}`)
      return false
    }
  }
  /** @type {Promise<number>} */
  let passing = Promise.resolve(0)

  /**
   * One pass over the held sessions; see `releaseReady`.
   * @param {(sessionId: string) => Promise<number>} release
   * @param {(sessionId: string) => boolean} isRunning
   * @param {(sessionId: string) => LiveSession | undefined} live
   */
  async function pass(release, isRunning, live) {
    let released = 0
    // A write that failed earlier is tried again by every pass.
    let changed = unsaved.size > 0
    /** @param {{ seenAt?: number }} n */
    const expired = (n) => n.seenAt !== undefined && now() - n.seenAt > NOTICE_TTL_MS
    for (const [sessionId, record] of sessions) {
      if (record.earlier?.some(expired)) {
        const kept = record.earlier.filter((n) => !expired(n))
        if (kept.length > 0) record.earlier = kept
        else delete record.earlier
        changed = true
      }
      if (isNotice(record)) {
        if (expired(record)) {
          promote(sessionId, record, record.earlier ?? [])
          changed = true
        }
        continue
      }
      if (draining()) break
      if (record.state === 'held') {
        let count
        try {
          count = await release(sessionId)
        } catch (error) {
          if (sessions.get(sessionId) !== record || record.state !== 'held') continue
          // dsh not ready, or the session will not resume: released again next pass, for as long
          // as it takes; from MAX_ATTEMPTS its author is shown `delayed` meanwhile.
          if (attempted(record, record.attempts + 1, message(error))) changed = true
          continue
        }
        // Reconcile against the record as it is now: a hold that landed during the await
        // replaced nothing (same object), a removed one is gone.
        if (sessions.get(sessionId) !== record || record.state !== 'held') continue
        if (count > 0) {
          released += count
          attempted(record, 0)
          delete record.reason
          settle(record, 'released')
          changed = true
          continue
        }
        // 0: the drain came back, or a running turn will claim them itself when it ends.
        if (draining() || isRunning(sessionId)) continue
      }
      // `released`, or `held` with nothing dsh would release: ask the session's log.
      const seen = fatesOf(live(sessionId))
      if (seen === undefined) {
        // Not loaded, or not readable: released again next pass (a release loads the session).
        if (attempted(record, record.attempts + 1)) changed = true
        if (record.state === 'released') {
          settle(record, 'held')
          changed = true
        }
        continue
      }
      const v = verdict(record, seen, isRunning(sessionId))
      if (v.kind === 'failed' && mayResend(record, v, seen) && resend(sessionId, live, v.notRun)) {
        // Back at the head of the queue, followed as a hold: the next pass releases it.
        record.messages = [...v.notRun]
        record.resent = true
        record.attempts = 0
        settle(record, 'held')
        warn(`[site-tools] held follow-ups of ${sessionId} did not run after the update: sent once more`)
        changed = true
        continue
      }
      if (v.kind === 'pending') {
        // Still queued: a running turn claims them when it ends; an idle agent is released again.
        if (record.state === 'released' && !isRunning(sessionId)) {
          settle(record, 'held')
          changed = true
        }
        continue
      }
      if (conclude(sessionId, record, v)) changed = true
    }
    if (changed) save()
    return released
  }

  return {
    /** Why the held file could not be read, or null. */
    broken,
    /**
     * `api-session/prompt-hold`: true holds the follow-up; undefined lets dsh wake the agent as
     * usual. Never false: a bail answer other than undefined stops the next listener from being asked.
     *
     * 🔒 NO HOLD THAT WAS NOT WRITTEN DOWN. The process holding it is the one the deploy replaces;
     * a hold only this process knows about is a message nobody releases. When the file cannot be
     * read or written, the follow-up runs now (the chat lease makes the deploy wait for it).
     *
     * @param {string} sessionId
     * @param {{ site?: string | null }} [info] - the site the conversation stands in
     * @returns {true | undefined}
     */
    hold(sessionId, { site = null } = {}) {
      if (!draining()) return undefined
      const previous = sessions.get(sessionId)
      if (broken) return undefined
      if (previous?.state === 'held') return true
      const at = now()
      // Notices its author has not seen yet stay beside the new hold, never replaced by it.
      const earlier = keptNotices(previous)
      sessions.set(sessionId, {
        site: previous?.site ?? site,
        heldAt: at,
        // A release still being confirmed keeps its messages: they are followed until claimed.
        messages: previous?.state === 'released' ? [...previous.messages] : [],
        state: 'held',
        attempts: 0,
        updatedAt: at,
        ...(earlier.length > 0 ? { earlier } : {})
      })
      if (save() !== null) {
        if (previous) sessions.set(sessionId, previous)
        else sessions.delete(sessionId)
        return undefined
      }
      return true
    },
    /**
     * A message entered the next-turn queue of a held session: follow it by id. A write that fails
     * here comes after the hold was answered, so it cannot be undone; the author is told the state
     * is unknown until a pass writes it (`unsaved`).
     * @param {string} sessionId @param {string} messageId
     */
    queued(sessionId, messageId) {
      const record = sessions.get(sessionId)
      if (!record || record.state !== 'held' || record.messages.includes(messageId)) return
      record.messages.push(messageId)
      record.updatedAt = now()
      save(sessionId)
    },
    /**
     * Its author took a followed message out of the queue (removed, edited into a new one, or the
     * stop button cleared it): it is no longer this record's to report. A record left with nothing
     * to follow ends — nothing of the author's waits for the update any more — unless the same
     * splice put a replacement in (an edit).
     * @param {string} sessionId @param {string} messageId
     */
    removed(sessionId, messageId) {
      const record = sessions.get(sessionId)
      if (!record || (record.state !== 'held' && record.state !== 'released')) return
      const at = record.messages.indexOf(messageId)
      if (at < 0) return
      record.messages.splice(at, 1)
      record.updatedAt = now()
      save(sessionId)
      if (record.messages.length > 0) return
      // An edit is one splice that discards the old message and inserts its replacement, in that
      // order and in the same call: the record ends only if nothing came back by then.
      queueMicrotask(() => {
        if (sessions.get(sessionId) !== record || record.messages.length > 0) return
        if (record.state !== 'held' && record.state !== 'released') return
        promote(sessionId, record, record.earlier ?? [])
        save(sessionId)
      })
    },
    /**
     * The site of a record read from a version 1 file, once dsh has loaded its session.
     * @param {string} sessionId @param {string | null} site
     */
    place(sessionId, site) {
      const record = sessions.get(sessionId)
      if (record?.legacy !== true || record.site !== null || site === null) return
      record.site = site
      save(sessionId)
    },
    supersede,
    /**
     * A turn started in this session: a notice about an earlier message has been answered (the
     * author sent again or steered). A record still followed may be starting its own released turn,
     * and is left to the log (`supersede` touches only a notice).
     * @param {string} sessionId
     */
    turnStarted(sessionId) {
      supersede(sessionId)
    },
    /**
     * Whether dsh's disposal must keep this session's queue (`keepHeldInbox`).
     * @param {string} sessionId
     */
    keeps(sessionId) {
      const state = sessions.get(sessionId)?.state
      return state === 'held' || state === 'released'
    },
    /** @returns {string[]} */
    pending() {
      return [...sessions].filter(([, r]) => r.state === 'held' || r.state === 'released').map(([id]) => id)
    },
    /**
     * What the author of `sessionId` is shown, for a page standing in `site`. Answering does not
     * count as the author having seen it: the answer may never arrive (`seen` does).
     *
     * Who may ask is settled before this: the seat gateway lets a request through only for a
     * session the viewer holds (`dsh-passwords`, as for every session-scoped request). The site is
     * a second fence: a record held in one site says nothing to another site's page. A record
     * whose site is not known yet (version 1) answers its session's holder anywhere.
     *
     * @param {string} sessionId
     * @param {string | null | undefined} site - the site the asking page is mounted under; undefined
     *   when the request did not come through a site mount (the page talks to dsh directly).
     * @returns {{
     *   state: 'none' | ShownState,
     *   count: number,
     *   recorded: boolean,
     *   settled: boolean,
     *   id: string | null,
     *   earlier: { id: string, state: 'failed' | 'unknown', count: number }[]
     * }}
     *   `recorded`: a record of this session answered, so an `unknown` is about its messages — not
     *   about a file nobody can read, which is said to every conversation alike. `settled`: nothing
     *   changes this answer until the author acts (a notice, or no record) — a page stops asking.
     *   An `unknown` is always settled: a message that may still run is `held`, `delayed` or
     *   `unsaved`, never `unknown`. `id`: the notice's id when the record is a notice — what the
     *   page names when it confirms drawing it (`seen`). `earlier`: notices about an earlier
     *   deploy's messages kept beside this record, each shown as its own line, each with its id.
     */
    status(sessionId, site) {
      if (broken) return { state: 'unknown', count: 0, recorded: false, settled: true, id: null, earlier: [] }
      const record = mine(sessionId, site)
      if (!record) return { state: 'none', count: 0, recorded: false, settled: true, id: null, earlier: [] }
      return {
        state: shown(sessionId, record),
        count: record.messages.length,
        recorded: true,
        settled: isNotice(record),
        id: isNotice(record) ? (record.notice ?? null) : null,
        earlier: (record.earlier ?? []).map((n) => ({ id: n.id, state: n.state, count: n.messages.length }))
      }
    },
    /**
     * The author's page drew these notices of `sessionId` (it calls after drawing, so an answer lost
     * on its way never counts): each one's NOTICE_TTL_MS starts now, once. Only the notices named
     * by id: a confirmation of an older notice arriving after a newer one replaced it (a new id)
     * confirms nothing the page has not drawn.
     * @param {string} sessionId @param {string | null | undefined} site - as for `status`
     * @param {readonly string[]} ids - the notice ids the page drew (`status`'s `id` and `earlier`)
     * @returns {boolean} false when the confirmation could not be written down: nothing is marked
     *   seen then, so the page's next confirmation does it again instead of finding it already done
     *   in memory only
     */
    seen(sessionId, site, ids) {
      const record = mine(sessionId, site)
      if (!record) return true
      /** @type {{ seenAt?: number }[]} */
      const marked = []
      for (const n of record.earlier ?? []) {
        if (n.seenAt !== undefined || !ids.includes(n.id)) continue
        n.seenAt = now()
        marked.push(n)
      }
      if (
        isNotice(record) &&
        record.seenAt === undefined &&
        ids.includes(/** @type {string} */ (record.notice))
      ) {
        record.seenAt = now()
        marked.push(record)
      }
      if (marked.length === 0 || !save(sessionId)) return true
      for (const n of marked) delete n.seenAt
      return false
    },
    /**
     * Release every held session dsh will now accept, and settle each by what its log says.
     *
     * Serialized: the first tick after startup, the periodic tick and anything else asking share one
     * pass at a time, so a session is never released twice by two passes that both read "held".
     *
     * @param {(sessionId: string) => Promise<number>} release - `sessionController.releaseHeldPrompts`
     * @param {(sessionId: string) => boolean} isRunning
     * @param {(sessionId: string) => LiveSession | undefined} [live] - the session as dsh has it
     *   loaded; undefined while it is not
     * @returns {Promise<number>} how many follow-ups were released
     */
    releaseReady(release, isRunning, live = () => undefined) {
      const next = passing.then(
        () => pass(release, isRunning, live),
        () => pass(release, isRunning, live)
      )
      passing = next.catch(() => 0)
      return next
    }
  }
}

/**
 * @typedef {{
 *   id?: string,
 *   status?: string,
 *   cancel?: unknown,
 *   inbox?: {
 *     nextTurn?: readonly { id?: unknown }[],
 *     nextStep?: readonly { id?: unknown }[],
 *     splice?: (target: 'next-turn', start: number, count: number, inserted: object[]) => unknown
 *   },
 *   session?: { header?: { cwd?: unknown }, snapshotEvents?: () => unknown }
 * }} HeldAgent
 * @typedef {{
 *   on(event: string, listener: (...args: any[]) => unknown): unknown,
 *   get?: (name: string) => unknown
 * }} DeployHoldContext
 */

/**
 * The hold, wired to dsh: the prompt-hold answer, the disposal that must keep a held queue, the ids
 * of what was held and what its author removed, and one release pass (`tick`) the plugin runs on a
 * timer.
 *
 * @param {DeployHoldContext} ctx
 * @param {{
 *   queue: ReturnType<typeof heldPrompts>,
 *   site: (agent: HeldAgent | undefined) => string | null,
 *   warn: (line: string) => void
 * }} deps
 * @returns {{ tick: () => Promise<number> }}
 */
export function wireDeployHold(ctx, { queue, site, warn }) {
  /** @param {string} id @returns {HeldAgent | undefined} */
  const liveAgent = (id) =>
    /** @type {{ get?: (id: string) => HeldAgent | undefined } | undefined} */ (ctx.get?.('agents'))?.get?.(
      id
    )
  /**
   * Sessions whose release is being called right now. `releaseHeldPrompts` asks `prompt-hold`
   * synchronously before its first await; that ask is the release's, not an author's new message.
   * @type {Set<string>}
   */
  const releasing = new Set()
  /** @template T @param {Set<string>} set @param {string} id @param {() => T} run @returns {T} */
  const during = (set, id, run) => {
    if (set.has(id)) return run()
    set.add(id)
    try {
      return run()
    } finally {
      set.delete(id)
    }
  }
  /** @param {string} id @returns {LiveSession | undefined} */
  const live = (id) => {
    const agent = liveAgent(id)
    const snapshot = agent?.session?.snapshotEvents
    if (typeof snapshot !== 'function') return undefined
    return {
      fates: () => {
        const events = snapshot.call(agent?.session)
        return Array.isArray(events) ? messageFates(events) : undefined
      },
      resend: (ids) => {
        // An idle agent only: a running turn claims its queue itself, and a message put ahead of
        // one it is about to claim would change what it runs.
        if (agent?.status !== 'idle' || typeof agent.inbox?.splice !== 'function') return false
        const events = snapshot.call(agent.session)
        const messages = Array.isArray(events) ? queuedMessages(events, ids) : null
        if (messages === null) return false
        agent.inbox.splice('next-turn', 0, 0, messages)
        return true
      }
    }
  }
  /**
   * Whether a discarded message is still in the conversation's hands: sent back into the queue (a
   * queue row moved to steering), or taken by a turn.
   * @param {HeldAgent} agent @param {string} messageId
   */
  const stillThere = (agent, messageId) => {
    try {
      const events = agent.session?.snapshotEvents?.()
      if (Array.isArray(events)) {
        const fate = messageFates(events).get(messageId)
        return fate !== undefined && fate !== 'canceled'
      }
    } catch {}
    return [...(agent.inbox?.nextTurn ?? []), ...(agent.inbox?.nextStep ?? [])].some(
      (m) => m?.id === messageId
    )
  }
  /** @param {HeldAgent | undefined} agent */
  const keepQueue = (agent) => {
    const id = agent?.id
    if (typeof id !== 'string') return
    keepHeldInbox(agent, () => queue.keeps(id))
    markReleaseSplice(agent)
  }
  ctx.on('api-session/prompt-hold', (/** @type {string} */ sessionId) => {
    const agent = liveAgent(sessionId)
    // An author's new message, not a release asking: it answers a notice about an earlier one.
    if (!releasing.has(sessionId)) queue.supersede(sessionId)
    const answer = queue.hold(sessionId, { site: site(agent) })
    if (answer === true) keepQueue(agent)
    return answer
  })
  // A held session's agent made again (a resume after the restart, before its release): it keeps
  // its queue through the next disposal too, and a version 1 record learns its site.
  ctx.on('agent/created', (/** @type {{ agent?: HeldAgent }} */ { agent }) => {
    if (typeof agent?.id !== 'string') return
    queue.place(agent.id, site(agent))
    if (queue.keeps(agent.id)) keepQueue(agent)
  })
  ctx.on(
    'agent/inbox/inserted',
    (/** @type {{ agent?: HeldAgent, message?: { id?: unknown } }} */ { agent, message }) => {
      const id = agent?.id
      const messageId = message?.id
      if (typeof id !== 'string' || typeof messageId !== 'string') return
      // Only the next-turn queue is held; steering is never held.
      if (!agent?.inbox?.nextTurn?.some((m) => m.id === messageId)) return
      queue.queued(id, messageId)
    }
  )
  ctx.on(
    'agent/inbox/discarded',
    (/** @type {{ agent?: HeldAgent, message?: { id?: unknown } }} */ { agent, message }) => {
      const id = agent?.id
      const messageId = message?.id
      if (!agent || typeof id !== 'string' || typeof messageId !== 'string') return
      // The release's own splice: the message is sent back in the same call, or it did not run —
      // either way the log says so, and it is never its author's removal.
      if (releaseSplicing(agent)) return
      // An edit discards and inserts in one call: by the next microtask its replacement is queued.
      queueMicrotask(() => {
        if (!stillThere(agent, messageId)) queue.removed(id, messageId)
      })
    }
  )
  ctx.on('agent/status', (/** @type {{ agent?: HeldAgent, status?: string }} */ { agent, status }) => {
    if (status === 'running' && typeof agent?.id === 'string') queue.turnStarted(agent.id)
  })
  const tick = async () => {
    const controller = /** @type {{ releaseHeldPrompts?: (id: string) => Promise<number> } | undefined} */ (
      ctx.get?.('sessionController')
    )
    const release = controller?.releaseHeldPrompts
    // dsh still starting: the next tick asks again, and nothing is settled meanwhile.
    if (typeof release !== 'function') return 0
    try {
      return await queue.releaseReady(
        (id) => {
          // A live held agent is marked already (hold, agent/created); this covers one made before.
          keepQueue(liveAgent(id))
          return during(releasing, id, () => release.call(controller, id))
        },
        (id) => liveAgent(id)?.status === 'running',
        live
      )
    } catch (error) {
      warn(`[site-tools] held follow-ups not released: ${message(error)}`)
      return 0
    }
  }
  return { tick }
}
