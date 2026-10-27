/**
 * Website Opportunities rows (`125-website-opportunities.sql`). Every reader takes the account id and
 * filters on it: a row of another account reads as absent, never as forbidden.
 *
 * Job writes by the executor are FENCED: they run only while the job is `running` under the same
 * `lease_token` the executor claimed. A cancel, or another executor reclaiming an expired lease,
 * bumps the token, so the old writer's next write throws `StaleLeaseError` instead of landing.
 */

import { resolvePlace } from './places.js'
import { nextReadingPicks } from '../domain/business-reading.mjs'
import { mergeKeyMessagePicks, nextFactOverrides } from './owner-fact-picks.js'
import { journeySql } from './wo-journey.js'

/** The leased table of a lease: a research request (`wo_job`, the default) or a place job (`wo_place_job`). */
const leaseTable = (lease) => (lease.table === 'wo_place_job' ? 'wo_place_job' : 'wo_job')

export class StaleLeaseError extends Error {
  constructor(jobId) {
    super(`lease on job ${jobId} is no longer held`)
    this.name = 'StaleLeaseError'
    this.code = 'STALE_LEASE'
  }
}

// ── Preference ─────────────────────────────────────────────────────────────────────────────

/** @returns {Promise<{cms: string, updated_at: Date} | null>} */
export async function readPreference(db, accountId) {
  const { rows } = await db.query(
    'select cms, quality_mode, updated_at from wo_preference where account_id = $1',
    [accountId]
  )
  return rows[0] ?? null
}

/** Advisory key serialising a preference write against revisions reading it (absent row included). */
export const preferenceLockSql = `hashtextextended('wo_preference:' || $1::text, 0)`

export async function savePreference(pool, accountId, cms, qualityMode = undefined) {
  if (qualityMode !== undefined && !['off', 'shadow', 'apply'].includes(qualityMode))
    throw new Error('QUALITY_MODE_INVALID')
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`select pg_advisory_xact_lock(${preferenceLockSql})`, [accountId])
    await client.query(
      `insert into wo_preference (account_id, cms,quality_mode) values ($1, $2,coalesce($3,'off'))
       on conflict (account_id) do update set cms = excluded.cms,
         quality_mode=coalesce($3,wo_preference.quality_mode),updated_at = now()`,
      [accountId, cms, qualityMode ?? null]
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

// ── Opportunity ────────────────────────────────────────────────────────────────────────────

/**
 * The links a new save names that the saved candidate does not have yet: a website when it has none, a social page
 * of a network it has none of, listing pages it does not list. Null when nothing is new. Nothing else of the saved
 * candidate changes (its name, its `ownSite`, what research wrote on it) but `linksAddedAt`, the time a link was
 * added: a place research published before it is not current for this opportunity (`place-requests.js`).
 */
export function candidateWithNewRefs(held, sent, now = new Date()) {
  const base = held && typeof held === 'object' ? held : {}
  const out = { ...base }
  let changed = false
  if (!base.website && typeof sent?.website === 'string' && sent.website) {
    out.website = sent.website
    changed = true
  }
  for (const [network, url] of Object.entries(sent?.socials ?? {})) {
    if (typeof url !== 'string' || !url || base.socials?.[network]) continue
    out.socials = { ...out.socials, [network]: url }
    changed = true
  }
  const listings = Array.isArray(base.listings) ? [...base.listings] : []
  for (const l of Array.isArray(sent?.listings) ? sent.listings : [])
    if (typeof l?.url === 'string' && !listings.some((h) => h?.url === l.url)) {
      listings.push(l)
      changed = true
    }
  if (listings.length) out.listings = listings
  if (changed) out.linksAddedAt = now.toISOString()
  return changed ? out : null
}

/**
 * Insert once per (account, provider, providerId), with the place it names (`places.js`; null when the
 * provider id names none). A row saved before places existed gets its place on the next save. Saving it again
 * with more links (`candidateWithNewRefs`) adds them to the saved candidate: they are researched as its own.
 * @returns {Promise<{row: object, created: boolean}>}
 */
export async function insertOpportunity(pool, accountId, { name, branch, provider, providerId, candidate }) {
  const placeId = await resolvePlace(pool, { provider, providerId, name })
  const { rows } = await pool.query(
    `insert into wo_opportunity (account_id, name, branch, provider, provider_id, candidate, place_id)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (account_id, provider, provider_id) do nothing
     returning *`,
    [accountId, name, branch ?? null, provider, providerId, JSON.stringify(candidate), placeId]
  )
  if (rows[0]) return { row: rows[0], created: true }
  const existing = await pool.query(
    `update wo_opportunity set place_id = coalesce(place_id, $4)
     where account_id = $1 and provider = $2 and provider_id = $3 returning *`,
    [accountId, provider, providerId, placeId]
  )
  const row = existing.rows[0]
  const merged = row ? candidateWithNewRefs(row.candidate, candidate) : null
  if (!merged) return { row, created: false }
  const updated = await pool.query(
    'update wo_opportunity set candidate = $2::jsonb, updated_at = now() where id = $1 returning *',
    [row.id, JSON.stringify(merged)]
  )
  return { row: updated.rows[0] ?? row, created: false }
}

/** The opportunity's place, resolved now when it has none yet (saved before places existed). */
export async function ensurePlaceOf(pool, opportunity) {
  if (opportunity.place_id) return opportunity.place_id
  const placeId = await resolvePlace(pool, {
    provider: opportunity.provider,
    providerId: opportunity.provider_id,
    name: opportunity.name
  })
  if (!placeId) return null
  const { rows } = await pool.query(
    'update wo_opportunity set place_id = coalesce(place_id, $2) where id = $1 returning place_id',
    [opportunity.id, placeId]
  )
  return rows[0]?.place_id ?? null
}

export async function opportunityOf(db, accountId, id) {
  const { rows } = await db.query('select * from wo_opportunity where id = $1 and account_id = $2', [
    id,
    accountId
  ])
  return rows[0] ?? null
}

/** Longest name a person may give the business (the `wo_opportunity.name` limit). */
export const NAME_PICK_MAX = 200

/**
 * The name the person picked for the business's site (`domain/business-name.mjs`): kept on the candidate as
 * `namePick`, where every brief and the Details page read it, and as the row's name, which lists and titles show.
 * Saving the opportunity again keeps it (`candidateWithNewRefs` changes links only). Null when the row is not this
 * account's.
 */
export async function saveNamePick(db, accountId, id, name) {
  const value = String(name).replace(/\s+/g, ' ').trim().slice(0, NAME_PICK_MAX)
  const { rows } = await db.query(
    `update wo_opportunity
        set candidate = coalesce(candidate, '{}'::jsonb) || jsonb_build_object('namePick', jsonb_build_object('name', $3::text, 'at', now())),
            name = $3, updated_at = now()
      where id = $1 and account_id = $2 returning *`,
    [id, accountId, value]
  )
  return rows[0] ?? null
}

/**
 * The person's choice for the opening hours on the site (`domain/hours-check.mjs`): `{choice: 'keep' | 'leave'}` or
 * `{choice: 'edit', hours}`, kept on the candidate as `hoursPick` like the name pick. Null when the row is not this
 * account's.
 */
export async function saveHoursPick(db, accountId, id, pick) {
  const { rows } = await db.query(
    `update wo_opportunity
        set candidate = coalesce(candidate, '{}'::jsonb) || jsonb_build_object('hoursPick', $3::jsonb || jsonb_build_object('at', now())),
            updated_at = now()
      where id = $1 and account_id = $2 returning *`,
    [id, accountId, JSON.stringify(pick)]
  )
  return rows[0] ?? null
}

/**
 * The person's choice for Google's rating on the site (`domain/google-rating.mjs`): `{choice: 'show' | 'leave'}`, kept
 * on the candidate as `ratingPick` like the hours pick. Null when the row is not this account's.
 */
export async function saveRatingPick(db, accountId, id, pick) {
  const { rows } = await db.query(
    `update wo_opportunity
        set candidate = coalesce(candidate, '{}'::jsonb) || jsonb_build_object('ratingPick', $3::jsonb || jsonb_build_object('at', now())),
            updated_at = now()
      where id = $1 and account_id = $2 returning *`,
    [id, accountId, JSON.stringify(pick)]
  )
  return rows[0] ?? null
}

/**
 * The person's picks on the reading of the Profile card (#1780, `domain/business-reading.mjs nextReadingPicks`):
 * Remove (or restore) a service, audience, team or story item, and Show on the site (or hide) a person named only in
 * reviews. Kept on the candidate as `readingPicks`; read and written under a row lock so two clicks never lose one.
 * Null when the row is not this account's.
 */
export async function saveReadingPick(pool, accountId, id, item, choice) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const held = (
      await client.query(
        'select candidate from wo_opportunity where id = $1 and account_id = $2 for update',
        [id, accountId]
      )
    ).rows[0]
    if (!held) {
      await client.query('rollback')
      return null
    }
    const picks = {
      ...nextReadingPicks(held.candidate?.readingPicks, item, choice),
      at: new Date().toISOString()
    }
    const { rows } = await client.query(
      `update wo_opportunity
          set candidate = coalesce(candidate, '{}'::jsonb) || jsonb_build_object('readingPicks', $3::jsonb),
              updated_at = now()
        where id = $1 and account_id = $2 returning *`,
      [id, accountId, JSON.stringify(picks)]
    )
    await client.query('commit')
    return rows[0] ?? null
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The owner's on/off choice for one fact of the place profile (#1791, `owner-fact-picks.js`): `onSite` true or false,
 * or null to let the rule decide again. Kept on the candidate as `factOverrides`, where Research again never reaches
 * and every later revision reads it (`freezePlaceProfile`); read and written under a row lock so two clicks never lose
 * one. Null when the row is not this account's.
 */
export async function saveFactOverride(pool, accountId, id, factId, onSite) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const held = (
      await client.query(
        'select candidate from wo_opportunity where id = $1 and account_id = $2 for update',
        [id, accountId]
      )
    ).rows[0]
    if (!held) {
      await client.query('rollback')
      return null
    }
    const overrides = nextFactOverrides(held.candidate?.factOverrides, factId, onSite)
    const { rows } = await client.query(
      `update wo_opportunity
          set candidate = coalesce(candidate, '{}'::jsonb) || jsonb_build_object('factOverrides', $3::jsonb),
              updated_at = now()
        where id = $1 and account_id = $2 returning *`,
      [id, accountId, JSON.stringify(overrides)]
    )
    await client.query('commit')
    return rows[0] ?? null
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The owner's edits of the key messages (#1791, `owner-fact-picks.js readKeyMessagePicks`): `{removed, order, labels}`,
 * merged into the stored picks (removals stay, labels sent replace), kept on the candidate as `keyMessagePicks` like the reading picks. Null when the row is not this
 * account's.
 */
export async function saveKeyMessagePicks(db, accountId, id, picks) {
  const client = await db.connect()
  try {
    await client.query('begin')
    const held = (
      await client.query(
        'select candidate from wo_opportunity where id = $1 and account_id = $2 for update',
        [id, accountId]
      )
    ).rows[0]
    if (!held) {
      await client.query('rollback')
      return null
    }
    const merged = mergeKeyMessagePicks(held.candidate?.keyMessagePicks, picks)
    const { rows } = await client.query(
      `update wo_opportunity
          set candidate = coalesce(candidate, '{}'::jsonb) || jsonb_build_object('keyMessagePicks', $3::jsonb || jsonb_build_object('at', now())),
              updated_at = now()
        where id = $1 and account_id = $2 returning *`,
      [id, accountId, JSON.stringify(merged)]
    )
    await client.query('commit')
    return rows[0] ?? null
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** The steps of the My opportunities filter, in order (`stage` of a listed row). */
export const STAGES = Object.freeze(['research', 'demo', 'outreach', 'cancelled'])

/**
 * 🔒 THE ONE DEFINITION OF A ROW'S `stage` AND `attention` (plan D1, council 19/10), shared by the list,
 * the counts and the bulk filter so the three never disagree. Research is saved/not yet completed;
 * Demo has research, a revision or an accepted build action; Outreach requires the latest live demo
 * to have QA PASS. Cancelled is outside these three steps. Attention flags stopped research, build
 * actions and QA independently, without lowering a milestone.
 * Needs `o` (wo_opportunity) in scope and `acc` (the account's placeholder); adds `lj` (latest job)
 * and the milestone sets `jr`, plus the builder's (`demoJourney`, none where nothing builds).
 * Per-account sets joined by hash, not a subquery per row: per-row `exists` made the planner estimate ~56 a row and JIT-compile the query from ~1800 rows on
 * (50 ms of compile for 5 ms of work, measured 19/10/2026).
 *
 * The account's opportunities with their computed stage, as `staged`, narrowed by `q` or to `ids`.
 * MATERIALIZED: inlined, every `s.stage` reference re-ran the milestone subqueries (counts measured
 * 52 ms → 4 ms on 1000 rows, 19/10/2026).
 */
function stagedSql(params, accountId, { q, ids, demoJourney } = {}) {
  params.push(accountId)
  const acc = `$${params.length}`
  // A customer's own business (Build from my business, `own-site.js`) is not an opportunity to list.
  let where = `o.account_id = ${acc} and not (o.candidate ? 'ownSite')`
  if (ids) {
    params.push(ids)
    where += ` and o.id = any($${params.length}::uuid[])`
  }
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`)
    const p = `$${params.length}`
    where += ` and (o.name ilike ${p} escape '\\' or coalesce(o.branch, '') ilike ${p} escape '\\'
      or coalesce(o.candidate->>'address', '') ilike ${p} escape '\\')`
  }
  const journey = journeySql({ accountSql: acc }, demoJourney)
  return `staged as materialized (
    select o.id, o.created_at, ${journey.stage} as stage, ${journey.attention} as attention, lj.id as latest_job_id
    from wo_opportunity o ${journey.joins} where ${where})`
}

/** `stage`/`attention` narrowing of `staged s` (D1: an attention row is not in its step). */
function filterSql(params, { stage, attention }) {
  const parts = []
  if (stage) {
    params.push(stage)
    parts.push(`s.stage = $${params.length}`)
    if (attention !== true) parts.push('not s.attention')
  }
  if (attention === true) parts.push('s.attention')
  if (attention === false) parts.push('not s.attention')
  return parts.length ? parts.join(' and ') : 'true'
}

/** `JOB_SELECT`'s overlay as jsonb, for a job read with `to_jsonb(j)`. */
const PLACE_PROGRESS_JSON = `coalesce((select jsonb_build_object('stage', pj.stage, 'progress', pj.progress)
    from wo_place_job pj where pj.id = j.place_job_id and j.result_snapshot_id is null), '{}'::jsonb)`

/** Cursor of a row: its exact `created_at` (microseconds, which a JS Date drops) and id. */
const CURSOR_KEY_SQL = `to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || o.id`

export function encodeCursor(key) {
  return Buffer.from(key, 'utf8').toString('base64url')
}

/** @returns {{createdAt: string, id: string} | null} null for anything this server did not make */
export function decodeCursor(cursor) {
  const raw = /^[A-Za-z0-9_-]{1,200}$/.test(cursor) ? Buffer.from(cursor, 'base64url').toString('utf8') : ''
  const m =
    /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(
      raw
    )
  return m ? { createdAt: m[1], id: m[2] } : null
}

/**
 * The account's opportunities, newest first (`created_at desc, id desc`, a keyset that never moves).
 * No options → every row, as the door always answered. `ids` → exactly those rows, no other filter.
 * @param {{stage?: string, attention?: boolean, q?: string, cursor?: {createdAt: string, id: string} | null,
 *   limit?: number, ids?: string[], demoJourney?: Function | null}} [opts] `demoJourney`: the builder's
 *   stage SQL (`opportunities/wo-journey.js` `journeySql`); without it the stage reads research alone
 * @returns {Promise<{rows: object[], nextCursor: string | null}>} rows carry `stage`, `attention` and
 *   `job`; their demo columns come from the builder (`opportunities-build/route.js` `listedDemoOf`)
 */
export async function listOpportunities(pool, accountId, opts = {}) {
  const params = []
  const { demoJourney } = opts
  const staged = stagedSql(
    params,
    accountId,
    opts.ids ? { ids: opts.ids, demoJourney } : { q: opts.q, demoJourney }
  )
  let where = opts.ids ? 'true' : filterSql(params, opts)
  if (!opts.ids && opts.cursor) {
    params.push(opts.cursor.createdAt, opts.cursor.id)
    where += ` and (o.created_at, o.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`
  }
  let limit = ''
  if (opts.limit && !opts.ids) {
    params.push(opts.limit + 1)
    limit = `limit $${params.length}`
  }
  const { rows } = await pool.query(
    `with ${staged}
     select o.*, s.stage, s.attention, ${CURSOR_KEY_SQL} as cursor_key,
       (select to_jsonb(j) || ${PLACE_PROGRESS_JSON} from wo_job j where j.id = s.latest_job_id) as job
     from staged s join wo_opportunity o on o.id = s.id
     where ${where}
     order by o.created_at desc, o.id desc ${limit}`,
    params
  )
  const more = Boolean(opts.limit && !opts.ids && rows.length > opts.limit)
  const page = more ? rows.slice(0, opts.limit) : rows
  return { rows: page, nextCursor: more ? encodeCursor(page.at(-1).cursor_key) : null }
}

/**
 * How many rows each filter button holds, under the same search. `all` counts every row; a row
 * needing attention counts in `attention` and not in its step, so the steps plus attention make all.
 * @returns {Promise<Record<'all' | 'research' | 'demo' | 'outreach' | 'cancelled' | 'attention', number>>}
 */
export async function countStages(pool, accountId, { q, demoJourney } = {}) {
  const params = []
  const staged = stagedSql(params, accountId, { q, demoJourney })
  const steps = STAGES.map(
    (st) => `count(*) filter (where s.stage = '${st}' and not s.attention)::int as "${st}"`
  )
  const { rows } = await pool.query(
    `with ${staged}
     select count(*)::int as all, ${steps.join(', ')}, count(*) filter (where s.attention)::int as attention
     from staged s`,
    params
  )
  return rows[0]
}

/** How many rows a filter matches (the list's `total`). */
export async function countMatching(pool, accountId, { stage, attention, q, demoJourney } = {}) {
  const params = []
  const staged = stagedSql(params, accountId, { q, demoJourney })
  const where = filterSql(params, { stage, attention })
  const { rows } = await pool.query(
    `with ${staged} select count(*)::int as n from staged s where ${where}`,
    params
  )
  return rows[0].n
}

/**
 * The latest job id of each row a filter matches, newest row first — what "select all matching"
 * acts on (council 19/10: the server evaluates the filter once, at the press). Rows with no job are
 * left out. Reads `max + 1` at most so an oversized selection is refused, never cut.
 */
export async function latestJobIdsMatching(pool, accountId, { stage, attention, q, demoJourney } = {}, max) {
  const params = []
  const staged = stagedSql(params, accountId, { q, demoJourney })
  const where = filterSql(params, { stage, attention })
  params.push(max + 1)
  const { rows } = await pool.query(
    `with ${staged} select s.latest_job_id from staged s
     where ${where} and s.latest_job_id is not null
     order by s.created_at desc, s.id desc limit $${params.length}`,
    params
  )
  return rows.map((r) => r.latest_job_id)
}

// ── Jobs ───────────────────────────────────────────────────────────────────────────────────

/**
 * A request row as readers see it: a request a place job serves (and has not answered yet) shows that
 * run's stage and progress, which the place job writes, not the request.
 */
const JOB_SELECT = `select j.id, j.account_id, j.opportunity_id, j.kind, j.request_id, j.state,
    coalesce(pj.stage, j.stage) as stage, coalesce(pj.progress, j.progress) as progress, j.lease_owner,
    j.lease_token, j.lease_until, j.heartbeat_at, j.attempt, j.last_error, j.created_at, j.updated_at,
    j.place_job_id, j.result_snapshot_id
  from wo_job j left join wo_place_job pj on pj.id = j.place_job_id and j.result_snapshot_id is null`

/** @returns {Promise<{row: object, created: boolean}>} the job of this request id, made once. */
export async function insertJob(pool, accountId, opportunityId, requestId, kind = 'research') {
  const { rows } = await pool.query(
    `insert into wo_job (account_id, opportunity_id, kind, request_id) values ($1, $2, $3, $4)
     on conflict (account_id, request_id) do nothing returning *`,
    [accountId, opportunityId, kind, requestId]
  )
  if (rows[0]) return { row: rows[0], created: true }
  const existing = await pool.query('select * from wo_job where account_id = $1 and request_id = $2', [
    accountId,
    requestId
  ])
  return { row: existing.rows[0], created: false }
}

export async function activeJobOf(pool, opportunityId) {
  const { rows } = await pool.query(
    `${JOB_SELECT} where j.opportunity_id = $1 and j.state in ('queued', 'running')
     order by j.created_at desc limit 1`,
    [opportunityId]
  )
  return rows[0] ?? null
}

export async function jobOf(pool, accountId, jobId) {
  const { rows } = await pool.query(`${JOB_SELECT} where j.id = $1 and j.account_id = $2`, [jobId, accountId])
  return rows[0] ?? null
}

export async function jobsOfOpportunity(pool, opportunityId) {
  const { rows } = await pool.query(`${JOB_SELECT} where j.opportunity_id = $1 order by j.created_at desc`, [
    opportunityId
  ])
  return rows
}

/**
 * How many times a research job's lease may run out (its executor died: a restart, a crash) before it is not
 * run again. Each reclaim starts the stage over, and a stage may be a paid synchronous Apify run.
 */
export const JOB_MAX_LEASE_EXPIRIES = 2

/**
 * Take one research job: `queued`, or `running` with an expired lease (its executor died). The
 * token goes up by one, so whoever held the old lease can no longer write. Closes the previous
 * attempt as `lease_expired` and opens a new one. A job whose lease expired `JOB_MAX_LEASE_EXPIRIES`
 * times ends `failed` (`LEASE_EXPIRED_TOO_OFTEN`) instead of paying for its runs once more.
 * @returns {Promise<object | null>} the claimed job
 */
export async function claimJob(pool, owner, leaseMs) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows: spent } = await client.query(
      `update wo_job j set state = 'failed', lease_owner = null, lease_until = null, updated_at = now(),
         last_error = jsonb_build_object('code', 'LEASE_EXPIRED_TOO_OFTEN',
           'message', 'the job stopped ' || $1::int || ' times before it finished; not run again')
       where j.kind = 'research' and (j.place_job_id is null or j.result_snapshot_id is not null)
         and j.state = 'running' and j.lease_until < now()
         and (select count(*) from wo_job_attempt a
               where a.job_id = j.id and (a.outcome = 'lease_expired' or a.ended_at is null)) >= $1
       returning j.id`,
      [JOB_MAX_LEASE_EXPIRIES]
    )
    for (const { id } of spent)
      await client.query(
        `update wo_job_attempt set ended_at = now(), outcome = 'lease_expired'
         where job_id = $1 and ended_at is null`,
        [id]
      )
    const { rows } = await client.query(
      `with next as (
         select id from wo_job
         where kind = 'research' and (place_job_id is null or result_snapshot_id is not null)
           and (state = 'queued' or (state = 'running' and lease_until < now()))
         order by updated_at limit 1 for update skip locked)
       update wo_job j set state = 'running', lease_owner = $1, lease_token = j.lease_token + 1,
         lease_until = now() + ($2::int * interval '1 millisecond'), heartbeat_at = now(),
         attempt = j.attempt + 1, updated_at = now()
       from next where j.id = next.id
       returning j.*`,
      [owner, leaseMs]
    )
    const job = rows[0] ?? null
    if (job) {
      await client.query(
        `update wo_job_attempt set ended_at = now(), outcome = 'lease_expired'
         where job_id = $1 and ended_at is null`,
        [job.id]
      )
      await client.query('insert into wo_job_attempt (job_id, attempt, lease_token) values ($1, $2, $3)', [
        job.id,
        job.attempt,
        job.lease_token
      ])
    }
    await client.query('commit')
    return job
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Extend the lease. @returns {Promise<boolean>} false when the lease is no longer held */
export async function heartbeat(pool, lease, leaseMs) {
  const { rowCount } = await pool.query(
    `update ${leaseTable(lease)} set heartbeat_at = now(), lease_until = now() + ($3::int * interval '1 millisecond')
     where id = $1 and lease_token = $2 and state = 'running'`,
    [lease.jobId, lease.token, leaseMs]
  )
  return rowCount === 1
}

/** Record the stage reached and progress, under the lease. @returns {Promise<boolean>} */
export async function checkpoint(pool, lease, { stage, progress }) {
  const { rowCount } = await pool.query(
    `update ${leaseTable(lease)} set stage = coalesce($3, stage), progress = progress || coalesce($4::jsonb, '{}'::jsonb),
       updated_at = now()
     where id = $1 and lease_token = $2 and state = 'running'`,
    [lease.jobId, lease.token, stage ?? null, progress ? JSON.stringify(progress) : null]
  )
  return rowCount === 1
}

/**
 * End the executor's hold: state `completed` | `paused` | `blocked` | `failed`, with the attempt's
 * outcome. @returns {Promise<boolean>} false when the lease was already lost
 */
export async function finishLease(pool, lease, { state, lastError = null, outcome }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rowCount } = await client.query(
      `update wo_job set state = $3, last_error = $4::jsonb, lease_owner = null, lease_until = null,
         stage = case when $3 = 'completed' then 'done' else stage end, updated_at = now()
       where id = $1 and lease_token = $2 and state = 'running'`,
      [lease.jobId, lease.token, state, lastError ? JSON.stringify(lastError) : null]
    )
    if (rowCount === 1)
      await client.query(
        `update wo_job_attempt set ended_at = now(), outcome = $3, error = $4::jsonb
         where job_id = $1 and lease_token = $2 and ended_at is null`,
        [lease.jobId, lease.token, outcome ?? state, lastError ? JSON.stringify(lastError) : null]
      )
    await client.query('commit')
    return rowCount === 1
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * Run `fn(client)` in a transaction that holds the job row, only while the lease is still ours.
 * @template T @param {(client: import('pg').PoolClient) => Promise<T>} fn @returns {Promise<T>}
 */
export async function fenced(pool, lease, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rowCount } = await client.query(
      `select 1 from ${leaseTable(lease)} where id = $1 and lease_token = $2 and state = 'running' for update`,
      [lease.jobId, lease.token]
    )
    if (rowCount !== 1) throw new StaleLeaseError(lease.jobId)
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Stop a job: the token moves so a running executor cannot write again. */
export async function cancelJob(pool, accountId, jobId) {
  const { rows } = await pool.query(
    `update wo_job set state = 'cancelled', lease_token = lease_token + 1, lease_owner = null,
       lease_until = null, updated_at = now()
     where id = $1 and account_id = $2 and state in ('queued', 'running', 'paused', 'blocked', 'failed')
     returning *`,
    [jobId, accountId]
  )
  if (rows[0])
    await pool.query(
      `update wo_job_attempt set ended_at = now(), outcome = 'cancelled' where job_id = $1 and ended_at is null`,
      [jobId]
    )
  return rows[0] ?? null
}

/** Another job of the same opportunity is queued or running (`job` is that one, or null if unseen). */
export class JobActiveError extends Error {
  constructor(job) {
    super('another job of this opportunity is active')
    this.name = 'JobActiveError'
    this.code = 'JOB_ACTIVE'
    this.job = job
  }
}

/**
 * Queue a stopped job again; it resumes at its recorded stage and source cursors. Throws
 * `JobActiveError` while another job of its opportunity is queued or running: the opportunity row is
 * locked so two resumes take turns, and index `wo_job_one_active` (migration 132) backs it up.
 * @returns {Promise<object | null>} null when the job is not the account's or not resumable
 */
export async function resumeJob(pool, accountId, jobId) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const own = await client.query('select opportunity_id from wo_job where id = $1 and account_id = $2', [
      jobId,
      accountId
    ])
    if (!own.rows[0]) {
      await client.query('rollback')
      return null
    }
    const opportunityId = own.rows[0].opportunity_id
    await client.query('select 1 from wo_opportunity where id = $1 for update', [opportunityId])
    const active = await client.query(
      `select * from wo_job where opportunity_id = $1 and id <> $2 and state in ('queued', 'running')
       order by created_at desc limit 1`,
      [opportunityId, jobId]
    )
    if (active.rows[0]) throw new JobActiveError(active.rows[0])
    const { rows } = await client.query(
      `update wo_job set state = 'queued', last_error = null, updated_at = now()
       where id = $1 and account_id = $2 and state in ('paused', 'blocked', 'failed', 'cancelled')
       returning *`,
      [jobId, accountId]
    )
    await client.query('commit')
    return rows[0] ?? null
  } catch (error) {
    await client.query('rollback').catch(() => {})
    if (error?.code === '23505' && error?.constraint === 'wo_job_one_active')
      throw new JobActiveError(await activeJobOf(pool, (await jobOf(pool, accountId, jobId))?.opportunity_id))
    throw error
  } finally {
    client.release()
  }
}

// ── Bulk presses ───────────────────────────────────────────────────────────────────────────

/** A press left unfinished this long (its process died) may be run again under the same id. */
const BULK_STALE = `interval '10 minutes'`

/**
 * Take a bulk press by its request id (migration 133).
 * @returns {Promise<{state: 'claimed'} | {state: 'replay', result: object} | {state: 'pending'} | {state: 'reused'}>}
 */
export async function claimBulkRequest(pool, accountId, requestId, action, requestHash) {
  const made = await pool.query(
    `insert into wo_bulk_request (account_id, request_id, action, request_hash) values ($1, $2, $3, $4)
     on conflict (account_id, request_id) do nothing returning request_id`,
    [accountId, requestId, action, requestHash]
  )
  if (made.rows[0]) return { state: 'claimed' }
  const { rows } = await pool.query(
    `update wo_bulk_request set updated_at = now()
     where account_id = $1 and request_id = $2 and request_hash = $3 and result is null
       and updated_at < now() - ${BULK_STALE}
     returning request_id`,
    [accountId, requestId, requestHash]
  )
  if (rows[0]) return { state: 'claimed' }
  const existing = (
    await pool.query(
      'select request_hash, result from wo_bulk_request where account_id = $1 and request_id = $2',
      [accountId, requestId]
    )
  ).rows[0]
  if (!existing || existing.request_hash !== requestHash) return { state: 'reused' }
  return existing.result ? { state: 'replay', result: existing.result } : { state: 'pending' }
}

export async function finishBulkRequest(pool, accountId, requestId, result) {
  await pool.query(
    'update wo_bulk_request set result = $3::jsonb, updated_at = now() where account_id = $1 and request_id = $2',
    [accountId, requestId, JSON.stringify(result)]
  )
}

/** Give a claimed press back (refused before anything ran), so the same id may be sent again. */
export async function releaseBulkRequest(pool, accountId, requestId) {
  await pool.query(
    'delete from wo_bulk_request where account_id = $1 and request_id = $2 and result is null',
    [accountId, requestId]
  )
}

// ── Sources, media, profile ────────────────────────────────────────────────────────────────

export async function sourcesOf(db, opportunityId) {
  const { rows } = await db.query('select * from wo_source where opportunity_id = $1 order by source', [
    opportunityId
  ])
  return rows
}

/** Name a source's ref once; an existing row keeps its own ref and state. */
export async function ensureSource(db, opportunityId, source, ref) {
  await db.query(
    `insert into wo_source (opportunity_id, source, ref) values ($1, $2, $3)
     on conflict (opportunity_id, source) do update set ref = coalesce(wo_source.ref, excluded.ref)`,
    [opportunityId, source, ref]
  )
}

export async function saveSource(db, opportunityId, source, { status, reason, cursor, coverage, collected }) {
  await db.query(
    `update wo_source set status = $3, reason = $4, cursor = $5::jsonb, coverage = $6::jsonb,
       collected = $7::jsonb, updated_at = now()
     where opportunity_id = $1 and source = $2`,
    [
      opportunityId,
      source,
      status,
      reason ?? null,
      cursor ? JSON.stringify(cursor) : null,
      coverage ? JSON.stringify(coverage) : null,
      JSON.stringify(collected ?? {})
    ]
  )
}

export async function mediaOf(db, opportunityId) {
  const { rows } = await db.query(
    'select * from wo_media where opportunity_id = $1 order by collected_at, id',
    [opportunityId]
  )
  return rows
}

export async function knownMediaUrls(db, opportunityId) {
  const { rows } = await db.query('select source_url from wo_media where opportunity_id = $1', [
    opportunityId
  ])
  return new Set(rows.map((r) => r.source_url))
}

export async function insertMedia(db, m) {
  const { rows } = await db.query(
    `insert into wo_media (account_id, opportunity_id, sha256, object_key, status, reason, mime, bytes,
       width, height, duration_s, kind, category, palette, source, source_url, post_id, posted_at,
       caption, alt, dhash, labels)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
     on conflict (opportunity_id, sha256) do nothing returning *`,
    [
      m.accountId,
      m.opportunityId,
      m.sha256,
      m.objectKey ?? null,
      m.status,
      m.reason ?? null,
      m.mime ?? null,
      m.bytes ?? null,
      m.width ?? null,
      m.height ?? null,
      m.durationS ?? null,
      m.kind,
      m.category ?? null,
      m.palette ? JSON.stringify(m.palette) : null,
      m.source,
      m.sourceUrl,
      m.postId ?? null,
      m.postedAt ?? null,
      m.caption ?? null,
      m.alt ?? null,
      m.dhash ?? null,
      m.labels ? JSON.stringify(m.labels) : null
    ]
  )
  return rows[0] ?? null
}

/**
 * A feed-size copy whose original is now stored: no longer a picture to place, kept as the record
 * of where the original came from (`wo_media.status` is read as `stored` by every picture step).
 */
export async function supersedeMedia(db, opportunityId, sourceUrl) {
  const { rowCount } = await db.query(
    `update wo_media set status = 'reference', reason = 'superseded'
     where opportunity_id = $1 and source_url = $2 and status = 'stored'`,
    [opportunityId, sourceUrl]
  )
  return rowCount
}

export async function mediaById(pool, accountId, mediaId) {
  const { rows } = await pool.query('select * from wo_media where id = $1 and account_id = $2', [
    mediaId,
    accountId
  ])
  return rows[0] ?? null
}

/**
 * A place's picture the account may read: one of its opportunities is that place's, or the place it was merged
 * into (`place-merge.js` keeps a tombstone's media where they were) (council 19/10: reading
 * goes opportunity → place; building goes revision → manifest, `buildPlaced`). Revoked rows are returned,
 * for the door to say so.
 */
export async function placeMediaOf(pool, accountId, mediaId) {
  const { rows } = await pool.query(
    `select m.* from wo_place_media m
     where m.id = $2 and exists (select 1 from wo_opportunity o where o.account_id = $1
       and (o.place_id = m.place_id or o.place_id = (select merged_into from wo_place p where p.id = m.place_id)))`,
    [accountId, mediaId]
  )
  return rows[0] ?? null
}

export async function profileOf(db, opportunityId) {
  const { rows } = await db.query('select * from wo_profile where opportunity_id = $1', [opportunityId])
  return rows[0] ?? null
}

export async function saveProfile(db, opportunityId, { profile, brand }) {
  await db.query(
    `insert into wo_profile (opportunity_id, profile, brand) values ($1, coalesce($2::jsonb, '{}'::jsonb), $3::jsonb)
     on conflict (opportunity_id) do update set
       profile = coalesce($2::jsonb, wo_profile.profile),
       brand = coalesce($3::jsonb, wo_profile.brand), updated_at = now()`,
    [opportunityId, profile ? JSON.stringify(profile) : null, brand ? JSON.stringify(brand) : null]
  )
}
