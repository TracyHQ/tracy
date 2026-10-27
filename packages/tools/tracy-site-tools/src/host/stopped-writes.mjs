/**
 * WHAT A STOPPED TURN WROTE, TOLD TO THE NEXT TURN (review Q2, council 20/10/2026, option ii).
 *
 * WHY. When the customer presses Stop, dsh waits for the site call's body and then replaces its answer
 * with "Error: tool call aborted". A send already on the wire is not cut (`turn-stop.mjs`): it runs to its
 * answer and may land. So the model's next turn reads "aborted" for a call that changed the site, and
 * believes nothing changed. What the host knew of it lived in process memory (`call-memory.mjs`), and a
 * restart in between lost it.
 *
 * WHAT. Each tool call that ran with the turn's signal is one CALL here ({@link createStoppedWrites}
 * `startCall`); each write it sends is one ENTRY, begun right before the send and finished with the
 * answer (`begin` → `finish`). A call that returns before any Stop is dropped: the model read its answer.
 * When the Stop lands while a call runs, every entry of that call is reported to tracy-web at once — an
 * answered one with its outcome, one still on the wire as `sent` — and each later answer is reported as
 * it comes (`POST /api/sites/:key/turn/stopped`, kept in `site_stopped_write`, migration 148). The next
 * turn's first step takes them (`/turn/stopped/take`, once) and {@link stoppedWritesNotice} tells the
 * agent which landed and which may have. Writes known not sent are never named.
 *
 * Names only: action, target (kind/id/slot/page), outcome — never a value, a body or a credential.
 */

import { isLeaseBusy } from './lease-wait.mjs'
import { outcomeUnknown } from './site.mjs'
import { isTurnStopped } from './turn-stop.mjs'

/** The notice's producer (`noticeSource`): one model-facing note, shown collapsed. */
export const STOPPED_WRITES_PLUGIN = 'tracy-site-tools:stopped-writes'

/** The most entries one call keeps: a stopped call is a few writes, not a log (tracy-web keeps 50 a turn). */
export const STOPPED_CALL_MAX = 50
/** The most writes the notice names one by one; the rest are counted. */
export const STOPPED_NOTICE_NAMED = 8
/** How long the next turn's take waits for this host's own reports still on the wire. */
export const STOPPED_SETTLE_MS = 2_000

/** Codes of an answer that may have written although it did not say so (`site-context.mjs` MAY_HAVE_WRITTEN). */
const MAY_HAVE_WRITTEN = new Set(['PARTIAL', 'OUTCOME_UNKNOWN', 'STORE_CHANGED'])
/** Refusals made before anything was sent or done: the write did not happen. */
const NOT_SENT_CODES = new Set(['ACTOR_NOT_ACCEPTED', 'CONFIRM_FIRST', 'NO_VIEWER'])

/**
 * What one answer says about the write it answers.
 * @param {unknown} answer
 * @returns {'ok' | 'refused' | 'unknown' | 'not-sent'}
 */
export function writeOutcome(answer) {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return 'unknown'
  const a = /** @type {Record<string, unknown>} */ (answer)
  if (a.ok === true) return 'ok'
  if (isTurnStopped(a) || isLeaseBusy(a)) return 'not-sent'
  if (typeof a.code === 'string' && NOT_SENT_CODES.has(a.code)) return 'not-sent'
  if (outcomeUnknown(a) || (typeof a.code === 'string' && MAY_HAVE_WRITTEN.has(a.code))) return 'unknown'
  return a.ok === false ? 'refused' : 'unknown'
}

/** @param {unknown} v */
const shortId = (v) =>
  typeof v === 'number' && Number.isInteger(v)
    ? String(v)
    : typeof v === 'string' && /^[\p{L}\p{N}._:-]{1,128}$/u.test(v)
      ? v
      : null

/**
 * What an Apply call is aimed at, by name: `{kind, id, slot, page}` read off its params — never a value.
 * @param {Record<string, unknown>} params
 * @returns {Record<string, string> | null}
 */
export function applyWriteTarget(params) {
  /** @type {Record<string, string>} */
  const out = {}
  const p = params && typeof params === 'object' ? params : {}
  const kind = typeof p.kind === 'string' ? p.kind : typeof p.type === 'string' ? p.type : null
  if (kind !== null && /^[A-Za-z0-9_.-]{1,64}$/.test(kind)) out.kind = kind
  const id = shortId(p.id ?? p.record_id ?? p.apply_id)
  if (id !== null) out.id = id
  const slot = typeof p.slot === 'string' ? p.slot : null
  if (slot !== null && /^[A-Za-z0-9_.:[\]-]{1,128}$/.test(slot)) out.slot = slot
  const page = typeof p.path === 'string' ? p.path : typeof p.page === 'string' ? p.page : null
  if (page !== null && /^\/[^\s"'<>]{0,199}$/.test(page)) out.page = page
  return Object.keys(out).length > 0 ? out : null
}

/**
 * What an EmDash tool call is aimed at: its collection (or menu) and entry id.
 * @param {Record<string, unknown>} args
 * @returns {Record<string, string> | null}
 */
export function emdashWriteTargetOf(args) {
  const a = args && typeof args === 'object' ? args : {}
  /** @type {Record<string, string>} */
  const out = {}
  const kind = typeof a.collection === 'string' ? a.collection : typeof a.name === 'string' ? a.name : null
  if (kind !== null && /^[A-Za-z0-9_.-]{1,64}$/.test(kind)) out.kind = kind
  const id = shortId(a.id)
  if (id !== null) out.id = id
  return Object.keys(out).length > 0 ? out : null
}

/**
 * @typedef {{ key: string, label: string | null, sessionId: string, turnId: string }} Who
 * @typedef {{ id: string, action: string, target: Record<string, string> | null, via: 'apply' | 'emdash',
 *   outcome: 'sent' | 'ok' | 'refused' | 'unknown' | 'not-sent' }} Entry
 * @typedef {{ signal: AbortSignal, entries: Array<{ who: Who, entry: Entry, told: boolean }>, done: boolean }} Call
 */

/**
 * The ledger of one host: which writes each running call has sent, reported when its turn is stopped.
 * @param {{ report: (who: Who, writes: Entry[]) => Promise<void>, newId: () => string }} deps
 *   `report`: one POST to tracy-web for writes of one turn (`index.ts` `reportStoppedWrites`); never throws.
 */
export function createStoppedWrites({ report, newId }) {
  /** @type {Map<string, Set<Promise<void>>>} reports on the wire, by the turn's root session */
  const inFlight = new Map()

  /**
   * @param {Who} who
   * @param {Entry[]} writes
   */
  const send = (who, writes) => {
    if (writes.length === 0) return
    const root = who.turnId.slice(0, who.turnId.lastIndexOf(':'))
    const set = inFlight.get(root) ?? new Set()
    inFlight.set(root, set)
    const p = report(who, writes)
      .catch(() => {})
      .finally(() => {
        set.delete(p)
        if (set.size === 0) inFlight.delete(root)
      })
    set.add(p)
  }

  /** Report every entry of `call` not reported yet, grouped by turn. @param {Call} call */
  const flush = (call) => {
    /** @type {Map<string, { who: Who, writes: Entry[] }>} */
    const groups = new Map()
    for (const e of call.entries) {
      if (e.told) continue
      e.told = true
      const k = `${e.who.key}\u0000${e.who.label ?? ''}\u0000${e.who.sessionId}\u0000${e.who.turnId}`
      const g = groups.get(k) ?? { who: e.who, writes: [] }
      g.writes.push({ ...e.entry })
      groups.set(k, g)
    }
    for (const g of groups.values()) send(g.who, g.writes)
  }

  return {
    /**
     * One tool call starts with its turn's signal. The Stop reports what the call has sent so far.
     * @param {AbortSignal} signal
     * @returns {Call}
     */
    startCall(signal) {
      /** @type {Call} */
      const call = { signal, entries: [], done: false }
      if (!signal.aborted) signal.addEventListener('abort', () => flush(call), { once: true })
      return call
    },

    /**
     * The call returned. Before any Stop its answer reached the model: nothing is kept.
     * @param {Call} call
     */
    endCall(call) {
      call.done = true
      if (!call.signal.aborted) call.entries.length = 0
    },

    /**
     * A write of `call` is about to be sent. Answers the function that records its answer.
     * @param {Call | null | undefined} call
     * @param {Who | null} who - null when the write names no conversation or turn: nothing to keep.
     * @param {{ action: string, target: Record<string, string> | null, via: 'apply' | 'emdash' }} what
     * @returns {(outcome: Entry['outcome']) => void}
     */
    begin(call, who, what) {
      if (!call || who === null || call.signal.aborted) return () => {}
      if (call.entries.length >= STOPPED_CALL_MAX) return () => {}
      const held = {
        who,
        entry: { id: newId(), ...what, outcome: /** @type {Entry['outcome']} */ ('sent') },
        told: false
      }
      call.entries.push(held)
      return (outcome) => {
        held.entry.outcome = outcome
        if (!call.signal.aborted) return
        // Already reported as `sent` by the Stop: once more with what the answer said.
        held.told = false
        flush(call)
      }
    },

    /**
     * Whatever this host is still telling tracy-web about `rootSession`'s turns, waited for at most `ms`:
     * the next turn's take must not run ahead of the Stop's own report.
     * @param {string} rootSession
     * @param {number} [ms]
     */
    async settled(rootSession, ms = STOPPED_SETTLE_MS) {
      const set = inFlight.get(rootSession)
      if (!set || set.size === 0) return
      let timer
      await Promise.race([
        Promise.allSettled(set),
        new Promise((resolve) => {
          timer = setTimeout(resolve, ms)
        })
      ])
      clearTimeout(timer)
    }
  }
}

/**
 * How a write is named in the notice: `content.update post 42`, `content_update pages 01M…`.
 * @param {{ action: string, target?: Record<string, string> | null }} w
 */
function named(w) {
  const t = w.target ?? {}
  const parts = [w.action, t.kind, t.id, t.slot ? `slot ${t.slot}` : null, t.page ? `on ${t.page}` : null]
  return parts.filter((p) => typeof p === 'string' && p !== '').join(' ')
}

/**
 * The one notice the next turn gets about writes of earlier stopped turns, or null when none landed and
 * none may have (refused and not-sent writes changed nothing, and are not named).
 * @param {readonly { action: string, target?: Record<string, string> | null, outcome: string }[]} writes
 * @returns {{ text: string, summary: string } | null}
 */
export function stoppedWritesNotice(writes) {
  const landed = writes.filter((w) => w.outcome === 'ok')
  const unknown = writes.filter((w) => w.outcome === 'sent' || w.outcome === 'unknown')
  if (landed.length === 0 && unknown.length === 0) return null
  /** @param {typeof writes} list */
  const lines = (list) => {
    const shown = list.slice(0, STOPPED_NOTICE_NAMED).map((w) => `- ${named(w)}`)
    if (list.length > STOPPED_NOTICE_NAMED) shown.push(`- and ${list.length - STOPPED_NOTICE_NAMED} more`)
    return shown.join('\n')
  }
  const parts = [
    'The customer stopped an earlier request while you were changing the site. The call that was running then read "aborted", but writes it had already sent kept going.'
  ]
  if (landed.length > 0) parts.push(`These landed and are on the site now:\n${lines(landed)}`)
  if (unknown.length > 0)
    parts.push(
      `These have an unknown outcome — they may have landed:\n${lines(unknown)}\nRead those places again before you change them; never send an unknown write again without reading first.`
    )
  parts.push('Mention this to the customer only where it matters for what they ask now.')
  return {
    text: parts.join('\n'),
    summary: unknown.length > 0 ? 'Writes of a stopped request (some unknown)' : 'Writes of a stopped request'
  }
}
