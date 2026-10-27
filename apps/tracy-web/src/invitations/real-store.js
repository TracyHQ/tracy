export function realError(code, status = 400) {
  return Object.assign(new Error('Real campaign request refused'), { code, status })
}

export function realId(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    throw realError('REAL_INVALID_ID')
  return value
}

export async function realClock(db) {
  return (await db.query('select clock_timestamp() as now')).rows[0].now.toISOString()
}

/** Request-scoped admission holds the seat row through publication, never through body upload. */
export async function realAccessTransaction(pool, fn) {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query("set local statement_timeout='10000'; set local lock_timeout='5000'")
    await pool.realAuthorize?.(db)
    const result = await fn(db)
    await db.query('commit')
    return result
  } catch (error) {
    await db.query('rollback').catch(() => {})
    throw error
  } finally {
    db.release()
  }
}

async function requireActive(db, keys, campaignId) {
  const row = (
    await db.query('select *,source_date::text from invitations_real_campaign where id=$1', [campaignId])
  ).rows[0]
  if (!row) throw realError('REAL_NOT_FOUND', 404)
  const now = await realClock(db)
  if (row.tombstoned_at || Date.parse(now) >= row.expires_at.getTime()) {
    await keys.revoke({ campaignId, now })
    throw realError('REAL_EXPIRED', 410)
  }
  if (!row.payload) throw realError('REAL_KEY_UNAVAILABLE', 503)
  const material = await keys.read({ campaignId, now })
  return { row: { ...row, revision: Number(row.revision) }, now, ...material }
}

/** A row lock fences readers, writers and retention. Never perform outbound IO in the callback.
 * The DB clock is read after admission to the lock and again after all writes, before commit. */
export async function realTransaction({ pool, keys, campaignId, expectedRevision, write = false }, fn) {
  realId(campaignId)
  if (write && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1))
    throw realError('REAL_INVALID_REVISION')
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query(
      "set local statement_timeout='10000'; set local lock_timeout='5000'; set local idle_in_transaction_session_timeout='15000'"
    )
    const locked = await db.query('select id from invitations_real_campaign where id=$1 for update', [
      campaignId
    ])
    if (!locked.rowCount) throw realError('REAL_NOT_FOUND', 404)
    await pool.realAuthorize?.(db)
    const state = await requireActive(db, keys, campaignId)
    if (expectedRevision !== undefined && expectedRevision !== state.row.revision)
      throw realError('REAL_STALE_REVISION', 409)
    const result = await fn(db, state)
    await requireActive(db, keys, campaignId)
    // Keep the admission deadline even when the callback extends DB and vault deadlines.
    const finalNow = await realClock(db)
    if (Date.parse(finalNow) >= Math.min(state.row.expires_at.getTime(), Date.parse(state.expiresAt))) {
      await keys.revoke({ campaignId, now: finalNow })
      throw realError('REAL_EXPIRED', 410)
    }
    if (write)
      await db.query('update invitations_real_campaign set revision=revision+1 where id=$1', [campaignId])
    await db.query('commit')
    return result
  } catch (error) {
    await db.query('rollback').catch(() => {})
    throw error
  } finally {
    db.release()
  }
}
