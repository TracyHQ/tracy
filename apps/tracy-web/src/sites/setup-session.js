/**
 * The chat sessions of a Tracy setup run (migration 206): the 9b repair pass of a step chain build opens one dsh session
 * per page through Tracy's site agent, and writes the pair here first. The Apply door then records a write made in such
 * a session as Tracy setup under the run, and Site changes keeps the session's turns out of the list, so one build shows
 * as one "Tracy setup" row.
 */

/**
 * Write down that `sessionId` belongs to setup run `runId` on a site. Idempotent.
 * @param {import('pg').Pool} pool
 * @param {{siteKey: string, sessionId: string, runId: string}} input
 */
export async function registerSetupSession(pool, { siteKey, sessionId, runId }) {
  await pool.query(
    `insert into setup_session (site_key, session_id, run_id) values ($1, $2, $3)
     on conflict (site_key, session_id) do nothing`,
    [siteKey, sessionId, runId]
  )
}

/**
 * The setup run a session belongs to on a site, or null when it belongs to none.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string | null} sessionId
 * @returns {Promise<string | null>}
 */
export async function setupRunOfSession(pool, siteKey, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return null
  const { rows } = await pool.query(
    'select run_id from setup_session where site_key = $1 and session_id = $2',
    [siteKey, sessionId]
  )
  return rows[0]?.run_id ?? null
}
