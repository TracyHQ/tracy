/**
 * What `tracy_site` remembers between two calls, in ONE place: the per-site flight that orders every
 * `content.contract` relay in this process, the id minter, this turn's inspect snapshot, the receipts
 * this conversation wrote, the bodies it read, and the confirmations a customer gave.
 *
 * WHY ONE OWNER. A host dsh serves every site on the host (ADR 0014), so each of these is shared state
 * in one process, and each had a second copy planned somewhere: the replace job's own warm-up inspect,
 * an id derived from a counter, a revision remembered by the build. Two copies of "what did this
 * conversation read" disagree after the first write, and the component answers the disagreement with
 * `writer_busy` or "Content changed". Every reader asks here instead.
 *
 * Pure apart from the clock and the random bytes, both injected, so `test/call-memory.test.mjs` pins
 * every rule without a server.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes } from 'node:crypto'
import { cardMeaningProblem } from './confirm-words.mjs'
import { LEGACY_STRUCTURE_CODE } from './legacy-refusal.mjs'

/**
 * A flight's place in its site's queue, as the code running inside it holds it: `leave` lets the queue
 * move on while the flight waits for something that is not the site's component (the write lease), and
 * `rejoin` takes a new place at the end of the queue and settles once it is this flight's turn again.
 * @typedef {{ leave: () => void, rejoin: () => Promise<void> }} FlightSeat
 */

/** The seat of the flight the running code is in (`flight` sets it for its `fn`). */
const seats = new AsyncLocalStorage()

/**
 * The seat of the site flight this code runs in, or null outside any flight — what a lease wait leaves
 * and rejoins (`lease-wait.mjs`, review C1).
 * @returns {FlightSeat | null}
 */
export function flightSeat() {
  return /** @type {FlightSeat | undefined} */ (seats.getStore()) ?? null
}

/**
 * @typedef {{ sessionId: string | null | undefined, label: string | null | undefined, actor: string | null | undefined }} InspectKey
 * @typedef {{ answer: Record<string, unknown>, revision: string | null, generation: number, turn: number, at: number }} Snapshot
 * @typedef {{
 *   id: number | null, kind: string, key: string | null, title: string | null, chars: number | null,
 *   absent: boolean, theme: string | null, themeUnread: boolean, base: number | null, baseTurn: number,
 *   created: boolean, postType: string | null, ref: string | null
 * }} Read
 *   `chars` is the body's length as last seen (a read, or the in-tool check after a write); `base`
 *   the length a whole-body write is judged against in turn `baseTurn` (D6′ (a)). `theme` names the
 *   theme file a part with no stored copy is served from, and `themeUnread` says that file could
 *   not be read — the guard then has nothing to judge a write against.
 *   `created` says this conversation made the record (a create the component answered `created:true`):
 *   there was no customer body to protect, so a shorter body later is the author's own choice.
 *   `postType` is the WordPress post type the read showed (`wp_global_styles` holds JSON, not blocks),
 *   kept across a later read or write that did not say it.
 *   `ref` names one whole-body FIELD of a Joomla or EmDash record ({@link bodyRef}): such a record has
 *   several bodies (an article's introtext and fulltext) and its ids are not WordPress post ids (a
 *   Joomla module shares numbers with articles, an EmDash id is a ULID), so it is filed under that
 *   string alone, never under `id`.
 * @typedef {Read & { baseline: number | null }} ReadSeen
 */

/** Sessions kept at once; the least recently used one goes first. One host serves many conversations. */
const MAX_SESSIONS = 500
/** Records one conversation's body reads are remembered for. */
const MAX_READS = 200
/** Receipts one conversation keeps per site; the newest are the ones `apply.list` is asked about. */
const MAX_RECEIPTS = 50
/** Destructive calls waiting for the customer's answer, per conversation. */
const MAX_CONFIRMS = 50
/**
 * How long the customer's yes holds for the call it opens (council 19/10/2026: 5 minutes). Past it, the
 * call is asked again: a yes given before a long pause may no longer be about the site as it is.
 */
export const CONFIRM_TTL_MS = 5 * 60_000
/** Refused calls one conversation remembers (E3.2); a turn rarely holds more than a handful. */
const MAX_REFUSED = 100
/** Sites whose dead roads are remembered at once (E3.3). */
const MAX_LEARNED = 500
/** Slots whose content revision one conversation remembers per site (Content API v2, D1). */
const MAX_SLOT_REVISIONS = 2_000
/** Sites whose own host name is remembered at once. */
const MAX_HOSTS = 500
/**
 * The record of an unknown-outcome write that names none a step can be matched to (E2.2) — never a
 * `wpRecordOf` string, which always carries a `|`.
 */
const UNNAMED = '?'
/**
 * How long a dead road is remembered (E3.3): one hour, per site. A component upgrade clears it
 * sooner (`unlearn`); an hour later the first call relays again and learns anew (F4 §8 risk 2).
 */
const LEARN_TTL_MS = 3_600_000
/**
 * How long "this site's plugin does not read `content.list {search}`" is remembered: FIFTEEN minutes,
 * not the hour of the other dead roads. A Claude Cowork plugin updates itself about every 15 minutes
 * and nothing here stores its version, so any remembered "it does not read search" is a lower bound
 * that the plugin outgrows — a site that has updated must be asked again soon, or the road the update
 * opened stays shut for an hour.
 */
const LEARN_LIST_SEARCH_TTL_MS = 900_000
/**
 * How long a failed read of a site's content counts as the first of a run (`readFailed`): a retry
 * comes 1–2 minutes after the failure, because a failing read itself takes about a minute.
 */
const READ_FAILURE_TTL_MS = 600_000

/**
 * 🔒 THE REFUSALS THAT ARE DETERMINISTIC FOR IDENTICAL ARGUMENTS — the only ones E3.2 remembers.
 * Each one is about the SHAPE of the call or a POLICY of the site, so the same arguments get the same
 * answer until the site changes or the customer speaks: a parameter nobody reads (`UNKNOWN_PARAM`),
 * an action or a kind the site does not have (`bad_action` from the component, `NOT_ON_THIS_PLATFORM`
 * from `normalizeCall`'s platform rows), a call that names no record (`ADDRESS_MISSING`), the
 * component's own shape refusal (`bad_params`), a sealed site's structure (`LEGACY_STRUCTURE_CODE`), a
 * whole-body write shorter than what was read (`BODY_SHRINK`, only when the read exists).
 *
 * ⚠ ONLY WHAT REACHES `runSiteCall` / `runEmdashTool` IS HERE. `planCall`'s `BAD_ACTION` and its
 * surface-level `NOT_ON_THIS_PLATFORM` are answered in `index.ts` before either runs, so no memo
 * ever sees them — and they cost no relay to repeat. `BAD_ACTION` was listed and never recorded
 * (review, 25/09); a list that names a code the memo cannot see promises a guard that is not there.
 *
 * WHY AN ALLOWLIST AND NOT "EVERY REFUSAL" (plan v2.1 critic #2). The first E3.2 memoised every
 * refusal, and so blocked the very re-send the refusal texts prescribe: `COMPONENT_UNREACHABLE` says
 * "Retry once" (`site.mjs`), `NOT_SIGNED_IN`/`NO_VIEWER` "make the same call once more", `NO_TOKEN`
 * "make the same call again", a lock miss "the same call once more in a few seconds". A single 502
 * would have become a turn-long dead end, for a gain of 7 blocked sends on r2. Every code not named
 * here — the transient (COMPONENT_*, 5xx, SITE_UNREACHABLE, NOT_MCP, SITE_REFUSED, `writer_busy`,
 * `OUTCOME_UNKNOWN`), the session (NOT_SIGNED_IN, NO_VIEWER, NO_TOKEN), the state (INSPECT_FIRST,
 * CONFIRM_FIRST, `contract_failed` "Content changed", `conflict`, SITE_BUSY) — passes untouched.
 */
export const MEMOISED_CODES = Object.freeze([
  'UNKNOWN_PARAM',
  'bad_params',
  'bad_action',
  'NOT_ON_THIS_PLATFORM',
  'ADDRESS_MISSING',
  LEGACY_STRUCTURE_CODE,
  'STRUCTURE_REFUSED',
  'BODY_SHRINK'
])

/**
 * EmDash's own classes of a `TOOL_FAILED` that are deterministic for identical arguments: a
 * validation error, and a `[CONFLICT]` — whose arguments carry the `_rev` it conflicted on, so the
 * same arguments are the same stale token (r2: 4 of the 7 replays E3.2 would have stopped).
 */
const MEMOISED_EMDASH = new Set(['VALIDATION', 'VALIDATION_ERROR', 'CONFLICT'])

/**
 * A next that tells the model to send the refused call again as it is. A refusal whose own next
 * says so is never remembered, whatever its code: the memo would refuse the step it prescribes.
 *
 * ⚠ NARROWER THAN THE PLAN'S "same call" OR "retry", ON PURPOSE. "Same call with apply_id", "Same
 * call with kind added" and `LEGACY_STRUCTURE_CODE`'s "repeat the same call until status is completed" each ask
 * for ANOTHER call; the plan's rule would never keep `LEGACY_STRUCTURE_CODE`, the class a sealed site answers
 * most. What makes the narrow rule safe is that the change such a next asks for shows in the repeat
 * key: only `confirm` and the ids Tracy made for the call (`meta.mintedIds`, `site-call.mjs`) are
 * left out of it, and `test/call-memory.test.mjs` holds every kept next to naming neither.
 */
const RESEND = /\bretry\b|\b(?:same|identical) call (?:once more|again)\b/i

/**
 * Whether a refusal is one E3.2 may remember: a code of {@link MEMOISED_CODES} (or EmDash's
 * validation / conflict class), no 5xx status, and no next that asks for the same call again.
 * `BODY_SHRINK` counts only when it judged a read: with none, its next is "read first" and the
 * write after that read may pass.
 * @param {unknown} answer
 */
export function memoisableRefusal(answer) {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return false
  const a = /** @type {Record<string, unknown>} */ (answer)
  if (a.ok !== false) return false
  if (Number(a.httpStatus) >= 500) return false
  if (typeof a.next === 'string' && RESEND.test(a.next)) return false
  const code =
    typeof a.code === 'string' && a.code !== ''
      ? a.code
      : typeof a.error === 'string' && /^[a-z_]+$/.test(a.error)
        ? a.error
        : ''
  if (code === 'TOOL_FAILED') {
    const sub =
      typeof a.emdash === 'string' && a.emdash !== ''
        ? a.emdash
        : (/^\s*\[([A-Z_]+)\]/.exec(String(a.error ?? ''))?.[1] ??
          (/-32602|Input validation|Invalid arguments/i.test(String(a.error ?? '')) ? 'VALIDATION' : ''))
    return MEMOISED_EMDASH.has(sub)
  }
  if (code === 'BODY_SHRINK') return a.read === true && a.theme !== 'unread' && a.conversation !== false
  return MEMOISED_CODES.includes(code)
}

/**
 * The key E3.2 recognises one call by: the tool, then its arguments with object keys sorted at every
 * level (`callKeyOf`, so `confirm` never counts). The caller passes the call AFTER normalisation, with
 * the ids Tracy minted for it taken out — a contract apply is given a new `apply_id` every time, so
 * with them in, the same call would never be the same twice.
 * @param {string} tool - `tracy_site` or `tracy_emdash`.
 * @param {unknown} args
 */
export function sameCallKey(tool, args) {
  return `${tool}\n${callKeyOf(args)}`
}

/**
 * The answer to a call refused earlier in this turn, with nothing changed since (E3.2): the earlier
 * refusal's code and its own next — the one way on is a different call, or the customer. The call is
 * not sent. `refusalNext`'s `SAME_CALL_REFUSED` case is the fallback when the earlier one had no next.
 * @param {{ code: string, error: string, next: string | null }} earlier - `refusedBefore(…)`.
 * @param {{ action?: string, tool?: string }} call - a `tracy_site` action or a `tracy_emdash` tool.
 */
export function sameCallRefused(earlier, call) {
  const code = earlier.code.slice(0, 40)
  return {
    ok: false,
    code: 'SAME_CALL_REFUSED',
    ...(typeof call?.action === 'string' ? { action: call.action } : {}),
    ...(typeof call?.tool === 'string' ? { tool: call.tool } : {}),
    refused: code,
    ...(earlier.error !== '' ? { was: earlier.error.slice(0, 120) } : {}),
    error: `This exact call was refused earlier in this turn (${code}); sent again it gets the same answer.`,
    ...(earlier.next !== null ? { next: earlier.next } : {})
  }
}

/**
 * A key that sorts object keys, so two spellings of one call are one key. `confirm` is left out: it
 * is Tracy's own parameter and the one thing that differs between the refused call and its repeat.
 * @param {unknown} value
 * @returns {string}
 */
export function callKeyOf(value) {
  if (typeof value === 'string') return value
  /** @param {unknown} v @returns {unknown} */
  const sorted = (v) => {
    if (Array.isArray(v)) return v.map(sorted)
    if (v === null || typeof v !== 'object') return v
    const o = /** @type {Record<string, unknown>} */ (v)
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => k !== 'confirm')
        .sort()
        .map((k) => [k, sorted(o[k])])
    )
  }
  try {
    return JSON.stringify(sorted(value)) ?? ''
  } catch {
    return ''
  }
}

/**
 * The record a WordPress write names, as one string both a call and an `apply.list` step can be read
 * into (E2.2): a post by its id, a template part and an option by their key (the component writes
 * them by key and the step's id is the stored post's), a postmeta or a term by both. Null for a call
 * that names no existing record — a create (post id 0) — or a kind this door does not write.
 * A Joomla or EmDash record's `ref` ({@link bodyRef} without its field) is its own string.
 * @param {{ kind?: unknown, id?: unknown, key?: unknown, ref?: unknown } | null | undefined} address
 * @returns {string | null}
 */
export function wpRecordOf(address) {
  const ref = typeof address?.ref === 'string' ? address.ref.trim() : ''
  if (ref !== '') return ref
  const kind = typeof address?.kind === 'string' ? address.kind.trim() : ''
  const n = Number(address?.id)
  const id = Number.isInteger(n) && n > 0 ? n : 0
  const key = typeof address?.key === 'string' ? address.key.trim() : ''
  if (kind === 'post') return id > 0 ? `post|${id}` : null
  if (kind === 'templatePart' || kind === 'option') return key !== '' ? `${kind}|${key}` : null
  if (kind === 'postmeta' || kind === 'term') return id > 0 && key !== '' ? `${kind}|${id}|${key}` : null
  return null
}

/**
 * The name one whole-body field of a Joomla or EmDash record is remembered under (D6′ on those
 * platforms): `joomla|article|5|introtext`, `emdash|pages|01J…|body`. Without `field`, the record
 * itself — what a length refusal is counted against (`shrinkRefused`). Null when a part is missing.
 * @param {'joomla' | 'emdash'} platform
 * @param {unknown} kind - the Joomla kind, or the EmDash collection.
 * @param {unknown} id
 * @param {unknown} [field]
 * @returns {string | null}
 */
export function bodyRef(platform, kind, id, field) {
  const k = typeof kind === 'string' ? kind.trim() : ''
  const i =
    typeof id === 'number' && Number.isInteger(id) && id > 0
      ? String(id)
      : typeof id === 'string'
        ? id.trim()
        : ''
  if (k === '' || i === '' || i === '0') return null
  if (field === undefined) return `${platform}|${k}|${i}`
  const f = typeof field === 'string' ? field.trim() : ''
  return f === '' ? null : `${platform}|${k}|${i}|${f}`
}

/**
 * One memory per process.
 *
 * @param {{ now?: () => number, random?: () => string, maxSessions?: number, learnTtlMs?: number, listSearchTtlMs?: number }} [opts]
 *   `random` answers six hex characters; tests pass a counter. `listSearchTtlMs` is how long a site's
 *   ignored `content.list {search}` is remembered (15 minutes; `learnTtlMs` is the hour of the rest).
 */
export function createCallMemory(opts = {}) {
  const now = opts.now ?? Date.now
  const random = opts.random ?? (() => randomBytes(3).toString('hex'))
  const maxSessions = opts.maxSessions ?? MAX_SESSIONS
  const learnTtlMs = opts.learnTtlMs ?? LEARN_TTL_MS
  const listSearchTtlMs = opts.listSearchTtlMs ?? LEARN_LIST_SEARCH_TTL_MS

  /**
   * Each site's queue (`flight`): the promise its last place settles once that place is given up.
   * @type {Map<string, Promise<unknown>>}
   */
  const flights = new Map()

  /**
   * A place at the end of `key`'s queue: `turn` settles once every earlier place was given up, and
   * `giveUp` lets the next one in.
   * @param {string} key
   */
  function queueAt(key) {
    const previous = flights.get(key) ?? Promise.resolve()
    /** @type {() => void} */
    let giveUp = () => {}
    const mine = new Promise((resolve) => {
      giveUp = () => resolve(undefined)
    })
    const tail = previous.then(() => mine)
    flights.set(key, tail)
    void tail.then(() => {
      if (flights.get(key) === tail) flights.delete(key)
    })
    return { turn: previous, giveUp }
  }

  /**
   * One flight's seat in `key`'s queue: taken in order, left and taken again by a lease wait
   * ({@link FlightSeat}), given up for good when the flight ends (`end`). A seat whose flight ended is
   * never taken again, so a promise that outlives its flight cannot hold the site's queue.
   * @param {string} key
   */
  function seatIn(key) {
    let place = queueAt(key)
    let held = false
    let over = false
    /** @type {Promise<void> | null} */
    let joining = null
    /** @type {FlightSeat} */
    const seat = {
      leave() {
        if (!held || over) return
        held = false
        place.giveUp()
      },
      rejoin() {
        if (held || over) return Promise.resolve()
        if (joining === null) {
          place = queueAt(key)
          joining = place.turn.then(() => {
            joining = null
            if (over) place.giveUp()
            else held = true
          })
        }
        return joining
      }
    }
    const seated = place.turn.then(() => {
      held = true
    })
    const end = () => {
      over = true
      if (!held) return
      held = false
      place.giveUp()
    }
    return { seat, seated, end }
  }
  /** @type {Map<string, number>} */
  const generations = new Map()
  /**
   * Each site's own host name, as the last read of it said (`site.url`) — a fact about the site, not
   * about a conversation, so one read teaches every conversation on it.
   * @type {Map<string, string>}
   */
  const siteHosts = new Map()
  /**
   * What each site's component was found to lack (E3.3), per label — a fact about the site, not
   * about a person or a conversation.
   * @type {Map<string, { missing: Map<string, { at: number, answer: Record<string, unknown> | null }>, contractBound: number | null, noContentRevisions?: number | null, noListSearch?: number | null }>}
   */
  const learnedSites = new Map()
  /**
   * Sites whose content read failed and has not answered since (`readFailed`), per label: how many
   * in a row, and when the last one was — a fact about the site, like `learnedSites`.
   * @type {Map<string, { n: number, at: number }>}
   */
  const readFailures = new Map()
  /**
   * @type {Map<string, {
   *   turn: number, answered: number,
   *   inspects: Map<string, Snapshot>,
   *   slotShapes: Map<string, { slots: unknown[], turn: number }>,
   *   reads: Map<number | string, Read>, partKeys: Map<string, Read>,
   *   titles: Map<string, string>,
   *   receipts: Map<string, { applyIds: string[], ok: Set<string>, unknown: Set<string>, idMap: Map<string, string>, records: Map<string, Map<string, number>>, unknownRecords: Map<string, Set<string>> }>,
   *   wp: Map<string, { turn: number, base: string, n: number }>,
   *   confirms: Map<string, { askedAt: number, said: 'yes' | 'no' | null, own: boolean, facts: string[], yesAt: number, intent: 'delete' | 'hide' | null, typed?: boolean }>,
   *   declined: number,
   *   refused: Map<string, { code: string, error: string, next: string | null, turn: number, generation: number, label: string }>,
   *   shrinks: Map<string, number>,
   *   revisions: Map<string, string>,
   *   describes: Set<string>,
   *   contentRevisions: Map<string, Map<string, { contentId: string, revision: string, generation: number }>>
   * }>}
   */
  const sessions = new Map()

  /**
   * 🔒 A CALL WITH NO CONVERSATION REMEMBERS NOTHING AND IS REMEMBERED BY NOTHING. Every call with no
   * sessionId used to share one '' session: the reads the body guard compares against, the receipts
   * `apply.list` answers and the WordPress apply id pooled across unrelated conversations, and since
   * `newTurn` is never called for '', `wpApplyId` answered the same `wp-` id forever — one
   * `apply.revert` would have undone every such conversation's writes. D8 already said "no sessionId →
   * no cache" for inspects; the same now holds for everything here: no reads (the body guard then
   * refuses rather than compare with a stranger's read), no receipts, no confirmations, and a fresh
   * `wp-` id per call.
   * @param {unknown} sessionId
   * @returns {sessionId is string}
   */
  const named = (sessionId) => typeof sessionId === 'string' && sessionId !== ''
  /** @param {unknown} label */
  const labelKey = (label) => (typeof label === 'string' && label !== '' ? label : '_lane')

  /**
   * The state of one conversation, created on first use and moved to the young end of the LRU. Only
   * ever called with a named session (see `named`).
   * @param {string} key
   */
  function session(key) {
    let s = sessions.get(key)
    if (s === undefined) {
      s = {
        turn: 0,
        answered: 0,
        inspects: new Map(),
        slotShapes: new Map(),
        reads: new Map(),
        titles: new Map(),
        partKeys: new Map(),
        receipts: new Map(),
        wp: new Map(),
        confirms: new Map(),
        declined: 0,
        refused: new Map(),
        shrinks: new Map(),
        revisions: new Map(),
        describes: new Set(),
        contentRevisions: new Map()
      }
      sessions.set(key, s)
      while (sessions.size > maxSessions) {
        const oldest = sessions.keys().next().value
        if (oldest === undefined) break
        sessions.delete(oldest)
      }
    } else {
      sessions.delete(key)
      sessions.set(key, s)
    }
    return s
  }

  /** @param {string} sessionId @param {unknown} label */
  function receiptsOf(sessionId, label) {
    const s = session(sessionId)
    const key = labelKey(label)
    let r = s.receipts.get(key)
    if (r === undefined) {
      r = {
        applyIds: [],
        ok: new Set(),
        unknown: new Set(),
        idMap: new Map(),
        records: new Map(),
        unknownRecords: new Map()
      }
      s.receipts.set(key, r)
    }
    return r
  }

  /**
   * One conversation's slot → content revision map for one site (D1), created on first use.
   * @param {ReturnType<typeof session>} s
   * @param {unknown} label
   */
  function slotRevisions(s, label) {
    const key = labelKey(label)
    let map = s.contentRevisions.get(key)
    if (map === undefined) {
      map = new Map()
      s.contentRevisions.set(key, map)
      while (s.contentRevisions.size > MAX_RECEIPTS) {
        const oldest = s.contentRevisions.keys().next().value
        if (oldest === undefined) break
        s.contentRevisions.delete(oldest)
      }
    }
    return map
  }

  /** @param {unknown} label */
  function generationOf(label) {
    return generations.get(labelKey(label)) ?? 0
  }

  /**
   * What a site's component was found to lack within the hour (E3.3), and whether its plugin ignored a
   * `content.list` search within the quarter of an hour; expired entries leave here.
   * @param {unknown} label
   * @returns {{ missing: string[], contractBound: boolean, noContentRevisions: boolean, noListSearch: boolean }}
   */
  function learnedOf(label) {
    const site = learnedSites.get(labelKey(label))
    if (site === undefined)
      return { missing: [], contractBound: false, noContentRevisions: false, noListSearch: false }
    const fresh = (/** @type {number} */ at) => now() - at < learnTtlMs
    for (const [action, entry] of site.missing) if (!fresh(entry.at)) site.missing.delete(action)
    if (site.contractBound !== null && !fresh(site.contractBound)) site.contractBound = null
    if (site.noContentRevisions != null && !fresh(site.noContentRevisions)) site.noContentRevisions = null
    if (site.noListSearch != null && now() - site.noListSearch >= listSearchTtlMs) site.noListSearch = null
    return {
      missing: [...site.missing.keys()],
      contractBound: site.contractBound !== null,
      noContentRevisions: site.noContentRevisions != null,
      noListSearch: site.noListSearch != null
    }
  }

  /** @param {InspectKey} key */
  const inspectSlot = (key) => `${labelKey(key.label)}\n${typeof key.actor === 'string' ? key.actor : ''}`

  /** @param {InspectKey} key */
  const cacheable = (key) =>
    typeof key?.sessionId === 'string' &&
    key.sessionId !== '' &&
    typeof key.actor === 'string' &&
    key.actor !== ''

  /**
   * A new id: `<prefix>-<clock in base 36>-<6 hex>`.
   *
   * 🔒 NEVER DERIVED FROM IN-MEMORY STATE ALONE. A counter starts again at every dsh restart, and the
   * component keeps its receipts forever: `contract-<session>-1` minted after a restart is an id the
   * site already holds, which it refuses ("Use one new apply_id per content revision") or, with an
   * equal request id, answers with an OLD receipt as if this apply had run.
   * @param {string} prefix
   */
  function mint(prefix) {
    const hex = String(random())
      .replace(/[^0-9a-f]/gi, '')
      .slice(0, 6)
      .padEnd(6, '0')
    return `${prefix}-${now().toString(36)}-${hex.toLowerCase()}`
  }

  /**
   * One read, as the memory keeps it.
   * @param {{ id?: unknown, kind?: unknown, key?: unknown, title?: unknown, chars?: unknown, absent?: boolean, theme?: unknown, themeUnread?: boolean, postType?: unknown, ref?: unknown }} read
   * @returns {Read}
   */
  function readEntry(read) {
    const id = Number(read?.id)
    return {
      id: Number.isInteger(id) && id > 0 ? id : null,
      kind: typeof read?.kind === 'string' ? read.kind : 'post',
      key: typeof read?.key === 'string' && read.key !== '' ? read.key : null,
      title: typeof read?.title === 'string' ? read.title : null,
      chars: typeof read?.chars === 'number' && read.chars >= 0 ? read.chars : null,
      absent: read?.absent === true,
      theme: typeof read?.theme === 'string' && read.theme !== '' ? read.theme : null,
      themeUnread: read?.themeUnread === true,
      base: null,
      baseTurn: 0,
      created: false,
      postType: typeof read?.postType === 'string' && read.postType !== '' ? read.postType : null,
      ref: typeof read?.ref === 'string' && read.ref !== '' ? read.ref : null
    }
  }

  /**
   * What the memory already holds for the record `entry` names: a part by its slug, a post by id.
   * @param {ReturnType<typeof session>} s
   * @param {Read} entry
   * @returns {Read | undefined}
   */
  function heldRead(s, entry) {
    if (entry.ref !== null) return s.reads.get(entry.ref)
    if (entry.kind === 'templatePart') return entry.key === null ? undefined : s.partKeys.get(entry.key)
    return entry.id === null ? undefined : s.reads.get(entry.id)
  }

  /**
   * File one read under its id and (a template part) its slug, the oldest going first.
   * @param {ReturnType<typeof session>} s
   * @param {Read} entry
   */
  function keepRead(s, entry) {
    // A Joomla or EmDash field by its `ref` only: its record's number is not a WordPress post's.
    const slot = entry.ref ?? entry.id
    if (slot !== null) {
      s.reads.delete(slot)
      s.reads.set(slot, entry)
      while (s.reads.size > MAX_READS) {
        const oldest = s.reads.keys().next().value
        if (oldest === undefined) break
        s.reads.delete(oldest)
      }
    }
    if (entry.kind === 'templatePart' && entry.key !== null) {
      s.partKeys.delete(entry.key)
      s.partKeys.set(entry.key, entry)
      while (s.partKeys.size > MAX_READS) {
        const oldest = s.partKeys.keys().next().value
        if (oldest === undefined) break
        s.partKeys.delete(oldest)
      }
    }
  }

  return {
    /**
     * Run `fn` after every earlier flight on this site has settled, and before any later one.
     *
     * 🔒 THE COMPONENT'S LOCK IS `GET_LOCK(…, 0)`, AND EVERY CONTRACT CALL TAKES IT, INSPECT INCLUDED
     * (`Engine.php:135-142`, `JoomlaSiteWriter.php:290`). Two overlapping contract calls on one site
     * are one answer and one immediate `writer_busy`, with no queue. Ordering them HERE is the queue
     * the component does not have. Never across two sites: their locks are different locks.
     *
     * A failed flight does not break the chain: the next one runs either way.
     *
     * 🔒 A FLIGHT WAITING FOR THE SITE'S WRITE LEASE STEPS OUT OF THE QUEUE (review C1, 19/10/2026).
     * `fn` runs with its seat at hand ({@link flightSeat}): a send refused `SITE_BUSY` leaves the queue
     * for its pause and takes a new place at the end of it (`lease-wait.mjs`), so the conversation that
     * holds the lease is never queued behind the one waiting for it.
     * @template T
     * @param {unknown} label
     * @param {() => Promise<T> | T} fn
     * @returns {Promise<T>}
     */
    flight(label, fn) {
      const { seat, seated, end } = seatIn(labelKey(label))
      const run = seated.then(() => seats.run(seat, fn))
      void run.then(end, end)
      return run
    },

    mint,

    /** The turn a conversation is in: 0 until its first `newTurn`. @param {unknown} sessionId */
    turnOf(sessionId) {
      return named(sessionId) ? session(sessionId).turn : 0
    },

    /**
     * A new customer message arrived: this turn's inspect snapshots and WordPress apply id end here.
     * A customer message is also an answer to any question asked before it (D34) — except a call
     * whose own question the customer already answered with something other than the go-ahead
     * (`customerAnswered`): that stays shut until the call is refused again.
     *
     * 🔒 A MESSAGE THAT OPENS WITH A REFUSAL IS A NO (28/09/2026). Until then words were not read here:
     * "thôi, đừng xoá" typed after an agent asked in prose opened every refused call as "yes" would,
     * and only the model's reading stood between it and the delete. Now a message whose first words
     * refuse (`typedRefusal`) is the customer's No to every call still waiting for an answer: it stays
     * shut until the call is refused again. Any other message is an answer as before, so an agent
     * that asked in prose, and a `PENDING_DRAFT` (no question of Tracy's), still have their way
     * through. A refusal read where none was meant costs one more question, never a delete.
     * @param {unknown} sessionId
     * @param {unknown} [words] - the customer's message text; none = not read
     */
    newTurn(sessionId, words) {
      if (!named(sessionId)) return 0
      const s = session(sessionId)
      if (typedRefusal(words)) {
        declineWaiting(s)
        s.declined += 1
      }
      s.turn += 1
      s.answered += 1
      s.inspects.clear()
      // The customer spoke: a call refused before may now be what they asked for (E3.2).
      s.refused.clear()
      // …and their new words are what the next `removes` quotes (W1 (b)).
      s.shrinks.clear()
      return s.turn
    },

    /**
     * The customer answered an `ask_user_question`, without a new turn (D34).
     *
     * 🔒 EACH QUESTION TRACY WROTE ANSWERS FOR ITS OWN CALL, AND FOR NO OTHER. Until 27/09 one
     * go-ahead opened every call refused before it: Yes to the English row's question let the Russian
     * row through while the same card said "No, keep it" to that one. Now (`answerVerdict`):
     * - Tracy's question (`confirm-<hash of the call's key>`) answered with its first option opens
     *   that one call; any other answer to it — another option, typed words, none — keeps it shut,
     *   against every other answer too, until the call is refused again (`confirmAsked`);
     * - a question the agent wrote itself is an open answer, as before: every call refused before it
     *   that has no answer of its own may go ahead, and the model reads the words (a `PENDING_DRAFT`
     *   carries no question of Tracy's, so this is its only way through) — unless that answer opens
     *   with a refusal (`openAnswerRefuses`, 28/09/2026): "No" chosen on the agent's own "Delete the
     *   page?" is the customer's No to every call still waiting, as a typed "no" is (`newTurn`).
     * @param {unknown} sessionId
     * @param {unknown} [args] - the `ask_user_question` call's arguments; none = an open answer
     * @param {unknown} [value] - its answer, `{answers:[{id, selected, custom?}]}`
     */
    customerAnswered(sessionId, args, value) {
      if (!named(sessionId)) return
      const s = session(sessionId)
      const { agreed, declined, open } = answerVerdict(args, value)
      // 🔒 AN ANSWER TO A CALL'S OWN QUESTION WINS OVER AN OPEN REFUSAL IN THE SAME CARD. The open
      // refusal lands first, so "No" on the agent's own "Delete the old page too?" shuts every call
      // still waiting; the Yes the customer gave Tracy's question in that same card is then applied on
      // top, because it is that call's own answer and the No was never about it. A refusal arriving
      // LATER — a new message, a later card — has nothing to be overridden by, and holds (D34.3).
      const refusedHere = open && openAnswerRefuses(args, value)
      if (refusedHere) declineWaiting(s)
      const typed = typedInstead(args, value)
      for (const [key, c] of s.confirms) {
        const id = confirmQuestionId(key)
        if (agreed.includes(id)) {
          c.said = 'yes'
          c.yesAt = now()
        } else if (declined.includes(id)) {
          c.said = 'no'
          // Typed words and no option (09/10/2026): still a No to the call, said so on its next refusal.
          c.typed = typed.includes(id)
        }
      }
      if (refusedHere || declined.length > 0) s.declined += 1
      if (open) s.answered += 1
    },

    generationOf,

    /**
     * Something changed this site: every conversation's snapshot of it is stale from now on.
     *
     * A counter, not a delete: a relay that started BEFORE this call and answers AFTER it captured the
     * old number, so `rememberInspect` refuses its answer instead of caching a snapshot of a site that
     * has since changed (the race the plan's critic found, D8).
     * @param {unknown} label
     */
    invalidateSite(label) {
      const key = labelKey(label)
      generations.set(key, (generations.get(key) ?? 0) + 1)
    },

    /**
     * This turn's inspect of this site, as this person received it; null when there is none.
     *
     * 🔒 KEYED BY (CONVERSATION, SITE, PERSON), AND EMPTY AT THE NEXT CUSTOMER MESSAGE. The contract
     * door is behind the seat book's `code` toolset: an answer fetched as one person and replayed to
     * another would step round the role gate, so the person is part of the key, and a conversation or
     * a person the call cannot name gets no cache at all. Within one turn and one person it re-serves
     * what that person already received — measured on r2, 88 of 123 inspects, −1,092 s of Joomla tool
     * time; j C04 made 44 relays where 1 answered.
     * @param {InspectKey} key
     * @returns {Snapshot | null}
     */
    inspectCached(key) {
      if (!cacheable(key)) return null
      const s = session(/** @type {string} */ (key.sessionId))
      const hit = s.inspects.get(inspectSlot(key))
      if (hit === undefined) return null
      if (hit.turn !== s.turn || hit.generation !== generationOf(key.label)) {
        s.inspects.delete(inspectSlot(key))
        return null
      }
      return hit
    },

    /**
     * Keep a full inspect answer as this turn's snapshot — unless the site changed while it was being
     * read (`generation` is the number captured BEFORE the relay).
     * @param {InspectKey} key
     * @param {unknown} answer
     * @param {number} generation
     * @returns {boolean} whether it was kept.
     */
    rememberInspect(key, answer, generation) {
      if (!cacheable(key)) return false
      const a = /** @type {Record<string, unknown>} */ (answer)
      if (!a || a.ok !== true || !Array.isArray(a.slots)) return false
      if (generation !== generationOf(key.label)) return false
      const s = session(/** @type {string} */ (key.sessionId))
      s.inspects.set(inspectSlot(key), {
        answer: a,
        revision: typeof a.revision === 'string' ? a.revision : null,
        generation,
        turn: s.turn,
        at: now()
      })
      s.slotShapes.set(inspectSlot(key), { slots: a.slots, turn: s.turn })
      return true
    },

    /**
     * The slots of this turn's latest inspect, as this person received it — kept past a write.
     *
     * 🔒 FOR THE SHAPE OF A SLOT ONLY, NEVER ITS VALUE. CC-15 (a phone into a `tel:` link) and CC-16
     * (evidence a slot requires) read what a slot IS — link or words, `requiresEvidence` — which no
     * content write changes. Since an apply that names its `afterRevision` spares the next apply its
     * inspect (#316, H2), the snapshot a write ended is often the only one this turn has; its values
     * are stale, its shapes are not (review of #316, 26/09).
     * @param {InspectKey} key
     * @returns {unknown[] | null}
     */
    slotShapesOfTurn(key) {
      if (!cacheable(key)) return null
      const s = session(/** @type {string} */ (key.sessionId))
      const hit = s.slotShapes.get(inspectSlot(key))
      return hit !== undefined && hit.turn === s.turn ? hit.slots : null
    },

    /**
     * A record this conversation read: its id, its title, and how long its body was.
     *
     * `chars` is what the WordPress body guard compares a whole-body write against (D6′). A template
     * part is remembered under its post id AND its slug; the guard looks a part up by its slug only,
     * the one address the component writes it by. `absent` records a template part with no stored
     * override and no theme file of that name: the first write creates it.
     *
     * 🔒 THE BASELINE NEVER FALLS WITHIN A TURN. It is the LONGEST body read for the record in this
     * turn, and a write does not lower it (`rememberWritten`). It used to take the stored length after
     * every accepted write, so writes that each kept 80 % walked the home page from 26,884 chars to
     * about 11,000 in four steps of one turn, with no refusal and no `removes` (review, 25/09).
     * @param {unknown} sessionId
     * @param {{ id?: unknown, kind?: unknown, key?: unknown, title?: unknown, chars?: unknown, absent?: boolean, theme?: unknown, themeUnread?: boolean, postType?: unknown, ref?: unknown }} read
     */
    rememberRead(sessionId, read) {
      if (!named(sessionId)) return
      const s = session(sessionId)
      keepTitle(s, read)
      const entry = readEntry(read)
      const held = heldRead(s, entry)
      if (entry.postType === null) entry.postType = held?.postType ?? null
      entry.baseTurn = s.turn
      entry.base =
        entry.chars !== null && held?.base != null && held.baseTurn === s.turn
          ? Math.max(held.base, entry.chars)
          : entry.chars
      // Reading back a record this conversation created does not make it the customer's.
      entry.created = held?.created === true
      keepRead(s, entry)
    },

    /**
     * What the in-tool check found after this conversation's accepted body write (D6′ (b)): the
     * stored length is the record's `chars` from now on, and the next turn's baseline. Within this
     * turn the baseline stays the one the turn started from — unless `reset`: the write carried a
     * `removes` that quoted the customer's own request, and the shorter body is what they asked for.
     * @param {unknown} sessionId
     * @param {{ id?: unknown, kind?: unknown, key?: unknown, title?: unknown, chars?: unknown, ref?: unknown }} read
     * @param {{ reset?: boolean, created?: boolean }} [opts] - `created`: the component answered this
     *   write `created:true`, so the record is this conversation's own from here on.
     */
    rememberWritten(sessionId, read, opts = {}) {
      if (!named(sessionId)) return
      const s = session(sessionId)
      const entry = readEntry(read)
      const held = heldRead(s, entry)
      entry.created = opts.created === true || held?.created === true
      const turnBase = held === undefined ? null : held.baseTurn === s.turn ? held.base : held.chars
      entry.baseTurn = s.turn
      entry.base = opts.reset === true || turnBase === null ? entry.chars : turnBase
      if (entry.title === null) entry.title = held?.title ?? null
      if (entry.id === null) entry.id = held?.id ?? null
      if (entry.postType === null) entry.postType = held?.postType ?? null
      keepRead(s, entry)
    },

    /**
     * Forget every body this conversation read (D6′). After an undo, a delete or a site build, a
     * remembered length may no longer be what the site holds, and a guard judging by it refuses a
     * right write with a false fact — the one way on was to pad the body (review, 25/09: read 26,884,
     * write 60,000, `apply.revert`, then 27,000 refused "post 42 holds 60,000"). Forgotten, the guard
     * asks for a read first.
     * @param {unknown} sessionId
     */
    forgetReads(sessionId) {
      if (!named(sessionId)) return
      const s = session(sessionId)
      s.reads.clear()
      s.partKeys.clear()
    },

    /**
     * The title of a record this conversation read, by its kind and id — the name a write's receipt and
     * the "Changed on the site" card show (council 20/10/2026, D1). Only an exact kind and id: a read of
     * article 4 never names category 4. WordPress reads are kept as `post` whatever the post type, so a
     * `page` write of the same id is that post. Null when none was read.
     * @param {unknown} sessionId
     * @param {{ kind?: unknown, id?: unknown }} address
     * @returns {string | null}
     */
    titleOf(sessionId, address) {
      if (!named(sessionId)) return null
      const id = Number(address?.id)
      const kind = typeof address?.kind === 'string' ? address.kind : ''
      if (kind === '' || !Number.isInteger(id) || id <= 0) return null
      return session(sessionId).titles.get(`${kind}:${id}`) ?? null
    },

    /**
     * A record's title Tracy read itself, by its kind and id (`site-call.mjs` `recordTitleOf`).
     * @param {unknown} sessionId
     * @param {{ kind?: unknown, id?: unknown, title?: unknown }} record
     */
    rememberTitle(sessionId, record) {
      if (!named(sessionId)) return
      keepTitle(session(sessionId), record)
    },

    /**
     * What this conversation last read of one record — a post by its id, a template part by its
     * slug ONLY — with the `baseline` a whole-body write to it is judged against this turn.
     *
     * 🔒 A PART'S ID NEVER DECIDES WHICH RECORD IS MEANT. The component writes a part by its slug and
     * ignores any id (`write_template_part($key, $fields)`); looked up by id first, a stray id naming
     * another, smaller record this conversation read chose the baseline. Measured (review, 25/09):
     * post 5 (100 chars) read, then `{kind:"templatePart", key:"header", id:5, fields:{content: 90
     * chars}}` — the 7,848-char header, never read, would have been cut to 90.
     * @param {unknown} sessionId
     * @param {{ id?: unknown, key?: unknown, kind?: unknown, ref?: unknown }} address - `ref`: a Joomla or
     *   EmDash body field ({@link bodyRef}), looked up by that string alone.
     * @returns {ReadSeen | null}
     */
    readOf(sessionId, address) {
      if (!named(sessionId)) return null
      const s = session(sessionId)
      /** @type {Read | undefined} */
      let hit
      if (typeof address?.ref === 'string' && address.ref !== '') hit = s.reads.get(address.ref)
      else if (address?.kind === 'templatePart')
        hit = typeof address.key === 'string' ? s.partKeys.get(address.key) : undefined
      else {
        const id = Number(address?.id)
        if (Number.isInteger(id) && id > 0) hit = s.reads.get(id)
      }
      if (hit === undefined) return null
      return { ...hit, baseline: hit.baseTurn === s.turn && hit.base !== null ? hit.base : hit.chars }
    },

    /**
     * A write this conversation sent, and how it ended: `ok` (the component answered it), `unknown`
     * (the answer never came, so it may have landed), or neither (refused).
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {{ applyId?: unknown, asked?: unknown, ok?: boolean, unknown?: boolean, record?: string | null }} write
     *   `record` names the WordPress record the write addressed (`wpRecordOf`, E2.2): given for an
     *   accepted write, and for one whose outcome is unknown — `null` there when the call named no
     *   record the steps can be matched to (a create). Left out, the write is not one E2.2 counts.
     */
    rememberWrite(sessionId, label, write) {
      const applyId = typeof write?.applyId === 'string' ? write.applyId : ''
      if (applyId === '' || !named(sessionId)) return
      const r = receiptsOf(sessionId, label)
      if (typeof write.asked === 'string' && write.asked !== '' && write.asked !== applyId) {
        r.idMap.set(write.asked, applyId)
        while (r.idMap.size > MAX_RECEIPTS * 2) {
          const oldest = r.idMap.keys().next().value
          if (oldest === undefined) break
          r.idMap.delete(oldest)
        }
      }
      if (write.unknown === true) r.unknown.add(applyId)
      else r.unknown.delete(applyId)
      /**
       * 🔒 AN UNKNOWN OUTCOME STAYS UNKNOWN FOR THE COUNT. `r.unknown` above is D9's question ("reuse
       * this contract id so the component replays?") and a later accepted write under the same id
       * rightly clears it. The count E2.2 makes is another question: the lost write may have left a
       * step in the receipt, and an id the model reuses across writes serves them all (Tracy's own id is
       * one per write since 26/10/2026), so a later accepted write to the
       * same record would read that step as ITS OWN lost write landing (review, 25/09). Kept per
       * record; `UNNAMED` for a write whose record cannot be matched (a create: its step names an id
       * nobody here knows, which the model may write to next).
       */
      if (write.unknown === true && write.record !== undefined) {
        let held = r.unknownRecords.get(applyId)
        if (held === undefined) {
          held = new Set()
          r.unknownRecords.set(applyId, held)
          while (r.unknownRecords.size > MAX_RECEIPTS) {
            const oldest = r.unknownRecords.keys().next().value
            if (oldest === undefined) break
            r.unknownRecords.delete(oldest)
          }
        }
        held.add(typeof write.record === 'string' && write.record !== '' ? write.record : UNNAMED)
      }
      if (write.ok === true) {
        r.ok.add(applyId)
        r.applyIds = [...r.applyIds.filter((id) => id !== applyId), applyId].slice(-MAX_RECEIPTS)
        // E2.2: how many accepted writes this apply id holds for each record (`wpRecordOf`).
        if (typeof write.record === 'string' && write.record !== '') {
          let counts = r.records.get(applyId)
          if (counts === undefined) {
            counts = new Map()
            r.records.set(applyId, counts)
            while (r.records.size > MAX_RECEIPTS) {
              const oldest = r.records.keys().next().value
              if (oldest === undefined) break
              r.records.delete(oldest)
            }
          }
          counts.set(write.record, (counts.get(write.record) ?? 0) + 1)
        }
      }
    },

    /**
     * How many writes to `record` under `applyId` this conversation saw accepted (E2.2).
     *
     * 🔒 COUNTED, NOT LOOKED UP. One apply id may serve several writes (an id the model reuses; Tracy's
     * own `wp-` id served a whole turn under D9 until 26/10/2026, one per write since), and a WordPress
     * `apply.list` step is only `{op, created, kind, id, key}` — no value, no time (`Engine.php:
     * 1481-1507`) — so "a step for this record exists" would find an EARLIER write to the same record:
     * 12 of the 49 accepted r2 WordPress writes were followed by another write to the same record in
     * the same case. What tells a lost write that landed from one that did not is the COUNT of steps
     * for the record against this number.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {unknown} applyId
     * @param {unknown} record - `wpRecordOf(…)`.
     * @returns {number | null} null when this conversation cannot be named (nothing is counted then).
     */
    acceptedWrites(sessionId, label, applyId, record) {
      if (!named(sessionId) || typeof applyId !== 'string' || typeof record !== 'string') return null
      return receiptsOf(sessionId, label).records.get(applyId)?.get(record) ?? 0
    },

    /**
     * Whether a write under `applyId` whose outcome stayed unknown may have left a step for `record`
     * (E2.2): one to this record, or one whose record could not be named. Then the steps cannot be
     * counted — the receipt may hold a step nobody here saw accepted — and a lost write to `record` is
     * `OUTCOME_UNKNOWN`, never "landed". True when the conversation cannot be named (nothing counted).
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {unknown} applyId
     * @param {unknown} record - `wpRecordOf(…)`.
     */
    unknownWrite(sessionId, label, applyId, record) {
      if (!named(sessionId) || typeof applyId !== 'string' || typeof record !== 'string') return true
      const held = receiptsOf(sessionId, label).unknownRecords.get(applyId)
      return held !== undefined && (held.has(record) || held.has(UNNAMED))
    },

    /**
     * The contract revision this conversation last read of a site (CC-12): from an inspect it
     * received, or an accepted apply's own answer, in any turn.
     *
     * 🔒 A REVISION IS WHAT A WRITE IS BASED ON, SO IT OUTLIVES THE SNAPSHOT. The component refuses
     * an apply without `expected_revision` only after a full inspect ("Content changed; inspect
     * again", 12–20 s, `QuickstartContract.php` `plan()`); the revision this conversation read is the
     * one the model's words were chosen against, and if the site moved since, the component still
     * says so — a fill never writes over a change nobody here saw.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @returns {string | null}
     */
    revisionOf(sessionId, label) {
      if (!named(sessionId)) return null
      return session(sessionId).revisions.get(labelKey(label)) ?? null
    },

    /**
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {unknown} revision - null forgets it (after "Content changed": filling it again would
     *   meet the same refusal).
     */
    rememberRevision(sessionId, label, revision) {
      if (!named(sessionId)) return
      const s = session(sessionId)
      if (typeof revision === 'string' && revision !== '') s.revisions.set(labelKey(label), revision)
      else s.revisions.delete(labelKey(label))
      while (s.revisions.size > MAX_RECEIPTS) {
        const oldest = s.revisions.keys().next().value
        if (oldest === undefined) break
        s.revisions.delete(oldest)
      }
    },

    /**
     * The site's own host name, from a read's `site.url` (a content.read envelope, its describe
     * document or its page list). What `libraryPath` needs to tell this site's own address for a
     * picture from another host's: the component's link rule compares the host and nothing else.
     * @param {unknown} label
     * @param {unknown} answer - a `content.read` answer as the model receives it.
     */
    rememberSiteHost(label, answer) {
      const url = /** @type {any} */ (answer)?.site?.url
      if (typeof url !== 'string') return
      let host = ''
      try {
        host = new URL(url).hostname.toLowerCase()
      } catch {
        return
      }
      if (host === '') return
      const key = labelKey(label)
      siteHosts.delete(key)
      siteHosts.set(key, host)
      while (siteHosts.size > MAX_HOSTS) {
        const oldest = siteHosts.keys().next().value
        if (oldest === undefined) break
        siteHosts.delete(oldest)
      }
    },

    /**
     * @param {unknown} label
     * @returns {string} the host name a read of this site named, or '' when none did.
     */
    siteHostOf(label) {
      return siteHosts.get(labelKey(label)) ?? ''
    },

    /**
     * Whether this conversation has read this site's `content.read {describe:true}` (Content API v2).
     *
     * 🔒 PER CONVERSATION, NOT PER SITE: what matters is what THIS model has in its context — another
     * conversation's describe of the same site taught this one nothing. And NOT reset by
     * `invalidateSite`: a write changes content, never the types, block kinds and constraints the
     * describe document lists. A call with no conversation has no answer (null), and is not nudged.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @returns {boolean | null}
     */
    describeSeen(sessionId, label) {
      if (!named(sessionId)) return null
      return session(sessionId).describes.has(labelKey(label))
    },

    /**
     * @param {unknown} sessionId
     * @param {unknown} label
     */
    rememberDescribe(sessionId, label) {
      if (!named(sessionId)) return
      const s = session(sessionId)
      s.describes.add(labelKey(label))
      while (s.describes.size > MAX_RECEIPTS) {
        const oldest = s.describes.values().next().value
        if (oldest === undefined) break
        s.describes.delete(oldest)
      }
    },

    /**
     * 🔒 CONTENT API v2 (D1): WHICH CONTENT, AT WHICH REVISION, EACH SLOT THIS CONVERSATION READ BELONGS
     * TO — so a contract apply after a `content.read` is based on what was read (the Claude Cowork plugin's
     * `expected_content_revisions`), with no inspect. Learned from a v1 envelope only (its
     * `protocol.cowork.capability` is `v1`) and only for a content that carries its `revision`:
     * a slot's `slotKey` in the content's own fields, its blocks' fields and their items' fields.
     *
     * PER CONVERSATION, LIKE CC-12's REVISION, NOT PER SITE: a revision says which values the words
     * were chosen against, and another conversation's read put nothing in front of this model.
     * Stamped with the site's generation: any write (`invalidateSite`) makes every entry stale, and
     * a read that left before a write landed (`generation` captured before the send) is not kept.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {unknown} answer - the `content.read` answer as the model receives it.
     * @param {number} [generation] - the site's generation before the read was sent; now by default.
     * @returns {number} how many slots were learned.
     */
    rememberContentRevisions(sessionId, label, answer, generation = generationOf(label)) {
      if (!named(sessionId) || generation !== generationOf(label)) return 0
      const a = /** @type {any} */ (answer)
      if (
        a?.schemaVersion !== 'tracy-content/v1' ||
        (a?.protocol?.cowork ?? a?.protocol?.receiver)?.capability !== 'v1' // vocabulary-allow: pre-rename key in published data
      )
        return 0
      if (!Array.isArray(a.contents)) return 0
      const map = slotRevisions(session(sessionId), label)
      const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])
      let learned = 0
      for (const content of a.contents) {
        const contentId = typeof content?.id === 'string' ? content.id : ''
        const revision = typeof content?.revision === 'string' ? content.revision : ''
        if (contentId === '' || revision === '') continue
        const fields = [
          ...list(content.fields),
          ...list(content.blocks).flatMap((/** @type {any} */ b) => [
            ...list(b?.fields),
            ...list(b?.items).flatMap((/** @type {any} */ i) => list(i?.fields))
          ])
        ]
        for (const field of fields) {
          const slotKey = typeof field?.slotKey === 'string' ? field.slotKey : ''
          if (slotKey === '') continue
          map.delete(slotKey)
          map.set(slotKey, { contentId, revision, generation })
          learned += 1
        }
      }
      while (map.size > MAX_SLOT_REVISIONS) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
      return learned
    },

    /**
     * An accepted apply's receipt names each written content's new revision (`contentRevisions`).
     * Called AFTER the write invalidated the site: the slots of those contents are current again,
     * at the new revision, so the next apply to the same page needs no read; every other content's
     * slots stay stale.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {unknown} contentRevisions - `{contentId: revision}`.
     */
    rememberAppliedRevisions(sessionId, label, contentRevisions) {
      if (!named(sessionId) || contentRevisions === null || typeof contentRevisions !== 'object') return
      const fresh = /** @type {Record<string, unknown>} */ (contentRevisions)
      const map = slotRevisions(session(sessionId), label)
      const generation = generationOf(label)
      for (const [slotKey, entry] of map) {
        const revision = fresh[entry.contentId]
        if (typeof revision === 'string' && revision !== '')
          map.set(slotKey, { contentId: entry.contentId, revision, generation })
      }
    },

    /**
     * An apply REFUSED BEFORE IT WROTE ANYTHING left every content as it was, so the revisions it was
     * sent on are still what this conversation read — but the refusal's own invalidation made them
     * stale, and the corrected apply then answered INSPECT_FIRST for a read the model had made a
     * step earlier (round 7: three WordPress picture runs whose first apply was refused for how its
     * picture was written). They are stamped with the site's generation as it is now.
     *
     * 🔒 ONLY A REVISION THIS CONVERSATION ALREADY HOLDS FOR THAT CONTENT, whatever the apply carried:
     * one the model typed, or one the site had moved past, is never made current here. Called after the
     * relay and its invalidation, and only for a refusal the caller knows wrote nothing.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {unknown} contentRevisions - the `expected_content_revisions` the refused apply was sent on.
     * @returns {number} how many slots were kept.
     */
    keepContentRevisions(sessionId, label, contentRevisions) {
      if (!named(sessionId) || contentRevisions === null || typeof contentRevisions !== 'object') return 0
      const sent = /** @type {Record<string, unknown>} */ (contentRevisions)
      const generation = generationOf(label)
      const map = slotRevisions(session(sessionId), label)
      let kept = 0
      for (const [slotKey, entry] of map) {
        if (sent[entry.contentId] !== entry.revision) continue
        map.set(slotKey, { ...entry, generation })
        kept += 1
      }
      return kept
    },

    /**
     * `{contentId: revision}` for every content the given slots belong to, as this conversation read
     * them since the site's last write — or null when any slot was not read (or none was asked).
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {readonly string[]} slotKeys
     * @returns {Record<string, string> | null}
     */
    contentRevisionsFor(sessionId, label, slotKeys) {
      if (!named(sessionId) || !Array.isArray(slotKeys) || slotKeys.length === 0) return null
      const map = session(sessionId).contentRevisions.get(labelKey(label))
      if (map === undefined) return null
      const generation = generationOf(label)
      /** @type {Record<string, string>} */
      const out = {}
      for (const slotKey of slotKeys) {
        const entry = map.get(slotKey)
        if (entry === undefined || entry.generation !== generation) return null
        if (out[entry.contentId] !== undefined && out[entry.contentId] !== entry.revision) return null
        out[entry.contentId] = entry.revision
      }
      return out
    },

    /**
     * The refusal this exact call got earlier in this turn, while nothing has changed the site since
     * (E3.2) — or null. Read before the call is sent.
     *
     * 🔒 VALID FOR ONE TURN AND ONE STATE OF THE SITE. The record carries the turn and the site's
     * generation it was refused in: a customer message (`newTurn`) or any site-changing relay to that
     * label (`invalidateSite`, whoever sent it) ends it, because either may make the same call right.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {string} key - `sameCallKey(…)`.
     */
    refusedBefore(sessionId, label, key) {
      if (!named(sessionId) || typeof key !== 'string') return null
      const s = session(sessionId)
      const hit = s.refused.get(key)
      if (hit === undefined) return null
      if (hit.turn !== s.turn || hit.label !== labelKey(label) || hit.generation !== generationOf(label)) {
        s.refused.delete(key)
        return null
      }
      return { code: hit.code, error: hit.error, next: hit.next }
    },

    /**
     * Remember a refusal under the call's key — only one {@link memoisableRefusal} allows (E3.2),
     * with the site's generation as it is NOW: call it after the relay and its invalidation.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {string} key
     * @param {unknown} answer - the refusal as the model reads it, `next` included.
     * @returns {boolean} whether it was remembered.
     */
    rememberRefused(sessionId, label, key, answer) {
      if (!named(sessionId) || typeof key !== 'string' || !memoisableRefusal(answer)) return false
      const a = /** @type {Record<string, unknown>} */ (answer)
      const s = session(sessionId)
      const code =
        typeof a.code === 'string' && a.code !== '' ? a.code : typeof a.error === 'string' ? a.error : ''
      const text = typeof a.message === 'string' && a.message !== '' ? a.message : a.error
      s.refused.delete(key)
      s.refused.set(key, {
        code,
        error: typeof text === 'string' ? text.slice(0, 160) : '',
        next: typeof a.next === 'string' ? a.next : null,
        turn: s.turn,
        generation: generationOf(label),
        label: labelKey(label)
      })
      while (s.refused.size > MAX_REFUSED) {
        const oldest = s.refused.keys().next().value
        if (oldest === undefined) break
        s.refused.delete(oldest)
      }
      return true
    },

    /**
     * Count a length-judged `BODY_SHRINK` on one record in this turn (W1 (b)), and answer how many
     * that record has had, this one included — 0 when nothing can be counted (no conversation, no
     * record).
     *
     * 🔒 THE SECOND ONE ASKS THE CUSTOMER. The after-final bench C47 (benchwp01, 25/09): 16 steps,
     * 15 refusals, 9 of them BODY_SHRINK. A retry with another body is another call, so E3.2's
     * same-call memo cannot stop the loop. Only the customer can say what may go, and their reply is
     * what a `removes` then quotes; a customer message (`newTurn`) starts the count again.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {string | null} record - `wpRecordOf(…)`.
     */
    shrinkRefused(sessionId, label, record) {
      if (!named(sessionId) || typeof record !== 'string' || record === '') return 0
      const s = session(sessionId)
      const key = `${labelKey(label)}\n${record}`
      const count = (s.shrinks.get(key) ?? 0) + 1
      s.shrinks.delete(key)
      s.shrinks.set(key, count)
      while (s.shrinks.size > MAX_REFUSED) {
        const oldest = s.shrinks.keys().next().value
        if (oldest === undefined) break
        s.shrinks.delete(oldest)
      }
      return count
    },

    /**
     * A dead road on a site (E3.3): its component answered `bad_action` for `action` (`what:
     * 'missing'`), or `LEGACY_STRUCTURE_CODE` for a structural write (`what: 'contractBound'`). Remembered for
     * an hour per site; `answer` is the first refusal, kept to be said again at once.
     *
     * 🔒 A FACT ABOUT THE SITE, NOT ABOUT A PERSON. A component that lacks an action lacks it for
     * everyone, so this is keyed by label alone; nothing personal is kept (the answer is the
     * component's own refusal of an action name). Measured on r2 as the class the loop spent most on
     * after the fences: `SITE_UNREACHABLE` 70 calls with 20 repeats, a missing reader asked again and
     * again within one case.
     * @param {unknown} label
     *
     * `noContentRevisions` (Content API v2, D2): the site's Claude Cowork plugin predates `expected_content_revisions`
     * (an apply carrying it came back "Content changed; inspect again" with no `errors[]`), so its applies
     * go the old road for the hour — each wasted try costs the Claude Cowork plugin a full inspect (12–20 s).
     *
     * `noListSearch` (30/09/2026): the site's plugin answered a `content.list` that carried `search` with
     * the whole list and no `search` echo (the relay's `LIST_SEARCH_UNSUPPORTED`), so a search on it is
     * refused before the relay for FIFTEEN minutes, not the hour (`LEARN_LIST_SEARCH_TTL_MS`).
     * @param {'missing' | 'contractBound' | 'noContentRevisions' | 'noListSearch'} what
     * @param {string} [action]
     * @param {unknown} [answer]
     */
    learn(label, what, action, answer) {
      const key = labelKey(label)
      let site = learnedSites.get(key)
      if (site === undefined) {
        site = { missing: new Map(), contractBound: null }
        learnedSites.set(key, site)
        while (learnedSites.size > MAX_LEARNED) {
          const oldest = learnedSites.keys().next().value
          if (oldest === undefined) break
          learnedSites.delete(oldest)
        }
      }
      if (what === 'contractBound') site.contractBound = now()
      else if (what === 'noContentRevisions') site.noContentRevisions = now()
      else if (what === 'noListSearch') site.noListSearch = now()
      else if (what === 'missing' && typeof action === 'string' && action !== '') {
        const a = answer !== null && typeof answer === 'object' && !Array.isArray(answer) ? answer : null
        site.missing.set(action, {
          at: now(),
          answer: a === null ? null : /** @type {Record<string, unknown>} */ ({ ...a })
        })
        while (site.missing.size > 50) {
          const oldest = site.missing.keys().next().value
          if (oldest === undefined) break
          site.missing.delete(oldest)
        }
      }
    },

    /**
     * What this site's component was found to lack in the last hour (E3.3): the actions it answered
     * `bad_action` for, and whether it answered `LEGACY_STRUCTURE_CODE` — and whether its plugin ignored a
     * `content.list` search in the last fifteen minutes.
     * @param {unknown} label
     * @returns {{ missing: string[], contractBound: boolean, noContentRevisions: boolean, noListSearch: boolean }}
     */
    learned(label) {
      return learnedOf(label)
    },

    /**
     * The first refusal a dead road answered, for a road that is still dead (E3.3), or null — how a
     * road outside the relay (the page read, `index.ts`) answers at once instead of asking again.
     * @param {unknown} label
     * @param {string} action
     * @returns {Record<string, unknown> | null}
     */
    deadRoad(label, action) {
      const site = learnedSites.get(labelKey(label))
      const entry = site?.missing.get(action)
      if (entry === undefined || now() - entry.at >= learnTtlMs) return null
      return entry.answer === null ? null : { ...entry.answer }
    },

    /**
     * Forget what a site was found to lack: its component changed (`core.upgrade`,
     * `extension.install` went through), so the next call asks it again.
     * @param {unknown} label
     */
    unlearn(label) {
      learnedSites.delete(labelKey(label))
    },

    /**
     * A read of this site's content failed just now: how many have failed in a row, this one
     * included (1 for the first, or when the last one is older than {@link READ_FAILURE_TTL_MS}).
     * NOT E3.2's memo: a read that did not answer is never remembered as refused, because its own
     * next asks for the same call again — this only counts, so the second refusal can say the road
     * that worked instead of the retry the first one offered. A fact about the site, not a person.
     * @param {unknown} label
     * @returns {number}
     */
    readFailed(label) {
      const key = labelKey(label)
      const hit = readFailures.get(key)
      const n = hit !== undefined && now() - hit.at < READ_FAILURE_TTL_MS ? hit.n + 1 : 1
      readFailures.delete(key)
      readFailures.set(key, { n, at: now() })
      while (readFailures.size > MAX_LEARNED) {
        const oldest = readFailures.keys().next().value
        if (oldest === undefined) break
        readFailures.delete(oldest)
      }
      return n
    },

    /**
     * A read of this site's content answered: the run of failures ends.
     * @param {unknown} label
     */
    readServed(label) {
      readFailures.delete(labelKey(label))
    },

    /**
     * What `normalizeCall` needs to know about this conversation on this site.
     * @param {unknown} sessionId
     * @param {unknown} label
     */
    factsFor(sessionId, label) {
      // What the site's component lacks (E3.3) is a fact about the site: said to every conversation,
      // a nameless one included.
      const { missing } = learnedOf(label)
      if (!named(sessionId))
        return {
          applyIds: [],
          okIds: [],
          unknownIds: [],
          idMap: {},
          postsRead: [],
          missing,
          lastRevision: null
        }
      const s = session(sessionId)
      const r = receiptsOf(sessionId, label)
      return {
        applyIds: [...r.applyIds],
        okIds: [...r.ok],
        unknownIds: [...r.unknown],
        idMap: Object.fromEntries(r.idMap),
        postsRead: [...s.reads.values()]
          .filter((read) => read.kind === 'post' && read.id !== null)
          .slice(-5)
          .map((read) => ({ id: /** @type {number} */ (read.id), title: read.title ?? '' })),
        missing,
        lastRevision: s.revisions.get(labelKey(label)) ?? null
      }
    },

    /**
     * The apply id of one write Tracy names for the agent: `<prefix>-<turn's mint>-<n>`, the n-th write of this
     * turn on this site. A call that names its own id never comes here (`normalize.mjs` `ensureApplyId`).
     *
     * 🔒 ONE WRITE, ONE APPLY ID (product owner, 26/10/2026; was D9's one id per turn). Every write of a turn
     * under one `wp-` id made that id's revert the only way back, and it cannot go back alone: on a test
     * site one id held a whole turn's writes, interleaved with other changes' ids, and undoing the build newest-first met
     * CONFLICT there and at every older write of the same posts (92 of 152 apply ids). Each write now has its
     * own id, so a whole build reverts newest-first, call by call. The turn's mint stays in the id: a counter
     * alone would start again at every dsh restart and name a receipt the site already holds (`mint`), and
     * one turn's writes still share a visible stem, with `n` giving their order.
     * @param {unknown} sessionId
     * @param {unknown} label
     * @param {string} [prefix] - `wp` on WordPress, `jo` on Joomla.
     */
    wpApplyId(sessionId, label, prefix = 'wp') {
      if (!named(sessionId)) return mint(prefix)
      const s = session(sessionId)
      const key = `${labelKey(label)}\n${prefix}`
      const held = s.wp.get(key)
      if (held !== undefined && held.turn === s.turn) {
        held.n++
        return `${prefix}-${held.base}-${held.n}`
      }
      const base = mint(prefix).slice(prefix.length + 1)
      s.wp.set(key, { turn: s.turn, base, n: 1 })
      return `${prefix}-${base}-1`
    },

    /**
     * A destructive call was refused until the customer answers (D34). Only a refusal calls this: a
     * call that went through asks nothing, so nothing afterwards is an answer to it.
     * @param {unknown} sessionId
     * @param {unknown} call - a key string, or the call itself (`confirm` is ignored).
     * @param {boolean} [own] - the refusal carried a question of Tracy's (`ask`), as every
     *   `CONFIRM_FIRST` does; false for a refusal that carries none (`PENDING_DRAFT`).
     * @param {readonly string[]} [facts] - what the card must name as written (`consequence.mjs`):
     *   which record, how many places, which amounts — the agent may word the rest
     * @param {'delete' | 'hide' | null} [intent] - what the call does to a record, which the card must
     *   say in the person's language (`confirm-words.mjs`); null for any other change
     */
    confirmAsked(sessionId, call, own = true, facts = [], intent = null) {
      if (!named(sessionId)) return
      const s = session(sessionId)
      const key = callKeyOf(call)
      s.confirms.delete(key)
      s.confirms.set(key, {
        askedAt: s.answered,
        said: null,
        own,
        facts: facts.filter((f) => typeof f === 'string' && f.trim() !== ''),
        yesAt: 0,
        intent
      })
      while (s.confirms.size > MAX_CONFIRMS) {
        const oldest = s.confirms.keys().next().value
        if (oldest === undefined) break
        s.confirms.delete(oldest)
      }
    },

    /**
     * Whether the customer agreed to this call since it was refused. True once: the confirmation is
     * spent by the call it allowed, so a second delete asks again.
     *
     * 🔒 D34.4 (28/09/2026): A CALL THAT CARRIES A QUESTION IS OPENED BY THAT QUESTION ONLY. An open
     * answer — a new message, or an answer to a question the agent wrote itself — used to open every
     * refused call still waiting, so a card holding Tracy's question for the ENGLISH row plus the
     * agent's own "Which language?" answered "English only" opened the RUSSIAN row's delete, a call
     * the customer was never shown. Now an open answer opens only a refusal that carries no question
     * of Tracy's (`own: false` — `PENDING_DRAFT`, whose only way through it is); every
     * `CONFIRM_FIRST` waits for the answer to its own question, and gets asked again otherwise.
     * @param {unknown} sessionId
     * @param {unknown} call
     */
    confirmed(sessionId, call) {
      if (!named(sessionId)) return false
      const s = session(sessionId)
      const key = callKeyOf(call)
      const c = s.confirms.get(key)
      if (c === undefined || c.said === 'no') return false
      if (c.said !== 'yes' && (c.own || s.answered <= c.askedAt)) return false
      // A yes older than CONFIRM_TTL_MS opens nothing: the call is refused and asked again.
      if (c.said === 'yes' && c.yesAt > 0 && now() - c.yesAt > CONFIRM_TTL_MS) {
        s.confirms.delete(key)
        return false
      }
      s.confirms.delete(key)
      return true
    },

    /**
     * Whether the customer's last answer to this call's own question was words they TYPED, with no option
     * chosen (`typedInstead`) — read before the call is refused again (`confirmAsked` starts a new record).
     * The answer stays a No; this only lets the next refusal say why (09/10/2026, bench hb EmDash pick delete:
     * the simulated customer typed "just do what I asked" twice, each answer opened nothing, and the agent,
     * told the same next every time, unpublished the post by another road and failed the case).
     * @param {unknown} sessionId
     * @param {unknown} call
     */
    answeredByTyping(sessionId, call) {
      if (!named(sessionId)) return false
      const c = session(sessionId).confirms.get(callKeyOf(call))
      return c !== undefined && c.said === 'no' && c.typed === true
    },

    /**
     * Why an `ask_user_question` card must not be shown, or null when it may (E5.e4).
     *
     * 🔒 A `confirm-…` ID IS TRACY'S TO GIVE. `answerVerdict` reads such an id as the question of one
     * refused call, so a card whose id Tracy never wrote is answered for no call at all: measured on
     * dev 04/10/2026, the agent sent the refusal's question in its own words under `confirm-delete`,
     * the customer pressed "Yes, go ahead", and the EmDash delete was refused three more times — the
     * article stayed online. Refused before the card is shown, the agent re-sends it with the right id
     * and the customer is asked once. Ids the agent writes for its own questions (no prefix) pass.
     * @param {unknown} sessionId
     * @param {unknown} args - the `ask_user_question` arguments
     * @param {string} [language] - the conversation's language, as a name (`languageName`): the card
     *   of a waiting call must say yes / no and the call's own verb in it (`confirm-words.mjs`)
     * @returns {string | null}
     */
    confirmCardRefusal(sessionId, args, language = '') {
      const questions = Array.isArray(/** @type {any} */ (args)?.questions)
        ? /** @type {any} */ (args).questions
        : []
      const waiting = new Map()
      /** @type {Map<string, string[]>} */
      const factsOf = new Map()
      /** @type {Map<string, 'delete' | 'hide' | null>} */
      const intentOf = new Map()
      if (named(sessionId))
        for (const [key, c] of session(sessionId).confirms)
          if (c.own && c.said === null) {
            waiting.set(confirmQuestionId(key), key)
            factsOf.set(confirmQuestionId(key), c.facts ?? [])
            intentOf.set(confirmQuestionId(key), c.intent ?? null)
          }
      // 🔒 THE CARD MEANS WHAT THE DOOR MEANS (council 20/10/2026, live run): the first option says yes,
      // the second no, and a delete is called a delete — checked in the conversation's language, the
      // words the agent chose being free. dsh lets a listener deny a card, not rewrite it.
      if (language !== '')
        for (const q of questions) {
          const id = q?.id
          if (typeof id !== 'string' || !waiting.has(id)) continue
          const problem = cardMeaningProblem(q, language, intentOf.get(id) ?? null)
          if (problem !== null)
            return `ask_user_question was not shown: question ${JSON.stringify(id)} — ${problem}. Keep its id and the go-ahead option first, and show it again.`
        }
      // 🔒 THE CARD NAMES WHAT THE DOOR NAMES (council 19/10/2026). The agent words the question in the
      // customer's language, so the door cannot hold the words; it holds what may not change in them —
      // the record, the count, the amounts (`consequence.mjs` facts). A card that leaves one out could
      // ask about another change than the one its yes opens, and is refused before it is shown.
      for (const q of questions) {
        const id = q?.id
        const facts = typeof id === 'string' ? factsOf.get(id) : undefined
        if (!facts || facts.length === 0) continue
        const said = foldWords(`${q?.question ?? ''} ${q?.header ?? ''}`)
        const missing = facts.filter((fact) => !said.includes(foldWords(fact)))
        if (missing.length > 0)
          return `ask_user_question was not shown: question ${JSON.stringify(id)} must name ${missing.map((f) => JSON.stringify(f)).join(', ')} as written, as the refusal's ask does; word the rest in the customer's language.`
      }
      const foreign = questions
        .map((/** @type {any} */ q) => q?.id)
        .filter(
          (/** @type {any} */ id) =>
            typeof id === 'string' && id.startsWith(CONFIRM_QUESTION_PREFIX) && !waiting.has(id)
        )
      if (foreign.length === 0) return null
      const ids = foreign.map((/** @type {any} */ id) => JSON.stringify(id)).join(', ')
      const head = `ask_user_question was not shown: question id ${ids} is not one Tracy wrote, so the customer's answer to it would open nothing.`
      if (waiting.size === 0)
        return `${head} Give your own question an id that does not start with "${CONFIRM_QUESTION_PREFIX}".`
      const asks = [...waiting].map(([id, key]) => `"${id}" (for ${key})`).join('; ')
      return `${head} Waiting for the customer: ${asks}. Send that refusal's ask with its id unchanged and its options in the same order; only the words may be the customer's.`
    },

    /**
     * How many times the customer has refused in this conversation (F3.1). A counter, so a caller
     * holding an agreement of its own — the entry a group delete was agreed for
     * (`emdash-call.mjs`) — can see that a No has landed since, WITHOUT a new turn: an
     * `ask_user_question` answer is not a new message, and the group agreement outlived it.
     * @param {unknown} sessionId
     */
    declinedCount(sessionId) {
      return named(sessionId) ? session(sessionId).declined : 0
    }
  }
}

/** @typedef {ReturnType<typeof createCallMemory>} CallMemory */

// ── D34: the question a refused destructive call hands the agent, and what its answer means ────────

/** At most this many titles one conversation keeps (`titleOf`), oldest dropped first. */
const MAX_TITLES = 500

/**
 * Keep a record's title by its kind and id, as read from the site. WordPress records are kept as `post`
 * and under their post type too, so a write that names the type (`page`) finds the read.
 * @param {{ titles: Map<string, string> }} s
 * @param {{ kind?: unknown, id?: unknown, title?: unknown, postType?: unknown }} record
 */
function keepTitle(s, record) {
  const id = Number(record?.id)
  const title = typeof record?.title === 'string' ? record.title.replace(/\s+/g, ' ').trim() : ''
  if (!Number.isInteger(id) || id <= 0 || title === '' || typeof record?.kind !== 'string') return
  const kinds = [record.kind, ...(typeof record.postType === 'string' ? [record.postType] : [])]
  for (const kind of kinds) {
    s.titles.delete(`${kind}:${id}`)
    s.titles.set(`${kind}:${id}`, title.slice(0, 120))
  }
  while (s.titles.size > MAX_TITLES) s.titles.delete(/** @type {string} */ (s.titles.keys().next().value))
}

/** Words as a card and a fact are compared: one form, one case, single spaces. @param {unknown} v */
const foldWords = (v) => String(v).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

/** The id of a question Tracy wrote for a `CONFIRM_FIRST` starts with this. */
export const CONFIRM_QUESTION_PREFIX = 'confirm-'

/**
 * The id of the question Tracy writes for a refused call: its confirm key, hashed. The same key is
 * the same question, so the memory can tell which call an answer is for (`customerAnswered`).
 * @param {string} key - the refused call's confirm key
 */
export function confirmQuestionId(key) {
  return `${CONFIRM_QUESTION_PREFIX}${createHash('sha256').update(key).digest('hex').slice(0, 10)}`
}

/**
 * The `ask_user_question` arguments a `CONFIRM_FIRST` carries as `ask`: one question whose id ties
 * the answer to this refused call and whose FIRST option is the go-ahead. The agent puts the words in
 * the customer's language; the order is what `answerVerdict` reads.
 * @param {string} key - the refused call's confirm key
 * @param {string} what - the change, as the refusal's error says it
 */
export function confirmQuestion(key, what) {
  return {
    questions: [
      {
        id: confirmQuestionId(key),
        header: 'Confirm',
        question: `${what} Go ahead?`,
        options: [{ label: 'Yes, go ahead' }, { label: 'No, keep it' }]
      }
    ]
  }
}

/** The words `confirmQuestion` writes, which the agent puts in the person's language before showing them. */
const CONFIRM_ENGLISH = Object.freeze({
  go: 'Yes, go ahead',
  keep: 'No, keep it',
  ask: 'Go ahead?',
  header: 'Confirm'
})

/**
 * The refusal for a card that shows the door's question still in its English words to a person who
 * speaks another language, or null to let it be shown (live run 20/10/2026, Voice on a Joomla stand:
 * the agent forwarded the refusal's ask as it came, Voice read "This deletes something from your site.
 * Yes, go ahead or No, keep it." to a Vietnamese customer, their spoken yes matched no option, and the
 * yes opened nothing). The id and the option order are what the answer is read by
 * (`answerVerdict`), so the agent rewords freely; only an untouched English card is stopped.
 * @param {unknown} args - the `ask_user_question` arguments
 * @param {string} language - the conversation's language, as a name (`languageName`), or ''
 * @returns {string | null}
 */
export function untranslatedConfirmCard(args, language) {
  if (language === '' || language === 'English') return null
  const questions = Array.isArray(/** @type {any} */ (args)?.questions)
    ? /** @type {any} */ (args).questions
    : []
  for (const q of questions) {
    const id = typeof q?.id === 'string' ? q.id : ''
    if (!id.startsWith(CONFIRM_QUESTION_PREFIX)) continue
    const labels = Array.isArray(q?.options)
      ? q.options.map((/** @type {any} */ o) => String(o?.label ?? '').trim())
      : []
    const asked = String(q?.question ?? '').trim()
    // The header too (live run 20/10/2026): a Vietnamese card under "Confirm" read half in English.
    const header = String(q?.header ?? '').trim()
    if (
      labels[0] === CONFIRM_ENGLISH.go ||
      labels[1] === CONFIRM_ENGLISH.keep ||
      asked.endsWith(CONFIRM_ENGLISH.ask) ||
      header === CONFIRM_ENGLISH.header
    )
      return `ask_user_question was not shown: question ${JSON.stringify(id)} is still in English. Put its header, question and both options in ${language}, the language this conversation is in — the same id, the go-ahead option first — and show it again.`
  }
  return null
}

/**
 * What an `ask_user_question` answer says about refused calls (D34), question by question.
 *
 * 🔒 "NO, KEEP IT" IS AN ANSWER, NOT A YES — AND A YES IS AN ANSWER TO ONE QUESTION. A question Tracy
 * wrote (`confirm-…`) is `agreed` only when its FIRST option — as the agent sent it, whatever the
 * language — was chosen; another option, words typed instead, or no answer is `declined`. Until
 * 27/09 one agreed question in a card opened every refused call. A question the agent wrote itself
 * makes the answer `open`, as before: the model reads the words. No question at all is open too.
 * @param {unknown} args - the call's arguments
 * @param {unknown} value - its answer, `{answers:[{id, selected, custom?}]}`
 * @returns {{ agreed: string[], declined: string[], open: boolean }} question ids
 */
export function answerVerdict(args, value) {
  const a = /** @type {any} */ (args)
  const v = /** @type {any} */ (value)
  const questions = Array.isArray(a?.questions) ? a.questions : []
  const answers = Array.isArray(v?.answers) ? v.answers : []
  /** @type {string[]} */
  const agreed = []
  /** @type {string[]} */
  const declined = []
  let open = questions.length === 0
  for (const q of questions) {
    if (typeof q?.id !== 'string' || !q.id.startsWith(CONFIRM_QUESTION_PREFIX)) {
      open = true
      continue
    }
    const go = Array.isArray(q.options) ? q.options[0]?.label : undefined
    const answer = answers.find((/** @type {any} */ x) => x?.id === q.id)
    // 🔒 D34.2 (28/09/2026): THE ORDER ALONE IS NOT THE ANSWER. The agent writes the words and sends
    // the card, so an agent that put "No, keep it" first turned the customer's No into a go-ahead —
    // order is the only thing this read, and nothing downstream could tell. Now both must agree: the
    // FIRST option, and words that do not open with a refusal (`typedRefusal`, whatever the language).
    // A card whose first option reads as a refusal agrees to nothing; the call is asked again.
    const chosen = typeof go === 'string' && Array.isArray(answer?.selected) && answer.selected.includes(go)
    const yes = chosen && !typedRefusal(go)
    ;(yes ? agreed : declined).push(q.id)
  }
  return { agreed, declined, open }
}

/**
 * The ids of Tracy's questions answered with typed words and no option chosen — words that do not open
 * with a refusal (a typed "no" is a No, and says so itself).
 * @param {unknown} args
 * @param {unknown} value
 * @returns {string[]}
 */
function typedInstead(args, value) {
  const questions = Array.isArray(/** @type {any} */ (args)?.questions)
    ? /** @type {any} */ (args).questions
    : []
  const answers = Array.isArray(/** @type {any} */ (value)?.answers) ? /** @type {any} */ (value).answers : []
  /** @type {string[]} */
  const ids = []
  for (const q of questions) {
    if (typeof q?.id !== 'string' || !q.id.startsWith(CONFIRM_QUESTION_PREFIX)) continue
    const a = answers.find((/** @type {any} */ x) => x?.id === q.id)
    const none = !Array.isArray(a?.selected) || a.selected.length === 0
    const words = typeof a?.custom === 'string' ? a.custom.trim() : ''
    if (none && words !== '' && !typedRefusal(words)) ids.push(q.id)
  }
  return ids
}

/**
 * Every refused call still waiting becomes the customer's No: it stays shut until it is refused again
 * (`confirmAsked`).
 *
 * 🔒 D34.3 (28/09/2026): A GO-AHEAD NOT YET SPENT IS OVERRIDDEN TOO. `confirmed` deletes the record
 * the moment the call it allowed runs, so a `said: 'yes'` still here is a go-ahead NOTHING has used:
 * the customer clicked Yes and then wrote "No, wait — don't delete it" before the agent's call
 * landed. Keeping that yes ran the delete on words that had already withdrawn it. The customer's
 * latest word wins.
 * @param {{ confirms: Map<string, { askedAt: number, said: 'yes' | 'no' | null }> }} s
 */
function declineWaiting(s) {
  for (const c of s.confirms.values()) c.said = 'no'
}

/**
 * Words that, OPENING a customer's reply, refuse — in the languages Tracy's customers write. Only the
 * opening is read: "Không, giữ lại" refuses; "Mình xác nhận, không thêm gì khác" does not. Openers
 * that read as a go-ahead ("no problem", "không sao", "не вопрос", "不用问") are not refusals.
 */
const REFUSAL_OPENERS = [
  /^(?:no|nope|nah|not now|not yet)(?![\p{L}\p{N}'\u2019])(?!\s+(?:problem|worries|need|doubt|issue)s?\b)/u,
  /^(?:don[''\u2019]?t|do not|stop|cancel|abort|never ?mind|leave (?:it|them)|keep (?:it|them|this|that|the))(?![\p{L}\p{N}])/u,
  /^(?:không|khong|hông|ko|k)(?![\p{L}\p{N}])(?!\s+(?:sao|vấn đề|van de|có gì|co gi|cần (?:hỏi|xác nhận)|can (?:hoi|xac nhan)|phải hỏi|phai hoi)(?![\p{L}\p{N}]))/u,
  /^(?:đừng|dừng|thôi|thoi|huỷ|hủy|huy|giữ (?:lại|nguyên)|giu (?:lai|nguyen)|dung xoa|khỏi|khoi)(?![\p{L}\p{N}])/u,
  /^(?:нет|не надо|не нужно|не удаля|отмен|оставь|стоп)(?!\s*(?:проблем|спрашива|вопрос))/u,
  /^(?:不要(?!紧|緊)|不用(?!问|問|確認|确认)|不行|不必|别|別|先别|先別|取消|算了|保留|不删|不刪|不(?![\p{L}\p{N}]))/u
]

/**
 * Whether a customer's words OPEN with a refusal ("No, keep it", "thôi, đừng xoá", "нет", "别删"). A
 * miss is what happened before 28/09 (the model reads the words); a false hit costs one more
 * question. Leading quotes, punctuation and emoji are skipped; case and Unicode form do not matter.
 * @param {unknown} text
 */
export function typedRefusal(text) {
  if (typeof text !== 'string') return false
  const opening = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .slice(0, 80)
  return REFUSAL_OPENERS.some((re) => re.test(opening))
}

/**
 * Whether an answer to a question the AGENT wrote (not one of Tracy's `confirm-…`) refuses: an option
 * chosen or words typed that open with a refusal (`typedRefusal`).
 * @param {unknown} args - the `ask_user_question` call's arguments
 * @param {unknown} value - its answer, `{answers:[{id, selected, custom?}]}`
 */
export function openAnswerRefuses(args, value) {
  const a = /** @type {any} */ (args)
  const v = /** @type {any} */ (value)
  const own = new Set(
    (Array.isArray(a?.questions) ? a.questions : [])
      .map((/** @type {any} */ q) => q?.id)
      .filter((/** @type {unknown} */ id) => typeof id === 'string' && id.startsWith(CONFIRM_QUESTION_PREFIX))
  )
  const answers = Array.isArray(v?.answers) ? v.answers : []
  return answers.some((/** @type {any} */ x) => {
    if (own.has(x?.id)) return false
    const said = [...(Array.isArray(x?.selected) ? x.selected : []), x?.custom]
    return said.some(typedRefusal)
  })
}
