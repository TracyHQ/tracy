/**
 * `/ops/wo` › Places (shared research plan P4): every query the operator's view of the shared
 * place store runs. The tables are migration 134 (places, snapshots, place jobs, place media), 135
 * (`wo_cost_ledger`) and 136 (the merge queue and `wo_place_ops_event`).
 *
 * 🔒 AN OPERATOR WRITES NO RESEARCH. Refresh queues a place job (the worker's lease then writes); revoke
 * touches only `revoked_at`/`revoke_reason` (the only columns the 134 trigger lets change); merge and split
 * move `merged_into`, identities and `wo_opportunity.place_id`, never a snapshot. Every action records a
 * `wo_place_ops_event` in the same transaction, so what was done and by whom cannot go missing.
 */
import {
  PlaceMergeError,
  mergeIn,
  mergePlaces as mergeShared,
  splitPlace as splitShared
} from './place-merge.js'
import { joinPlace } from './place-jobs.js'
import { addLink, currentSnapshotOf } from './places.js'
import { againShape, placeAgainPlan } from './research-again.js'
import { MENU_FILE_PART } from './menu-items.js'
import { MENU_PHOTOS_PART } from './menu-photo-reading.js'
import { menuViewOf } from './place-view.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WO_DOMAIN_DIR } from './domain-loader.js'
import { SOCIAL_SOURCES, normalizeUrl, sourceOfUrl } from './sources.js'

const { assertPublicUrl } = await import(pathToFileURL(path.join(WO_DOMAIN_DIR, 'url-guard.mjs')).href)

// The ops door reads merge refusals from here.
export { PlaceMergeError }

/** A source collected longer ago than this is stale (P1 `places.js` SOURCE_MAX_AGE_MS). */
export const SOURCE_MAX_AGE_DAYS = 30
export const PLACE_STATES = Object.freeze(['all', 'stale', 'failing', 'revoked', 'merge'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v) => typeof v === 'string' && UUID.test(v)

/** A refusal the door turns into its status and `{error, message}` (merge/split refusals are its base class). */
export class PlaceOpsError extends PlaceMergeError {}

const iso = (v) => (v ? new Date(v).toISOString() : null)
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10)
const likeOf = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

// One row of facts per place; `$1` = now, `$2` = search pattern or null, `$3` = one place id (merged or
// not) or null for every unmerged place.
const FACTS_SQL = `
  with base as (
    select p.* from wo_place p
     where (case when $3::uuid is null then p.merged_into is null else p.id = $3::uuid end)
       and ($2::text is null
            or p.display_name ilike $2
            or exists (select 1 from wo_place_identity i where i.place_id = p.id and i.external_id ilike $2)
            or exists (select 1 from wo_place_link l where l.place_id = p.id and l.url ilike $2))
  ),
  facts as (
    select b.id, b.display_name, b.created_at, b.updated_at, b.current_snapshot_id,
           s.state as snapshot_state, s.published_at,
           (select count(distinct o.account_id) from wo_opportunity o where o.place_id = b.id)::int as accounts,
           (select count(*) from wo_opportunity o where o.place_id = b.id)::int as opportunities,
           (select count(*) from wo_place_media m where m.place_id = b.id)::int as media_total,
           (select count(*) from wo_place_media m where m.place_id = b.id and m.revoked_at is not null)::int
             as media_revoked,
           (select count(*) from wo_place_merge_candidate c
             where c.state = 'pending' and (c.url_place_id = b.id or c.google_place_id = b.id))::int as merge_pending,
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'source', ss.source, 'ref', ss.ref, 'status', ss.status,
                     'collectedAt', ss.collected_at, 'attemptedAt', ss.attempted_at, 'lastError', ss.last_error,
                     'stale', ss.collected_at is null or ss.collected_at < $1::timestamptz - interval '${SOURCE_MAX_AGE_DAYS} days')
                     order by ss.source), '[]'::jsonb)
              from wo_place_snapshot_source ss where ss.snapshot_id = b.current_snapshot_id) as sources,
           (select coalesce(jsonb_agg(jsonb_build_object('namespace', i.namespace, 'externalId', i.external_id,
                     'source', i.source) order by i.namespace, i.external_id), '[]'::jsonb)
              from wo_place_identity i where i.place_id = b.id and i.namespace <> 'merge') as identities,
           lj.id as job_id, lj.state as job_state, lj.stage as job_stage, lj.force as job_force,
           lj.updated_at as job_updated_at, lj.last_error as job_last_error,
           exists (select 1 from wo_place_job q where q.place_id = b.id and q.state = 'queued') as queued
      from base b
      left join wo_place_snapshot s on s.id = b.current_snapshot_id
      left join lateral (
        select j.* from wo_place_job j where j.place_id = b.id order by j.created_at desc, j.id desc limit 1
      ) lj on true
  ),
  graded as (
    select f.*,
           case
             when f.snapshot_state is null then 'never'
             when exists (select 1 from jsonb_array_elements(f.sources) e where (e->>'stale')::boolean) then 'stale'
             when jsonb_array_length(f.sources) = 0
                  and f.published_at < $1::timestamptz - interval '${SOURCE_MAX_AGE_DAYS} days' then 'stale'
             else 'fresh'
           end as freshness,
           (f.job_state in ('failed', 'blocked')
             or exists (select 1 from jsonb_array_elements(f.sources) e where e->'lastError' <> 'null'::jsonb))
             as failing
      from facts f
  )`

const STATE_WHERE = {
  all: 'true',
  stale: "freshness <> 'fresh'",
  failing: 'failing',
  revoked: 'media_revoked > 0',
  merge: 'merge_pending > 0'
}

const ZERO = () => ({ spentCents: 0, reservedCents: 0, unreconciledCents: 0 })

/** Spent / held / unreconciled per place for `today` and the 30 days ending today (UTC budget days). */
export async function costsOf(db, placeIds, nowMs) {
  const out = new Map(placeIds.map((id) => [id, { today: ZERO(), last30: ZERO() }]))
  if (!placeIds.length) return out
  const today = utcDay(nowMs)
  const { rows } = await db.query(
    `select place_id, (budget_day = $2::date) as today, state,
            sum(case when state = 'settled' then coalesce(actual_cents, reserved_cents) else reserved_cents end)::int
              as cents
       from wo_cost_ledger
      where place_id = any($1::uuid[]) and budget_day > $2::date - 30 and budget_day <= $2::date
        and state in ('settled', 'reserved', 'unreconciled')
      group by place_id, (budget_day = $2::date), state`,
    [placeIds, today]
  )
  const key = { settled: 'spentCents', reserved: 'reservedCents', unreconciled: 'unreconciledCents' }
  for (const r of rows) {
    const c = out.get(r.place_id)
    c.last30[key[r.state]] += r.cents
    if (r.today) c.today[key[r.state]] += r.cents
  }
  return out
}

/** Tracy's whole spend today (every place), for the daily cap. */
export async function costToday(db, nowMs) {
  const { rows } = await db.query(
    `select
       coalesce(sum(coalesce(actual_cents, reserved_cents)) filter (where state = 'settled'), 0)::int as spent,
       coalesce(sum(reserved_cents) filter (where state = 'reserved'), 0)::int as reserved,
       coalesce(sum(reserved_cents) filter (where state = 'unreconciled'), 0)::int as unreconciled
       from wo_cost_ledger where budget_day = $1::date`,
    [utcDay(nowMs)]
  )
  const r = rows[0]
  return { spentCents: r.spent, reservedCents: r.reserved, unreconciledCents: r.unreconciled }
}

function rowOf(r, cost) {
  return {
    id: r.id,
    name: r.display_name,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    identities: r.identities,
    snapshot: r.current_snapshot_id
      ? { id: r.current_snapshot_id, state: r.snapshot_state, publishedAt: iso(r.published_at) }
      : null,
    freshness: r.freshness,
    failing: r.failing,
    sources: r.sources.map((s) => ({
      ...s,
      collectedAt: iso(s.collectedAt),
      attemptedAt: iso(s.attemptedAt)
    })),
    accounts: r.accounts,
    opportunities: r.opportunities,
    cost: cost ?? { today: ZERO(), last30: ZERO() },
    lastJob: r.job_id
      ? {
          id: r.job_id,
          state: r.job_state,
          stage: r.job_stage,
          force: r.job_force,
          updatedAt: iso(r.job_updated_at),
          lastError: r.job_last_error ?? null
        }
      : null,
    nextRunQueued: r.queued,
    media: { total: r.media_total, revoked: r.media_revoked },
    mergeCandidates: r.merge_pending
  }
}

/**
 * One page of places, newest first. `cursor` is the last place id of the previous page.
 * @returns {Promise<{places: object[], nextCursor: string | null, counts: Record<string, number>}>}
 */
export async function listPlaces(db, { q = '', state = 'all', cursor = null, limit = 50, nowMs }) {
  const pattern = q.trim() ? likeOf(q.trim().slice(0, 200)) : null
  const now = new Date(nowMs).toISOString()
  const where = STATE_WHERE[state] ?? STATE_WHERE.all
  const params = [now, pattern, null, limit + 1]
  let after = ''
  if (cursor && isUuid(cursor)) {
    params.push(cursor)
    after = `and (created_at, id) < (select created_at, id from wo_place where id = $5)`
  }
  const { rows } = await db.query(
    `${FACTS_SQL} select * from graded where ${where} ${after} order by created_at desc, id desc limit $4`,
    params
  )
  const page = rows.slice(0, limit)
  const costs = await costsOf(
    db,
    page.map((r) => r.id),
    nowMs
  )
  const counted = (
    await db.query(
      `${FACTS_SQL} select count(*)::int as "all",
         count(*) filter (where ${STATE_WHERE.stale})::int as stale,
         count(*) filter (where ${STATE_WHERE.failing})::int as failing,
         count(*) filter (where ${STATE_WHERE.revoked})::int as revoked,
         count(*) filter (where ${STATE_WHERE.merge})::int as merge
       from graded`,
      [now, pattern, null]
    )
  ).rows[0]
  return {
    places: page.map((r) => rowOf(r, costs.get(r.id))),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    counts: counted
  }
}

/** The research caps P2 adds to the `/ops/wo` settings (`wo-settings.js`); null where a field is absent. */
export function researchCapsOf(settings) {
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : null)
  return {
    dailyCapCents: n(settings?.researchDailyCapCents),
    jobCapCents: n(settings?.researchJobCapCents),
    newPlacesPerAccountPerDay: n(settings?.newPlacesPerAccountPerDay)
  }
}

async function inTx(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
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

async function recordEvent(client, placeId, action, actor, detail = {}) {
  await client.query(
    'insert into wo_place_ops_event (place_id, action, actor, detail) values ($1, $2, $3, $4::jsonb)',
    [placeId, action, actor, JSON.stringify(detail)]
  )
}

async function lockPlace(client, placeId) {
  const row = (await client.query('select * from wo_place where id = $1 for update', [placeId])).rows[0]
  if (!row) throw new PlaceOpsError(404, 'PLACE_NOT_FOUND', 'Place not found.')
  return row
}

/**
 * Everything `/ops/wo` shows of one place. Each account that saved it is a principal; its email and name come from the
 * host (`host.emailOf`, `host.displayNameOf`), never from a user table here, and stay null without them. Emails are for
 * staff only: this door is behind the operator check.
 * @param {{ emailOf?: (db: any, principalId: string) => Promise<string | null>,
 *   displayNameOf?: (db: any, principalId: string) => Promise<string> }} [names]
 */
export async function placeDetail(db, placeId, nowMs, { emailOf, displayNameOf } = {}) {
  const now = new Date(nowMs).toISOString()
  const fact = (await db.query(`${FACTS_SQL} select * from graded`, [now, null, placeId])).rows[0]
  if (!fact) throw new PlaceOpsError(404, 'PLACE_NOT_FOUND', 'Place not found.')
  const placeRow = (await db.query('select merged_into from wo_place where id = $1', [placeId])).rows[0]
  const [costs, links, media, snapshots, jobs, accounts, merged, history, candidates, byProvider, searched] =
    await Promise.all([
      costsOf(db, [placeId], nowMs),
      db.query(
        'select kind, url, verified_by, evidence, created_at from wo_place_link where place_id = $1 order by kind, url',
        [placeId]
      ),
      db.query(
        `select m.*, exists (select 1 from wo_place_snapshot_media sm
                              where sm.media_id = m.id and sm.snapshot_id = p.current_snapshot_id) as in_current
           from wo_place_media m join wo_place p on p.id = m.place_id
          where m.place_id = $1 order by m.collected_at desc, m.id`,
        [placeId]
      ),
      db.query(
        `select s.*, (select count(*) from wo_place_snapshot_source ss where ss.snapshot_id = s.id)::int as sources,
                (select count(*) from wo_place_snapshot_media sm where sm.snapshot_id = s.id)::int as media
           from wo_place_snapshot s where s.place_id = $1 order by s.created_at desc limit 20`,
        [placeId]
      ),
      db.query(
        `select id, state, stage, force, attempt, last_error, created_at, updated_at
           from wo_place_job where place_id = $1 order by created_at desc limit 10`,
        [placeId]
      ),
      db.query(
        `select o.account_id as id, count(o.id)::int as opportunities, max(o.updated_at) as last_seen
           from wo_opportunity o where o.place_id = $1 group by o.account_id order by last_seen desc`,
        [placeId]
      ),
      db.query(
        `select p.id, p.display_name,
                coalesce((select jsonb_agg(jsonb_build_object('namespace', i.namespace, 'externalId', i.external_id))
                            from wo_place_identity i where i.place_id = p.id and i.namespace <> 'merge'), '[]'::jsonb)
                  as identities
           from wo_place p where p.merged_into = $1 order by p.updated_at desc`,
        [placeId]
      ),
      db.query(
        `select id, place_id, action, actor, detail, created_at from wo_place_ops_event
          where place_id = $1 or detail->>'into' = $1::text or detail->>'from' = $1::text
          order by created_at desc, id desc limit 50`,
        [placeId]
      ),
      listMergeQueue(db, 'pending', placeId),
      db.query(
        `select provider, operation,
                coalesce(sum(coalesce(actual_cents, reserved_cents)) filter (where state = 'settled'), 0)::int as spent,
                coalesce(sum(reserved_cents) filter (where state = 'reserved'), 0)::int as reserved,
                coalesce(sum(reserved_cents) filter (where state = 'unreconciled'), 0)::int as unreconciled,
                count(*) filter (where state <> 'released')::int as calls
           from wo_cost_ledger
          where place_id = $1 and budget_day > $2::date - 30 and budget_day <= $2::date
          group by provider, operation order by spent desc, provider, operation`,
        [placeId, utcDay(nowMs)]
      ),
      // The pages each social search found (pending ones wait for an operator's verdict).
      db.query(
        `select ss.source, coalesce(ss.collected->'pages', ss.coverage->'pages', '[]'::jsonb) as pages
           from wo_place p join wo_place_snapshot_source ss on ss.snapshot_id = p.current_snapshot_id
          where p.id = $1 and ss.source in ('facebook-search', 'instagram-search')`,
        [placeId]
      )
    ])
  const pagesOf = new Map(searched.rows.map((r) => [r.source, Array.isArray(r.pages) ? r.pages : []]))
  const accountRows = await Promise.all(
    accounts.rows.map(async (a) => ({
      ...a,
      email: emailOf ? ((await emailOf(db, a.id)) ?? null) : null,
      name: displayNameOf ? (await displayNameOf(db, a.id)) || null : null
    }))
  )
  const summary = rowOf(fact, costs.get(placeId))
  summary.sources = summary.sources.map((s) =>
    pagesOf.has(s.source) ? { ...s, pages: pagesOf.get(s.source) } : s
  )
  const menu = await placeMenuOf(db, placeId, {
    menuPhotos: media.rows.filter((m) => m.in_current && m.category === 'menu' && !m.revoked_at).length
  })
  return {
    place: { ...summary, mergedInto: placeRow?.merged_into ?? null },
    menu,
    links: links.rows.map((l) => ({
      kind: l.kind,
      url: l.url,
      verifiedBy: l.verified_by,
      evidence: l.evidence,
      createdAt: iso(l.created_at)
    })),
    media: media.rows.map((m) => ({
      id: m.id,
      sha256: m.sha256,
      kind: m.kind,
      mime: m.mime,
      bytes: m.bytes === null ? null : Number(m.bytes),
      width: m.width,
      height: m.height,
      status: m.status,
      category: m.category,
      caption: m.caption,
      source: m.source,
      sourceUrl: m.source_url,
      provider: m.provider,
      credit: m.credit ?? null,
      postedAt: iso(m.posted_at),
      collectedAt: iso(m.collected_at),
      jobId: m.job_id,
      inCurrentSnapshot: m.in_current,
      revokedAt: iso(m.revoked_at),
      revokeReason: m.revoke_reason
    })),
    snapshots: snapshots.rows.map((s) => ({
      id: s.id,
      state: s.state,
      jobId: s.job_id,
      baseSnapshotId: s.base_snapshot_id,
      createdAt: iso(s.created_at),
      publishedAt: iso(s.published_at),
      sources: s.sources,
      media: s.media
    })),
    jobs: jobs.rows.map((j) => ({
      id: j.id,
      state: j.state,
      stage: j.stage,
      force: j.force,
      attempt: j.attempt,
      lastError: j.last_error ?? null,
      createdAt: iso(j.created_at),
      updatedAt: iso(j.updated_at)
    })),
    accounts: accountRows.map((a) => ({
      accountId: a.id,
      email: a.email,
      name: a.name,
      opportunities: a.opportunities,
      lastSeenAt: iso(a.last_seen)
    })),
    mergedPlaces: merged.rows.map((p) => ({ id: p.id, name: p.display_name, identities: p.identities })),
    history: history.rows.map((e) => ({
      id: String(e.id),
      placeId: e.place_id,
      action: e.action,
      actor: e.actor,
      detail: e.detail,
      createdAt: iso(e.created_at)
    })),
    mergeCandidates: candidates,
    costByOperation: byProvider.rows.map((r) => ({
      provider: r.provider,
      operation: r.operation,
      spentCents: r.spent,
      reservedCents: r.reserved,
      unreconciledCents: r.unreconciled,
      calls: r.calls
    }))
  }
}

/**
 * Queue a run of the place through `place-jobs.js joinPlace` (forced unless `force` is false): the queued job
 * is reused (and marked `force`), a running one is followed by ONE queued job, a paused/blocked one is queued
 * again with its waiting requests. `outcome` says which, for the event and the answer.
 * @returns {Promise<{job: object, outcome: 'joined' | 'after-running' | 'requeued' | 'queued'}>}
 */
async function queueForcedRun(
  client,
  placeId,
  force = true,
  actor = null,
  starter = null,
  principalOf = null
) {
  const { rows } = await client.query(
    `select state from wo_place_job where place_id = $1 and state in ('queued', 'running', 'paused', 'blocked')`,
    [placeId]
  )
  const has = (state) => rows.some((r) => r.state === state)
  // The operator who pressed it pays (/ops › Usage counts staff apart), with their principal when they have one.
  const accountId = starter ? null : await operatorPrincipal(client, actor, principalOf)
  const joined = await joinPlace(client, placeId, {
    force,
    evenIfFresh: true,
    starter: starter ?? { kind: 'operator', accountId }
  })
  const outcome = has('queued')
    ? 'joined'
    : has('running')
      ? 'after-running'
      : has('paused') || has('blocked')
        ? 'requeued'
        : 'queued'
  return { job: joined.job, outcome }
}

/**
 * The principal an operator acts as, through the host (`host.principalOf`): the open layer never reads the host's own
 * user table. Null without an actor; a caller with an actor must pass the host's `principalOf`.
 */
async function operatorPrincipal(client, actor, principalOf) {
  if (!actor) return null
  if (typeof principalOf !== 'function')
    throw new TypeError("An operator action needs the host's principalOf to name who pays")
  return (await principalOf(client, actor)) ?? null
}

/** The daily cap is spent when spent + held + unreconciled reaches it (P2: unreconciled keeps counting). */
async function refuseOverCap(client, caps, nowMs) {
  if (caps?.dailyCapCents === null || caps?.dailyCapCents === undefined) return
  const t = await costToday(client, nowMs)
  if (t.spentCents + t.reservedCents + t.unreconciledCents >= caps.dailyCapCents)
    throw new PlaceOpsError(
      409,
      'DAILY_CAP_REACHED',
      "Today's research budget is used up; raise the daily cap or wait for tomorrow (UTC)."
    )
}

const jobOut = (j) => ({ id: j.id, state: j.state, force: j.force })

/** Force refresh: at most one next run, refused while today's research budget is spent. */
export async function refreshPlace(pool, placeId, { actor, caps, nowMs, principalOf }) {
  return inTx(pool, async (client) => {
    const place = await lockPlace(client, placeId)
    if (place.merged_into)
      throw new PlaceOpsError(
        409,
        'PLACE_MERGED',
        'This place was merged; refresh the place it was merged into.'
      )
    await refuseOverCap(client, caps, nowMs)
    const { job, outcome } = await queueForcedRun(client, placeId, true, actor, null, principalOf)
    await recordEvent(client, placeId, 'refresh', actor, { jobId: job.id, outcome })
    return { job: jobOut(job), outcome }
  })
}

/** The Menu of a place's current research, as /ops sees it (`menuViewOf` with each photo's cost and model). */
async function placeMenuOf(db, placeId, { menuPhotos }) {
  const { rows } = await db.query(
    `select ss.*, sp.profile as snapshot_profile
       from wo_place p
       left join wo_place_snapshot_source ss on ss.snapshot_id = p.current_snapshot_id
         and ss.source in ('${MENU_FILE_PART}', '${MENU_PHOTOS_PART}')
       left join wo_place_snapshot_profile sp on sp.snapshot_id = p.current_snapshot_id
      where p.id = $1`,
    [placeId]
  )
  if (!rows.length) return null
  const part = (name) => rows.find((r) => r.source === name) ?? null
  return menuViewOf({
    file: part(MENU_FILE_PART),
    photos: part(MENU_PHOTOS_PART),
    profile: rows[0].snapshot_profile ?? {},
    menuPhotos,
    ops: true
  })
}

/** Research again from /ops: the preview of one place (`research-again.js`). */
export async function placeAgainPreview(pool, placeId, { nowMs, keys, settings, domain, onlyParts = null }) {
  const place = (await pool.query('select id, merged_into from wo_place where id = $1', [placeId])).rows[0]
  if (!place) throw new PlaceOpsError(404, 'PLACE_NOT_FOUND', 'Place not found.')
  return {
    plan: againShape(await placeAgainPlan(pool, placeId, { now: nowMs, keys, settings, domain, onlyParts })),
    payer: 'operator'
  }
}

/**
 * Research again from /ops: only the parts due, frozen into a new run the operator pays for; a run already going is
 * joined as it is. Refused while today's research budget is spent, and with NOTHING_DUE when nothing is due.
 */
export async function researchAgainPlace(
  pool,
  placeId,
  { actor, caps, nowMs, keys, settings, domain, principalOf, onlyParts = null }
) {
  return inTx(pool, async (client) => {
    const place = await lockPlace(client, placeId)
    if (place.merged_into)
      throw new PlaceOpsError(
        409,
        'PLACE_MERGED',
        'This place was merged; research the place it was merged into.'
      )
    await refuseOverCap(client, caps, nowMs)
    const plan = await placeAgainPlan(client, placeId, { now: nowMs, keys, settings, domain, onlyParts })
    if (!plan.run.length)
      throw Object.assign(
        new PlaceOpsError(
          409,
          'NOTHING_DUE',
          'Everything about this place is up to date; nothing to look at again.'
        ),
        { plan: againShape(plan) }
      )
    const accountId = await operatorPrincipal(client, actor, principalOf)
    const joined = await joinPlace(client, placeId, {
      againPlan: plan,
      now: nowMs,
      starter: { kind: 'operator', accountId }
    })
    await recordEvent(client, placeId, 'research-again', actor, {
      jobId: joined.job.id,
      joined: Boolean(joined.joined),
      parts: plan.run.map((r) => r.part)
    })
    return { job: jobOut(joined.job), joined: Boolean(joined.joined), plan: againShape(plan) }
  })
}

/**
 * Name a social page on the place's current snapshot without collecting it: Research again plans a source by its
 * row's ref (`placeAgainPlan`), as a run's discovery step names every link.
 */
async function nameOnSnapshot(client, placeId, kind, url) {
  const snapshot = await currentSnapshotOf(client, placeId)
  if (!snapshot) return
  await client.query(
    `insert into wo_place_snapshot_source (snapshot_id, source, ref) values ($1, $2, $3)
     on conflict (snapshot_id, source) do update set ref = coalesce(wo_place_snapshot_source.ref, excluded.ref)`,
    [snapshot.id, kind, url]
  )
}

/**
 * An operator's verdict on a social page a web search left `pending` (only /ops decides: the page becomes a source
 * of the place for every account). `confirm` links it; `reject` marks it so the card stops asking.
 */
export async function judgeSocialPage(pool, placeId, { url, verdict, actor }) {
  if (verdict !== 'confirm' && verdict !== 'reject')
    throw new PlaceOpsError(400, 'INVALID_VERDICT', 'Send "verdict" as "confirm" or "reject".')
  let network = null
  try {
    network = sourceOfUrl(url)
  } catch {}
  if (network !== 'facebook' && network !== 'instagram')
    throw new PlaceOpsError(
      400,
      'INVALID_URL',
      'Send the url of a Facebook or Instagram page the search found.'
    )
  return inTx(pool, async (client) => {
    await lockPlace(client, placeId)
    const snapshot = await currentSnapshotOf(client, placeId)
    const row = snapshot?.sources.find((s) => s.source === `${network}-search`)
    const pages = row?.collected?.pages ?? row?.coverage?.pages ?? []
    const at = pages.findIndex((p) => normalizeUrl(p.url) === normalizeUrl(url))
    if (at < 0)
      throw new PlaceOpsError(404, 'PAGE_NOT_FOUND', "That page is not one this place's search found.")
    const page = pages[at]
    const judged = pages.map((p, i) =>
      i === at
        ? {
            ...p,
            verdict: verdict === 'confirm' ? 'confirmed' : 'rejected',
            judgedBy: actor,
            judgedAt: new Date().toISOString()
          }
        : p
    )
    const column = row.collected?.pages ? 'collected' : 'coverage'
    await client.query(
      `update wo_place_snapshot_source set ${column} = jsonb_set(coalesce(${column}, '{}'::jsonb), '{pages}', $3::jsonb)
        where snapshot_id = $1 and source = $2`,
      [snapshot.id, `${network}-search`, JSON.stringify(judged)]
    )
    if (verdict === 'confirm') {
      await addLink(client, placeId, network, normalizeUrl(page.url), 'operator', {
        ...page.evidence,
        confirmedBy: actor,
        from: 'social-search'
      })
      await nameOnSnapshot(client, placeId, network, normalizeUrl(page.url))
    }
    await recordEvent(client, placeId, 'social-page', actor, { url: page.url, network, verdict })
    return { page: judged[at] }
  })
}

/**
 * An operator names a social page of the place that no search found (pilot 24/10/2026: Kirami's Facebook page).
 * Like a confirmed search page it becomes the place's source for every account; the next run collects it.
 * The URL is untrusted: a social network's host, through the URL guard (`resolve` answers its DNS lookup).
 */
export async function addSocialPage(pool, placeId, { url, actor, resolve }) {
  const network = typeof url === 'string' ? sourceOfUrl(url) : null
  if (!SOCIAL_SOURCES.includes(network))
    throw new PlaceOpsError(
      400,
      'INVALID_URL',
      'Send the url of a Facebook, Instagram, TikTok or YouTube page.'
    )
  try {
    await assertPublicUrl(url, { resolve })
  } catch (error) {
    if (error?.code !== 'URL_BLOCKED') throw error
    throw new PlaceOpsError(422, 'URL_BLOCKED', `That address is refused (${error.reason}).`)
  }
  const link = { kind: network, url: normalizeUrl(url) }
  return inTx(pool, async (client) => {
    await lockPlace(client, placeId)
    const known = await client.query(
      'select 1 from wo_place_link where place_id = $1 and kind = $2 and url = $3',
      [placeId, link.kind, link.url]
    )
    if (known.rows.length) return { link, added: false }
    await addLink(client, placeId, link.kind, link.url, 'operator', { from: 'operator', addedBy: actor })
    await nameOnSnapshot(client, placeId, link.kind, link.url)
    await recordEvent(client, placeId, 'social-page', actor, { url: link.url, network, verdict: 'added' })
    return { link, added: true }
  })
}

/**
 * Queue the place's research again for a legacy operator action (`wo-operator-fence.js`): not forced
 * (fresh sources are not collected again) unless `force`, and the opportunity's latest unanswered
 * request follows the place job. No caps here: the run reserves its own calls.
 */
export async function requeuePlaceFor(
  client,
  placeId,
  opportunityId,
  { actor, action, force = false, principalOf = null }
) {
  await lockPlace(client, placeId)
  // Done for a customer's opportunity: its owner's research, so its owner pays, not the operator.
  const owner = (await client.query('select account_id from wo_opportunity where id = $1', [opportunityId]))
    .rows[0]
  const { job } = await queueForcedRun(
    client,
    placeId,
    force,
    actor,
    owner?.account_id ? { kind: 'account', accountId: owner.account_id } : null,
    principalOf
  )
  await client.query(
    `update wo_job set place_job_id = $2, state = $3, last_error = null, updated_at = now()
      where id = (select id from wo_job where opportunity_id = $1 and kind = 'research'
                   order by created_at desc limit 1)
        and result_snapshot_id is null`,
    [opportunityId, job.id, job.state === 'running' ? 'running' : 'queued']
  )
  await recordEvent(client, placeId, 'refresh', actor, { jobId: job.id, via: action, opportunityId })
  return job
}

/** Revoke (or restore) one picture/video of the place. A revoked row is never built or handed off again. */
export async function setMediaRevoked(pool, placeId, mediaId, { revoked, reason, actor }) {
  return inTx(pool, async (client) => {
    const m = (
      await client.query('select * from wo_place_media where id = $1 and place_id = $2 for update', [
        mediaId,
        placeId
      ])
    ).rows[0]
    if (!m) throw new PlaceOpsError(404, 'MEDIA_NOT_FOUND', 'Media not found.')
    const changed = revoked ? !m.revoked_at || m.revoke_reason !== reason : Boolean(m.revoked_at)
    let row = m
    if (changed) {
      row = (
        await client.query(
          `update wo_place_media set revoked_at = $2, revoke_reason = $3 where id = $1
           returning id, revoked_at, revoke_reason`,
          [mediaId, revoked ? (m.revoked_at ?? new Date()) : null, revoked ? reason : null]
        )
      ).rows[0]
      await recordEvent(client, placeId, revoked ? 'revoke' : 'unrevoke', actor, {
        mediaId,
        sha256: m.sha256,
        ...(revoked ? { reason } : { previousReason: m.revoke_reason })
      })
    }
    return { id: row.id, revokedAt: iso(row.revoked_at), revokeReason: row.revoke_reason ?? null }
  })
}

/**
 * Merge `fromId` into `intoId` (`/ops/wo` › Places): the one implementation in `opportunities/place-merge.js`,
 * which the automatic URL ↔ Google merge calls too. @returns {Promise<{from, into, opportunities, requests}>}
 */
export async function mergePlaces(pool, fromId, intoId, { actor }) {
  const r = await mergeShared(pool, intoId, fromId, { actor })
  return { from: r.loser, into: r.survivor, opportunities: r.opportunities, requests: r.requests }
}

/** Take `identity` off place `placeId` (`opportunities/place-merge.js splitPlace`). */
export async function splitPlace(pool, placeId, identity, { actor }) {
  return splitShared(pool, placeId, [identity], { actor })
}

/**
 * URL ↔ Google merge candidates in `state`, optionally only those naming `placeId`. `waiting` = approved
 * but not applied yet (a place was busy, or the apply failed: `applyError`).
 */
export async function listMergeQueue(db, state = 'pending', placeId = null) {
  const { rows } = await db.query(
    `select c.*, u.display_name as url_name, g.display_name as google_name,
            (select jsonb_agg(i.external_id order by i.external_id) from wo_place_identity i
              where i.place_id = u.id and i.namespace = 'url') as url_ids,
            (select jsonb_agg(i.external_id order by i.external_id) from wo_place_identity i
              where i.place_id = g.id and i.namespace = 'google') as google_ids
       from wo_place_merge_candidate c
       join wo_place u on u.id = c.url_place_id
       join wo_place g on g.id = c.google_place_id
      where (case when $1 = 'waiting' then c.state = 'approved' and c.applied_at is null else c.state = $1 end)
        and ($2::uuid is null or c.url_place_id = $2 or c.google_place_id = $2)
      order by c.score desc, c.created_at desc limit 200`,
    [state, placeId]
  )
  return rows.map((c) => ({
    id: c.id,
    state: c.state,
    score: c.score,
    evidence: c.evidence,
    createdAt: iso(c.created_at),
    decidedBy: c.decided_by,
    decidedAt: iso(c.decided_at),
    appliedAt: iso(c.applied_at),
    applyError: c.apply_error ?? null,
    urlPlace: { id: c.url_place_id, name: c.url_name, identities: c.url_ids ?? [] },
    googlePlace: { id: c.google_place_id, name: c.google_name, identities: c.google_ids ?? [] }
  }))
}

/** Approve (merge the URL place into the Google place) or reject one pending candidate. */
export async function decideMergeCandidate(pool, candidateId, decision, actor) {
  return inTx(pool, async (client) => {
    const c = (
      await client.query('select * from wo_place_merge_candidate where id = $1 for update', [candidateId])
    ).rows[0]
    if (!c) throw new PlaceOpsError(404, 'CANDIDATE_NOT_FOUND', 'Merge candidate not found.')
    if (c.state !== 'pending')
      throw new PlaceOpsError(409, 'ALREADY_DECIDED', `This candidate was already ${c.state}.`)
    let applied = false
    if (decision === 'approve') {
      // A place being researched: the approval stands and the maintenance sweep merges once both are idle.
      await client.query('savepoint approve_merge')
      try {
        await mergeIn(client, c.google_place_id, c.url_place_id, { actor, copyLinks: false, candidateId })
        applied = true
      } catch (error) {
        if (error?.code !== 'PLACE_BUSY') throw error
        await client.query('rollback to savepoint approve_merge')
      }
    }
    const state = decision === 'approve' ? 'approved' : 'rejected'
    await client.query(
      `update wo_place_merge_candidate set state = $2, decided_by = $3, decided_at = now(),
         applied_at = case when $4 then now() end where id = $1`,
      [candidateId, state, actor, applied]
    )
    if (decision === 'reject')
      await recordEvent(client, c.url_place_id, 'reject-merge', actor, {
        candidateId,
        from: c.url_place_id,
        google: c.google_place_id
      })
    else
      await recordEvent(client, c.google_place_id, 'approve-merge', actor, {
        candidateId,
        google: c.google_place_id,
        applied
      })
    return { id: candidateId, state, applied }
  })
}
