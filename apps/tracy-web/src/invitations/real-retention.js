import { randomUUID } from 'node:crypto'
import { realClock, realError, realId, realTransaction } from './real-store.js'

export async function getRetention({ db }) {
  const row = (await db.query('select retention_days from invitations_real_setting where id=1')).rows[0]
  return row?.retention_days ?? 30
}

export async function setRetention({ db, days, actorId }) {
  realId(actorId)
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) throw realError('REAL_INVALID_RETENTION')
  await db.query(
    `with changed as (
    insert into invitations_real_setting(id,retention_days,updated_by) values(1,$1,$2)
    on conflict(id) do update set retention_days=$1,updated_by=$2,updated_at=clock_timestamp() returning id)
    insert into invitations_real_audit(id,actor_id,action) select $3,$2,'retention_setting' from changed`,
    [days, actorId, randomUUID()]
  )
  return days
}

export async function extendCampaign({ pool, keys, campaignId, revision, expiresAt, actorId }) {
  realId(actorId)
  if (
    typeof expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    new Date(expiresAt).toISOString() !== expiresAt
  )
    throw realError('REAL_INVALID_TIME')
  return realTransaction(
    { pool, keys, campaignId, expectedRevision: revision, write: true },
    async (db, { row, now, expiresAt: keyExpiry }) => {
      const expiry = Date.parse(expiresAt)
      if (
        expiry <= Math.min(row.expires_at.getTime(), Date.parse(keyExpiry)) ||
        expiry > row.first_imported_at.getTime() + 365 * 86400000
      )
        throw realError('REAL_INVALID_RETENTION')
      // Write the independent ledger first. A failed DB commit cannot extend the old DB deadline.
      if (expiry > Date.parse(keyExpiry)) await keys.extend({ campaignId, expiresAt, now })
      await db.query('update invitations_real_campaign set expires_at=$2 where id=$1', [
        campaignId,
        expiresAt
      ])
      await db.query(
        "update invitations_real_import set expires_at=$2 where campaign_id=$1 and status='committed'",
        [campaignId, expiresAt]
      )
      await db.query(
        "insert into invitations_real_audit(id,campaign_id,actor_id,action) values($1,$2,$3,'retention_extended')",
        [randomUUID(), campaignId, actorId]
      )
      return { revision: row.revision + 1, expiresAt }
    }
  )
}

export async function sweepRealCampaigns({ pool, keys, limit = 20 }) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw realError('REAL_INVALID_LIMIT')
  const db = await pool.connect()
  let expired = 0
  let purged = 0
  // Campaigns whose key could not be read or revoked this pass: returned so the caller can raise
  // them instead of the sweep skipping them silently (ids and codes only, never data).
  const keyErrors = []
  try {
    await db.query('begin')
    await db.query("set local statement_timeout='10000'; set local lock_timeout='5000'")
    const scanNow = await realClock(db)
    const rows = (
      await db.query(
        `select * from invitations_real_campaign where tombstoned_at is null
      order by (expires_at <= $2) desc,key_checked_at nulls first,id for update skip locked limit $1`,
        [limit, scanNow]
      )
    ).rows
    async function keyError(id, error, now) {
      if (!['REAL_KEY_UNAVAILABLE', 'REAL_KEY_BUSY'].includes(error.code)) throw error
      keyErrors.push({ campaignId: id, code: error.code, expired: Date.parse(now) >= expiresAt.get(id) })
      await db.query(
        "insert into invitations_real_audit(id,campaign_id,action,code) values($1,$2,'retention_key_error',$3)",
        [randomUUID(), id, error.code]
      )
      await db.query('update invitations_real_campaign set key_checked_at=$2 where id=$1', [id, now])
    }
    const expiresAt = new Map(rows.map((r) => [r.id, r.expires_at.getTime()]))
    for (const row of rows) {
      const now = await realClock(db)
      let expiredNow = Date.parse(now) >= row.expires_at.getTime()
      if (!expiredNow) {
        try {
          await keys.read({ campaignId: row.id, now })
        } catch (error) {
          if (error.code !== 'REAL_EXPIRED') {
            await keyError(row.id, error, now)
            continue
          }
          expiredNow = true
        }
      }
      if (!expiredNow) {
        await db.query('update invitations_real_campaign set key_checked_at=$2 where id=$1', [row.id, now])
        continue
      }
      try {
        await keys.revoke({ campaignId: row.id, now })
      } catch (error) {
        await keyError(row.id, error, now)
        continue
      }
      expired++
      for (const suffix of [
        'queue_item',
        'queue',
        'member_check',
        'suppression',
        'send',
        'draft',
        'identity',
        'recipient',
        'template',
        'asset',
        'import'
      ]) {
        await db.query(`delete from invitations_real_${suffix} where campaign_id=$1`, [row.id])
      }
      await db.query('update invitations_real_campaign set payload=null,tombstoned_at=$2 where id=$1', [
        row.id,
        now
      ])
      await db.query(
        "insert into invitations_real_audit(id,campaign_id,action,code) values($1,$2,'retention_purged','REAL_EXPIRED')",
        [randomUUID(), row.id]
      )
      purged++
    }
    const now = await realClock(db)
    const previews = (
      await db.query(
        'select id from invitations_real_import where expires_at <= $1 order by expires_at for update skip locked limit $2',
        [now, limit]
      )
    ).rows
    for (const row of previews) {
      try {
        await keys.revoke({ campaignId: row.id, now })
      } catch (error) {
        if (!['REAL_KEY_UNAVAILABLE', 'REAL_KEY_BUSY'].includes(error.code)) throw error
        await db.query(
          "insert into invitations_real_audit(id,action,code) values($1,'retention_key_error',$2)",
          [randomUUID(), error.code]
        )
        continue
      }
      await db.query('delete from invitations_real_import where id=$1', [row.id])
    }
    await db.query('commit')
    await keys.sweep({ now, limit })
    return { expired, purged, keyErrors }
  } catch (error) {
    await db.query('rollback').catch(() => {})
    throw error
  } finally {
    db.release()
  }
}
