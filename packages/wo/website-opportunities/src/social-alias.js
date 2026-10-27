/** Verified aliases expire with the snapshot. Force revalidates the requested handle, never its old owner. */
import { appendSocialVersion } from './social-version.js'
import { hasSocialApifyAttempt } from './social-apify.js'
const WEEK = 7 * 86_400_000
const COLUMNS = [
  'platform_id',
  'handle',
  'followers',
  'posts',
  'last_post_at',
  'posts_per_month',
  'coverage',
  'provider',
  'fetched_at',
  'last_attempt_at',
  'last_error',
  'next_retry_at',
  'error',
  'checked_at'
]

export function platformKey(network, id) {
  if (
    typeof id !== 'string' ||
    !(/^[0-9]{5,25}$/.test(id) || (network === 'youtube' && /^UC[A-Za-z0-9_-]{22}$/.test(id)))
  )
    return null
  return `${network}:id:${id}`
}
function idFromKey(key) {
  return /^(?:facebook|instagram|tiktok|youtube):(?:id|channel):(.+)$/.exec(key)?.[1] ?? null
}
export async function resolveSocialAliases(pool, valid, now, _options = {}) {
  if (valid.size === 0) return valid
  const keys = [...new Set([...valid.values()].map((v) => v.key))]
  // Adopt pre-alias snapshots without refreshing them or transferring their run receipts.
  const legacy = (
    await pool.query(
      `select s.* from wo_social_stat s left join wo_social_alias a on a.alias_key=s.stat_key
    where s.stat_key=any($1) and a.alias_key is null and s.status='done' and s.platform_id is not null and s.fetched_at is not null`,
      [keys]
    )
  ).rows
  for (const row of legacy) {
    if (!platformKey(row.network, row.platform_id) || hasSocialApifyAttempt(row) || !row.provider) continue
    const aliasKeys = [row.stat_key]
    if (row.network === 'facebook') aliasKeys.push(`facebook:id:${row.platform_id}`)
    if (row.network === 'youtube') aliasKeys.push(`youtube:channel:${row.platform_id}`)
    await publishSocialSnapshot({
      pool,
      row,
      lease: { token: row.lease_token },
      fields: { ...Object.fromEntries(COLUMNS.map((c) => [c, row[c]])), status: 'done' },
      aliasKeys,
      now,
      adoption: true
    })
  }
  const { rows } = await pool.query(
    `select a.alias_key, a.owner_key, a.invalidated_at from wo_social_alias a join wo_social_stat s on s.stat_key=a.owner_key
     where a.alias_key=any($1) and a.observed_at > $2 and s.platform_id=a.platform_id`,
    [keys, new Date(now - WEEK)]
  )
  const aliases = new Map(rows.map((r) => [r.alias_key, r]))
  return new Map(
    [...valid].map(([url, v]) => {
      const a = aliases.get(v.key)
      return [
        url,
        { ...v, key: a && !a.invalidated_at ? a.owner_key : v.key, invalidatedAt: a?.invalidated_at ?? null }
      ]
    })
  )
}

/** Admission rechecks aliases, closing the enqueue→start race. Active/uncertain attempts stay put. */
export async function reusableSocialAlias(pool, row, now) {
  const { rows } = await pool.query(
    `select s.* from wo_social_alias a join wo_social_stat s on s.stat_key=a.owner_key
     where a.alias_key=$1 and a.owner_key<>$1 and a.invalidated_at is null and a.observed_at > $2
       and s.platform_id=a.platform_id and (s.status='queued' or s.fetched_at > $2)`,
    [row.stat_key, new Date(now - WEEK)]
  )
  return rows[0] ?? null
}

/** Snapshot and bindings commit together; an ID owner never receives another profile's numbers. */
export async function publishSocialSnapshot({
  pool,
  row,
  lease,
  fields,
  aliasKeys,
  now,
  clock = () => now,
  adoption = false
}) {
  const ownerKey = platformKey(row.network, fields.platform_id)
  const db = await pool.connect()
  try {
    await db.query('begin')
    const lockKeys = [...new Set([row.stat_key, ownerKey].filter(Boolean))].sort()
    for (const key of lockKeys)
      await db.query('select pg_advisory_xact_lock(hashtext($1))', [`social-owner:${key}`])
    const locked = (
      await db.query('select * from wo_social_stat where stat_key=any($1) order by stat_key for update', [
        lockKeys
      ])
    ).rows
    const current = locked.find((r) => r.stat_key === row.stat_key)
    // The clock is read after lock acquisition, so waiting cannot extend the right to publish.
    const checkedNow = clock()
    if (
      !current ||
      current.status !== (adoption ? 'done' : 'queued') ||
      String(current.lease_token) !== String(lease.token) ||
      (adoption
        ? hasSocialApifyAttempt(current) || String(current.fetched_at) !== String(row.fetched_at)
        : new Date(current.lease_until).getTime() <= checkedNow)
    ) {
      await db.query('rollback')
      return false
    }
    const sourceId = idFromKey(row.stat_key)
    const moved = sourceId !== null && sourceId !== fields.platform_id
    // A canonical ID URL is not a transferable alias. Only proven handles/slugs may move owners.
    const keys = [...new Set([ownerKey, ...aliasKeys])]
      .filter((k) => k && (idFromKey(k) === null || idFromKey(k) === fields.platform_id))
      .sort()
    if (ownerKey && ownerKey !== row.stat_key)
      await db.query(
        `insert into wo_social_stat (stat_key,network,url,status) values ($1,$2,$3,'done') on conflict do nothing`,
        [ownerKey, row.network, row.url]
      )
    const owner = ownerKey
      ? (await db.query('select * from wo_social_stat where stat_key=$1 for update', [ownerKey])).rows[0]
      : null
    const targetBusy =
      owner &&
      ownerKey !== row.stat_key &&
      (hasSocialApifyAttempt(owner) ||
        (owner.status === 'queued' &&
          owner.lease_until &&
          new Date(owner.lease_until).getTime() > checkedNow))
    if (targetBusy && adoption) {
      await db.query('rollback')
      return false
    }
    const verifiedBusy = targetBusy && owner.platform_id === fields.platform_id
    let wroteOwner = false
    if (targetBusy && !verifiedBusy) {
      // Keep a paid result at its original attempt until the legacy target finishes. Nothing moves.
      const attempt = {
        ...(fields.apify_attempt ?? current.apify_attempt),
        phase: 'publishing',
        publication: { fields, aliasKeys: keys }
      }
      await db.query(
        `update wo_social_stat set apify_attempt=$3,lease_until=null,status='queued',attempts=0,next_retry_at=$4 where stat_key=$1 and lease_token=$2`,
        [row.stat_key, lease.token, attempt, new Date(checkedNow + 3000)]
      )
    } else {
      const terminalAttempt = targetBusy
        ? {
            ...(fields.apify_attempt ?? current.apify_attempt),
            phase: 'done',
            observedResult: { fields, aliasKeys: keys }
          }
        : null
      if (terminalAttempt) delete terminalAttempt.publication
      const sourceFields = moved
        ? {
            status: 'done',
            last_error: 'identity_changed',
            last_attempt_at: fields.last_attempt_at,
            checked_at: fields.checked_at,
            ...(terminalAttempt
              ? { apify_attempt: terminalAttempt }
              : fields.apify_attempt
                ? { apify_attempt: fields.apify_attempt }
                : current.apify_attempt?.phase === 'publishing'
                  ? { apify_attempt: { phase: 'done' } }
                  : {})
          }
        : {
            ...fields,
            ...(terminalAttempt ? { apify_attempt: terminalAttempt } : {}),
            ...(!terminalAttempt && current.apify_attempt?.phase === 'publishing' && !fields.apify_attempt
              ? { apify_attempt: { phase: 'done' } }
              : {})
          }
      const cols = Object.keys(sourceFields)
      await db.query(
        `update wo_social_stat set ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')},lease_until=null where stat_key=$1`,
        [row.stat_key, ...cols.map((c) => sourceFields[c])]
      )
      if (
        !targetBusy &&
        ownerKey &&
        ownerKey !== row.stat_key &&
        (!owner.fetched_at || new Date(owner.fetched_at).getTime() <= new Date(fields.fetched_at).getTime())
      ) {
        await db.query(
          `update wo_social_stat set ${COLUMNS.map((c, i) => `${c}=$${i + 2}`).join(', ')},status='done',url=$${COLUMNS.length + 2},lease_token=lease_token+1,lease_until=null where stat_key=$1`,
          [ownerKey, ...COLUMNS.map((c) => fields[c] ?? null), row.url]
        )
        wroteOwner = true
      }
    }
    // Binding is already safe when the busy target has independently verified the same ID.
    if (ownerKey && (!targetBusy || owner.platform_id === fields.platform_id))
      for (const key of keys) {
        await db.query('select pg_advisory_xact_lock(hashtext($1))', [`social-alias:${key}`])
        await db.query(
          `insert into wo_social_alias (alias_key,owner_key,network,platform_id,provider,observed_at,verified_at)
        values ($1,$2,$3,$4,$5,$6,$7) on conflict (alias_key) do update
        set owner_key=excluded.owner_key,platform_id=excluded.platform_id,provider=excluded.provider,
            observed_at=excluded.observed_at,verified_at=excluded.verified_at,invalidated_at=null
        where wo_social_alias.observed_at<excluded.observed_at`,
          [
            key,
            ownerKey,
            row.network,
            fields.platform_id,
            fields.provider,
            fields.fetched_at,
            new Date(checkedNow)
          ]
        )
      }
    if (!adoption) {
      // Alias locks may have waited after the first fence. Publication must still own its lease,
      // and overlapping force requests compare against completion, not the provider's start.
      const finishedAt = clock()
      if (new Date(current.lease_until).getTime() <= finishedAt) {
        await db.query('rollback')
        return false
      }
      await db.query('update wo_social_stat set checked_at=$2 where stat_key=any($1)', [
        [...new Set([row.stat_key, ...(wroteOwner ? [ownerKey] : [])])],
        new Date(finishedAt)
      ])
    }
    if (ownerKey && (!targetBusy || verifiedBusy)) await appendSocialVersion(db, ownerKey)
    await db.query('commit')
    return true
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}

/** Commit `starting` against the current input alias, under the same lock order as publication. */
export async function startSocialAttempt({ pool, row, lease, attempt, next, aliasKey, clock }) {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [`social-owner:${row.stat_key}`])
    const r = (await db.query('select * from wo_social_stat where stat_key=$1 for update', [row.stat_key]))
      .rows[0]
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [`social-alias:${aliasKey}`])
    const at = clock()
    if (
      !r ||
      String(r.lease_token) !== String(lease.token) ||
      r.status !== 'queued' ||
      new Date(r.lease_until).getTime() <= at ||
      r.apify_attempt?.id !== attempt.id ||
      r.apify_attempt?.phase !== 'reserved'
    ) {
      await db.query('rollback')
      return 'lost'
    }
    const a = (
      await db.query(
        'select owner_key from wo_social_alias where alias_key=$1 and invalidated_at is null and observed_at>$2',
        [aliasKey, new Date(at - WEEK)]
      )
    ).rows[0]
    if (a && a.owner_key !== row.stat_key) {
      await db.query('rollback')
      return 'alias'
    }
    await db.query('update wo_social_stat set apify_attempt=$2 where stat_key=$1', [row.stat_key, next])
    await db.query('commit')
    return 'started'
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}

/** A disappeared handle is negative evidence about that handle, never about its former ID owner. */
export async function invalidateSocialAlias({ pool, row, lease, aliasKey, observedAt, clock }) {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [`social-owner:${row.stat_key}`])
    const r = (await db.query('select * from wo_social_stat where stat_key=$1 for update', [row.stat_key]))
      .rows[0]
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [`social-alias:${aliasKey}`])
    const t = clock()
    if (
      !r ||
      r.status !== 'queued' ||
      String(r.lease_token) !== String(lease.token) ||
      new Date(r.lease_until).getTime() <= t
    ) {
      await db.query('rollback')
      return false
    }
    await db.query(
      `update wo_social_alias set invalidated_at=$3,observed_at=$4 where alias_key=$1 and owner_key=$2 and observed_at<=$4`,
      [aliasKey, row.stat_key, new Date(t), observedAt]
    )
    await db.query(
      `update wo_social_stat set status='failed',error='not_found',last_error='not_found',last_attempt_at=$2,checked_at=$4,next_retry_at=$3,lease_until=null where stat_key=$1`,
      [row.stat_key, observedAt, new Date(t + 3600000), new Date(t)]
    )
    await db.query('commit')
    return true
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}
