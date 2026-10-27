/** Local replicas keep identity versions and alias binding revisions independently. */
import { platformKey } from './social-alias.js'
const REV = /^[1-9][0-9]{0,18}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const iso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const revision = (value) =>
  typeof value === 'string' && REV.test(value) && BigInt(value) <= 9223372036854775807n
export function validateSocialEnvelope(envelope, expected) {
  if (
    !UUID.test(envelope?.authorityId ?? '') ||
    !Array.isArray(envelope.items) ||
    envelope.items.length !== expected.size
  )
    throw new Error('Invalid social envelope')
  const seen = new Set()
  for (const item of envelope.items) {
    const handle = expected.get(item?.aliasKey)
    if (
      !iso(item.stateObservedAt) ||
      !(item.stateRevision === '0' || revision(item.stateRevision)) ||
      !handle ||
      seen.has(item.aliasKey) ||
      item.network !== handle.network ||
      !['queued', 'done', 'failed', 'not_found'].includes(item.state?.status)
    )
      throw new Error('Invalid social item')
    seen.add(item.aliasKey)
    const b = item.binding,
      i = item.identity
    if (
      b &&
      (!revision(b.revision) ||
        !iso(b.observedAt) ||
        !iso(b.verifiedAt) ||
        (b.invalidatedAt !== null && !iso(b.invalidatedAt)) ||
        (b.identityKey !== null && typeof b.identityKey !== 'string'))
    )
      throw new Error('Invalid social binding')
    if (
      i &&
      (!revision(i.version) ||
        !iso(i.fetchedAt) ||
        i.network !== item.network ||
        platformKey(i.network, i.platformId) !== i.identityKey ||
        typeof i.snapshot !== 'object' ||
        !i.snapshot ||
        Array.isArray(i.snapshot))
    )
      throw new Error('Invalid social identity')
    if (b?.identityKey && (!i || b.identityKey !== i.identityKey))
      throw new Error('Unverified social binding')
    if (i) {
      for (const k of ['followers', 'posts', 'posts_per_month'])
        if (i.snapshot[k] !== null && (!Number.isFinite(Number(i.snapshot[k])) || Number(i.snapshot[k]) < 0))
          throw new Error('Invalid social metric')
      if (!['complete', 'partial'].includes(i.snapshot.coverage) || typeof i.snapshot.provider !== 'string')
        throw new Error('Invalid social snapshot')
    }
  }
}
export async function applySocialEnvelope({ pool, origin, envelope, expected, now = Date.now() }) {
  validateSocialEnvelope(envelope, expected)
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query(
      'insert into wo_social_replica_authority(origin,authority_id,pinned_at) values($1,$2,$3) on conflict do nothing',
      [origin, envelope.authorityId, new Date(now)]
    )
    const pin = (
      await db.query('select authority_id from wo_social_replica_authority where origin=$1 for share', [
        origin
      ])
    ).rows[0]
    if (pin.authority_id !== envelope.authorityId)
      throw Object.assign(new Error('Social authority changed'), { code: 'SOCIAL_AUTHORITY_CHANGED' })
    for (const item of envelope.items) {
      const i = item.identity,
        b = item.binding
      if (i)
        await db.query(
          `insert into wo_social_replica_identity
        (origin,authority_id,identity_key,network,platform_id,version,snapshot,fetched_at,synced_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(origin,authority_id,identity_key) do update
        set version=excluded.version,snapshot=excluded.snapshot,fetched_at=excluded.fetched_at,synced_at=excluded.synced_at
        where wo_social_replica_identity.version<excluded.version`,
          [
            origin,
            envelope.authorityId,
            i.identityKey,
            i.network,
            i.platformId,
            i.version,
            i.snapshot,
            i.fetchedAt,
            new Date(now)
          ]
        )
      if (b)
        await db.query(
          `insert into wo_social_replica_alias
        (origin,authority_id,alias_key,identity_key,binding_revision,observed_at,verified_at,invalidated_at,state,synced_at,state_revision,state_observed_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(origin,authority_id,alias_key) do update
        set identity_key=excluded.identity_key,binding_revision=excluded.binding_revision,observed_at=excluded.observed_at,
        verified_at=excluded.verified_at,invalidated_at=excluded.invalidated_at,state=excluded.state,synced_at=excluded.synced_at,state_revision=excluded.state_revision,state_observed_at=excluded.state_observed_at
        where wo_social_replica_alias.binding_revision<excluded.binding_revision or
          (wo_social_replica_alias.binding_revision=excluded.binding_revision and (wo_social_replica_alias.state_revision,wo_social_replica_alias.state_observed_at)<=(excluded.state_revision,excluded.state_observed_at))`,
          [
            origin,
            envelope.authorityId,
            item.aliasKey,
            b.identityKey,
            b.revision,
            b.observedAt,
            b.verifiedAt,
            b.invalidatedAt,
            item.state,
            new Date(now),
            item.stateRevision,
            item.stateObservedAt
          ]
        )
      else
        await db.query(
          `insert into wo_social_replica_alias(origin,authority_id,alias_key,state,synced_at,state_revision,state_observed_at)
        values($1,$2,$3,$4,$5,$6,$7) on conflict(origin,authority_id,alias_key) do update set state=excluded.state,synced_at=excluded.synced_at,state_revision=excluded.state_revision,state_observed_at=excluded.state_observed_at
        where wo_social_replica_alias.binding_revision=0 and (wo_social_replica_alias.state_revision,wo_social_replica_alias.state_observed_at)<=(excluded.state_revision,excluded.state_observed_at)`,
          [
            origin,
            envelope.authorityId,
            item.aliasKey,
            item.state,
            new Date(now),
            item.stateRevision,
            item.stateObservedAt
          ]
        )
    }
    for (const item of envelope.items) {
      const links = (
        await db.query('select place_id,kind,url from wo_place_link where kind=$1 and url=$2', [
          item.network,
          item.url
        ])
      ).rows
      for (const link of links)
        await linkPlaceSocialIdentity({
          pool: db,
          placeId: link.place_id,
          kind: link.kind,
          url: link.url,
          origin,
          aliasKey: item.aliasKey,
          now
        })
    }
    await db.query(
      `update wo_place_social_link l set revoked_at=coalesce(l.revoked_at,$2)
      from wo_social_replica_alias a where l.origin=$1 and a.origin=l.origin and a.authority_id=l.authority_id
      and a.alias_key=l.alias_key
      and (a.identity_key is distinct from l.identity_key or a.invalidated_at is not null)`,
      [origin, new Date(now)]
    )
    await db.query('commit')
  } catch (e) {
    await db.query('rollback')
    throw e
  } finally {
    db.release()
  }
}
export async function readSocialReplica(pool, origin, handles, now = Date.now(), error = null) {
  const out = {}
  for (const h of handles.values()) {
    const r = (
      await pool.query(
        `select a.*,i.snapshot,i.fetched_at,i.version from wo_social_replica_alias a
      left join wo_social_replica_identity i on (i.origin,i.authority_id,i.identity_key)=(a.origin,a.authority_id,a.identity_key)
      where a.origin=$1 and a.alias_key=$2`,
        [origin, h.aliasKey]
      )
    ).rows[0]
    if (!r) {
      out[h.originalUrl ?? h.url] = { status: 'failed', error: error ?? 'shared_social_unavailable' }
      continue
    }
    const state = r.state ?? {}
    const value = {
      status: state.status ?? 'queued',
      ...(state.error ? { error: state.error } : {}),
      ...(state.deferredUntil ? { deferredUntil: state.deferredUntil } : {})
    }
    if (r.snapshot && !r.invalidated_at && state.status !== 'not_found') {
      const s = r.snapshot
      Object.assign(value, {
        url: h.originalUrl ?? h.url,
        followers: s.followers === null ? null : Number(s.followers),
        posts: s.posts === null ? null : Number(s.posts),
        lastPostAt: s.last_post_at,
        postsPerMonth: s.posts_per_month === null ? null : Number(s.posts_per_month),
        coverage: s.coverage,
        provider: s.provider.includes('/') ? s.provider : `${h.network}/${s.provider}`,
        fetchedAt: r.fetched_at.toISOString(),
        stale:
          !!error ||
          now - r.fetched_at.getTime() >= 7 * 86400000 ||
          !r.observed_at ||
          now - r.observed_at.getTime() >= 7 * 86400000,
        version: String(r.version),
        syncedAt: r.synced_at.toISOString()
      })
      if (error) value.status = 'done'
    }
    if (error) value.error = error
    out[h.originalUrl ?? h.url] = value
  }
  return out
}

/** A verified local link may bind once; handle reassignment revokes it, never silently relinks a place. */
export async function linkPlaceSocialIdentity({
  pool,
  placeId,
  kind,
  url,
  origin,
  aliasKey,
  now = Date.now()
}) {
  return pool.query(
    `insert into wo_place_social_link(place_id,kind,url,origin,authority_id,identity_key,binding_revision,verified_at,alias_key)
    select l.place_id,l.kind,l.url,a.origin,a.authority_id,a.identity_key,a.binding_revision,$6,a.alias_key
    from wo_place_link l join wo_social_replica_alias a on a.alias_key=$5 and a.origin=$4
    join wo_social_replica_identity i on (i.origin,i.authority_id,i.identity_key)=(a.origin,a.authority_id,a.identity_key)
    where l.place_id=$1 and l.kind=$2 and l.url=$3 and a.identity_key is not null and a.invalidated_at is null
      and a.observed_at>$6::timestamptz-interval '7 days' and a.verified_at>$6::timestamptz-interval '7 days'
    on conflict(place_id,kind,url) do update set revoked_at=coalesce(wo_place_social_link.revoked_at,$6)
    where (wo_place_social_link.origin,wo_place_social_link.authority_id,wo_place_social_link.identity_key)
      is distinct from (excluded.origin,excluded.authority_id,excluded.identity_key)`,
    [placeId, kind, url, origin, aliasKey, new Date(now)]
  )
}
