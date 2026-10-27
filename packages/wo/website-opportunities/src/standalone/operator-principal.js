/**
 * The one principal of a standalone install (`wo_principal`, `../schema/0001-baseline.sql`): every row of the
 * pipeline belongs to it. Whoever the host lets in is that operator, so the row is found by its kind, never by the
 * email they sent: changing `OPERATOR_EMAIL` keeps every row.
 */
const KIND = 'operator'
const REF = 'default'

/** Creates the operator principal when it is missing. @returns {Promise<{ id: string }>} */
export async function ensureOperatorPrincipal(pool) {
  const { rows } = await pool.query(
    `insert into wo_principal (kind, external_ref) values ($1, $2)
     on conflict (kind, external_ref) do update set kind = excluded.kind
     returning id`,
    [KIND, REF]
  )
  return { id: rows[0].id }
}

/** @returns {Promise<string | null>} the operator principal's id, null before the first boot made it. */
export async function operatorPrincipalId(pool) {
  const { rows } = await pool.query('select id from wo_principal where kind = $1 and external_ref = $2', [
    KIND,
    REF
  ])
  return rows[0]?.id ?? null
}
