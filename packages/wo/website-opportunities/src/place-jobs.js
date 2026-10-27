/**
 * Place jobs (migration 134): ONE research run of a place serves every account's request for it.
 *
 * 🔒 THE LEASE IS THE ONLY RIGHT TO WRITE, as for `wo_job` (`store.js`): a claim bumps `lease_token`, every
 * write of the run is `fenced({table: 'wo_place_job'})`, and the publish moves `wo_place.current_snapshot_id`
 * in the SAME transaction that checks the token. A worker whose lease was taken publishes nothing; the
 * snapshot it prepared stays `preparing` for the worker that took over.
 * 🔒 A REQUEST MIRRORS ITS PLACE JOB. A request (`wo_job` with `place_job_id`) has no lease of its own; its
 * `state` is written in the same transaction as the place job's claim and finish, so the My opportunities
 * list, the counts and the bulk actions keep reading `wo_job` as before.
 * At most one running and one queued job per place (two partial unique indexes): a Force while a run is
 * going queues at most ONE next run, which is claimed only once the running one ends.
 */

import { currentSnapshotOf, privateRefsDue, snapshotDue, snapshotFresh } from './places.js'
import { JobActiveError, ensureSource } from './store.js'

export const PLACE_JOB_TABLE = 'wo_place_job'

/** SQL: a stranger on `/find` waits on the place job aliased `job` (`wo_place_public_request`). */
const PUBLIC_DEMAND = (job) =>
  `exists(select 1 from wo_place_public_request pr where pr.place_job_id = ${job}.id)`

/** The lease of a claimed place job, as `fenced`/`checkpoint`/`heartbeat` take it. */
export const placeLease = (job) => ({ table: PLACE_JOB_TABLE, jobId: job.id, token: String(job.lease_token) })

/**
 * What a request for this place joins, under the place row lock (`client` is in a transaction):
 *   `{current, fresh}`   no run is due (`snapshotDue`): the request is answered with the current snapshot. `fresh`
 *                        says whether its data is current (`snapshotFresh`); false when a source is old but its
 *                        retry is still cooling down. Never with `force`, nor `evenIfFresh` (an operator's retry,
 *                        which runs without collecting again what is not due), nor when the snapshot was published
 *                        before `staleBefore` (the asker added a link since)
 *   `{job}`              the place job that will answer it: the active one, a paused one queued again, or a
 *                        new one. With `force`, a running job is followed by at most one queued `force` job.
 *                        `newPlace: true` when it is the first job the place ever had.
 * `starter` (migration 167): who pays the run's model calls. Stamped only when this call CREATES the run or STARTS it
 * again (a stopped run queued again, a background run promoted to a full one); joining a waiting or running run pays
 * nothing. `{kind: 'account' | 'operator', accountId?}`, `{kind: 'public' | 'none'}`; a campaign run is its campaign's.
 */
export async function joinPlace(
  client,
  placeId,
  {
    force = false,
    evenIfFresh = false,
    now = Date.now(),
    prefetchCampaignId = null,
    requiredSources = {},
    onlySource = null,
    starter = null,
    againPlan = null,
    staleBefore = null
  } = {}
) {
  // A restart with no known starter keeps the run's recorded one (`coalesce` in the updates below).
  const by = prefetchCampaignId ? 'campaign' : (starter?.kind ?? null)
  const byAccount = prefetchCampaignId ? null : (starter?.accountId ?? null)
  // Non-key locking still serializes joins/publication, but admits a claimant's snapshot FK key-share.
  await client.query('select 1 from wo_place where id = $1 for no key update', [placeId])
  if (requiredSources['google-maps']) {
    const googleIdentity =
      (
        await client.query(
          "select 1 from wo_place_identity where place_id=$1 and namespace='google' limit 1",
          [placeId]
        )
      ).rows.length > 0
    if (!googleIdentity) {
      const { ['google-maps']: _maps, ...eligible } = requiredSources
      requiredSources = eligible
    }
  }
  // A place with nothing researched has no part to refresh: the whole research runs.
  if (onlySource && !(await currentSnapshotOf(client, placeId))) onlySource = null
  if (onlySource) {
    // One part again, nothing else: a whole run or a run of the same part waiting or running answers it; a queued run
    // of another part refuses it (one queued run per place), a running one is followed by this part's own run.
    const active = (
      await client.query(
        `select * from wo_place_job where place_id = $1 and state in ('queued', 'running')
         order by (state = 'queued') desc, created_at desc`,
        [placeId]
      )
    ).rows
    const answers = active.find((j) => !j.only_source || j.only_source === onlySource)
    if (answers) return { job: answers }
    if (active.some((j) => j.state === 'queued')) throw new JobActiveError(null)
    const { rows } = await client.query(
      `insert into wo_place_job (place_id, force, work_priority, research_mode, only_source, started_by, started_by_account_id)
       values ($1, false, 0, 'full', $2, $3, $4) returning *`,
      [placeId, onlySource, by, byAccount]
    )
    return { job: rows[0] }
  }
  if (againPlan) {
    // Research again: a run already queued or running answers it as it is (never widened to the plan); a stopped
    // run is queued again holding the plan; otherwise a new run holds it.
    const active = (
      await client.query(
        `select * from wo_place_job where place_id = $1 and state in ('queued', 'running')
         order by (state = 'running') desc, created_at for update`,
        [placeId]
      )
    ).rows
    if (active.length) return { job: active[0], joined: true }
    const frozen = JSON.stringify({ run: againPlan.run, ceilingCents: againPlan.ceilingCents })
    const stopped = (
      await client.query(
        `update wo_place_job set state = 'queued', again_plan = $2::jsonb, force = false, only_source = null,
           last_error = null, work_priority = 0, research_mode = 'full', updated_at = now(),
           started_by = coalesce($3, started_by),
           started_by_account_id = case when $3::text is null then started_by_account_id else $4::uuid end
         where id = (select id from wo_place_job where place_id = $1 and state in ('paused', 'blocked')
                     order by created_at desc limit 1)
         returning *`,
        [placeId, frozen, by, byAccount]
      )
    ).rows[0]
    if (stopped) return { job: stopped }
    const { rows } = await client.query(
      // `created_at` from the caller's clock: the daily Research again limits count by it.
      `insert into wo_place_job (place_id, force, work_priority, research_mode, again_plan, started_by, started_by_account_id,
         created_at)
       values ($1, false, 0, 'full', $2::jsonb, $3, $4, $5) returning *`,
      [placeId, frozen, by, byAccount, new Date(now)]
    )
    return { job: rows[0] }
  }
  if (!force && !evenIfFresh) {
    const snapshot = await currentSnapshotOf(client, placeId)
    // `staleBefore`: the asker added a link after this snapshot was published, so it is not current for them.
    const outdated =
      Boolean(staleBefore) &&
      Boolean(snapshot?.published_at) &&
      new Date(snapshot.published_at).getTime() < new Date(staleBefore).getTime()
    if (!outdated && !snapshotDue(snapshot, now, requiredSources))
      return { current: snapshot, fresh: snapshotFresh(snapshot, now, requiredSources) }
  }
  const active = (
    await client.query(
      `select * from wo_place_job where place_id = $1 and state in ('queued', 'running')
       order by (state = 'queued') desc, created_at desc for update`,
      [placeId]
    )
  ).rows
  const queued = active.find((j) => j.state === 'queued')
  const running = active.find((j) => j.state === 'running')
  // A request for the whole research makes a waiting one-part run a whole one: it is a superset.
  if (queued?.only_source) {
    await client.query('update wo_place_job set only_source = null, updated_at = now() where id = $1', [
      queued.id
    ])
    queued.only_source = null
  }
  if (queued) {
    if (!prefetchCampaignId && queued.prefetch_campaign_id) {
      const promoted = (
        await client.query(
          `update wo_place_job set work_priority=0, research_mode='full', stage='discovery', updated_at=now(),
           started_by=coalesce($2, started_by),
           started_by_account_id=case when $2::text is null then started_by_account_id else $3::uuid end
         where id=$1 and state='queued' returning *`,
          [queued.id, by, byAccount]
        )
      ).rows[0]
      if (promoted) {
        if (promoted.snapshot_id)
          await client.query("update wo_place_snapshot set enrichment_scope='full' where id=$1", [
            promoted.snapshot_id
          ])
        Object.assign(queued, promoted)
      }
    }
    if (force && !queued.force)
      await client.query('update wo_place_job set force = true, updated_at = now() where id = $1', [
        queued.id
      ])
    return { job: { ...queued, force: queued.force || force } }
  }
  // A full run serves a joining user; promotion changes priority, never its billing identity.
  if (running && !force && !running.only_source && (prefetchCampaignId || running.research_mode === 'full')) {
    if (!prefetchCampaignId && running.work_priority === 1) {
      await client.query('update wo_place_job set work_priority=0 where id=$1', [running.id])
      running.work_priority = 0
    }
    return { job: running }
  }
  if (!running) {
    // A run stopped on a quota or the switch keeps its cursors: queue it again rather than start over.
    const stopped = (
      await client.query(
        `select * from wo_place_job where place_id = $1 and state in ('paused', 'blocked')
         order by created_at desc limit 1 for update`,
        [placeId]
      )
    ).rows[0]
    if (stopped) {
      // The background campaign may observe user work, but never resume its paid context.
      if (prefetchCampaignId && !stopped.prefetch_campaign_id) return { job: stopped }
      const { rows } = await client.query(
        `update wo_place_job set state = 'queued', force = force or $2, last_error = null, updated_at = now(),
         stage=case when prefetch_campaign_id is not null and $3::text is null then 'discovery' else stage end,
         work_priority=case when $3::text is null then 0 else work_priority end,
         research_mode=case when $3::text is null then 'full' else research_mode end,
         started_by=coalesce($4, started_by),
         started_by_account_id=case when $4::text is null then started_by_account_id else $5::uuid end
         where id = $1 returning *`,
        [stopped.id, force, prefetchCampaignId, by, byAccount]
      )
      if (!prefetchCampaignId && rows[0].snapshot_id)
        await client.query("update wo_place_snapshot set enrichment_scope='full' where id=$1", [
          rows[0].snapshot_id
        ])
      await client.query(
        `update wo_job set state = 'queued', last_error = null, updated_at = now()
         where place_job_id = $1 and result_snapshot_id is null and state in ('paused', 'blocked')`,
        [stopped.id]
      )
      return { job: rows[0] }
    }
  }
  const { rows } = await client.query(
    `insert into wo_place_job (place_id, force, prefetch_campaign_id,work_priority,research_mode,started_by,started_by_account_id)
      values ($1,$2,$3,case when $3::text is null then 0 else 1 end,
      coalesce((select research_mode from wo_prefetch_campaign where id=$3),'full'),$4,$5) returning *`,
    [placeId, force, prefetchCampaignId, by, byAccount]
  )
  // `fresh`: nothing was ever researched for this place (the abuse limit counts only those, `apify-budget.js`).
  const researched = (
    await client.query('select 1 from wo_place_job where place_id = $1 and id <> $2 limit 1', [
      placeId,
      rows[0].id
    ])
  ).rows[0]
  return { job: rows[0], newPlace: !researched }
}

/**
 * Take one place job: queued with no running sibling, or running with an expired lease. The token goes
 * up by one, the job's snapshot is prepared on first claim (sources and media carried over from the
 * current one), and its waiting requests read `running`.
 * @returns {Promise<object | null>} the claimed job (with `snapshot_id`)
 */
export async function claimPlaceJob(pool, owner, leaseMs, { kind = 'all' } = {}) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    // Separate from the executor's session lock: claim callers may use different pool connections.
    await client.query('select pg_advisory_xact_lock($1)', [7_243_062])
    await client.query(`update wo_place_job j set work_priority=1
      where j.prefetch_campaign_id is not null and j.work_priority=0
        and (j.state='queued' or (j.state='running' and j.lease_until<now()))
        and not exists(select 1 from wo_job r where r.place_job_id=j.id and r.result_snapshot_id is null
          and r.state in ('queued','running','paused','blocked'))
        and not ${PUBLIC_DEMAND('j')}`)
    // Fence every expired background lease before measuring the single running slot.
    // A promoted job whose last user cancelled can otherwise deadlock a second expired job.
    await client.query(`update wo_place_job j set state=case
      when j.attempt>=3 or exists(select 1 from wo_place_job q where q.place_id=j.place_id and q.state='queued') then 'failed'
      when exists(select 1 from wo_prefetch_campaign c where c.id=j.prefetch_campaign_id and c.enabled
        and (c.seed_source->>'fetchedAt')::timestamptz>now()-interval '30 days') then 'queued'
      else 'paused' end,
      lease_token=lease_token+1,lease_owner=null,lease_until=null,
      last_error=jsonb_build_object('code',case when j.attempt>=3 then 'PREFETCH_RETRY_LIMIT' else 'PREFETCH_STOPPED' end)
      where j.work_priority=1 and j.state='running' and j.lease_until<now()`)
    const { rows } = await client.query(
      `with next as (
         select id from wo_place_job pj
         where ($3='all' or ($3='user' and pj.work_priority=0) or ($3='prefetch' and pj.work_priority=1))
           and (pj.work_priority=0 or (pj.attempt<3 and (
             exists(select 1 from wo_prefetch_campaign c where c.id=pj.prefetch_campaign_id and c.enabled
               and (c.seed_source->>'fetchedAt')::timestamptz > now()-interval '30 days')
             and (select count(*) from wo_place_job busy where busy.prefetch_campaign_id is not null
               and busy.state='running' and busy.id<>pj.id) <
               (select max_concurrency from wo_prefetch_campaign where id=pj.prefetch_campaign_id))))
           and ((pj.state = 'running' and pj.lease_until < now())
            or (pj.state = 'queued' and not exists (
                  select 1 from wo_place_job r where r.place_id = pj.place_id and r.state = 'running')))
         order by pj.work_priority, (pj.state = 'running') desc, pj.updated_at limit 1 for update skip locked)
       update wo_place_job j set state = 'running', lease_owner = $1, lease_token = j.lease_token + 1,
         lease_until = clock_timestamp() + ($2::int * interval '1 millisecond'), heartbeat_at = clock_timestamp(),
         attempt = j.attempt + 1, updated_at = now()
       from next where j.id = next.id
       returning j.*`,
      [owner, leaseMs, kind]
    )
    let job = rows[0] ?? null
    if (job && !job.snapshot_id) {
      const base = (
        await client.query(
          `select s.id from wo_place p join wo_place_snapshot s on s.id = p.current_snapshot_id
           where p.id = $1 and s.state = 'published'`,
          [job.place_id]
        )
      ).rows[0]?.id
      const snapshotId = (
        await client.query(
          'insert into wo_place_snapshot (place_id, job_id, base_snapshot_id, enrichment_scope) values ($1, $2, $3, $4) returning id',
          [job.place_id, job.id, base ?? null, job.research_mode === 'website' ? 'prefetch' : 'full']
        )
      ).rows[0].id
      if (base) {
        await client.query(
          `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, reason, cursor, coverage,
             collected, collected_at, attempted_at, last_error, collector_version)
           select $2, source, ref, status, reason, cursor, coverage, collected, collected_at, attempted_at,
             last_error, collector_version
           from wo_place_snapshot_source where snapshot_id = $1`,
          [base, snapshotId]
        )
        await client.query(
          `insert into wo_place_snapshot_media (snapshot_id, media_id)
           select $2, media_id from wo_place_snapshot_media where snapshot_id = $1`,
          [base, snapshotId]
        )
        // A one-part run carries over what the place said about itself: the logo's run skips the profile stage.
        if (job.only_source)
          await client.query(
            `insert into wo_place_snapshot_profile (snapshot_id, profile, brand)
             select $2, profile, brand from wo_place_snapshot_profile where snapshot_id = $1`,
            [base, snapshotId]
          )
      }
      job = (
        await client.query('update wo_place_job set snapshot_id = $2 where id = $1 returning *', [
          job.id,
          snapshotId
        ])
      ).rows[0]
    }
    if (job)
      await client.query(
        `update wo_job set state = 'running', updated_at = now()
         where place_job_id = $1 and result_snapshot_id is null and state = 'queued'`,
        [job.id]
      )
    await client.query('commit')
    return job
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * End a place job under its lease, in ONE transaction: the job's state; on `completed` the snapshot is
 * published (the previous one superseded, `current_snapshot_id` moved); on `failed` it is marked failed
 * and the current one stays; on `paused`/`blocked` it stays preparing for the resume. Every request the
 * run served gets the same state, and on completion `result_snapshot_id` — or, when its opportunity names
 * sources of its own (`privateRefsDue`), a queued private round (`executor.js`, stage `collection`).
 * @returns {Promise<boolean>} false when the lease was already lost (nothing written)
 */
export async function finishPlaceJob(pool, lease, { state, lastError = null }, { now = Date.now() } = {}) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    // Match joinPlace's order (place -> job), including failed/paused finishes. Taking the job
    // first would deadlock publication against a concurrent user's promotion/follow-up.
    await client.query(
      `select p.id from wo_place p join wo_place_job j on j.place_id=p.id
      where j.id=$1 for no key update of p`,
      [lease.jobId]
    )
    const { rows } = await client.query(
      `update wo_place_job set state = $3, last_error = $4::jsonb, lease_owner = null, lease_until = null,
         stage = case when $3 = 'completed' then 'done' else stage end, updated_at = now()
       where id = $1 and lease_token = $2 and state = 'running' returning *`,
      [lease.jobId, lease.token, state, lastError ? JSON.stringify(lastError) : null]
    )
    const job = rows[0]
    if (!job) {
      await client.query('rollback')
      return false
    }
    let answered = job
    if (state === 'completed') {
      const published = await publish(client, job, now)
      if (published) answered = { ...job, snapshot_id: published }
    } else if (state === 'failed')
      await client.query(
        `update wo_place_snapshot set state = 'failed' where id = $1 and state = 'preparing'`,
        [job.snapshot_id]
      )
    await answerRequests(client, answered, { state, lastError, now })
    await client.query('commit')
    return true
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * `published_at` is stamped from the caller's clock, the one `snapshotFresh` judges it by.
 * @returns {Promise<string | undefined>} the snapshot the run's requests read, when it is not the run's own
 */
async function publish(client, job, now) {
  const place = (
    await client.query('select current_snapshot_id from wo_place where id = $1 for no key update', [
      job.place_id
    ])
  ).rows[0]
  // 🔒 A one-part Retry that found nothing new publishes nothing: a new snapshot id alone makes every brief of the
  // place stale (e2e dev 24/10/2026). Its snapshot is set aside and its requests read the current one.
  if (
    job.only_source &&
    place.current_snapshot_id &&
    place.current_snapshot_id ===
      (await client.query('select base_snapshot_id from wo_place_snapshot where id = $1', [job.snapshot_id]))
        .rows[0]?.base_snapshot_id &&
    (await sameSnapshotContent(client, job.snapshot_id, place.current_snapshot_id))
  ) {
    await client.query("update wo_place_snapshot set state='superseded',published_at=$2 where id=$1", [
      job.snapshot_id,
      new Date(now)
    ])
    await carryAttempts(client, job.snapshot_id, place.current_snapshot_id)
    return place.current_snapshot_id
  }
  if (
    job.research_mode === 'website' &&
    place.current_snapshot_id &&
    place.current_snapshot_id !== job.snapshot_id
  ) {
    const current = (
      await client.query('select enrichment_scope from wo_place_snapshot where id=$1', [
        place.current_snapshot_id
      ])
    ).rows[0]
    if (current?.enrichment_scope === 'full') {
      await client.query("update wo_place_snapshot set state='superseded',published_at=$2 where id=$1", [
        job.snapshot_id,
        new Date(now)
      ])
      return
    }
  }
  if (place.current_snapshot_id && place.current_snapshot_id !== job.snapshot_id)
    await client.query(
      `update wo_place_snapshot set state = 'superseded' where id = $1 and state = 'published'`,
      [place.current_snapshot_id]
    )
  await client.query(`update wo_place_snapshot set state = 'published', published_at = $2 where id = $1`, [
    job.snapshot_id,
    new Date(now)
  ])
  const name = (
    await client.query('select profile->>$2 as name from wo_place_snapshot_profile where snapshot_id = $1', [
      job.snapshot_id,
      'name'
    ])
  ).rows[0]?.name
  await client.query(
    `update wo_place set current_snapshot_id = $2, display_name = coalesce($3, display_name), updated_at = now()
     where id = $1`,
    [job.place_id, job.snapshot_id, name ? name.slice(0, 200) : null]
  )
}

/**
 * A run set aside for finding nothing new still looked: its tries (when, how it ended, the rule that tried, and a
 * success that confirmed the same data) move onto the current snapshot, so `sourceDue` and the research card see the
 * check instead of calling the part due again.
 */
async function carryAttempts(client, from, to) {
  await client.query(
    `update wo_place_snapshot_source cur set attempted_at = run.attempted_at, last_error = run.last_error,
       coverage = run.coverage, collected_at = coalesce(run.collected_at, cur.collected_at),
       collector_version = coalesce(run.collector_version, cur.collector_version)
       from wo_place_snapshot_source run
      where run.snapshot_id = $1 and cur.snapshot_id = $2 and cur.source = run.source
        and run.attempted_at is not null and (cur.attempted_at is null or run.attempted_at > cur.attempted_at)`,
    [from, to]
  )
}

/**
 * Two snapshots hold the same research: each source's outcome and what it collected, the same pictures, the same
 * profile and brand. When they were collected and which providers were tried are not the research itself.
 */
async function sameSnapshotContent(client, a, b) {
  const { rows } = await client.query(
    `with s as (select snapshot_id, coalesce(jsonb_agg(jsonb_build_array(source, ref, status, reason, collected)
                  order by source), '[]'::jsonb) as v
                from wo_place_snapshot_source where snapshot_id = any($1::uuid[]) group by snapshot_id),
          m as (select snapshot_id, array_agg(media_id order by media_id) as v
                from wo_place_snapshot_media where snapshot_id = any($1::uuid[]) group by snapshot_id),
          p as (select snapshot_id, jsonb_build_array(profile, brand) as v
                from wo_place_snapshot_profile where snapshot_id = any($1::uuid[]))
     select (select v from s where snapshot_id = $2) is not distinct from (select v from s where snapshot_id = $3)
        and (select v from m where snapshot_id = $2) is not distinct from (select v from m where snapshot_id = $3)
        and (select v from p where snapshot_id = $2) is not distinct from (select v from p where snapshot_id = $3)
        as same`,
    [[a, b], a, b]
  )
  return rows[0]?.same === true
}

/** Give each request this run served the run's outcome (`client` holds the place job's transaction). */
async function answerRequests(client, job, { state, lastError, now }) {
  const { rows: requests } = await client.query(
    `select r.id, o.id as opportunity_id, o.candidate, o.provider, o.name
     from wo_job r join wo_opportunity o on o.id = r.opportunity_id
     where r.place_job_id = $1 and r.result_snapshot_id is null and r.state in ('queued', 'running', 'paused', 'blocked')
     for update of r`,
    [job.id]
  )
  if (state !== 'completed') {
    if (requests.length)
      await client.query(
        `update wo_job set state = $2, last_error = $3::jsonb, updated_at = now() where id = any($1::uuid[])`,
        [requests.map((r) => r.id), state, lastError ? JSON.stringify(lastError) : null]
      )
    return
  }
  const profileName = (
    await client.query('select profile->>$2 as name from wo_place_snapshot_profile where snapshot_id = $1', [
      job.snapshot_id,
      'name'
    ])
  ).rows[0]?.name
  for (const r of requests) {
    await answerOne(client, r, { snapshotId: job.snapshot_id, placeId: job.place_id, now })
    // A pasted URL's placeholder name gives way to the name its pages say, as the per-account research did.
    if (r.provider === 'url' && profileName && profileName !== r.name)
      await client.query('update wo_opportunity set name = $2, updated_at = now() where id = $1', [
        r.opportunity_id,
        profileName.slice(0, 200)
      ])
  }
}

/**
 * Answer one request with a published snapshot: `completed`, or a private round queued for the
 * sources only its opportunity names. @returns {Promise<'completed' | 'queued'>}
 */
export async function answerOne(client, request, { snapshotId, placeId, now }) {
  const due = await privateRefsDue(
    client,
    { id: request.opportunity_id, candidate: request.candidate },
    placeId,
    now
  )
  for (const { source, ref } of due) await ensureSource(client, request.opportunity_id, source, ref)
  const next = due.length ? 'queued' : 'completed'
  await client.query(
    `update wo_job set state = $2, stage = $3, result_snapshot_id = $4, last_error = null, updated_at = now()
     where id = $1`,
    [request.id, next, next === 'completed' ? 'done' : 'collection', snapshotId]
  )
  return next
}

/**
 * After a request was cancelled: when no request is left waiting on its place job, the job is cancelled
 * too (its token moves, so its worker writes nothing more) — nobody is asking for that research any more.
 * Another account's request keeps it running.
 */
export async function releasePlaceJob(pool, placeJobId) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const job = (await client.query('select * from wo_place_job where id = $1 for update', [placeJobId]))
      .rows[0]
    if (!job || !['queued', 'running', 'paused', 'blocked'].includes(job.state)) {
      await client.query('rollback')
      return false
    }
    const left = (
      await client.query(
        `select count(*)::int as n from wo_job where place_job_id = $1 and result_snapshot_id is null
         and state in ('queued', 'running', 'paused', 'blocked')`,
        [placeJobId]
      )
    ).rows[0].n
    // A stranger who pressed Research on `/find` waits on it too, with no request to cancel.
    const strangers = (
      await client.query(`select ${PUBLIC_DEMAND('j')} as waiting from wo_place_job j where j.id = $1`, [
        placeJobId
      ])
    ).rows[0].waiting
    if (left > 0 || strangers) {
      await client.query('rollback')
      return false
    }
    const campaignDemand =
      job.prefetch_campaign_id &&
      (
        await client.query(
          `select 1 from wo_prefetch_campaign where id=$1 and enabled
        and (seed_source->>'fetchedAt')::timestamptz>now()-interval '30 days'`,
          [job.prefetch_campaign_id]
        )
      ).rowCount
    if (campaignDemand) {
      // A request can stop waiting without erasing the central campaign's independent demand.
      // An already running user-admitted lease finishes; queued work yields to the background slot.
      if (job.state !== 'running')
        await client.query('update wo_place_job set work_priority=1 where id=$1', [placeJobId])
      await client.query('commit')
      return false
    }
    await client.query(
      `update wo_place_job set state = 'cancelled', lease_token = lease_token + 1, lease_owner = null,
         lease_until = null, updated_at = now() where id = $1`,
      [placeJobId]
    )
    if (job.snapshot_id)
      await client.query(
        `update wo_place_snapshot set state = 'failed' where id = $1 and state = 'preparing'`,
        [job.snapshot_id]
      )
    await client.query('commit')
    return true
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

const DAY_MS = 86_400_000
/** One admission at a time across places: the day counts and the budget are checked and written together. */
const PUBLIC_ADMISSION_LOCK = 7_243_063
/** A receipt reads its job's progress this long; after that the row only counts. */
export const PUBLIC_RECEIPT_MS = 2 * DAY_MS
const RECEIPT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Why a stranger may not queue a NEW place job now, or null. Only presses that queued a job count; the
 * day is the UTC day of `now`. `limits`: `perAddressDay`, `perDay` (0 = closed), `budgetCents`
 * (0 = closed) and `jobCapCents`, held per new job until it ends; an ended job then counts what its
 * ledger rows really cost (settled actual, plus anything still reserved or unreconciled).
 * @returns {Promise<'PUBLIC_RESEARCH_LIMIT' | 'PUBLIC_RESEARCH_SPENT' | null>}
 */
export async function publicResearchRefusal(db, { ipBucket, now, limits }) {
  const from = new Date(Math.floor(now / DAY_MS) * DAY_MS)
  const day = (
    await db.query(
      `select count(*)::int as total, (count(*) filter (where r.ip_bucket = $3))::int as mine,
         coalesce(sum(case when j.state in ('completed', 'failed', 'cancelled') then (
           select coalesce(sum(case when l.state = 'settled' then coalesce(l.actual_cents, l.reserved_cents)
             when l.state in ('reserved', 'unreconciled') then l.reserved_cents else 0 end), 0)
           from wo_cost_ledger l where l.job_id = r.place_job_id) else r.reserved_cents end), 0)::int as cents
       from wo_place_public_request r join wo_place_job j on j.id = r.place_job_id
       where r.new_job and r.created_at >= $1 and r.created_at < $2`,
      [from, new Date(from.getTime() + DAY_MS), ipBucket]
    )
  ).rows[0]
  if (day.total >= limits.perDay || day.mine >= limits.perAddressDay) return 'PUBLIC_RESEARCH_LIMIT'
  if (limits.budgetCents <= 0 || day.cents + limits.jobCapCents > limits.budgetCents)
    return 'PUBLIC_RESEARCH_SPENT'
  return null
}

/**
 * Research again pressed on `/find` for one researched place (decided 24/10/2026: a
 * stranger may press it, Tracy pays from the strangers' budget). Under the place lock and the admission lock:
 *   nothing due                          → `{state: 'up-to-date', plan}`: free, nothing written
 *   a run queued or running              → joined for free, with a receipt
 *   the place's public quota of the day  → `{refused: 'PUBLIC_AGAIN_LIMIT'}` (`publicResearchAgainPerPlacePerDay`)
 *   otherwise                            → a run holding the plan, cut to `jobCapCents` first, only through
 *                                          `publicResearchRefusal` with the plan's own ceiling reserved
 * @returns {Promise<{state: string, receipt?: string, plan: object} | {refused: string, plan?: object}>}
 */
export async function admitPublicResearchAgain(
  pool,
  { placeId, providerId, ipBucket, now, limits, keys, settings, domain, onlyParts = null }
) {
  const { placeAgainPlan } = await import('./research-again.js')
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select 1 from wo_place where id = $1 for no key update', [placeId])
    const plan = await placeAgainPlan(client, placeId, {
      now,
      keys,
      settings,
      domain,
      capCents: limits.jobCapCents,
      onlyParts
    })
    if (!plan.researched) {
      await client.query('rollback')
      return { refused: 'NOT_RESEARCHED' }
    }
    if (!plan.run.length) {
      await client.query('rollback')
      return { state: 'up-to-date', plan }
    }
    const receiptFor = async (job, newJob, reserved) =>
      (
        await client.query(
          `insert into wo_place_public_request (place_id, provider_id, place_job_id, ip_bucket, new_job, reserved_cents, created_at)
           values ($1, $2, $3, $4, $5, $6, $7) returning receipt`,
          [placeId, providerId, job.id, ipBucket, newJob, reserved, new Date(now)]
        )
      ).rows[0].receipt
    const active = (
      await client.query(
        `select * from wo_place_job where place_id = $1 and state in ('queued', 'running')
         order by (state = 'running') desc, created_at limit 1`,
        [placeId]
      )
    ).rows[0]
    if (active) {
      const receipt = await receiptFor(active, false, 0)
      await client.query('commit')
      return { state: active.state, receipt, plan, joined: true }
    }
    await client.query('select pg_advisory_xact_lock($1)', [PUBLIC_ADMISSION_LOCK])
    const from = new Date(Math.floor(now / DAY_MS) * DAY_MS)
    const today = (
      await client.query(
        `select count(*)::int as n from wo_place_job where place_id = $1 and again_plan is not null
           and started_by = 'public' and created_at >= $2 and created_at < $3`,
        [placeId, from, new Date(from.getTime() + DAY_MS)]
      )
    ).rows[0].n
    if (today >= (settings?.publicResearchAgainPerPlacePerDay ?? 1)) {
      await client.query('rollback')
      return { refused: 'PUBLIC_AGAIN_LIMIT', plan }
    }
    const reserve = Math.min(limits.jobCapCents, Math.max(1, plan.ceilingCents))
    const refused = await publicResearchRefusal(client, {
      ipBucket,
      now,
      limits: { ...limits, jobCapCents: reserve }
    })
    if (refused) {
      await client.query('rollback')
      return { refused, plan }
    }
    const { job } = await joinPlace(client, placeId, { againPlan: plan, now, starter: { kind: 'public' } })
    const receipt = await receiptFor(job, true, reserve)
    await client.query('commit')
    return { state: job.state, receipt, plan }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * Research pressed on the sign-in-free `/find` for one place (contract §7, never `joinPlace()`):
 *   a published snapshot of any age      → `{state: 'researched'}`: free, nothing written
 *   a full run queued or running         → joined for free, with a receipt
 *   a stopped run (failed/paused/blocked) → `{state: 'stopped'}`: no retry or resume from here
 *   otherwise                            → a NEW job (or a queued background one promoted) only through
 *                                          `publicResearchRefusal`, checked and recorded under one lock
 * Every press that waits records its demand (`wo_place_public_request`), so a signed-in cancel
 * (`releasePlaceJob`) never stops a job a stranger waits on.
 * @returns {Promise<{state: 'researched', researchedAt: Date} | {state: 'queued' | 'running', receipt: string}
 *   | {state: 'stopped'} | {refused: string}>}
 */
export async function admitPublicResearch(pool, { placeId, providerId, ipBucket, now, limits }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select 1 from wo_place where id = $1 for no key update', [placeId])
    const snapshot = await currentSnapshotOf(client, placeId)
    if (snapshot?.state === 'published' && snapshot.enrichment_scope !== 'prefetch') {
      await client.query('rollback')
      return { state: 'researched', researchedAt: snapshot.published_at }
    }
    const active = (
      await client.query(
        `select * from wo_place_job where place_id = $1 and state in ('queued', 'running')
         order by (state = 'running') desc, created_at for update`,
        [placeId]
      )
    ).rows
    const receiptFor = async (job, newJob, reserved) =>
      (
        await client.query(
          `insert into wo_place_public_request (place_id, provider_id, place_job_id, ip_bucket, new_job, reserved_cents, created_at)
           values ($1, $2, $3, $4, $5, $6, $7) returning receipt`,
          [placeId, providerId, job.id, ipBucket, newJob, reserved, new Date(now)]
        )
      ).rows[0].receipt
    const full = active.find((j) => j.research_mode === 'full')
    if (full) {
      const receipt = await receiptFor(full, false, 0)
      await client.query('commit')
      return { state: full.state, receipt }
    }
    if (active.length === 0) {
      const last = (
        await client.query(
          `select state from wo_place_job where place_id = $1 and prefetch_campaign_id is null
           order by created_at desc limit 1`,
          [placeId]
        )
      ).rows[0]
      if (last && ['failed', 'paused', 'blocked'].includes(last.state)) {
        await client.query('rollback')
        return { state: 'stopped' }
      }
    }
    await client.query('select pg_advisory_xact_lock($1)', [PUBLIC_ADMISSION_LOCK])
    const refused = await publicResearchRefusal(client, { ipBucket, now, limits })
    if (refused) {
      await client.query('rollback')
      return { refused }
    }
    const queuedBackground = active.find((j) => j.state === 'queued')
    // A background (website-only) run waiting in line becomes the full run, as a signed-in join does.
    const job = queuedBackground
      ? (
          await client.query(
            `update wo_place_job set work_priority = 0, research_mode = 'full', stage = 'discovery', updated_at = now(),
             started_by = 'public', started_by_account_id = null
             where id = $1 returning *`,
            [queuedBackground.id]
          )
        ).rows[0]
      : (
          await client.query(
            `insert into wo_place_job (place_id, force, work_priority, research_mode, started_by)
             values ($1, false, 0, 'full', 'public') returning *`,
            [placeId]
          )
        ).rows[0]
    if (queuedBackground?.snapshot_id)
      await client.query("update wo_place_snapshot set enrichment_scope = 'full' where id = $1", [
        queuedBackground.snapshot_id
      ])
    const receipt = await receiptFor(job, true, limits.jobCapCents)
    await client.query('commit')
    return { state: job.state, receipt }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * What each receipt's job says now, keyed by receipt; unknown or expired receipts are left out. Only
 * the Google place id the stranger sent, the state, a running job's stage and a publication time:
 * never a job, account or opportunity. `paused`/`blocked`/`failed`/`cancelled` all read `stopped`.
 * @returns {Promise<Record<string, {placeId: string, state: 'queued' | 'running' | 'researched' | 'stopped',
 *   stage?: string, researchedAt?: Date}>>}
 */
export async function publicResearchProgress(db, receipts, { now }) {
  const wanted = [...new Set(receipts.filter((r) => typeof r === 'string' && RECEIPT.test(r)))]
  if (wanted.length === 0) return {}
  const { rows } = await db.query(
    `select pr.receipt, pr.provider_id, j.state, j.stage, s.published_at
     from wo_place_public_request pr join wo_place_job j on j.id = pr.place_job_id
     join wo_place p on p.id = j.place_id
     left join wo_place_snapshot s on s.id = p.current_snapshot_id and s.state = 'published'
       and s.enrichment_scope <> 'prefetch'
     where pr.receipt = any($1::uuid[]) and pr.created_at > $2`,
    [wanted, new Date(now - PUBLIC_RECEIPT_MS)]
  )
  return Object.fromEntries(
    rows.map((r) => {
      const base = { placeId: r.provider_id }
      if (r.state === 'queued') return [r.receipt, { ...base, state: 'queued' }]
      if (r.state === 'running') return [r.receipt, { ...base, state: 'running', stage: r.stage }]
      if (r.state === 'completed' && r.published_at)
        return [r.receipt, { ...base, state: 'researched', researchedAt: r.published_at }]
      return [r.receipt, { ...base, state: 'stopped' }]
    })
  )
}
