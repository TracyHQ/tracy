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

/**
 * The turns made in the sessions setup runs opened, each with its run: what lets a Git moment trailered with such a turn
 * ride on the run's row instead of a row of its own.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string[]} turnIds the turns a Git trailer names: only those can matter
 * @returns {Promise<Map<string, string>>} turn id → run id
 */
export async function setupRepairTurns(pool, siteKey, turnIds) {
  if (!turnIds.length) return new Map()
  const { rows } = await pool.query(
    `select t.turn_id, ss.run_id from site_turn t
       join setup_session ss on ss.site_key = t.site_key and ss.session_id = t.session_id
      where t.site_key = $1 and t.turn_id = any($2::text[])`,
    [siteKey, turnIds]
  )
  return new Map(rows.map((r) => [r.turn_id, r.run_id]))
}

/**
 * The runs of a site that have a Tracy setup row: at least one write Site changes lists (a refused one is not listed). A
 * repair turn folds into its run's row only when the row exists; otherwise it is a row of its own, so a change the
 * customer can undo is never out of sight.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @returns {Promise<Set<string>>}
 */
export async function setupRunsWithRows(pool, siteKey) {
  const { rows } = await pool.query(
    `select distinct origin_ref as run from site_write
      where site_key = $1 and origin = 'setup' and origin_ref is not null and outcome <> 'refused'`,
    [siteKey]
  )
  return new Set(rows.map((r) => r.run))
}

/**
 * Add one repair commit's files to its run's total. Paths are counted once however many turns touch them; a row that names
 * only a count (no paths) adds that count. The commit shown is the newest (the site as the run left it).
 * @param {Map<string, {sha: string, at: number, paths: Set<string>, uncounted: number}>} totals run → total so far
 * @param {string} run
 * @param {{sha: string, at: number, files: unknown}} commit `files` is a count or the list of paths, as the host sends it
 */
export function addRepairFiles(totals, run, { sha, at, files }) {
  const so = totals.get(run) ?? { sha, at, paths: new Set(), uncounted: 0 }
  if (Array.isArray(files)) for (const f of files) so.paths.add(String(f?.path ?? f))
  else so.uncounted += typeof files === 'number' ? files : 0
  if (at >= so.at) Object.assign(so, { sha, at })
  totals.set(run, so)
}

/** The distinct files a run's repair turns committed. */
export const repairFileCount = (total) => total.paths.size + total.uncounted
