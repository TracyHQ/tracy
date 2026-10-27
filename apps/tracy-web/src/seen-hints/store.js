/** Account-level one-time hints, following assistant_tip_seen (migration 071); `welcome` since migration 176. */
export const SEEN_HINTS = Object.freeze(['site-tour', 'voice-tip', 'welcome'])

/**
 * Only this account's seen names, in stable order. No browser or device state is authoritative.
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 * @returns {Promise<string[]>}
 */
export async function seenHints(pool, accountId) {
  const { rows } = await pool.query(
    'select hint from account_seen_hint where account_id = $1 order by hint',
    [accountId]
  )
  return rows.map((row) => row.hint)
}

/**
 * The first insert wins, including concurrent requests; later writes keep its timestamp.
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 * @param {string} hint
 */
export async function markHintSeen(pool, accountId, hint) {
  await pool.query(
    'insert into account_seen_hint (account_id, hint) values ($1, $2) on conflict do nothing',
    [accountId, hint]
  )
}
