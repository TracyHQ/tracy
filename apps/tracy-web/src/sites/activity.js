/**
 * The Site changes tab's list (plan `tasks/todo-site-changes.md` §1, §5, P1): one row per CHAT TURN
 * of one person, with "outside Tracy" rows in between, newest first, one cursor.
 *
 *   GET /api/sites/:key/activity?cursor&limit=30&filter=all|chat|outside
 *     → {items, nextCursor, counts: {all, chat, outside}, coverage: {git, gitTruncated, since, cmsLog}}
 *
 * With `version=2` the same door answers Site changes V2 instead (`activity-v2.js`: one event per
 * row, a Source filter, Source counts, its own cursor). Without it — or with any other value — the
 * answer below is V1, unchanged.
 *
 * Row kinds:
 *   chat           a closed (or stale) turn that changed files or wrote content: who typed it, the
 *                  words, panel or comment, the Git moment it closed with, the writes of THAT turn
 *   unknown        writes whose turn has no record (a dsh that predates turn ids, a lost open)
 *   legacy         a Git moment no row accounts for: made before turns were recorded, by an old dsh,
 *                  or an undo/restore done from the tab (`restore`)
 *   outside-files  files changed outside Tracy, sealed into a moment (a look, a Tracy deploy)
 *   outside-cms    an edit a CMS admin reported (P2, `cms-log.js`)
 *
 * 🔒 A WRITE JOINS ITS TURN BY `turn_id` AND NOTHING ELSE. Two people typing at the same second
 * would otherwise swap each other's work. A write with no matching turn is `unknown`, never guessed.
 *
 * 🔒 NO RAW RECORD LEAVES. A write's `target` is `{kind, id, fields}` with field NAMES only; no
 * audit `detail`, no values (invariant 10).
 *
 * GIT IS READ ON EVERY PAGE, NOT ONLY THE LAST (a deliberate step away from plan §5, P1 journal):
 * an undo or a restore from this tab, a look that sealed files outside a turn, and a moment an old
 * dsh recorded leave a Git commit and no Postgres row. Read only at the end of the list, those land
 * at the bottom of a list that is otherwise newest first — an undo pressed a minute ago would show
 * under last month. One `webroot-history` job (one `git log`) per page keeps every row in its
 * place; a host that cannot answer leaves the Postgres rows and says so in `coverage.git`.
 *
 * `undo.allowed` follows the server's own rule (`/restore`, plan Q1): only a moment a turn made, with
 * files, not already undone. The server refuses the rest anyway; this only spares the button.
 */
import { json, normalizeSiteKey } from '../lib/http.js'
import { cacheOnly, GitPending, readGit } from './activity-git.js'
import {
  accountedForGit,
  attachFaces,
  cmsChangesById,
  commentRefs,
  compareKeys,
  countKinds,
  countUnseenV2,
  ensureSeen,
  FILTER_KINDS,
  markSeen,
  outsideBySha,
  pageKeys,
  RANK,
  turnsById,
  turnsSince,
  writesOfGroups,
  writesOfTurns
} from './activity-store.js'
import { decodeCursorV2, readActivityV2, V2_FILTERS } from './activity-v2.js'
import { cmsChangeItem, cmsLogCoverage, pullCmsLog } from './cms-log.js'

export { GitPending }

const LIST_DEFAULT = 30
const LIST_MAX = 100
/** How far ahead of the server's clock a `readAt` may be (a client's clock, a request in flight). */
const SEEN_AHEAD_MS = 60_000

/**
 * How old the site's CMS log may be before the badge door asks the host for a fresh pull. The sweep
 * pulls every active site every 5 minutes (`CMS_LOG_EVERY_MS`), so a wp-admin edit could sit unseen
 * for five minutes while the person is looking at the start screen; the card asks this door once a
 * minute while shown and on every return, so a pull a minute per site while someone looks is what
 * this buys. The cost is one `docker exec` of `cms-log.sh` in the site's container through the host:
 * measured 04/10/2026 on the badge stand (WordPress, log of 2 rows), 0.32 s median of 3 forced pulls.
 */
export const PULL_FRESH_MS = 60_000

/**
 * One page of the list.
 * @param {import('pg').Pool} pool
 * @param {{site_key: string, label: string, host: string, platform: string|null}} site
 * @param {{cursor?: string|null, limit?: number, filter?: 'all'|'chat'|'outside',
 *          runJob: (site: any, input: object, deadlineMs: number) => Promise<{ok: boolean, output?: string, reason?: string}>}} opts
 */
export async function readActivity(
  pool,
  site,
  { cursor = null, limit = LIST_DEFAULT, filter = 'all', runJob, canWriteFiles = true }
) {
  const after = cursor ? decodeCursor(cursor) : null
  const kinds = FILTER_KINDS[filter] ?? FILTER_KINDS.all
  const git = await readGit(site, runJob)
  const accounted = await accountedForGit(
    pool,
    site.site_key,
    git.rows.map((r) => r.turn).filter((t) => typeof t === 'string' && t)
  )
  const gitItems = gitOnlyItems(git.rows, accounted)
  const undone = undoneShorts(git.rows)
  const cache = cacheOnly(git)

  const [pgKeys, pgCounts, coverage, since] = await Promise.all([
    pageKeys(pool, site.site_key, { kinds, after, limit: limit + 1, cache }),
    countKinds(pool, site.site_key, cache),
    cmsLogCoverage(pool, site),
    turnsSince(pool, site.site_key)
  ])
  const gitKeys = gitItems
    .filter((i) => kinds.includes(i.kind) && (!after || compareKeys(keyOf(i), after) > 0))
    .map(keyOf)
  const merged = [...pgKeys, ...gitKeys].sort(compareKeys)
  const page = merged.slice(0, limit)
  const more = merged.length > limit

  const byId = await hydrate(pool, site.site_key, page)
  for (const i of gitItems) byId.set(`${i.kind}:${i.id}`, i)
  const items = page.map((k) => byId.get(`${k.kind}:${k.id}`)).filter(Boolean)
  // Every person a page names (`personOf` for a turn or its writes, `actorOf` for a Git trailer)
  // gets the face `/api/team` gives their account, or null: one query for the whole page.
  await attachFaces(
    pool,
    items.map((i) => i.by)
  )
  for (const item of items) {
    recount(item, git)
    markUndone(item, undone)
    // A seat whose role may not write files (an editor, by default) is refused by `/restore`; its
    // rows say so up front, and the tab shows no Undo at all (dev round 02/10).
    if (!canWriteFiles && item.undo) item.undo = { allowed: false, reason: 'forbidden' }
  }

  // "N chat turns" counts turns an agent ran. An undo or a reset pressed in this tab (`restore:`)
  // is a row of the list, under the chat filter beside the turn it took back, but no one chatted:
  // it counts in `all` only. (A baseline is never a row; housekeeping is an outside row.)
  const counts = { ...pgCounts }
  let restores = 0
  for (const i of gitItems) {
    if (i.kind === 'legacy' && i.restore) restores += 1
    else counts[i.kind] = (counts[i.kind] ?? 0) + 1
  }
  const chat = (counts.chat ?? 0) + (counts.unknown ?? 0) + (counts.legacy ?? 0)
  const outside = (counts['outside-files'] ?? 0) + (counts['outside-cms'] ?? 0)
  const last = page[page.length - 1]
  return {
    items,
    nextCursor: more && last ? encodeCursor(last) : null,
    counts: { all: chat + outside + restores, chat, outside },
    coverage: {
      git: git.state,
      gitTruncated: git.state === 'read' ? git.truncated : null,
      since,
      // False on EmDash: its code is the site's own `/app` volume and its data and uploads sit on
      // the private root, so the webroot repo the host keeps for every site holds no file at all.
      // The tab says so rather than staying silent (dev round 02/10).
      fileHistory: site.platform !== 'emdash',
      cmsLog: coverage.cmsLog
    }
  }
}

/**
 * A row Postgres counted when it was recorded may hold files the exclude list names today: its
 * count becomes what Git's reader counts now (the reader already leaves those files out), so the
 * row and the list under it agree. A turn sums its moments by trailer. Outside Git's window, or
 * when Git was not read, the recorded count stands. Housekeeping keeps its own count: those files
 * are what it is about.
 */
function recount(item, git) {
  if (!item.files || (item.kind !== 'chat' && item.kind !== 'outside-files')) return
  if (item.kind === 'outside-files' && item.cause === 'housekeeping') return
  const fileCount = (r) =>
    typeof r.files === 'number' ? r.files : Array.isArray(r.files) ? r.files.length : 0
  let count = null
  if (item.kind === 'chat') {
    const mine = git.rows.filter((r) => r.turn === item.id)
    if (mine.length || git.hidden.some((h) => h.turn === item.id))
      count = mine.reduce((sum, r) => sum + fileCount(r), 0)
  }
  if (count === null) {
    const row = git.rows.find((r) => r.sha === item.files.sha)
    if (row) count = fileCount(row)
    else if (git.hidden.some((h) => h.sha === item.files.sha)) count = 0
  }
  if (count === null || count === item.files.count) return
  if (count > 0) {
    item.files = { ...item.files, count }
    return
  }
  // Every file was a cache, but the turn also wrote content (else it would not be on the list).
  item.files = null
  if (item.kind === 'chat') item.undo = { allowed: false, reason: 'no-files' }
}

/**
 * Git moments no Postgres row accounts for, as items. A moment is accounted for when a turn closed
 * with it, an outside row sealed it, or its `Tracy-Turn` trailer names a turn that has a record.
 */
function gitOnlyItems(rows, accounted) {
  const items = []
  for (const r of rows) {
    if (accounted.shas.has(r.sha)) continue
    if (typeof r.turn === 'string' && accounted.turns.has(r.turn)) continue
    const at = new Date(Number(r.at) * 1000).toISOString()
    const count = typeof r.files === 'number' ? r.files : Array.isArray(r.files) ? r.files.length : 0
    if (r.by?.kind === 'outside' || r.kind === 'outside') {
      const title = String(r.title ?? '')
      const deploy = /^deploy\s+(\S+)/.exec(title)
      items.push({
        kind: 'outside-files',
        id: r.sha,
        at,
        cause: deploy ? 'deploy' : /housekeeping/i.test(title) ? 'housekeeping' : 'seal',
        deployTag: deploy ? deploy[1] : null,
        files: { sha: r.sha, count },
        undo: { allowed: false, reason: 'outside' }
      })
      continue
    }
    const title = String(r.title ?? '')
    const restore = title.startsWith('restore: undo ')
      ? 'undo'
      : title.startsWith('restore: ')
        ? 'reset'
        : null
    items.push({
      kind: 'legacy',
      id: r.sha,
      at,
      // A restore commit carries git's default identity, not the person who pressed the button.
      by: restore ? null : actorOf(r.by),
      title,
      restore,
      files: count > 0 ? { sha: r.sha, count } : null,
      undo: restore
        ? { allowed: false, reason: 'restore' }
        : count > 0
          ? { allowed: true }
          : { allowed: false, reason: 'no-files' }
    })
  }
  return items
}

function actorOf(by) {
  if (by?.kind === 'person')
    return { kind: 'person', name: String(by.name ?? ''), email: String(by.email ?? '') }
  return { kind: 'agent' }
}

/** The short shas a later `restore: undo <sha> (…)` commit names — the moments already taken back. */
function undoneShorts(rows) {
  const shorts = []
  for (const r of rows) {
    const hit = /^restore: undo ([0-9a-f]{7,64})\b/.exec(String(r.title ?? ''))
    if (hit?.[1]) shorts.push(hit[1])
  }
  return shorts
}

function markUndone(item, shorts) {
  const sha = item.files?.sha
  if (!sha || (item.kind !== 'chat' && item.kind !== 'legacy')) return
  if (!shorts.some((s) => sha.startsWith(s))) return
  item.undone = true
  item.undo = { allowed: false, reason: 'undone' }
}

const keyOf = (i) => ({
  kind: i.kind,
  rank: RANK[i.kind],
  id: i.id,
  atUs: BigInt(Date.parse(i.at)) * 1000n
})

/** The page's Postgres rows, read in full by kind: `kind:id` → item. */
async function hydrate(pool, siteKey, page) {
  const of = (kind) => page.filter((k) => k.kind === kind).map((k) => k.id)
  const [turns, turnWrites, groupWrites, outsides, cms] = await Promise.all([
    turnsById(pool, siteKey, of('chat')),
    writesOfTurns(pool, siteKey, of('chat')),
    writesOfGroups(pool, siteKey, of('unknown')),
    outsideBySha(pool, siteKey, of('outside-files')),
    cmsChangesById(pool, siteKey, of('outside-cms'))
  ])
  const refs = await commentRefs(
    pool,
    siteKey,
    turns.filter((t) => t.source === 'comment')
  )
  const refOf = new Map(refs.map((r) => [r.turn_id, r]))
  const writesBy = groupBy([...turnWrites, ...groupWrites], (w) => w.group_id)

  /** @type {Map<string, any>} */
  const byId = new Map()
  for (const t of turns) {
    const files = t.files > 0 && t.head_sha ? { sha: t.head_sha, count: Number(t.files) } : null
    const ref = refOf.get(t.turn_id) ?? null
    byId.set(`chat:${t.turn_id}`, {
      kind: 'chat',
      id: t.turn_id,
      at: t.opened_at.toISOString(),
      endedAt: t.closed_at ? t.closed_at.toISOString() : null,
      state: t.state === 'stale' || t.overdue ? 'stale' : 'closed',
      by: personOf(t.actor, t.display_name),
      title: String(t.title ?? ''),
      source: t.source === 'comment' ? 'comment' : 'panel',
      commentRef: ref ? { n: Number(ref.n), url: String(ref.url) } : null,
      files,
      writes: (writesBy.get(t.turn_id) ?? []).map(writeOf),
      flags: {
        unsealedStart: t.unsealed_start === true,
        concurrent: t.concurrent === true,
        steered: t.steered === true
      },
      undo: files ? { allowed: true } : { allowed: false, reason: 'no-files' }
    })
  }
  for (const [id, writes] of writesBy) {
    if (byId.has(`chat:${id}`) || !of('unknown').includes(id)) continue
    const first = writes[0]
    byId.set(`unknown:${id}`, {
      kind: 'unknown',
      id,
      at: first.at.toISOString(),
      by: first.actor ? personOf(first.actor, first.display_name) : null,
      files: null,
      writes: writes.map(writeOf),
      undo: { allowed: false, reason: 'no-files' }
    })
  }
  for (const o of outsides) {
    byId.set(`outside-files:${o.sha}`, {
      kind: 'outside-files',
      id: o.sha,
      at: o.at.toISOString(),
      cause: ['deploy', 'housekeeping'].includes(o.cause) ? o.cause : 'seal',
      deployTag: o.deploy_tag ?? null,
      files: { sha: o.sha, count: Array.isArray(o.files) ? o.files.length : Number(o.files ?? 0) },
      undo: { allowed: false, reason: 'outside' }
    })
  }
  for (const c of cms) {
    const item = cmsChangeItem(c)
    byId.set(`outside-cms:${item.id}`, { ...item, undo: { allowed: false, reason: 'outside' } })
  }
  return byId
}

function personOf(email, displayName) {
  const mail = String(email ?? '')
  return { name: displayName || mail.split('@')[0] || mail, email: mail }
}

/** One write as the tab shows it: action, outcome, how it arrived, and the target by NAME only. */
function writeOf(w) {
  return {
    action: String(w.action),
    outcome: w.outcome === 'ok' ? 'ok' : 'unknown',
    via: String(w.via ?? 'apply'),
    at: w.at.toISOString(),
    target: targetOf(w.target)
  }
}

function targetOf(raw) {
  if (!raw || typeof raw !== 'object') return null
  const kind = typeof raw.kind === 'string' ? raw.kind.slice(0, 40) : null
  const id = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id).slice(0, 80) : null
  const fields = Array.isArray(raw.fields)
    ? raw.fields
        .filter((f) => typeof f === 'string')
        .map((f) => f.slice(0, 60))
        .slice(0, 20)
    : []
  if (!kind && !id && !fields.length) return null
  return { kind, id, fields }
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

function encodeCursor(k) {
  return Buffer.from(JSON.stringify([k.atUs.toString(), k.rank, k.id])).toString('base64url')
}

/** `{atUs, rank, id}` from a cursor this door wrote, or null. */
function decodeCursor(cursor) {
  try {
    const [atUs, rank, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof atUs !== 'string' || !/^[0-9]{1,19}$/.test(atUs)) return null
    if (!Number.isInteger(rank) || typeof id !== 'string' || !id || id.length > 300) return null
    return { atUs: BigInt(atUs), rank, id }
  } catch {
    return null
  }
}

/**
 * The door. Mounted from `route.js` with its `requireGrant` (a live seat on the site; every seat
 * reads every row — 01/10, plan §11 question 2) and its `runSiteJob`.
 */
/**
 * @param {{pool: any, requireGrant: Function, siteByKey: Function, runJob: Function,
 *          reconcileOperations?: (site: any) => Promise<unknown>,
 *          mayWriteFiles?: (auth: any, siteKey: string) => Promise<boolean>}} deps
 *   `mayWriteFiles`: the `code` toolset of the seat's role, the rule `/restore` refuses by.
 *   `reconcileOperations`: route.js's closure over `operations.js` `reconcilePending` (contract D3);
 *   without it a V2 read lists unsettled undos as Git commits, nothing more.
 */
export function mountActivity(
  app,
  { pool, requireGrant, siteByKey, runJob, reconcileOperations, mayWriteFiles = async () => true }
) {
  /** The seat and the site behind a badge door, or the answer that refuses it. */
  async function badgeGrant(c) {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return { error: auth.error }
    const site = await siteByKey(siteKey)
    if (!site) return { error: json(c, { code: 'SITE_UNKNOWN' }, 404) }
    const accountId = auth.account?.id ?? null
    if (!accountId) return { error: json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403) }
    return { site, auth, accountId }
  }

  // The badge on the start screen's Site changes card (plan `tasks/todo-site-changes-badge-count.md`
  // §2): rows of the badge Sources recorded after this person's watermark that are not their own work
  // through Tracy. Postgres only — no Git read, no seal job: the start screen asks on every return
  // into view, and a page of history is not this door's to build. A Git-only moment nobody recorded
  // yet is therefore not counted until a read of the list seals it (SAY ONLY WHAT WAS RECORDED).
  // No watermark yet → it is written at now and the answer is 0: a person who joins a site is not
  // told they missed its whole history.
  // The CMS log pulls the badge door started: which sites have one out, and when each site was last
  // asked (the host's answer, success or not, is not waited for, so the guard is this clock, not
  // `last_pulled_at` alone — a failing host would otherwise be asked on every return to the start screen).
  /** @type {Map<string, Promise<unknown>>} */
  const pullsInFlight = new Map()
  /** @type {Map<string, number>} */
  const pullAskedAt = new Map()
  /**
   * Start a pull for `site` and do not wait for it: the door answers from what is recorded now, the
   * NEXT ask (a minute later, or on focus) sees the rows. One pull per site at a time, one per
   * `PULL_FRESH_MS` per site. Errors are said in the log, as `/turn`'s pull says its own.
   * @param {{site_key: string}} site
   * @param {number} nowMs
   * @returns {boolean} whether a pull was started
   */
  function freshenCmsLog(site, nowMs) {
    const key = site.site_key
    if (pullsInFlight.has(key)) return false
    const asked = pullAskedAt.get(key)
    if (asked !== undefined && nowMs - asked < PULL_FRESH_MS) return false
    pullAskedAt.set(key, nowMs)
    const pull = pullCmsLog(pool, site, { runJob })
      .then((result) => {
        if (result.error)
          console.warn(`[tracy-web] cms log pull for the badge failed on ${key}: ${result.error}`)
      })
      .catch((error) => {
        console.warn(`[tracy-web] cms log pull for the badge failed on ${key}: ${error?.message ?? error}`)
      })
      .finally(() => pullsInFlight.delete(key))
    pullsInFlight.set(key, pull)
    return true
  }
  /** Every pull the badge door has out, settled — for a test that must not leak one into the next. */
  const awaitBadgePulls = () => Promise.all(pullsInFlight.values())

  app.get('/api/sites/:key/activity/unseen', async (c) => {
    c.header('cache-control', 'private, no-store')
    const g = await badgeGrant(c)
    if (g.error) return g.error
    const now = new Date()
    const { seenAt, created } = await ensureSeen(pool, g.site.site_key, g.accountId, now)
    const [count, cursor] = await Promise.all([
      created ? 0 : countUnseenV2(pool, g.site.site_key, { since: seenAt, viewer: g.auth.email ?? null }),
      // Judged on the database clock that stamped `last_pulled_at`, as the CMS log sweep judges it.
      pool.query(
        `select last_error,
                last_pulled_at is null or last_pulled_at < now() - ($2::int * interval '1 millisecond') as stale
           from site_cms_log_cursor where site_key = $1`,
        [g.site.site_key, PULL_FRESH_MS]
      )
    ])
    // A CMS log older than a minute (or never pulled): ask the host for a fresh one, without waiting.
    const stale = cursor.rows.every((r) => r.stale)
    const pulling = stale ? freshenCmsLog(g.site, now.getTime()) : false
    return json(c, {
      count,
      since: seenAt,
      readAt: now.toISOString(),
      // The CMS log collector is in error: rows may be missing, so the count is a floor, not 0.
      complete: !cursor.rows.some((r) => r.last_error),
      // A fresh pull of the CMS log was just started for this ask: the caller may ask again in a
      // few seconds to see what it brought, instead of waiting for its next clock tick.
      pulling
    })
  })

  // The tab drew the list: move the watermark to the moment that list was read (`readAt` of the V2
  // answer), never backwards, and never ahead of now — a clock that is wrong would hide changes
  // for as long as it is ahead.
  app.put('/api/sites/:key/activity/seen', async (c) => {
    c.header('cache-control', 'private, no-store')
    const g = await badgeGrant(c)
    if (g.error) return g.error
    const body = await c.req.json().catch(() => null)
    const readAt = body && typeof body.readAt === 'string' ? Date.parse(body.readAt) : Number.NaN
    if (!Number.isFinite(readAt) || readAt > Date.now() + SEEN_AHEAD_MS)
      return json(c, { code: 'INVALID_READ_AT' }, 400)
    const seenAt = await markSeen(pool, g.site.site_key, g.accountId, new Date(readAt))
    return json(c, { seenAt })
  })

  app.get('/api/sites/:key/activity', async (c) => {
    c.header('cache-control', 'private, no-store')
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    // V2 (plan `tasks/todo-site-changes-v2.md` §4.1): only an explicit `version=2` opts in. Any
    // other value, or none, is the V1 answer below, byte for byte — a V2 client probes with
    // `version=2&filter=all`, which an older server ignores, and reads `schemaVersion` back.
    if (c.req.query('version') === '2') return readV2(c, site, auth)
    const rawCursor = c.req.query('cursor')
    if (rawCursor && !decodeCursor(rawCursor)) return json(c, { code: 'INVALID_CURSOR' }, 400)
    const rawLimit = c.req.query('limit')
    const limit = rawLimit === undefined ? LIST_DEFAULT : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX)
      return json(c, { code: 'INVALID_LIMIT' }, 400)
    const filter = c.req.query('filter') ?? 'all'
    if (!Object.hasOwn(FILTER_KINDS, filter)) return json(c, { code: 'INVALID_FILTER' }, 400)
    try {
      return json(
        c,
        await readActivity(pool, site, {
          cursor: rawCursor ?? null,
          limit,
          filter: /** @type {'all'|'chat'|'outside'} */ (filter),
          runJob,
          canWriteFiles: await mayWriteFiles(auth, siteKey)
        })
      )
    } catch (error) {
      // The host is building this site's history for the first time; the tab asks again.
      if (error instanceof GitPending) return json(c, { code: 'FLEET_JOB_PENDING' }, 202)
      throw error
    }
  })

  /** The V2 answer: Source filter, cursor bound to version + filter, Source counts. */
  async function readV2(c, site, auth) {
    const filter = c.req.query('filter') ?? 'all'
    // `chat` is a V2 Source too; only V1's `outside` (and anything unknown) is refused here.
    if (!V2_FILTERS.includes(filter)) return json(c, { code: 'INVALID_FILTER' }, 400)
    const rawLimit = c.req.query('limit')
    const limit = rawLimit === undefined ? LIST_DEFAULT : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX)
      return json(c, { code: 'INVALID_LIMIT' }, 400)
    const rawCursor = c.req.query('cursor')
    if (rawCursor) {
      const decoded = decodeCursorV2(rawCursor)
      if (!decoded.ok) return json(c, { code: 'INVALID_CURSOR', reason: decoded.reason }, 400)
      if (decoded.cursor.filter !== filter)
        return json(c, { code: 'INVALID_CURSOR', reason: 'filter-mismatch' }, 400)
    }
    try {
      return json(
        c,
        await readActivityV2(pool, site, {
          cursor: rawCursor ?? null,
          limit,
          filter,
          runJob,
          reconcile: reconcileOperations,
          canWriteFiles: await mayWriteFiles(auth, site.site_key),
          viewer: typeof auth.email === 'string' ? auth.email : null,
          viewerAccountId: auth.account?.id ?? null
        })
      )
    } catch (error) {
      if (error instanceof GitPending) return json(c, { code: 'FLEET_JOB_PENDING' }, 202)
      throw error
    }
  }
  return { awaitBadgePulls }
}
