// SQL and row helpers shared by the planner bench and the brand bench stores (ADR 0041, #301, #320): ids, JSON and
// number columns, and the lease fence a worker's write carries so a worker that lost its lease can never write.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const json = (value) => (value === undefined ? null : JSON.stringify(value))
export const num = (value) => (value === null || value === undefined ? null : Number(value))
export const iso = (value) => (value ? new Date(value).toISOString() : null)
/** SQL that is true when no lease token is given, or the run in `table` holds the given one. */
export const fenced = (table, runParam, tokenParam) =>
  `($${tokenParam}::bigint is null or exists (select 1 from ${table} r where r.id = $${runParam} and r.lease_token = $${tokenParam}::bigint))`

/** The brief of one WO revision by its id. */
export async function briefOfRevision(pool, revisionId) {
  if (!UUID.test(String(revisionId))) return { ok: false, code: 'SITE_PLANNER_REVISION_UNKNOWN' }
  const { rows } = await pool.query('select brief from wo_revision where id = $1', [revisionId])
  if (!rows[0]) return { ok: false, code: 'SITE_PLANNER_REVISION_UNKNOWN' }
  return { ok: true, brief: rows[0].brief }
}
