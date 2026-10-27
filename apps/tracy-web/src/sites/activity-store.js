/**
 * The Postgres half of the Site changes list (`activity.js`): which rows exist, in one order, and
 * what each row holds. Four tables, read only here for this purpose (plan `tasks/todo-site-changes.md` §5):
 *
 *   site_turn         one chat turn of one person — a `chat` row when it changed files or wrote
 *   site_write        content written through the Apply door or reported on `/changed` — joined to
 *                     its turn by `turn_id` ONLY; a write whose turn has no record is an `unknown` row
 *   site_outside      files sealed outside Tracy (a look, a deploy, housekeeping) — `outside-files`
 *   site_cms_change   an edit a CMS admin reported (P2) — `outside-cms`
 *
 * 🔒 ONE ORDER FOR ALL FOUR: `(at_us, rank, id)` descending, `at_us` in whole microseconds so two
 * rows stamped in the same millisecond still order — and page — the same way every time. `rank`
 * breaks a tie between kinds; `id` breaks the rest.
 *
 * 🔒 NO `audit`. The audit table has no index but its key and must not get one in a migration
 * (`023-site-write-lease.sql`); every row here comes from a table of its own.
 *
 * The first three tables come from the Q2 line (`046-site-turn.sql`).
 */
import { personFace } from '../lib/person-face.js'
import { SETUP_MOMENT_VIA } from './setup-moment.js'
import {
  BADGE_SOURCES,
  badgeRowSql,
  FOLDED_SEALS_OF_WRITES_SQL,
  FOLDED_SEALS_SQL,
  notTracyOwnCmsDelete,
  V2_SOURCE_PARAMS,
  V2_SOURCES_SQL,
  writeGroupSql,
  WP_CRON_PRODUCERS
} from './activity-source.js'

/** Tie-break between kinds at the same microsecond: a turn sits above what it caused. */
export const RANK = { chat: 5, legacy: 4, unknown: 3, 'outside-files': 2, 'outside-cms': 1 }

/** Which kinds each filter shows. */
export const FILTER_KINDS = {
  all: ['chat', 'unknown', 'legacy', 'outside-files', 'outside-cms'],
  chat: ['chat', 'unknown', 'legacy'],
  outside: ['outside-files', 'outside-cms']
}

/** A turn left `open` this long never closed (dsh died, the close was lost): it shows as `stale`. */
const STALE_AFTER = '30 minutes'

/** The rows of one query. */
const rowsOf = async (run) => (await run()).rows

// The four sources as `(kind, rank, id, at)`. A chat turn counts once it is closed or stale and
// changed something (files, or a write that was not refused); writes whose turn has no row, or
// none at all, group by turn id, else by conversation, else stand alone.
//
// `$2`/`$3` (Q4): the turns whose every Git moment held only files the exclude list names today, and
// the commits that did — read from the host (`hidden`), since a row recorded before a CMS cache
// joined the list still counts it. Such a turn counts only if it wrote content; such a seal is not
// a row. Housekeeping keeps its row: it is the record of Tracy taking those files out.
const TURN_SOURCES = `
  select 'chat'::text as kind, ${RANK.chat} as rank, t.turn_id as id, t.opened_at as at
    from site_turn t
   where t.site_key = $1
     and (t.state in ('closed', 'stale') or (t.state = 'open' and t.opened_at < now() - interval '${STALE_AFTER}'))
     and ((t.files > 0 and not t.turn_id = any($2::text[])) or exists (select 1 from site_write w
                                  where w.site_key = t.site_key and w.turn_id = t.turn_id and w.outcome <> 'refused'))
  union all
  select 'unknown', ${RANK.unknown}, g.id, min(g.at)
    from (select coalesce('turn:' || w.turn_id, 'session:' || w.session_id, 'write:' || w.id::text) as id, w.at
            from site_write w
           where w.site_key = $1 and w.outcome <> 'refused'
             and (w.turn_id is null or not exists (select 1 from site_turn t where t.turn_id = w.turn_id))) g
   group by g.id
  union all
  select 'outside-files', ${RANK['outside-files']}, o.sha, o.at from site_outside o
   where o.site_key = $1 and (o.cause = 'housekeeping' or not o.sha = any($3::text[]))`
const CMS_SOURCE = `
  select 'outside-cms'::text as kind, ${RANK['outside-cms']} as rank, c.source || ':' || c.cursor_key as id,
         c.occurred_at as at
    from site_cms_change c where c.site_key = $1 and ${notTracyOwnCmsDelete('c')}`

/**
 * @typedef {{turns: string[], shas: string[]}} CacheOnly
 *   What the host's reader says held nothing but excluded files (Q4): turn ids, and commit shas.
 */
/** @type {CacheOnly} */
export const NO_CACHE = Object.freeze({ turns: [], shas: [] })

const keyed = (sources) => `
  select kind, rank, id, (extract(epoch from at) * 1000000)::bigint as at_us
    from (${sources}) s`

/**
 * One page of row keys, newest first: at most `limit` rows of `kinds` strictly before `after`.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {{kinds: string[], after: {atUs: bigint, rank: number, id: string}|null, limit: number,
 *          cache?: CacheOnly}} q
 * @returns {Promise<{kind: string, rank: number, id: string, atUs: bigint}[]>}
 */
export async function pageKeys(pool, siteKey, { kinds, after, limit, cache = NO_CACHE }) {
  // `$1` is the site in both sources; TURN_SOURCES also reads `$2`/`$3`, so the page's own
  // parameters are numbered after whatever the source took.
  const run = (sources, extra) => {
    const p = (i) => `$${2 + extra.length + i}`
    return pool.query(
      `select * from (${keyed(sources)}) k
        where k.kind = any(${p(0)}::text[])
          and (${p(1)}::bigint is null or (k.at_us, k.rank, k.id) < (${p(1)}::bigint, ${p(2)}::int, ${p(3)}::text))
        order by k.at_us desc, k.rank desc, k.id desc
        limit ${p(4)}`,
      [
        siteKey,
        ...extra,
        kinds,
        after?.atUs?.toString() ?? null,
        after?.rank ?? null,
        after?.id ?? null,
        limit
      ]
    )
  }
  const [turns, cms] = await Promise.all([
    rowsOf(() => run(TURN_SOURCES, [cache.turns, cache.shas])),
    run(CMS_SOURCE, []).then((r) => r.rows)
  ])
  return [...turns, ...cms]
    .map((r) => ({ kind: r.kind, rank: Number(r.rank), id: r.id, atUs: BigInt(r.at_us) }))
    .sort(compareKeys)
    .slice(0, limit)
}

/** Newest first: the order every page is cut in. */
export function compareKeys(a, b) {
  if (a.atUs !== b.atUs) return a.atUs > b.atUs ? -1 : 1
  if (a.rank !== b.rank) return b.rank - a.rank
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0
}

/**
 * How many rows each kind has in all, regardless of page or filter.
 * @param {CacheOnly} [cache]
 * @returns {Promise<Record<string, number>>}
 */
export async function countKinds(pool, siteKey, cache = NO_CACHE) {
  const run = (sources, extra) =>
    pool.query(`select kind, count(*)::int as n from (${sources}) s group by kind`, [siteKey, ...extra])
  const [turns, cms] = await Promise.all([
    rowsOf(() => run(TURN_SOURCES, [cache.turns, cache.shas])),
    run(CMS_SOURCE, []).then((r) => r.rows)
  ])
  /** @type {Record<string, number>} */
  const counts = {}
  for (const r of [...turns, ...cms]) counts[r.kind] = (counts[r.kind] ?? 0) + Number(r.n)
  return counts
}

/** The chat turns behind `ids`, with the typer's display name. */
export function turnsById(pool, siteKey, ids) {
  if (!ids.length) return Promise.resolve([])
  return rowsOf(() =>
    pool.query(
      `select t.*, a.display_name,
              (t.state = 'open' and t.opened_at < now() - interval '${STALE_AFTER}') as overdue
         from site_turn t left join account a on a.email = lower(t.actor)
        where t.site_key = $1 and t.turn_id = any($2::text[])`,
      [siteKey, ids]
    )
  )
}

/** Writes of the chat turns `turnIds`, oldest first. Refused writes changed nothing: left out. */
export function writesOfTurns(pool, siteKey, turnIds) {
  if (!turnIds.length) return Promise.resolve([])
  return rowsOf(() =>
    pool.query(
      `select turn_id as group_id, at, actor, action, outcome, target, via
         from site_write
        where site_key = $1 and turn_id = any($2::text[]) and outcome <> 'refused'
        order by at, id`,
      [siteKey, turnIds]
    )
  )
}

/** Writes of the `unknown` groups `groupIds` (the ids `pageKeys` gave them), oldest first. */
export function writesOfGroups(pool, siteKey, groupIds) {
  if (!groupIds.length) return Promise.resolve([])
  return rowsOf(() =>
    pool.query(
      `select g.group_id, g.at, g.actor, g.action, g.outcome, g.target, g.via, a.display_name
         from (select coalesce('turn:' || w.turn_id, 'session:' || w.session_id, 'write:' || w.id::text) as group_id,
                      w.id, w.at, w.actor, w.action, w.outcome, w.target, w.via
                 from site_write w
                where w.site_key = $1 and w.outcome <> 'refused') g
         left join account a on a.email = lower(g.actor)
        where g.group_id = any($2::text[])
        order by g.at, g.id`,
      [siteKey, groupIds]
    )
  )
}

/** The outside rows behind `shas`. */
export function outsideBySha(pool, siteKey, shas) {
  if (!shas.length) return Promise.resolve([])
  return rowsOf(() =>
    pool.query(`select * from site_outside where site_key = $1 and sha = any($2::text[])`, [siteKey, shas])
  )
}

/** The CMS admin edits behind `ids` (`<source>:<cursor_key>`). */
export async function cmsChangesById(pool, siteKey, ids) {
  if (!ids.length) return []
  const { rows } = await pool.query(
    `select * from site_cms_change where site_key = $1 and source || ':' || cursor_key = any($2::text[])`,
    [siteKey, ids]
  )
  return rows
}

/**
 * The folded seals (`notFoldedSeal`) that ride on these CMS rows (`<source>:<cursor_key>` ids), as
 * `row_key → {sha, files}`: the files a plugin update or an upload wrote, shown on its own row.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string[]} ids
 * @returns {Promise<Map<string, {sha: string, files: number}>>}
 */
export async function foldedSealsOf(pool, siteKey, ids) {
  /** @type {Map<string, {sha: string, files: number}>} */
  const out = new Map()
  if (!ids.length) return out
  const { rows } = await pool.query(FOLDED_SEALS_SQL, [siteKey, [...WP_CRON_PRODUCERS], ids])
  for (const r of rows) out.set(r.row_key, { sha: r.sha, files: Number(r.files) })
  return out
}

/**
 * The folded seals that ride on these write groups (V2 `writes` row ids): the files a design system
 * apply's own job wrote (`dsWriteExplainsPathSql`), shown on the apply's row, as `row_key → {sha, files}`.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string[]} ids
 * @returns {Promise<Map<string, {sha: string, files: number}>>}
 */
export async function foldedSealsOfWrites(pool, siteKey, ids) {
  /** @type {Map<string, {sha: string, files: number}>} */
  const out = new Map()
  if (!ids.length) return out
  const { rows } = await pool.query(FOLDED_SEALS_OF_WRITES_SQL, [siteKey, [...WP_CRON_PRODUCERS], ids])
  for (const r of rows) out.set(r.row_key, { sha: r.sha, files: Number(r.files) })
  return out
}

/**
 * The comment each comment turn came from, by `(site_key, session_id, n)`: `n` is the number the host
 * read off the turn's own comment block (`site_turn.comment_ns`). A turn recorded by a dsh that sent
 * no number falls back to the request of the SAME conversation whose words are the turn's words —
 * never to a time, never to `rpc_id` (that is dsh's prompt id, not the Browser tab's request id).
 * Answers `{turn_id, n, url}`, the lowest number first when a turn answered several.
 * @param {{turn_id: string, session_id: string, title: string, comment_ns: number[] | null}[]} turns
 */
export async function commentRefs(pool, siteKey, turns) {
  if (!turns.length) return []
  const { rows } = await pool.query(
    `select distinct on (q.turn_id) q.turn_id, r.n, r.url
       from unnest($2::text[], $3::text[], $4::text[], $5::text[]) as q(turn_id, session_id, title, ns)
       join site_request r
         on r.site_key = $1 and r.session_id = q.session_id
        and (case when q.ns is null then r.text = q.title
                  else r.n = any(q.ns::int[]) end)
      order by q.turn_id, r.n`,
    [
      siteKey,
      turns.map((t) => t.turn_id),
      turns.map((t) => t.session_id),
      turns.map((t) => t.title),
      turns.map((t) =>
        Array.isArray(t.comment_ns) && t.comment_ns.length ? `{${t.comment_ns.join(',')}}` : null
      )
    ]
  )
  return rows
}

/**
 * What the Postgres rows already account for among Git's moments: the moment each turn closed with,
 * every sealed outside moment, the moment each Tracy setup run recorded (`setup-moment.js`), which of
 * the `turnIds` a Git trailer names have a turn record, and which setup runs the site has — a setup
 * moment the run did not hear back from is known by its trailer alone (`setupRuns`).
 * @param {string[]} trailerTurns
 */
export async function accountedForGit(pool, siteKey, trailerTurns) {
  const [heads, sealed, known, setups] = await Promise.all([
    rowsOf(() =>
      pool.query(
        `select head_sha from site_turn where site_key = $1 and files > 0 and head_sha is not null`,
        [siteKey]
      )
    ),
    rowsOf(() => pool.query(`select sha from site_outside where site_key = $1`, [siteKey])),
    trailerTurns.length
      ? rowsOf(() =>
          pool.query(`select turn_id from site_turn where site_key = $1 and turn_id = any($2::text[])`, [
            siteKey,
            trailerTurns
          ])
        )
      : Promise.resolve([]),
    rowsOf(() =>
      pool.query(
        `select distinct origin_ref as run, case when via = $2 then target->>'sha' end as sha
           from site_write where site_key = $1 and origin = 'setup' and origin_ref is not null`,
        [siteKey, SETUP_MOMENT_VIA]
      )
    ).catch((error) => {
      // A database from before `094-site-write-origin.sql` (a migration test's V1-shaped data) has no setup run.
      if (error?.code === '42703') return []
      throw error
    })
  ])
  return {
    shas: new Set([
      ...heads.map((r) => r.head_sha),
      ...sealed.map((r) => r.sha),
      ...setups.map((r) => r.sha).filter(Boolean)
    ]),
    turns: new Set(known.map((r) => r.turn_id)),
    setupRuns: new Set(setups.map((r) => r.run))
  }
}

/**
 * The face (`lib/person-face.js`) of each Tracy account behind `emails`, read in ONE query for a
 * whole page, keyed by lower-case email. An email no account holds (a Git identity from outside
 * Tracy, a seat since deleted) is simply absent: the row says it has no face, never a guessed one.
 * @param {Array<string|null|undefined>} emails
 * @returns {Promise<Map<string, {initial: string, color: string, avatarUrl: string|null}>>}
 */
export async function facesByEmail(pool, emails) {
  const wanted = [...new Set(emails.filter((e) => typeof e === 'string' && e).map((e) => e.toLowerCase()))]
  if (!wanted.length) return new Map()
  const rows = await rowsOf(() =>
    pool.query('select id, email, display_name, avatar_url from account where email = any($1::text[])', [
      wanted
    ])
  )
  return new Map(rows.map((r) => [r.email, personFace(r)]))
}

/**
 * Give every person in `actors` their `face`, in place: a `by` that names a person by email — the
 * host's `{kind: 'person', name, email}` (a Git trailer, Create a backup) or Site changes' own
 * `{name, email}` — gets the face of the Tracy account behind that email (`facesByEmail`, one
 * query for all of them), else `face: null`. Anything else (`agent`, `outside`, a missing `by`, a
 * row that is not an object) is left as it is. The other fields of `by` are unchanged.
 * @param {any[]} actors
 */
export async function attachFaces(pool, actors) {
  const isPerson = (by) =>
    by !== null && typeof by === 'object' && (by.kind === 'person' || typeof by.email === 'string')
  const people = actors.filter(isPerson)
  if (!people.length) return
  const email = (by) => (typeof by.email === 'string' && by.email ? by.email.toLowerCase() : null)
  const faces = await facesByEmail(pool, people.map(email))
  for (const by of people) by.face = faces.get(email(by)) ?? null
}

/** When this site's first turn record opened: the day Site changes began naming who typed what. */
export async function turnsSince(pool, siteKey) {
  const rows = await rowsOf(() =>
    pool.query(`select min(opened_at) as since from site_turn where site_key = $1`, [siteKey])
  )
  return rows[0]?.since ? rows[0].since.toISOString() : null
}

// ── Site changes V2 (plan `tasks/todo-site-changes-v2.md` §4.1) ──────────────────────────────────
//
// The same tables plus `site_operation` (049), read through ONE Source CASE (`activity-source.js`
// `V2_SOURCES_SQL`) for the page and for the counts: the filter is applied before `limit`, and a
// count never counts a row a page could not show.

const v2Params = (siteKey, cache) => [siteKey, cache.turns, cache.shas, ...V2_SOURCE_PARAMS()]

/**
 * One V2 page of row keys, newest first: at most `limit` rows whose Source is in `sources`,
 * strictly before `after`.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {{sources: readonly string[], after: {atUs: bigint, rank: number, id: string}|null, limit: number,
 *          cache?: CacheOnly}} q
 * @returns {Promise<{kind: string, rank: number, id: string, atUs: bigint, source: string}[]>}
 */
export async function pageKeysV2(pool, siteKey, { sources, after, limit, cache = NO_CACHE }) {
  // 🔒 Ids compare in byte order (`collate "C"`), the order `compareKeys` sorts the merged page in:
  // under a language collation two ids at one microsecond could sort differently in SQL and in JS,
  // and a cursor taken from the JS order would then skip or repeat a row.
  const { rows } = await pool.query(
    `select * from (select kind, rank, id, source, (extract(epoch from at) * 1000000)::bigint as at_us
                      from (${V2_SOURCES_SQL}) s) k
      where k.source = any($5::text[])
        and ($6::bigint is null or (k.at_us, k.rank, k.id collate "C") < ($6::bigint, $7::int, $8::text collate "C"))
      order by k.at_us desc, k.rank desc, k.id collate "C" desc
      limit $9`,
    [
      ...v2Params(siteKey, cache),
      [...sources],
      after?.atUs?.toString() ?? null,
      after?.rank ?? null,
      after?.id ?? null,
      limit
    ]
  )
  return rows.map((r) => ({
    kind: r.kind,
    rank: Number(r.rank),
    id: r.id,
    atUs: BigInt(r.at_us),
    source: r.source
  }))
}

/**
 * How many V2 rows each Source has in all, whatever the page or filter.
 * @returns {Promise<Record<string, number>>}
 */
export async function countSourcesV2(pool, siteKey, cache = NO_CACHE) {
  const { rows } = await pool.query(
    `select source, count(*)::int as n from (${V2_SOURCES_SQL}) s group by source`,
    v2Params(siteKey, cache)
  )
  return Object.fromEntries(rows.map((r) => [r.source, Number(r.n)]))
}

// ── The badge: unseen changes and the watermark (plan `tasks/todo-site-changes-badge-count.md` §2) ──
//
// `site_activity_seen` (058): one row per (site, account), `seen_at` the watermark. The count reads
// the SAME union the list and its counts read, so a row the badge counts is a row the tab can show.

/**
 * How many rows of the badge Sources (`BADGE_SOURCES`) were RECORDED after `since` and are not
 * `viewer`'s own work through Tracy. "Own" is every actor of the row being the viewer (case-blind):
 * a row with no Tracy actor — a CMS row, a seal, a write with no actor — is never own.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {{since: string|Date, viewer: string|null, cache?: CacheOnly}} q
 * @returns {Promise<number>}
 */
export async function countUnseenV2(pool, siteKey, { since, viewer, cache = NO_CACHE }) {
  // Rows on the badge (`badgeRowSql`), not the viewer's own. A row with no `unit` is one thing;
  // software rows of one unit are cut into islands at gaps of two seconds or more of `occurred_at`
  // (`at`, never `recorded_at`: one collector pull stores a day's rows at one instant), and an
  // island is one thing — counted when ANY of its rows was recorded after the watermark, so a run
  // that straddles the watermark counts once and a row pulled late is not lost. The islands are cut
  // over every row of the unit, seen or not, so the watermark cannot split a run in two.
  const { rows } = await pool.query(
    `with s as (select s.* from (${V2_SOURCES_SQL}) s
                 where ${badgeRowSql('$5')}
                   and not (cardinality(s.actors) > 0
                            and (select bool_and(lower(a) = lower($7::text)) from unnest(s.actors) a))),
          u as (select s.*,
                       case when s.unit is null then null
                            when s.at - lag(s.at) over (partition by s.unit order by s.at, s.id) < interval '2 seconds' then 0
                            else 1 end as brk
                  from s),
          g as (select u.*,
                       case when u.unit is null then null
                            else sum(u.brk) over (partition by u.unit order by u.at, u.id rows unbounded preceding) end as island
                  from u)
     select (select count(*) from g where g.unit is null and g.recorded_at > $6::timestamptz)::int
          + (select count(*) from (select distinct g.unit, g.island from g
                                     where g.unit is not null and g.recorded_at > $6::timestamptz) i)::int as n`,
    [...v2Params(siteKey, cache), [...BADGE_SOURCES], since, viewer ?? '']
  )
  return Number(rows[0]?.n ?? 0)
}

/** The viewer's watermark on the site, ISO; null when the badge was never asked for them. */
export async function seenAtOf(pool, siteKey, accountId) {
  const { rows } = await pool.query(
    'select seen_at from site_activity_seen where site_key = $1 and account_id = $2',
    [siteKey, accountId]
  )
  return rows[0]?.seen_at ? rows[0].seen_at.toISOString() : null
}

/**
 * The baseline: write `now` as the watermark if the viewer has none, and say which it is. Never
 * moves an existing one (two first asks in a row keep the first).
 * @returns {Promise<{seenAt: string, created: boolean}>}
 */
export async function ensureSeen(pool, siteKey, accountId, now) {
  const { rows } = await pool.query(
    `insert into site_activity_seen (site_key, account_id, seen_at) values ($1, $2, $3)
     on conflict (site_key, account_id) do nothing
     returning seen_at`,
    [siteKey, accountId, now]
  )
  if (rows[0]) return { seenAt: rows[0].seen_at.toISOString(), created: true }
  return { seenAt: /** @type {string} */ (await seenAtOf(pool, siteKey, accountId)), created: false }
}

/**
 * Move the watermark forward to `at` — never backwards: a tab that drew an older page than another
 * tab of the same person must not make seen changes new again.
 * @returns {Promise<string>} the watermark after, ISO
 */
export async function markSeen(pool, siteKey, accountId, at) {
  const { rows } = await pool.query(
    `insert into site_activity_seen (site_key, account_id, seen_at) values ($1, $2, $3)
     on conflict (site_key, account_id) do update set seen_at = greatest(site_activity_seen.seen_at, excluded.seen_at)
     returning seen_at`,
    [siteKey, accountId, at]
  )
  return rows[0].seen_at.toISOString()
}

/**
 * The commits succeeded operations made (`resulting_sha`, verified by the reconciler, contract D3):
 * Git moments the operation row already accounts for — one undo is one event (plan §4.2).
 * @returns {Promise<Set<string>>}
 */
export async function operationShas(pool, siteKey) {
  const rows = await rowsOf(() =>
    pool.query(
      `select resulting_sha from site_operation
        where site_key = $1 and status = 'succeeded' and resulting_sha is not null`,
      [siteKey]
    )
  )
  return new Set(rows.map((r) => r.resulting_sha))
}

const OPERATION_COLUMNS = `op.id::text as id, op.action, op.target_sha, op.resulting_sha, op.scope, op.actor_email, op.status,
       op.job_id, op.provenance, op.created_at, op.finished_at, a.display_name, (a.id is not null) as account_known`

/** Every succeeded undo of the site — what marks a moment undone (never a restore commit's title). */
export function succeededUndos(pool, siteKey) {
  return rowsOf(() =>
    pool.query(
      `select ${OPERATION_COLUMNS}
         from site_operation op left join account a on a.email = lower(op.actor_email)
        where op.site_key = $1 and op.status = 'succeeded' and op.action = 'undo' and op.target_sha is not null
        order by op.created_at`,
      [siteKey]
    )
  )
}

/** The operations behind `ids` (succeeded ones only: the rows the page can hold). */
export function operationsById(pool, siteKey, ids) {
  if (!ids.length) return Promise.resolve([])
  return rowsOf(() =>
    pool.query(
      `select ${OPERATION_COLUMNS}
         from site_operation op left join account a on a.email = lower(op.actor_email)
        where op.site_key = $1 and op.id::text = any($2::text[])`,
      [siteKey, ids]
    )
  )
}

/**
 * The chat turns behind `ids` for V2: the row, the typer's name (and whether the account still
 * exists — contract D5), whether its comment request is on record (the Source CASE's `exists`),
 * and the comment's author when that is another person than the sender (plan §2.2).
 */
export function turnsByIdV2(pool, siteKey, ids) {
  if (!ids.length) return Promise.resolve([])
  return rowsOf(() =>
    pool.query(
      `select t.*, a.display_name, (a.id is not null) as account_known,
              (t.state = 'open' and t.opened_at < now() - interval '${STALE_AFTER}') as overdue,
              ref.n as ref_n, ref.url as ref_url, ref.author_name, ref.author_email,
              ref.comment_id, ref.comment_deleted,
              (ref.n is not null) as has_ref
         from site_turn t
         left join account a on a.email = lower(t.actor)
         left join lateral (
           select r.n, r.url, c.id::text as comment_id, (c.deleted_at is not null) as comment_deleted,
                  case when c.author_account_id is distinct from r.account_id then au.display_name end as author_name,
                  case when c.author_account_id is distinct from r.account_id then au.email end as author_email
             from site_request r
             left join site_comment c on c.id = r.comment_id
             left join account au on au.id = c.author_account_id
            where t.source = 'comment' and r.site_key = t.site_key and r.session_id = t.session_id
              and (case when t.comment_ns is null then r.text = t.title else r.n = any(t.comment_ns) end)
            order by r.n
            limit 1) ref on true
        where t.site_key = $1 and t.turn_id = any($2::text[])`,
      [siteKey, ids]
    )
  )
}

/** Writes of chat turns `turnIds` (refused left out), oldest first, as V2 reads them. */
export function writesOfTurnsV2(pool, siteKey, turnIds) {
  if (!turnIds.length) return Promise.resolve([])
  return rowsOf(() =>
    pool.query(
      `select turn_id as group_id, id, at, actor, action, outcome, target, via, turn_id, session_id
         from site_write
        where site_key = $1 and turn_id = any($2::text[]) and outcome <> 'refused'
        order by at, id`,
      [siteKey, turnIds]
    )
  )
}

/** Writes of the V2 `writes` groups `groupIds`, oldest first, with what the classifier reads. */
export function writesOfGroupsV2(pool, siteKey, groupIds) {
  if (!groupIds.length) return Promise.resolve([])
  return rowsOf(() =>
    pool.query(
      `select g.*, a.display_name, (a.id is not null) as account_known
         from (select ${writeGroupSql('w')} as group_id,
                      w.id, w.at, w.actor, w.action, w.outcome, w.target, w.via, w.turn_id, w.session_id,
                      w.origin, w.origin_ref
                 from site_write w
                where w.site_key = $1 and w.outcome <> 'refused') g
         left join account a on a.email = lower(g.actor)
        where g.group_id = any($2::text[])
        order by g.at, g.id`,
      [siteKey, groupIds]
    )
  )
}
