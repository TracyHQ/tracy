/**
 * Site changes V2 — the list by Source (plan `tasks/todo-site-changes-v2.md` §4, contract
 * `tasks/evidence/site-changes-v2/contract.md` §1, §3). Served by the same door as V1
 * (`activity.js`) when the query says `version=2`:
 *
 *   GET /api/sites/:key/activity?version=2&filter=all|<source>&limit&cursor
 *     → {schemaVersion: 2, items, nextCursor, counts: {all, <source>…, complete, reasons}, coverage}
 *
 * One event per row: a chat or comment turn, a group of writes with no turn record, an outside
 * seal or deploy, one CMS log row (V2 no longer folds CMS rows — plan §4.3), one succeeded
 * undo/reset (`site_operation`), or a Git moment no row accounts for. Shapes: `api.ts`
 * (`ActivityItemV2`), the client's contract.
 *
 * 🔒 ONE CLASSIFICATION FOR PAGE, FILTER AND COUNT. Postgres rows carry their Source from the CASE
 * in `activity-source.js`, applied before `limit`; Git-only rows are classified by its JS twin
 * BEFORE they are merged and paged, and the same Git-only set is what the counts add.
 *
 * 🔒 AN UNDO IS ONE EVENT. A succeeded operation's verified `resulting_sha` accounts for its Git
 * commit; until the reconciler verified it, the commit shows as a legacy restore (By Unknown) and
 * the pending operation shows nothing — never a success it has not proven (contract D3).
 *
 * 🔒 UNDONE ONLY BY PROOF. A moment is undone when a succeeded `undo` operation targeted it, or a
 * restore commit proven by author + ORIGINAL subject (contract D2) names it. A reset marks
 * nothing. Undoing a turn's last moment marks that moment, not the turn's other moments or its
 * content (plan §3.3).
 *
 * GET keeps V1's side effects (contract D6): the history job seals what changed outside Tracy,
 * and `coverage.cmsLog` stamps `last_read_at`.
 */

import {
  describeCms,
  describeCoworkUpdate,
  describeDeploy,
  describeEffects,
  effectsOf,
  requestStateOf
} from './activity-describe.js'
import { backupVersionOf, cacheOnly, fileCount, readGit } from './activity-git.js'
import {
  BADGE_SOURCES,
  CMS_OF,
  classifyCmsChange,
  classifyGitRow,
  classifyOperation,
  classifyOutside,
  classifyTurn,
  classifyWrites,
  restoreOf,
  SOURCES,
  softwareUnitOf,
  V2_RANK
} from './activity-source.js'
import {
  accountedForGit,
  cmsChangesById,
  compareKeys,
  countSourcesV2,
  countUnseenV2,
  facesByEmail,
  foldedSealsOf,
  foldedSealsOfWrites,
  operationShas,
  operationsById,
  outsideBySha,
  pageKeysV2,
  seenAtOf,
  succeededUndos,
  turnsByIdV2,
  turnsSince,
  writesOfGroupsV2,
  writesOfTurnsV2
} from './activity-store.js'
import { cmsLogCoverage } from './cms-log.js'
import { parseTurnId, recordOutside } from './turns.js'
import { designSystemApplies, designSystemDescription, designSystemRowOf } from './design-system-rows.js'
import { isSetupMoment, setupMomentFiles, setupRunOf } from './setup-moment.js'

/**
 * `people`: every Source except `automatic` — the changes a person (or Tracy for one) made, the
 * tab's default view. Cron and self-updates are hidden behind one line the tab draws from `counts`.
 */
export const PEOPLE_SOURCES = SOURCES.filter((s) => s !== 'automatic')

/** What `filter` accepts with `version=2`: every Source, all of them, or `people`. */
export const V2_FILTERS = ['all', 'people', ...SOURCES]

/** The Sources one V2 filter reads. */
export function sourcesOfFilter(filter) {
  if (filter === 'all') return SOURCES
  if (filter === 'people') return PEOPLE_SOURCES
  return [filter]
}

// ── Cursor ──────────────────────────────────────────────────────────────────────────────────────

/** A V2 cursor: the version, the filter it was cut under, and the key of the page's last row. */
export function encodeCursorV2(filter, k) {
  return Buffer.from(JSON.stringify({ v: 2, f: filter, a: k.atUs.toString(), r: k.rank, i: k.id })).toString(
    'base64url'
  )
}

/**
 * @param {string} cursor
 * @returns {{ok: true, cursor: {filter: string, atUs: bigint, rank: number, id: string}} |
 *           {ok: false, reason: 'malformed' | 'version-mismatch'}}
 */
export function decodeCursorV2(cursor) {
  let value
  try {
    value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  // A V1 cursor is an array; anything without `v: 2` was not cut by this reader.
  if (Array.isArray(value)) return { ok: false, reason: 'version-mismatch' }
  if (!value || typeof value !== 'object') return { ok: false, reason: 'malformed' }
  if (value.v !== 2) return { ok: false, reason: 'version-mismatch' }
  const { f, a, r, i } = value
  if (typeof f !== 'string' || !V2_FILTERS.includes(f)) return { ok: false, reason: 'malformed' }
  if (typeof a !== 'string' || !/^[0-9]{1,19}$/.test(a)) return { ok: false, reason: 'malformed' }
  if (!Object.values(V2_RANK).includes(r)) return { ok: false, reason: 'malformed' }
  if (typeof i !== 'string' || !i || i.length > 300) return { ok: false, reason: 'malformed' }
  return { ok: true, cursor: { filter: f, atUs: BigInt(a), rank: r, id: i } }
}

// ── Pending operations ──────────────────────────────────────────────────────────────────────────

/**
 * Settle this site's pending/unknown undo operations against their jobs before reading (contract
 * D3), so a finished undo is listed as the operation and not as an unverified Git commit. The
 * reconciler is route.js's closure over `operations.js` `reconcilePending` (it binds the pool and
 * the site's job runner); readers mounted without one — unit tests, older callers — read as is.
 */
async function settlePending(site, reconcile) {
  if (typeof reconcile !== 'function') return
  try {
    await reconcile(site)
  } catch (error) {
    // A reconcile that fails leaves rows pending; the list still reads (they show as Git commits).
    console.warn(`[tracy-web] reconcile failed on ${site.site_key}: ${error?.message ?? error}`)
  }
}

// ── The reader ──────────────────────────────────────────────────────────────────────────────────

/**
 * One V2 page.
 * @param {import('pg').Pool} pool
 * @param {{site_key: string, label: string, host: string, platform: string|null}} site
 * @param {{cursor?: string|null, limit?: number, filter?: string, runJob: Function,
 *          reconcile?: (site: any) => Promise<unknown>, canWriteFiles?: boolean, viewer?: string|null,
 *          viewerAccountId?: string|null}} opts
 *   `viewer`: the reader's verified email, for `conversation.mine`; none → `mine` is false.
 *   `viewerAccountId`: the reader's account, for `seenBefore` (their Site changes watermark as it
 *   stood before this read, plan `tasks/todo-site-changes-badge-count.md` §2); none → null. The read
 *   never moves the watermark: the tab does, once it has drawn (`PUT /activity/seen`).
 */
export async function readActivityV2(
  pool,
  site,
  {
    cursor = null,
    limit = 30,
    filter = 'all',
    runJob,
    reconcile,
    canWriteFiles = true,
    viewer = null,
    viewerAccountId = null
  }
) {
  if (!V2_FILTERS.includes(filter)) throw new Error(`not a V2 filter: ${filter}`)
  // When this read started — what the tab hands back as the watermark once it has drawn the page.
  const readAt = new Date().toISOString()
  let after = null
  if (cursor) {
    const decoded = decodeCursorV2(cursor)
    if (!decoded.ok || decoded.cursor.filter !== filter) throw new Error('INVALID_CURSOR')
    after = decoded.cursor
  }
  const sources = sourcesOfFilter(filter)
  const siteKey = site.site_key
  const fileHistory = site.platform !== 'emdash'

  await settlePending(site, reconcile)
  const git = await readGit(site, runJob)
  // The seal this read made is an outside row like any other (as the history door keeps it), recorded
  // before the rows are counted: with its paths it can be folded into the CMS row that wrote them.
  if (git.sealed) await recordOutside(pool, siteKey, [{ ...git.sealed, cause: 'seal' }])
  const trailerTurns = git.rows.map((r) => r.turn).filter((t) => typeof t === 'string' && t)
  const [accounted, opShas] = await Promise.all([
    accountedForGit(pool, siteKey, trailerTurns),
    operationShas(pool, siteKey)
  ])
  // The Git moments no row accounts for, classified once: the page AND the counts use this set.
  const gitOnly = []
  /** A setup run's moment known only by its commit (SC-3): run → its files, for the run's row. */
  const setupMoments = new Map()
  for (const r of git.rows) {
    const setupRun = setupRunOf(r.turn)
    if (setupRun && accounted.setupRuns.has(setupRun) && !setupMoments.has(setupRun))
      setupMoments.set(setupRun, { sha: r.sha, count: fileCount(r) })
    if (accounted.shas.has(r.sha) || opShas.has(r.sha)) continue
    if (typeof r.turn === 'string' && accounted.turns.has(r.turn)) continue
    if (setupRun && accounted.setupRuns.has(setupRun)) continue
    const origin = classifyGitRow(r)
    // An outside@ commit (seal, deploy, housekeeping) is the row `site_outside` will hold once a turn
    // records it: same kind, rank and id from the start, so neither the client's `kind:id` key nor
    // a cursor's place moves when that happens (dev round 02/10). Other Git-only commits stay `git`.
    const outside = origin.cause !== undefined
    gitOnly.push({
      row: r,
      origin,
      key: {
        kind: outside ? 'outside-files' : 'git',
        rank: outside ? V2_RANK['outside-files'] : V2_RANK.git,
        id: r.sha,
        atUs: BigInt(Number(r.at)) * 1_000_000n,
        source: origin.source
      }
    })
  }
  const cache = cacheOnly(git)

  const [pgKeys, pgCounts, cmsCoverage, since, undos, seenBefore] = await Promise.all([
    pageKeysV2(pool, siteKey, { sources, after, limit: limit + 1, cache }),
    countSourcesV2(pool, siteKey, cache),
    cmsLogCoverage(pool, site),
    turnsSince(pool, siteKey),
    succeededUndos(pool, siteKey),
    viewerAccountId ? seenAtOf(pool, siteKey, viewerAccountId) : Promise.resolve(null)
  ])
  const gitKeys = gitOnly
    .filter((g) => sources.includes(g.key.source) && (!after || compareKeys(g.key, after) > 0))
    .map((g) => g.key)
  const merged = [...pgKeys, ...gitKeys].sort(compareKeys)
  const page = merged.slice(0, limit)
  const more = merged.length > limit

  const ctx = {
    git,
    fileHistory,
    canWriteFiles,
    viewer,
    undone: undoneIndex(undos, git.rows, opShas),
    gitOnly: new Map(gitOnly.map((g) => [g.row.sha, g])),
    setupMoments
  }
  const byKey = await hydrate(pool, siteKey, page, ctx)
  const items = page.map((k) => byKey.get(`${k.kind}:${k.id}`)).filter(Boolean)
  await attachFaces(pool, items, ctx)
  // `conversation` is on every V2 item: the chat it came from for a turn, null for anything else.
  for (const item of items) if (!('conversation' in item)) item.conversation = null
  // `reply` likewise: Tracy's answer for a turn (null when none was kept), null for anything else.
  for (const item of items) if (!('reply' in item)) item.reply = null
  // `undone` likewise: the undo engine's mark on a turn (`turnUndoneOf`), null for anything else.
  for (const item of items) if (!('undone' in item)) item.undone = null
  // `recordedAt` likewise: when Tracy wrote the row (the badge's clock); null on a Git-only moment.
  for (const item of items) if (!('recordedAt' in item)) item.recordedAt = null
  // `unseen`: the badge's own rule on each row (`countUnseenV2`, plan §2.1 — a badge Source, recorded
  // after the reader's watermark, not the reader's own work through Tracy), decided here so the tab
  // lights exactly the rows the card counted: "3" on the card is "3 new" in the list, never "4".
  const seenMs = typeof seenBefore === 'string' ? Date.parse(seenBefore) : null
  const me = typeof viewer === 'string' && viewer ? `tracy:${viewer.trim().toLowerCase()}` : null
  for (const item of items) item.unseen = unseenOf(item, seenMs, me)
  // `unseenCount`: the badge's number for this reader over the whole site (not the page) — software
  // islands counted once — so the list's "N new since you last looked" says what the card said.
  const unseenCount =
    typeof seenBefore === 'string'
      ? await countUnseenV2(pool, siteKey, { since: seenBefore, viewer: viewer ?? null, cache })
      : null

  /** @type {Record<string, number>} */
  const bySource = Object.fromEntries(SOURCES.map((s) => [s, 0]))
  for (const [source, n] of Object.entries(pgCounts)) bySource[source] = (bySource[source] ?? 0) + n
  for (const g of gitOnly) bySource[g.key.source] += 1
  const reasons = []
  if (git.state !== 'read') reasons.push('git-unread')
  else if (git.truncated) reasons.push('git-truncated')
  if (!fileHistory) reasons.push('no-file-history')
  const cmsLog = cmsCoverage.cmsLog
  if (cmsLog && (cmsLog.enabled === false || cmsLog.lastError)) reasons.push('collector-gap')
  if (cmsLog?.limits?.length) reasons.push('cms-log-limits')
  const last = page[page.length - 1]
  return {
    schemaVersion: 2,
    items,
    nextCursor: more && last ? encodeCursorV2(filter, last) : null,
    readAt,
    seenBefore,
    unseenCount,
    counts: {
      all: Object.values(bySource).reduce((a, b) => a + b, 0),
      ...bySource,
      complete: reasons.length === 0,
      reasons
    },
    coverage: {
      git: git.state,
      gitTruncated: git.state === 'read' ? git.truncated : null,
      since,
      fileHistory,
      cmsLog
    }
  }
}

/**
 * Whether the badge counted this row for the reader: a badge Source (or an `automatic` SOFTWARE row,
 * `unit` set — `softwareUnitOf`), recorded after the watermark (`seenMs`, null = no watermark:
 * nothing is unseen, plan §2.3), and not the reader's own — a row whose Tracy seat (`actor.id` =
 * `tracy:<email>`) is `me`. A CMS account (`wordpress:10`) is never a seat. Every row of a counted
 * island is unseen (the list lights them all); the answer's `unseenCount` says how many THINGS they
 * are, the badge's own number.
 * @param {{origin: {source: string}, recordedAt: string|null, actor?: {type?: string, id?: string}, unit?: string|null}} item
 * @param {number|null} seenMs
 * @param {string|null} me
 */
export function unseenOf(item, seenMs, me) {
  if (seenMs === null || typeof item.recordedAt !== 'string') return false
  const source = item.origin?.source
  if (source === 'automatic' ? !item.unit : !BADGE_SOURCES.includes(source)) return false
  const recorded = Date.parse(item.recordedAt)
  if (!(recorded > seenMs)) return false
  const id = typeof item.actor?.id === 'string' ? item.actor.id.toLowerCase() : null
  return !(me !== null && id === me)
}

// ── Conversation ──────────────────────────────────────────────────────────────────────────────

/**
 * The chat a turn row came from, for "Open conversation": the dsh session and turn number its id
 * names (`<session>:<n>`), the prompt's message id (null on rows recorded before it was kept),
 * and `mine` — whether the reader is the person who typed it. A dsh session opens only for the
 * person who created it (dsh-passwords), so `mine` is what lets a client offer the button; it is
 * a fact for the client, not a grant: opening is still the session's own check.
 * @param {{turn_id: string, actor: string|null, prompt_message_id?: string|null}} t
 * @param {string|null|undefined} viewer the reader's verified email
 * @returns {{sessionId: string, turn: number, promptMessageId: string|null, mine: boolean} | null}
 */
export function conversationOf(t, viewer) {
  const parsed = parseTurnId(t.turn_id)
  if (!parsed) return null
  const actor = typeof t.actor === 'string' ? t.actor.trim().toLowerCase() : ''
  const reader = typeof viewer === 'string' ? viewer.trim().toLowerCase() : ''
  return {
    sessionId: parsed.sessionId,
    turn: parsed.turn,
    promptMessageId:
      typeof t.prompt_message_id === 'string' && t.prompt_message_id ? t.prompt_message_id : null,
    mine: Boolean(actor) && actor === reader
  }
}

/**
 * Tracy's answer as the turn's close kept it (050, plan `tasks/todo-open-conversation.md` §C), or
 * null — a turn recorded before answers were kept, or one that ended with no text. The agent's own
 * account, shown beside the request; never evidence of what changed.
 * @param {{reply?: string|null, reply_state?: string|null}} t
 * @returns {{text: string, state: 'full'|'truncated'|'interrupted'} | null}
 */
export function replyOf(t) {
  if (typeof t.reply !== 'string' || t.reply === '') return null
  const state = t.reply_state === 'truncated' || t.reply_state === 'interrupted' ? t.reply_state : 'full'
  return { text: t.reply, state }
}

/**
 * Whether the undo engine (`POST /api/sites/:key/turns/undo`, `turn-undo.js`) PROVABLY undid this turn,
 * as it stamps `site_turn.undo_proven_at` / `undo_proven_complete` (migration 182): `{at, complete}` —
 * `complete` false when no press undid all of it, only part (its files or its content) — or null when
 * nothing of it is proven gone. A press whose outcome was only `unsure` (the host answered 202) stamps
 * `undone_at` for the agent's notice, never this. The Site changes row says "Undone" / "Partly undone"
 * from it, in place of the files-only status the reversal index gives (that index sees the commits the
 * engine undid, not the content it reverted).
 * @param {{undo_proven_at?: Date|string|null, undo_proven_complete?: boolean|null}} t
 * @returns {{at: string, complete: boolean} | null}
 */
export function turnUndoneOf(t) {
  if (t.undo_proven_at === null || t.undo_proven_at === undefined) return null
  const at = t.undo_proven_at instanceof Date ? t.undo_proven_at : new Date(t.undo_proven_at)
  if (Number.isNaN(at.getTime())) return null
  return { at: at.toISOString(), complete: t.undo_proven_complete === true }
}

// ── Undone ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Who undid which moment: succeeded `undo` operations (full target sha), then legacy restore
 * commits proven under D2 that no operation accounts for (short sha from the subject).
 */
function undoneIndex(undos, gitRows, opShas) {
  const entries = undos.map((op) => ({
    prefix: String(op.target_sha),
    link: { kind: 'operation', id: op.id },
    by: operationActor(op)
  }))
  for (const r of gitRows) {
    if (opShas.has(r.sha)) continue
    const restore = restoreOf(r)
    if (restore?.mode === 'undo')
      entries.push({
        prefix: restore.target,
        link: { kind: 'git', id: r.sha },
        by: UNKNOWN_ACTOR('executor')
      })
  }
  return {
    /** The undo that took `sha` back, or null. */
    of: (sha) => (sha ? (entries.find((e) => sha.startsWith(e.prefix)) ?? null) : null)
  }
}

// ── Items ───────────────────────────────────────────────────────────────────────────────────────

/**
 * A row that is ONE revert and nothing else — what a seat key's `…/applies/:id/revert` makes (sweep #2,
 * its own row by `writeGroupSql`): "Restored the content from before <apply id>", never the bare
 * "Content change recorded" of an unnamed write. Null for any other group.
 * @param {{action: string, target?: any}[]} writes
 */
function revertDescription(writes) {
  if (writes.length !== 1 || writes[0].action !== 'apply.revert') return null
  const reverts = writes[0].target?.reverts
  return {
    key: 'apply.revert',
    params: { applyId: typeof reverts === 'string' ? reverts : null },
    isRequestOnly: false
  }
}

const UNKNOWN_ACTOR = (role) => ({ type: 'unknown', role })
const TRACY_AGENT = { type: 'system', id: 'service:tracy', name: 'Tracy', role: 'executor' }
const SERVICE = {
  'tracy-deploy': { type: 'system', id: 'service:tracy-deploy', name: 'Tracy deploy', role: 'executor' },
  'tracy-housekeeping': { type: 'system', id: 'service:tracy', name: 'Tracy', role: 'executor' },
  'wordpress-cron': { type: 'system', id: 'service:wordpress-cron', name: 'WordPress', role: 'executor' },
  'emdash-scheduler': { type: 'system', id: 'service:emdash-scheduler', name: 'EmDash', role: 'executor' }
}

const localPart = (email) => String(email).split('@')[0] || String(email)

/**
 * A Tracy seat as the requester (contract D5): the name is read now through the account; an account
 * that no longer exists is Unknown — the email alone is not shown as a person.
 */
function seatActor(email, displayName, accountKnown, role = 'requester') {
  if (!email || !accountKnown) return UNKNOWN_ACTOR(role)
  return {
    type: 'person',
    id: `tracy:${String(email).toLowerCase()}`,
    name: displayName || localPart(email),
    role
  }
}

/** The presser of an operation: `actor_email` is a historical snapshot the row may keep (D5). */
function operationActor(op) {
  if (!op.actor_email) return UNKNOWN_ACTOR('requester')
  return {
    type: 'person',
    id: `tracy:${String(op.actor_email).toLowerCase()}`,
    name: op.display_name || localPart(op.actor_email),
    role: 'requester'
  }
}

/** The email of a Tracy seat actor (`id: "tracy:<email>"`), else null. */
const seatEmail = (actor) =>
  typeof actor?.id === 'string' && actor.id.startsWith('tracy:') ? actor.id.slice('tracy:'.length) : null

/**
 * Every `type: 'person'` actor on the page — the requester, the executor, who undid it
 * (`reversal.undoneBy`), a comment's author — gets `face`: the one `personFace` gives the Tracy
 * account behind its email, as `/api/team` does, else null. A seat actor's email is its id; a Git
 * moment's person executor is looked up by the trailer's email; a CMS account is never a Tracy
 * seat (null). One query for the whole page; the other fields are unchanged.
 */
async function attachFaces(pool, items, ctx) {
  /** @type {Array<[any, string|null]>} */
  const people = []
  const add = (actor, email) => {
    if (actor?.type === 'person') people.push([actor, email])
  }
  for (const item of items) {
    for (const actor of [item.actor, item.reversal?.undoneBy, item.comment?.author])
      add(actor, seatEmail(actor))
    const trailer = item.kind === 'git' ? ctx.gitOnly.get(item.id)?.row.by : null
    const trailerEmail =
      trailer?.kind === 'person' && typeof trailer.email === 'string' ? trailer.email : null
    add(item.executor, seatEmail(item.executor) ?? trailerEmail)
  }
  const faces = await facesByEmail(
    pool,
    people.map(([, email]) => email)
  )
  for (const [actor, email] of people) actor.face = (email && faces.get(email.toLowerCase())) || null
}

const iso = (d) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString())

/** The turn's moments: every commit its trailer names in Git's window, and the one it closed with. */
function momentsOf(turnId, headSha, git) {
  const shas = git.rows.filter((r) => r.turn === turnId).map((r) => r.sha)
  if (headSha && !shas.includes(headSha)) shas.push(headSha)
  return shas
}

/**
 * A turn's file count as Git's reader counts it today (V1 `recount`, Q4): its moments by trailer,
 * else its last moment, else what Postgres recorded.
 */
function turnFiles(t, git) {
  if (!(t.files > 0) || !t.head_sha) return null
  const mine = git.rows.filter((r) => r.turn === t.turn_id)
  let count = null
  if (mine.length || git.hidden.some((h) => h.turn === t.turn_id))
    count = mine.reduce((sum, r) => sum + fileCount(r), 0)
  if (count === null) {
    const row = git.rows.find((r) => r.sha === t.head_sha)
    if (row) count = fileCount(row)
    else if (git.hidden.some((h) => h.sha === t.head_sha)) count = 0
  }
  if (count === null) count = Number(t.files)
  return count > 0 ? { sha: t.head_sha, count } : null
}

/** The outside row's file count (Q4 recount, housekeeping keeps its own). */
function outsideFiles(o, git) {
  const recorded = Array.isArray(o.files) ? o.files.length : Number(o.files ?? 0)
  if (o.cause === 'housekeeping') return { sha: o.sha, count: recorded }
  const row = git.rows.find((r) => r.sha === o.sha)
  return { sha: o.sha, count: row ? fileCount(row) : recorded }
}

/**
 * The reversal state of an event whose moments are `moments` (plan §3.3).
 * @param {string[]} moments
 * @param {{content: boolean, settings: boolean, other: boolean, momentsComplete: boolean}} rest
 */
function reversalOf(moments, ctx, rest) {
  const hits = moments.map((sha) => ctx.undone.of(sha)).filter(Boolean)
  if (!hits.length) return { state: 'none' }
  const parts = []
  if (rest.content) parts.push('content')
  if (rest.settings) parts.push('settings')
  if (rest.other) parts.push('other')
  if (hits.length < moments.length) parts.push('other-moments')
  if (!rest.momentsComplete) parts.push('unknown-moments')
  const latest = hits[hits.length - 1]
  return {
    state: parts.length ? 'partially-undone' : 'undone',
    undoneBy: latest.by,
    link: latest.link,
    ...(parts.length ? { partsNotReversed: parts } : {})
  }
}

/** Whether Git's window holds every moment a turn opened at `openedAt` could have made. */
function momentsComplete(git, openedAt) {
  if (git.state !== 'read') return false
  if (!git.truncated) return true
  const oldest = git.rows.at(-1)
  return Boolean(oldest) && Number(oldest.at) * 1000 <= new Date(openedAt).getTime()
}

/** Diff and Undo: what the row allows, and why not. */
function capabilitiesOf({ files, ctx, undoable, notUndoableReason }) {
  const reasons = []
  const hasFiles = Boolean(files?.sha) && (files?.count ?? 0) > 0
  if (!ctx.fileHistory) reasons.push('no-file-history')
  else if (!hasFiles) reasons.push('no-files')
  const canDiff = ctx.fileHistory && hasFiles
  let canUndoFiles = canDiff && undoable
  if (canDiff && !undoable && notUndoableReason) reasons.push(notUndoableReason)
  if (canUndoFiles && !ctx.canWriteFiles) {
    canUndoFiles = false
    reasons.push('forbidden')
  }
  return { canDiff, canUndoFiles, reasons }
}

const has = (g) => g.resources.length + g.operations > 0

async function hydrate(pool, siteKey, page, ctx) {
  const of = (kind) => page.filter((k) => k.kind === kind).map((k) => k.id)
  const sourceOf = new Map(page.map((k) => [`${k.kind}:${k.id}`, k.source]))
  const [turns, turnWrites, groupWrites, outsides, cms, ops, folded, foldedWrites] = await Promise.all([
    turnsByIdV2(pool, siteKey, of('turn')),
    writesOfTurnsV2(pool, siteKey, of('turn')),
    writesOfGroupsV2(pool, siteKey, of('writes')),
    outsideBySha(pool, siteKey, of('outside-files')),
    cmsChangesById(pool, siteKey, of('cms-change')),
    operationsById(pool, siteKey, of('operation')),
    foldedSealsOf(pool, siteKey, of('cms-change')),
    foldedSealsOfWrites(pool, siteKey, of('writes'))
  ])
  const writesBy = groupBy([...turnWrites, ...groupWrites], (w) => w.group_id)
  const { git } = ctx
  /** @type {Map<string, any>} */
  const out = new Map()
  /** The SQL CASE decided the Source; the JS twin adds the evidence and the service. */
  const origin = (kind, id, js) => ({ ...js, source: sourceOf.get(`${kind}:${id}`) ?? js.source })

  for (const t of turns) {
    const writes = writesBy.get(t.turn_id) ?? []
    const files = turnFiles(t, git)
    const { effects, technical } = effectsOf({ writes, files, fileHistory: ctx.fileHistory, gitRead: true })
    const o = origin('turn', t.turn_id, classifyTurn(t, t.has_ref === true))
    const head = files?.sha ?? null
    const headUndone = ctx.undone.of(head)
    const moments = momentsOf(t.turn_id, files ? t.head_sha : null, git)
    const undone = turnUndoneOf(t)
    const comment =
      o.source === 'comment'
        ? {
            n: Number(t.ref_n),
            url: String(t.ref_url),
            // The comment the request was made from (`site_comment.id`), null when the request is
            // tied to none; `deleted` when it was deleted since — url and author stay, as history.
            id: typeof t.comment_id === 'string' && t.comment_id ? t.comment_id : null,
            deleted: t.comment_deleted === true,
            ...(t.author_email
              ? {
                  author: t.author_name
                    ? {
                        type: 'person',
                        id: `tracy:${String(t.author_email).toLowerCase()}`,
                        name: t.author_name
                      }
                    : {
                        type: 'person',
                        id: `tracy:${String(t.author_email).toLowerCase()}`,
                        name: localPart(t.author_email)
                      }
                }
              : {})
          }
        : null
    out.set(`turn:${t.turn_id}`, {
      id: t.turn_id,
      kind: 'turn',
      origin: o,
      actor: seatActor(t.actor, t.display_name, t.account_known),
      executor: TRACY_AGENT,
      description: describeEffects(effects, { technical, requestOnlyAllowed: true }),
      occurredAt: iso(t.opened_at),
      detectedAt: null,
      timeBasis: 'occurred',
      // Recorded when it closed: a turn is listed only once closed (or overdue), so a person who
      // looked while it ran has not seen it (plan badge §0).
      recordedAt: iso(t.closed_at ?? t.opened_at),
      endedAt: t.closed_at ? iso(t.closed_at) : null,
      state: t.state === 'stale' || t.overdue ? 'stale' : 'closed',
      effects,
      ...(technical.length ? { technical } : {}),
      request: { text: String(t.title ?? ''), state: requestStateOf(t.request_state) },
      ...(comment ? { comment } : {}),
      flags: {
        unsealedStart: t.unsealed_start === true,
        concurrent: t.concurrent === true,
        steered: t.steered === true
      },
      reversal: reversalOf(files ? moments : [], ctx, {
        content: has(effects.content),
        settings: has(effects.settings),
        other: effects.other.operations > 0,
        momentsComplete: momentsComplete(git, t.opened_at)
      }),
      // A turn the undo engine took back offers no second undo, whatever part of it went back.
      capabilities: capabilitiesOf({
        files,
        ctx,
        undoable: !headUndone && undone === null,
        notUndoableReason: 'undone'
      }),
      undone,
      evidence: { turnId: t.turn_id, ...(head ? { commitSha: head } : {}) },
      conversation: conversationOf(t, ctx.viewer),
      reply: replyOf(t)
    })
  }

  // The design system applies among the page's write groups: the Site changes row of one offers its
  // undo through the Design system door (`design-system-rows.js` `designSystemRowOf`).
  const dsApplyIds = [...writesBy]
    .filter(([groupId]) => of('writes').includes(groupId))
    .flatMap(([, writes]) => writes)
    .filter((w) => w.via === 'ds-slot' && w.action === 'design-system.apply')
    .map((w) => w.target?.applyId)
    .filter((id) => typeof id === 'string')
  const dsKnown = { ...(await designSystemApplies(pool, siteKey, dsApplyIds)), canWrite: ctx.canWriteFiles }

  for (const [groupId, writes] of writesBy) {
    if (!of('writes').includes(groupId)) continue
    const first = writes[0]
    const designSystem = designSystemRowOf(writes, dsKnown)
    const dsUndo = writes.some((w) => w.via === 'ds-slot' && w.action === 'design-system.undo')
    const dsApplyRow =
      designSystem?.applyId ??
      writes.find((w) => w.via === 'ds-slot' && typeof w.target?.applyId === 'string')?.target.applyId
    const dsRow = dsApplyRow ? (dsKnown.rows.get(dsApplyRow) ?? null) : null
    // Walkthrough 11/10 (bug 3): the files a design system apply's own job wrote, sealed by a later
    // look, ride on this row (`notFoldedSeal`) — counted here, never a second "source unknown" row.
    const seal = foldedWrites.get(groupId) ?? null
    // SC-3: a Tracy setup run's own moment — recorded by the run (its carrier row, which is no
    // operation of its own), or known by the commit's trailer when the run did not hear back.
    const carrier = writes.find(isSetupMoment) ?? null
    const setupFiles =
      (carrier && setupMomentFiles(carrier)) ??
      (first.origin === 'setup' ? (ctx.setupMoments?.get(first.origin_ref) ?? null) : null)
    const files = seal ? { sha: seal.sha, count: seal.files } : setupFiles
    const { effects, technical } = effectsOf({
      writes: carrier ? writes.filter((w) => w !== carrier) : writes,
      files,
      fileHistory: ctx.fileHistory,
      linked: Boolean(files)
    })
    const o = origin('writes', groupId, classifyWrites(writes))
    // The Design system button's press: the person applied it themselves, so By names them as the
    // one who applied it, and no Tracy agent stands beside them (walkthrough 11/10, bug 4).
    const press = o.source === 'design-system'
    const dsDescription = designSystemDescription(writes, dsRow)
    // Tracy setup (sweep #4): the person who sent the brief asked, Tracy wrote — as a chat turn reads.
    // The run is kept as evidence, so one brief's row can be found again.
    const setupRun = o.source === 'setup' ? (first.origin_ref ?? null) : null
    out.set(`writes:${groupId}`, {
      id: groupId,
      kind: 'writes',
      origin: o,
      actor: first.actor
        ? seatActor(first.actor, first.display_name, first.account_known, press ? 'executor' : 'requester')
        : UNKNOWN_ACTOR(press ? 'executor' : 'requester'),
      executor: o.source === 'chat' || o.source === 'setup' ? TRACY_AGENT : undefined,
      description: dsDescription ?? revertDescription(writes) ?? describeEffects(effects, { technical }),
      occurredAt: iso(first.at),
      detectedAt: null,
      timeBasis: 'occurred',
      // The group grows with every write: recorded at its last one.
      recordedAt: iso(writes[writes.length - 1].at),
      effects,
      ...(technical.length ? { technical } : {}),
      request: { state: 'none' },
      // A design system's undo is itself an undo; an apply taken back reads "Undone".
      reversal: { state: dsUndo && !designSystem ? 'not-applicable' : 'none' },
      capabilities: capabilitiesOf({ files, ctx, undoable: false }),
      ...(designSystem
        ? {
            designSystem,
            undone: dsRow?.undone_at ? { at: iso(dsRow.undone_at), complete: true } : null
          }
        : {}),
      evidence: {
        ...(files ? { commitSha: files.sha } : {}),
        ...(setupRun ? { setupRun } : {})
      }
    })
  }

  for (const o of outsides) {
    const files = outsideFiles(o, git)
    const og = origin('outside-files', o.sha, classifyOutside(o))
    const deploy = og.source === 'deployment'
    // Tracy's Cowork package updating itself (`isCoworkUpdateSeal`): a Tracy update, but still SEALED —
    // the moment Tracy noticed it, not one it committed as it wrote.
    const selfUpdate = deploy && o.cause === 'seal'
    const detected = og.source === 'unknown' || selfUpdate
    out.set(`outside-files:${o.sha}`, {
      id: o.sha,
      kind: 'outside-files',
      origin: og,
      actor: og.service ? SERVICE[og.service] : UNKNOWN_ACTOR('executor'),
      description: selfUpdate
        ? describeCoworkUpdate(files.count)
        : deploy
          ? describeDeploy({ tag: o.deploy_tag, file: deployFileOf(git, o.sha), files: files.count })
          : og.service === 'tracy-housekeeping'
            ? { key: 'housekeeping', params: { files: files.count }, isRequestOnly: false }
            : { key: 'files.changed-source-unknown', params: { files: files.count }, isRequestOnly: false },
      // A seal is the moment Tracy NOTICED the files (plan §2.4); a deploy commits as it writes.
      occurredAt: detected ? null : iso(o.at),
      detectedAt: detected ? iso(o.at) : null,
      timeBasis: detected ? 'detected' : 'occurred',
      recordedAt: iso(o.recorded_at ?? o.at),
      effects: effectsOf({ files, fileHistory: ctx.fileHistory }).effects,
      request: { state: 'none' },
      reversal: { state: 'none' },
      capabilities: capabilitiesOf({ files, ctx, undoable: false, notUndoableReason: 'outside' }),
      evidence: { commitSha: o.sha }
    })
  }

  for (const c of cms) {
    const id = `${c.source}:${c.cursor_key}`
    const og = origin('cms-change', id, classifyCmsChange(c))
    const platform = CMS_OF[c.source] ?? null
    const account = c.cms_actor && (c.cms_actor.id || c.cms_actor.name) ? c.cms_actor : null
    // E5.1c: the seal of the files this row wrote, folded into it (`notFoldedSeal`) — counted here.
    const seal = folded.get(id) ?? null
    const files = seal ? { sha: seal.sha, count: seal.files } : null
    out.set(`cms-change:${id}`, {
      id,
      kind: 'cms-change',
      origin: { ...og, ...(platform ? { cms: platform } : {}), log: c.source },
      // The CMS's own account (never mapped to a Tracy seat); WP-Cron is WordPress itself.
      actor: account
        ? {
            type: 'person',
            ...(account.id ? { id: `${platform ?? 'cms'}:${account.id}` } : {}),
            name: account.name ?? null,
            role: 'executor'
          }
        : og.service
          ? SERVICE[og.service]
          : UNKNOWN_ACTOR('executor'),
      description: describeCms(c),
      occurredAt: iso(c.occurred_at),
      detectedAt: null,
      timeBasis: 'occurred',
      // The CMS's clock says when; the collector's pull says when Tracy learned of it.
      recordedAt: iso(c.pulled_at ?? c.occurred_at),
      // The badge's grouping unit of a software row (`softwareUnitOf`); null on a content row.
      unit: softwareUnitOf(c),
      effects: effectsOf({ cms: c, files, fileHistory: ctx.fileHistory, linked: Boolean(files) }).effects,
      request: { state: 'none' },
      reversal: { state: 'none' },
      capabilities: capabilitiesOf({ files, ctx, undoable: false, notUndoableReason: 'outside' }),
      evidence: { cmsRecordRef: id, ...(files ? { commitSha: files.sha } : {}) }
    })
  }

  for (const op of ops) {
    if (op.action === 'sync-to-live' || op.action === 'sync-to-live-undo') {
      out.set(`operation:${op.id}`, pushItem(op, origin('operation', op.id, classifyOperation())))
      continue
    }
    const everything = op.action === 'restore-everything'
    const row = op.resulting_sha ? git.rows.find((r) => r.sha === op.resulting_sha) : null
    const files = row
      ? { sha: op.resulting_sha, count: fileCount(row) }
      : everything && !op.resulting_sha
        ? { sha: null, count: 0 } // the files were already the backup's: only the database moved
        : { sha: op.resulting_sha, count: null }
    const target = String(op.target_sha ?? '').slice(0, 7)
    out.set(`operation:${op.id}`, {
      id: op.id,
      kind: 'operation',
      origin: origin('operation', op.id, classifyOperation()),
      actor: operationActor(op),
      executor: TRACY_AGENT,
      description: everything
        ? {
            // ADR 0024: "Restored everything to Backup N" — files and database.
            key: 'site-changes.restore-everything',
            params: {
              target,
              version: Number.isSafeInteger(op.scope?.version) ? op.scope.version : null,
              files: files.count,
              // The host's Before-restore backup: the way back from this restore (null on a row
              // settled before 03/10/2026, or a host that did not say).
              returnPoint: Number.isSafeInteger(op.scope?.beforeRestore) ? op.scope.beforeRestore : null
            },
            isRequestOnly: false
          }
        : op.action === 'reset'
          ? {
              // E6.5: "…back to Backup 2" when the commit is a backup point, as the Everything row says.
              key: 'site-changes.reset',
              params: { target, files: files.count, version: backupVersionOf(git, op.target_sha) },
              isRequestOnly: false
            }
          : { key: 'site-changes.undo', params: { target, files: files.count }, isRequestOnly: false },
      occurredAt: iso(op.created_at),
      detectedAt: null,
      timeBasis: 'occurred',
      recordedAt: iso(op.finished_at ?? op.created_at),
      effects: effectsOf({ files, fileHistory: ctx.fileHistory, gitRead: Boolean(row) || files.count === 0 })
        .effects,
      request: { state: 'none' },
      reversal: { state: 'not-applicable' },
      capabilities: capabilitiesOf({ files, ctx, undoable: false, notUndoableReason: 'restore' }),
      evidence: {
        operationId: op.id,
        ...(op.resulting_sha ? { commitSha: op.resulting_sha } : {}),
        ...(op.target_sha ? { targetSha: op.target_sha } : {}),
        ...(op.job_id ? { jobRef: String(op.job_id) } : {})
      }
    })
  }

  for (const k of page) {
    if (k.kind !== 'git' && k.kind !== 'outside-files') continue
    const key = `${k.kind}:${k.id}`
    if (out.has(key)) continue // an outside row Postgres already holds
    const g = ctx.gitOnly.get(k.id)
    if (g) out.set(key, gitItem(g, ctx))
  }
  return out
}

/**
 * A Sync to live, or its undo (`live-push.js`): the Owner sent Tracy's content changes to the live
 * site, or put back what that push overwrote. It changed the LIVE site, not this copy: no file, no
 * commit, nothing of it to undo from here (the push dialog has its own Undo). Counts only.
 */
function pushItem(op, og) {
  const undo = op.action === 'sync-to-live-undo'
  const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null)
  return {
    id: op.id,
    kind: 'operation',
    origin: og,
    actor: operationActor(op),
    executor: TRACY_AGENT,
    description: {
      key: undo ? 'site-changes.sync-to-live-undo' : 'site-changes.sync-to-live',
      params: {
        count: count(undo ? op.scope?.restored : op.scope?.pushed),
        conflicts: count(op.scope?.conflicts)
      },
      isRequestOnly: false
    },
    occurredAt: iso(op.created_at),
    detectedAt: null,
    timeBasis: 'occurred',
    recordedAt: iso(op.finished_at ?? op.created_at),
    // No file of the copy, and the changes are the live site's: nothing here is said as recorded.
    effects: effectsOf({ linked: false }).effects,
    request: { state: 'none' },
    reversal: { state: 'not-applicable' },
    capabilities: { canDiff: false, canUndoFiles: false, reasons: ['no-files'] },
    evidence: { operationId: op.id, ...(op.job_id ? { jobRef: String(op.job_id) } : {}) }
  }
}

/**
 * The file a deploy commit updated, read off its subject in Git's window (`site_outside` keeps the
 * tag, not the file); null when Git does not hold it — the description then names no component.
 */
function deployFileOf(git, sha) {
  const row = git.rows.find((r) => r.sha === sha)
  return row ? (classifyGitRow(row).deployFile ?? null) : null
}

/** A Git moment no row accounts for. */
function gitItem({ row: r, origin }, ctx) {
  const at = new Date(Number(r.at) * 1000).toISOString()
  const count = fileCount(r)
  const files = { sha: r.sha, count }
  const base = {
    id: r.sha,
    // outside@ commits read as the `site_outside` row they will become (see `readActivityV2`).
    kind: origin.cause !== undefined ? 'outside-files' : 'git',
    request: { state: 'none' },
    evidence: { commitSha: r.sha },
    effects: effectsOf({ files, fileHistory: ctx.fileHistory }).effects
  }
  if (origin.restore) {
    return {
      ...base,
      origin: { source: origin.source, evidence: origin.evidence },
      // Git records the committer's default identity, never who pressed the button (plan §2.2).
      actor: UNKNOWN_ACTOR('requester'),
      executor: TRACY_AGENT,
      description:
        origin.restore.mode === 'reset'
          ? {
              key: 'site-changes.reset',
              params: {
                target: origin.restore.target.slice(0, 7),
                files: count,
                version: backupVersionOf(ctx.git, origin.restore.target)
              },
              isRequestOnly: false
            }
          : {
              key: 'site-changes.undo',
              params: { target: origin.restore.target.slice(0, 7), files: count },
              isRequestOnly: false
            },
      occurredAt: at,
      detectedAt: null,
      timeBasis: 'occurred',
      reversal: { state: 'not-applicable' },
      capabilities: capabilitiesOf({ files, ctx, undoable: false, notUndoableReason: 'restore' }),
      evidence: { commitSha: r.sha, targetSha: origin.restore.target }
    }
  }
  if (origin.cause) {
    const detected = origin.cause === 'seal'
    return {
      ...base,
      origin: {
        source: origin.source,
        evidence: origin.evidence,
        ...(origin.service ? { service: origin.service } : {})
      },
      actor: origin.service ? SERVICE[origin.service] : UNKNOWN_ACTOR('executor'),
      description:
        origin.cause === 'deploy'
          ? describeDeploy({ tag: origin.deployTag ?? null, file: origin.deployFile ?? null, files: count })
          : origin.cause === 'housekeeping'
            ? { key: 'housekeeping', params: { files: count }, isRequestOnly: false }
            : { key: 'files.changed-source-unknown', params: { files: count }, isRequestOnly: false },
      occurredAt: detected ? null : at,
      detectedAt: detected ? at : null,
      timeBasis: detected ? 'detected' : 'occurred',
      reversal: { state: 'none' },
      capabilities: capabilitiesOf({ files, ctx, undoable: false, notUndoableReason: 'outside' })
    }
  }
  // A moment Tracy's agent (or a person) committed with no turn on record: who asked is unknown.
  const undone = ctx.undone.of(r.sha)
  const person = r.by?.kind === 'person'
  return {
    ...base,
    origin: { source: origin.source, evidence: origin.evidence },
    actor: UNKNOWN_ACTOR('requester'),
    ...(person
      ? { executor: { type: 'person', name: String(r.by.name ?? ''), role: 'executor' } }
      : { executor: TRACY_AGENT }),
    description: { key: 'files.changed', params: { files: count }, isRequestOnly: false },
    occurredAt: at,
    detectedAt: null,
    timeBasis: 'occurred',
    reversal: reversalOf(count > 0 ? [r.sha] : [], ctx, {
      content: false,
      settings: false,
      other: false,
      momentsComplete: true
    }),
    capabilities: capabilitiesOf({ files, ctx, undoable: !undone, notUndoableReason: 'undone' })
  }
}

function groupBy(list, key) {
  /** @type {Map<string, any[]>} */
  const map = new Map()
  for (const item of list) {
    const k = key(item)
    const bucket = map.get(k)
    if (bucket) bucket.push(item)
    else map.set(k, [item])
  }
  return map
}
