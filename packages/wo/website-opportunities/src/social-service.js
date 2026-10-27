/** Shared social authority: service authentication lives in the routes; this owns atomic admission. */
import { createHash } from 'node:crypto'
import { statKeyOf, statShape, socialRefreshNeeded } from './social-stats.js'
import { resolveSocialAliases } from './social-alias.js'
import { createSocialPreEnrichmentPlanner } from './social-prefetch.js'
import { backfillSocialVersion } from './social-version.js'

const WEEK = 7 * 86400000
const HOUR = 3600000
export const SOCIAL_SERVICE_BASE = '/api/internal/wo-social/v1'
export const socialRequestHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function validSocialFence(fence) {
  const integer = (v) =>
    typeof v === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(v) && BigInt(v) <= 9223372036854775807n
  return (
    !!fence &&
    typeof fence.targetKey === 'string' &&
    fence.targetKey.length <= 2048 &&
    (fence.bindingRevision === null || integer(fence.bindingRevision)) &&
    typeof fence.targetExists === 'boolean' &&
    (fence.targetExists ? integer(fence.generation) : fence.generation === null)
  )
}
const fenceShape = (fence) =>
  fence
    ? {
        targetKey: fence.targetKey,
        bindingRevision: fence.bindingRevision,
        targetExists: fence.targetExists,
        generation: fence.generation
      }
    : null

export function createSocialService({ pool, domain, stats, now = Date.now, prefetchSeedVerifier = null }) {
  const prefetch = createSocialPreEnrichmentPlanner({
    pool,
    domain,
    role: 'central',
    verifySeed: prefetchSeedVerifier,
    now
  })
  const domainOf = typeof domain === 'function' ? domain : async () => domain
  async function normalise(handle) {
    const dom = await domainOf()
    const key = statKeyOf(handle, dom.parseSocialUrl)
    if (!key) throw Object.assign(new Error('Invalid social profile'), { code: 'INVALID_PROFILE' })
    return {
      aliasKey: key,
      network: handle.network,
      url: dom.parseSocialUrl(handle.url, { network: handle.network }).url
    }
  }
  async function lookup(handles) {
    await pool.query('insert into wo_social_authority(singleton) values(true) on conflict do nothing')
    const items = []
    for (const handle of handles) {
      const h = await normalise(handle)
      await resolveSocialAliases(
        pool,
        new Map([[h.url, { key: h.aliasKey, network: h.network, url: h.url }]]),
        now()
      )
      const binding = (
        await pool.query('select owner_key from wo_social_alias where alias_key=$1', [h.aliasKey])
      ).rows[0]
      if (binding) await backfillSocialVersion(pool, binding.owner_key)
      const stateObservedAt = new Date(now()).toISOString()
      // One statement sees a consistent binding, current state and immutable observation.
      const r = (
        await pool.query(
          `select a.*,s.revision as state_revision,s.lease_token,s.status,s.checked_at,s.last_error,s.error,s.next_retry_at,
        s.followers,s.posts,s.last_post_at,s.posts_per_month,s.coverage,s.provider,s.fetched_at,
        v.version,v.snapshot,v.fetched_at as original_fetched_at
        from wo_social_alias a join wo_social_stat s on s.stat_key=a.owner_key
        left join lateral (select * from wo_social_snapshot where identity_key=s.stat_key order by version desc limit 1) v on true
        where a.alias_key=$1 and a.platform_id=s.platform_id`,
          [h.aliasKey]
        )
      ).rows[0]
      const raw =
        r ?? (await pool.query('select * from wo_social_stat where stat_key=$1', [h.aliasKey])).rows[0]
      const expired = r && now() - new Date(r.observed_at).getTime() >= WEEK
      const inputRow =
        r?.invalidated_at || expired
          ? (await pool.query('select * from wo_social_stat where stat_key=$1', [h.aliasKey])).rows[0]
          : raw
      items.push({
        aliasKey: h.aliasKey,
        network: h.network,
        url: handle.url,
        binding: r
          ? {
              revision: String(r.revision),
              identityKey: r.invalidated_at ? null : r.owner_key,
              observedAt: r.observed_at.toISOString(),
              verifiedAt: r.verified_at.toISOString(),
              invalidatedAt: r.invalidated_at?.toISOString() ?? null
            }
          : null,
        identity: r?.version
          ? {
              identityKey: r.owner_key,
              network: r.network,
              platformId: r.platform_id,
              version: String(r.version),
              snapshot: r.snapshot,
              fetchedAt: r.original_fetched_at.toISOString()
            }
          : null,
        stateObservedAt,
        stateRevision: String(
          [raw?.state_revision ?? raw?.revision ?? 0, inputRow?.revision ?? 0, r?.revision ?? 0]
            .map(BigInt)
            .reduce((a, b) => (a > b ? a : b), 0n)
        ),
        state: {
          known: !!raw,
          refreshFence: {
            targetKey: r && !r.invalidated_at && !expired ? r.owner_key : h.aliasKey,
            bindingRevision: r ? String(r.revision) : null,
            targetExists: !!inputRow,
            generation: inputRow ? String(inputRow.lease_token) : null
          },
          ...((expired || r?.invalidated_at) && inputRow?.status === 'queued'
            ? statShape(inputRow, handle.url, now())
            : r?.invalidated_at
              ? { status: 'failed', error: 'not_found' }
              : statShape(raw, handle.url, now())),
          refreshNeeded: socialRefreshNeeded(
            inputRow,
            now(),
            r?.invalidated_at,
            expired ? new Date(r.observed_at).getTime() + WEEK : null
          )
        }
      })
    }
    const authorityId = (await pool.query('select authority_id from wo_social_authority')).rows[0]
      .authority_id
    return { authorityId, items }
  }

  async function refresh(
    principal,
    { operationId, handle, force = false, authorityId, expectedFence = null }
  ) {
    const seenAt = now()
    const h = await normalise(handle)
    // Legacy adoption takes its own owner locks before operation admission.
    await resolveSocialAliases(
      pool,
      new Map([[h.url, { key: h.aliasKey, network: h.network, url: h.url }]]),
      now()
    )
    const hash = socialRequestHash({ ...h, force, expectedFence: fenceShape(expectedFence) })
    const db = await pool.connect()
    let result
    try {
      await db.query('begin')
      const authority = (await db.query('select authority_id from wo_social_authority for share')).rows[0]
      if (!authorityId || authority?.authority_id !== authorityId)
        throw Object.assign(new Error('Social authority changed'), { code: 'SOCIAL_AUTHORITY_CHANGED' })
      // Stable deployment ID serializes both quota and retries across rotated credentials.
      await db.query('select pg_advisory_xact_lock(hashtext($1))', [
        `social-deployment:${principal.deploymentId}`
      ])
      const previous = (
        await db.query('select * from wo_social_operation where deployment_id=$1 and operation_id=$2', [
          principal.deploymentId,
          operationId
        ])
      ).rows[0]
      if (previous) {
        if (previous.request_hash !== hash)
          throw Object.assign(new Error('Operation payload changed'), { code: 'OPERATION_CONFLICT' })
        await db.query('commit')
        return operationShape(previous)
      }
      // Limits are re-read inside admission, so revoking a deployment closes an in-flight request.
      const limits = (
        await db.query('select * from wo_social_deployment where deployment_id=$1 for share', [
          principal.deploymentId
        ])
      ).rows[0]
      const at = new Date(now())
      const counts = (
        await db.query(
          `select count(*)::int as refreshes,count(*) filter(where force)::int as forces
        from wo_social_operation where deployment_id=$1 and created_at>=date_trunc('day',$2::timestamptz at time zone 'UTC') at time zone 'UTC'`,
          [principal.deploymentId, at]
        )
      ).rows[0]
      if (
        !limits?.enabled ||
        counts.refreshes >= limits.refreshes_per_day ||
        (force && counts.forces >= limits.forces_per_day)
      )
        throw Object.assign(new Error('Deployment refresh limit reached'), { code: 'SOCIAL_REFRESH_LIMIT' })
      // Capture the intended target before taking locks; re-check its binding after waiting.
      const binding = (await db.query('select * from wo_social_alias where alias_key=$1', [h.aliasKey]))
        .rows[0]
      const usable =
        binding && !binding.invalidated_at && now() - new Date(binding.observed_at).getTime() < WEEK
      const target = usable ? binding.owner_key : h.aliasKey
      await db.query('select pg_advisory_xact_lock(hashtext($1))', [`social-owner:${target}`])
      const row = (await db.query('select * from wo_social_stat where stat_key=$1 for update', [target]))
        .rows[0]
      await db.query('select pg_advisory_xact_lock(hashtext($1))', [`social-alias:${h.aliasKey}`])
      const current = (await db.query('select * from wo_social_alias where alias_key=$1', [h.aliasKey]))
        .rows[0]
      const sameBinding = String(binding?.revision ?? '') === String(current?.revision ?? '')
      const observedFence = {
        targetKey: target,
        bindingRevision: binding ? String(binding.revision) : null,
        targetExists: !!row,
        generation: row ? String(row.lease_token) : null
      }
      if (force && !validSocialFence(expectedFence))
        throw Object.assign(new Error('Force requires a shared observation'), { code: 'INVALID_FENCE' })
      const sameObservation =
        !expectedFence || JSON.stringify(fenceShape(expectedFence)) === JSON.stringify(observedFence)
      let admission = 'superseded',
        generation = null
      const age = (value) => (value ? now() - new Date(value).getTime() : Infinity)
      const recentNegative = current?.invalidated_at && age(current.invalidated_at) < HOUR
      const expired = binding && !binding.invalidated_at && !usable
      const needed = force
        ? row?.status !== 'queued'
        : socialRefreshNeeded(
            row,
            now(),
            current?.invalidated_at,
            expired ? new Date(binding.observed_at).getTime() + WEEK : null
          )
      // The operation and enqueue commit together. A lost HTTP receipt can only read this admission.
      const overlap =
        force &&
        ((row?.checked_at && new Date(row.checked_at).getTime() >= seenAt) ||
          (current?.observed_at && new Date(current.observed_at).getTime() > seenAt) ||
          (current?.invalidated_at && new Date(current.invalidated_at).getTime() >= seenAt))
      if (sameBinding && sameObservation && !overlap && !(recentNegative && !force)) {
        if (!needed) admission = row?.status === 'queued' ? 'joined' : 'fresh'
        else {
          const admitted = row
            ? await db.query(
                `update wo_social_stat set status='queued',queued_at=$3,attempts=0,
            lease_until=null,lease_token=lease_token+1,next_retry_at=null,last_error=$5,
            url=case when apify_attempt->>'phase' in ('planned','reserved','starting','start_uncertain','running','publishing') then url else $4 end
            where stat_key=$1 and lease_token=$2 returning lease_token`,
                [target, row.lease_token, at, h.url, force ? 'force' : null]
              )
            : await db.query(
                `insert into wo_social_stat(stat_key,network,url,status,queued_at) values($1,$2,$3,'queued',$4)
              on conflict do nothing returning lease_token`,
                [target, h.network, h.url, at]
              )
          generation = admitted.rows[0]?.lease_token ?? null
          admission = generation !== null ? 'admitted' : 'superseded'
        }
      } else if (recentNegative && !force) admission = 'fresh'
      result = (
        await db.query(
          `insert into wo_social_operation
        (op_key,deployment_id,operation_id,request_hash,network,url,alias_key,force,target_key,binding_revision,
         target_generation,target_exists,admitted_generation,admission,status,queued_at,created_at,checked_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'done',$15,$15,$15) returning *`,
          [
            `${principal.deploymentId}:${operationId}`,
            principal.deploymentId,
            operationId,
            hash,
            h.network,
            h.url,
            h.aliasKey,
            force,
            target,
            binding?.revision ?? null,
            row?.lease_token ?? null,
            !!row,
            generation,
            admission,
            at
          ]
        )
      ).rows[0]
      await db.query('commit')
    } catch (e) {
      await db.query('rollback')
      throw e
    } finally {
      db.release()
    }
    void stats.tick()
    return operationShape(result)
  }
  async function operation(principal, id) {
    const row = (
      await pool.query('select * from wo_social_operation where deployment_id=$1 and operation_id=$2', [
        principal.deploymentId,
        id
      ])
    ).rows[0]
    return row ? operationShape(row) : null
  }
  return {
    lookup,
    refresh,
    operation,
    normalise,
    planPreEnrichment: prefetch.plan,
    prefetchTick: prefetch.tick
  }
}
function operationShape(row) {
  return {
    operationId: row.operation_id,
    aliasKey: row.alias_key,
    admission: row.admission,
    createdAt: row.created_at.toISOString()
  }
}
