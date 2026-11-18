// A Website Opportunities research revision (`wo_revision`) as a build that runs the step chain names it: the frozen
// research the benches and the step chain read (`brief`). Read here, in lib/, so the site creation door can check a
// revision is the caller's own without reaching into another domain.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether the revision exists and belongs to the account.
 * @param {import('pg').Pool} pool @param {string} revisionId @param {string} accountId
 */
export async function researchRevisionOwned(pool, revisionId, accountId) {
  if (!UUID.test(String(revisionId))) return false
  const { rowCount } = await pool.query('select 1 from wo_revision where id = $1 and account_id = $2', [
    revisionId,
    accountId
  ])
  return rowCount === 1
}

/**
 * The business name the research holds, or null: what the run frame names the site's build by (`normalize`).
 * @param {import('pg').Pool} pool @param {string} revisionId
 */
export async function researchBusinessName(pool, revisionId) {
  if (!UUID.test(String(revisionId))) return null
  const { rows } = await pool.query(
    `select brief #>> '{business,name}' as name from wo_revision where id = $1`,
    [revisionId]
  )
  const name = typeof rows[0]?.name === 'string' ? rows[0].name.trim() : ''
  return name || null
}
