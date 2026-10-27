/**
 * The rows behind a design system picked in the Add site form (`db/migrations/100-site-create-design-system.sql`).
 *
 * The row is the source of truth for how far the pick got, because the process that writes it and the process that
 * answers the wizard's poll need not be the same one (two replicas, or a deploy in the middle). Every transition that
 * must happen at most once (`claim`, `takeOver`) is one statement decided by the database.
 */

/** @typedef {'queued'|'applying'|'applied'|'skipped'|'failed'} PickState */

/** The states in which the wizard must still be told "working". */
export const OPEN_STATES = Object.freeze(['queued', 'applying'])

/**
 * @param {import('pg').Pool} pool
 */
export function buildDesignSystemStore(pool) {
  return {
    /**
     * Write the pick of a press. A second press of the same build keeps the row as it is, except one whose install
     * FAILED (or that is still waiting): that one moves on to the new provision job, under the new pick.
     * @param {{siteKey: string, accountId?: string | null, email: string, id: string, name?: string | null,
     *   jobId?: string | null, host?: string | null}} p
     */
    async put(p) {
      const { rows } = await pool.query(
        `insert into site_create_design_system (site_key, account_id, actor, system_id, system_name, job_id, host)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (site_key) do update set
           actor = excluded.actor, system_id = excluded.system_id, system_name = excluded.system_name,
           job_id = excluded.job_id, host = excluded.host, state = 'queued', reason = null, updated_at = now()
         where site_create_design_system.state in ('queued', 'failed')
           and site_create_design_system.job_id is distinct from excluded.job_id
         returning *`,
        [p.siteKey, p.accountId ?? null, p.email, p.id, p.name ?? null, p.jobId ?? null, p.host ?? null]
      )
      return rows[0] ?? (await this.get(p.siteKey))
    },

    /** @param {string} siteKey */
    async get(siteKey) {
      const { rows } = await pool.query(
        `select *, (extract(epoch from now() - updated_at) * 1000)::bigint as idle_ms
           from site_create_design_system where site_key = $1`,
        [siteKey]
      )
      return rows[0] ?? null
    },

    /** The worker is alive: its row's clock moves, so no sweep takes it over. @param {string} siteKey */
    async touch(siteKey) {
      await pool.query(
        `update site_create_design_system set updated_at = now() where site_key = $1 and state = 'queued'`,
        [siteKey]
      )
    },

    /** queued → applying, once: of two workers exactly one gets the row. @param {string} siteKey */
    async claim(siteKey) {
      const { rows } = await pool.query(
        `update site_create_design_system set state = 'applying', updated_at = now()
          where site_key = $1 and state = 'queued' returning *`,
        [siteKey]
      )
      return rows[0] ?? null
    },

    /**
     * Write how the pick ended, only from the states named.
     * @param {string} siteKey
     * @param {PickState[]} from
     * @param {{state: PickState, reason?: string | null, applyId?: string | null}} end
     */
    async settle(siteKey, from, { state, reason = null, applyId = null }) {
      const { rows } = await pool.query(
        `update site_create_design_system set state = $3, reason = $4, apply_id = coalesce($5, apply_id),
                updated_at = now()
          where site_key = $1 and state = any($2::text[]) returning *`,
        [siteKey, from, state, reason === null ? null : String(reason).slice(0, 500), applyId]
      )
      return rows[0] ?? null
    },

    /** The first poll that handed the finished site over says so (`handed_at`), once. @param {string} siteKey */
    async handedOver(siteKey) {
      await pool.query(
        `update site_create_design_system set handed_at = now() where site_key = $1 and handed_at is null`,
        [siteKey]
      )
    },

    /**
     * The open rows nobody has touched for `staleMs`: their worker died with its process (a deploy).
     * @param {number} staleMs
     */
    async stale(staleMs) {
      const { rows } = await pool.query(
        `select * from site_create_design_system
          where state in ('queued', 'applying') and updated_at < now() - ($1::int * interval '1 millisecond')
          order by updated_at limit 20`,
        [staleMs]
      )
      return rows
    },

    /** Take a stale queued row for this process, once across replicas. @param {string} siteKey @param {number} staleMs */
    async takeOver(siteKey, staleMs) {
      const { rows } = await pool.query(
        `update site_create_design_system set updated_at = now()
          where site_key = $1 and state = 'queued'
            and updated_at < now() - ($2::int * interval '1 millisecond') returning *`,
        [siteKey, staleMs]
      )
      return rows[0] ?? null
    },

    /**
     * The Design system door's own row for a write of this system on this site since the pick was made: proof the
     * write of a worker that died mid-apply landed.
     * @param {string} siteKey @param {string} systemId @param {Date | string} since
     * @returns {Promise<string | null>} its undo id
     */
    async appliedSince(siteKey, systemId, since) {
      const { rows } = await pool.query(
        `select undo_id from site_design_system
          where site_key = $1 and system_id = $2 and applied_at >= $3
          order by applied_at desc, id desc limit 1`,
        [siteKey, systemId, since]
      )
      return rows[0]?.undo_id ?? null
    }
  }
}
