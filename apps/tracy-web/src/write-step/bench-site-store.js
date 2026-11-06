// BENCH ONLY. The record of the trial sites the write step bench made (migration 198, table write_bench_site). The
// creator (bench-site-creator.js) deletes only sites this table names, and keeps one.
const COLUMNS = {
  siteKey: 'site_key',
  jobId: 'job_id',
  status: 'status',
  code: 'code',
  reason: 'reason',
  createMs: 'create_ms',
  totalMs: 'total_ms',
  answeredContract: 'answered_contract'
}

const recordOf = (row) => ({
  id: row.id,
  label: row.label,
  quickstart: row.quickstart,
  contract: row.contract,
  startedBy: row.started_by,
  status: row.status,
  siteKey: row.site_key,
  jobId: row.job_id,
  code: row.code,
  reason: row.reason,
  createMs: row.create_ms,
  totalMs: row.total_ms,
  answeredContract: row.answered_contract,
  createdAt: row.created_at
})

/** @param {import('pg').Pool} pool */
export function pgBenchSiteStore(pool) {
  /** Set the named fields of one row; a field this store does not know is a bug, not a silent skip. */
  async function update(id, fields) {
    const names = Object.keys(fields)
    const unknown = names.filter((name) => !COLUMNS[name])
    if (unknown.length) throw new Error(`unknown bench site field: ${unknown.join(', ')}`)
    const sets = names.map((name, i) => `${COLUMNS[name]} = $${i + 2}`)
    await pool.query(`update write_bench_site set ${sets.join(', ')}, updated_at = now() where id = $1`, [
      id,
      ...names.map((name) => fields[name])
    ])
  }
  return {
    async begin({ label, quickstart, contract, startedBy }) {
      const { rows } = await pool.query(
        `insert into write_bench_site (label, quickstart, contract, started_by) values ($1, $2, $3, $4) returning *`,
        [label, quickstart, contract, startedBy]
      )
      return recordOf(rows[0])
    },
    attach: update,
    settle: update,
    async others(id) {
      const { rows } = await pool.query(
        `select * from write_bench_site where id <> $1 and status <> 'removed' order by created_at`,
        [id]
      )
      return rows.map(recordOf)
    },
    async list({ limit = 20 } = {}) {
      const { rows } = await pool.query(`select * from write_bench_site order by created_at desc limit $1`, [
        limit
      ])
      return rows.map(recordOf)
    }
  }
}
