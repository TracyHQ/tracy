/** Immutable, verified observations. Revisions order one authority's records, not commit cursors. */
import { platformKey } from './social-alias.js'

export async function appendSocialVersion(db, identityKey) {
  const row = (await db.query('select * from wo_social_stat where stat_key=$1', [identityKey])).rows[0]
  if (!row?.fetched_at || !row.provider || platformKey(row.network, row.platform_id) !== identityKey)
    return null
  const snapshot = Object.fromEntries(
    ['followers', 'posts', 'last_post_at', 'posts_per_month', 'coverage', 'provider', 'handle'].map((k) => [
      k,
      row[k]
    ])
  )
  return (
    (
      await db.query(
        `insert into wo_social_snapshot (identity_key,network,platform_id,snapshot,fetched_at)
    select $1,$2,$3,$4,$5 where not exists (
      select 1 from wo_social_snapshot where version=(select max(version) from wo_social_snapshot where identity_key=$1)
      and snapshot=$4::jsonb and fetched_at=$5
    ) returning version`,
        [identityKey, row.network, row.platform_id, snapshot, row.fetched_at]
      )
    ).rows[0]?.version ?? null
  )
}

/** Backfill old verified owners without changing freshness or moving attempts. */
export async function backfillSocialVersion(pool, identityKey) {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [`social-owner:${identityKey}`])
    await db.query('select stat_key from wo_social_stat where stat_key=$1 for update', [identityKey])
    await appendSocialVersion(db, identityKey)
    await db.query('commit')
  } catch (e) {
    await db.query('rollback')
    throw e
  } finally {
    db.release()
  }
}
