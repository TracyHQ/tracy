// Tracy's principals for Website Opportunities: a principal shares its account's uuid (migrations 171/172).

/**
 * The principal of a Tracy account email, or null. Case-insensitive like every other email lookup here; an exact
 * match wins should two accounts differ only by case.
 * @param {{query: Function}} pool @param {string} email
 */
export async function principalOf(pool, email) {
  const { rows } = await pool.query(
    'select id from account where lower(email) = lower($1) order by (email = $1) desc, created_at limit 1',
    [email]
  )
  return rows[0]?.id ?? null
}

/** The name an account signs outreach with ('' when none). */
export async function displayNameOf(pool, principalId) {
  const { rows } = await pool.query('select display_name from account where id = $1', [principalId])
  return rows[0]?.display_name ?? ''
}

/** The email of an account, for the operator's place detail; null when there is none. */
export async function emailOf(pool, principalId) {
  const { rows } = await pool.query('select email from account where id = $1', [principalId])
  return rows[0]?.email ?? null
}
