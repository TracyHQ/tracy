// BENCH ONLY. The record of write step runs (migration 198, table write_bench_run). A run happens in the bench command's
// own process, so this row is the only thing another shell can see or touch: `cancel` sets a flag the run reads between
// phases. A process that died cannot read it, so a run silent for longer than STALE is ended by the cancel itself.
import { UUID } from '../lib/bench-sql.js'

const STALE = "interval '10 minutes'"
const ONE_ACTIVE = 'write_bench_run_one_active'

const recordOf = (row) => ({
  id: row.id,
  siteKey: row.site_key,
  kit: row.kit,
  startedBy: row.started_by,
  status: row.status,
  phase: row.phase,
  cancelRequested: row.cancel_requested_at !== null,
  code: row.code,
  reason: row.reason,
  report: row.report,
  createdAt: row.created_at,
  finishedAt: row.finished_at
})

/** @param {import('pg').Pool} pool */
export function pgWriteRunStore(pool) {
  const read = async (id) => {
    if (!UUID.test(String(id))) return null
    const { rows } = await pool.query('select * from write_bench_run where id = $1', [id])
    return rows[0] ? recordOf(rows[0]) : null
  }
  return {
    read,
    /** @returns {Promise<{ run: object } | { active: object | null }>} refused while the site has a running run */
    async begin({ siteKey, kit, startedBy }) {
      try {
        const { rows } = await pool.query(
          'insert into write_bench_run (site_key, kit, started_by) values ($1, $2, $3) returning *',
          [siteKey, kit, startedBy]
        )
        return { run: recordOf(rows[0]) }
      } catch (error) {
        if (error?.constraint !== ONE_ACTIVE) throw error
        const { rows } = await pool.query(
          `select * from write_bench_run where site_key = $1 and status = 'running'`,
          [siteKey]
        )
        return { active: rows[0] ? recordOf(rows[0]) : null }
      }
    },
    async phase(id, phase) {
      await pool.query('update write_bench_run set phase = $2, updated_at = now() where id = $1', [id, phase])
    },
    /** Whether a cancel was asked; asking is also the run's sign of life. */
    async cancelRequested(id) {
      const { rows } = await pool.query(
        'update write_bench_run set updated_at = now() where id = $1 returning cancel_requested_at',
        [id]
      )
      return rows[0]?.cancel_requested_at != null
    },
    async finish(id, { status, code = null, reason = null, report = null }) {
      await pool.query(
        `update write_bench_run set status = $2, code = $3, reason = $4, report = $5, phase = 'done',
           finished_at = now(), updated_at = now() where id = $1`,
        [id, status, code, reason, report === null ? null : JSON.stringify(report)]
      )
    },
    /** The site check writes its results onto the report of a run that has ended. */
    async saveReport(id, report) {
      await pool.query('update write_bench_run set report = $2, updated_at = now() where id = $1', [
        id,
        JSON.stringify(report)
      ])
    },
    /** Asks a running run to stop, or ends it when it went silent. The row as it is now; null when there is no such run. */
    async requestCancel(id) {
      if (!UUID.test(String(id))) return null
      await pool.query(
        `update write_bench_run set cancel_requested_at = coalesce(cancel_requested_at, now()),
           status = case when updated_at < now() - ${STALE} then 'cancelled' else status end,
           phase = case when updated_at < now() - ${STALE} then 'done' else phase end,
           finished_at = case when updated_at < now() - ${STALE} then now() else finished_at end
         where id = $1 and status = 'running'`,
        [id]
      )
      return read(id)
    },
    async list({ limit = 20 } = {}) {
      const { rows } = await pool.query('select * from write_bench_run order by created_at desc limit $1', [
        limit
      ])
      return rows.map(recordOf)
    }
  }
}
