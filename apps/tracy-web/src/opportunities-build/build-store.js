/**
 * The demo build tables (`wo_revision`, `wo_build`) of Website Opportunities, split from the open
 * layer's `website-opportunities/src/store.js` (ADR 0036): that layer never reads them, only the builder does.
 */

import { choiceKey } from './build-choice.js'

export async function revisionOf(pool, accountId, revisionId) {
  const { rows } = await pool.query('select * from wo_revision where id = $1 and account_id = $2', [
    revisionId,
    accountId
  ])
  return rows[0] ?? null
}

export async function revisionsOf(pool, opportunityId) {
  const { rows } = await pool.query(
    `select id, opportunity_id, n, research_hash, created_at
     from wo_revision where opportunity_id = $1 order by n desc`,
    [opportunityId]
  )
  return rows
}

export async function buildsOfOpportunity(pool, opportunityId) {
  const { rows } = await pool.query(
    `select b.* from wo_build b join wo_revision r on r.id = b.revision_id
     where r.opportunity_id = $1 order by b.created_at desc`,
    [opportunityId]
  )
  return rows
}

/** @returns {Promise<{row: object, created: boolean}>} the build of this request id, made once. */
export async function insertBuild(pool, { accountId, revisionId, requestId, buildId, choice }) {
  if (!choice) throw Object.assign(new Error('A build needs its choice'), { code: 'BUILD_CHOICE_REQUIRED' })
  const { rows } = await pool.query(
    `insert into wo_build (account_id, revision_id, request_id, build_id, choice, choice_key)
     values ($1, $2, $3, $4, $5::jsonb, $6)
     on conflict (account_id, request_id) do nothing returning *`,
    [accountId, revisionId, requestId, buildId, JSON.stringify(choice), choiceKey(choice)]
  )
  if (rows[0]) return { row: rows[0], created: true }
  const existing = await pool.query('select * from wo_build where account_id = $1 and request_id = $2', [
    accountId,
    requestId
  ])
  return { row: existing.rows[0], created: false }
}

/** Record the site label a build asks the create door for. */
export async function saveBuildLabel(pool, id, label) {
  const { rows } = await pool.query(
    'update wo_build set label = $2, updated_at = now() where id = $1 returning *',
    [id, label]
  )
  return rows[0]
}

export async function buildOf(pool, accountId, id) {
  const { rows } = await pool.query('select * from wo_build where id = $1 and account_id = $2', [
    id,
    accountId
  ])
  return rows[0] ?? null
}

export async function saveBuildReceipt(pool, id, { state, receipt, siteKey, siteJobId }) {
  const { rows } = await pool.query(
    `update wo_build set state = $2, receipt = $3::jsonb, site_key = coalesce($4, site_key),
       site_job_id = coalesce($5, site_job_id), updated_at = now()
     where id = $1 returning *`,
    [id, state, JSON.stringify(receipt ?? null), siteKey ?? null, siteJobId ?? null]
  )
  return rows[0]
}

/**
 * Fill a build's site from `site_creation` (the create door's own idempotency book), for a build
 * whose receipt was never written (the process died after the provision started).
 */
export async function reconcileBuild(pool, build) {
  if (build.site_key) return build
  const { rows } = await pool.query(
    `select site_key, job_id, state from site_creation where account_id = $1 and build_id = $2`,
    [build.account_id, String(build.build_id)]
  )
  const creation = rows[0]
  if (!creation?.site_key) return build
  const updated = await pool.query(
    `update wo_build set site_key = $2, site_job_id = coalesce(site_job_id, $3),
       state = case when state = 'requesting' then 'provisioning' else state end, updated_at = now()
     where id = $1 returning *`,
    [build.id, creation.site_key, creation.job_id ?? null]
  )
  return updated.rows[0]
}

/** The build states a provision can still end from: a later state is the build's own ending, never overwritten. */
const BUILD_OPEN = ['requesting', 'provisioning']

/**
 * Builds still waiting whose provision has ended in the create door's own book (`site_creation` `done`/`failed`),
 * with the job's last word for a failure's reason. Oldest first and capped, like every sweep.
 * @param {import('pg').Pool} pool
 * @param {{id?: string | null, revisionId?: string | null, limit?: number}} [which] - one build, a revision's, or a batch
 */
export async function endedBuilds(pool, { id = null, revisionId = null, limit = 50 } = {}) {
  const { rows } = await pool.query(
    `select b.id, sc.state as ending, sc.job_id, j.detail as job_detail from wo_build b
       join site_creation sc on sc.account_id = b.account_id and sc.build_id = b.build_id::text
       left join job j on j.id = sc.job_id
     where b.state = any($1::text[]) and sc.state in ('done', 'failed') and ($2::uuid is null or b.id = $2)
       and ($3::uuid is null or b.revision_id = $3)
     order by b.updated_at asc limit $4`,
    [BUILD_OPEN, id, revisionId, limit]
  )
  return rows
}

/**
 * Write how a build's provision ended: `done`, or `failed` with `receipt.failure` beside the create door's own answer.
 * Only from a state a provision can end from, so a late reader never undoes a retry that already started.
 * @returns {Promise<object | null>} the row, or null when it had moved on
 */
export async function endBuild(pool, id, { state, failure = null }) {
  const { rows } = await pool.query(
    `update wo_build set state = $2,
       receipt = case when $3::jsonb is null then receipt else coalesce(receipt, '{}'::jsonb) || jsonb_build_object('failure', $3::jsonb) end,
       updated_at = now()
     where id = $1 and state = any($4::text[]) returning *`,
    [id, state, failure ? JSON.stringify(failure) : null, BUILD_OPEN]
  )
  return rows[0] ?? null
}

/**
 * A build left `requesting` with no site for `staleMs` (its process died before the create door answered) reads
 * `failed` `REQUEST_LOST`, so it neither holds the revision's one live build for ever nor spins on the page.
 * @returns {Promise<object | null>} the row when it was lost, else null
 */
export async function loseStaleRequest(pool, id, staleMs) {
  const { rows } = await pool.query(
    `update wo_build set state = 'failed', updated_at = now(),
       receipt = coalesce(receipt, '{}'::jsonb) || jsonb_build_object('failure',
         jsonb_build_object('code', 'REQUEST_LOST', 'reason', 'the site was never asked for', 'at', now()))
     where id = $1 and state = 'requesting' and site_key is null
       and updated_at < now() - ($2::int * interval '1 millisecond')
       and not exists (select 1 from site_creation sc where sc.account_id = wo_build.account_id
                       and sc.build_id = wo_build.build_id::text)
     returning *`,
    [id, staleMs]
  )
  return rows[0] ?? null
}

/** The build states that hold a (brief, choice)'s one site. A positive list: a state added later (`deleted`) frees it. */
export const BUILD_LIVE = ['requesting', 'provisioning', 'done']

/**
 * The live build (`BUILD_LIVE`, its demo not deleted) of this brief with the same choice (`choiceKey`), other than
 * the one of `requestId`, or null. One brief feeds demos of different choices; the same choice twice is the reload
 * that made a second site (wo2, 19/10/2026). Read inside `withRevisionLock`, so two presses cannot both find none.
 */
export async function liveBuildOf(client, revisionId, requestId, key) {
  const { rows } = await client.query(
    `select * from wo_build where revision_id = $1 and request_id <> $2 and state = any($3::text[])
       and demo_deleted_at is null and choice_key = $4
     order by created_at desc limit 1`,
    [revisionId, requestId, BUILD_LIVE, key]
  )
  return rows[0] ?? null
}

/** Run `fn(client)` in a transaction holding the revision's build lock (one live build per revision). */
export async function withRevisionLock(pool, revisionId, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`wo-build:${revisionId}`])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function siteOfBuild(pool, build) {
  if (!build.site_key) return { site: null, siteJob: null }
  const [site, creation] = await Promise.all([
    pool.query('select site_key, address, label from site where site_key = $1', [build.site_key]),
    pool.query('select job_id, state from site_creation where account_id = $1 and build_id = $2', [
      build.account_id,
      String(build.build_id)
    ])
  ])
  const s = site.rows[0]
  const c = creation.rows[0]
  return {
    site: s ? { key: s.site_key, address: s.address ?? null } : { key: build.site_key, address: null },
    siteJob: c ? { id: c.job_id ?? build.site_job_id ?? null, state: c.state } : null
  }
}

/** The site row a session is made on (`lib/site-session-ahead.js`), or null. */
export async function siteRowOf(pool, siteKey) {
  const { rows } = await pool.query(
    'select site_key, label, host, platform, port, publish from site where site_key = $1',
    [siteKey]
  )
  return rows[0] ?? null
}

/**
 * The stored media of a revision's asset manifest, in manifest order. Access is THROUGH THE REVISION: the
 * caller read it as the account's own, and the manifest names each picture. An entry with `origin: 'place'`
 * is a `wo_place_media` row, read only when its sha256 is the manifest's and it is not revoked, with its
 * credit and latest vision label where the per-account rows keep them (`labels`); any other entry is the
 * account's own `wo_media` row, as before shared research.
 */
export async function buildPlaced(pool, accountId, revision) {
  const manifest = (revision.asset_manifest ?? []).filter((a) => a?.id)
  if (!manifest.length) return []
  const own = manifest.filter((a) => a.origin !== 'place').map((a) => a.id)
  const place = manifest.filter((a) => a.origin === 'place')
  const rows = []
  if (own.length)
    rows.push(
      ...(
        await pool.query(
          `select id, kind, mime, bytes, sha256, object_key, source, source_url, width, height, labels,
             caption,alt,post_id,posted_at from wo_media
           where account_id = $1 and id = any($2::uuid[]) and status = 'stored'`,
          [accountId, own]
        )
      ).rows
    )
  if (place.length) {
    const sha = new Map(place.map((a) => [a.id, a.sha256]))
    const { rows: shared } = await pool.query(
      `select m.id, m.kind, m.mime, m.bytes, m.sha256, m.object_key, m.source, m.source_url, m.width, m.height,
         m.caption,m.alt,m.post_id,m.posted_at,
         coalesce(m.labels, '{}'::jsonb)
           || case when m.credit is null then '{}'::jsonb else jsonb_build_object('credit', m.credit) end
           || coalesce((select jsonb_build_object('vision', jsonb_build_object('key', a.version, 'model', a.model,
                 'at', a.updated_at, 'labels', a.result))
               from wo_media_analysis a where a.media_sha256 = m.sha256 and a.state = 'done'
               order by a.updated_at desc limit 1), '{}'::jsonb) as labels
       from wo_place_media m where m.id = any($1::uuid[]) and m.status = 'stored' and m.revoked_at is null`,
      [[...sha.keys()]]
    )
    rows.push(...shared.filter((r) => sha.get(r.id) === r.sha256))
  }
  const byId = new Map(rows.map((r) => [r.id, r]))
  return manifest.map((a) => byId.get(a.id)).filter(Boolean)
}

/** A hand-off the QA gate already judged (`completed`, `needs-review`) is never rewritten by a later press. */
export async function saveHandoff(pool, buildId, handoff) {
  await pool.query(
    `update wo_build set handoff = $2::jsonb, updated_at = now()
      where id = $1 and (handoff is null or handoff->>'state' not in ('completed', 'needs-review'))`,
    [buildId, JSON.stringify(handoff)]
  )
}
