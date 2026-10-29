/**
 * One `tracy_emdash` call, from the model's arguments to the answer it reads (F7 phase 1, PLAN v2.1
 * P4). The host (`index.ts`) keeps the fence — which site this conversation may reach — and hands in
 * `mcp`, the one exec that carries a JSON-RPC request into that site's own container; everything
 * between the two lives here, with its I/O injected, so every rule below is testable without the
 * built bundle:
 *
 *   shape repair (`normalizeEmdashShape`) → Tracy's own parameters (`allLocales`, `_rev`) → the
 *   locale rule (D11) → a delete asks first (D34, `confirm`) → the read before a write (D12) → the
 *   call (E2.4 retry for reads) → the served-locale memo kept true (D11) → the answer shaped and
 *   budgeted (D26).
 *
 * Refusals come back bare — `{ok:false, code, tool, error, …}` — and the host passes them through
 * `withNext`: every next step is written once, in `refusalNext` (`site.mjs`, D1).
 *
 * ⚠ The codes this module raises (`EMDASH_LOCALE_REQUIRED`, `EMDASH_ULID_REQUIRED`, `REV_MISSING`,
 * `PENDING_DRAFT`, `WOULD_UNPUBLISH`, `CONFIRM_FIRST`, `NO_RECEIPTS_ON_EMDASH`, `BAD_CALL`,
 * `TOOL_FAILED` with its `emdash` sub-code) are raised in the plugin, outside `check-refusal-next`'s
 * reach (that gate reads the Apply door of `apps/tracy-web`), as `NO_TOKEN` is: `refusalNext`'s cases
 * for them are held by `site.test.mjs`, not by the gate.
 */

import {
  clip,
  destructiveTarget,
  draftGuard,
  EMDASH_BUDGETS,
  EMDASH_DESTRUCTIVE_TOOLS,
  EMDASH_REDIRECT_TOOLS,
  EMDASH_FORM_TOOLS,
  formWordsOf,
  formWordsUpdate,
  validateFormWordsArgs,
  TRACY_DESTRUCTIVE_TOOLS,
  validateRedirectArgs,
  emdashRedirectRequest,
  EMDASH_READ_TOOLS,
  ID_WITHOUT_LOCALE_TOOLS,
  ULID,
  budget,
  catalogueOf,
  collectionsAnswer,
  soleCollection,
  emdashCodeOf,
  entryState,
  draftFieldsOf,
  localeNeed,
  localePlan,
  mcpToolCall,
  mcpToolsList,
  missingCollectionOf,
  normalizeEmdashShape,
  recordCollectionsOf,
  recordFieldsOf,
  RECORD_FIELDS_KEY,
  REMOVED_ROWS,
  WRITE_FACTS,
  writeFacts,
  REV_TOOLS,
  revOf,
  schemasOf,
  shapeAnswer,
  textOf,
  toolsOf,
  undoRevisionIdOf
} from './emdash.mjs'
import { bodyRef, confirmQuestion, sameCallKey, sameCallRefused } from './call-memory.mjs'
import { emdashConsequenceOf } from './consequence.mjs'
import { writtenPictureIds } from './media-emdash.mjs'
import { asksRemoval, inSweepRead, judgeWholeBody, SHRINK_JUDGED_FROM, VERIFY_RATIO } from './site-call.mjs'
import { outcomeUnknown, withNext } from './site.mjs'

/**
 * The writes whose `_rev` the door fills itself (G2, 27/09/2026). Both already read the entry before
 * writing (D12), and that read answers the current token — so asking the model for it cost a
 * `content_get` per entry for nothing: A1 bench EmDash V4-words-05 (opening hours in 40 languages) spent
 * 36 of its 85 calls and four steps fetching tokens the door then fetched again. The lock still holds
 * between the door's read and its write; a `_rev` the model sends is used as sent. `content_unpublish`
 * and `content_discard_draft` make no read before, so they keep asking.
 */
const REV_FROM_READ = new Set(['content_update', 'content_publish'])

/**
 * 🔒 G5 (27/09/2026): ONE ITEM OF A LIST CHANGES WITHOUT THE MODEL WRITING THE LIST OUT AGAIN. EmDash
 * takes a list field whole, so "change the third team member's photo text" had the model re-type every
 * item — 46 of 457 `content_update` calls in the 27/09 bench (median 1.7 KB of JSON each), and the
 * long tool input is where DeepSeek answered MALFORMED_RESPONSE (V4-structure-07, twice in BEFORE).
 * The write already reads the entry first (D12), so the door holds the list as it stands. A list
 * field may be sent as a PATCH — an object whose keys are only item positions (from 0), `"+"`, or both:
 *   `"<i>": {…}`  the keys given replace those of item i (the others stay);
 *   `"<i>": null` removes item i;
 *   `"+": […]`    adds these items at the end.
 * Positions are those of the list as read, so a removal never shifts what another key points at. A
 * top-level list sent as an object with any other key is sent on untouched: EmDash judges it as
 * before, and nothing is guessed. A position outside the list is refused.
 *
 * 🔒 v6 EmDash L4-01 (28/09/2026): AN OBJECT FIELD SENT AS A FEW KEYS IS A PATCH TOO, AT EVERY DEPTH.
 * A `json` field holding an object was written AS SENT: the model changed one colour of the kit page's
 * `sample` — `{pal:{"3":{…}}, rules:{"3":"…"}}`, this very patch shape one level down — and EmDash
 * stored those two keys as the whole value. `h1`, `slides`, `decks`… were gone, `/kit/slides`
 * answered HTTP 500 for 5 min 13 s and `/ru/kit/slides` for 7 min 42 s, and the only way back the
 * model had was retyping the 4,123-char value, where DeepSeek's stream then refused the model's own
 * JSON (MALFORMED_RESPONSE) and ended the turn. So the rule above is the rule of every structured
 * value the read answered, recursively:
 *   an object sent where an object stands: the keys given replace those (each by these same rules),
 *     every other key stays — the item rule `"<i>": {…}` already said exactly this;
 *   a patch sent where a list stands (inside a field): positions, `null` and `"+"` as above;
 *   an object with another `id` than the one it replaces is a different media item or record, not a
 *     change to this one: sent whole, since its cached `src`, `width`, `height`… are the old one's;
 *   anything else (a list, a string, a number, null) is the new value.
 * An object sent where a list stands INSIDE a field is refused: nothing there says which items it
 * means, and EmDash stores whatever it is given. What was kept is said in the answer.
 */
/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A patch key naming one item of a list: its position, from 0. */
const POSITION = /^(0|[1-9]\d{0,4})$/

/**
 * Whether `patch` is a list patch: a non-empty object whose keys are only positions and `"+"`.
 * @param {unknown} patch @returns {patch is Record<string, unknown>}
 */
const isListPatch = (patch) => {
  if (!isRecord(patch)) return false
  const keys = Object.keys(patch)
  return keys.length > 0 && keys.every((k) => k === '+' || POSITION.test(k))
}

/** The cached keys of an EmDash media value (`MediaValue`, 0.37 `media/types.ts`) beside its `id`. */
const MEDIA_KEYS = ['provider', 'src', 'filename', 'mimeType', 'previewUrl', 'url']

/**
 * Whether `patch` names another media item than `current` holds: `current` is a media value (an `id`
 * and cached metadata) and `patch` gives a different `id`. Merged, the new id would keep the old
 * picture's `src`, size and placeholder — so it is written whole, as it was before this rule.
 * @param {Record<string, unknown>} current @param {Record<string, unknown>} patch
 */
const replacesMedia = (current, patch) =>
  typeof current.id === 'string' &&
  MEDIA_KEYS.some((k) => Object.hasOwn(current, k)) &&
  Object.hasOwn(patch, 'id') &&
  patch.id !== current.id

/**
 * One value patched onto the value the read answered, by the rules above.
 * @param {unknown} current - the stored value at `path`.
 * @param {unknown} patch - what the model sent there.
 * @param {string} path - `field`, `field.key` or `field[i]`, for a refusal.
 * @param {number} depth - 0 for a field itself.
 * @returns {{ value: unknown } | { refusal: { error: string, next: string } }}
 */
function patchValue(current, patch, path, depth) {
  if (Array.isArray(current)) {
    if (!isRecord(patch)) return { value: patch }
    if (!isListPatch(patch)) {
      if (depth === 0) return { value: patch }
      return {
        refusal: {
          error: `${path} is a list of ${current.length} items; an object there would replace it with something else.`,
          next: `The same call with ${path} as {"<i>":{changed keys}} (positions from 0), "+":[…] to add, or the whole list.`
        }
      }
    }
    const bad = Object.keys(patch).find((k) => k !== '+' && Number(k) >= current.length)
    if (bad !== undefined)
      return {
        refusal: {
          error: `${path} has ${current.length} items (positions 0–${current.length - 1}); there is no item ${bad}.`,
          next: `The same call with positions from 0 to ${current.length - 1}, or "+":[…] to add at the end.`
        }
      }
    if (patch['+'] !== undefined && !Array.isArray(patch['+']))
      return {
        refusal: {
          error: `${path}."+" must be a list of items to add.`,
          next: `The same call with "+":[{…}] in ${path}.`
        }
      }
    /** @type {unknown[]} */
    const items = []
    for (const [i, item] of current.entries()) {
      if (!Object.hasOwn(patch, String(i))) {
        items.push(item)
        continue
      }
      const change = patch[String(i)]
      if (change === null) continue
      const got = patchValue(item, change, `${path}[${i}]`, depth + 1)
      if ('refusal' in got) return got
      items.push(got.value)
    }
    return { value: [...items, ...(Array.isArray(patch['+']) ? patch['+'] : [])] }
  }
  if (isRecord(current) && isRecord(patch) && !replacesMedia(current, patch)) {
    /** @type {Record<string, unknown>} */
    const value = { ...current }
    for (const [key, change] of Object.entries(patch)) {
      const got = patchValue(current[key], change, `${path}.${key}`, depth + 1)
      if ('refusal' in got) return got
      value[key] = got.value
    }
    return { value }
  }
  return { value: patch }
}

/**
 * @param {Record<string, unknown>} data - what the model sent.
 * @param {Record<string, unknown>} stored - the entry's data as the read before the write answered it.
 * @returns {{ data: Record<string, unknown>, fields: string[], objects: Array<{ field: string, kept: string[] }>, rows: string[], refusal: null | { field: string, error: string, next: string } }}
 *   `fields` — the list fields merged; `objects` — the object fields merged, with the keys of each
 *   that the call did not send and that were kept; `rows` — the list fields sent whole whose rows kept
 *   their `_rowId` by position.
 *
 * 🔒 A LIST SENT WHOLE KEEPS ITS ROWS (24/10/2026): a build that rewrote an entry's `team`, `stats` or
 * `branches` sent the rows without their `_rowId`, EmDash gave each a new one and the build read as a changed
 * structure. A row the call sent with no `_rowId` takes the one stored at its position; a row past the stored
 * ones stays new, so a changed count is still a changed count.
 */
export function mergeListPatches(data, stored) {
  /** @type {Record<string, unknown>} */
  const out = { ...data }
  /** @type {string[]} */
  const fields = []
  /** @type {Array<{ field: string, kept: string[] }>} */
  const objects = []
  /** @type {string[]} */
  const rows = []
  for (const [field, patch] of Object.entries(data)) {
    const current = stored[field]
    if (Array.isArray(current) && Array.isArray(patch)) {
      let kept = false
      // 🔒 A `_rowId` no stored row has is a copy gone wrong, never a new row's (a new row is sent without one): local
      // round 20, 25/10/2026, an EmDash build sent "7252ba1b-cd5d-…" for the stored "7252ba1b-cd56-…", and the row
      // read as a changed structure. It takes the one stored at its position, as a row sent without one does.
      const storedIds = new Set(
        current.map((row) => (isRecord(row) ? row._rowId : undefined)).filter(Boolean)
      )
      const withIds = patch.map((row, i) => {
        const was = current[i]
        if (
          !isRecord(row) ||
          (Object.hasOwn(row, '_rowId') && storedIds.has(row._rowId)) ||
          !isRecord(was) ||
          typeof was._rowId !== 'string'
        )
          return row
        kept = true
        return { ...row, _rowId: was._rowId }
      })
      if (kept) {
        out[field] = withIds
        rows.push(field)
      }
      continue
    }
    const list = Array.isArray(current)
    if (list ? !isListPatch(patch) : !(isRecord(current) && isRecord(patch))) continue
    const got = patchValue(current, patch, field, 0)
    if ('refusal' in got)
      return { data, fields: [], objects: [], rows: [], refusal: { field, ...got.refusal } }
    if (list) {
      out[field] = got.value
      fields.push(field)
      continue
    }
    // The whole value, as sent (every key there, nothing nested to merge): nothing to say.
    if (JSON.stringify(got.value) === JSON.stringify(patch)) continue
    out[field] = got.value
    const kept = Object.keys(/** @type {Record<string, unknown>} */ (current)).filter(
      (k) => !Object.hasOwn(/** @type {Record<string, unknown>} */ (patch), k)
    )
    objects.push({ field, kept })
  }
  return { data: out, fields, objects, rows, refusal: null }
}

/**
 * 🔒 A ROW TAKEN OUT AND PUT BACK KEEPS ITS IDENTITY (local round 21, 25/10/2026): an EmDash build dropped rows of
 * `geo_list`, `facts` and `downloads`, was told by native-structure to put them back, and did — each with a new
 * `_rowId`, so the structure still differed through every check. A write that leaves out stored rows banks their
 * ids (`bank`, per entry field); a later write's new rows (sent with no `_rowId`, or one no stored row has) take
 * them back in order. Pure but for the bank.
 * @param {Record<string, unknown>} data - the list fields as they will be sent (after `mergeListPatches`).
 * @param {Record<string, unknown>} stored - the entry's data as the read before the write answered it.
 * @param {{ take: (field: string) => string | undefined, put: (field: string, ids: string[]) => void }} bank
 * @returns {{ data: Record<string, unknown>, back: string[] }} `back`: the fields a banked id went back into.
 */
export function reuseRemovedRowIds(data, stored, bank) {
  /** @type {Record<string, unknown>} */
  const out = { ...data }
  /** @type {string[]} */
  const back = []
  for (const [field, list] of Object.entries(data)) {
    const current = stored[field]
    if (!Array.isArray(list) || !Array.isArray(current)) continue
    const storedIds = current
      .map((row) => (isRecord(row) ? row._rowId : undefined))
      .filter((id) => typeof id === 'string')
    const sentIds = new Set(list.map((row) => (isRecord(row) ? row._rowId : undefined)).filter(Boolean))
    let reused = false
    const rows = list.map((row) => {
      if (!isRecord(row) || (typeof row._rowId === 'string' && storedIds.includes(row._rowId))) return row
      const id = bank.take(field)
      if (id === undefined) return row
      reused = true
      sentIds.add(id)
      return { ...row, _rowId: id }
    })
    const gone = storedIds.filter((id) => !sentIds.has(id))
    if (gone.length) bank.put(field, gone)
    if (reused) {
      out[field] = rows
      back.push(field)
    }
  }
  return { data: out, back }
}

/** G3: the reads that name one entry, answered from a listing when the model sent no id. */
const ID_FROM_LIST = new Set(['content_get', 'content_translations'])
/** How many entries the listing asks for — two tells one from many; a few more name the choices. */
const ID_FROM_LIST_MAX = 6

/** @param {Record<string, unknown>} args */
const hasRev = (args) => typeof args._rev === 'string' && args._rev.trim() !== ''

/** How long a site's served-locale list is trusted for a read (D11). */
const SERVED_TTL_MS = 10 * 60_000

/** Labels whose served locales are remembered at once; a host serves every site on it (ADR 0014). */
const MAX_LABELS = 500

/** Drafts one conversation staged, remembered per conversation — and across all of them (D12). */
const STAGED_PER_SESSION = 200
const STAGED_TOTAL = 2000

/** The wait before the one retry a read gets when the site did not answer (E2.4). */
const READ_RETRY_MS = 1000

/**
 * How long the list of collections waits for the field reads it adds (F4) — a real timer, not `sleep`,
 * which a test makes instant. A read takes about a second; one stuck would otherwise hold the list for
 * the exec timeout (120 s) and its one retry, so past this the list comes without fields.
 */
const RECORD_FIELDS_MS = 6000

/** Said once computed `_rev` tokens are off (see `createEmdashState`). */
const REVS_OFF_NOTE = 'computed _rev is off: list rows carry none; content_get gives it'

/** Rows one conversation's translation-group memo holds for a site in one turn (F3). */
const GROUP_ROWS_MAX = 400

/**
 * How long a picture id the library vouched for is trusted without asking it again (P2, 30/09/2026).
 * The span of the served-locale memo: long enough for one picture to go into every language row of a
 * page. A picture removed OUTSIDE this door meanwhile (the customer in the admin) is not seen until its
 * entry ages out: the span bounds that blind spot, it does not close it. A media write or delete through
 * this door, or a build that moved the site on, empties the memo at once (`dropMedia`).
 */
const MEDIA_KNOWN_TTL_MS = 10 * 60_000

/** Picture ids one conversation remembers for a site (P2); the oldest go first. */
const MEDIA_KNOWN_PER_SESSION = 200

/**
 * How many of an agreed entry's other language rows are deleted at once (P3, 30/09/2026). Three, no
 * more: EmDash keeps one SQLite file with a single writer, so a wider pool buys contention, not speed.
 * One after the other a delete took about 0.2 s (v7 cp5: 40 rows, 8.4 s).
 */
const DELETE_PARALLEL = 3

/**
 * An entry's language rows as `content_translations` answered them (F3): the group's id, its slug
 * for the question, and each row's id and locale — and, kept as the turn goes on (F4), the ids of the
 * rows this turn already removed, so what the door says is still online is what is.
 * @typedef {{ id: string, name: string, size: number, entries: Array<{ id: string, locale: string | null }>, gone: Set<string> }} TranslationGroup
 */

/**
 * The state `tracy_emdash` keeps between calls, one per process (the host's one dsh serves every
 * site). Four things, each bounded:
 *
 * - **served locales per site label (D11)** — the distinct locales of the published `site` rows,
 *   the template's own `served-locales` rule; trusted 10 minutes for a read. It feeds WRITES too
 *   (a locale fill, a slug turned into a ULID), so it is dropped on every call that can change it
 *   (`dropServedLocales`) and recomputed once per (site, conversation, turn) before the first write
 *   that relies on it. 🔒 Measured reason (v2.1 critic #7): after a language was added, slug-only
 *   writes would have gone to the old locale for up to ten minutes, where a fresh read refuses them.
 * - **drafts this conversation staged (D12)** — so publishing its OWN draft is not refused as
 *   somebody else's. Bounded per conversation and in total; the oldest go first.
 * - **whether computed `_rev` tokens hold** — `revOf` is EmDash's own formula; the first pre-read
 *   whose native token disagrees turns computed tokens off for the process, and answers say so.
 * - **this turn's translation groups (F3)** — per (site, conversation), for the current turn only:
 *   which entry each row read for a delete belongs to, so the N language rows of one entry cost one
 *   `content_translations`, and which entries the customer agreed to remove in every language, so
 *   the other rows go on that one answer. A new turn starts it empty.
 * - **picture ids the library vouched for (P2)** — per (site, conversation): a successful `media_get`,
 *   or an id `media_list` / `media_upload` (which `media.scan`, `media.draw` and `media.upload` run
 *   through) handed out. A `content_update` naming one of them skips its `media_get`, so one picture
 *   written into N language rows is checked once, not N times. A mistyped id is never in it: only
 *   ids the library itself returned go in. Any media write or delete empties it for the site
 *   (`dropMedia`, also called by the host when a build moved the site on), and an entry ages out
 *   after `MEDIA_KNOWN_TTL_MS`.
 *
 * @param {{ now?: () => number }} [opts]
 */
export function createEmdashState({ now = Date.now } = {}) {
  /** @type {Map<string, { locales: string[], unscoped: boolean, at: number }>} */
  const served = new Map()
  /** @type {Map<string, unknown>} label\0session → the turn its memo was last recomputed for a write */
  const verified = new Map()
  /**
   * label\0session → this turn's groups: `collection\0rowId` → its group (null: none, or one row),
   * and the confirm keys of groups the customer agreed to remove.
   * @type {Map<string, { turn: unknown, byRow: Map<string, TranslationGroup | null>, agreed: Set<string>, asked: Set<string> }>}
   */
  const groups = new Map()
  /** @type {Map<string, Set<string>>} session → staged `label:id` keys, oldest first */
  const staged = new Map()
  /** @type {Map<string, true>} session\0key, oldest first — the global bound */
  const stagedAll = new Map()
  /** @type {Map<string, Map<string, string>>} session → revisionId → `label:entryId`, oldest first */
  const undoNamed = new Map()
  /** @type {Map<string, true>} session\0revisionId, oldest first — the global bound */
  const undoNamedAll = new Map()
  /**
   * label\0session → the picture ids the library vouched for, each with the time it last did (P2);
   * both levels oldest first, so the bound drops the stalest.
   * @type {Map<string, Map<string, number>>}
   */
  const libraryIds = new Map()
  /** `label\0collection\0id\0locale\0field` → the `_rowId`s a write left out, oldest first (`reuseRemovedRowIds`). */
  const goneRows = new Map()
  let revsOn = true

  /** @param {string} session @param {string} revisionId */
  const forgetUndo = (session, revisionId) => {
    undoNamed.get(session)?.delete(revisionId)
    if (undoNamed.get(session)?.size === 0) undoNamed.delete(session)
    undoNamedAll.delete(`${session}\0${revisionId}`)
  }

  /** @param {string} session @param {string} key */
  const unstage = (session, key) => {
    staged.get(session)?.delete(key)
    if (staged.get(session)?.size === 0) staged.delete(session)
    stagedAll.delete(`${session}\0${key}`)
  }

  /**
   * This turn's group memo for (site, conversation), started empty when the turn moved on; null
   * with no conversation or no turn — then nothing is remembered and nothing carries.
   * @param {string} label @param {string | null} sessionId @param {unknown} turn
   */
  const groupsOf = (label, sessionId, turn) => {
    if (!sessionId || turn === undefined || turn === null) return null
    const k = `${label}\0${sessionId}`
    let g = groups.get(k)
    if (g === undefined || g.turn !== turn)
      g = { turn, byRow: new Map(), agreed: new Set(), asked: new Set() }
    groups.delete(k)
    groups.set(k, g)
    while (groups.size > MAX_LABELS * 4) groups.delete(/** @type {string} */ (groups.keys().next().value))
    return g
  }

  return {
    /**
     * The bank of one entry's left-out row ids (`reuseRemovedRowIds`), bounded at 500 entries fields.
     * @param {string} entry - `label\0collection\0id\0locale`.
     */
    rowBank(entry) {
      return {
        /** @param {string} field */
        take(field) {
          const ids = goneRows.get(`${entry}\0${field}`)
          const id = ids?.shift()
          if (ids && ids.length === 0) goneRows.delete(`${entry}\0${field}`)
          return id
        },
        /** @param {string} field @param {string[]} ids */
        put(field, ids) {
          const key = `${entry}\0${field}`
          goneRows.set(key, [...(goneRows.get(key) ?? []), ...ids].slice(-50))
          while (goneRows.size > 500) goneRows.delete(/** @type {string} */ (goneRows.keys().next().value))
        }
      }
    },
    /**
     * The memo for a label, or undefined when there is none or it is older than the read TTL.
     * @param {string} label
     */
    servedFor(label) {
      const hit = served.get(label)
      if (hit === undefined || now() - hit.at > SERVED_TTL_MS) return undefined
      return hit.locales
    },
    /**
     * Whether the memo says this template has no `site` collection and declares no languages, so
     * calls go unfilled and unrefused (`localePlan`'s `unscoped`). False with no fresh memo.
     * @param {string} label
     */
    unscopedFor(label) {
      const hit = served.get(label)
      return hit !== undefined && now() - hit.at <= SERVED_TTL_MS && hit.unscoped
    },
    /**
     * @param {string} label
     * @param {string[]} locales
     * @param {{ unscoped?: boolean }} [opts]
     */
    rememberServed(label, locales, { unscoped = false } = {}) {
      served.delete(label)
      served.set(label, { locales: [...locales], unscoped, at: now() })
      while (served.size > MAX_LABELS) served.delete(/** @type {string} */ (served.keys().next().value))
    },
    /**
     * Whether a write in this (conversation, turn) may rely on the memo without recomputing it.
     * No session or no turn → never: the safe reading is one more read.
     * @param {string} label @param {string | null} sessionId @param {unknown} turn
     */
    verifiedFor(label, sessionId, turn) {
      if (!sessionId || turn === undefined || turn === null) return false
      return verified.has(`${label}\0${sessionId}`) && verified.get(`${label}\0${sessionId}`) === turn
    },
    /** @param {string} label @param {string | null} sessionId @param {unknown} turn */
    markVerified(label, sessionId, turn) {
      if (!sessionId || turn === undefined || turn === null) return
      verified.delete(`${label}\0${sessionId}`)
      verified.set(`${label}\0${sessionId}`, turn)
      while (verified.size > MAX_LABELS * 4)
        verified.delete(/** @type {string} */ (verified.keys().next().value))
    },
    /**
     * D11 invalidation: a `site` write, a create, a `translationOf` write, or any
     * `tracy_site_build_*` call for the label (the host calls this one) — the served languages may
     * have changed, so the next read asks again and the next write recomputes.
     * @param {string} label
     */
    dropServedLocales(label) {
      served.delete(label)
      for (const k of verified.keys()) if (k.startsWith(`${label}\0`)) verified.delete(k)
    },
    /** @param {string | null} sessionId @param {string} key - `label:entryId` */
    isStaged(sessionId, key) {
      return !!sessionId && staged.get(sessionId)?.has(key) === true
    },
    /** @param {string | null} sessionId @param {string} key */
    stage(sessionId, key) {
      if (!sessionId) return
      unstage(sessionId, key)
      let set = staged.get(sessionId)
      if (set === undefined) {
        set = new Set()
        staged.set(sessionId, set)
      }
      set.add(key)
      stagedAll.set(`${sessionId}\0${key}`, true)
      while (set.size > STAGED_PER_SESSION)
        unstage(sessionId, /** @type {string} */ (set.values().next().value))
      while (stagedAll.size > STAGED_TOTAL) {
        const oldest = /** @type {string} */ (stagedAll.keys().next().value)
        const cut = oldest.indexOf('\0')
        unstage(oldest.slice(0, cut), oldest.slice(cut + 1))
      }
    },
    /** @param {string | null} sessionId @param {string} key */
    unstage(sessionId, key) {
      if (sessionId) unstage(sessionId, key)
    },
    /**
     * 🔒 D_UNDO (29/09/2026): a write's receipt named `revision_restore {revisionId}` as its undo
     * (`undoRevisionIdOf`); remembered per conversation, so a later restore of EXACTLY that revision
     * is this conversation's own and its draft may be published by it. The agent cannot forge an
     * entry here: only a receipt this host wrote for this session puts one in.
     * @param {string | null} sessionId @param {string} key - `label:entryId` @param {string} revisionId
     */
    rememberUndo(sessionId, key, revisionId) {
      if (!sessionId) return
      forgetUndo(sessionId, revisionId)
      let m = undoNamed.get(sessionId)
      if (m === undefined) {
        m = new Map()
        undoNamed.set(sessionId, m)
      }
      m.set(revisionId, key)
      undoNamedAll.set(`${sessionId}\0${revisionId}`, true)
      while (m.size > STAGED_PER_SESSION) forgetUndo(sessionId, /** @type {string} */ (m.keys().next().value))
      while (undoNamedAll.size > STAGED_TOTAL) {
        const oldest = /** @type {string} */ (undoNamedAll.keys().next().value)
        const cut = oldest.indexOf('\0')
        forgetUndo(oldest.slice(0, cut), oldest.slice(cut + 1))
      }
    },
    /**
     * The entry a restore of this revision undoes, when this conversation's receipt named it; the
     * memory is spent by the match. Undefined for any other revision.
     * @param {string | null} sessionId @param {string} revisionId
     */
    takeUndo(sessionId, revisionId) {
      if (!sessionId) return undefined
      const key = undoNamed.get(sessionId)?.get(revisionId)
      if (key !== undefined) forgetUndo(sessionId, revisionId)
      return key
    },
    /** How many staged keys are held in total (for the bound's test). */
    stagedCount() {
      return stagedAll.size
    },
    revsOn() {
      return revsOn
    },
    revsOff() {
      revsOn = false
    },
    /**
     * The group this turn's read put a row in (F3): the group, null (read: none, or one row), or
     * undefined when this turn has not read it.
     * @param {string} label @param {string | null} sessionId @param {unknown} turn
     * @param {string} collection @param {string} rowId
     */
    groupOf(label, sessionId, turn, collection, rowId) {
      return groupsOf(label, sessionId, turn)?.byRow.get(`${collection}\0${rowId}`)
    },
    /**
     * @param {string} label @param {string | null} sessionId @param {unknown} turn
     * @param {string} collection @param {string[]} rowIds @param {TranslationGroup | null} group
     */
    rememberGroup(label, sessionId, turn, collection, rowIds, group) {
      const g = groupsOf(label, sessionId, turn)
      if (g === null) return
      for (const id of rowIds) {
        g.byRow.delete(`${collection}\0${id}`)
        g.byRow.set(`${collection}\0${id}`, group)
      }
      while (g.byRow.size > GROUP_ROWS_MAX)
        g.byRow.delete(/** @type {string} */ (g.byRow.keys().next().value))
    },
    /**
     * Whether the customer agreed, this turn, to the delete a group key names (F3).
     * @param {string} label @param {string | null} sessionId @param {unknown} turn @param {string} key
     */
    groupAgreed(label, sessionId, turn, key) {
      return groupsOf(label, sessionId, turn)?.agreed.has(key) === true
    },
    /** @param {string} label @param {string | null} sessionId @param {unknown} turn @param {string} key */
    agreeGroup(label, sessionId, turn, key) {
      groupsOf(label, sessionId, turn)?.agreed.add(key)
    },
    /**
     * Whether this turn already answered a whole-entry delete with the door's question, and marks it so
     * (the first call of a burst marks; the rest read the mark). Answered or not, only the customer's
     * answer to that question opens the delete (`customerAgreed`).
     * @param {string} label @param {string | null} sessionId @param {unknown} turn @param {string} key
     */
    askedGroupBefore(label, sessionId, turn, key) {
      const g = groupsOf(label, sessionId, turn)
      if (g === null) return false
      if (g.asked.has(key)) return true
      g.asked.add(key)
      return false
    },
    /**
     * Whether the library vouched for this picture id in this conversation, not longer ago than
     * `MEDIA_KNOWN_TTL_MS` (P2). No conversation → never: the safe reading is one more `media_get`.
     * @param {string} label @param {string | null} sessionId @param {string} id
     */
    mediaKnown(label, sessionId, id) {
      if (!sessionId) return false
      const at = libraryIds.get(`${label}\0${sessionId}`)?.get(id)
      return at !== undefined && now() - at <= MEDIA_KNOWN_TTL_MS
    },
    /**
     * Ids the library itself returned (P2) — never one the model typed. Stamped now; the oldest
     * ids, and the oldest conversations, are dropped past their bounds.
     * @param {string} label @param {string | null} sessionId @param {string[]} ids
     */
    rememberMedia(label, sessionId, ids) {
      if (!sessionId || ids.length === 0) return
      const key = `${label}\0${sessionId}`
      const known = libraryIds.get(key) ?? new Map()
      libraryIds.delete(key)
      libraryIds.set(key, known)
      const at = now()
      for (const id of ids) {
        known.delete(id)
        known.set(id, at)
      }
      while (known.size > MEDIA_KNOWN_PER_SESSION)
        known.delete(/** @type {string} */ (known.keys().next().value))
      while (libraryIds.size > MAX_LABELS)
        libraryIds.delete(/** @type {string} */ (libraryIds.keys().next().value))
    },
    /**
     * P2 invalidation: a media write or delete, or a build that moved the site on — what the library
     * vouched for may be gone, so every conversation's ids for this site are asked about again.
     * @param {string} label
     */
    dropMedia(label) {
      for (const k of libraryIds.keys()) if (k.startsWith(`${label}\0`)) libraryIds.delete(k)
    }
  }
}

/** @typedef {ReturnType<typeof createEmdashState>} EmdashState */

/**
 * One MCP request through the site's own container, as the host makes it: `{ok:true, result}` (the
 * MCP result object) or the host's refusal, unchanged — `SITE_UNREACHABLE`, `NO_TOKEN`,
 * `SITE_REFUSED` (with `httpStatus` when the host knows it), `NOT_MCP`, `TOOL_FAILED`.
 * @typedef {(request: object) => Promise<{ ok: true, result: unknown } | ({ ok: false, code: string, error?: string } & Record<string, unknown>)>} Mcp
 */

/**
 * The confirmation record D34 keeps in `call-memory.mjs` (P3), fed by the host with every
 * `ask_user_question` result and every new user message: `confirmAsked(session, key)` notes that
 * this call was refused for confirmation; `confirmed(session, key)` is true when the customer agreed
 * to it since the latest `confirmAsked` for the key — its own question answered with the go-ahead,
 * or an open answer (a new message, a question the agent wrote) when its own question got none.
 *
 * P12 (E3.2) reads three more from the same memory when they are there: `refusedBefore` /
 * `rememberRefused` (the identical call refused earlier in this turn), and `invalidateSite` (a write
 * to the site ends every such record of it).
 * @typedef {{ confirmAsked?: (sessionId: string, key: string, own?: boolean, facts?: readonly string[], intent?: 'delete' | 'hide' | null) => void,
 *   confirmed?: (sessionId: string, key: string) => boolean,
 *   answeredByTyping?: (sessionId: string, key: string) => boolean,
 *   turnOf?: (sessionId: string) => unknown,
 *   declinedCount?: (sessionId: unknown) => number,
 *   refusedBefore?: (sessionId: unknown, label: unknown, key: string) => { code: string, error: string, next: string | null } | null,
 *   rememberRefused?: (sessionId: unknown, label: unknown, key: string, answer: unknown) => boolean,
 *   invalidateSite?: (label: unknown) => void,
 *   readOf?: (sessionId: unknown, address: { ref: string }) => import('./call-memory.mjs').ReadSeen | null,
 *   rememberRead?: (sessionId: unknown, read: { ref: string, kind: string, chars: number, title?: unknown }) => void,
 *   rememberWritten?: (sessionId: unknown, read: { ref: string, kind: string, chars: number }, opts?: { reset?: boolean }) => void,
 *   forgetReads?: (sessionId: unknown) => void,
 *   shrinkRefused?: (sessionId: unknown, label: unknown, record: string | null) => number }} ConfirmMemory
 *
 * The body guard (D6′ on EmDash, 09/10/2026) reads five more from the same memory, `call-memory.mjs`'s own:
 * the fields this conversation read (`readOf`/`rememberRead`), what a write stored (`rememberWritten`),
 * forgetting them after an undo or a delete (`forgetReads`), and the length refusals of one entry this
 * turn (`shrinkRefused`). A memory without them is no conversation: a long field's write is refused.
 */

/**
 * A Portable Text block with spans (EmDash's rich text). @param {unknown} v
 * @returns {v is { _type: 'block', children: unknown[] }}
 */
const isTextBlock = (v) => isRecord(v) && v._type === 'block' && Array.isArray(v.children)

/**
 * Whether a stored value is a body the guard judges: a string (long text), or Portable Text (an array
 * holding a block of spans). A list field — an array of items with no text block — is not: G5 merges it.
 * @param {unknown} v
 */
const isBodyValue = (v) => typeof v === 'string' || (Array.isArray(v) && v.some(isTextBlock))

/**
 * A body's length as the guard measures it: a string's characters; Portable Text, the text of its
 * blocks' spans (a picture block holds none); a cleared field (null, an empty list) 0. Null for a value
 * of any other type — EmDash refuses it on its own.
 * @param {unknown} v
 * @returns {number | null}
 */
export function bodyLength(v) {
  if (typeof v === 'string') return v.length
  if (v === null) return 0
  if (!Array.isArray(v)) return null
  let n = 0
  for (const block of v)
    if (isTextBlock(block))
      for (const span of block.children)
        if (isRecord(span) && typeof span.text === 'string') n += span.text.length
  return n
}

/**
 * 🔒 D6′ ON EMDASH (09/10/2026): A LONG TEXT OR RICH-TEXT FIELD IS A WHOLE BODY TOO. `content_update`
 * replaces each field of `data` whole, and its answer is a receipt — the WordPress truncation of 25/09
 * (26,847 chars → 252) had no guard here: "fix the typo in paragraph 3", a `content.replace` that misses
 * where marks split the words, then the page's body sent back holding that paragraph alone. So the
 * judgement WordPress's body takes (`judgeWholeBody`, `site-call.mjs`): the field read first in this
 * conversation (`content_get`), refused under 80 % of the longest read this turn — or of what the door's
 * own read before the write (D12) found, when the entry grew since — `removes` quoting the customer's
 * removal, over `SHRINK_JUDGED_FROM` characters only. Which fields: those whose stored value is a body
 * (`isBodyValue`); a field the entry does not hold yet is not judged (there is nothing to cut).
 * @param {{ collection: unknown, id: unknown, data: Record<string, unknown>, stored: Record<string, unknown>,
 *   memory: ConfirmMemory | null, sessionId: string | null, removes: string | null, customerWords: () => string }} input
 * @returns {{ refuse?: Record<string, unknown>, notes: string[], reset: boolean, fields: Array<{ field: string, ref: string, sent: unknown, length: number }> }}
 */
export function emdashBodyGuard({ collection, id, data, stored, memory, sessionId, removes, customerWords }) {
  /** @type {string[]} */
  const notes = []
  /** @type {Array<{ field: string, ref: string, sent: unknown, length: number }>} */
  const fields = []
  let reset = false
  const conversation =
    typeof sessionId === 'string' && sessionId !== '' && typeof memory?.readOf === 'function'
  for (const [field, sent] of Object.entries(data)) {
    const held = stored[field]
    if (!isBodyValue(held)) continue
    const length = bodyLength(sent)
    const ref = bodyRef('emdash', collection, id, field)
    if (length === null || ref === null) continue
    const storedLength = /** @type {number} */ (bodyLength(held))
    const read = conversation ? (memory?.readOf?.(sessionId, { ref }) ?? null) : null
    // A short field is written as sent: read or not (`SHRINK_JUDGED_FROM`).
    if (storedLength < SHRINK_JUDGED_FROM && (read?.baseline ?? 0) < SHRINK_JUDGED_FROM) continue
    // The residue sweep's research body over a template entry it read for this write and found still the
    // template's (`sweep-resolve.mjs` `templateFields`), as on WordPress (`withSweepRead`, `site-call.mjs`).
    if (inSweepRead() && read !== null && read.baseline !== null) {
      notes.push(
        `${field} is the residue sweep's research body, written on a read of ${String(collection)} ${String(id)} made for it`
      )
      reset = true
      fields.push({ field, ref, sent, length })
      continue
    }
    const judged = judgeWholeBody({
      base: {
        ok: false,
        code: 'BODY_SHRINK',
        tool: 'content_update',
        platform: 'emdash',
        collection: String(collection),
        id: String(id),
        field
      },
      field,
      what: `${String(collection)} ${String(id)}`,
      length,
      read,
      conversation,
      removes,
      customerWords,
      floor: SHRINK_JUDGED_FROM,
      stored: storedLength
    })
    if (judged.refuse) return { refuse: judged.refuse, notes, reset, fields }
    if (judged.note) notes.push(judged.note)
    if (judged.reset) reset = true
    fields.push({ field, ref, sent, length })
  }
  return { notes, reset, fields }
}

/**
 * What one answered `tracy_emdash` call teaches the body guard (D6′): a `content_get` the long fields
 * it read (each by `bodyRef`, its whole length — never the part a budget showed); a `content_update`
 * what it stored of the fields the guard judged (`rememberWritten`), and whether one landed shorter
 * than sent (the write's own answer holds the entry: no second read); a `revision_restore` or a
 * delete forgets every length read, as `apply.revert` does on WordPress — the site may hold another
 * body now, and a guard judging by the old one refuses a right write with a false fact.
 * @param {{ tool: string, collection: unknown, data: unknown, memory: ConfirmMemory | null, sessionId: string | null,
 *   written: Array<{ field: string, ref: string, sent: unknown, length: number }>, reset: boolean }} input
 * @returns {{ chars: Record<string, { chars_sent: number, chars_stored: number }> } | null} the fields
 *   stored shorter than sent (a string sent as a string, rich text as rich text: a Markdown string that
 *   EmDash turns into blocks loses its marks and is not compared), or null.
 */
function rememberBodies({ tool, collection, data, memory, sessionId, written, reset }) {
  if (memory === null || typeof sessionId !== 'string' || sessionId === '') return null
  if (tool === 'revision_restore' || tool === 'content_delete') {
    memory.forgetReads?.(sessionId)
    return null
  }
  const item = isRecord(data) && isRecord(data.item) ? data.item : null
  if (tool === 'content_get') {
    const items = item !== null ? [item] : isRecord(data) && Array.isArray(data.items) ? data.items : []
    for (const one of items) {
      if (!isRecord(one) || !isRecord(one.data)) continue
      for (const [field, value] of Object.entries(one.data)) {
        const ref = isBodyValue(value) ? bodyRef('emdash', collection, one.id, field) : null
        if (ref !== null)
          memory.rememberRead?.(sessionId, {
            ref,
            kind: String(collection),
            chars: /** @type {number} */ (bodyLength(value)),
            title: one.title
          })
      }
    }
    return null
  }
  if (tool !== 'content_update' || written.length === 0 || item === null || !isRecord(item.data)) return null
  /** @type {Record<string, { chars_sent: number, chars_stored: number }>} */
  const short = {}
  for (const w of written) {
    const value = item.data[w.field]
    const stored = bodyLength(value)
    if (stored === null) continue
    memory.rememberWritten?.(sessionId, { ref: w.ref, kind: String(collection), chars: stored }, { reset })
    const alike = typeof value === typeof w.sent && Array.isArray(value) === Array.isArray(w.sent)
    if (alike && stored < VERIFY_RATIO * w.length)
      short[w.field] = { chars_sent: w.length, chars_stored: stored }
  }
  return Object.keys(short).length > 0 ? { chars: short } : null
}

/**
 * 🔒 A READ THE SITE DID NOT ANSWER IS ASKED ONCE MORE; A WRITE NEVER (E2.4). A transport failure
 * (`SITE_UNREACHABLE`: the exec did not run or timed out; `NOT_MCP`: the body was not JSON-RPC;
 * `SITE_REFUSED` ≥ 500: the site's own server failed) says nothing was read, so repeating a read is
 * safe and saves the model a step. A write may have landed before the answer was lost — repeating it
 * could apply it twice — and an EmDash refusal (`TOOL_FAILED`, `[CONFLICT]` among them) is an answer,
 * not a failure to answer. 0 transport failures in r2; built for the fleet.
 *
 * The one write asked a second time is not this rule's doing: a delete of an agreed entry's other language
 * rows that EmDash itself answered as failed because its database was busy (`busyDelete`, P3). A delete
 * repeats safely (a row that did go answers NOT_FOUND), and a transport failure is never asked again there
 * either.
 * @param {unknown} answer
 */
function transient(answer) {
  const a = /** @type {Record<string, unknown>} */ (answer && typeof answer === 'object' ? answer : {})
  if (a.ok !== false) return false
  if (a.code === 'SITE_UNREACHABLE' || a.code === 'NOT_MCP') return true
  if (a.code !== 'SITE_REFUSED') return false
  const status =
    typeof a.httpStatus === 'number'
      ? a.httpStatus
      : Number(/HTTP (\d{3})/.exec(String(a.error ?? ''))?.[1] ?? Number.NaN)
  return status >= 500
}

/**
 * The JSON an MCP tool answered with, or null when its text part is not JSON (EmDash answered prose).
 * @param {unknown} result
 */
function parsedOf(result) {
  const text = textOf(
    /** @type {{ content?: unknown }} */ (result && typeof result === 'object' ? result : {}).content
  )
  if (text === '') return { data: null, text }
  try {
    return { data: /** @type {unknown} */ (JSON.parse(text)), text }
  } catch {
    return { data: null, text }
  }
}

/**
 * A stable text for a call, so the same call asked again is recognised (D34's key): the tool and its
 * arguments with keys sorted at every level, `confirm` never among them.
 * @param {string} tool
 * @param {Record<string, unknown>} args
 */
export function confirmKey(tool, args) {
  /** @param {unknown} v @returns {unknown} */
  const sorted = (v) =>
    Array.isArray(v)
      ? v.map(sorted)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(/** @type {object} */ (v))
              .sort()
              .map((k) => [k, sorted(/** @type {Record<string, unknown>} */ (v)[k])])
          )
        : v
  return `tracy_emdash ${tool} ${JSON.stringify(sorted(args))}`
}

/** @param {unknown} answer @param {string[]} notes */
function withNotes(answer, notes) {
  if (notes.length === 0 || !answer || typeof answer !== 'object' || Array.isArray(answer)) return answer
  const a = /** @type {Record<string, unknown>} */ (answer)
  const had = Array.isArray(a.normalized) ? a.normalized.filter((n) => typeof n === 'string') : []
  const all = [...new Set([...had, ...notes])]
    .slice(0, 6)
    .map((n) => (n.length <= 90 ? n : `${n.slice(0, 89)}…`))
  return { ...a, normalized: all }
}

/**
 * The tools and arguments after which the served-locale memo may be wrong (D11): a write to the
 * `site` collection (its published rows ARE the served locales), any `content_create`, and any write
 * carrying `translationOf` (a new language edition of an entry, byline, taxonomy or menu).
 * @param {string} tool @param {Record<string, unknown>} args
 */
function changesServedLocales(tool, args) {
  if (EMDASH_READ_TOOLS.has(tool)) return false
  return args.collection === 'site' || tool === 'content_create' || Object.hasOwn(args, 'translationOf')
}

/** EmDash's media tools whose answer names library rows: `media_list` `{items}`, the others `{item}` (P2). */
const LIBRARY_ROW_TOOLS = new Set(['media_list', 'media_get', 'media_upload', 'media_create', 'media_update'])

/** The longest media id kept: the one `media-emdash.mjs` accepts. */
const MEDIA_ID_MAX = 64

/**
 * 🔒 P2 (30/09/2026): WHAT THE LIBRARY HAS VOUCHED FOR IS NOT ASKED ABOUT AGAIN. A `content_update` that
 * writes a picture id checks it with one `media_get` (see the read before a write), and one picture written
 * into the 40 language rows of a page paid that read 40 times — 12 of 37 s in v7 cp5. `media.draw`,
 * `media.upload` and `media.scan` are `media_upload` / `media_list` / `media_get` run through this door, so
 * the ids they hand out come back here too. Only ids the LIBRARY returned are kept — a row of `media_list`,
 * the `item` of a get, an upload or an update (a flat row is read too, as `media-emdash.mjs` does) — so a
 * mistyped id is never among them and is still refused.
 *
 * A media tool that writes empties the memo for the site first, sent or refused: a delete can leave any
 * id gone, and a write whose answer was lost may have landed. That is every `media_*` tool EmDash does not
 * mark read-only, so one added later is covered without being listed.
 *
 * @param {EmdashState} state
 * @param {string} label
 * @param {string | null} sessionId
 * @param {string} tool
 * @param {{ ok: boolean, result?: unknown }} answer - what `mcp` answered for `tool`
 */
function noteLibrary(state, label, sessionId, tool, answer) {
  if (!tool.startsWith('media_')) return
  if (!EMDASH_READ_TOOLS.has(tool)) state.dropMedia(label)
  if (answer.ok !== true || !LIBRARY_ROW_TOOLS.has(tool)) return
  const data = /** @type {any} */ (parsedOf(answer.result).data)
  const rows = tool === 'media_list' ? data?.items : [data?.item ?? data]
  const ids = (Array.isArray(rows) ? rows : [])
    .map((row) => row?.id)
    .filter((id) => typeof id === 'string' && id !== '' && id.length <= MEDIA_ID_MAX)
  state.rememberMedia(label, sessionId, ids)
}

/**
 * One `tracy_emdash` call after the fence: the flow in the header, with every exec made through the
 * injected `mcp`. Returns the answer the model reads, or a bare refusal for `withNext`.
 *
 * @param {object} input
 * @param {unknown} input.args - the model's arguments, as the tool received them.
 * @param {{ label: string }} input.site - the site the fence settled on (`emdashSiteOf`).
 * @param {Record<string, unknown> | null} [input.artifact] - the site's `template/artifact.json`
 *   (its `locales.default` is the reads' fallback when the served locales cannot be read).
 * @param {Mcp} input.mcp
 * @param {EmdashState} input.state - `createEmdashState()`, one per process.
 * @param {string | null} [input.sessionId]
 * @param {unknown} [input.turn] - this conversation's current turn (call-memory's `turnOf`).
 * @param {ConfirmMemory | null} [input.memory]
 * @param {((action: 'page.text' | 'page.look', params: Record<string, unknown>) => Promise<unknown>) | null} [input.page]
 *   - `tracy_site`'s page read for the same site, for a `page.text` asked of this tool (ED-5).
 * @param {((request: { method: string, path: string, body: string }) => Promise<any>) | null} [input.redirects]
 *   - one REST call to the site's redirect store, answering as `mcp` does (`emdashRedirectReply`).
 * @param {((request: { route: 'forms/list' | 'forms/update', body: string }) => Promise<any>) | null} [input.forms]
 *   - one call to the forms plugin's admin routes, answering as `mcp` does (the form door, `EMDASH_FORM_TOOLS`).
 * @param {(ms: number) => Promise<void>} [input.sleep]
 * @param {boolean} [input.fieldsToo] - `schema_list_collections` also answers the fields of the collections
 *   that hold records (F4); off for the list the door itself reads to name collections (a refusal).
 * @param {number} [input.fieldsMs] - how long that waits for the field reads (a test brings a short one).
 * @param {(() => string) | null} [input.customerWords] - the customer's latest message, for the body
 *   guard only: whether a `removes` quotes their own request for a removal (`quotesCustomer`).
 * @param {boolean} [input.hostStep] - the call is a step of a door the customer's request already
 *   named (`page.create` puts its new page in the menu): no second question about it (ADR 0034).
 *   Deletes still ask; only `consequence.mjs`' writes are spared.
 * @param {boolean} [input.modelCall] - the agent's own call, made as the model sent it (`index.ts`): an
 *   update of the `site` entry every page shows asks first (`consequence.mjs` `shared`). Left out — a
 *   test, a door's own step — it runs as it always did.
 * @param {(() => Promise<boolean>) | null} [input.planAgreed] - a demo or own-site build whose saved plan agreed to its
 *   consequence writes (`index.ts` `demoPlanAgreed`), as `runSiteCall` reads it: such a write is not asked about
 *   again; a delete still is.
 * @returns {Promise<unknown>}
 */
export async function runEmdashTool(input) {
  const { args, site, sessionId = null, memory = null } = input
  const shape = normalizeEmdashShape(args)
  /**
   * 🔒 E3.2 FOR `tracy_emdash` — THE IDENTICAL CALL REFUSED EARLIER IN THIS TURN IS NOT SENT AGAIN,
   * when the refusal is one the same arguments always get (`memoisableRefusal`: EmDash's validation
   * class, and a `[CONFLICT]` — the arguments carry the stale `_rev`, so the same arguments are the
   * same stale token). Measured r2: 4 of the 7 replays the rule would have stopped were EmDash
   * CONFLICTs sent again unchanged. Keyed on the call as `normalizeEmdashShape` reads it, `confirm`
   * never in it. A transport failure, `CONFIRM_FIRST` and every locale refusal are never kept: their
   * own nexts ask for the same call once more, or for the customer first.
   */
  // A call of one EmDash tool (`ToolShape`); a list, a route or a refused shape is none.
  const call =
    shape.ok && shape.list !== true && shape.route === undefined
      ? /** @type {import('./emdash.mjs').ToolShape} */ (shape)
      : null
  const tool = typeof call?.tool === 'string' ? call.tool : null
  const repeatKey =
    call !== null && tool !== null
      ? sameCallKey('tracy_emdash', {
          tool,
          args: call.args,
          ...(call.allLocales ? { allLocales: true } : {}),
          ...(call.raw ? { raw: true } : {}),
          // A different `removes` is a different call: the guard may let it through (WordPress's key holds it too).
          ...(call.removes ? { removes: call.removes } : {})
        })
      : null
  if (repeatKey !== null && typeof memory?.refusedBefore === 'function') {
    const earlier = memory.refusedBefore(sessionId, site.label, repeatKey)
    if (earlier !== null) return sameCallRefused(earlier, { tool: /** @type {string} */ (tool) })
  }
  const answer = await runEmdashCall(input)
  if (repeatKey === null) return answer
  const a = /** @type {Record<string, unknown>} */ (answer && typeof answer === 'object' ? answer : {})
  // A write that went through — or may have — ends every refusal kept for this site (E3.2).
  if (
    !EMDASH_READ_TOOLS.has(/** @type {string} */ (tool)) &&
    tool !== 'form_list' &&
    (a.ok === true || outcomeUnknown(answer))
  )
    memory?.invalidateSite?.(site.label)
  else if (a.ok === false)
    memory?.rememberRefused?.(
      sessionId,
      site.label,
      repeatKey,
      withNext(answer, { platform: 'emdash', sealed: false })
    )
  return answer
}

/**
 * One `tracy_emdash` call, as `runEmdashTool` describes it, without the E3.2 memo around it.
 * @param {Parameters<typeof runEmdashTool>[0]} input
 * @returns {Promise<unknown>}
 */
async function runEmdashCall({
  args,
  site,
  artifact = null,
  mcp,
  state,
  sessionId = null,
  turn,
  memory = null,
  page = null,
  redirects = null,
  forms = null,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  fieldsToo = true,
  fieldsMs = RECORD_FIELDS_MS,
  customerWords = null,
  hostStep = false,
  modelCall = false,
  planAgreed = null
}) {
  const label = site.label
  const shape = normalizeEmdashShape(args)
  if (!shape.ok) return shape
  const notes = [...shape.notes]
  // G3: an entry read without its id. The model names a single-entry collection (`site`, `home`,
  // `contact`) and no id — 7 of 66 A1 cases (27/09/2026) opened with that call failing EmDash's
  // validation and a `{list:true}` round to learn the schema. The door lists the collection once, in
  // the language the read would use: one entry → its id; more → the ids, and nothing guessed.
  const toolCall =
    shape.list !== true && shape.route === undefined
      ? /** @type {import('./emdash.mjs').ToolShape} */ (shape)
      : null
  if (
    toolCall !== null &&
    ID_FROM_LIST.has(toolCall.tool) &&
    typeof toolCall.args.collection === 'string' &&
    toolCall.args.collection.trim() !== '' &&
    (toolCall.args.id === undefined || toolCall.args.id === null || toolCall.args.id === '')
  ) {
    const collection = toolCall.args.collection.trim()
    const listed = /** @type {any} */ (
      await runEmdashCall({
        args: {
          tool: 'content_list',
          arguments: {
            collection,
            limit: ID_FROM_LIST_MAX,
            ...(typeof toolCall.args.locale === 'string' ? { locale: toolCall.args.locale } : {})
          }
        },
        site,
        artifact,
        mcp,
        state,
        sessionId,
        turn,
        memory,
        page,
        sleep
      })
    )
    if (listed?.ok !== true) return listed
    const items = Array.isArray(listed?.result?.items) ? listed.result.items : []
    if (items.length === 1 && typeof items[0]?.id === 'string') {
      toolCall.args = { ...toolCall.args, id: items[0].id }
      notes.push(`${collection} holds one entry here; its id was used`)
    } else
      return {
        ok: false,
        code: 'BAD_CALL',
        tool: toolCall.tool,
        collection,
        error: clip(
          `${toolCall.tool} needs id: ${collection} holds ${items.length === 0 ? 'no entry' : 'more than one entry'} here.`
        ),
        next:
          items.length === 0
            ? 'schema_list_collections lists the collections; a page is the collection named after it.'
            : `The same call with id: one of entries${items.length >= ID_FROM_LIST_MAX ? `; content_list {collection:"${collection}"} lists them all` : ''}.`,
        ...(items.length > 0
          ? {
              entries: items
                .slice(0, ID_FROM_LIST_MAX)
                .map((/** @type {any} */ i) => ({ id: i?.id ?? null, slug: i?.slug ?? null }))
            }
          : {})
      }
  }
  const turnNow =
    turn !== undefined ? turn : sessionId && memory?.turnOf ? memory.turnOf(sessionId) : undefined
  /**
   * The turn a group agreement lives in (F3.1, 28/09/2026): this turn AND how many times the customer
   * has refused. `groupsOf` starts empty when this moves, so "No, keep the Russian one" drops an
   * agreement to remove the whole entry — an `ask_user_question` answer is not a new message, and the
   * agreement used to outlive it and let the Russian row go. A group memo lives no longer than the
   * agreement it carries, which costs at most one `content_translations` read.
   */
  const groupTurn =
    turnNow === undefined || turnNow === null
      ? turnNow
      : `${String(turnNow)}\u0000${String(memory?.declinedCount?.(sessionId) ?? 0)}`

  /**
   * @param {object} request
   * @param {boolean} read
   */
  const call = async (request, read) => {
    const first = await mcp(request)
    if (!read || !transient(first)) return first
    await sleep(READ_RETRY_MS)
    const second = await mcp(request)
    if (second.ok) notes.push('the site did not answer at first; read again once')
    return second
  }
  /**
   * The title of one entry, read from the site so the customer's question names it (council
   * 20/10/2026): '' when it has none, null when it cannot be read.
   * @param {unknown} id
   * @returns {Promise<string | null>}
   */
  const entryTitle = async (id) => {
    const pre = await call(
      mcpToolCall('content_get', {
        collection: targs.collection,
        id,
        ...(typeof targs.locale === 'string' ? { locale: targs.locale } : {})
      }),
      true
    )
    if (!pre.ok) return null
    const item = /** @type {any} */ (parsedOf(pre.result).data)?.item
    if (!isRecord(item)) return null
    const data = /** @type {Record<string, unknown>} */ (isRecord(item.data) ? item.data : {})
    const title = [data.title, item.title, data.name, item.slug].find(
      (t) => typeof t === 'string' && t.trim() !== ''
    )
    return typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  }
  const unread = () => ({
    ok: false,
    code: 'TARGET_UNREAD',
    tool,
    error: clip(
      `Tracy could not read ${String(targs.collection ?? '?')}/${String(targs.id ?? '?')} to name it on the customer's question; nothing changed.`
    ),
    next: 'Find the entry the customer means (content_list or search), then make the same call again.'
  })

  if (shape.route !== undefined) {
    if (typeof page !== 'function')
      return {
        ok: false,
        code: 'BAD_CALL',
        tool: shape.route.action,
        error: `${shape.route.action} is a tracy_site action, not an EmDash tool.`
      }
    return withNotes(await page(shape.route.action, shape.route.params), notes)
  }

  if (shape.list === true) {
    const got = await call(mcpToolsList(), true)
    if (!got.ok) return got
    const tools = toolsOf(got.result)
    if (shape.names !== null)
      return withNotes({ ok: true, site: label, ...schemasOf(tools, shape.names) }, notes)
    return withNotes(
      budget('list', {
        ok: true,
        site: label,
        tools: catalogueOf(tools),
        next: "{list:true, tools:[names]} gives those tools' full argument schemas"
      }),
      notes
    )
  }

  const { tool } = shape
  let targs = shape.args
  const read = EMDASH_READ_TOOLS.has(tool)
  // The redirect door: its arguments are checked before anything runs (v6, 29/09/2026).
  if (EMDASH_REDIRECT_TOOLS.has(tool)) {
    const invalid = validateRedirectArgs(tool, targs)
    if (invalid !== null) return invalid
  }
  // The form door (local round 18, 25/10/2026): a form's words, read and written whole by Tracy
  // (`formWordsUpdate`). No locale, no revision, nothing to confirm: it changes words, as content_update does.
  if (EMDASH_FORM_TOOLS.has(tool)) {
    if (tool === 'form_words') {
      const invalid = validateFormWordsArgs(targs)
      if (invalid !== null) return invalid
    }
    const answer = await runForm(tool, targs)
    if (!answer.ok) return answer.code === 'BAD_CALL' ? answer : refused(answer, tool, targs)
    return withNotes({ ok: true, site: label, tool, result: answer.result }, notes)
  }

  // Tracy's own checks first — shape, then the locale, then policy — so a customer is never asked
  // to confirm a call that would then fail on its form (D34 comes after the locale rule, below).
  if (shape.allLocales && !read) return localePlan(tool, targs, { allLocales: true })
  if (REV_TOOLS.has(tool) && !REV_FROM_READ.has(tool) && !hasRev(targs))
    return {
      ok: false,
      code: 'REV_MISSING',
      tool,
      ...(typeof targs.collection === 'string' ? { collection: targs.collection } : {}),
      ...(typeof targs.id === 'string' ? { id: targs.id } : {}),
      error: `${tool} needs _rev: the token content_get answered for this entry.`
    }

  /**
   * 🔒 WHAT ONLY THE CUSTOMER MAY AGREE TO. `confirm:true` passes only when the customer agreed to
   * this very call since it was refused (`call-memory.mjs` `confirmed`: its own question answered
   * with the go-ahead), and it passes ONCE: the agreement is spent, so the next one asks anew. Only a
   * refusal marks the call asked — marked as it ran, the customer's next message, whatever it said,
   * let the same call through again unasked (27/09). No memory or no session → never: the model's
   * own `confirm` is not the customer's word.
   * @param {string} key
   * @param {{ own?: boolean, mark?: boolean }} [opts] - `own: false` when the refusal this guards
   *   carries no question of Tracy's (`PENDING_DRAFT`), so an open answer is its only way through
   *   (D34.4); `mark: false` to ASK the memory without marking the key refused — for a key this call
   *   is not about to ask on (F3.1, the whole-entry agreement a row call may inherit).
   */
  const customerAgreed = (key, { own = true, mark = true } = {}) => {
    const agreed =
      shape.confirm &&
      typeof sessionId === 'string' &&
      sessionId !== '' &&
      typeof memory?.confirmed === 'function' &&
      memory.confirmed(sessionId, key) === true
    if (!agreed && mark && sessionId) memory?.confirmAsked?.(sessionId, key, own)
    return agreed
  }

  // D11: which locale this call means. Reads only happen here — the served-locale read and the one
  // `content_get` that turns a slug into its ULID — never the tool itself.
  const need = localeNeed(tool, targs, { allLocales: shape.allLocales })
  /** @type {string[] | null} */
  let served = null
  let unscoped = false
  if (need !== 'none') {
    const got = await servedLocales(need === 'write')
    if (!got.ok) return got.refusal
    served = got.locales
    unscoped = got.unscoped
  }
  const plan = localePlan(tool, targs, {
    served,
    artifactDefault: /** @type {any} */ (artifact)?.locales?.default ?? null,
    allLocales: shape.allLocales,
    unscoped
  })
  if (!plan.ok) return plan
  targs = plan.args
  /**
   * The answer of the one read that turned a slug into its ULID: it is also the entry read before.
   * @type {any}
   */
  let resolved = null
  /** What the model named, for the question a delete asks: `about@en`, not the ULID. */
  let named = null
  if (plan.resolve !== undefined) {
    const r = plan.resolve
    const got = await call(
      mcpToolCall('content_get', { collection: r.collection, id: r.slug, locale: r.locale }),
      true
    )
    if (!got.ok) return refused(got, tool, targs)
    resolved = /** @type {any} */ (parsedOf(got.result).data)
    const found = resolved?.item
    if (typeof found?.id !== 'string')
      return {
        ok: false,
        code: 'TOOL_FAILED',
        tool,
        emdash: 'NOT_FOUND',
        collection: r.collection,
        error: clip(`No ${String(r.collection)} entry "${r.slug}" in ${r.locale}.`)
      }
    targs = { ...targs, id: found.id }
    named = `${r.slug}@${r.locale}`
    notes.push(`id ${r.slug}@${r.locale} is ${found.id}`)
  }

  // 🔒 D34 — A DELETE ASKS THE CUSTOMER FIRST. `tracy_emdash` forwards any tool the site publishes,
  // so without this one unconfirmed call could remove a whole collection (`schema_delete_collection`).
  // It is decided AFTER the locale rule and keyed on the RESOLVED call (collection + ULID): decided
  // before it, `content_delete {id:"<slug>"}` on a site serving two languages asked the customer,
  // was then refused EMDASH_ULID_REQUIRED after their yes, and the ULID retry — another key — asked
  // them a second time (review of P4, 25/09). Now the form is settled first, and the slug call
  // repeated after the answer resolves to the same key as its ULID form. Nothing destructive runs
  // before the answer: the only execs above are reads.
  //
  // 🔒 F3 (27/09/2026): AN ENTRY IN N LANGUAGES IS ONE QUESTION. EmDash keeps one row per language,
  // and the key above is a row's: deleting a post that exists in three languages asked the customer
  // three times, and after the first yes only that one row went. A delete of an entry now reads its
  // rows once (`translationGroup`, below — a read, remembered for this turn so the other rows cost
  // none); when it has several, it is asked about as the whole entry: one key for every row, a
  // question saying "in all N languages", and the rows in the answer (`entries`). Once the customer
  // agreed, the entry's other rows go on that answer for the rest of this turn.
  //
  // 🔒 F3.2 (30/09/2026): ONE YES TO THE WHOLE ENTRY IS ONE CALL, AND IT REMOVES WHAT WAS ASKED. The
  // question said "in all 40 languages"; the call it opened removed ONE row, and the agent walked the
  // other 39 with a call each (v7 EmDash: 15 LLM calls, 52 tool calls) — or, where it left out
  // `confirm:true`, asked the customer once per language. Now the whole-entry call removes every row
  // of the entry (`removeOtherLanguages`, each row still its own `content_delete` and its own line in
  // the answer), and an agreement to the whole entry carries to a row call with or without the
  // model's flag: the flag was never the customer's word, the recorded answer is.
  //
  // 🔒 F4 (30/09/2026): A ROW NAMED BY ITS ULID, WITH NO LANGUAGE BESIDE IT, IS THE ENTRY. F3.1 read every
  // ULID as one language's — "delete the Russian version" — and the measurement said otherwise: the model
  // names a row by its ULID whenever it has one (a list row, a `content_translations` answer, a pick's
  // `emdash:<collection>:<ulid>:<slug>` mark), for "delete this post" too. 4 of 8 measured EmDash deletes
  // did (V7-delete-chat-dev/-wri, V7-delete-pick-des/-seo on a 40-language site): the door asked about ONE
  // row, the customer said yes, one language went and 39 stayed online — or the agent then walked the
  // other 39 and the customer was asked 40 times (19 LLM calls, 43–47 refused calls, no answer). A
  // ULID and the slug the door would have resolved to name the same entry, so they now get the same one
  // question ("in all N languages") and the same one call. A language is named where the call says so:
  // `locale` beside the id (or beside the slug). `error` says it, since the model cannot know: EmDash's
  // `content_delete` takes no locale, so nothing else tells it that Tracy reads one.
  /** The entry a whole-entry delete removes in every language once it is agreed (F3.2), else null. */
  let entryGroup = null
  /** The other rows of that entry EmDash said it removed (C1, `REMOVED_ROWS`), whatever order they finished in. */
  const othersRemoved = new Set()
  /** The entry a one-language delete leaves other languages of (F4): its answer says how many stay. */
  let rowGroup = null
  /** How many rows of the entry were online when the question was asked (F4). */
  let liveAtAsk = 0
  if (EMDASH_DESTRUCTIVE_TOOLS.has(tool) || TRACY_DESTRUCTIVE_TOOLS.has(tool)) {
    const group = GROUP_DELETE_TOOLS.has(tool) ? await translationGroup(tool, targs) : null
    // The rows still online: one this turn already removed is not asked about again (F4).
    const live = liveRowsOf(tool, group)
    liveAtAsk = live
    const groupKey =
      group === null ? null : confirmKey(tool, { collection: targs.collection, translationGroup: group.id })
    // 🔒 F3.1 (28/09/2026): THE QUESTION DESCRIBES THE CALL THAT WAS MADE. A row THE MODEL named is
    // one language's — "delete the Russian version" is its slug with `locale:"ru"` — and asking about
    // it as the whole entry made the card say "in all 3 languages", list en/ru/de as `entries`, and
    // send the agent on to delete all three on one Yes, while a No stopped the one delete the customer
    // did ask for. The whole entry is asked about wherever the call named no language: TRACY chose one
    // (`plan.filled`: a slug and no locale — the case F3 was written for), or the id is a ULID with no
    // locale beside it (F4, above). The rows are read either way, so an agreement to the whole entry
    // still carries to its other rows (`groupKey`) with no second question.
    const agreedEarlier = groupKey !== null && state.groupAgreed(label, sessionId, groupTurn, groupKey)
    // `plan.resolve` is set when the model named a slug: `targs.id` is then the ULID the door read from it,
    // and the language was Tracy's or the model's own `locale` — never this shape.
    const byRowId = tool === 'content_delete' && plan.resolve === undefined && rowIdWithoutLanguage(targs)
    const wholeEntry = group !== null && live >= 2 && (plan.filled !== null || (byRowId && !agreedEarlier))
    const key = wholeEntry ? /** @type {string} */ (groupKey) : confirmKey(tool, confirmArgs(tool, targs))
    let carried = agreedEarlier
    // The customer may have agreed to the WHOLE entry already — the question a slug call asked — and
    // the agent then removes the rows left by their ULIDs, each of which is a row call. That answer
    // carries, and is recorded here so the rest of the rows cost no question either.
    if (!carried && !wholeEntry && groupKey !== null && customerAgreed(groupKey, { mark: false })) {
      carried = true
      state.agreeGroup(label, sessionId, groupTurn, groupKey)
    }
    // Only the door's own question opens a delete (30/09/2026): a question the agent wrote first,
    // however it names the entry, is no agreement — the whole entry's question says "in all N languages"
    // and the customer answers that one (`call-memory.mjs` `confirmed`).
    // A row of an entry that has other languages online (F4): the question says so, and the way to ask
    // about them all — what the customer agrees to is then what the card said.
    const others = !wholeEntry && tool === 'content_delete' && group !== null && live >= 2 ? live - 1 : 0
    // Read before `customerAgreed` marks the call asked again (a new record): the last answer was typed.
    const typed =
      typeof memory?.answeredByTyping === 'function' && typeof sessionId === 'string'
        ? memory.answeredByTyping(sessionId, key)
        : false
    if (!carried && !customerAgreed(key)) {
      const described = destructiveTarget(
        tool,
        named === null ? { ...targs, id: rowNamed(targs, group) } : { ...targs, id: named },
        wholeEntry && group !== null ? { name: group.name, size: live } : null
      )
      const { verb } = described
      let { target } = described
      // 🔒 ONE ENTRY'S DELETE NAMES THE ENTRY (council 20/10/2026): its title as the site has it, read
      // here, with its collection and language — never `posts/01M…`. Unreadable: not asked at all.
      if (!wholeEntry && (tool === 'content_delete' || tool === 'content_permanent_delete')) {
        const title = await entryTitle(named ?? targs.id)
        // A row already in the trash reads as nothing: its slug (`posts/hello-world@en`) still names
        // it; only a bare ULID names nothing a person knows.
        if (title === null && /[0-9A-HJKMNP-TV-Z]{26}/.test(target)) return unread()
        const where = typeof targs.locale === 'string' ? ` (${targs.locale})` : ''
        if (title !== null)
          target =
            title !== ''
              ? `${String(targs.collection ?? '')} "${title}"${where}`
              : `an untitled entry of ${String(targs.collection ?? '')}${where}`
        if (sessionId) memory?.confirmAsked?.(sessionId, key, true, title ? [title] : [], 'delete')
      }
      // 🔒 ONE QUESTION, ONE ANSWER TO A BURST (09/10/2026). Told an entry has 40 translations, the agent sent
      // 20 `content_delete`s in ONE step, one per row; each named the same entry (F4), each was answered the
      // whole refusal ("in all 40 languages", its target and error), and all 20 rode every later step (bench hb,
      // hbr3 EmDash delete by chat: 30 calls, 265k prompt tokens). The first call of the entry in this turn
      // carries the full refusal; every other one is answered short, with the SAME question (its id unchanged,
      // so whichever answer the agent forwards opens it) and a next that says one call is the whole delete.
      // Nothing opens without the customer's answer to that question — this only shortens the refusal.
      if (wholeEntry && group !== null && state.askedGroupBefore(label, sessionId, groupTurn, key))
        return {
          ok: false,
          code: 'CONFIRM_FIRST',
          tool,
          already: true,
          languages: live,
          error: clip(
            `Asked already: the same entry as this turn's first ${tool}, in all ${live} languages.`
          ),
          next: `ask_user_question with this ask once (id as given); on yes, ONE ${tool} with confirm:true removes all ${live} languages. Send no other row.`,
          ask: confirmQuestion(key, clip(`This ${verb} ${target}.`))
        }
      const stays = others === 1 ? 'other language stays' : `other ${others} languages stay`
      const only = others > 0 ? ` only; the entry's ${stays} online` : ''
      const error = clip(
        `${tool} ${verb} ${described.target}${only}.${wholeEntry && byRowId ? ' One language only: add locale.' : ''}`
      )
      return {
        ok: false,
        code: 'CONFIRM_FIRST',
        tool,
        target: described.target,
        error,
        // F3.2: the rows are no longer the agent's to walk — the same call removes them all — so the
        // refusal says how many, not which (40 ids re-sent on every later step).
        ...(wholeEntry && group !== null ? { languages: live } : {}),
        ...(others > 0 ? { otherLanguages: others } : {}),
        ...(typed ? { typed: true } : {}),
        // The customer reads the change without the tool's name; `error` keeps it for the agent.
        ask: confirmQuestion(
          key,
          clip(others > 0 ? `This ${verb} ${target} only; its ${stays} online.` : `This ${verb} ${target}.`)
        )
      }
    }
    if (wholeEntry && groupKey !== null) state.agreeGroup(label, sessionId, groupTurn, groupKey)
    if (wholeEntry && group !== null) entryGroup = group
    else if (others > 0) rowGroup = group
    notes.push(
      wholeEntry && group !== null
        ? `the customer confirmed it for all ${live} languages of this entry`
        : 'the customer confirmed it'
    )
  }

  // ADR 0034 (council 19/10/2026): what EmDash does not mark destructive but keeps no undo for, and the
  // public site shows at once — an entry taken off it, the menu, the site's settings. Asked as a delete
  // is, by the door's own question, opened once by the customer's yes (`consequence.mjs`).
  const asked = hostStep === true ? null : emdashConsequenceOf(tool, targs)
  let consequence = asked?.reason === 'shared' && modelCall !== true ? null : asked
  // A build's saved plan is the customer's yes to what it writes (pilot 24/10/2026: an EmDash build stood on
  // "This changes your site's shared details" with nobody at the chat).
  if (consequence !== null && typeof planAgreed === 'function' && (await planAgreed()) === true)
    consequence = null
  if (consequence !== null) {
    const key = confirmKey(tool, confirmArgs(tool, targs))
    // Marked here, not by `customerAgreed`: the record keeps what the card must name (`facts`).
    if (!customerAgreed(key, { mark: false })) {
      // An entry taken off the site is asked about by its title (council 20/10/2026, live run).
      if (tool === 'content_unpublish') {
        const title = await entryTitle(targs.id)
        if (title === null) return unread()
        consequence = emdashConsequenceOf(tool, targs, { title }) ?? consequence
      }
      if (sessionId)
        memory?.confirmAsked?.(
          sessionId,
          key,
          true,
          consequence.facts,
          tool === 'content_unpublish' ? 'hide' : null
        )
      return {
        ok: false,
        code: 'CONFIRM_FIRST',
        tool,
        consequence: consequence.reason,
        error: clip(consequence.error),
        ask: confirmQuestion(key, clip(consequence.sentence))
      }
    }
    notes.push('the customer confirmed it')
  }

  // v6 (29/09/2026): ON TRACY BUSINESS AN ENTRY'S `seo` TITLE AND DESCRIPTION NEVER SHOW. Every view
  // hands `<Base>` its own title and description (the lede, hero_text, ...), and the layout's head
  // policy wins over the panel (`src/lib/hreflang.ts`, the TEMPLATE wins), so the write was accepted
  // with `changed:{}` and agents reported "done" three times over an unchanged page. Refused here,
  // with the road that renders; `seo.noIndex` and the image still work and are not touched.
  if (
    tool === 'content_update' &&
    /** @type {any} */ (artifact)?.templateId === 'tracy-business' &&
    isRecord(targs.seo) &&
    ('title' in targs.seo || 'description' in targs.seo)
  )
    return {
      ok: false,
      code: 'SEO_NOT_RENDERED',
      tool,
      ...(typeof targs.collection === 'string' ? { collection: targs.collection } : {}),
      error: clip(
        "This template prints the page's own fields in the head, so seo.title and seo.description would be accepted and never show."
      ),
      next: "Description = the page's visible intro (lede, or hero_text on home): write that and say the visible text changes. <title> = the page's title field (breadcrumb where the page has one): the breadcrumb shows it too. settings_update {seo:{…}} verification tags do render."
    }

  // D12: the read before a write that can publish or merge onto a draft.
  /** @type {Record<string, unknown> | null} */
  let before = null
  /** @type {string[]} */
  let foreignDraft = []
  /**
   * Whether the entry held somebody else's waiting change before this write: then what this write
   * leaves waiting is theirs AND ours, and never this conversation's own to publish (D12).
   */
  let foreignBefore = false
  /** Whether the entry held a draft this conversation staged itself (`state.stage` below). */
  let stagedHere = false
  /**
   * The long fields this write sends whole and the guard judged (D6′), for what it stored to be
   * remembered after it (`emdashBodyGuard`).
   * @type {Array<{ field: string, ref: string, sent: unknown, length: number }>}
   */
  let bodyWrites = []
  /** Whether the guard took a shorter body on the customer's own words: the new baseline at once. */
  let bodyReset = false
  if (tool === 'content_update' || tool === 'content_publish') {
    let got = resolved
    if (got === null) {
      const pre = await call(
        mcpToolCall('content_get', {
          collection: targs.collection,
          id: targs.id,
          ...(typeof targs.locale === 'string' ? { locale: targs.locale } : {})
        }),
        true
      )
      if (!pre.ok) return refused(pre, tool, targs)
      got = /** @type {any} */ (parsedOf(pre.result).data)
    }
    before = got?.item && typeof got.item === 'object' ? got.item : null
    // G5: a list field sent as the items that change, merged onto the list this read answered.
    if (tool === 'content_update' && isRecord(targs.data) && before !== null) {
      const merged = mergeListPatches(targs.data, isRecord(before.data) ? before.data : {})
      if (merged.refusal !== null) return { ok: false, code: 'BAD_CALL', tool, ...merged.refusal }
      if (merged.fields.length > 0 || merged.objects.length > 0 || merged.rows.length > 0)
        targs = { ...targs, data: merged.data }
      if (merged.rows.length > 0)
        notes.push(`${merged.rows.join(', ')}: each row kept its _rowId by position`)
      const bank = state.rowBank?.(
        [
          label,
          targs.collection,
          before.id ?? targs.id,
          typeof targs.locale === 'string' ? targs.locale : ''
        ].join('\0')
      )
      if (bank && isRecord(targs.data) && isRecord(before.data)) {
        const again = reuseRemovedRowIds(
          /** @type {Record<string, unknown>} */ (targs.data),
          before.data,
          bank
        )
        if (again.back.length > 0) {
          targs = { ...targs, data: again.data }
          notes.push(`${again.back.join(', ')}: a row put back took the _rowId it had`)
        }
      }
      if (merged.fields.length > 0)
        notes.push(`${merged.fields.join(', ')}: the items sent were merged into the list as it stands`)
      // v6 L4-01: said, so a key the model meant to drop is visible — and dropped with "<key>": null.
      for (const { field, kept } of merged.objects)
        notes.push(
          kept.length > 0
            ? `${field}: merged into its value as it stands; kept ${kept.slice(0, 4).join(', ')}${kept.length > 4 ? ` +${kept.length - 4}` : ''}`
            : `${field}: the keys sent were merged into its value as it stands`
        )
    }
    // D6′ on EmDash: a long text or rich-text field sent whole is judged against what was read of it.
    if (tool === 'content_update' && isRecord(targs.data) && before !== null) {
      const judged = emdashBodyGuard({
        collection: targs.collection,
        id: before.id ?? targs.id,
        data: targs.data,
        stored: isRecord(before.data) ? before.data : {},
        memory,
        sessionId,
        removes: shape.removes,
        customerWords: () => (typeof customerWords === 'function' ? customerWords() : '')
      })
      if (judged.refuse) {
        const r = judged.refuse
        const counted = r.read === true && r.conversation !== false
        const again =
          counted &&
          (memory?.shrinkRefused?.(sessionId, label, bodyRef('emdash', r.collection, r.id)) ?? 0) >= 2
        return withNext(r, {
          platform: 'emdash',
          sealed: false,
          customerRemoval: asksRemoval(typeof customerWords === 'function' ? customerWords() : ''),
          ...(again ? { shrinkAgain: true } : {})
        })
      }
      notes.push(...judged.notes)
      bodyWrites = judged.fields
      bodyReset = judged.reset
    }
    // A picture id the model wrote must be one the library holds: a copy that lost a character was accepted
    // and left the page with no picture (v7 cp3). One `media_get` per changed picture, and only EmDash's own
    // NOT_FOUND refuses: a read that failed for any other reason says nothing about the picture.
    // P2: an id the library already vouched for in this conversation (handed out, or answered by an earlier
    // `media_get`) is there, so one picture written into N language rows is asked about once (`noteLibrary`).
    if (tool === 'content_update' && isRecord(targs.data) && before !== null) {
      for (const { field, id } of writtenPictureIds(targs.data, isRecord(before.data) ? before.data : {})) {
        if (state.mediaKnown(label, sessionId, id)) continue
        const lib = await call(mcpToolCall('media_get', { id }), true)
        noteLibrary(state, label, sessionId, 'media_get', lib)
        if (!lib.ok && lib.code === 'TOOL_FAILED' && emdashCodeOf(lib.error) === 'NOT_FOUND')
          return {
            ok: false,
            code: 'MEDIA_NOT_FOUND',
            tool,
            ...(typeof targs.collection === 'string' ? { collection: targs.collection } : {}),
            ...(typeof targs.id === 'string' ? { id: targs.id } : {}),
            error: clip(`${field} names picture ${id}, and the library holds none with that id.`),
            next: clip(
              'Copy the id exactly from media.scan or from the entry that shows the picture (26 characters); media_list finds a picture by its name.'
            )
          }
      }
    }
    // G2: the token comes from the read this write makes anyway, when the model sent none.
    if (!hasRev(targs)) {
      const rev = typeof got?._rev === 'string' && got._rev !== '' ? got._rev : null
      if (rev === null)
        return {
          ok: false,
          code: 'REV_MISSING',
          tool,
          ...(typeof targs.collection === 'string' ? { collection: targs.collection } : {}),
          ...(typeof targs.id === 'string' ? { id: targs.id } : {}),
          error: `${tool} needs _rev, and the read before it answered none.`
        }
      targs = { ...targs, _rev: rev }
    }
    if (before !== null && state.revsOn()) {
      const computed = revOf(before)
      // 🔒 Checked on every pre-read, not assumed: a list row's `_rev` is COMPUTED, and a wrong token
      // is a CONFLICT on every write made from a list. One disagreement turns them off for good.
      if (typeof got._rev === 'string' && computed !== null && computed !== got._rev) {
        state.revsOff()
        notes.push(REVS_OFF_NOTE)
      }
    }
    const key = `${label}:${String(before?.id ?? targs.id)}`
    stagedHere = state.isStaged(sessionId, key)
    const guard = draftGuard({ tool, args: targs, before, stagedHere })
    // Somebody else's waiting change goes live only on the customer's word, as a delete does: without
    // this way through, the refusal's own next ("ask the customer") would lead to the same refusal.
    // 🔒 D34 MODEL FOR A WAITING CHANGE (v6 EmDash L4-01: three cards for one operation): the
    // agreement is keyed on the operation as the customer heard it — tool, collection, the entry's
    // translation group, status — NOT on the language row's id, locale, `_rev` or data. One yes then
    // covers the same operation on that entry's other language copies in the same turn (`agreeGroup`,
    // which a No or a new turn empties). Only the customer's answer opens it (`customerAgreed`); the
    // group carry needs the model's `confirm:true` AND an agreement this host recorded, so nothing
    // the agent writes can open it. No translation group read → the exact call, as before.
    const group = typeof before?.translationGroup === 'string' ? before.translationGroup : null
    const draftKey =
      group === null
        ? confirmKey(tool, targs)
        : confirmKey(tool, {
            collection: targs.collection,
            translationGroup: group,
            ...(typeof targs.status === 'string' ? { status: targs.status } : {})
          })
    if (guard !== null && guard.code === 'PENDING_DRAFT') {
      const carried =
        group !== null && shape.confirm && state.groupAgreed(label, sessionId, groupTurn, draftKey)
      if (!carried && !customerAgreed(draftKey, { own: false })) return guard
      if (group !== null) state.agreeGroup(label, sessionId, groupTurn, draftKey)
    } else if (guard !== null) return guard
    if (guard !== null) notes.push('the customer agreed to publish the change that was waiting')
    // The receipt names another person's fields that this write merged onto — or put live.
    foreignBefore = entryState(before) === 'pendingDraft' && !stagedHere
    if (foreignBefore) foreignDraft = draftFieldsOf(before)
  }

  // The call itself. A read may be asked twice (E2.4); a write never.
  const answer = EMDASH_REDIRECT_TOOLS.has(tool)
    ? await runRedirect(tool, targs)
    : await call(mcpToolCall(tool, targs), read)
  if (changesServedLocales(tool, targs)) state.dropServedLocales(label)
  noteLibrary(state, label, sessionId, tool, answer)
  if (!answer.ok) {
    const out = refused(answer, tool, targs)
    // G3: a menu asked by a name this site does not have ("main" — four bench cases on 25–27/09)
    // answers the names it does have, so the next call is the right one instead of a `menu_list`.
    if (tool === 'menu_get' && out.emdash === 'NOT_FOUND') {
      const listed = /** @type {any} */ (
        await runEmdashCall({
          args: {
            tool: 'menu_list',
            arguments: typeof targs.locale === 'string' ? { locale: targs.locale } : {}
          },
          site,
          artifact,
          mcp,
          state,
          sessionId,
          turn,
          memory,
          page,
          sleep
        })
      )
      const names = (Array.isArray(listed?.result?.items) ? listed.result.items : [])
        .map((/** @type {any} */ m) => m?.name)
        .filter((/** @type {unknown} */ n) => typeof n === 'string')
      if (names.length > 0) {
        out.menus = names.slice(0, 12)
        out.next = 'menu_get {name} with one of menus.'
      }
    }
    // Round 7: a collection named after the page (`post`, `news`) answers the collections the site has,
    // slug and label, and the nearest to the guess — one read on this refusal only (`collectionsAnswer`).
    // (never for the list itself: the read below cannot ask for another read of itself)
    const guessed = tool === 'schema_list_collections' ? null : missingCollectionOf(out)
    if (guessed !== null) {
      const listed = await runEmdashCall({
        args: { tool: 'schema_list_collections', arguments: {} },
        site,
        artifact,
        mcp,
        state,
        sessionId,
        turn,
        memory,
        page,
        sleep,
        // names and labels are all this read is for: no schema read per collection (F4)
        fieldsToo: false
      })
      Object.assign(out, collectionsAnswer(listed, guessed))
      // A list asked by the collection's label ("news" for `posts`, labelled News) is that list: asked
      // again once under its slug, and said (`soleCollection`). A write is never re-aimed.
      const sole = tool === 'content_list' && guessed !== '' ? soleCollection(listed, guessed) : null
      if (sole !== null && sole !== targs.collection)
        return withNotes(
          await runEmdashCall({
            args: { tool, arguments: { ...targs, collection: sole } },
            site,
            artifact,
            mcp,
            state,
            sessionId,
            turn,
            memory,
            page,
            sleep
          }),
          [...notes, `collection "${guessed.slice(0, 30)}" is ${sole} here: the list was read from it`]
        )
    }
    return out
  }
  const { data, text } = parsedOf(answer.result)
  // D6′: what this conversation now knows of the entry's long fields — what a read showed, what a write
  // stored — and that an undo or a delete makes every length it read a guess (as on WordPress).
  const bodyCheck = rememberBodies({
    tool,
    collection: targs.collection,
    data,
    memory,
    sessionId,
    written: bodyWrites,
    reset: bodyReset
  })

  /**
   * 🔒 DRAFTS THIS CONVERSATION STAGED ARE ITS OWN TO PUBLISH LATER — AND ONLY THOSE (D12: "stagedHere
   * only when `before` had no pending draft"). A no-status `content_update` onto somebody else's
   * waiting change merges into THEIR draft; staging that entry here let this conversation's next
   * `status:"published"` pass the guard and put the other person's fields live, with no `mixed` on
   * the receipt (review of P4, 25/09: step 1 answered mixed {hero_title_a, hero_title_b}; step 2
   * published them, ok:true, two writes). So an entry is staged only when the read before showed
   * no waiting change, or one this conversation staged itself; an update whose read before held no
   * entry is not staged either — the next publish reads again and decides then.
   */
  const item = /** @type {any} */ (data)?.item
  // D_UNDO: the restore Tracy's own receipt named leaves a draft that is this conversation's own.
  if (tool === 'revision_restore' && typeof targs.revisionId === 'string') {
    const undone = state.takeUndo(sessionId, targs.revisionId)
    if (undone !== undefined) {
      state.stage(sessionId, undone)
      notes.push("restored the revision this conversation's own receipt named")
    }
  }
  if (
    (tool === 'content_update' || tool === 'content_create' || tool === 'content_publish') &&
    typeof item?.id === 'string'
  ) {
    const key = `${label}:${item.id}`
    const ours =
      tool === 'content_create' ||
      (tool === 'content_update' && (stagedHere || (before !== null && !foreignBefore)))
    if (entryState(item) === 'pendingDraft' && tool !== 'content_publish' && ours) state.stage(sessionId, key)
    else state.unstage(sessionId, key)
  }

  const revs = state.revsOn()
  const shaped =
    data === null
      ? { text }
      : shapeAnswer({ tool, args: targs, data, raw: shape.raw, before, foreignDraft, revs })
  if (tool === 'content_update' && typeof item?.id === 'string') {
    const undoRev = undoRevisionIdOf(/** @type {any} */ (shaped))
    if (undoRev !== null) state.rememberUndo(sessionId, `${label}:${item.id}`, undoRev)
  }
  if (!revs && tool === 'content_list') notes.push(REVS_OFF_NOTE)
  // `raw` keeps EmDash's own shape; only a list is still cut, since only a list has a way to the rest.
  // F7 (28/09): the page's rows AS EMDASH SENT THEM ride along, for the resume cursor only — the order
  // value a cursor carries is a timestamp `shapeRow` drops, so a shaped row could never prove the order.
  const listKey = EMDASH_BUDGETS[tool]?.listKey
  const sentRows =
    listKey !== undefined && isRecord(data) && Array.isArray(data[listKey]) ? data[listKey] : null
  const result = shape.raw && listKey === undefined ? shaped : budget(tool, shaped, sentRows)
  /** @type {Record<string, unknown>} */
  const out = { ok: true, site: label, tool }
  // `localePlan` fills only where the call named no ULID, so an echo is never noise. On a site serving
  // several languages it says how many, never which: the 39 codes it used to list (benchemdash01, PR1
  // bench) rode on every read, were re-sent on every later step, and were read as a scope to ask about.
  if (plan.filled !== null)
    out.locale = {
      filled: plan.filled,
      ...(typeof plan.languages === 'number' && plan.languages > 1 ? { languages: plan.languages } : {})
    }
  // A cut answer's `truncated` and `next` sit beside `result`, where every Tracy answer carries them.
  if (result && typeof result === 'object' && !Array.isArray(result) && 'truncated' in result) {
    const { truncated, next, ...rest } = /** @type {Record<string, unknown>} */ (result)
    out.result = rest
    out.truncated = truncated
    if (next !== undefined) out.next = next
  } else out.result = result
  if (tool === 'media_delete') {
    const storageDeleted = isRecord(out.result) && out.result.storageDeleted === true
    const warning = storageDeleted
      ? 'Deleted the media library record and stored file; page references remain and may break. No edge/CDN purge is available, so a cached public URL may still serve. Do not claim the URL is revoked or unreachable.'
      : 'Deleted the media library record, but the stored file was not confirmed removed and may remain and still be served from origin. Page references remain and may break. No edge/CDN purge is available, so a cached public URL may still serve. Do not claim the file or URL is gone, revoked, or unreachable.'
    out.next = typeof out.next === 'string' ? `${out.next} ${warning}` : warning
  }
  // F3.2: the entry's other languages go on the same yes, in this same call.
  if (entryGroup !== null) {
    entryGroup.gone.add(String(targs.id))
    const rest = await removeOtherLanguages(entryGroup)
    out.removed = { languages: liveAtAsk - rest.length, of: liveAtAsk }
    if (rest.length > 0) {
      out.failed = rest.slice(0, 10)
      out.next = `The customer's answer covers these too: the same ${tool} with confirm:true and each id in failed, once more.`
    }
    notes.push(
      rest.length === 0
        ? `every language of this entry went (${liveAtAsk})`
        : `${liveAtAsk - rest.length} of ${liveAtAsk} languages went; see failed`
    )
  } else if (rowGroup !== null) {
    // 🔒 F4: ONE LANGUAGE WENT AND THE ENTRY IS STILL ONLINE IN THE OTHERS — the answer says so, with the
    // one call that removes them too, so the customer is told what the site now holds and never left to
    // find it. What is left is removed only on the customer's word: that call asks first, as any does.
    rowGroup.gone.add(String(targs.id))
    const left = rowGroup.entries.filter((e) => !rowGroup.gone.has(e.id))
    out.removed = { languages: 1, of: liveAtAsk }
    if (left.length > 0 && out.next === undefined) {
      const n = left.length
      out.next = `The entry is still online in ${n} other language${n === 1 ? '' : 's'}: tell the customer. If they want ${n === 1 ? 'that one' : 'those'} removed too: ${tool} {collection, id:"${left[0].id}"} with no locale asks once and removes what is left. Never remove ${n === 1 ? 'it' : 'them'} unasked.`
    }
  }
  // C1 (04/10/2026): the rows this delete removed, for the report to Tracy only (`REMOVED_ROWS`): the
  // asked row (its ULID, a slug resolved above), then the entry's other rows that went, in its order.
  if (GROUP_DELETE_TOOLS.has(tool) && typeof targs.collection === 'string' && typeof targs.id === 'string') {
    const others = (entryGroup?.entries ?? []).map((e) => e.id).filter((id) => othersRemoved.has(id))
    Object.defineProperty(out, REMOVED_ROWS, {
      value: { collection: targs.collection, ids: [...new Set([targs.id, ...others])] },
      enumerable: true
    })
  }
  // D6′ (b): a long field the site stored shorter than it was sent is said, with the read that shows it.
  if (bodyCheck !== null) {
    out.verified = false
    out.chars = bodyCheck.chars
    if (out.next === undefined)
      out.next = `content_get {collection:"${String(targs.collection).slice(0, 40)}", id:"${String(item?.id ?? targs.id).slice(0, 40)}"} once, then tell the customer what the entry holds.`
  }
  // Dev e2e 04/10/2026: the entry's title and the live state this write moved, for the report to Tracy
  // only (`WRITE_FACTS`): Site changes names the entry by it, and matches the publish it made.
  const facts = writeFacts({ tool, args: targs, data, before })
  if (facts !== null) Object.defineProperty(out, WRITE_FACTS, { value: facts, enumerable: true })
  // F4 (30/09/2026): the list also answers what a create into one of its collections takes.
  if (tool === 'schema_list_collections' && fieldsToo && !shape.raw) {
    const fields = await recordFieldsRead(out.result)
    if (fields !== null) out[RECORD_FIELDS_KEY] = fields
  }
  return withNotes(out, notes)

  /**
   * 🔒 F4 (30/09/2026): THE FIELDS OF THE COLLECTIONS THAT HOLD RECORDS RIDE ON THE LIST. Every EmDash add
   * ran `schema_list_collections` to find the collection the listing page's label names, then
   * `schema_get_collection {slug}` for the fields its create takes, then the create: 4 steps where the
   * facts of the second were one read of the door's own away from the first (round 7: 8 of 8 EmDash add
   * runs, 5 of them exactly 4 steps; the floor was 3). So after a list, the door reads each record
   * collection (`recordCollectionsOf`: a page per entry, then entries with no page; at most six),
   * in parallel, and answers their fields beside `result` as `{<slug>: "title:string required, …"}`.
   *
   * FAIL OPEN, three ways: a read that is refused, answers badly or throws leaves that collection out,
   * and the answer is the plain list when none came; one that passes `fieldsMs` is not waited for — a
   * real timer, so a stuck read never holds the list for the exec timeout; and the list itself is never
   * a refusal because of them. A collection left out is one `schema_get_collection {slug}` away, as before.
   * @param {unknown} result - the shaped list answer (`out.result`).
   * @returns {Promise<Record<string, string> | null>}
   */
  async function recordFieldsRead(result) {
    const slugs = recordCollectionsOf(isRecord(result) ? result.items : null)
    if (slugs.length === 0) return null
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer
    // Not `unref`'d: it is cleared below the moment the reads settle, and while one is stuck this timer is
    // what ends the wait.
    const tooLate = new Promise((resolve) => {
      timer = setTimeout(resolve, fieldsMs, null)
    })
    /** What has arrived, by slug: read when the reads are done or the wait is over, whichever comes first. */
    const kept = new Map()
    try {
      const reads = slugs.map(async (slug) => {
        try {
          const got = /** @type {any} */ (
            await runEmdashCall({
              args: { tool: 'schema_get_collection', arguments: { slug } },
              site,
              artifact,
              mcp,
              state,
              sessionId,
              turn,
              memory,
              page,
              sleep,
              fieldsToo: false
            })
          )
          const text = got?.ok === true ? recordFieldsOf(got.result) : null
          if (text !== null) kept.set(slug, text)
        } catch {
          // a read that throws is one collection left out
        }
      })
      await Promise.race([Promise.all(reads), tooLate])
      const arrived = slugs.filter((slug) => kept.has(slug)).map((slug) => [slug, kept.get(slug)])
      return arrived.length === 0 ? null : Object.fromEntries(arrived)
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * One form tool, through the injected forms exec: the plugin's list is read first, and `form_words` sends back
   * the form it read with only the asked words changed.
   * @param {string} formTool
   * @param {Record<string, unknown>} formArgs
   * @returns {Promise<any>}
   */
  async function runForm(formTool, formArgs) {
    if (typeof forms !== 'function')
      return {
        ok: false,
        code: 'BAD_CALL',
        tool: formTool,
        error: `${formTool} is not available on this door.`
      }
    const listed = await forms({ route: 'forms/list', body: '{}' })
    if (!listed.ok) return listed
    const items = /** @type {any} */ (parsedOf(listed.result).data)?.items
    if (!Array.isArray(items))
      return {
        ok: false,
        code: 'TOOL_FAILED',
        error: '[FORMS_ERROR] the forms plugin answered no list of forms'
      }
    // A site serving many languages keeps a form per language: the list names them, one form answers its words.
    if (formTool === 'form_list' && typeof formArgs.id !== 'string')
      return {
        ok: true,
        result: {
          forms: items.map((item) => ({ id: item?.id, name: item?.name, slug: item?.slug })),
          next: 'form_list {id} answers one form’s words; form_words {id, …} changes them.'
        }
      }
    const form = items.find((item) => item?.id === formArgs.id)
    if (!form)
      return {
        ok: false,
        code: 'BAD_CALL',
        tool: formTool,
        error: `${String(formArgs.id)}: no such form on this site; form_list answers the form ids.`
      }
    if (formTool === 'form_list') return { ok: true, result: { form: formWordsOf(form) } }
    const update = formWordsUpdate(form, formArgs)
    if (!update.ok) return update
    const written = await forms({ route: 'forms/update', body: JSON.stringify(update.body) })
    if (!written.ok) return written
    const saved = /** @type {any} */ (parsedOf(written.result).data)
    return {
      ok: true,
      result: { form: formWordsOf(saved && typeof saved === 'object' ? saved : { ...form, ...update.body }) }
    }
  }

  /**
   * One redirect tool, through the injected REST exec: the answer has the shape an `mcp` call has, so
   * the refusal and answer handling after it is the one every tool shares.
   * @param {string} redirectTool
   * @param {Record<string, unknown>} redirectArgs
   */
  async function runRedirect(redirectTool, redirectArgs) {
    if (typeof redirects !== 'function')
      return { ok: false, code: 'BAD_CALL', error: `${redirectTool} is not available on this door.` }
    return redirects(emdashRedirectRequest(redirectTool, redirectArgs))
  }

  /**
   * The served locales for this site: the memo when it may be trusted, else one read of the
   * published `site` rows. A site that cannot be reached at all answers that refusal: the call it
   * was read for would meet the same one. EmDash refusing the read is one of two things, and they
   * are told apart (review of P4, 25/09):
   * - the template has NO `site` collection (`[COLLECTION_NOT_FOUND]` on 0.37, `handleContentList`;
   *   `[NOT_FOUND]` as the stand answered) — a template fact, remembered: the languages are then the
   *   ones `template/artifact.json` declares (`locales.all`), and when it declares none the call is
   *   `unscoped` — filled with nothing and refused for nothing, as before this rule;
   * - any other refusal — the languages are unknown just now: not remembered, so the next call asks
   *   again, and a write by slug is refused rather than guessed.
   * @param {boolean} forWrite
   * @returns {Promise<{ ok: true, locales: string[], unscoped: boolean } | { ok: false, refusal: Record<string, unknown> }>}
   */
  async function servedLocales(forWrite) {
    const memo = state.servedFor(label)
    if (memo !== undefined && (!forWrite || state.verifiedFor(label, sessionId, turnNow)))
      return { ok: true, locales: memo, unscoped: state.unscopedFor(label) }
    const got = await call(
      mcpToolCall('content_list', { collection: 'site', status: 'published', limit: 100 }),
      true
    )
    /** @type {string[]} */
    let locales
    let unscoped = false
    if (got.ok) {
      const rows = /** @type {any} */ (parsedOf(got.result).data)?.items
      locales = [
        ...new Set(
          (Array.isArray(rows) ? rows : [])
            .filter((r) => r && r.status === 'published' && typeof r.locale === 'string')
            .map((r) => /** @type {string} */ (r.locale))
        )
      ]
    } else if (got.code === 'TOOL_FAILED' && NO_COLLECTION.has(emdashCodeOf(got.error) ?? '')) {
      const declared = declaredLocales(artifact)
      locales = declared ?? []
      unscoped = declared === null
    } else if (got.code === 'TOOL_FAILED') return { ok: true, locales: [], unscoped: false }
    else return { ok: false, refusal: refused(got, tool, targs) }
    state.rememberServed(label, locales, { unscoped })
    if (forWrite) state.markVerified(label, sessionId, turnNow)
    return { ok: true, locales, unscoped }
  }

  /**
   * The language rows of the entry a delete names (F3), or null when it has one row or they cannot
   * be told. One `content_translations` per (site, conversation, turn): every row it lists is
   * remembered, so the entry's other rows cost no read. A read the site did not answer is not
   * remembered and the question is the row's own, as before — asked once more at worst, never less.
   *
   * `content_permanent_delete` never reads: its row is in the trash, and EmDash's
   * `content_translations` does not see a trashed row (0.37 `findByIdOrSlug`, `deleted_at IS NULL`:
   * NOT_FOUND). Only a `content_delete` earlier in this turn can have told which entry it was.
   * @param {string} tool
   * @param {Record<string, unknown>} args
   * @returns {Promise<TranslationGroup | null>}
   */
  async function translationGroup(tool, args) {
    const { collection, id } = args
    if (typeof collection !== 'string' || collection === '' || typeof id !== 'string' || id === '')
      return null
    const known = state.groupOf(label, sessionId, groupTurn, collection, id)
    if (known !== undefined) return known
    if (tool === 'content_permanent_delete') return null
    const got = await call(mcpToolCall('content_translations', { collection, id }), true)
    if (!got.ok) {
      if (got.code === 'TOOL_FAILED') state.rememberGroup(label, sessionId, groupTurn, collection, [id], null)
      return null
    }
    const data = /** @type {any} */ (parsedOf(got.result).data)
    /** @type {Array<{ id: string, locale?: unknown, slug?: unknown }>} */
    const rows = (Array.isArray(data?.translations) ? data.translations : []).filter(
      (/** @type {any} */ r) => typeof r?.id === 'string' && r.id !== ''
    )
    const ids = [id, ...rows.map((r) => r.id)]
    const groupId =
      typeof data?.translationGroup === 'string' && data.translationGroup !== ''
        ? data.translationGroup
        : null
    if (groupId === null || rows.length < 2) {
      state.rememberGroup(label, sessionId, groupTurn, collection, ids, null)
      return null
    }
    const self = rows.find((r) => r.id === id)
    const slug = [self, ...rows].map((r) => r?.slug).find((s) => typeof s === 'string' && s.trim() !== '')
    /** @type {TranslationGroup} */
    const group = {
      id: groupId,
      name: typeof slug === 'string' ? slug : id,
      size: rows.length,
      entries: rows.map((r) => ({ id: r.id, locale: typeof r.locale === 'string' ? r.locale : null })),
      gone: new Set()
    }
    state.rememberGroup(label, sessionId, groupTurn, collection, ids, group)
    return group
  }

  /**
   * F3.2: the rows of an agreed entry beyond the one this call removed, each its own call of the same
   * tool. A row already gone (`NOT_FOUND`: trashed earlier this turn) counts as removed; any other
   * refusal is kept, with its id, for the one retry the agreement still covers.
   *
   * P3 (30/09/2026): `DELETE_PARALLEL` rows at a time instead of one after the other — 40 languages took
   * 8.4 s. Each row keeps its own call, and `gone` is updated as each one finishes; `failed` follows the
   * entry's order whichever row finished first, so the answer does not depend on timing. A row that failed
   * because the database was busy (`busyDelete`) is asked once more, alone, when the others are done,
   * before it is reported — unless a retry meets a busy database again: the database is taken, and each
   * further ask would wait out SQLite's own 5 s (EmDash 1.0.1, the tree vendored here, sets `busy_timeout`
   * to 5000: `packages/core/src/db/node-sqlite-compat.ts`) for the same answer, so the rest are reported as
   * they came, as the model's own retry line already covers.
   * @param {TranslationGroup} group
   * @returns {Promise<Array<{ id: string, locale: string | null, error: string }>>}
   */
  async function removeOtherLanguages(group) {
    const seen = new Set()
    const rows = group.entries.filter((row) => {
      if (row.id === targs.id || group.gone.has(row.id) || seen.has(row.id)) return false
      seen.add(row.id)
      return true
    })
    /** One row's own call: null once it went (or was gone already), else the refusal. */
    const remove = async (/** @type {{ id: string }} */ row) => {
      const got = await call(mcpToolCall(tool, { collection: targs.collection, id: row.id }), false)
      // Only a row EmDash removed now is Tracy's delete in its log; one already gone (NOT_FOUND) is not.
      if (got.ok) othersRemoved.add(row.id)
      if (got.ok || (got.code === 'TOOL_FAILED' && emdashCodeOf(got.error) === 'NOT_FOUND')) {
        group.gone.add(row.id)
        return null
      }
      return got
    }
    const outcomes = await mapWithLimit(rows, DELETE_PARALLEL, remove)
    let taken = false
    for (const [i, row] of rows.entries()) {
      const first = outcomes[i]
      if (taken || first === null || !busyDelete(first)) continue
      const again = await remove(row)
      outcomes[i] = again
      if (again !== null && busyDelete(again)) taken = true
    }
    /** @type {Array<{ id: string, locale: string | null, error: string }>} */
    const failed = []
    for (const [i, row] of rows.entries()) {
      const got = outcomes[i]
      if (got !== null)
        failed.push({
          id: row.id,
          locale: row.locale,
          error: clip(String(got.error ?? got.code ?? 'no answer'))
        })
    }
    return failed
  }
}

/**
 * Runs `work` over `items` with at most `limit` in flight (P3). Items start in order and the results come
 * back in the order of `items`, whichever finished first, so nothing built from them depends on timing. If
 * `work` throws, nothing new starts, what is in flight finishes, and the first error is thrown — as the
 * sequential loop this replaces stopped at the row that threw. (Not the `inPool` of the replace modules:
 * those are private, fixed at six, and read-only, so they keep handing out work after a throw.)
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} work
 * @returns {Promise<R[]>}
 */
async function mapWithLimit(items, limit, work) {
  /** @type {R[]} */
  const results = Array.from({ length: items.length })
  /** @type {unknown[]} */
  const errors = []
  let next = 0
  const lane = async () => {
    while (errors.length === 0 && next < items.length) {
      const at = next++
      try {
        results[at] = await work(items[at])
      } catch (error) {
        errors.push(error)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  if (errors.length > 0) throw errors[0]
  return results
}

/** The words SQLite uses when its one writer is taken: `SQLITE_BUSY`, `SQLITE_LOCKED`, "database is locked". */
const BUSY_TEXT = /SQLITE_(?:BUSY|LOCKED)|database (?:table )?is (?:locked|busy)/i

/**
 * Whether a failed delete failed because the site's single-writer database was busy (P3), so a second try,
 * alone, may not meet the same answer. Only an answer EmDash itself gave is judged (`TOOL_FAILED`): SQLite's
 * own words in it say so, and EmDash's delete handler swallows the driver's message into its catch-all
 * `CONTENT_DELETE_ERROR` (`handleContentDelete`: any exception in the delete transaction), so that code is
 * how a busy database arrives. A site that did not answer as EmDash (the exec timed out, a 5xx, a body that
 * was not JSON-RPC) says nothing about the database, whatever text it quotes: a dead site asked again only
 * doubles the wait. Asking again is safe for a delete: a row that did go now answers NOT_FOUND, which counts
 * as removed. Anything else — a refusal with its own reason (`[ENTRY_LOCKED]`) too — is reported as it came.
 * @param {Record<string, unknown>} answer - a failed call
 */
function busyDelete(answer) {
  if (answer.code !== 'TOOL_FAILED') return false
  return emdashCodeOf(answer.error) === 'CONTENT_DELETE_ERROR' || BUSY_TEXT.test(String(answer.error ?? ''))
}

/**
 * The deletes asked about as the whole entry when it exists in several languages (F3): EmDash's two
 * that remove an entry's row. `content_discard_draft` changes one language's draft only.
 */
const GROUP_DELETE_TOOLS = new Set(['content_delete', 'content_permanent_delete'])

/**
 * The rows of an entry still online (F4): the ones the door read for it, less those this turn already
 * removed. `content_permanent_delete` counts every row it read: they are all in the trash, which is
 * where that tool works.
 * @param {string} tool
 * @param {TranslationGroup | null} group
 */
function liveRowsOf(tool, group) {
  if (group === null) return 0
  return tool === 'content_delete' ? group.entries.filter((e) => !group.gone.has(e.id)).length : group.size
}

/**
 * Whether a call names its row by ULID and no language beside it (F4): the `id` is a ULID and there is no
 * `locale` — the shape a "delete this post" takes when the model has the row's id and no reason to think
 * of a language. `localePlan` keeps a `locale` beside a ULID (it needs none), so it is still in `args`.
 * @param {Record<string, unknown>} args
 */
function rowIdWithoutLanguage(args) {
  const { id, locale } = args
  return (
    typeof id === 'string' && ULID.test(id.trim()) && !(typeof locale === 'string' && locale.trim() !== '')
  )
}

/**
 * How a question names the row the model itself picked (F3.1): its slug and language when the
 * entry's rows were read, else the id as it came. A bare ULID in a card the CUSTOMER reads says
 * nothing about which language is going.
 * @param {Record<string, unknown>} args
 * @param {TranslationGroup | null} group
 * @returns {unknown}
 */
function rowNamed(args, group) {
  const { id } = args
  if (group === null || typeof id !== 'string' || id === '') return id
  const row = group.entries.find((e) => e.id === id)
  if (row === undefined || row.locale === null) return id
  return `${group.name}@${row.locale}`
}

/**
 * EmDash's answer to `content_list {collection:"site"}` on a template that has no such collection:
 * `COLLECTION_NOT_FOUND` in the pinned 0.37.0 (`packages/core/src/api/handlers/content.ts`,
 * `handleContentList`), `NOT_FOUND` as the stand answered it. A list names no entry, so either can
 * only mean the collection.
 */
const NO_COLLECTION = new Set(['COLLECTION_NOT_FOUND', 'NOT_FOUND'])

/**
 * The languages a template declares in `template/artifact.json` (`locales.all`, written by the
 * build from `template.config.json`), or null when it declares none.
 * @param {unknown} artifact
 * @returns {string[] | null}
 */
function declaredLocales(artifact) {
  const all = /** @type {any} */ (artifact)?.locales?.all
  if (!Array.isArray(all)) return null
  const list = [...new Set(all.filter((l) => typeof l === 'string' && l.trim() !== ''))]
  return list.length > 0 ? list : null
}

/**
 * The arguments a delete's confirmation is keyed on: the call as it will run, minus a `locale` the
 * tool does not take (the 12 entry tools take `{collection, id}` only), so `{id:"<slug>"}` resolved
 * and `{id:<its ULID>}` asked directly are one question, not two.
 * @param {string} tool
 * @param {Record<string, unknown>} args
 */
function confirmArgs(tool, args) {
  if (!ID_WITHOUT_LOCALE_TOOLS.has(tool) || !Object.hasOwn(args, 'locale')) return args
  const { locale: _unread, ...rest } = args
  return rest
}

/**
 * A refusal from the host's exec chain, carrying what `refusalNext` branches on: the tool the model
 * called, EmDash's own class for a `TOOL_FAILED`, and the collection when there is one.
 * @param {Record<string, unknown>} answer
 * @param {string} tool
 * @param {Record<string, unknown>} args
 */
function refused(answer, tool, args) {
  /** @type {Record<string, unknown>} */
  const out = { ...answer, tool }
  if (answer.code === 'TOOL_FAILED') {
    const sub = emdashCodeOf(answer.error)
    if (sub !== null) out.emdash = sub
    if (typeof args.collection === 'string') out.collection = args.collection
  }
  // 🔒 T10: `error` ≤ 160 chars. EmDash's validation dumps run to hundreds of characters and
  // nothing downstream clips them (`withNext` adds a next, it cuts nothing). The head is kept: it
  // is where EmDash names the field and the rule. The class above was read from the whole text.
  if (typeof out.error === 'string') out.error = clip(out.error)
  return out
}
