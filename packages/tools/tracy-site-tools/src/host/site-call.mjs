/**
 * One relayed `tracy_site` call, from the model's arguments to the answer it reads: corrected
 * (`normalize.mjs`), guarded, sent through the one relay, retried when the site's lock was merely
 * taken, remembered (`call-memory.mjs`), cut to a size the model can use, and given its next step.
 *
 * WHY A MODULE AND NOT MORE `index.ts`. Every rule here was measured on r2 (25/09/2026) and each one
 * fails silently when it drifts: a cached inspect served to the wrong person, a body write that cuts a
 * live page, a retry that doubles a write. `index.ts` has never been imported by a test; this module
 * takes its I/O as arguments (`send`, `sleep`, `now`, `random`, `memory`), so `test/site-call.test.mjs`
 * drives every path with fakes and `index.ts` only passes `relayRaw` in.
 *
 * PR2 (P12) adds the loop rules that need a memory of more than one call: an answer that was lost on
 * the way back is asked again, replayed or counted, never guessed (E2.2); the identical call refused
 * earlier in the turn is not sent again (E3.2); a component that lacks an action is not asked for it
 * again within the hour (E3.3); and a contract apply that names no revision is based on the one this
 * conversation read, or shown the values first (CC-12).
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { bodyRef, confirmQuestion, sameCallKey, sameCallRefused, wpRecordOf } from './call-memory.mjs'
import {
  groupAnswer,
  groupConfirmKey,
  groupDeleteApplies,
  memberByLocale,
  recordNamed,
  translationGroupOf
} from './delete-group.mjs'
import { addressAgain, localeAgain, unprefixedMiss } from './content-read-again.mjs'
import { LEGACY_BOUND_MESSAGE, LEGACY_STRUCTURE_CODE } from './legacy-refusal.mjs'
import { compactDescribe } from './describe-compact.mjs'
import {
  compactContents,
  compactPageList,
  isPageList,
  LISTED_ACTIONS,
  narrowDescribe,
  pageListRows,
  takeViewParams,
  workingLocale
} from './read-compact.mjs'
import { listSearchCovers } from './list-search.mjs'
import { contractSamples, lengthAdvice, lengthAdviceNext } from './length-advice.mjs'
import {
  malformedId,
  normalizeCall,
  prepareContractApply,
  repairedPictures,
  requestIdOf,
  resolveCall
} from './normalize.mjs'
import { withPageLists } from './page-lists.mjs'
import { latestCustomerWords } from './prompter.mjs'
import { consequenceOf } from './consequence.mjs'
import { removalAfter, removalBefore } from './removal-check.mjs'
import { inSampleShrink, isLoremSample } from './sample-text.mjs'
import { budgetAnswer, narrowInspect, outcomeUnknown, WRITER_LOCK_MESSAGE, withNext } from './site.mjs'
import { SET_ONLY_WRITE_ACTIONS } from './set-only-doors.mjs'
import { changesSite, contractOperationWrites } from './site-context.mjs'
import { createEcho, STORED_NEXT } from './stored-echo.mjs'
import { bodyHolds, contractWrote } from './receipt-echo.mjs'
import { confirmSentence, tierOf } from './tiers.mjs'
import { isTurnStopped, stoppableSleep } from './turn-stop.mjs'
import { isPlainObject, KeysLost, mergePatch } from './merge-patch.mjs'
import {
  applyBlockEdits,
  blocksAt,
  byPosition,
  outlineOf,
  patternsOf,
  blocksTouched,
  REV,
  revOf,
  topBlocks
} from './wp-blocks.mjs'
import {
  PATTERN_NOT_FOUND,
  PATTERNS_UNSUPPORTED,
  patternListOrRefused,
  patternsRefused,
  patternsUnsupported,
  withPatternNext
} from './wp-patterns.mjs'

/**
 * The relayed actions that only read. The same set as the `read` rows of `ACTION_CLASS`
 * (`site-context.mjs`) restricted to the relay — a test compares the two, so an action added there is
 * a red test here rather than a stale snapshot. Every other relayed action changes the site, and
 * after it this site's inspect snapshots are stale (D8).
 */
export const READ_ACTIONS = Object.freeze([
  'info',
  'content.list',
  'content.get',
  // #347 (content api): the Claude Cowork plugin's tracy-content/v1 read door.
  'content.read',
  // The seat book's own answer from its value index; nothing on the site moves.
  'content.locate',
  'extension.list',
  'plugin.list',
  'theme.list',
  'db.tables',
  'core.manifest',
  'db.dump',
  'apply.list'
])

/**
 * The relayed writes that add or remove media library files without changing slot values — and so
 * every content revision, a hash of that content's OWN values (`ContentProjection::revision` on
 * Joomla, `QuickstartContract::revision` on WordPress) — stays as it was. What this conversation
 * read before the media change is still what the site holds after it, and an apply based on that read
 * remains valid.
 *
 * 🔒 COUNTED AS A WRITE, AN UPLOAD MADE EVERY READ STALE (`makesReadsStale`), and the apply after it
 * answered INSPECT_FIRST: 4 of the 12 INSPECT_FIRST answers of the round-7 picture runs came after a
 * read, an upload and an apply, and each cost one whole model call for a read the model had already
 * made. Media actions leave content revisions unchanged; every other write stays a write, and the
 * component still checks each content revision when an apply lands.
 */
export const LIBRARY_ACTIONS = Object.freeze(['media.upload', 'media.delete'])

/**
 * Whether a relayed call may have changed what this site's inspect snapshots and content revisions
 * describe (D8): every action but a read or a media-library change, and a `content.contract` only when its
 * operation writes (`contractOperationWrites` — an inspect, a plan or a verify pass reads). The ONE
 * reading of this: an inspect counted as a write would bump the site's generation on its own relay
 * and never be kept.
 * @param {string} action
 * @param {Record<string, unknown>} [params]
 */
export function makesReadsStale(action, params = {}) {
  if (action === 'demo.research') return false
  if (action === 'content.contract') return contractOperationWrites(params.operation)
  // Theme-printed words: inspect and status read; only apply keeps new rules.
  if (action === 'content.renderedWords') return params.operation === 'apply'
  return !READ_ACTIONS.includes(action) && !LIBRARY_ACTIONS.includes(action)
}

/**
 * Whether the Apply door counts a relayed call as a write, and so takes (or renews) this conversation's
 * write lease for it: tracy-web's `changesSite` (`apps/tracy-web/src/sites/route.js`), rule for rule, on
 * the call as it is sent. A media preview (`media.delete {dry_run:true}`), a read (the door's `read` rows
 * and `db.dump` / `apply.list`: {@link READ_ACTIONS}), a contract operation that reads, and a set-only
 * door asked anything but `set` take no lease; every other call does.
 *
 * 🔒 NOT {@link makesReadsStale} (review C3, 19/10/2026). That one leaves out the media-library writes on
 * purpose (they keep content revisions), and the lease holders were recorded by it: a turn whose only
 * writes were `media.upload` / `media.delete` held the site's lease, never gave it back at its end, and
 * every other conversation waited out the door's 90 s of silence. The lease is the door's, so its rule is.
 * @param {string} action
 * @param {Record<string, unknown>} [params]
 */
export function doorTakesLease(action, params = {}) {
  if (action === 'demo.research') return params.operation === 'media.import'
  if (action === 'media.delete' && params.dry_run === true) return false
  if (READ_ACTIONS.includes(action)) return false
  if (action === 'content.contract') return contractOperationWrites(params.operation)
  if (action === 'content.renderedWords') return params.operation === 'apply'
  if (SET_ONLY_WRITE_ACTIONS.has(action)) return params.operation === 'set'
  return true
}

/**
 * The per-slot refusals of a contract apply that prove NOTHING WAS WRITTEN: the component's value
 * rules, decided while it plans the apply, before the first write. `REVISION_*` (the base is stale),
 * a lock miss and `CONTRACT_FAILED` (which may come from a write that broke halfway) are not here.
 */
const UNWRITTEN_CODES = Object.freeze([
  'SLOT_TOO_LONG',
  'SLOT_EVIDENCE_REQUIRED',
  'SLOT_NOT_CONTENT',
  'SLOT_LINK_UNSUPPORTED',
  'SLOT_IMAGE_INVALID',
  'SLOT_UNKNOWN',
  'SLOT_EMPTY_STATE',
  'SLOT_EDITION_MISSING',
  'SLOT_LOCKED_BY_USER',
  'CHANGES_INVALID'
])

/**
 * Whether an answer is a contract refusal that names only {@link UNWRITTEN_CODES}: the apply changed
 * nothing, and what this conversation read of the site is still what it holds.
 * @param {unknown} answer
 */
export function refusedUnwritten(answer) {
  if (!isRecord(answer) || answer.ok !== false || outcomeUnknown(answer)) return false
  const errors = answer.errors
  return (
    Array.isArray(errors) &&
    errors.length > 0 &&
    errors.every((e) => isRecord(e) && UNWRITTEN_CODES.includes(/** @type {string} */ (e.code)))
  )
}

/**
 * The calls a `writer_busy` lock miss is retried on (D10′, V5 E2.1). The component takes its lock
 * before it reads or writes anything (`Engine.php:133-143`), so the lock miss proves nothing ran, and
 * a contract apply or a batch re-sent with the same `apply_id` and `request_id` is replayed, never
 * applied twice (`Engine.php:1222-1228`, `:2000-2005`). Measured r2: 3 `writer_busy`, and j C20
 * FAILED on them (the same apply sent three times by the model, 4 steps); r1: 14.
 */
const BUSY_RETRY_ACTIONS = new Set(['content.contract', 'content.batch', 'content.update', 'apply.revert'])
/** The waits before each retry: 3 s, 6 s, 10 s, each ± 20 %, never more than 19 s in all (D10′). */
export const BUSY_WAITS_MS = Object.freeze([3_000, 6_000, 10_000])
const BUSY_JITTER = 0.2
const BUSY_TOTAL_MS = 19_000
/** The relay's own deadline is 180 s and the door's 170 s; a retry never starts past this. */
const BUSY_DEADLINE_MS = 150_000

/**
 * 🔒 E2.2 — ANSWERS THAT WERE LOST, NOT GIVEN. The call left Tracy and no answer came back whole: the
 * door could not reach the site's component or could not read it (`COMPONENT_UNREACHABLE`,
 * `COMPONENT_BAD_RESPONSE`), `relayRaw` could not reach the door (`COWORK_WEB_UNREACHABLE`), or a
 * gateway answered for it (502/503/504). The call may have run. A refusal the component DID answer is
 * never here: it said what happened.
 *
 * 0 occurrences in r1/r2 — built for the fleet, where a site restarting under a call is ordinary, and
 * each class below is covered by a test with a fake relay.
 */
export const LOST_ANSWER_CODES = Object.freeze([
  'COMPONENT_UNREACHABLE',
  'COMPONENT_BAD_RESPONSE',
  'COWORK_WEB_UNREACHABLE'
])
const LOST_STATUSES = Object.freeze([502, 503, 504])
/** The wait before a read whose answer was lost is asked once more (E2.2). */
export const READ_RETRY_MS = 2_000

/**
 * Whether an answer is one E2.2 treats as lost ({@link LOST_ANSWER_CODES}, or a gateway status).
 * @param {unknown} answer
 */
export function answerLost(answer) {
  if (!isRecord(answer) || answer.ok !== false) return false
  const code = typeof answer.code === 'string' && answer.code !== '' ? answer.code : answer.error
  return (
    (typeof code === 'string' && LOST_ANSWER_CODES.includes(code)) ||
    LOST_STATUSES.includes(Number(answer.httpStatus))
  )
}

/**
 * What E2.2 does when a call's answer was lost, by what the call is:
 * - `read` — a relayed read, or a contract operation that writes nothing: asked once more after 2 s;
 * - `replay` — a contract apply, or a Joomla `content.batch`: re-sent ONCE with the same ids, which
 *   the component replays instead of applying twice (`Engine.php:1222-1228`, `:2000-2005`);
 * - `counted` — a WordPress update of a record that exists: `apply.list` is counted against the
 *   writes this conversation saw accepted (see `acceptedWrites`), then re-sent only if it had not
 *   landed;
 * - `pass` — the contract's language and trim jobs, built to be called again with the same id until
 *   they report done: their own nexts say so, and E2.2 does not second-guess them;
 * - `unknown` — every other write (a create, a delete, an upload, an install, an undo): never sent
 *   again, answered `OUTCOME_UNKNOWN`.
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {string} platform
 * @returns {'read' | 'replay' | 'counted' | 'pass' | 'unknown'}
 */
export function lostAnswerRoad(action, params, platform) {
  if (READ_ACTIONS.includes(action)) return 'read'
  if (action === 'content.contract') {
    const op = str(params?.operation)
    if (!contractOperationWrites(op)) return 'read'
    return op === 'apply' ? 'replay' : 'pass'
  }
  if (action === 'content.batch') return platform === 'joomla' ? 'replay' : 'unknown'
  if (
    action === 'content.update' &&
    platform !== 'joomla' &&
    platform !== 'emdash' &&
    wpRecordOf(params) !== null
  )
    return 'counted'
  return 'unknown'
}

/**
 * The answer E2.2 gives when it cannot tell whether a write landed.
 *
 * 🔒 NEVER "NOTHING WAS WRITTEN". The call left Tracy; the component may have run it, or may still be
 * running it (the door gives up at 170 s, PHP does not). `recheck:'inspect'` says a contract apply's
 * outcome shows in an inspect a little later; any other write is checked on its receipt
 * (`apply.list {apply_id}`). `refusalNext`'s `OUTCOME_UNKNOWN` case writes the sentence.
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {unknown} lost - the last answer the relay gave (lost, or a lock miss past its retries).
 * @param {'inspect'} [recheck]
 */
export function outcomeUnknownAnswer(action, params, lost, recheck) {
  const was = isRecord(lost) ? str(lost.code) || str(lost.error) || 'no answer' : 'no answer'
  const applyId = str(params?.apply_id)
  return {
    ok: false,
    code: 'OUTCOME_UNKNOWN',
    action,
    lost: was.slice(0, 40),
    ...(applyId !== '' ? { apply_id: applyId } : {}),
    ...(recheck ? { recheck } : {}),
    error: `${action} was sent and its answer was lost (${was.slice(0, 40)}): it may have landed.`
  }
}

/**
 * The call E3.2 recognises a repeat by: the action, its parameters as normalised (an alias and its
 * canonical spelling are one call), and Tracy's host parameters — minus the ids TRACY MADE FOR THIS
 * CALL (`meta.mintedIds`: a contract apply's fresh `apply_id` and its `request_id`, D9; a content
 * write's own id, WP-27/J-6), which differ on every contract apply by design and would make every repeat
 * look new.
 *
 * 🔒 AN ID THE MODEL GAVE IS PART OF THE CALL. This used to drop `apply_id` and `request_id` always,
 * and so blocked the very fix a refusal asked for (review, 25/09, three runs with a fake relay):
 * Joomla `content.update` without an id → `bad_params` "apply_id required", "Same call with apply_id"
 * → the same call WITH one answered SAME_CALL_REFUSED; `apply.revert {apply_id:"dtrim-1"}` refused
 * `LEGACY_STRUCTURE_CODE` → a different receipt refused as the same call; `multilingual.retire` "retire-1" →
 * "an mlang- apply_id" → "mlang-retire-1" refused as the same call. On `apply.list` / `apply.revert`
 * the id IS the address, so nothing is ever left out there.
 * @param {{ action: string, params: Record<string, unknown>, host?: Record<string, unknown>, meta?: { mintedIds?: string[] } }} call
 */
function repeatShape(call) {
  const params = { ...(isRecord(call.params) ? call.params : {}) }
  if (call.action !== 'apply.list' && call.action !== 'apply.revert')
    for (const name of call.meta?.mintedIds ?? []) delete params[name]
  return { action: call.action, params, ...(isRecord(call.host) ? { host: call.host } : {}) }
}

/**
 * The shape a destructive call's confirmation is keyed on: its repeat shape without the names a
 * receipt goes by. `apply_id` and `request_id` name the change; they do not change what it removes —
 * no destructive action is addressed by them (`apply.revert`, whose address the id IS, is mutating).
 * @param {{ action: string, params: Record<string, unknown>, host?: Record<string, unknown>, meta?: { mintedIds?: string[] } }} call
 */
function confirmKeyShape(call) {
  const shape = repeatShape(call)
  const { apply_id: _named, request_id: _request, ...params } = shape.params
  return { ...shape, params }
}

/** The Joomla component's refusal that means the whole site is bound to a contract (`Engine.php:151`). */

/**
 * The actions after which a site's component may have gained what it lacked (E3.3): its core, an
 * extension or a plugin changed. Their success forgets what was learned about the site.
 */
const CHANGES_COMPONENT = new Set([
  'core.upgrade',
  'extension.install',
  'extension.enable',
  'plugin.install',
  'plugin.activate'
])

/**
 * 🔒 THE MODEL'S OWN WHOLE-BODY WRITE CHANGES AT MOST ONE EXISTING BLOCK (20/10/2026). A WordPress
 * `post_content` (or a template part's `content`) write replaces the whole body, and the body guard
 * measures only its length: a page re-typed to change one section could come back with another section's
 * words or attributes changed, unseen. Staff on real customer sites: "when Tracy fixes one place it often
 * breaks another place". The host reads the body as stored now and compares top-level blocks
 * (`wp-blocks.mjs` `blocksTouched`): a write that changes or drops two or more of them is refused, nothing
 * sent, and sent to the road that names each block (`blocks:{"<i>": …}` with the read's `rev`), where every
 * block not named stays byte for byte. One block changed, or new blocks put in at one place, goes on to the
 * body guard as before. Not for a door's own steps (the replace job splices what it read), nor a create,
 * nor a body whose blocks cannot be told (no positions, a read that failed): those are judged as before.
 */
export const WIDE_BODY_BLOCKS = 2

/**
 * The refusal of a whole-body write that touches {@link WIDE_BODY_BLOCKS} or more existing blocks, or null.
 * @param {import('./normalize.mjs').Relay} n
 * @param {Send} send
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function wideBodyWrite(n, send) {
  if (n.kind !== 'relay' || n.action !== 'content.update' || !isRecord(n.params)) return null
  const kind = str(n.params.kind)
  const field = bodyFieldOf(kind)
  const fields = isRecord(n.params.fields) ? n.params.fields : null
  if (field === null || fields === null || typeof fields[field] !== 'string') return null
  const id = positiveId(n.params.id)
  const key = str(n.params.key)
  if (kind === 'post' ? id === 0 : key === '') return null
  const got = await send('content.get', kind === 'post' ? { kind, id } : { kind, key })
  if (!isRecord(got) || got.ok !== true || !isRecord(got.item)) return null
  const body = got.item[field]
  if (typeof body !== 'string' || body === '') return null
  const sent = /** @type {string} */ (fields[field])
  const diff = blocksTouched(body, sent)
  if (diff === null || diff.touched.length < WIDE_BODY_BLOCKS) return null
  const shown = diff.touched.slice(0, 8).join(', ') + (diff.touched.length > 8 ? ', …' : '')
  const what = kind === 'post' ? 'page' : 'part'
  return {
    ok: false,
    code: 'BODY_WIDE',
    action: 'content.update',
    kind,
    ...(kind === 'post' ? { id } : { key }),
    blocks: diff.touched.slice(0, 20),
    of: diff.of,
    rev: revOf(body),
    error: `this ${field} changes ${diff.touched.length} of the ${diff.of} blocks this ${what} holds (positions ${shown}), not one; nothing was written`,
    next: `content.get {${addressOf(kind, id, key)}, outline:true} numbers the blocks; change only the ones asked with blocks:{"<i>": …} and this rev — every other block stays as it is.`
  }
}

/**
 * 🔒 A WHOLE-BODY WRITE SHORTER THAN THIS SHARE OF THE BODY THIS CONVERSATION READ IS REFUSED (D6′ (a)).
 * WordPress `post_content` — and a template part's `content` — replaces the WHOLE body, and an
 * accepted write answers only `{ok, kind, id, key, created}`. Measured r2: 6 of 33 WordPress cases cut
 * a live page with their first write — home (26,884 chars) overwritten with 252, 4,231, 4,192 and
 * 4,155 chars (C02, C07, C32, C33), contact (15,594) with 3,191 (C28), the header part (7,848) with 19
 * (C10). At 80 % the rule refuses exactly those six and passes the 38 other accepted body writes to
 * existing records (simulated on every r2 call, `test/fixtures/body-shrink/`).
 */
export const SHRINK_RATIO = 0.8
/** The in-tool check (D6′ (b)): a stored body under this share of what was sent did not land whole. */
export const VERIFY_RATIO = 0.98
/**
 * 🔒 ON JOOMLA AND EMDASH A FIELD SHORTER THAN THIS IS NOT LENGTH-JUDGED (09/10/2026). The same 80 %
 * rule guards an article's `introtext`/`fulltext`, a module's `content` and an EmDash long text or
 * rich-text field — but those doors also carry short texts the customer rewrites shorter on purpose
 * ("the footer now just says © Acme"), and they have no road WordPress has for a deliberate cut by
 * position (F6, `blocks:{"<i>":null}`): only `removes`, whose verbs are English and Vietnamese. So a
 * field whose longest read is under this is written as sent; the cut the guard exists for — a page's
 * body re-sent from one paragraph — starts far above it (25/09: 26,847 → 252 chars).
 */
export const SHRINK_JUDGED_FROM = 500

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v.trim() : '')
/** @param {unknown} v */
const positiveId = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : 0
}
/** @param {number} n */
const chars = (n) => n.toLocaleString('en-US')
/** @param {number} ms */
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** @param {unknown} answer */
function mediaDeletePayload(answer) {
  if (!isRecord(answer)) return {}
  if (isRecord(answer.result)) return answer.result
  if (isRecord(answer.data)) return answer.data
  return answer
}

/** @param {unknown} answer @param {Record<string, unknown>} params @param {string} platform */
function mediaDeleteConfirmation(answer, params, platform) {
  const data = mediaDeletePayload(answer)
  const deleted = isRecord(data.deleted) ? data.deleted : {}
  const picture =
    str(data.name) ||
    str(data.filename) ||
    str(data.url) ||
    str(deleted.path) ||
    str(params.url) ||
    str(params.path) ||
    (params.id !== undefined
      ? `WordPress attachment id ${String(params.id).slice(0, 80)}`
      : 'the selected picture')
  const files = Array.isArray(deleted.files) ? deleted.files : []
  const fileLines = files.slice(0, 8).map((file) => {
    if (typeof file === 'string') return file.slice(0, 180)
    if (!isRecord(file)) return 'file'
    const name = str(file.path) || str(file.name) || str(file.file) || 'file'
    const size =
      typeof file.size === 'number' ? file.size : typeof file.bytes === 'number' ? file.bytes : null
    return `${name.slice(0, 180)}${size === null ? '' : ` (${chars(size)} bytes)`}`
  })
  const scope = str(data.usedInScope) || 'the reported site scope'
  const usedIn = Array.isArray(data.usedIn) ? data.usedIn : []
  const locations =
    usedIn.length === 0
      ? `not found in ${scope}`
      : usedIn
          .slice(0, 6)
          .map((place) => {
            if (typeof place === 'string') return place.slice(0, 180)
            if (!isRecord(place)) return 'a page'
            const title = str(place.title) || str(place.url) || str(place.path) || str(place.name) || 'a page'
            if (place.type === 'option') return `option ${str(place.key) || 'site setting'}`
            if (place.type === 'featuredImage') return `featured image on ${title}`.slice(0, 180)
            return title.slice(0, 180)
          })
          .join(', ')
  const filesSummary =
    files.length === 0
      ? 'the plugin did not list individual files'
      : `${files.length} file${files.length === 1 ? '' : 's'}${fileLines.length ? `: ${fileLines.join('; ')}` : ''}${files.length > fileLines.length ? '; more files omitted' : ''}`
  const totalBytes =
    typeof data.totalBytes === 'number' ? ` Total size: ${chars(data.totalBytes)} bytes.` : ''
  const target =
    platform === 'joomla' ? 'this file under images/' : 'this WordPress attachment and its stored files'
  return `Picture: ${picture.slice(0, 220)}. Files: ${filesSummary}.${totalBytes} Used in: ${locations}. This deletes ${target} site-wide; it does not remove the picture from just one page, and page references may break. Delete it site-wide?`
}

/** @param {unknown} answer @param {string} platform @param {string} applyId */
function mediaDeleteNext(answer, platform, applyId) {
  const data = mediaDeletePayload(answer)
  const deleted = isRecord(data.deleted) ? data.deleted : {}
  const lines = []
  if (platform === 'joomla') {
    lines.push(
      data.storageDeleted === true
        ? 'The file under images/ was deleted.'
        : 'The Joomla media file under images/ was not confirmed deleted.'
    )
  } else {
    lines.push(
      data.storageDeleted === true
        ? 'The WordPress attachment record was removed and its stored files were deleted.'
        : 'The WordPress attachment record was removed, but storage deletion was not confirmed.'
    )
  }
  const path = str(deleted.path)
  if (path) lines[0] += ` Path: ${path}.`
  if (deleted.id !== undefined) lines[0] += ` Attachment id: ${String(deleted.id)}.`
  lines.push('Page references were not changed.')
  const filesLeft = Array.isArray(data.filesLeft) ? data.filesLeft : []
  if (filesLeft.length > 0)
    lines.push(`Files still present: ${filesLeft.map((file) => String(file).slice(0, 180)).join(', ')}.`)
  else if (data.storageDeleted !== true) lines.push('Do not say the stored file is gone.')
  lines.push(
    'A CDN or browser may still serve a cached copy of the old URL for a while; do not say the old URL no longer works.'
  )
  lines.push(`This can be undone with ${str(data.undo) || `apply.revert ${applyId}`}.`)
  return lines.join(' ')
}

/** @param {unknown} answer @param {string} platform @param {Record<string, unknown>} params */
function mediaDeletePreviewNext(answer, platform, params) {
  const preview = mediaDeleteConfirmation(answer, params, platform)
  const details = preview.replace(/ Delete it site-wide\?$/, '').replace(/\.$/, '')
  if (isRecord(answer) && answer.undoCopyUnderCap === false)
    return `This is a preview only; nothing was deleted. Show the customer this preview: ${details}. The picture cannot be deleted through Tracy with an undo copy because it exceeds the 8 MiB undo-copy cap. Do not ask the customer to confirm and do not use shell or file tools.`
  return `This is a preview only; nothing was deleted. Show the customer this preview: ${details}. Ask the customer to confirm: “Delete it site-wide?” Do not say the deletion happened.`
}

/**
 * The component's lock miss, word for word — the only `writer_busy` retried (D10′). Any other
 * `writer_busy` is the component wrapping an escaped error (`Engine.php:142`), after which something
 * may have been written.
 * @param {unknown} answer
 */
export function isLockMiss(answer) {
  if (!isRecord(answer) || answer.ok !== false) return false
  const code = typeof answer.code === 'string' && answer.code !== '' ? answer.code : answer.error
  return code === 'writer_busy' && str(answer.message) === WRITER_LOCK_MESSAGE
}

/**
 * @typedef {{ now: () => number, sleep: (ms: number) => Promise<unknown>, random: () => number }} Clock
 */

/**
 * One send, and the lock-miss retries (D10′): the same arguments after 3, 6 and 10 s (± 20 %), at most
 * 19 s in all, never starting past 150 s from `started`. The one place that waits this way: `sendBusy`
 * below, and the replace road's Joomla snapshot through {@link readThroughLock}.
 * @param {(action: string, params: Record<string, unknown>) => Promise<unknown>} send
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {Clock & { started: number }} clock
 * @returns {Promise<{ answer: unknown, tries: number }>}
 */
export async function sendThroughLock(send, action, params, { started, now, sleep, random }) {
  let answer = await send(action, params)
  let tries = 0
  let waited = 0
  for (const base of BUSY_WAITS_MS) {
    if (!isLockMiss(answer)) break
    const wait = Math.min(Math.round(base * (1 + (random() * 2 - 1) * BUSY_JITTER)), BUSY_TOTAL_MS - waited)
    if (wait <= 0 || now() - started + wait >= BUSY_DEADLINE_MS) break
    await sleep(wait)
    waited += wait
    tries += 1
    answer = await send(action, params)
  }
  return { answer, tries }
}

/**
 * A read sent outside `runSiteCall` that must come back whole — the replace road's Joomla inspect
 * snapshot (#316, H4): the lock retries of {@link sendThroughLock}, and an answer that was LOST
 * (`answerLost`) asked once more after 2 s, as `sendLost` asks a read — on one 150 s clock.
 * @param {(action: string, params: Record<string, unknown>) => Promise<unknown>} send
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {Partial<Clock>} [clock]
 * @returns {Promise<unknown>}
 */
export async function readThroughLock(send, action, params, clock = {}) {
  const { now = Date.now, sleep = realSleep, random = Math.random } = clock
  const at = { started: now(), now, sleep, random }
  const first = (await sendThroughLock(send, action, params, at)).answer
  if (!answerLost(first) || now() - at.started >= BUSY_DEADLINE_MS) return first
  await sleep(READ_RETRY_MS)
  return (await sendThroughLock(send, action, params, at)).answer
}

/** @param {string} s */
const fold = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * The verbs of a removal request, in the languages Tracy's customers write: English, and the
 * Vietnamese verbs for delete / remove / take off (both accent placements of the first) and for hide
 * (F6, 27/09/2026: "hide the projects section" named no verb here, so its `removes` could never pass
 * and the agent hid the section with CSS instead). Matched on folded text.
 *
 * Only a whole-body write needs them: a block dropped by its position passes without `removes`, in
 * any language (`bodyGuard`, F6).
 *
 * ⚠ EACH VIETNAMESE LETTER IS AN ESCAPE INSIDE A ONE-CHARACTER CLASS, ON PURPOSE: no Vietnamese may
 * stand in this package's code (gate `language`), and the formatter rewrites a bare `\u00f3` outside
 * a class into the letter itself. Inside a class it keeps the escape (`words.mjs` relies on the same).
 */
const REMOVAL_EN =
  /\b(?:remov(?:e|es|ed|ing)|delet(?:e|es|ed|ing)|drop(?:s|ped|ping)?|hid(?:e|es|ing)|(?:take|takes|taking|took|taken) out|get rid of)\b/
const REMOVAL_VI =
  /(?<![\p{L}\p{M}])(?:x[\u00f3]a|xo[\u00e1]|b[\u1ecf]|g[\u1ee1]|[\u1ea9]n|gi[\u1ea5]u)(?![\p{L}\p{M}])/u

/**
 * Whether these words ask for something to be removed (D6′ (a)).
 * @param {unknown} words
 */
export function asksRemoval(words) {
  if (typeof words !== 'string' || words.trim() === '') return false
  const text = fold(words)
  return REMOVAL_EN.test(text) || REMOVAL_VI.test(text)
}

/**
 * Whether `removes` quotes the customer's own request for a removal (D6′ (a)): at least three words,
 * found in their latest message once case, accents' composition and spacing are set aside, AND
 * carrying the removal verb itself.
 *
 * 🔒 THE QUOTE MUST HOLD THE VERB. Any three words of the latest message used to open the guard, so
 * the model cutting the page could quote the request it was misreading. Verified 25/09 with C33's
 * shape: "Change the hero headline to Build with us", 4,155 chars over 26,884, `removes:"Change the
 * hero headline"` → relayed, ok. A removal the customer asked for ("delete the testimonials section")
 * still passes; a quote of anything else in the message does not.
 * @param {unknown} removes
 * @param {string} words - the customer's latest message.
 */
export function quotesCustomer(removes, words) {
  if (typeof removes !== 'string') return false
  const quote = fold(removes.replace(/^["'“”‘’]+|["'“”‘’]+$/g, ''))
  if (quote.split(' ').filter((w) => w !== '').length < 3) return false
  return asksRemoval(quote) && fold(words).includes(quote)
}

/**
 * The URL's path, for a list row: the origin is the same for every row and a context pays for it on
 * every step.
 * @param {unknown} url
 */
function pathOf(url) {
  if (typeof url !== 'string' || url === '') return null
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return url
  }
}

/** The relay's refusal of a `content.list` search the site's plugin did not read (`apps/tracy-web` `applyDoorOnce`, 501). */
const LIST_SEARCH_UNSUPPORTED = 'LIST_SEARCH_UNSUPPORTED'

/**
 * A `content.list` that carried `search`, judged by the answer's own proof (30/09/2026).
 *
 * 🔒 THE RELAY JUDGES IT FIRST — key presence, 501, rows dropped — and this is the same test a second
 * time, for the skew between two images: this host ships in the dsh image and the relay in tracy-web, on
 * different pipelines, and a relay that predates the guard hands a plugin's `ok:true` list back as it
 * came. Until 30/09/2026 this host refused `search` by name (`checkParams`), so a host that takes it
 * must not lean on the relay alone. A plugin that reads `search` answers with a `search` key (its
 * normalised text, '' for none) whenever the request carried one; an `ok` answer without it is the
 * whole list, looking filtered, and it never reaches the model. The key is compared, never its value
 * and never the rows (they may hold entities or decomposed text).
 *
 * The refusal is the relay's own answer as this host reads it, `httpStatus` included: 501 is no lost
 * answer (`LOST_STATUSES`), so nothing asks again, and E3.2 does not remember a 5xx (`memoisableRefusal`)
 * — the site's fifteen-minute memory, not the turn's, is what stops a repeat.
 * @param {unknown} answer
 */
function searchReadOrRefused(answer) {
  if (!isRecord(answer) || answer.ok !== true || Object.hasOwn(answer, 'search')) return answer
  return {
    ok: false,
    httpStatus: 501,
    code: LIST_SEARCH_UNSUPPORTED,
    error: "This site's Claude Cowork plugin does not read search on content.list, so nothing was filtered."
  }
}

/**
 * `content.list` rows cut to FIELDS, not records (D26 as corrected, principle 13).
 *
 * 🔒 MEASURED: the standard no-body WordPress list — the first list in 23 of 33 WordPress cases, 28
 * answers of 11,095 chars — is 21 rows, each with a checksum, an author object, the featured image,
 * the comment status, two dates, the menu order, the parent and a full URL. A record cut at 8,000
 * kept 14 rows and dropped seven — among them the pages projects, services, slide, style-guide, news
 * and search, which C17 and C20 needed later. Six fields keep every row (≈ 3 k chars).
 *
 * Joomla article rows are cut the same way (they carry images JSON, meta, checksum, author, tags);
 * every other Joomla kind is already a summary the component chose (`LIST_COLUMNS`,
 * `JoomlaSiteWriter.php:733-761`) and keeps its columns — a module's `position` and a row's
 * `language` are how the model tells two rows apart. A body asked for (`include_body`) stays.
 * @param {string} platform
 * @param {Record<string, any>} answer
 * @param {{ includeBody: boolean }} opts
 */
export function shapeListRows(platform, answer, { includeBody }) {
  if (!isRecord(answer) || answer.ok !== true || !Array.isArray(answer.items)) return answer
  // A pattern list's rows are the plugin's own summary (`name`, `title`, `categories`…), never a post's.
  if (answer.kind === 'pattern') return answer
  if (platform === 'wordpress')
    return {
      ...answer,
      items: answer.items.map((/** @type {any} */ r) =>
        isRecord(r)
          ? {
              id: r.id,
              title: r.title,
              slug: r.slug,
              type: r.type,
              status: r.status,
              path: pathOf(r.url),
              ...(includeBody && typeof r.content === 'string' ? { content: r.content } : {})
            }
          : r
      ),
      note: 'rows are cut to id, title, slug, type, status, path; content.get {kind:"post", id} gives every field.'
    }
  if (platform === 'joomla' && (answer.kind ?? 'article') === 'article')
    return {
      ...answer,
      items: answer.items.map((/** @type {any} */ r) =>
        isRecord(r)
          ? {
              id: r.id,
              title: r.title,
              slug: r.alias,
              type: 'article',
              status: r.state,
              path: pathOf(r.url),
              language: r.language,
              category: r.category_title,
              ...(includeBody
                ? Object.fromEntries(
                    ['introtext', 'fulltext'].filter((k) => typeof r[k] === 'string').map((k) => [k, r[k]])
                  )
                : {})
            }
          : r
      ),
      note: 'rows are cut to id, title, slug, type, status, path, language, category; content.get {kind:"article", id} gives every field.'
    }
  return answer
}

/**
 * 🔒 AN EMPTY LIST POINTS AT THE ROAD THAT WORKS (02/10/2026). Measured on an imported WordPress copy
 * (A/B pilot, "rename the Help center item in the main menu"): the agent listed `wp_navigation` and
 * `wp_template_part` records, got `items: []` twice, and spent 21 tool calls — theme files read, the
 * theme's own PHP edited — before a change that `content.replace {find, replace, where}` makes in one
 * call (the label sits in the active theme's header part, which that engine reads). An empty list says
 * nothing stored matches, and nothing says what to do next; this does, once, and only then. A list with
 * rows, a refusal and a site whose surface has no `content.replace` are returned as they came.
 * @param {string} platform
 * @param {Record<string, any>} answer
 * @param {readonly string[] | null | undefined} actions - the surface's actions, when the call knows them
 * @param {boolean | null} sealed
 */
export function emptyListNext(platform, answer, actions, sealed) {
  if (platform !== 'wordpress' && platform !== 'joomla') return answer
  if (!isRecord(answer) || answer.ok !== true || !Array.isArray(answer.items) || answer.items.length > 0)
    return answer
  if (typeof answer.next === 'string' && answer.next !== '') return answer
  const reaches = Array.isArray(actions) ? actions.includes('content.replace') : sealed !== true
  if (!reaches) return answer
  return {
    ...answer,
    next: 'Nothing is stored under that name. Words a page shows (a menu label, a footer line, a heading) change with content.replace {find, replace}: it finds the record or theme part that holds them.'
  }
}

/**
 * 🔒 AN IMPORTED SITE'S REFUSED WORDS POINT AT ITS SLOT INDEX (02/10/2026). Measured on an imported Joomla
 * copy: "change the Personalized travel plan item" is words in a module's settings, which `content.replace`
 * does not read; its refusal named `content.get` of the module, the agent read a JSON blob it could not edit
 * safely, and only then found the slot index by itself (6 calls where 4 do). On a site whose own plugin mapped
 * its words, links and pictures to slots (`derived`), a refusal that leaves a road open adds the one that
 * reaches them. A refusal that is final ("that is an answer": a date, a counter) is returned as it came, and
 * so is every other site and every other answer.
 *
 * The apply it names is ONE call only when this conversation already read a revision (`read`: `content.read`
 * or an earlier inspect). With none read, the first apply answers INSPECT_FIRST (CC-12) and is sent again, which
 * the sentence says: it used to promise ONE apply in both states, and 8 of 45 bench cases paid the extra call
 * the answer had not announced (review, 02/10/2026).
 * @param {Record<string, any>} answer
 * @param {{ derived?: boolean } | null | undefined} facts
 * @param {boolean} [read] - this conversation holds a revision of the contract.
 */
export function derivedReplaceNext(answer, facts, read = false) {
  if (facts?.derived !== true) return answer
  if (!isRecord(answer) || answer.ok !== false) return answer
  if (answer.code !== 'NOT_EDITABLE' && answer.code !== 'NOT_FOUND') return answer
  if (typeof answer.next !== 'string' || answer.next === '' || /that is an answer/.test(answer.next))
    return answer
  // A `where` that names the wrong region has its own road (the same call, the right `where`).
  if (answer.next.startsWith('the same call with where:')) return answer
  const said = /[.!?]$/.test(answer.next.trimEnd()) ? answer.next.trimEnd() : `${answer.next.trimEnd()}.`
  return {
    ...answer,
    next: `${said} On this imported site a setting, link or picture address is found with grep -i "<part of it>" docs/agents/import-contract/slots.tsv (slotKey<TAB>value), then ${
      read
        ? 'ONE content.contract apply.'
        : "content.contract apply (its first answer is INSPECT_FIRST with the slot's current words and a revision: send the same apply again)."
    }`
  }
}

/**
 * The arrival budget of one action's answer (D26 as corrected; the P3 table), or null for no cap.
 *
 * 🔒 NO CAP WHERE THE DOOR HAS NO NARROWING. A cut answer is only useful with a way to the rest, so
 * every budget names a parameter the component reads (IX1's consistency test holds each `next` to
 * the V0 allowlist). `content.get` is never cut in PR1 — a cut body cannot be written back whole —
 * and `extension.list` takes no parameter at all (`Engine.php:1013`). A contract inspect is budgeted
 * inside `narrowInspect`. The table's "everything else 16,000" row is NOT here, by the same rule:
 * no other relayed read has a narrowing parameter in `ALLOWED_PARAMS`, so each is uncapped.
 *
 * `media.scan` is not here either: it is the lane's own reader, not the component's (`index.ts`
 * `mediaScan`, no `ALLOWED_PARAMS` row), and it is already bounded where it runs — `rankMedia` keeps at
 * most 100 pictures, and r2's one `limit:100` scan answered 9,336 chars (j-1ibzqi C05). An 8,000 cap
 * would only have cut the list the model asked for.
 *
 * `content.read` is not here either: its listing is cut by `cutContentList`, in the Content API's own
 * shape (`truncated: true`, `truncatedCount`), and its detail and describe document never are.
 *
 * 🔒 A PLAIN LIST CUT FOR SIZE NAMES THE WAY TO ONE RECORD BY ITS TITLE (30/09/2026): `search`, after the
 * rows that follow. Bench v7, Joomla 44 languages: a list of 1,900 articles is cut at ~70 rows, and a
 * record known by its title cost one call per further ~76 rows. It is named only where the plugin's search
 * would read it and would not be refused: a kind it covers (`listSearchCovers`), a call that did not
 * search already (a cut SEARCH answer has `matched` and is narrowed by the words, not by another search),
 * and a site not found (15 minutes, `noListSearch`) to have a plugin that ignores it (`opts.search`).
 * @param {string} action
 * @param {Record<string, unknown>} params - what was sent.
 * @param {string} platform
 * @param {{ search?: boolean }} [opts] - `search: false` for a site whose plugin was found not to read it.
 * @returns {{ maxChars: number, listKey?: string, next: (shown: number) => string } | null}
 */
export function budgetFor(action, params, platform, opts = {}) {
  const p = isRecord(params) ? params : {}
  if (action === 'content.list') {
    const from = positiveId(p.offset)
    if (p.include_body)
      return {
        maxChars: 8_000,
        listKey: 'items',
        next: (shown) =>
          platform === 'wordpress'
            ? `Bodies of ${shown} rows shown: the same call with include_body:false lists every row; name:"<slug>" gives one post; offset:${from + shown} the next.`
            : `Bodies of ${shown} rows shown: the same call with include_body:false lists every row; offset:${from + shown} gives the next ones.`
      }
    const byTitle = opts.search !== false && p.search === undefined && listSearchCovers(platform, p.kind)
    return {
      maxChars: 16_000,
      listKey: 'items',
      next: (shown) =>
        `${shown} rows shown: the same call with offset:${from + shown} gives the next ones; limit sets how many${
          byTitle ? '; search:"<part of the title>" finds one by its title.' : '.'
        }`
    }
  }
  if (action === 'db.dump')
    return {
      maxChars: 8_000,
      next: () =>
        `Too large to show: db.dump {table:"${str(p.table).slice(0, 60)}", limit:<fewer rows>, cursor:""} starts the table in smaller pieces; each next_cursor continues it.`
    }
  return null
}

/**
 * Cut an answer to its action's budget, with a `next` that carries the real numbers.
 * @param {unknown} answer
 * @param {ReturnType<typeof budgetFor>} budget
 */
function cutToBudget(answer, budget) {
  if (budget === null) return answer
  // Measured with the longest `next` the numbers can make, so the real one never pushes past the cap.
  const cut = /** @type {Record<string, any>} */ (
    budgetAnswer(answer, {
      maxChars: budget.maxChars,
      ...(budget.listKey ? { listKey: budget.listKey } : {}),
      next: budget.next(99_999)
    })
  )
  if (cut !== answer && isRecord(cut) && isRecord(cut.truncated))
    cut.next = budget.next(Number(cut.truncated.shown))
  return cut
}

/** The reads whose whole list the component answers and this host pages (`read-compact.mjs`). */
const LISTED = new Set(LISTED_ACTIONS)

/** The Content API's own document kinds (`packages/cms/tracy-content-api`). */
export const CONTENT_ENVELOPE = 'tracy-content/v1'
export const CONTENT_DESCRIBE = 'tracy-content-describe/v1'
export const CONTENT_PAGES = 'tracy-content-pages/v1'

/**
 * The arrival budget of a `content.read` LISTING (Content API v2, 26/09/2026): 24,000 characters.
 *
 * Not a `budgetFor` row, because the shape is the Content API's, not `budgetAnswer`'s: the cut says
 * `truncated: true` and `truncatedCount`, the form the plan gives an adapter-side cut
 * (`tasks/todo-content-api-v2.md`, the byte budget line), so a model reads one shape whichever side
 * cut. Only a listing is cut, and only by whole contents from its end: a detail (`id`) is one
 * content, which a cut would make unwritable, and a describe document is the schema the rest is read
 * by.
 *
 * ⚠ THE CUT COMES AFTER THE CLAUDE COWORK PLUGIN MADE ITS CURSOR, SO THIS PAGE'S `nextCursor` SKIPS WHAT WAS
 * DROPPED. The Claude Cowork plugin's fields are not rewritten (a null cursor would claim the list ended); the
 * `next` says so and gives the lossless road: the same call with `limit` = what was shown, whose own
 * cursor then continues without a gap. Both parameters are the relay's (`contentQueryProblem`).
 */
export const CONTENT_READ_LIST_CHARS = 24_000

/**
 * @param {number} dropped @param {number} shown
 */
const contentListNext = (dropped, shown) =>
  `${dropped} items were dropped to fit ${CONTENT_READ_LIST_CHARS} chars; this page's nextCursor skips them. Send the same call with limit:${shown} and follow that answer's cursor.`

/**
 * A `content.read` listing cut to {@link CONTENT_READ_LIST_CHARS}; every other answer as it came.
 * At least one content is kept: a listing that cannot show even one is still one whole content.
 * @param {unknown} answer
 * @param {Record<string, unknown>} params - the call as sent.
 * @returns {unknown}
 */
/** The byte budgets a content.read is sent with when the model names none (V2-5). */
export const READ_BUDGET_LIST = 32_768
export const READ_BUDGET_ONE = 65_536

/**
 * @param {Record<string, unknown>} params
 * @returns {Record<string, unknown>}
 */
export function withReadBudget(params) {
  const p = isRecord(params) ? params : {}
  if (
    p.maxBytes !== undefined ||
    p.describe !== undefined ||
    p.view !== undefined ||
    p.changedSince !== undefined
  )
    return p
  return { ...p, maxBytes: p.id !== undefined ? READ_BUDGET_ONE : READ_BUDGET_LIST }
}

export function cutContentList(answer, params) {
  if (isRecord(answer) && answer.schemaVersion === CONTENT_PAGES) return cutPagesList(answer, params)
  if (!isRecord(answer) || answer.schemaVersion !== CONTENT_ENVELOPE) return answer
  // The Claude Cowork plugin paged by the budget it was sent: every content is whole and the answer fits.
  if (isRecord(answer.pagination) && Number.isInteger(answer.pagination.budget)) return answer
  const p = isRecord(params) ? params : {}
  if (p.id !== undefined || p.describe !== undefined) return answer
  const list = answer.contents
  if (!Array.isArray(list) || list.length < 2) return answer
  const size = (/** @type {unknown} */ v) => JSON.stringify(v).length
  if (size(answer) <= CONTENT_READ_LIST_CHARS) return answer
  /** @param {number} shown */
  const cut = (shown) => ({
    ...answer,
    contents: list.slice(0, shown),
    truncated: true,
    truncatedCount: list.length - shown,
    next: contentListNext(list.length - shown, shown)
  })
  // The largest head that fits, found by halving (≤ 100 contents: at most seven measures).
  let lo = 1
  let hi = list.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (size(cut(mid)) <= CONTENT_READ_LIST_CHARS) lo = mid
    else hi = mid - 1
  }
  return cut(lo)
}

/**
 * `view=pages` on a large site (the relay walks up to 2,000 rows): the head that fits the same
 * listing budget, and a `next` that finds one page by the link the customer gave instead of paging.
 * An answer already narrowed to one link is never cut.
 *
 * 🔒 B7 (round 7 follow-up, 30/09/2026): ON A SITE IN SEVERAL LANGUAGES THE HEAD IS THE SITE'S OWN. The list
 * came in the relay's order (ids), so its 24,000-character head held whatever languages sorted first: in five
 * bench runs (one EmDash site, 41 languages) it was an arbitrary head of about 6.6k tokens and "702 more pages
 * not shown", the customer's own page among them. When the list is over the budget, the site has a default language and
 * says it serves more than one, the pages of the OTHER languages go after: the head is the default
 * language's pages, and the ones that belong to every language (Joomla's `*`, a row that names none). Only
 * WHICH pages the head holds changes: `truncatedCount` still counts every page not shown, the `why` says how
 * many of them are in other languages, and a list that fits, a link, one language, or a default none of the
 * pages is in are cut as they always were. So is a call that NAMED a language (`{view:"pages", locale}`, the
 * road this cut's own `next` points at): the relay already answered that language's list, and narrowing it to
 * the site's default would leave only the pages that belong to every language at the head.
 * @param {Record<string, unknown>} answer
 * @param {Record<string, unknown>} params - the call as sent.
 */
function cutPagesList(answer, params) {
  const list = answer.pages
  if (!Array.isArray(list) || list.length < 2 || typeof answer.link === 'string') return answer
  const size = (/** @type {unknown} */ v) => JSON.stringify(v).length
  if (size(answer) <= CONTENT_READ_LIST_CHARS) return answer
  const site = isRecord(answer.site) ? answer.site : {}
  const home = str(site.defaultLocale)
  const several = Array.isArray(site.locales) && site.locales.length > 1
  const asked = isRecord(params) ? str(params.locale) : ''
  const own =
    home !== '' && several && asked === ''
      ? list.filter(
          (page) =>
            !isRecord(page) || typeof page.locale !== 'string' || page.locale === '*' || page.locale === home
        )
      : list
  // Nothing to narrow to, or nothing to leave out: the head of the list, as before.
  const base = own.length > 0 && own.length < list.length ? own : list
  const elsewhere = list.length - base.length
  /** @param {number} shown */
  const cut = (shown) => ({
    ...answer,
    pages: base.slice(0, shown),
    truncated: true,
    truncatedCount: list.length - shown,
    next: {
      action: 'content.read',
      params: { view: 'pages', url: '<the link or path the customer gave>' },
      why: `${list.length - shown} more pages not shown${elsewhere > 0 ? ` (${elsewhere} in other languages)` : ''}: find one by its link, or list one language with {view:"pages", locale} (a locale from site.locales).`
    }
  })
  // The largest head that fits: the whole narrowed list may, the whole list never does.
  let lo = 1
  let hi = base === list ? list.length - 1 : base.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (size(cut(mid)) <= CONTENT_READ_LIST_CHARS) lo = mid
    else hi = mid - 1
  }
  return cut(lo)
}

/**
 * 🔒 JUST IN TIME (Content API v2): the next `content.read` call, carried by the answer that makes it
 * the right one. A describe document points at the first listing — pages, in the site's default
 * language when the document names one (none is invented); a listing or detail read by a
 * conversation that has not read the describe document points there. An answer with its own `next`
 * (a refusal's, a cut's) keeps it, and one that is neither document (a refusal) is left alone.
 * @param {unknown} answer
 * @param {boolean | null} describeSeen - `memory.describeSeen(…)`; null (no conversation) never nudges.
 * @returns {unknown}
 */
export function contentReadNext(answer, describeSeen) {
  if (!isRecord(answer) || 'next' in answer) return answer
  // 🔒 A LINK THAT SHOWS NO PAGE SAYS WHAT TO TRY (round 7): `{view:"pages", url:"/"}` answered `pages: []`
  // on a multilingual Joomla site, whose home is `/en`, and the model went on to list every page of a
  // language (23k characters) to find it. The relay matches an address as it is written, so a page
  // under a language prefix is found by that prefix, or by listing the one language.
  if (
    answer.schemaVersion === CONTENT_PAGES &&
    Array.isArray(answer.pages) &&
    answer.pages.length === 0 &&
    typeof answer.link === 'string'
  ) {
    const site = isRecord(answer.site) ? answer.site : {}
    const several = Array.isArray(site.locales) && site.locales.length > 1
    return {
      ...answer,
      next: {
        action: 'content.read',
        params: several ? { view: 'pages', locale: '<a locale of site.locales>' } : { view: 'pages' },
        why: several
          ? 'No page has this address. On a site in several languages an address may start with its language (/en, /en/about); {view:"pages", locale} lists one language\'s pages.'
          : 'No page has this address: check it, or {view:"pages"} without url lists every page.'
      }
    }
  }
  if (answer.schemaVersion === CONTENT_DESCRIBE) {
    const site = isRecord(answer.site) ? answer.site : {}
    const locale = str(site.defaultLocale)
    const types = Array.isArray(answer.types) ? answer.types.filter(isRecord) : []
    const type =
      types.length === 0 || types.some((t) => t.type === 'page')
        ? 'page'
        : str((types.find((t) => Number(t.count) > 0) ?? types[0]).type) || 'page'
    return {
      ...answer,
      next: {
        action: 'content.read',
        params: { type, ...(locale !== '' ? { locale } : {}) },
        why:
          (locale !== ''
            ? 'Lists this type in the default language; then read one with {id}.'
            : 'Lists this type; add a locale from site.locales to keep one language, then read one with {id}.') +
          ' A page the customer links: {view:"pages", url:<link>}. Only some keys: fields:"title,revision,blocks.fields.value,blocks.fields.slotKey".' +
          ' Keep an answer\'s version: ifVersion re-reads only if it changed; after {view:"pages"}, {changedSince} lists what moved.'
      }
    }
  }
  if (answer.schemaVersion === CONTENT_ENVELOPE && describeSeen === false)
    return {
      ...answer,
      next: {
        action: 'content.read',
        params: { describe: true },
        why: 'Once per site: the types, block kinds with their fields and limits, and what this seat may edit.'
      }
    }
  return answer
}

/**
 * 🔒 G4 (27/09/2026): A WRITE THAT WENT THROUGH SAYS IT IS THE RECEIPT. `content.replace` always did;
 * `content.update` answered `{ok, id, verified:{chars…}}` and a contract apply `{ok, ids, revision}`
 * with no next, and the agent read back what it had just written: the BEFORE bench (B1, develop
 * 050b73603) spent 3.2 steps per WordPress writing case after its last write, `page.text` the most
 * common, and Joomla six `page.text` and eight `bash cd` there — though the site context says the
 * write's answer is the check. "When every change asked is made" keeps a several-item job going.
 */
export const WRITE_RECEIPT_NEXT =
  'This is the receipt: nothing to read back. When every change asked is made, tell the customer what changed, in plain words. Keep the apply_id to yourself: apply.revert with it if they ask to undo.'

/**
 * @param {unknown} answer
 * @param {{ action: string, params: Record<string, unknown> }} sent - the call as it was sent.
 * @returns {unknown}
 */
export function withReceipt(answer, sent) {
  if (!isRecord(answer) || answer.ok !== true || 'next' in answer) return answer
  if (!changesSite({ name: 'tracy_site', arguments: sent })) return answer
  return { ...answer, next: WRITE_RECEIPT_NEXT }
}

/**
 * The answer as the model reads it: its next step, then what Tracy corrected (`normalized`, ≤ 6
 * entries of ≤ 90 chars — the model sees its own mistake once and stops repeating it).
 * @param {unknown} answer
 * @param {string[]} notes
 * @param {Parameters<typeof withNext>[1]} facts
 */
function finish(answer, notes, facts) {
  const out = withNext(answer, facts)
  const list = [...new Set(notes)].map((n) => (n.length > 90 ? `${n.slice(0, 89)}…` : n))
  if (list.length === 0 || !isRecord(out)) return out
  const own = Array.isArray(out.normalized) ? out.normalized.filter((n) => typeof n === 'string') : []
  return { ...out, normalized: [...own, ...list].slice(0, 6) }
}

/**
 * @typedef {import('./call-memory.mjs').CallMemory} CallMemory
 * @typedef {(action: string, params: Record<string, unknown>) => Promise<unknown>} Send
 */

// ── W2: a WordPress body by its blocks (`wp-blocks.mjs`) ──────────────────────────────────────────

/**
 * 🔒 A BODY OVER THIS MANY CHARACTERS IS SHOWN AS ITS OUTLINE. Every character of a read is re-sent
 * on every later step of the turn; the ja-business home is 26,884. The model then names the blocks it
 * needs (`block`) and changes only those (`blocks`). Its length is remembered WHOLE first
 * (`rememberAfter`), so a body sent back from a part of it is still refused BODY_SHRINK.
 *
 * 4,000 SINCE 05/10/2026 (16,000 before, still the answer of `full:true`: {@link BODY_SHOWN_MAX_FULL}). In 55
 * flow D runs a WordPress page body of 10k was read whole and then again as its outline and one block,
 * because a change is written by block either way (`block`, then `blocks`): the whole body was paid for on
 * every later step and used by none.
 */
export const BODY_SHOWN_MAX = 4_000
/** The body shown whole up to this many characters when the call asks `full:true` (the rule before 05/10/2026). */
export const BODY_SHOWN_MAX_FULL = 16_000

/**
 * The body field of a WordPress record kind, or null for a kind with no body.
 * @param {string} kind
 * @returns {'post_content' | 'content' | null}
 */
const bodyFieldOf = (kind) => (kind === 'post' ? 'post_content' : kind === 'templatePart' ? 'content' : null)

/**
 * How the model names this record again: `kind:"post", id:42` or `kind:"templatePart", key:"header"`.
 * @param {string} kind @param {unknown} id @param {unknown} key
 */
const addressOf = (kind, id, key) =>
  kind === 'post' ? `kind:"post", id:${positiveId(id) || '<id>'}` : `kind:"templatePart", key:"${str(key)}"`

/**
 * W2 — a `content.update` carrying `blocks` instead of the body: the record read here whole, the
 * blocks spliced into it (`applyBlockEdits`), and the call rewritten into the whole-body write it
 * stands for, so the body guard, the markup check and the in-tool check judge it like any other.
 * The read is remembered at its whole length, as a model's own read would be.
 * `drop` is what the edit took out by name (`"<i>": null`): how many blocks, their characters, and how
 * many blocks the body held — the body guard's F6 rule reads it, and nothing the model sends does.
 * `expected` is the `body_revision` this read got from the plugin, as received, or null when the plugin
 * answered none (one that predates the check): the write carries it as `expected_body_revision`, and the
 * plugin compares it inside its lock (`runSiteCall`). `kept` is how many top-level blocks the body held
 * when the edit inserted and dropped nothing — the positions it leaves where they were — else null.
 * @param {Record<string, unknown>} params
 * @param {Send} send
 * @param {CallMemory | null} memory
 * @param {string | null} sessionId
 * @returns {Promise<{ ok: true, params: Record<string, unknown>, note: string, drop: BlockDrop, expected: string | null, kept: number | null } | { ok: false, answer: Record<string, unknown> }>}
 */
async function expandBlockEdits(params, send, memory, sessionId) {
  const kind = str(params.kind) || 'post'
  const field = bodyFieldOf(kind)
  /** @param {string} code @param {string} error @param {Record<string, unknown>} [more] */
  const refuse = (code, error, more = {}) => ({
    ok: /** @type {const} */ (false),
    answer: { ok: false, code, action: 'content.update', kind, ...more, error }
  })
  if (field === null)
    return refuse('BAD_PARAMS', 'blocks change the body of a post or a template part', { param: 'blocks' })
  const id = positiveId(params.id)
  const key = str(params.key)
  if (kind === 'post' ? id === 0 : key === '')
    return refuse(
      'ADDRESS_MISSING',
      `blocks change an existing ${kind}: name its ${kind === 'post' ? 'id' : 'key'}`,
      {
        needs: kind === 'post' ? 'id' : 'key'
      }
    )
  const fields = isRecord(params.fields) ? params.fields : {}
  if (Object.hasOwn(fields, field))
    return refuse('BAD_PARAMS', `blocks or the whole ${field}, not both`, { param: 'blocks' })
  const outlineNext = `content.get {${addressOf(kind, id, key)}, outline:true} lists the blocks by position.`
  // 🔒 A POSITION IS COUNTED IN ONE BODY, SO IT COMES WITH THAT BODY'S `rev` (`wp-blocks.mjs` `revOf`).
  // Without it, the old numbers were applied to whatever the body held at write time.
  const asked = params.rev
  if (asked !== undefined && (typeof asked !== 'string' || !REV.test(asked.trim())))
    return refuse('BAD_PARAMS', 'rev is the 12-character rev a content.get of this record answered', {
      param: 'rev',
      next: outlineNext
    })
  if (asked === undefined && byPosition(params.blocks))
    return refuse(
      'BAD_PARAMS',
      'a block named by its position needs the rev of the read that numbered it: positions move when the page changes',
      { param: 'rev', next: outlineNext }
    )
  // The registered patterns an insert names: refused by shape here, read below once the body is known
  // to be the one the model counted in.
  const wanted = patternsOf(params.blocks)
  if (!wanted.ok) return refuse(wanted.code, wanted.error, { param: wanted.param })
  const got = await send('content.get', kind === 'post' ? { kind, id } : { kind, key })
  if (!isRecord(got) || got.ok !== true || !isRecord(got.item))
    return { ok: false, answer: isRecord(got) ? got : { ok: false, code: 'READ_FAILED', error: 'no answer' } }
  const body = got.item[field]
  if (typeof body !== 'string')
    return refuse('READ_FAILED', `the ${kind} has no ${field} to change by its blocks`)
  memory?.rememberRead(
    sessionId,
    kind === 'post'
      ? { kind, id, title: got.item.post_title, chars: body.length, postType: got.item.post_type }
      : { kind, id: got.item.id, key, title: got.item.title, chars: body.length }
  )
  const current = revOf(body)
  // A body that is not the one the model counted in: nothing is written, and the read that numbers its
  // blocks as they stand now is named. A call keyed only by `metadata.name` may leave `rev` out; sent, it
  // is held to the same rule.
  if (typeof asked === 'string' && asked.trim() !== current)
    return refuse(
      'REVISION_STALE',
      `this ${kind === 'post' ? 'page' : 'part'} changed since the read your rev came from; nothing was written`,
      {
        rev: current,
        next: `content.get {${addressOf(kind, id, key)}, outline:true} numbers its blocks as they are now; send your change again with the rev it answers.`
      }
    )
  /**
   * 🔒 A PATTERN IS READ WHEN THE WRITE IS MADE, through the plugin's own read, and goes in as its markup
   * does — the same rev, the same body guard, the same undo. The model names it; it never re-types it.
   * @type {Map<string, string>}
   */
  const patterns = new Map()
  for (const name of wanted.names) {
    const one = await send('content.get', { kind: 'pattern', key: name })
    if (isRecord(one) && one.ok === true && isRecord(one.item) && typeof one.item.content === 'string') {
      patterns.set(name, one.item.content)
      continue
    }
    if (patternsRefused(one))
      return refuse(
        PATTERNS_UNSUPPORTED,
        "this site's Claude Cowork plugin cannot read patterns; nothing was written",
        {
          next: `Send the section as block markup instead: content.update {${addressOf(kind, id, key)}, rev, blocks:{"+<i>":"<markup>"}}.`
        }
      )
    if (isRecord(one) && (one.error === 'not_found' || one.code === 'not_found'))
      return refuse(
        PATTERN_NOT_FOUND,
        `this site registers no pattern named "${name.slice(0, 80)}"; nothing was written`,
        {
          pattern: name,
          next: 'content.list {kind:"pattern", search:"<a word for what it shows>"} lists the patterns this site has; insert one of those names, never a guessed one.'
        }
      )
    return { ok: false, answer: isRecord(one) ? one : { ok: false, code: 'READ_FAILED', error: 'no answer' } }
  }
  const edited = applyBlockEdits(body, params.blocks, patterns)
  // `{attrs}` that the block's saved HTML holds too (`wp-blocks.mjs` `applyBlockPatch`): the way on is that
  // block's markup, changed in both places, sent whole by its position.
  if (!edited.ok && edited.code === 'ATTRS_IN_HTML' && edited.block !== undefined)
    return refuse(edited.code, edited.error, {
      ...(edited.param ? { param: edited.param } : {}),
      keys: edited.keys ?? [],
      next: attrsInHtmlNext(addressOf(kind, id, key), edited.block)
    })
  if (!edited.ok)
    return refuse(edited.code, edited.error, {
      ...(edited.param ? { param: edited.param } : {}),
      ...(edited.count !== undefined ? { count: edited.count } : {}),
      next: outlineNext
    })
  const { blocks: _blocks, rev: _rev, ...rest } = params
  /** @param {string} verb @param {number[]} at */
  const said = (verb, at) => (at.length > 0 ? [`${verb} ${at.join(', ')}`] : [])
  // `applyBlockEdits` read these same spans, so a dropped position is one of them.
  const spans = topBlocks(body) ?? []
  return {
    ok: true,
    params: { ...rest, fields: { ...fields, [field]: edited.body } },
    note: `blocks ${[...said('replaced', edited.replaced), ...said('dropped', edited.dropped), ...said('inserted before', edited.inserted)].join('; ')}: sent whole`,
    drop: {
      count: edited.dropped.length,
      chars: edited.dropped.reduce((sum, i) => sum + (spans[i] ? spans[i].end - spans[i].start : 0), 0),
      of: spans.length,
      // The template's lorem this write replaces or drops, as the host read it now (`sample-text.mjs`).
      sample: [...edited.replaced, ...edited.dropped].reduce((sum, i) => {
        const span = spans[i]
        return span && isLoremSample(body.slice(span.start, span.end)) ? sum + span.end - span.start : sum
      }, 0)
    },
    expected: typeof got.body_revision === 'string' && got.body_revision !== '' ? got.body_revision : null,
    kept: edited.inserted.length === 0 && edited.dropped.length === 0 ? spans.length : null
  }
}

/**
 * The way on from `ATTRS_IN_HTML`: the block's markup, read by its position and sent whole, changed in both
 * places. The record is named when the sentence fits a next's 200 characters, `{…}` when a long part slug
 * would not.
 * @param {string} record - `kind:"post", id:42`.
 * @param {number} block
 */
const attrsInHtmlNext = (record, block) => {
  /** @param {string} r */
  const said = (r) =>
    `content.get {${r}, block:${block}} gives its markup: send it as blocks:{"${block}":"<markup>"} with that rev, changed in its comment and its HTML.`
  const exact = said(record)
  return exact.length <= 200 ? exact : said('…')
}

/**
 * An answer without the plugin's `body_revision` key, the same object when it has none.
 * @param {unknown} answer
 * @returns {unknown}
 */
function withoutBodyRevision(answer) {
  if (!isRecord(answer) || !Object.hasOwn(answer, 'body_revision')) return answer
  const { body_revision: _hostOnly, ...rest } = answer
  return rest
}

/**
 * The receipt of a body write after which the blocks may stand elsewhere (an insert, a drop, a whole body, a
 * block that became two): nothing to read back for the customer's sake, and the outline before the next
 * write by position — the answer carries no `rev` to pair with the old numbers.
 *
 * 🔒 {@link WRITE_RECEIPT_NEXT}'S THREE RULES IN FEWER WORDS, NOT A SECOND SENTENCE AFTER IT. A next is at most
 * 200 characters (T10), and the receipt alone is 196: what it says — nothing to read back, tell the customer
 * once every change is made, the apply_id stays the agent's — stays, shorter, and the record is named when
 * its address fits (`{…}` when a long part slug would not).
 * @param {string} kind @param {unknown} id @param {unknown} key
 */
const positionsMovedNext = (kind, id, key) => {
  /** @param {string} record */
  const said = (record) =>
    `Receipt: nothing to read back. Blocks may have moved: content.get {${record}, outline:true} before a write by position. When all is done, tell the customer; keep apply_id to yourself.`
  const exact = said(addressOf(kind, id, key))
  return exact.length <= 200 ? exact : said('…')
}

/**
 * A block write that carried `expected_body_revision`, as the plugin answered it: its `revision_stale`
 * (another writer landed between the host's read and the plugin's lock) is the model's `REVISION_STALE`,
 * with the same way on as the host's own; an accepted write whose answer has no `body_revision` KEY is
 * said to have landed UNCHECKED — the plugin may have ignored the key, and a write nobody checked is never
 * reported as one that was.
 *
 * 🔒 THE KEY IS THE PROOF, NOT ITS VALUE (claude-cowork `feat/wordpress-body-revision` @ cb29b35). A plugin
 * that checks the condition answers every accepted body write with `body_revision`, and with
 * `body_revision: null` when its own read-back after the write failed — the check still ran, inside its
 * lock, before the write.
 * @param {import('./normalize.mjs').Relay} call - the call as sent.
 * @param {unknown} answer
 * @returns {unknown}
 */
function checkedByPlugin(call, answer) {
  if (!isRecord(answer)) return answer
  const kind = str(call.params.kind) || 'post'
  const id = positiveId(call.params.id)
  const key = str(call.params.key)
  if (answer.ok === false && (answer.error === 'revision_stale' || answer.code === 'revision_stale'))
    return {
      ok: false,
      code: 'REVISION_STALE',
      action: 'content.update',
      kind,
      ...(kind === 'post' ? { id } : { key }),
      error: `this ${kind === 'post' ? 'page' : 'part'} changed while Tracy was writing your change; nothing was written`,
      next: `content.get {${addressOf(kind, id, key)}, outline:true} numbers its blocks as they are now; send your change again with the rev it answers.`
    }
  // A write whose answer was lost and whose receipt shows it landed (`countedResend`) WAS checked: a plugin
  // that answered `body_revision` on the read checks the key, and refuses rather than writes when it differs.
  if (answer.ok === true && answer.landed !== true && !Object.hasOwn(answer, 'body_revision'))
    return {
      ...answer,
      unchecked:
        "The write landed, but this site's Claude Cowork plugin did not check that the page was unchanged since Tracy read it."
    }
  return answer
}

/**
 * @typedef {{ count: number, chars: number, of: number, sample?: number }} BlockDrop
 *   What a W2 block edit dropped by name: `count` blocks of the `of` the body held, `chars` long; `sample`, the
 *   characters of the template's lorem among the blocks it replaced or dropped.
 */

/**
 * W2 — what a WordPress `content.get` of a body shows the model: only the named blocks (`block`), or
 * the outline (`outline:true`, or a body of two blocks or more over {@link BODY_SHOWN_MAX}), else the
 * body as it came. `bodiesWhole`: the caller is the replace job, which rewrites the body it reads and
 * must never be handed an outline for it.
 * @param {import('./normalize.mjs').Relay} call
 * @param {unknown} answer
 * @param {boolean} [bodiesWhole]
 * @param {number} [shownMax] - the longest body shown whole ({@link BODY_SHOWN_MAX}; `full:true` {@link BODY_SHOWN_MAX_FULL}).
 * @returns {unknown}
 */
function bodyByBlocks(call, answer, bodiesWhole = false, shownMax = BODY_SHOWN_MAX) {
  if (!isRecord(answer) || answer.ok !== true || !isRecord(answer.item)) return answer
  const kind = str(call.params.kind) || 'post'
  const field = bodyFieldOf(kind)
  if (field === null) return answer
  const body = answer.item[field]
  if (typeof body !== 'string') return answer
  const host = isRecord(call.host) ? call.host : {}
  const address = addressOf(kind, answer.item.ID ?? call.params.id, call.params.key)
  const { [field]: _body, ...item } = answer.item
  // Every shape of a body read carries the rev of the body as the plugin answered it: the whole body, an
  // outline, named blocks. A write by position sends it back (`expandBlockEdits`).
  const rev = revOf(body)
  if (host.block !== undefined && host.block !== null) {
    const positions = (Array.isArray(host.block) ? host.block : [host.block]).map((v) => Number(v))
    const got = blocksAt(body, positions)
    if (!got.ok)
      return {
        ok: false,
        code: 'BAD_PARAMS',
        action: 'content.get',
        param: 'block',
        count: got.count,
        error: got.error,
        next: `content.get {${address}, outline:true} lists the blocks by position.`
      }
    return {
      ...answer,
      rev,
      item,
      blocks: got.blocks,
      next: `content.update {${address}, rev:"${rev}", blocks:{"<i>":"<markup>"}} changes only these; every other block stays as it is.`
    }
  }
  if (host.outline !== true && (bodiesWhole || body.length <= shownMax)) return { ...answer, rev }
  const outline = outlineOf(body)
  // One block (a classic-editor body) has nothing to name but itself: it is shown whole unless asked.
  if (outline === null || (host.outline !== true && outline.length < 2)) return { ...answer, rev }
  return {
    ...answer,
    rev,
    item: { ...item, [`${field}_chars`]: body.length },
    outline,
    next: `content.get {${address}, block:<i> or [i, j]} gives those blocks' markup; content.update {${address}, rev:"${rev}", blocks:{"<i>":"<markup>", "<j>":null, "+<k>":"<markup>"}} changes, drops or inserts only them.`
  }
}

/**
 * Run one relayed call.
 *
 * @param {{
 *   plan: { action: string, params?: Record<string, unknown>, notes?: string[] },
 *   facts?: { platform?: string, sealed?: boolean | null, contractBound?: boolean, contractDoor?: boolean | null, derived?: boolean, contract?: string | null, actions?: readonly string[] | null, verifyBodyWrites?: boolean },
 *   memory?: CallMemory | null,
 *   send: Send,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   now?: () => number,
 *   random?: () => number,
 *   events?: readonly any[],
 *   actorKey?: string | null,
 *   sessionId?: string | null,
 *   label?: string | null,
 *   readWebrootFile?: ((file: string) => Promise<string | null | undefined>) | null,
 *   siteFacts?: (() => Promise<Record<string, unknown> | null>) | null,
 *   bodiesWhole?: boolean,
 *   readPage?: ((path: string, match: string) => Promise<unknown>) | null,
 *   pagesSeen?: (() => readonly string[]) | null,
 *   signal?: AbortSignal | null,
 *   modelCall?: boolean,
 *   planAgreed?: () => Promise<boolean>,
 *   onRead?: ((params: Record<string, unknown>, answer: unknown) => void) | null
 * }} input
 *   `send` is the relay (`relayRaw` in `index.ts`): it answers what the door answered and never
 *   throws. `actorKey` names the person (prompter e-mail, or a hash of the viewer cookie — never the
 *   cookie). `facts.verifyBodyWrites:false` turns off the in-tool check (D6′ (c) fallback).
 *   `readWebrootFile` reads one file of this site's webroot for the body guard only (a theme's
 *   template part, D6′ (a)): its text, null when the file is absent from a theme folder that exists,
 *   undefined when that cannot be told. What it reads is measured, never answered to the model.
 *   `siteFacts` reads what was measured of this site when it was provisioned (`.site-facts/<label>.json`,
 *   its `facts`) — for the one question it answers here, which language the site serves under a prefix
 *   (`content-read-again.mjs`); null when there is none, and a throw is read as null.
 *   `bodiesWhole`: a WordPress body read is answered whole, never as its outline (W2) — for the replace
 *   job, which rewrites what it reads; never set for the model's own calls.
 *   `readPage` reads one page of this site for some words (`page.text {path, match}`) and `pagesSeen`
 *   names the pages this conversation read, newest first: a removal's receipt says whether its words
 *   still show there (`removal-check.mjs`, ladder DL09). Without `readPage` no page is read.
 *   `signal` is the turn's (`exec.signal`): once the customer pressed Stop, no wait of this call runs on
 *   and no second send of it starts (`turn-stop.mjs`); `send` itself sends nothing more by then.
 *   `planAgreed`: a demo or own-site build whose saved plan agreed to consequence writes (`index.ts`
 *   `demoPlanAgreed`) — read only when a write has a consequence; a destructive one still asks.
 *   `modelCall`: the call is the model's own (`index.ts`), so an update of a record other pages show
 *   too — a template part, a synced pattern, a menu, a Joomla module — asks first (`consequence.mjs`
 *   `shared`). Never set for a door's own steps: the replace job's planned writes (its many-places
 *   question and receipt already say where), `page.create`'s menu row, an upload. A WordPress whole-body
 *   write of the model's own is also held to the blocks it touches (`wideBodyWrite`).
 *   `onRead` hears each `content.get` answer whole, before W2 cuts it to an outline or blocks.
 * @returns {Promise<unknown>}
 */
export async function runSiteCall(input) {
  const {
    plan: givenPlan,
    facts = {},
    memory = null,
    send: relay,
    sleep: givenSleep = null,
    now = Date.now,
    random = Math.random,
    events = [],
    actorKey = null,
    sessionId = null,
    label = null,
    readWebrootFile = null,
    siteFacts = null,
    bodiesWhole = false,
    readPage = null,
    pagesSeen = null,
    signal = null,
    modelCall = false,
    onRead = null
  } = input
  // A lock retry's or a lost read's wait ends at Stop: the send after it is not made (`turn-stop.mjs`).
  const sleep = signal ? stoppableSleep(givenSleep, signal) : (givenSleep ?? realSleep)
  /** The call — W2 rewrites a block edit into the whole-body write it stands for (below). */
  let plan = givenPlan
  /**
   * The relay, and never a throw: `relayRaw` answers every failure as a refusal, and anything that
   * still throws is read the same way — the call may or may not have reached the site.
   * @type {Send}
   */
  const send = async (action, params) => {
    try {
      return await relay(action, params)
    } catch (error) {
      return {
        ok: false,
        code: 'COWORK_WEB_UNREACHABLE',
        error: (error instanceof Error ? error.message : String(error)).slice(0, 160)
      }
    }
  }
  const platform = str(facts.platform) || 'unknown'
  /**
   * 🔒 THE BODY GUARD IS KEYED ON THE CALL'S SHAPE, NOT ON THE PLATFORM READ. A post's
   * `post_content` and a template part's `content` exist only on WordPress, so a site whose platform
   * could not be read (`unknown`: no declared platform, no `.webroot/`, a read error — then memoised
   * five minutes) is still guarded when a call has that shape. The guard used to ask
   * `platform === 'wordpress'` and let such a write through unmeasured (review, 25/09). Only a site
   * known to be Joomla or EmDash skips it.
   */
  const wordpressShaped = platform !== 'joomla' && platform !== 'emdash'
  const sealed = typeof facts.sealed === 'boolean' ? facts.sealed : null
  const planNotes = Array.isArray(plan?.notes) ? plan.notes.filter((n) => typeof n === 'string') : []
  /** Notes this run adds after the call was normalised (retries, cache hits, fallbacks). */
  /** @type {string[]} */
  const runNotes = []
  // `asked`: what was sent, for the one refusal sentence that quotes it (a CMS number read as a content id).
  const nextFacts = {
    platform,
    sealed,
    action: plan.action,
    actions: facts.actions ?? null,
    asked: isRecord(plan.params) ? plan.params : null,
    // A site whose plugin ignored a `content.list` search within 15 minutes is not pointed at one again.
    noListSearch: memory ? memory.learned(label).noListSearch : false
  }
  /** @param {string} prefix */
  const fallbackMint = (prefix) =>
    `${prefix}-${now().toString(36)}-${Math.floor(random() * 0xffffff)
      .toString(16)
      .padStart(6, '0')}`
  /** @type {import('./normalize.mjs').CallFacts} */
  const callFacts = {
    platform,
    // A bound WordPress site (#337): its contract calls take the contract's rules, not WP-1's refusal.
    ...(facts.contractDoor !== undefined ? { contractDoor: facts.contractDoor } : {}),
    // An imported copy's derived slots (01/10/2026): their contract calls take the contract's rules too.
    ...(facts.derived === true ? { derived: true } : {}),
    ...(memory ? memory.factsFor(sessionId, label) : {}),
    // J-3 / E3.3: a site whose component said it is bound to its quickstart contract, within the hour.
    contractBound: facts.contractBound === true || (memory ? memory.learned(label).contractBound : false),
    // A site whose plugin ignored a `content.list` search, within the last 15 minutes: refused before the relay.
    noListSearch: memory ? memory.learned(label).noListSearch : false,
    // Content API v2 (D2): what this conversation's content.read showed, unless this site's Claude Cowork plugin
    // was found to predate it within the hour.
    contentRevisions: (slotKeys) =>
      memory && !memory.learned(label).noContentRevisions
        ? memory.contentRevisionsFor(sessionId, label, slotKeys)
        : null,
    wpApplyId: (prefix = 'wp') =>
      memory ? memory.wpApplyId(sessionId, label, prefix) : fallbackMint(prefix),
    mint: (prefix) => (memory ? memory.mint(prefix) : fallbackMint(prefix))
  }

  // W2: a WordPress body changed by its blocks — read here whole, spliced, and written whole below,
  // through the same guard and check as a body the model sent (`wp-blocks.mjs`).
  /** What the block edit dropped by name (F6); null for a call that sent no `blocks`. @type {BlockDrop | null} */
  let blockDrop = null
  /**
   * 🔒 THE PLUGIN'S OWN CHECK, INSIDE ITS LOCK (01/10/2026, line B). The `rev` check above compares the
   * model's read with the host's; between the host's read and the write, another writer can still land.
   * A plugin that answered `body_revision` on that read is sent it back as `expected_body_revision`, and
   * it compares again under `GET_LOCK` before it writes. Its proof of the capability is that echo, never a
   * version number (the `search` precedent, #671): an older plugin answers none, so nothing is sent and it
   * is written as before. Only the host sends the key — the model sending one is refused by name
   * (`normalize.mjs`) — so it is added to the call after normalising, never before.
   * @type {string | null}
   */
  let expectedBodyRevision = null
  /**
   * How many top-level blocks the body held before a block write that inserted and dropped nothing; null
   * for every other write. Only such a write may answer `rev` (`verifyBody`).
   * @type {number | null}
   */
  let keptBlocks = null
  /**
   * The blocks the model sent, before they are spliced into the whole body: their words are what a
   * receipt's `holds` looks for in the body read back (`verifyBody`, opt D). Null for any other call.
   * @type {unknown}
   */
  let editedBlocks = null
  /** A residue-sweep block write checked against a read made for it ({@link withSweepRead}). */
  let sweptOnRead = false
  if (
    wordpressShaped &&
    plan.action === 'content.update' &&
    isRecord(plan.params) &&
    plan.params.blocks !== undefined
  ) {
    editedBlocks = plan.params.blocks
    // The sweep's block write with the rev of a read: `expandBlockEdits` reads the record now and refuses
    // REVISION_STALE when the rev is not that read's, so past it the body judged is the site's current one.
    sweptOnRead = sweepScope.getStore() === true && typeof plan.params.rev === 'string'
    const expanded = await expandBlockEdits(plan.params, send, memory, sessionId)
    if (!expanded.ok) return finish(expanded.answer, planNotes, nextFacts)
    plan = { ...plan, params: expanded.params }
    runNotes.push(expanded.note)
    blockDrop = expanded.drop
    expectedBodyRevision = expanded.expected
    keptBlocks = expanded.kept
  }

  // 🔒 A READ'S VIEW IS TRACY'S (05/10/2026, `read-compact.mjs`): `full`, `blockKinds` and a whole list's
  // `search`/`type`/`offset`/`limit` shape what the model is shown; taken off before the call is normalised,
  // they are never judged as a door's parameter nor relayed. The replace job reads whole (`bodiesWhole`).
  const taken = takeViewParams(plan.action, plan.params)
  if (taken.view !== null) plan = { ...plan, params: taken.params }
  const view = taken.view
  const compactView = !bodiesWhole && view?.full !== true

  const n0 = normalizeCall(plan.action, plan.params ?? {}, callFacts)
  let callNotes = n0.notes
  /**
   * 🔒 E3.2 — THE KEY IS THE CALL AS IT WOULD BE SENT, taken before anything runs: normalised (two
   * spellings of one call are one), the revision CC-12 filled in, the ids Tracy makes left out. A call
   * refused before normalisation finished is keyed as the model sent it.
   */
  const repeatKey = sameCallKey(
    'tracy_site',
    n0.kind === 'relay'
      ? repeatShape(n0)
      : repeatShape({ action: plan.action, params: isRecord(plan.params) ? plan.params : {} })
  )
  /**
   * The answer as the model reads it — and, when it is a refusal the same arguments would always get
   * (`memoisableRefusal`), remembered under the call's key for the rest of this turn (E3.2).
   * @param {unknown} answer @param {string} [action] @param {Record<string, unknown>} [more]
   */
  const done = (answer, action = plan.action, more = {}) => {
    const sent = {
      action,
      params: n0.kind === 'relay' ? n0.params : isRecord(plan.params) ? plan.params : {}
    }
    const out = finish(withReceipt(answer, sent), [...planNotes, ...callNotes, ...runNotes], {
      ...nextFacts,
      action,
      ...more
    })
    memory?.rememberRefused(sessionId, label, repeatKey, out)
    return out
  }
  const earlier = memory?.refusedBefore(sessionId, label, repeatKey) ?? null
  if (earlier !== null) return finish(sameCallRefused(earlier, { action: plan.action }), [], nextFacts)
  if (n0.kind === 'refuse') return done(n0.answer)

  /**
   * 🔒 A DESTRUCTIVE CALL IS THE CUSTOMER'S TO ALLOW (`tiers.mjs`; the EmDash D34 rule on this tool).
   * `confirm:true` passes only when the customer agreed since the call was refused (its own question
   * answered with the go-ahead — `call-memory.mjs` `confirmed`), and it passes once: the agreement is
   * spent, so the next delete asks anew. Only a refusal marks the call asked: marked as it ran, the
   * customer's next message — any message — let the same call through again unasked (27/09). No
   * memory or no conversation → never: the model's own `confirm` is not the customer's word. Decided
   * on the RESOLVED call's key, so the slug and the id form of one call share one confirmation (the P4
   * review lesson, 25/09).
   *
   * 🔒 THE KEY IS WHAT THE CALL DOES, NOT WHAT ITS RECEIPT IS CALLED (30/09/2026). `apply_id` names
   * the change; it does not change it. Keyed with it, a Joomla delete refused under one name and sent
   * again under another after the customer's yes was a new call and asked again — three questions for
   * one article (v7 Joomla pick case, 21 LLM calls). `confirmKeyShape` leaves it out.
   *
   * 🔒 ONLY THE DOOR'S OWN QUESTION OPENS IT (30/09/2026). A question the agent wrote itself — however
   * well it names the record, whatever the customer answered — opens nothing: the same call made after
   * it is refused CONFIRM_FIRST and the customer is asked the door's question, once (the tiers line
   * tells the agent to call first, so that is one question, not two). A go-ahead read off the agent's
   * own words was tried and removed after review: the door had to decide from free text in four
   * languages what "yes" had agreed to, and cases (a yes to "delete A and keep B", to "delete only the
   * English version" of an entry in three languages, a question that names the record only to keep it)
   * opened deletes the customer never asked for.
   */
  const tier = tierOf(plan.action, n0.kind === 'relay' ? n0.params : isRecord(plan.params) ? plan.params : {})
  /**
   * 🔒 A WRITE THAT RUNS AT ONCE IS STILL THE CUSTOMER'S TO ALLOW WHEN WHAT IT DOES IS THEIRS TO SEE
   * (council 19/10/2026, `consequence.mjs`): a record taken off the pages, a change every page shows.
   * It asks exactly as a delete does — the door's own question, opened once by the yes to it — on every
   * channel; the card must name what the refusal names (`facts`).
   */
  // The read this conversation made of the record names it (its title) and, on WordPress, says what it is
  // (its post type): a template part, a synced pattern or a menu other pages show too (`shared`).
  const seenRead =
    tier === 'mutating' && n0.kind === 'relay'
      ? (memory?.readOf?.(
          sessionId,
          str(n0.params.kind) === 'templatePart'
            ? { kind: 'templatePart', key: str(n0.params.key) }
            : { id: n0.params.id }
        ) ?? null)
      : null
  // The title by the record's exact kind and id when that read named none (a Joomla module's body is
  // read under its field `ref`, never its bare id: `call-memory.mjs` `titleOf`).
  const seenTitle =
    seenRead?.title ||
    (tier === 'mutating' && n0.kind === 'relay'
      ? memory?.titleOf?.(sessionId, { kind: str(n0.params.kind), id: n0.params.id })
      : '') ||
    ''
  const judged =
    tier === 'mutating' && n0.kind === 'relay'
      ? consequenceOf(platform, plan.action, n0.params, {
          title: seenTitle,
          postType: seenRead?.postType ?? ''
        })
      : null
  const consequence = judged?.reason === 'shared' && modelCall !== true ? null : judged
  /** @type {string | null} */
  let mediaConfirmation = null
  /**
   * 🔒 A RECORD IN N LANGUAGES IS ONE QUESTION AND ONE CALL (09/10/2026, `delete-group.mjs`). A WordPress
   * post or a Joomla article / menu item whose translation group the site's Content API names: with no
   * `locale`, the delete is the whole record — the question counts its languages, its key is the group's
   * members, and after the yes this one call deletes each of them (`deleteGroup`, below). With `locale`, it
   * is that language's record only, and the question says the others stay online. No group read (one
   * language, a draft, a site that cannot say) leaves the delete exactly as it was.
   * @type {import('./delete-group.mjs').TranslationGroup | null}
   */
  let wholeGroup = null
  /** The group a one-language delete leaves other languages of: its answer says how many stay. */
  /** @type {import('./delete-group.mjs').TranslationGroup | null} */
  let rowGroup = null
  // A build whose saved plan agreed to it (`index.ts` `demoPlanAgreed`) is not asked about a consequence write
  // again; a destructive one always is.
  const planAgreed =
    consequence !== null && tier !== 'destructive' && typeof input.planAgreed === 'function'
      ? (await input.planAgreed()) === true
      : false
  if (tier === 'destructive' || (consequence !== null && !planAgreed)) {
    const group =
      n0.kind === 'relay' && groupDeleteApplies(platform, n0)
        ? await translationGroupOf({
            send,
            memory,
            sessionId,
            label,
            now,
            kind: str(n0.params.kind),
            id: positiveId(n0.params.id)
          })
        : null
    const askedLocale = n0.kind === 'relay' ? str(n0.host?.locale) : ''
    if (group !== null && askedLocale !== '') {
      const own = group.members[0]
      const named = memberByLocale(askedLocale, group.members)
      if (named === null || named.id !== own.id) {
        const call = (/** @type {import('./delete-group.mjs').GroupMember} */ m) =>
          `content.delete {kind:"${group.kind}", id:${m.id}, locale:"${m.locale}"}`
        return done({
          ok: false,
          code: 'LOCALE_NOT_THIS_RECORD',
          action: plan.action,
          kind: group.kind,
          id: own.id,
          locale: own.locale,
          error: `${group.kind} ${own.id} is the ${own.locale} record of ${recordNamed(group)}, not ${askedLocale.slice(0, 20)}; nothing was deleted.`,
          next:
            named !== null
              ? `${call(named)} deletes the ${named.locale} record only.`
              : `It has no ${askedLocale.slice(0, 20)} record; its languages: ${group.members.map((m) => m.locale).join(', ')}. ${call(own)} deletes the ${own.locale} one only.`
        })
      }
    }
    const whole = group !== null && askedLocale === ''
    if (whole) wholeGroup = group
    else if (group !== null) rowGroup = group
    const confirmKey =
      group !== null && whole
        ? groupConfirmKey(group)
        : `tracy_site:${sameCallKey('tracy_site', confirmKeyShape(n0))}`
    const mediaPreviewOnly = plan.action === 'media.delete' && n0.params.dry_run === true
    const agreed =
      !mediaPreviewOnly &&
      n0.kind === 'relay' &&
      n0.host?.confirm === true &&
      typeof sessionId === 'string' &&
      sessionId !== '' &&
      typeof memory?.confirmed === 'function' &&
      memory.confirmed(sessionId, confirmKey) === true
    // Read before `confirmAsked` starts a new record: the customer's last answer was typed, not chosen.
    const typed =
      !mediaPreviewOnly &&
      !agreed &&
      typeof sessionId === 'string' &&
      typeof memory?.answeredByTyping === 'function'
        ? memory.answeredByTyping(sessionId, confirmKey)
        : false
    if (plan.action === 'media.delete' && !mediaPreviewOnly && !agreed) {
      // The preview runs before asking; only the customer's answer to this door's question can arm deletion.
      const preview = await send('media.delete', { ...n0.params, dry_run: true })
      if (!isRecord(preview) || preview.ok !== true) return done(preview)
      if (preview.undoCopyUnderCap === false) {
        const total = typeof preview.totalBytes === 'number' ? ` (${chars(preview.totalBytes)} bytes)` : ''
        return done({
          ...preview,
          ok: false,
          code: 'too_large',
          next: `This picture exceeds the 8 MiB undo-copy cap${total}; nothing was deleted. Report that this picture cannot be deleted through Tracy with an undo copy. Do not ask the customer to confirm and do not use shell or file tools.`
        })
      }
      mediaConfirmation = mediaDeleteConfirmation(preview, n0.params, platform)
    }
    // 🔒 THE QUESTION NAMES THE RECORD (council 20/10/2026, live run): a delete or a hide of one
    // record is asked about by its title, read by Tracy itself from the same site, kind and id — never
    // "this deletes something". In Voice the person heard "This deletes something from your site" for
    // a request that had only meant to hide one post, misheard. A record that cannot be read is not
    // asked about at all: the agent finds it first.
    /** @type {'delete' | 'hide' | null} */
    const intent =
      plan.action === 'content.delete' ? 'delete' : consequence?.reason === 'hides' ? 'hide' : null
    let recordTitle = ''
    if (!agreed && !mediaPreviewOnly && intent !== null && group === null && n0.kind === 'relay') {
      recordTitle = consequence?.facts?.[0] ?? ''
      if (recordTitle === '') {
        const read = await recordTitleOf(send, platform, n0.params)
        if (read === null)
          return done({
            ok: false,
            code: 'TARGET_UNREAD',
            action: plan.action,
            error: `Tracy could not read ${str(n0.params.kind) || 'the record'} ${positiveId(n0.params.id) || ''} to name it on the customer's question; nothing changed.`,
            next: 'Find the record the customer means (content.list or content.find), then make the same call again.'
          })
        recordTitle = read
        // Kept for the write's own receipt too: the Changed card names it (`index.ts` `relayRaw`).
        memory?.rememberTitle?.(sessionId, { kind: n0.params.kind, id: n0.params.id, title: read })
      }
    }
    // A shared record (`consequence.mjs` `shared`: a template part, a synced pattern, a menu, a Joomla
    // module) is named the same way: by its title, read by Tracy itself when this conversation read none.
    // A template part is already named by its title or its slug (`sharedBy`), so it reads nothing more.
    const sharedUnnamed =
      consequence?.reason === 'shared' &&
      consequence.facts.length === 0 &&
      n0.kind === 'relay' &&
      str(n0.params.kind) !== 'templatePart'
    if (!agreed && !mediaPreviewOnly && sharedUnnamed && group === null) {
      const read = await recordTitleOf(send, platform, n0.params)
      if (read === null)
        return done({
          ok: false,
          code: 'TARGET_UNREAD',
          action: plan.action,
          error: `Tracy could not read ${str(n0.params.kind) || 'the record'} ${positiveId(n0.params.id) || str(n0.params.key)} to name it on the customer's question; nothing changed.`,
          next: 'Read the record the customer means (content.get), then make the same call again.'
        })
      recordTitle = read
      if (read !== '')
        memory?.rememberTitle?.(sessionId, { kind: n0.params.kind, id: n0.params.id, title: read })
    }
    const named1 = recordTitle !== '' ? `"${recordTitle}"` : `an untitled ${str(n0.params.kind) || 'record'}`
    const shownConsequence =
      (intent === 'hide' || sharedUnnamed) &&
      consequence !== null &&
      recordTitle !== '' &&
      consequence.facts.length === 0
        ? (consequenceOf(platform, plan.action, n0.params, {
            title: recordTitle,
            postType: seenRead?.postType ?? ''
          }) ?? consequence)
        : consequence
    const facts = shownConsequence?.facts?.length
      ? shownConsequence.facts
      : recordTitle !== ''
        ? [recordTitle]
        : []
    if (!agreed && !mediaPreviewOnly && sessionId)
      memory?.confirmAsked?.(sessionId, confirmKey, true, facts, intent)
    if (!agreed && !mediaPreviewOnly) {
      const size = group === null ? 0 : group.members.length
      const named = group === null ? '' : recordNamed(group)
      const stays =
        size === 2 ? 'its other language stays online' : `its other ${size - 1} languages stay online`
      return done({
        ok: false,
        code: 'CONFIRM_FIRST',
        action: plan.action,
        tier,
        ...(consequence !== null ? { consequence: consequence.reason } : {}),
        error:
          consequence !== null
            ? consequence.error
            : group === null
              ? `${plan.action} changes what this site runs or holds, and the customer has not been asked.`
              : whole
                ? `${plan.action} deletes ${named} in all ${size} languages, and the customer has not been asked. One language only: add locale.`
                : `${plan.action} deletes the ${group.members[0].locale} record of ${named} only (${stays}), and the customer has not been asked.`,
        ...(group !== null && whole ? { languages: size } : {}),
        ...(group !== null && !whole ? { otherLanguages: size - 1 } : {}),
        ...(typed ? { typed: true } : {}),
        // What the CUSTOMER reads is a sentence in their words, never the action's name (`tiers.mjs`).
        ask: confirmQuestion(
          confirmKey,
          mediaConfirmation !== null
            ? mediaConfirmation
            : shownConsequence !== null
              ? shownConsequence.sentence
              : group === null
                ? intent === 'delete' && n0.kind === 'relay'
                  ? `This deletes ${named1} from your site.`
                  : confirmSentence(plan.action)
                : whole
                  ? `This deletes ${named} from your site in all ${size} languages.`
                  : `This deletes the ${group.members[0].locale} version of ${named} only; ${stays}.`
        )
      })
    }
    if (!mediaPreviewOnly)
      runNotes.push(
        wholeGroup !== null
          ? `the customer confirmed it for all ${wholeGroup.members.length} languages`
          : 'the customer confirmed it'
      )
  }

  /**
   * The reads a correction needs (`resolveCall`), through the same relay: the call as it will be
   * sent, or the answer that ends it here.
   * @param {import('./normalize.mjs').Relay} call
   */
  const resolveNow = async (call) => {
    const r = await resolveCall(call, send, {
      partTitle: (key) => memory?.readOf(sessionId, { kind: 'templatePart', key })?.title ?? null
    })
    callNotes = r.notes
    return r
  }

  /** @type {import('./normalize.mjs').Relay} */
  let n = n0
  /**
   * 🔒 THE READ THAT NAMES THE RECORD COMES BEFORE THE GUARD THAT JUDGES IT. WP-19 (`wpKindOfId`)
   * and WP-24 (`wpPartSlug`) learn from one read what the call writes — a post, or the part a row's
   * number stands for. The guard ran first and saw `{kind:"templatePart", key:""}`: every body
   * write by a part's number was refused `BODY_SHRINK` read:false, even after the model had read
   * that very row (review, 25/09 — and a part write always carries its body, so the row never
   * worked). Those two reads now run first; nothing is sent before the guard either way. Once the
   * read has proved row N IS the part, the conversation's read of row N is its read of the part.
   */
  if (n.resolve?.type === 'wpKindOfId' || n.resolve?.type === 'wpPartSlug') {
    const r = await resolveNow(n)
    if (r.kind !== 'relay') return done(r.answer, r.kind === 'refuse' ? 'content.get' : n.action)
    if (n.resolve.type === 'wpPartSlug') partReadByRow(n.resolve.id, str(r.params.key))
    n = r
  }

  // 5a′ — a global-styles post holds theme.json, not blocks: invalid JSON never leaves (v6 WP L4-02).
  const styles = globalStylesProblem(n, { wordpressShaped, platform, sessionId, memory })
  if (styles !== null) {
    callNotes = callNotes.filter((note) => !note.startsWith('apply_id '))
    return done(styles)
  }

  // 5a — the body guard, before anything is sent.
  const guard = bodyGuard(n, { wordpressShaped, platform, sessionId, memory, events, blockDrop, sweptOnRead })
  if (guard.refuse) {
    // Nothing was sent: an apply id made for this call would be a note about nothing.
    callNotes = callNotes.filter((note) => !note.startsWith('apply_id '))
    const r = guard.refuse
    // W1 (b): the second length-judged refusal of one record this turn sends the model to the customer.
    const judged = r.code === 'BODY_SHRINK' && r.read === true && r.theme !== 'unread'
    const record = wpRecordOf(n.params) ?? bodyRef('joomla', n.params.kind, positiveId(n.params.id))
    const again = judged && (memory?.shrinkRefused(sessionId, label, record) ?? 0) >= 2
    // The `removes` escape is named only when the customer's latest message asks for a removal.
    return done(r, plan.action, {
      customerRemoval: asksRemoval(latestCustomerWords(events)),
      ...(again ? { shrinkAgain: true } : {})
    })
  }
  if (guard.note) runNotes.push(guard.note)

  // 5a″ — the model's own WordPress whole body that passed the guard, held to the blocks it touches: one
  // read of the body as stored, and nothing written when it changes two or more (`wideBodyWrite`).
  if (modelCall === true && wordpressShaped && editedBlocks === null) {
    const wide = await wideBodyWrite(n, send)
    if (wide !== null) {
      callNotes = callNotes.filter((note) => !note.startsWith('apply_id '))
      return done(wide)
    }
  }

  // 5b — F1: a Joomla JSON column, before anything is sent. Keyed on the call's shape like the body
  // guard: a site whose platform could not be read is checked too; WordPress kinds have no such field.
  if (
    n.action === 'content.update' &&
    platform !== 'wordpress' &&
    platform !== 'emdash' &&
    isRecord(n.params.fields)
  ) {
    // F1.2: `fields.<column> = {patch:{…}}` — the host merges it into the stored column (RFC 7386) and
    // the column goes on below as the whole text it is, like any model-sent text.
    // Each merged column becomes the text it is, so the next pass finds the next `{patch}` column: a
    // create that sets both `attribs` and `images` is two merges, not a refusal of the second.
    /** @type {Record<string, unknown>} */
    let fields = n.params.fields
    for (let merging = jsonFieldMergeField(fields); merging !== null; merging = jsonFieldMergeField(fields)) {
      const merged = await mergeJsonField(send, n.params, merging, platform)
      if (!merged.ok) return done(merged.answer, plan.action)
      fields = { ...fields, [merging.field]: merged.text }
      runNotes.push(merged.note)
    }
    if (fields !== n.params.fields) n = { ...n, params: { ...n.params, fields } }
    // F1.1: an OBJECT on a JSON column is a few keys, and writing it replaces the column. Refused
    // before anything is sent, because Tracy cannot know the keys it was not given. F3 (30/09): not on a
    // create — there is no other key to lose, so the object is the column (`createsRecord`).
    const patch = jsonFieldPatch(n.params.fields, { create: createsRecord(n.params) })
    if (patch !== null) {
      const kind = str(n.params.kind) || 'record'
      return done({
        ok: false,
        code: 'PARAMS_WHOLE_COLUMN',
        action: 'content.update',
        platform,
        kind,
        ...(positiveId(n.params.id) > 0 ? { id: positiveId(n.params.id) } : {}),
        field: patch.field,
        keys: patch.keys,
        ...(patch.create ? { create: true } : {}),
        error: patch.create
          ? `fields.${patch.field} holds "patch" ${patch.keys.length > 1 ? 'beside other keys' : 'that is not an object'}: send {patch:{"<key>":<value>}} alone, or the column's own keys; nothing was written`
          : `fields.${patch.field} is stored as one JSON text, so the ${patch.keys.length} key(s) sent would replace every other ${patch.field} of this ${kind}; nothing was written`
      })
    }
    const asText = jsonFieldsAsText(n.params.fields)
    if (asText.notes.length > 0) {
      n = { ...n, params: { ...n.params, fields: asText.fields } }
      runNotes.push(...asText.notes)
    }
    const broken = jsonFieldProblem(asText.fields)
    if (broken !== null) {
      const kind = str(n.params.kind) || 'record'
      const named = broken.key === null ? broken.field : `${broken.field}["${broken.key.slice(0, 60)}"]`
      return done({
        ok: false,
        code: 'PARAMS_NOT_JSON',
        action: 'content.update',
        platform,
        kind,
        ...(positiveId(n.params.id) > 0 ? { id: positiveId(n.params.id) } : {}),
        field: broken.field,
        key: broken.key,
        offset: broken.offset,
        found: broken.found,
        ...(broken.notObject ? { notObject: true } : {}),
        error: broken.notObject
          ? `fields.${broken.field} is not one JSON object; nothing was written`
          : `fields.${named} is not JSON at char ${broken.offset}: stored so, Joomla could not read it back; nothing was written`
      })
    }
  }

  if (n.resolve !== undefined && n.resolve.type !== 'wpNavFallback') {
    const r = await resolveNow(n)
    if (r.kind !== 'relay') return done(r.answer, r.kind === 'refuse' ? 'content.get' : n.action)
    n = r
  }

  /**
   * One send, and the lock-miss retries (D10′): the same arguments — the same `apply_id` and
   * `request_id` — after 3, 6 and 10 s (± 20 %), at most 19 s in all, never starting past 150 s.
   * @param {string} action @param {Record<string, unknown>} params
   * @param {number} [started] - when this call's first send left (`sendLost`): the 150 s count from
   *   there, so an E2.2 re-send does not start the clock again.
   */
  const sendBusy = async (action, params, started = now()) => {
    if (!BUSY_RETRY_ACTIONS.has(action)) return send(action, params)
    const busy = await sendThroughLock(send, action, params, { started, now, sleep, random })
    const tries = busy.tries
    let answer = busy.answer
    if (tries > 0) {
      runNotes.push(`retried ${tries}× — the site was busy with another request`)
      if (isLockMiss(answer)) answer = { .../** @type {Record<string, unknown>} */ (answer), retried: tries }
    }
    return answer
  }

  /**
   * E2.2 — one send (with its lock-miss retries), and what follows when its answer was LOST
   * (`answerLost`: the component or the door unreachable, a gateway 502/503/504), by the call's road
   * (`lostAnswerRoad`):
   * - a read is asked once more after 2 s;
   * - a contract apply or a Joomla batch is re-sent ONCE with the same ids — the component answers a
   *   repeat of (apply_id, request_id, content) with the receipt it already holds (`Engine.php:
   *   1222-1228`, `:2000-2005`), so a send that landed is not applied twice. 🔒 If that re-send meets
   *   the lock past E2.1's retries, the lock holder may be OUR OWN first send, still running in PHP:
   *   the answer is `OUTCOME_UNKNOWN`, never "nothing was written" (D10′ as amended);
   * - a WordPress update of a record that exists is COUNTED on its receipt before it is re-sent
   *   (`countedResend`);
   * - the contract's language and trim jobs pass through: their own nexts already say to call again
   *   with the same id;
   * - every other write (a create, a delete, an upload, an install, an undo) is never sent again:
   *   `OUTCOME_UNKNOWN`, whose next names the receipt that tells.
   * 0 lost answers in r1/r2: built for the fleet, where a site restarting under a call is ordinary.
   *
   * 🔒 ONE CLOCK FOR THE WHOLE CALL, AND NO SECOND SEND PAST IT. E2.1's 150 s used to start again at
   * every `sendBusy`, so an E2.2 re-send after a relay timeout (180 s) still took its lock retries, and
   * a read asked again after a timeout could wait another 180 s: about 200 s for a replay and 362 s
   * for a read in one tool call (review, 25/09). The clock starts at the first send; past 150 s no
   * retry of either kind starts, and the answer says what is known.
   *
   * 🔒 NOR PAST THE CUSTOMER'S STOP (review C2, 19/10/2026). A lost first answer after Stop is answered as
   * it stands — a read unanswered, a write `OUTCOME_UNKNOWN` — and never by the second send, which
   * `send` would not make anyway: its "not sent" must not stand in for what the first send did.
   * @param {string} action
   * @param {Record<string, unknown>} params
   */
  const sendLost = async (action, params) => {
    const road = lostAnswerRoad(action, params, platform)
    const started = now()
    const first = await sendBusy(action, params, started)
    if (!answerLost(first) || road === 'pass') return first
    // Past the call's clock, or after Stop: no second send, the first answer stands.
    const noSecondSend = now() - started >= BUSY_DEADLINE_MS || signal?.aborted === true
    if (road === 'read') {
      if (noSecondSend) return unanswered(first, 1, now() - started)
      await sleep(READ_RETRY_MS)
      const again = await sendBusy(action, params, started)
      if (isTurnStopped(again)) return unanswered(first, 1, now() - started)
      if (!answerLost(again)) {
        runNotes.push('the site did not answer at first; asked again after 2 s')
        return again
      }
      runNotes.push('asked again after 2 s: the site still did not answer')
      return unanswered(again, 2, now() - started)
    }
    const recheck = action === 'content.contract' ? 'inspect' : undefined
    if (noSecondSend)
      return outcomeUnknownAnswer(action, params, first, road === 'replay' ? recheck : undefined)
    if (road === 'replay') {
      const again = await sendBusy(action, params, started)
      if (isTurnStopped(again)) return outcomeUnknownAnswer(action, params, first, recheck)
      if (answerLost(again) || isLockMiss(again)) return outcomeUnknownAnswer(action, params, again, recheck)
      runNotes.push('the first answer was lost: sent once more with the same ids, which the site replays')
      return again
    }
    if (road === 'counted') return countedResend(action, params, first, started)
    return outcomeUnknownAnswer(action, params, first)
  }

  /**
   * A read whose answer E2.2 could not get: the lost answer, with how often Tracy asked and a next of
   * its own.
   *
   * 🔒 NOT "RETRY ONCE" AFTER TRACY ALREADY DID. The lost answer's own next (`COMPONENT_UNREACHABLE`:
   * "Retry once; if it still does not answer, tell the customer") was written for a model that had
   * asked once; after E2.2's second ask it made the model ask a third time, which Tracy then asked a
   * fourth — four sends of up to 180 s each (review, 25/09). `withNext` keeps a next the answer
   * carries, so this one is what the model reads.
   * @param {unknown} lost
   * @param {1 | 2} asked - how many times the site was asked.
   * @param {number} ms - how long those asks took.
   */
  const unanswered = (lost, asked, ms) => ({
    .../** @type {Record<string, unknown>} */ (
      isRecord(lost) ? lost : { ok: false, code: 'COWORK_WEB_UNREACHABLE' }
    ),
    asked,
    next:
      asked === 2
        ? 'Tracy asked the site twice, 2 s apart, and its content door answered neither time: tell the customer the site is not answering now; do not call it again or change the site another way.'
        : `The site's content door gave no answer in ${Math.round(ms / 1000)} s, too long to ask again: tell the customer the site is not answering now; do not call it again or change the site another way.`
  })

  /**
   * E2.2 for a WordPress update of a record that exists: did the lost send land?
   *
   * 🔒 COUNTED, NOT LOOKED UP. One apply id may serve several writes — an id the model reuses (Tracy's own
   * is one per write since 26/10/2026; with it the count is 0 and one step means landed) — and an `apply.list` step
   * is only `{op, created, kind, id, key}` — no value, no time (`WPEngine.php` `applyList`) — so "a
   * step for this record exists" would find an EARLIER write to the same record: 12 of the 49
   * accepted r2 WordPress writes were followed by another write to the same record in the same case.
   * The steps for the record are counted against the accepted writes this conversation holds for it
   * under this id: one more → the lost send landed, and its receipt is answered; as many → it did not,
   * and it is sent once more; anything else (the receipt unreadable, fewer steps than accepted
   * writes, no conversation to count in) → `OUTCOME_UNKNOWN`.
   *
   * 🔒 NOT COUNTED PAST A WRITE NOBODY SAW END. An earlier write under this id whose outcome stayed
   * unknown — to this record, or to one it could not name (a create) — may have left a step here, and
   * then "one more step" is that write, not this one: a lost write that did not land read as landed
   * (review, 25/09). Such a turn answers `OUTCOME_UNKNOWN` without asking the receipt.
   * @param {string} action
   * @param {Record<string, unknown>} params
   * @param {unknown} lost
   * @param {number} started - when the first send left (`sendLost`'s clock).
   */
  const countedResend = async (action, params, lost, started) => {
    const applyId = str(params.apply_id)
    const record = wpRecordOf(params)
    const held = memory && record !== null ? memory.acceptedWrites(sessionId, label, applyId, record) : null
    if (applyId === '' || record === null || held === null) return outcomeUnknownAnswer(action, params, lost)
    if (memory?.unknownWrite(sessionId, label, applyId, record) !== false)
      return outcomeUnknownAnswer(action, params, lost)
    const listed = await send('apply.list', { apply_id: applyId })
    if (!isRecord(listed) || listed.ok !== true || !Array.isArray(listed.steps))
      return outcomeUnknownAnswer(action, params, lost)
    const steps = listed.steps.filter(
      (step) => isRecord(step) && (step.op ?? 'content') === 'content' && wpRecordOf(step) === record
    ).length
    if (steps === held + 1) {
      runNotes.push('the first send landed: its answer was lost, the receipt shows it')
      return {
        ok: true,
        kind: str(params.kind),
        ...(positiveId(params.id) > 0 ? { id: positiveId(params.id) } : {}),
        key: str(params.key) || null,
        created: false,
        landed: true
      }
    }
    // The receipt read may itself have taken long: no re-send starts past `sendLost`'s 150 s.
    if (steps !== held || now() - started >= BUSY_DEADLINE_MS)
      return outcomeUnknownAnswer(action, params, lost)
    const again = await sendBusy(action, params, started)
    if (answerLost(again)) return outcomeUnknownAnswer(action, params, again)
    // Stopped before the re-send: the receipt said the first did not land, and nothing else was sent.
    if (isTurnStopped(again)) return again
    runNotes.push('the first send did not land (its receipt says so): sent once more')
    return again
  }

  /**
   * 🔒 A REMOVAL IS JUDGED ON THE PAGE, NOT BY ITS RECEIPT (ladder DL09 on dsl2jo, 14/10/2026,
   * `removal-check.mjs`): a delete or an unpublish/unfeature takes ONE record off; the same words may
   * still show from another (the home's featured list moved a same-titled article in, and the agent
   * told the customer the part was gone). The record's title and the pages this conversation read are
   * read now, and again after the write. A whole-group delete has its own receipt; a bulk job that asked
   * for no read-back (`verifyBodyWrites:false`) reads nothing.
   */
  const removal =
    wholeGroup === null && facts.verifyBodyWrites !== false
      ? await removalBefore({
          platform,
          action: n.action,
          params: n.params,
          read: send,
          readPage,
          seen: typeof pagesSeen === 'function' ? pagesSeen() : null
        })
      : null

  /** @type {unknown} */
  let answer
  // Captured BEFORE the relay, as for an inspect: a read that left before a write landed teaches no
  // content revision (D1).
  const readGeneration = memory ? memory.generationOf(label) : 0
  // V2-5: a content.read carries the byte budget the Claude Cowork plugin pages by — 32 KiB for a listing, 64 KiB
  // for one content — unless the model set its own; describe, view=pages and changedSince take none
  // (they are walked or answered by the relay). An older Claude Cowork plugin ignores it and the lane's cut below
  // still applies; one that pages by it says so in pagination.budget and is not cut again.
  if (n.action === 'content.read') n = { ...n, params: withReadBudget(n.params) }
  if (expectedBodyRevision !== null && n.action === 'content.update')
    n = { ...n, params: { ...n.params, expected_body_revision: expectedBodyRevision } }
  if (n.action === 'content.contract') answer = await contractCall(n)
  else if (wholeGroup !== null && n.action === 'content.delete') answer = await deleteGroup(n, wholeGroup)
  else if (BUSY_RETRY_ACTIONS.has(n.action) && platform === 'joomla' && memory)
    answer = await memory.flight(label, () => sendLost(n.action, n.params))
  else answer = await sendLost(n.action, n.params)
  if (n.action === 'media.delete' && n.params.dry_run === true && isRecord(answer) && answer.ok === true) {
    answer = { ...answer, next: mediaDeletePreviewNext(answer, platform, n.params) }
    // A preview is not a write: return before receipt handling, revision keeping, read invalidation,
    // learned write facts, or any other post-write processing below.
    return finish(answer, [...planNotes, ...callNotes, ...runNotes], {
      ...nextFacts,
      action: n.action,
      asked: n.params
    })
  }
  if (n.action === 'media.delete' && isRecord(answer) && answer.ok === true) {
    answer = { ...answer, next: mediaDeleteNext(answer, platform, String(n.params.apply_id ?? '')) }
  }
  if (n.action === 'content.list' && n.params.search !== undefined) answer = searchReadOrRefused(answer)
  if (expectedBodyRevision !== null && n.action === 'content.update') answer = checkedByPlugin(n, answer)
  // A registered pattern (01/10/2026): a list is one only when it says `kind:"pattern"`; a plugin with no
  // pattern road says so in words the model can act on (`wp-patterns.mjs`).
  if (wordpressShaped && str(n.params.kind) === 'pattern') {
    if (n.action === 'content.list') answer = withPatternNext('content.list', patternListOrRefused(answer))
    else if (n.action === 'content.get')
      answer = patternsRefused(answer)
        ? patternsUnsupported({ list: false })
        : withPatternNext('content.get', answer)
  }

  // A language the site lists under another tag (`en` for `en-GB`): the relay's refusal names the one
  // tag that shares it, and the read goes once more with it (`content-read-again.mjs`).
  if (n.action === 'content.read') {
    const again = localeAgain(n.params, answer)
    if (again !== null) {
      const second = await sendLost(n.action, again.params)
      if (!(isRecord(second) && second.ok === false)) {
        n = { ...n, params: again.params }
        answer = second
        runNotes.push(again.note)
      }
    }
    // A pages read whose address lacks the language prefix the site's default is served under found no page
    // (`content-read-again.mjs`): the same read, once more, under that prefix. A retry is a plain send — no
    // wait, no note of its own — and one that finds no page is dropped, the first answer standing.
    if ((platform === 'joomla' || platform === 'wordpress') && unprefixedMiss(n.params, answer) !== null) {
      /** @type {Record<string, unknown> | null} */
      let measured = null
      try {
        measured = (await siteFacts?.()) ?? null
      } catch {
        // facts that cannot be read are no facts: nothing is guessed in their place
      }
      const prefixed = addressAgain(n.params, answer, measured)
      if (prefixed !== null) {
        const second = await send(n.action, prefixed.params)
        if (
          isRecord(second) &&
          second.schemaVersion === CONTENT_PAGES &&
          Array.isArray(second.pages) &&
          second.pages.length > 0
        ) {
          n = { ...n, params: prefixed.params }
          answer = second
          runNotes.push(prefixed.note)
        }
      }
    }
  }

  // WP-6: a classic theme keeps its menus as nav_menu_item posts, not wp_navigation.
  if (
    n.resolve?.type === 'wpNavFallback' &&
    isRecord(answer) &&
    answer.ok === true &&
    Array.isArray(answer.items) &&
    answer.items.length === 0
  ) {
    answer = await send('content.list', { ...n.params, post_type: 'nav_menu_item' })
    runNotes.push('no wp_navigation menus: listed the classic nav_menu_item rows')
  }

  if (n.action !== 'content.contract' && makesReadsStale(n.action, n.params)) memory?.invalidateSite(label)
  // A one-language delete of a record in several (`delete-group.mjs`): the answer says how many languages
  // are still online, and the one call that removes them — asked first, as every delete is.
  if (rowGroup !== null && n.action === 'content.delete' && isRecord(answer) && answer.ok === true) {
    const left = rowGroup.members.slice(1)
    const n1 = left.length
    answer = {
      ...answer,
      otherLanguages: n1,
      next: `${recordNamed(rowGroup)} is still online in ${n1} other language${n1 === 1 ? '' : 's'}: tell the customer. If they want ${n1 === 1 ? 'it' : 'them'} removed too: content.delete {kind:"${rowGroup.kind}", id:${left[0].id}} with no locale asks once and removes what is left. Never remove ${n1 === 1 ? 'it' : 'them'} unasked.`
    }
  }
  answer = await partFromTheme(n, answer)
  rememberAfter(n, answer)
  // a read's whole body, before the model is shown its outline or its blocks (the role pins judge a later
  // whole-body or block write against it, `role-pins.mjs`); a listener that fails changes nothing
  if (typeof onRead === 'function' && n.action === 'content.get')
    try {
      onRead(n.params, answer)
    } catch {
      // the read's answer stands
    }
  // W2: the body's length is remembered whole above; the model is shown its outline or its blocks.
  if (wordpressShaped && n.action === 'content.get')
    answer = bodyByBlocks(n, answer, bodiesWhole, view?.full === true ? BODY_SHOWN_MAX_FULL : BODY_SHOWN_MAX)
  learnFrom(n.action, answer)
  answer = await verifyBody(n, answer, guard.reset === true)
  answer = await echoCreated(n, answer)
  answer = await removalAfter(answer, removal, readPage)
  if (n.action === 'content.list')
    answer = emptyListNext(
      platform,
      shapeListRows(platform, /** @type {any} */ (answer), {
        // The component reads it as PHP `!empty()`: `true`, `1` and `"yes"` all ask for bodies.
        includeBody: Boolean(n.params.include_body)
      }),
      facts.actions,
      sealed
    )
  if (n.action === 'content.read') {
    if (isRecord(answer) && answer.schemaVersion === CONTENT_DESCRIBE)
      memory?.rememberDescribe(sessionId, label)
    // A page list as rows in the site's working language (`read-compact.mjs`); `full:true`, as it came, cut.
    let listed = null
    if (compactView && isPageList(answer, n.params)) {
      const a = /** @type {Record<string, any>} */ (answer)
      let home = workingLocale(a, null)
      if (home === '' && str(n.params.locale) === '') {
        try {
          home = workingLocale(a, (await siteFacts?.())?.siteLanguage)
        } catch {
          // facts that cannot be read are no facts: nothing is guessed in their place
        }
      }
      listed = compactPageList(a, n.params, { home })
    }
    answer = contentReadNext(
      listed ?? cutContentList(answer, n.params),
      memory ? memory.describeSeen(sessionId, label) : null
    )
    // D1: only what the model was shown (after the listing cut) is a base an apply may name.
    memory?.rememberContentRevisions(sessionId, label, answer, readGeneration)
    // The site's own host, for a picture the model writes as an address (`libraryPath`).
    memory?.rememberSiteHost(label, answer)
    // A page named by its address, read once more for what it lists and the call that adds to it
    // (`page-lists.mjs`): the first call of an add. Plain reads, and any doubt leaves the answer as it is.
    if (n.params.view === 'pages' && typeof n.params.url === 'string')
      answer = await withPageLists(answer, { platform, read: send })
  }
  // 🔒 THE PLUGIN'S `body_revision` IS THE HOST'S (01/10/2026): the 64-hex value the host sends back as
  // `expected_body_revision`, never the model's. Shown beside `rev` it cost ~80 characters on every body read
  // and write, and two "revision" values invite the model to send the wrong one. Taken off every WordPress
  // record answer here, after the host has used it; the host's own reads (`expandBlockEdits`, `verifyBody`)
  // never pass through this line.
  if (wordpressShaped && (n.action === 'content.get' || n.action === 'content.update'))
    answer = withoutBodyRevision(answer)
  // F5: the describe document the model reads has the same facts in fewer characters — the null keys of
  // blockKinds and the repeated locale list are dropped, after its `next` was built from them; any other
  // answer is returned as it is. The relay's own document is public API v1 and is not changed.
  answer = compactDescribe(answer)
  // 05/10/2026 (`read-compact.mjs`): the describe without blockKinds unless asked, a content read with its
  // shared next once and without the blocks that hold no field, a whole list by 20 rows — after the host has
  // used the answer; `full:true` and the replace job's reads are as they came.
  if (compactView && n.action === 'content.read')
    answer = compactContents(narrowDescribe(answer, view), n.params)
  if (compactView && view !== null && LISTED.has(n.action)) answer = pageListRows(answer, view)
  answer = cutToBudget(answer, budgetFor(n.action, n.params, platform, { search: !callFacts.noListSearch }))
  return done(answer, n.action)

  /**
   * 🔒 THE WHOLE RECORD, AFTER THE CUSTOMER'S YES TO IT (`delete-group.mjs`): the record the call named
   * first, then each other language's, each through the plugin's own `content.delete` under the call's one
   * `apply_id` — one at a time, the plugin's own lock and undo log for each. The record named first is the
   * call itself: refused, its answer is the answer and no other language is touched. An answer that was
   * LOST (`OUTCOME_UNKNOWN`) stops the walk — the site is not answering, and what is left is reported unsent.
   * @param {import('./normalize.mjs').Relay} call
   * @param {import('./delete-group.mjs').TranslationGroup} group
   */
  async function deleteGroup(call, group) {
    const [own, ...others] = group.members
    const first = await sendLost(call.action, call.params)
    if (!isRecord(first) || first.ok !== true) return first
    /** @type {Array<{ member: import('./delete-group.mjs').GroupMember, answer: unknown }>} */
    const results = [{ member: own, answer: first }]
    /** @type {import('./delete-group.mjs').GroupMember[]} */
    const notTried = []
    let stopped = false
    for (const member of others) {
      if (stopped) {
        notTried.push(member)
        continue
      }
      const got = await sendLost(call.action, { ...call.params, id: member.id })
      // The customer's Stop: this member was not sent, and neither is any after it (`turn-stop.mjs`).
      if (isTurnStopped(got)) {
        notTried.push(member)
        stopped = true
        continue
      }
      results.push({ member, answer: got })
      stopped = outcomeUnknown(got) || answerLost(got)
    }
    return groupAnswer(group, results, notTried, str(call.params.apply_id))
  }

  /**
   * The contract, ordered in the site's flight (D7) and, for an inspect, served from this turn's
   * snapshot when this person already read it (E3.1, D8).
   * @param {import('./normalize.mjs').Relay} call
   */
  async function contractCall(call) {
    const op = str(call.params.operation)
    const key = { sessionId, label, actor: actorKey }
    /**
     * The whole inspect, from this turn's snapshot when this person already read it (E3.1), else one
     * relay — asked once more after 2 s if its answer was lost (E2.2). Run inside the site's flight.
     * The revision it shows is the one this conversation has now read (CC-12).
     * @returns {Promise<{ full: unknown, hit: import('./call-memory.mjs').Snapshot | null }>}
     */
    const inspectFull = async () => {
      const again = memory?.inspectCached(key)
      if (again) return { full: again.answer, hit: again }
      // Captured BEFORE the relay: a write that lands while this inspect is on the wire bumps the
      // site's generation, and the answer is then not kept as the snapshot (D8).
      const generation = memory ? memory.generationOf(label) : 0
      const full = await sendLost('content.contract', { operation: 'inspect' })
      memory?.rememberInspect(key, full, generation)
      if (isRecord(full) && full.ok === true && typeof full.revision === 'string')
        memory?.rememberRevision(sessionId, label, full.revision)
      return { full, hit: null }
    }
    if (op === 'inspect') {
      /** @param {import('./call-memory.mjs').Snapshot} hit */
      const fromSnapshot = (hit) => {
        runNotes.push(
          `answered from this turn's inspect (revision ${String(hit.revision ?? '?').slice(0, 12)})`
        )
        return narrowInspect(hit.answer, { operation: 'inspect', ...call.host })
      }
      // 🔒 LOOKED UP BEFORE THE FLIGHT, AND AGAIN INSIDE IT. A hit costs no lock and no wait; a miss
      // queues behind any contract call already in flight on this site, which may be the inspect that
      // fills the snapshot — so the second look often answers without a relay.
      const hit = memory?.inspectCached(key)
      if (hit) return fromSnapshot(hit)
      const run = async () => {
        const { full, hit: inner } = await inspectFull()
        if (inner) return fromSnapshot(inner)
        return narrowInspect(full, { operation: 'inspect', ...call.host })
      }
      return memory ? memory.flight(label, run) : run()
    }
    /**
     * 🔒 CC-12 — AN APPLY THAT NAMES NO REVISION, IN A CONVERSATION THAT HAS READ NONE. The component
     * has no default: it would run a full inspect and refuse "Content changed; inspect again" (12–20 s
     * for nothing). So the host inspects once — the one read the apply needed anyway — and shows the
     * values the changed slots hold NOW, with the revision to base the apply on. Nothing is written
     * over values nobody in this conversation has seen; the same apply sent again is filled with that
     * revision (`revisionOf`) and goes through.
     *
     * The same answer ends D2's fallback when an older Claude Cowork plugin ignored the content revisions and this
     * conversation had inspected nothing. Run inside the site's flight.
     */
    const inspectFirst = async () => {
      const { full } = await inspectFull()
      if (!isRecord(full) || full.ok !== true || typeof full.revision !== 'string') return full
      // Joomla answers its slots as a list of records; a bound WordPress site as a map of key → words.
      // Read as a list only, every WordPress slot came back `null`, and a model that was shown its
      // picture slot as `null` concluded the slot was empty and could not take a picture.
      const slots = Array.isArray(full.slots) ? full.slots : []
      const words = isRecord(full.slots) ? full.slots : null
      /** @type {Record<string, unknown>} */
      const current = {}
      for (const slotKey of Object.keys(isRecord(call.params.changes) ? call.params.changes : {}).slice(
        0,
        12
      )) {
        const held =
          words !== null ? words[slotKey] : slots.find((s) => isRecord(s) && s.key === slotKey)?.current
        current[slotKey] = typeof held === 'string' ? held.slice(0, 200) : null
      }
      const unknown = Object.values(current).includes(null)
      // Nothing was sent: an id made for this call would be a note about nothing.
      callNotes = callNotes.filter((note) => !note.startsWith('apply_id ') && !note.startsWith('request_id '))
      return {
        ok: false,
        code: 'INSPECT_FIRST',
        action: 'content.contract',
        expected_revision: full.revision,
        current,
        error:
          'An apply is based on the revision it was written against, and this conversation had read none.',
        next: unknown
          ? `A null is no slot of this site: use a slotKey content.read shows, then apply with expected_revision:"${full.revision.slice(0, 80)}".`
          : `current shows what these slots hold now. If your words still fit, send the same apply with expected_revision:"${full.revision.slice(0, 80)}".`
      }
    }
    if (op === 'apply' && call.meta?.needsRevision === true)
      return memory ? memory.flight(label, inspectFirst) : inspectFirst()
    const run = async () => {
      let params = call.params
      /** This turn's slot list, when it has one: the apply's corrections and its receipt's labels read it. */
      let shapes
      // CC-15 / CC-10 / CC-16: a phone or an address into a link slot, evidence given for no slot,
      // and evidence the customer's own sentence carries — judged against this turn's snapshot only.
      if (op === 'apply') {
        const snap = memory?.inspectCached(key)
        // A write this turn ended the snapshot's values, not its slots' shapes (#316, H2).
        shapes = isRecord(snap?.answer) ? snap.answer.slots : (memory?.slotShapesOfTurn(key) ?? undefined)
        const prepared = prepareContractApply(params, {
          slots: shapes,
          customerWords: latestCustomerWords(events)
        })
        if (prepared.notes.length > 0) {
          params = prepared.params
          runNotes.push(...prepared.notes)
        }
      }
      let got = await sendLost('content.contract', params)
      // D9: the component already holds this id (a receipt older than this process) — one new id,
      // one more send. The first send wrote nothing: the id check comes before any work.
      if (
        op === 'apply' &&
        isRecord(got) &&
        got.ok === false &&
        /Use one new apply_id per content revision/.test(String(got.message ?? ''))
      ) {
        const fresh = callFacts.mint?.('contract') ?? fallbackMint('contract')
        runNotes.push(
          `apply_id ${String(params.apply_id).slice(0, 24)} was already used on the site → ${fresh}`
        )
        params = { ...params, apply_id: fresh }
        got = await sendLost('content.contract', params)
      }
      /**
       * 🔒 A PICTURE WRITTEN AS `content.read` SHOWS IT IS REFUSED, AND THE REFUSAL NAMES THE SLOT.
       * WordPress shows a picture as `/wp-content/uploads/…` and takes `wp-content/uploads/…`
       * (`SLOT_IMAGE_INVALID`); five of five round-7 runs that reused a library picture copied the
       * shown form, and one concluded that a slot cannot take an existing picture. Nothing was
       * written, so the apply is sent ONCE more with each such value cut to the path the component
       * takes (`repairedPictures`), under a new id — the call the model would have made one step
       * later. Never a loop: the second answer is the answer, and a refusal for anything else (the
       * file is not in the library, its shape does not fit) is the model's to read.
       */
      if (op === 'apply' && isRecord(got) && got.ok === false) {
        const repaired = repairedPictures(got.errors, params.changes, memory?.siteHostOf(label) ?? '')
        if (repaired !== null) {
          runNotes.push(...repaired.notes)
          // The first send's ids were never used: the answer names the ones that were.
          callNotes = callNotes.filter(
            (note) => !note.startsWith('apply_id ') && !note.startsWith('request_id ')
          )
          const fresh = callFacts.mint?.('contract') ?? fallbackMint('contract')
          params = {
            ...params,
            changes: repaired.changes,
            apply_id: fresh,
            request_id: requestIdOf(
              repaired.changes,
              params.evidence,
              params.expected_revision,
              params.expected_content_revisions
            )
          }
          got = await sendLost('content.contract', params)
        }
      }
      /**
       * 🔒 D2 — AN OLDER CLAUDE COWORK PLUGIN (Joomla before rc.5, WordPress before rc.2) DOES NOT READ
       * `expected_content_revisions`: with no `expected_revision` beside it, it runs a full inspect and
       * refuses "Content changed; inspect again", with no `errors[]` (a Claude Cowork plugin that reads the map
       * answers `errors[]` on every refusal, W3). Asked ONCE more the old way — the revision this
       * conversation inspected, else the INSPECT_FIRST answer — and learned for the site, so its next
       * applies do not pay the refused try again. Never a loop: the second answer is the answer.
       */
      if (
        op === 'apply' &&
        params.expected_content_revisions !== undefined &&
        str(params.expected_revision) === '' &&
        isRecord(got) &&
        got.ok === false &&
        !Array.isArray(got.errors) &&
        /Content changed; inspect again/.test(String(got.message ?? got.error ?? ''))
      ) {
        memory?.learn(label, 'noContentRevisions')
        memory?.rememberWrite(sessionId, label, {
          applyId: params.apply_id,
          asked: call.meta?.askedApplyId ?? undefined,
          ok: false,
          unknown: false
        })
        memory?.invalidateSite(label)
        runNotes.push('an older Claude Cowork plugin ignored the content.read revisions: asked the old way')
        const last = memory?.revisionOf(sessionId, label) ?? ''
        if (last === '') return inspectFirst()
        const { expected_content_revisions: _map, ...rest } = params
        params = {
          ...rest,
          expected_revision: last,
          apply_id: callFacts.mint?.('contract') ?? fallbackMint('contract'),
          request_id: requestIdOf(rest.changes, rest.evidence, last)
        }
        got = await sendLost('content.contract', params)
      }
      if (op === 'apply')
        memory?.rememberWrite(sessionId, label, {
          applyId: params.apply_id,
          asked: call.meta?.askedApplyId ?? undefined,
          ok: isRecord(got) && got.ok === true,
          unknown: outcomeUnknown(got)
        })
      /**
       * 🔒 A REVISION THE SITE HAS MOVED PAST IS FORGOTTEN, NOT FILLED AGAIN. After an accepted apply
       * the site is at a revision nobody here has read (the apply's own answer carries a receipt hash,
       * not the contract's revision, `Engine.php:2038`), and after "Content changed" the one read is
       * stale: filled in again, either would buy another 12–20 s refusal. Forgotten, CC-12 inspects.
       *
       * 🔒 #316 — UNLESS THE SITE NAMED WHERE IT NOW IS. A Claude Cowork plugin that answers an accepted apply with
       * `afterRevision` (R5) has just computed the contract's revision after the write, from the same
       * verify its `inspect` runs; that is a revision read, so it is remembered and the next apply
       * needs no inspect first. A Claude Cowork plugin without the field is treated exactly as before.
       */
      //
      // 🔒 ONLY FROM AN APPLY THE SITE CHECKED SITE-WIDE. An apply sent on `expected_content_revisions`
      // alone (the content.read road) is checked per content, so its afterRevision may include another
      // writer's change to a content this conversation never re-read; remembered, the next site-wide
      // apply would go out on it and overwrite that change unseen (review of #316, 26/09).
      const after =
        op === 'apply' &&
        isRecord(got) &&
        got.ok === true &&
        str(params.expected_revision) !== '' &&
        typeof got.afterRevision === 'string'
          ? got.afterRevision
          : ''
      if (after !== '') memory?.rememberRevision(sessionId, label, after)
      else if (
        op === 'apply' &&
        isRecord(got) &&
        (got.ok === true || /Content changed/i.test(String(got.message ?? got.error ?? '')))
      )
        memory?.rememberRevision(sessionId, label, null)
      // Any contract call but an inspect may have changed the site, whatever it answered — an apply
      // refused "Content changed" included (D8).
      memory?.invalidateSite(label)
      /**
       * 🔒 D2 — INVALIDATED FIRST, THEN RE-TAUGHT, IN THAT ORDER. `relayRaw` (index.ts) already made
       * every snapshot and content revision of this site stale around the send, and the line above
       * does it again here; an accepted apply's receipt then names each written content's NEW revision
       * (`contentRevisions`, W2), which is exactly what this conversation now knows those slots hold —
       * so the next apply to the same page needs no read. Every other content stays stale.
       */
      if (op === 'apply' && isRecord(got) && got.ok === true && isRecord(got.contentRevisions))
        memory?.rememberAppliedRevisions(sessionId, label, got.contentRevisions)
      // An apply refused before it wrote anything changed no content: the revisions it was sent on
      // are still what this conversation read, and the corrected apply is based on them.
      else if (op === 'apply' && refusedUnwritten(got))
        memory?.keepContentRevisions(sessionId, label, params.expected_content_revisions)
      if (op !== 'apply' || !isRecord(got)) return got
      /**
       * 🔒 OPT D (09/10/2026, `receipt-echo.mjs`): AN ACCEPTED APPLY SAYS WHAT IT WROTE. Its answer was ids
       * and hashes, and 7 of 32 round-7 picture applies were followed by a `page.look` or a template grep
       * to learn which picture the slot now held. The values are the ones the component took and checked
       * under its lock; nothing here says what a page shows.
       */
      const echo = got.ok === true ? contractWrote(params.changes, shapes) : null
      // ADR 0022: the write went through; words outside the quickstart's length band come back as
      // DATA (`warnings`), never as a refusal — refusalNext and the call memo read only ok:false.
      const advice =
        got.ok === true && isRecord(params.changes)
          ? lengthAdvice(params.changes, contractSamples(facts.contract))
          : []
      if (advice.length === 0) return { ...got, applyId: params.apply_id, ...echo }
      const said = lengthAdviceNext(advice)
      return {
        ...got,
        applyId: params.apply_id,
        ...echo,
        warnings: [
          ...(Array.isArray(got.warnings) ? got.warnings : []),
          ...advice.map((a) => ({
            code: 'LENGTH_RATIO',
            slot: a.slot,
            ratio: a.ratio,
            sample: a.sample,
            value: a.value
          }))
        ],
        ...(said && got.next === undefined ? { next: said } : {})
      }
    }
    return memory ? memory.flight(label, run) : run()
  }

  /**
   * WP-24: row `id` was just read and IS the template part `key` (`resolveCall` checked its
   * `post_type` and `post_name`). If this conversation read that row by its number and has no read
   * of the part by its slug, that read is filed under the slug — the body the model saw is the part's
   * body. Filed by slug only: the row's entry stays as it was read.
   * @param {number} id
   * @param {string} key
   */
  function partReadByRow(id, key) {
    if (!memory || key === '' || memory.readOf(sessionId, { kind: 'templatePart', key }) !== null) return
    const row = memory.readOf(sessionId, { id })
    if (row === null || row.baseline === null) return
    memory.rememberRead(sessionId, { kind: 'templatePart', key, title: row.title, chars: row.baseline })
  }

  /**
   * E3.3 — what this answer says the site's component lacks, or has gained.
   *
   * 🔒 ONLY THE ANSWERS THAT ARE FACTS ABOUT THE SITE. `bad_action` is the component's "unknown
   * action: …" (`Engine.php:235`, `WPEngine.php:160`) — it lacks that action for everyone. Of the
   * `LEGACY_STRUCTURE_CODE` answers, only "bound to its quickstart contract" (`Engine.php:151`) is
   * about the site; the others are about one call (a picture's path, a revert with later content) and
   * teach nothing. `LIST_SEARCH_UNSUPPORTED` (30/09/2026) is the third: the plugin does not read a
   * `content.list` search, for everyone — but for 15 minutes only, since it updates itself. A core,
   * extension or plugin change that went through forgets all three.
   * @param {string} action
   * @param {unknown} got
   */
  function learnFrom(action, got) {
    if (!memory || !isRecord(got)) return
    const code = str(got.code) || str(got.error)
    if (got.ok === false && code === 'bad_action') memory.learn(label, 'missing', action, got)
    else if (got.ok === false && code === LEGACY_STRUCTURE_CODE && str(got.message) === LEGACY_BOUND_MESSAGE)
      memory.learn(label, 'contractBound')
    else if (action === 'content.list' && got.ok === false && code === LIST_SEARCH_UNSUPPORTED)
      memory.learn(label, 'noListSearch')
    else if (got.ok === true && CHANGES_COMPONENT.has(action)) memory.unlearn(label)
  }

  /**
   * What this call teaches the memory: the bodies it read (D6′), the receipts it wrote (AL-1, D9).
   * @param {import('./normalize.mjs').Relay} call
   * @param {unknown} got
   */
  function rememberAfter(call, got) {
    if (!memory || !isRecord(got)) return
    /**
     * 🔒 AN UNDO OR A DELETE MAKES EVERY LENGTH THIS CONVERSATION READ A GUESS. Remembered lengths
     * outlived both: read 26,884, write 60,000, `apply.revert` (the site holds 26,884 again), then a
     * 27,000 write was refused "post 42 holds 60,000", and the only way on was to pad the body
     * (review, 25/09 — the Undo class, C33). Forgotten, the guard asks for a read first. An answer
     * that may or may not have run counts as run.
     */
    if (
      (call.action === 'apply.revert' || call.action === 'content.delete') &&
      (got.ok === true || outcomeUnknown(got))
    )
      memory.forgetReads(sessionId)
    if (wordpressShaped && call.action === 'content.get') {
      const kind = str(call.params.kind) || 'post'
      if (got.ok === true && isRecord(got.item)) {
        const item = got.item
        if (kind === 'post')
          memory.rememberRead(sessionId, {
            kind: 'post',
            id: item.ID ?? got.id,
            title: item.post_title,
            chars: typeof item.post_content === 'string' ? item.post_content.length : undefined,
            postType: item.post_type
          })
        else if (kind === 'templatePart')
          memory.rememberRead(sessionId, {
            kind: 'templatePart',
            id: item.id,
            key: str(got.key) || str(call.params.key),
            title: item.title,
            chars: typeof item.content === 'string' ? item.content.length : undefined
          })
      }
    }
    // D6′ on Joomla: each body field of a record read whole, under its own name (`bodyRef`).
    const joomlaKind = str(call.params.kind)
    if (
      platform !== 'wordpress' &&
      platform !== 'emdash' &&
      JOOMLA_BODY_FIELDS[joomlaKind] !== undefined &&
      call.action === 'content.get' &&
      got.ok === true &&
      isRecord(got.item)
    ) {
      const kind = joomlaKind
      const id = positiveId(got.id) || positiveId(call.params.id)
      for (const field of JOOMLA_BODY_FIELDS[kind] ?? []) {
        const value = got.item[field]
        const ref = bodyRef('joomla', kind, id, field)
        if (ref !== null && (typeof value === 'string' || value === null))
          memory.rememberRead(sessionId, {
            kind,
            id,
            ref,
            title: got.item.title,
            chars: typeof value === 'string' ? value.length : 0
          })
      }
    }
    if (wordpressShaped && call.action === 'content.list' && got.ok === true && Array.isArray(got.items))
      for (const row of got.items)
        if (isRecord(row) && typeof row.content === 'string')
          memory.rememberRead(sessionId, {
            kind: 'post',
            id: row.id,
            title: row.title,
            chars: row.content.length,
            postType: row.type
          })
    if (
      ['content.update', 'content.delete', 'content.language', 'content.batch'].includes(call.action) &&
      str(call.params.apply_id) !== ''
    ) {
      const unknown = outcomeUnknown(got)
      /**
       * 🔒 E2.2 COUNTS EVERY WRITE THAT LEAVES A `content` STEP, NOT ONLY UPDATES. WordPress logs an
       * accepted delete as `{op:"content", kind, id, key}` — the same step an update leaves
       * (`WPEngine.php` `contentDelete`) — so a part reset to its theme file and then written under
       * the same `wp-` id showed ONE step against NO accepted write, and the lost write that did not
       * land read as landed (review, 25/09). The record of an accepted write is read off the ANSWER
       * first: a create answers the id it made, and a later write to that post names the new id. A
       * write whose outcome is unknown is kept by the record the CALL named (its answer names none).
       */
      const counted =
        wordpressShaped && (call.action === 'content.update' || call.action === 'content.delete')
      memory.rememberWrite(sessionId, label, {
        applyId: str(call.params.apply_id),
        ok: got.ok === true,
        unknown,
        ...(counted && got.ok === true
          ? {
              record: wpRecordOf({
                kind: str(got.kind) || call.params.kind,
                id: positiveId(got.id) || call.params.id,
                key: str(got.key) || call.params.key
              })
            }
          : counted && unknown
            ? { record: wpRecordOf(call.params) }
            : {})
      })
    }
  }

  /**
   * D6′ (a) for a template part the site stores no copy of: the theme's own file is what visitors
   * see, and the first write replaces it with a published copy (`write_template_part` →
   * `wp_insert_post`, `post_status` publish).
   *
   * 🔒 "NOT STORED" IS NOT "NOTHING TO CUT". A `not_found` part was remembered as `absent`, and the
   * guard let any write through: on a site whose parts live only in the theme, a 14-character
   * `content` replaced the whole live header (review, 25/09 — r2's fixtures missed it only because
   * ja-business stores its parts, part 80). So the theme file's LENGTH becomes the part's read: the
   * active theme's `parts/<slug>.html` (a child theme without one serves its parent's), measured on
   * the host and never answered to the model. A slug no theme file has is a create. A file that
   * cannot be read leaves nothing to judge by, and the guard refuses.
   * @param {import('./normalize.mjs').Relay} call
   * @param {unknown} got
   */
  async function partFromTheme(call, got) {
    if (!wordpressShaped || call.action !== 'content.get' || str(call.params.kind) !== 'templatePart')
      return got
    const key = str(call.params.key)
    if (key === '' || !isRecord(got) || got.ok !== false || (got.code ?? got.error) !== 'not_found')
      return got
    const theme = await themePartOf(key)
    if ('file' in theme) {
      memory?.rememberRead(sessionId, { kind: 'templatePart', key, chars: theme.chars, theme: theme.file })
      return {
        ...got,
        theme_file: `.webroot/${theme.file}`,
        chars: theme.chars,
        next:
          sealed === true
            ? `Not stored: the theme file serves it (${chars(theme.chars)} chars), and this site's files are not read from here: tell the customer this part cannot be changed here.`
            : `Not stored: visitors see .webroot/${theme.file.slice(0, 70)} (${chars(theme.chars)} chars). Read it, then send all its markup with only your words changed.`
      }
    }
    if ('none' in theme) {
      memory?.rememberRead(sessionId, { kind: 'templatePart', key, absent: true })
      return {
        ...got,
        next: `No "${key.slice(0, 40)}" part here, stored or in the theme: content.update {kind:"templatePart", key, fields:{content}} creates it.`
      }
    }
    memory?.rememberRead(sessionId, { kind: 'templatePart', key, themeUnread: true })
    return {
      ...got,
      next: 'Not stored, and its theme file could not be read: a write here cannot be checked, so tell the customer this part cannot be changed here.'
    }
  }

  /**
   * The active theme's file for one template part: `{file, chars}`, `{none}` when no theme folder
   * of the chain holds that slug, or `{unread}` when it cannot be told (no reader, `theme.list`
   * refused, a folder that cannot be read).
   * @param {string} slug
   * @returns {Promise<{ file: string, chars: number } | { none: true } | { unread: true }>}
   */
  async function themePartOf(slug) {
    if (typeof readWebrootFile !== 'function' || !PART_SLUG.test(slug)) return { unread: true }
    const listed = await send('theme.list', {})
    const themes = isRecord(listed) && listed.ok === true && Array.isArray(listed.themes) ? listed.themes : []
    let theme = str(themes.find((t) => isRecord(t) && t.active === true)?.stylesheet)
    if (!THEME_SLUG.test(theme)) return { unread: true }
    // The active theme, then its parent: WordPress serves a child theme's missing part from there.
    for (let hop = 0; hop < 2; hop += 1) {
      // `block-template-parts/` is where block themes before WordPress 5.9's rename keep them.
      for (const folder of ['parts', 'block-template-parts']) {
        const file = `wp-content/themes/${theme}/${folder}/${slug}.html`
        const text = await readWebrootFile(file)
        if (typeof text === 'string') return { file, chars: text.length }
        if (text !== null) return { unread: true }
      }
      const css = await readWebrootFile(`wp-content/themes/${theme}/style.css`)
      if (css !== null && typeof css !== 'string') return { unread: true }
      const parent = typeof css === 'string' ? (/^[\s*#@/]*Template:\s*(\S+)\s*$/im.exec(css)?.[1] ?? '') : ''
      if (parent === '' || parent === theme || !THEME_SLUG.test(parent)) return { none: true }
      theme = parent
    }
    return { none: true }
  }

  /**
   * D6′ (b) — the in-tool check: after an accepted WordPress body write, the harness itself reads the
   * record back once (a read: no step, no cache change) and says whether the whole body landed, and
   * whether its blocks still parse. The component drops markup it will not store (KSES; measured
   * 08/09: 66,557 chars sent, 61,126 kept), and the write's own answer does not say so.
   * @param {import('./normalize.mjs').Relay} call
   * @param {unknown} got
   * @param {boolean} reset - the write carried a `removes` the guard accepted: its shorter body is
   *   the new baseline at once (`rememberWritten`).
   */
  async function verifyBody(call, got, reset) {
    if (joomlaBodies(call, platform).length > 0) return verifyJoomlaBodies(call, got, reset)
    const body = writtenBody(call, wordpressShaped)
    if (body === null || typeof body.value !== 'string' || !isRecord(got) || got.ok !== true) return got
    const sent = body.value
    const kind = str(call.params.kind)
    const key = str(call.params.key)
    // A part is looked up by its slug alone — the one address the component writes it by.
    const before =
      memory?.readOf(sessionId, kind === 'post' ? { id: call.params.id } : { kind: 'templatePart', key }) ??
      null
    const id = kind === 'post' ? positiveId(got.id) || positiveId(call.params.id) : 0
    const address = kind === 'post' ? { kind: 'post', id } : { kind: 'templatePart', key }
    const addressText = kind === 'post' ? `{kind:"post", id:${id}}` : `{kind:"templatePart", key:"${key}"}`
    const remember = (
      /** @type {number} */ length,
      /** @type {unknown} */ recordId,
      /** @type {unknown} */ title
    ) =>
      memory?.rememberWritten(
        sessionId,
        {
          kind,
          id: recordId,
          key: kind === 'templatePart' ? key : undefined,
          title: title ?? before?.title ?? undefined,
          chars: length
        },
        // A create the component confirmed: the record is this conversation's own (D6′ (c)).
        { reset, created: got.created === true }
      )
    if (facts.verifyBodyWrites === false) {
      remember(sent.length, kind === 'post' ? id : before?.id, undefined)
      return got.created === true ? got : { ...got, next: positionsMovedNext(kind, id, key) }
    }
    const back = /** @type {any} */ (await send('content.get', address))
    const item = isRecord(back) && back.ok === true && isRecord(back.item) ? back.item : null
    const stored = item === null ? null : kind === 'post' ? item.post_content : item.content
    if (typeof stored !== 'string')
      return {
        ...got,
        verified: false,
        next: `content.get ${addressText} once, then tell the customer what the page holds.`
      }
    remember(stored.length, kind === 'post' ? id : item?.id, kind === 'post' ? item?.post_title : item?.title)
    const counts = {
      chars_before: before?.chars ?? null,
      chars_sent: sent.length,
      chars_stored: stored.length
    }
    /**
     * 🔒 A `rev` ONLY WHERE THE OLD POSITIONS STILL HOLD (integrator's amendment, 01/10/2026). The rev of
     * the body the site HOLDS now — read back here, never of the body sent: WordPress filters what it
     * stores. Handed out after an insert, a drop or a whole body, it let the model pair the NEW rev with
     * positions counted in the OLD outline, pass the check, and hit the wrong block — what rev exists to
     * stop. So only a block write that inserted and dropped nothing, whose body read back holds as many
     * top-level blocks as before (a replacement can turn one block into two), answers it.
     */
    const kept = keptBlocks !== null && (topBlocks(stored)?.length ?? -1) === keptBlocks
    const fresh = kept ? { rev: revOf(stored) } : {}
    // Whole AND readable: a delimiter the site changed after the guard passed it breaks the page too.
    if (stored.length < VERIFY_RATIO * sent.length || blockMarkupProblem(stored) !== null)
      return {
        ...got,
        ...fresh,
        verified: false,
        chars: counts,
        next: `content.get ${addressText} once, then tell the customer what the page holds.`
      }
    // A create shows the row this read already holds (status, date, slug, category) and whether it is
    // live (F2): no second read.
    const echo = got.created === true && kind === 'post' ? createEcho('wordpress', item, now()) : null
    if (echo !== null) return { ...got, verified: counts, ...echo, next: STORED_NEXT }
    // Opt D: the words of the edited blocks, as this read found them in the stored body — only when it
    // found every block's words (`bodyHolds`).
    const holds = bodyHolds(editedBlocks, stored)
    return {
      ...got,
      ...fresh,
      verified: counts,
      ...(holds !== null ? { holds } : {}),
      ...(kept || got.created === true ? {} : { next: positionsMovedNext(kind, id, key) })
    }
  }

  /**
   * D6′ (b) on Joomla (09/10/2026): after an accepted edit of an article's `introtext`/`fulltext` or a
   * module's `content`, the record is read back once (a read: no step, no cache change) and the answer
   * says, per field, whether what was sent is what the site holds — Joomla's text filter may strip
   * markup it will not store, and the write's own answer does not say so. What was stored becomes the
   * field's length from now on (`rememberWritten`), as on WordPress. A create is not read back here
   * (`echoCreated` reads it): it is remembered as this conversation's own record (D6′ (c)).
   * @param {import('./normalize.mjs').Relay} call
   * @param {unknown} got
   * @param {boolean} reset - the guard accepted a shorter body (`removes`): it is the new baseline.
   */
  async function verifyJoomlaBodies(call, got, reset) {
    if (!isRecord(got) || got.ok !== true) return got
    const bodies = joomlaBodies(call, platform)
    const kind = str(call.params.kind)
    const id = positiveId(got.id) || positiveId(call.params.id)
    if (id === 0) return got
    const created = got.created === true
    const remember = (
      /** @type {string} */ field,
      /** @type {number} */ length,
      /** @type {unknown} */ title
    ) =>
      memory?.rememberWritten(
        sessionId,
        { kind, id, ref: bodyRef('joomla', kind, id, field), chars: length, title },
        { reset, created }
      )
    if (created || facts.verifyBodyWrites === false) {
      for (const b of bodies) remember(b.field, b.length, undefined)
      return got
    }
    const back = /** @type {any} */ (await send('content.get', { kind, id }))
    const item = isRecord(back) && back.ok === true && isRecord(back.item) ? back.item : null
    /** @type {Record<string, { chars_before: number | null, chars_sent: number, chars_stored: number }>} */
    const counts = {}
    let whole = item !== null
    for (const b of bodies) {
      const stored = item?.[b.field]
      const length = typeof stored === 'string' ? stored.length : stored === null ? 0 : null
      if (length === null) {
        whole = false
        continue
      }
      const before = memory?.readOf(sessionId, { ref: bodyRef('joomla', kind, id, b.field) }) ?? null
      counts[b.field] = { chars_before: before?.chars ?? null, chars_sent: b.length, chars_stored: length }
      remember(b.field, length, item?.title)
      if (length < VERIFY_RATIO * b.length) whole = false
    }
    if (!whole)
      return {
        ...got,
        verified: false,
        ...(Object.keys(counts).length > 0 ? { chars: counts } : {}),
        next: `content.get {kind:"${kind}", id:${id}} once, then tell the customer what the ${kind} holds.`
      }
    return { ...got, verified: counts }
  }

  /**
   * 🔒 A CREATE'S RECEIPT SAYS WHAT THE SITE NOW HOLDS (`stored-echo.mjs`). The body check above already
   * holds the row of a WordPress create that carried a body; every other create — a Joomla record of
   * any kind (the component answers `{ok, kind, id, created}` and no more), a WordPress post with no
   * body — is read back here, once, by the door: a read, so no model step and no cache change. The
   * receipt also says `live` (F2), judged by the host's clock. An edit is not echoed (the agent read the
   * record before it), and a read that fails, or a row with none of the columns, leaves the receipt as
   * it was: the write went through either way.
   * @param {import('./normalize.mjs').Relay} call
   * @param {unknown} got
   */
  async function echoCreated(call, got) {
    if (call.action !== 'content.update' || facts.verifyBodyWrites === false) return got
    // `verified`/`next` mean the in-tool check already answered (or asked for the read itself).
    if (!isRecord(got) || got.ok !== true || got.created !== true || 'verified' in got || 'next' in got)
      return got
    const kind = str(call.params.kind)
    const id = positiveId(got.id)
    const shape = platform === 'joomla' ? 'joomla' : wordpressShaped && kind === 'post' ? 'wordpress' : null
    if (shape === null || kind === '' || id === 0) return got
    const back = /** @type {any} */ (await send('content.get', { kind, id }))
    // The kind decides whether the row can say `live` at all (a module's row says published and shows nowhere).
    const echo = isRecord(back) && back.ok === true ? createEcho(shape, back.item, now(), kind) : null
    return echo === null ? got : { ...got, ...echo, next: STORED_NEXT }
  }
}

/** A template part's slug, as the component and WordPress name one (`header`, `footer-dark`). */
const PART_SLUG = /^[a-z0-9][a-z0-9_-]{0,99}$/i
/** A theme folder's name: one path segment, never `.` or `..`. */
const THEME_SLUG = /^[a-z0-9][a-z0-9._-]{0,99}$/i

/**
 * The whole body a WordPress write replaces — `post_content` of a post, `content` of a template
 * part — as `{field, value}`, or null when this call writes no body.
 *
 * 🔒 PRESENT IS A BODY WRITE, WHATEVER ITS TYPE. This returned null unless the value was a string, so
 * a body sent as an object, an array or a number skipped the guard and the in-tool check alike, and
 * the component stored "Array" or "7" as the page (review, 25/09). `normalizeCall` refuses those on
 * a WordPress site; a site whose platform could not be read skips that pass, so the guard refuses
 * them too.
 * @param {import('./normalize.mjs').Relay} call
 * @param {boolean} wordpressShaped - the site is not known to be Joomla or EmDash.
 * @returns {{ field: 'post_content' | 'content', value: unknown } | null}
 */
function writtenBody(call, wordpressShaped) {
  if (!wordpressShaped || call.action !== 'content.update') return null
  const fields = call.params.fields
  if (!isRecord(fields)) return null
  const kind = str(call.params.kind)
  const field = kind === 'post' ? 'post_content' : kind === 'templatePart' ? 'content' : null
  if (field === null || !Object.hasOwn(fields, field)) return null
  return { field, value: fields[field] }
}

/** The WordPress post type that holds a theme's user global styles: theme.json as JSON text. */
export const GLOBAL_STYLES_TYPE = 'wp_global_styles'
/** The key WordPress reads user global styles by; without it true, every user style is dropped. */
export const GLOBAL_STYLES_FLAG = 'isGlobalStylesUserThemeJSON'

/**
 * 🔒 v6 WP L4-02 (28/09/2026): A GLOBAL-STYLES POST IS JSON, AND WORDPRESS DROPS IT SILENTLY WHEN IT
 * IS NOT. The user global styles live in one `wp_global_styles` post whose `post_content` is
 * theme.json text. `WP_Theme_JSON_Resolver::get_user_data()` (WP 7 `class-wp-theme-json-resolver.php`)
 * decodes it and, on a decoding error OR when `isGlobalStylesUserThemeJSON` is not true, uses NO user
 * styles at all — no error on the page, only a PHP notice. The bench's write (post 384, 2,633 chars)
 * had lost one `}`: the door answered ok, "verified 2605→2633", every colour the customer had was
 * gone, and the agent spent 167 s finding out why; the post was left corrupt. The body guard cannot see
 * it (JSON has no block comments, and the length grew). So a whole `post_content` for such a post is
 * parsed here first, before anything is sent: it must be one JSON object that keeps the flag true.
 *
 * Known to be such a post by what this conversation read of it (`postType`, from `content.get` or a
 * `content.list` row — the body guard already makes a write read its post first), by `post_type` on a
 * create, or by the flag named in the text itself. A W2 block edit never reaches here as such a post:
 * it has no blocks, and `applyBlockEdits` refuses it by name.
 * @param {import('./normalize.mjs').Relay} call
 * @param {{ wordpressShaped: boolean, platform: string, sessionId: string | null, memory: CallMemory | null }} ctx
 * @returns {Record<string, unknown> | null} the refusal, or null to go on.
 */
export function globalStylesProblem(call, { wordpressShaped, platform, sessionId, memory }) {
  const body = writtenBody(call, wordpressShaped)
  if (body === null || body.field !== 'post_content' || typeof body.value !== 'string') return null
  const text = body.value
  const id = positiveId(call.params.id)
  const fields = isRecord(call.params.fields) ? call.params.fields : {}
  const read = id > 0 && sessionId ? (memory?.readOf(sessionId, { id }) ?? null) : null
  const styles =
    read?.postType === GLOBAL_STYLES_TYPE ||
    str(fields.post_type) === GLOBAL_STYLES_TYPE ||
    text.includes(`"${GLOBAL_STYLES_FLAG}"`)
  if (!styles) return null
  const base = {
    ok: false,
    code: 'PARAMS_NOT_JSON',
    action: 'content.update',
    platform,
    kind: 'post',
    ...(id > 0 ? { id } : {}),
    field: 'post_content',
    key: null,
    globalStyles: true
  }
  const got = parseJson(text)
  // A brace dropped INSIDE (L4-02: the one closing `settings`) stops JSON.parse only at the end.
  if ('offset' in got)
    return {
      ...base,
      offset: got.offset,
      found: around(text, got.offset),
      ...(got.offset >= text.trimEnd().length ? { ends: true } : {}),
      error: `post_content of this global-styles post is not JSON at char ${got.offset}: WordPress would drop every user style; nothing was written`
    }
  if (!isRecord(got.value))
    return {
      ...base,
      offset: 0,
      found: text.slice(0, 60),
      notObject: true,
      error: 'post_content of this global-styles post is not one JSON object; nothing was written'
    }
  if (got.value[GLOBAL_STYLES_FLAG] !== true)
    return {
      ...base,
      offset: 0,
      found: text.slice(0, 60),
      flag: GLOBAL_STYLES_FLAG,
      error: `post_content has no "${GLOBAL_STYLES_FLAG}": true, and WordPress drops every user style without it; nothing was written`
    }
  return null
}

/**
 * One WordPress block delimiter at the sticky position (`wp-includes/class-wp-block-parser.php:248`):
 * `<!-- wp:name {attrs} -->`, `<!-- /wp:name -->`, `<!-- wp:name /-->`, a namespace optional, the
 * attributes one `{…}` that cannot hold another comment's `-->` or `<!--`.
 */
const DELIMITER =
  /<!--\s+\/?wp:[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?\s+(?:(\{(?:(?!-->|<!--)[\s\S])*?\})\s+)?\/?-->/y

/**
 * The first block comment in `body` WordPress cannot read, or null when every one parses.
 *
 * 🔒 A BODY WHOSE BLOCKS DO NOT PARSE IS NOT A SHORTER BODY, SO THE LENGTH RULES CANNOT SEE IT. PR1
 * bench C45 (benchwp01, 25/09/2026): the Header menu (`wp_navigation` post 68, 828 chars) went back
 * with all six `/-->` retyped `/>` — 820 chars, 99 % of the read, and not one `-->` in it. WordPress
 * parsed it to no blocks and the header fell back to another menu; the in-tool check measured 820
 * of 820 stored and said `verified`, and the customer was told it was done. Each `<!-- wp:` or
 * `<!-- /wp:` must close as WordPress's grammar says, its attributes one JSON object (a broken
 * object is dropped by `json_decode`). Run over every WordPress body write the bench recorded (225,
 * four runs) and 124 stored bodies, it flagged that one write only.
 * @param {string} body
 * @returns {{ at: number, found: string } | null}
 */
export function blockMarkupProblem(body) {
  const opener = /<!--\s+\/?wp:/g
  for (let m = opener.exec(body); m !== null; m = opener.exec(body)) {
    DELIMITER.lastIndex = m.index
    const d = DELIMITER.exec(body)
    let ok = d !== null
    if (d !== null && d[1] !== undefined)
      try {
        const attrs = JSON.parse(d[1])
        ok = attrs !== null && typeof attrs === 'object' && !Array.isArray(attrs)
      } catch {
        ok = false
      }
    if (!ok) return { at: m.index, found: body.slice(m.index, m.index + 90) }
  }
  return null
}

// ── F1: a Joomla JSON column is JSON, down to its nested strings ────────────────────────────────────

/**
 * 🔒 F1 (27/09/2026): THE RECORD FIELDS THE JOOMLA COMPONENT STORES AS JSON TEXT ARE CHECKED AS JSON
 * BEFORE THEY ARE SENT. A module's, menu item's, template style's or category's `params`, and an
 * article's `attribs`, `images`, `urls` and `metadata`, are whitelisted columns the component writes
 * as given (`JoomlaSiteWriter::write`) and answers ok — so a broken value came back as a receipt
 * saying "nothing to read back". Bench V5-chat-01 (benchjoomla01, 27/09): three writes of module
 * 442's `params` whose nested `jatools-config` string had lost its last `}` (JSON.parse: "Expected ','
 * or '}'" at char 970). The Services module then rendered nothing — a service card vanished on the
 * stand — and every later contract apply on the page was refused `contract_failed "Syntax error"`,
 * the contract's json_decode of that nested string. The outer JSON parsed: one level is not enough.
 *
 * A nested string is opened only when it LOOKS like JSON ({@link jsonLooking}), so a title such as
 * `[Tracy Business] Home` or a directive `{loadposition top-a}` stays words, never a false refusal.
 */
export const JSON_FIELDS = Object.freeze(['params', 'attribs', 'images', 'urls', 'metadata'])
/**
 * The Joomla kinds the component never creates (`JoomlaSiteWriter::canCreate`, claude-cowork 0.18.5): a
 * write to one names an existing row, so a `{patch}` on it with no id is an edit whose address is missing
 * and not a create. Every other kind it lists can be made, and takes a JSON column as `{patch}` too.
 */
const JOOMLA_NO_CREATE = new Set([
  'templateStyle',
  'extensionParams',
  'languageFilter',
  'user',
  'articleAssociation',
  'menuAssociation',
  'moduleAssignment'
])
/**
 * Whether a `content.update` MAKES a record: no id (absent, null, `""`, `0`, `"0"`) on a kind the
 * component can create. Then nothing is stored to merge into (`mergeJsonField`) or to replace
 * (`jsonFieldPatch`). Not so for an id the component would read as another record (`"42abc"` is 42
 * there), nor for a kind it cannot create: those are an edit whose address is missing.
 * @param {Record<string, unknown>} params
 */
function createsRecord(params) {
  return (
    positiveId(params.id) === 0 &&
    !malformedId(params.id) &&
    !JOOMLA_NO_CREATE.has(str(params.kind) || 'record')
  )
}
/** How many levels of JSON inside a JSON string are opened (`jatools-config` is the second). */
const JSON_DEPTH = 4
/** What JSON text STRUCTURALLY begins with: `{` then a key's quote or `}`, `[` then `"`, `{`, `[` or `]`. */
const JSON_STRUCTURAL = /^\s*(?:\{\s*["}]|\[\s*["{[\]])/
/** A bracket opening a bare number or `-`: JSON only when the text is a closed list (`jsonLooking`). */
const JSON_NUMBER_LIST = /^\s*\[\s*-?\d/

/**
 * Whether a nested string is to be opened as JSON.
 *
 * 🔒 A BRACKET AND A NUMBER ARE NOT ENOUGH (28/09/2026). `[\s*\d` read a footnote marker as JSON:
 * `"[1] See terms"` — a value customers really write — opened as a list, stopped being JSON at char 3,
 * and got the WHOLE column refused `PARAMS_NOT_JSON`, so nothing could be written at all. A bracket
 * followed by a number now counts only when the text is a closed list — it ends with `]` — which
 * `[1] See terms` does not. The structural openers are unchanged and carry F1's measured case (a
 * `jatools-config` OBJECT that had lost its last `}`): `{"` never opens a customer's words.
 * @param {string} text
 */
function jsonLooking(text) {
  if (JSON_STRUCTURAL.test(text)) return true
  return JSON_NUMBER_LIST.test(text) && text.trimEnd().endsWith(']')
}

/**
 * @param {string} text
 * @returns {{ value: unknown } | { offset: number }} the value, or where JSON.parse stopped (the
 *   text's length when it ended early).
 */
function parseJson(text) {
  try {
    return { value: JSON.parse(text) }
  } catch (error) {
    const at = /position (\d+)/.exec(error instanceof Error ? error.message : '')
    return { offset: at ? Number(at[1]) : text.length }
  }
}

/** What stands around `offset`, for the model to find the spot: 40 characters before, 20 after. */
const around = (/** @type {string} */ text, /** @type {number} */ offset) =>
  text.slice(Math.max(0, offset - 40), offset + 20)

/**
 * The first JSON-looking string inside `value` that does not parse, with its key path.
 * @param {unknown} value
 * @param {string} path
 * @param {number} depth - levels of JSON text opened to reach `value`
 * @returns {{ key: string, offset: number, text: string } | null}
 */
function nestedJsonProblem(value, path, depth) {
  if (value === null || typeof value !== 'object') return null
  /** @type {[string, unknown][]} */
  const entries = Array.isArray(value)
    ? value.map((v, i) => [`${path}[${i}]`, v])
    : Object.entries(value).map(([k, v]) => [path === '' ? k : `${path}.${k}`, v])
  for (const [key, v] of entries) {
    if (typeof v !== 'string') {
      const inner = nestedJsonProblem(v, key, depth)
      if (inner !== null) return inner
      continue
    }
    if (depth >= JSON_DEPTH || !jsonLooking(v)) continue
    const got = parseJson(v)
    if ('offset' in got) return { key, offset: got.offset, text: v }
    const inner = nestedJsonProblem(got.value, key, depth + 1)
    if (inner !== null) return inner
  }
  return null
}

/**
 * The first of {@link JSON_FIELDS} in `fields` that is not JSON: text that does not parse, JSON that
 * is not an object or a list, a value of another type, or a JSON-looking string inside it that does
 * not parse (`key` is its path, e.g. `jatools-config`). Null when every one is sound, or absent. An
 * empty string and null are left to the component.
 * @param {Record<string, unknown>} fields
 * @returns {{ field: string, key: string | null, offset: number, found: string, notObject?: true } | null}
 */
export function jsonFieldProblem(fields) {
  for (const field of JSON_FIELDS) {
    if (!Object.hasOwn(fields, field)) continue
    const v = fields[field]
    if (v === null || (typeof v === 'string' && v.trim() === '')) continue
    /** @type {unknown} */
    let parsed = v
    if (typeof v === 'string') {
      const got = parseJson(v)
      if ('offset' in got) return { field, key: null, offset: got.offset, found: around(v, got.offset) }
      parsed = got.value
    }
    if (parsed === null || typeof parsed !== 'object')
      return { field, key: null, offset: 0, found: String(v).slice(0, 60), notObject: true }
    const inner = nestedJsonProblem(parsed, '', 1)
    if (inner !== null)
      return { field, key: inner.key, offset: inner.offset, found: around(inner.text, inner.offset) }
  }
  return null
}

/**
 * F1 — the JSON fields of a Joomla `content.update` sent as an object or a list, written as the JSON
 * text the column holds. The component binds an array through a Joomla Table only for an article or
 * a module; every other kind is written by `updateObject`, which cannot store an array at all.
 * @param {Record<string, unknown>} fields
 * @returns {{ fields: Record<string, unknown>, notes: string[] }}
 */
export function jsonFieldsAsText(fields) {
  /** @type {string[]} */
  const notes = []
  /** @type {Record<string, unknown>} */
  const out = { ...fields }
  for (const field of JSON_FIELDS) {
    const v = out[field]
    if (v === null || typeof v !== 'object') continue
    out[field] = JSON.stringify(v)
    notes.push(`fields.${field}: ${Array.isArray(v) ? 'a list' : 'an object'}, written as JSON text`)
  }
  return { fields: out, notes }
}

/**
 * 🔒 F1.1 (28/09/2026): A FEW KEYS ARE NOT THE WHOLE COLUMN. The JSON columns Joomla keeps are
 * written AS GIVEN — the component stores the text and answers ok — so `params: {"logo":"x.png"}`,
 * which is how a model names the one setting it wants changed, REPLACED every other parameter of that
 * template style, menu item or category. Before F1 (27/09) the same call wrote nothing at all (Joomla
 * ignores an array), so F1 turned a silent no-op into silent data loss.
 *
 * Tracy cannot tell a patch from a complete column, and it cannot invent the keys it was not given,
 * so it writes neither: the refusal names the road — read the record, send the column back whole with
 * the change in it. A `params` the model sent as TEXT is its own business and goes as before: it is
 * then the model that read the column.
 *
 * A one-key object is not treated more kindly than a forty-key one: the count says nothing about
 * whether the other keys exist.
 * @param {Record<string, unknown>} fields - the fields as the call sent them, BEFORE `jsonFieldsAsText`.
 * @param {{ create?: boolean }} [call] - `create`: the call makes a record (`createsRecord`), so only an
 *   ambiguous `patch` object is refused.
 * @returns {{ field: string, keys: string[], create?: true } | null} the first such column, or null.
 */
export function jsonFieldPatch(fields, { create = false } = {}) {
  for (const field of JSON_FIELDS) {
    const v = fields[field]
    if (v === null || typeof v !== 'object' || Array.isArray(v)) continue
    const keys = Object.keys(/** @type {Record<string, unknown>} */ (v))
    // 🔒 F3 (30/09/2026): ON A CREATE THERE IS NO STORED COLUMN TO REPLACE, so the object is the column —
    // the same rule as `{patch}` (`mergeJsonField`). Two shapes are still refused, because each is neither
    // the patch form nor a column of its own keys, and writing it would store a literal `patch` key and drop
    // what the model meant as a patch: a `patch` object beside other keys, and a `patch` ALONE that is not an
    // object (a JSON text, a list — a model reaching for the patch form and missing it). A `patch` that is not
    // an object beside other keys is one of the column's own keys, as before.
    const patchValue = /** @type {Record<string, unknown>} */ (v).patch
    const ambiguous = Object.hasOwn(v, 'patch') && (keys.length === 1 || isPlainObject(patchValue))
    if (create && !ambiguous) continue
    return { field, keys: keys.slice(0, 12), ...(create ? { create: true } : {}) }
  }
  return null
}

/**
 * 🔒 F1.2 (29/09/2026): A FEW KEYS ARE A PATCH WHEN THE CALL SAYS SO. `fields.params` re-typed whole to
 * change one setting broke modules (V5-chat-01: `jatools-config` one `}` short, three times) and cost
 * output tokens (Joomla L2-02); the component only replaces the column. `fields.<column>:{patch:{…}}`
 * is unambiguous — the call names a patch — so the host reads the record, merges (`merge-patch.mjs`,
 * RFC 7386: null removes a key, an object merges, a JSON text inside is opened and merged the same way),
 * and writes the whole column. Any other object on a JSON column is still F1.1's refusal.
 * @param {Record<string, unknown>} fields
 * @returns {{ field: string, patch: Record<string, unknown> } | null}
 */
export function jsonFieldMergeField(fields) {
  for (const field of JSON_FIELDS) {
    const v = fields[field]
    if (isPlainObject(v) && Object.keys(v).length === 1 && isPlainObject(v.patch))
      return { field, patch: v.patch }
  }
  return null
}

/**
 * A stored string the patch reaches with an object: opened when it is JSON text of an object.
 * @type {import('./merge-patch.mjs').OpenText}
 */
function openJsonText(stored) {
  if (!jsonLooking(stored)) return null
  const got = parseJson(stored)
  return 'value' in got && isPlainObject(got.value) ? got.value : null
}

/**
 * F1.2 — the record's column read, merged with the patch, as the JSON text to write.
 * @param {Send} send
 * @param {Record<string, unknown>} params
 * @param {{ field: string, patch: Record<string, unknown> }} target
 * @param {string} platform
 * @returns {Promise<{ ok: true, text: string, note: string } | { ok: false, answer: Record<string, unknown> }>}
 */
async function mergeJsonField(send, params, target, platform) {
  const { field, patch } = target
  const kind = str(params.kind) || 'record'
  const id = positiveId(params.id)
  if (id === 0) {
    // 🔒 A CREATE HAS NOTHING STORED TO MERGE INTO: the patch is the column (RFC 7386 against `{}`, so
    // a null key removes nothing). The description says the same call with the id left out CREATES, so
    // a model that patches `attribs` on a new article sent both — and was refused ADDRESS_MISSING, then
    // wrote the article without the column and patched it in a second write (round 7, two runs, 6 calls).
    // Still a real id for a kind the component cannot create, and for an id it would read as another
    // record (`"42abc"` is 42 there): those are an edit whose address is missing.
    if (createsRecord(params)) {
      const created = /** @type {Record<string, unknown>} */ (
        mergePatch({}, patch, { openText: openJsonText })
      )
      return {
        ok: true,
        text: JSON.stringify(created),
        note: `fields.${field}.patch: ${Object.keys(created).length} key(s) written as the new ${field} (a create)`
      }
    }
    return {
      ok: false,
      answer: {
        ok: false,
        code: 'ADDRESS_MISSING',
        action: 'content.update',
        platform,
        kind,
        needs: 'id',
        error: `fields.${field}.patch changes an existing ${kind}: name its id`
      }
    }
  }
  const got = await send('content.get', { kind, id })
  if (!isRecord(got) || got.ok !== true || !isRecord(got.item))
    return { ok: false, answer: isRecord(got) ? got : { ok: false, code: 'READ_FAILED', error: 'no answer' } }
  const stored = got.item[field]
  /** @type {unknown} */
  let current = stored
  if (typeof stored === 'string' && stored.trim() !== '') {
    const parsed = parseJson(stored)
    if ('offset' in parsed)
      return {
        ok: false,
        answer: {
          ok: false,
          code: 'PARAMS_NOT_JSON',
          action: 'content.update',
          platform,
          kind,
          id,
          field,
          key: null,
          offset: parsed.offset,
          found: around(stored, parsed.offset),
          error: `the stored ${field} is not JSON at char ${parsed.offset}: a patch cannot merge into it; nothing was written`
        }
      }
    current = parsed.value
  }
  if (!isPlainObject(current)) current = {}
  /** @type {unknown} */
  let merged
  try {
    merged = mergePatch(current, patch, { openText: openJsonText })
  } catch (error) {
    if (!(error instanceof KeysLost)) throw error
    return {
      ok: false,
      answer: {
        ok: false,
        code: 'PARAMS_KEYS_LOST',
        action: 'content.update',
        platform,
        kind,
        id,
        field,
        key: error.path,
        lost: error.lost.slice(0, 12),
        error: `fields.${field}.patch["${error.path.slice(0, 40)}"] is a string that drops ${error.lost
          .slice(0, 3)
          .map((k) => `"${k.slice(0, 30)}"`)
          .join(', ')} of the stored JSON text; nothing was written`
      }
    }
  }
  return {
    ok: true,
    text: JSON.stringify(merged),
    note: `fields.${field}.patch: ${Object.keys(patch).length} key(s) merged into the stored ${field}, written whole`
  }
}

/** The residue sweep's writes in flight: set only by {@link withSweepRead}, never by a call's parameters. */
const sweepScope = new AsyncLocalStorage()

/**
 * 🔒 THE SWEEP MAY CUT A TEMPLATE BODY ONLY ON A READ OF THIS VERY MOMENT (product owner, 24/10/2026). A template
 * post the demo's plan left unwritten keeps its lorem ipsum, and a body of one block cannot pass `BODY_SHRINK` by
 * a dropped block. Inside this scope, a WordPress block write whose `rev` the host checked against its own read
 * of the record, made just before the write (`expandBlockEdits`), passes the length rule: the body replaced is the
 * one on the site now, not one remembered. The scope is entered by host code only (`sweep-resolve.mjs`); no
 * parameter a model sends opens it, so every other write keeps the guard as it was.
 * @template T
 * @param {() => Promise<T>} write
 * @returns {Promise<T>}
 */
export function withSweepRead(write) {
  return sweepScope.run(true, write)
}

/** Whether this write is the residue sweep's ({@link withSweepRead}): host code only, never a call's parameters. */
export const inSweepRead = () => sweepScope.getStore() === true

/**
 * D6′ (a) — the body guard. Refuses, with nothing sent, a WordPress whole-body write whose block
 * comments WordPress cannot read (`BLOCK_MARKUP`, a create included); and, to an existing record,
 * one this conversation has not read, or one under 80 % of the longest body it read of it this turn
 * — unless the blocks it dropped by name are the whole of the shrink (F6), or `removes` quotes the
 * customer's own request for a removal ({@link judgeWholeBody}). A Joomla body is judged by
 * {@link joomlaBodyGuard}, the same judgement.
 * @param {import('./normalize.mjs').Relay} call
 * @param {{ wordpressShaped: boolean, platform: string, sessionId: string | null, memory: CallMemory | null, events: readonly any[], blockDrop?: BlockDrop | null, sweptOnRead?: boolean }} ctx
 * @returns {{ refuse?: Record<string, unknown>, note?: string, reset?: boolean }}
 */
function bodyGuard(
  call,
  { wordpressShaped, platform, sessionId, memory, events, blockDrop = null, sweptOnRead = false }
) {
  // WordPress has no `article` or `module`: a Joomla-shaped write is Joomla's, whatever was read of the site.
  if (joomlaBodies(call, platform).length > 0)
    return joomlaBodyGuard(call, { platform, sessionId, memory, events })
  const body = writtenBody(call, wordpressShaped)
  if (body === null) return {}
  const { field } = body
  const kind = str(call.params.kind)
  if (typeof body.value !== 'string')
    return {
      refuse: {
        ok: false,
        code: 'NO_WRITABLE_FIELD',
        action: 'content.update',
        kind,
        given: [field],
        needs: 'string',
        field,
        error: `${field} is the ${kind === 'post' ? "page's" : "part's"} block markup as one string`
      }
    }
  const length = body.value.length
  const id = positiveId(call.params.id)
  const key = str(call.params.key)
  // Before the create pass-through below: a new post whose blocks do not parse is as broken as an edit.
  const broken = blockMarkupProblem(body.value)
  if (broken !== null)
    return {
      refuse: {
        ok: false,
        code: 'BLOCK_MARKUP',
        action: 'content.update',
        platform,
        kind,
        ...(id > 0 ? { id } : {}),
        ...(key ? { key } : {}),
        at: broken.at,
        found: broken.found,
        error: `${field} has a block comment WordPress cannot read at character ${broken.at}`
      }
    }
  // A post with no id (or id 0) is a create: there is no body to cut. An id that is present but not
  // a whole number is NOT one — `normalizeCall` refuses it first; this is the second lock.
  if (kind === 'post' && id === 0 && !malformedId(call.params.id)) return {}
  const what =
    kind === 'post' ? `post ${id || String(call.params.id).slice(0, 20)}` : `the ${key || 'template'} part`
  const base = {
    ok: false,
    code: 'BODY_SHRINK',
    action: 'content.update',
    platform,
    kind,
    ...(id > 0 ? { id } : {}),
    ...(key ? { key } : {})
  }
  // A part by its slug ONLY (`readOf`): the component ignores any id beside it.
  const read =
    memory === null || typeof sessionId !== 'string' || sessionId === ''
      ? null
      : (memory.readOf(sessionId, kind === 'post' ? { id } : { kind: 'templatePart', key }) ?? null)
  // No stored part and no theme file of that slug: this write creates the part.
  if (read?.absent === true) return {}
  if (read?.themeUnread === true)
    return {
      refuse: {
        ...base,
        read: true,
        theme: 'unread',
        chars_sent: length,
        error: `${what} is not stored and its theme file could not be read: this write cannot be checked`
      }
    }
  if (inSampleShrink() && read !== null && read.baseline !== null)
    return {
      note: `${field} is shorter by the template's lorem the replace read off ${what} just before it`,
      reset: true
    }
  if (sweptOnRead && read !== null && read.baseline !== null)
    return {
      note: `${field} is the residue sweep's placeholder, written on a read of ${what} made for it; apply.revert puts the body back`,
      reset: true
    }
  return judgeWholeBody({
    base,
    field,
    what,
    length,
    read,
    conversation: memory !== null && typeof sessionId === 'string' && sessionId !== '',
    removes: call.host?.removes,
    customerWords: () => latestCustomerWords(events),
    blockDrop
  })
}

/**
 * 🔒 D6′ (a) ON JOOMLA (09/10/2026): AN ARTICLE'S `introtext`/`fulltext` AND A MODULE'S `content` ARE
 * WHOLE BODIES TOO. `content.update` replaces each field whole, and an accepted write answers only
 * `{ok, kind, id, created}` — the WordPress truncation of 25/09 (26,847 chars → 252) had no guard
 * here: "fix the typo in paragraph 3", a `content.replace` that misses where markup splits the words,
 * then the whole field sent back holding that paragraph alone. So the same judgement as WordPress's
 * ({@link judgeWholeBody}): read first in this conversation, refused under 80 % of the longest read
 * this turn, `removes` quoting the customer's removal, a record this conversation created is its own
 * — over {@link SHRINK_JUDGED_FROM} characters only. Keyed on the call's shape like the F1 JSON check:
 * a site whose platform could not be read is guarded too; WordPress and EmDash have no such kind.
 * @param {import('./normalize.mjs').Relay} call
 * @param {{ platform: string, sessionId: string | null, memory: CallMemory | null, events: readonly any[] }} ctx
 * @returns {{ refuse?: Record<string, unknown>, note?: string, reset?: boolean }}
 */
function joomlaBodyGuard(call, { platform, sessionId, memory, events }) {
  const bodies = joomlaBodies(call, platform)
  if (bodies.length === 0) return {}
  const id = positiveId(call.params.id)
  // A create (no id, or 0) has no body to cut; a malformed id is `normalizeCall`'s to refuse.
  if (id === 0) return {}
  const kind = str(call.params.kind)
  const conversation = memory !== null && typeof sessionId === 'string' && sessionId !== ''
  /** @type {string[]} */
  const notes = []
  let reset = false
  for (const body of bodies) {
    const ref = bodyRef('joomla', kind, id, body.field)
    const read = conversation && ref !== null ? (memory?.readOf(sessionId, { ref }) ?? null) : null
    // The residue sweep's research body over a template article it read for this write and found still the
    // template's (`sweep-resolve.mjs` `templateFields`), as on WordPress ({@link withSweepRead}).
    if (inSweepRead() && read !== null && read.baseline !== null) {
      notes.push(
        `${body.field} is the residue sweep's research body, written on a read of ${kind} ${id} made for it`
      )
      reset = true
      continue
    }
    const judged = judgeWholeBody({
      base: {
        ok: false,
        code: 'BODY_SHRINK',
        action: 'content.update',
        platform,
        kind,
        id,
        field: body.field
      },
      field: body.field,
      what: `${kind} ${id}`,
      length: body.length,
      read,
      conversation,
      removes: call.host?.removes,
      customerWords: () => latestCustomerWords(events),
      floor: SHRINK_JUDGED_FROM
    })
    if (judged.refuse) return judged
    if (judged.note) notes.push(judged.note)
    if (judged.reset) reset = true
  }
  return { ...(notes.length > 0 ? { note: notes.join('; ') } : {}), ...(reset ? { reset: true } : {}) }
}

/**
 * The whole bodies a Joomla `content.update` replaces: an article's `introtext` and `fulltext`, a
 * module's `content`, each with the length it would store (a null clears the field: 0). A value of
 * any other type is not measured here. Empty for every other call.
 * @param {import('./normalize.mjs').Relay} call
 * @param {string} platform
 * @returns {Array<{ field: string, value: string | null, length: number }>}
 */
function joomlaBodies(call, platform) {
  if (platform === 'wordpress' || platform === 'emdash' || call.action !== 'content.update') return []
  const fields = call.params.fields
  if (!isRecord(fields)) return []
  const names = JOOMLA_BODY_FIELDS[str(call.params.kind)]
  if (names === undefined) return []
  /** @type {Array<{ field: string, value: string | null, length: number }>} */
  const out = []
  for (const field of names) {
    if (!Object.hasOwn(fields, field)) continue
    const value = fields[field]
    if (typeof value === 'string') out.push({ field, value, length: value.length })
    else if (value === null) out.push({ field, value: null, length: 0 })
  }
  return out
}

/** The Joomla fields `content.update` replaces whole that hold a page's words, per kind. */
const JOOMLA_BODY_FIELDS = /** @type {Record<string, readonly string[]>} */ (
  Object.freeze({ article: Object.freeze(['introtext', 'fulltext']), module: Object.freeze(['content']) })
)

/**
 * D6′ (a)'s judgement of ONE whole-body write to an existing record, on every platform: WordPress's
 * `post_content` and template part ({@link bodyGuard}), Joomla's body fields ({@link joomlaBodyGuard})
 * and an EmDash long text or rich-text field (`emdash-call.mjs`). One rule, one set of refusals:
 * - no conversation → refused, a stop (never a read loop);
 * - not read in this conversation → refused `read:false`;
 * - a record this conversation created → passes (D6′ (c));
 * - a body whose longest read this turn is under `floor` → passes (Joomla, EmDash: {@link SHRINK_JUDGED_FROM});
 * - at least 80 % of that read → passes;
 * - blocks dropped by position that are the whole of the shrink (F6, WordPress) → passes, new baseline;
 * - `removes` quoting the customer's own removal → passes, new baseline;
 * - else refused `read:true` with both lengths.
 * @param {{
 *   base: Record<string, unknown>, field: string, what: string, length: number,
 *   read: import('./call-memory.mjs').ReadSeen | null, conversation: boolean,
 *   removes: unknown, customerWords: () => string, blockDrop?: BlockDrop | null, floor?: number,
 *   stored?: number | null
 * }} input
 *   `stored`: what the site holds now when the door read it itself (EmDash's read before a write, D12):
 *   judged against when it is longer than the read — a body that grew since is cut all the same.
 * @returns {{ refuse?: Record<string, unknown>, note?: string, reset?: boolean }}
 */
export function judgeWholeBody({
  base,
  field,
  what,
  length,
  read,
  conversation,
  removes,
  customerWords,
  blockDrop = null,
  floor = 0,
  stored = null
}) {
  /**
   * 🔒 NO CONVERSATION, NO BODY WRITE — AND NO READ LOOP. Reads are remembered per conversation only
   * (`call-memory.mjs`: a call with no sessionId shares nothing with any other). Asking for a read
   * here would loop — the read is not remembered either — so the answer says why and stops. Every
   * model call carries its dsh session; this is the fail-closed edge, not a road.
   */
  if (!conversation)
    return {
      refuse: {
        ...base,
        read: false,
        conversation: false,
        chars_sent: length,
        error: `${field} replaces ${what}'s whole body, and this call names no conversation to check it against`
      }
    }
  if (read === null || read.baseline === null)
    return {
      refuse: {
        ...base,
        read: false,
        chars_sent: length,
        error: `${field} replaces ${what}'s whole body, and this conversation has not read it`
      }
    }
  /**
   * 🔒 D6′ (c): A RECORD THIS CONVERSATION CREATED HAS NO CUSTOMER BODY TO PROTECT. The guard exists
   * for a body the site held before the agent arrived; a post the agent made this conversation and now
   * rewrites shorter is the author revising its own draft. Measured 26/09 (round 5b, WordPress B2):
   * the agent created post 2057 at 1,465 chars, then its second draft at 1,005 was refused as a
   * truncation and cost a full retry. Records READ from the site keep the rule below unchanged.
   */
  if (read.created === true)
    return {
      note: `${field} is shorter than first written, and ${what} is this conversation's own new record`
    }
  const baseline = typeof stored === 'number' && stored > read.baseline ? stored : read.baseline
  if (baseline < floor) return {}
  if (length >= SHRINK_RATIO * baseline) return {}
  /**
   * 🔒 F6 (27/09/2026): A BLOCK DROPPED BY ITS POSITION IS THE REMOVAL ITSELF, IN ANY LANGUAGE. The
   * guard exists for a body cut by accident — a whole body re-sent from part of a read (D6′: six r2
   * cases). `blocks:{"<i>":null}` is no accident: the model named the block, the host spliced it out
   * of the body it read itself, and `apply.revert` puts it back. It used to need `removes` quoting a
   * removal verb, and only English and Vietnamese verbs were known: "hide the projects section" was
   * refused BODY_SHRINK and the agent hid the section with CSS instead (27/09), and a customer
   * writing any other shipped language could never pass. So a block edit passes when the blocks it
   * dropped account for ALL of its shrink — the body with them put back is over the line — and it
   * keeps at least one block of the page. A replacement that cuts a block short, or dropping every
   * block, is judged as before. Its shorter body is the new baseline at once, as for `removes`.
   */
  if (
    blockDrop !== null &&
    blockDrop.count > 0 &&
    blockDrop.count < blockDrop.of &&
    length + blockDrop.chars >= SHRINK_RATIO * baseline
  )
    return {
      note: `${field} is shorter by the ${blockDrop.count === 1 ? 'block' : 'blocks'} dropped by position; apply.revert puts ${blockDrop.count === 1 ? 'it' : 'them'} back`,
      reset: true
    }
  // 🔒 THE TEMPLATE'S LOREM MAY GO (product owner, 25/10/2026; `sample-text.mjs`): a block edit passes when the
  // lorem blocks it replaced or dropped, read by the host from the body now, account for all of its shrink.
  // Shrinking a customer's own words is judged as before.
  if (
    blockDrop !== null &&
    (blockDrop.sample ?? 0) > 0 &&
    length + blockDrop.sample >= SHRINK_RATIO * baseline
  )
    return {
      note: `${field} is shorter by the template's lorem it replaced; apply.revert puts it back`,
      reset: true
    }
  if (quotesCustomer(removes, customerWords()))
    return { note: `${field} is shorter than stored: removes quotes the customer's request`, reset: true }
  return {
    refuse: {
      ...base,
      read: true,
      chars_sent: length,
      chars_stored: baseline,
      ...(read.theme !== null ? { theme: read.theme } : {}),
      // 🔒 WHAT THIS CONVERSATION READ, NOT WHAT THE SITE HOLDS: the site may have changed since.
      error:
        read.theme !== null
          ? `${field} is ${chars(length)} chars; ${what}'s theme file holds ${chars(baseline)}`
          : baseline > read.baseline
            ? `${field} is ${chars(length)} chars; ${what} holds ${chars(baseline)} now`
            : `${field} is ${chars(length)} chars; this conversation last read ${what} at ${chars(baseline)}`
    }
  }
}

/**
 * The title of the record a delete or a hide names, read by Tracy from the site (`content.get`), so the
 * customer's question says which record — '' when the record has none, null when it cannot be read.
 * @param {(action: string, params: Record<string, unknown>) => Promise<unknown>} send
 * @param {string} platform
 * @param {Record<string, unknown>} params - the call's own `{kind, id}`
 * @returns {Promise<string | null>}
 */
async function recordTitleOf(send, platform, params) {
  const kind = typeof params.kind === 'string' ? params.kind : ''
  const id = Number(params.id)
  // A template part is named by its slug, which is what the site and the customer call it.
  if (typeof params.key === 'string' && params.key.trim() !== '' && !(Number.isInteger(id) && id > 0))
    return params.key.trim().slice(0, 120)
  if (kind === '' || !Number.isInteger(id) || id <= 0) return null
  const kinds = platform === 'wordpress' && kind !== 'post' ? [kind, 'post'] : [kind]
  for (const k of kinds) {
    const got = /** @type {any} */ (await send('content.get', { kind: k, id }).catch(() => null))
    if (got?.ok !== true || got.item === null || typeof got.item !== 'object') continue
    const title = [got.item.post_title, got.item.title, got.item.name].find((t) => typeof t === 'string')
    return typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  }
  return null
}
