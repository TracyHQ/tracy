/**
 * Hub quota (ADR 0036 Phase 3): measured per ACCOUNT, separately for cached reads, paid research, observations sent
 * and picture bytes, each by UTC day and UTC month at once. A token is only a way in: rotating it, or several people
 * holding it, never resets or splits the account's quota. The real money ceiling is the cost ledger's reserve and
 * settle, below every quota.
 */

const MiB = 1024 * 1024

/**
 * DEFAULTS for a pilot, as the council proposed them (24/10/2026). They are not a pricing decision; a deployment
 * passes its own `limits`. `null` means no limit for that period.
 */
export const PILOT_QUOTA_DEFAULTS = Object.freeze({
  read_places: Object.freeze({ day: 500, month: 10_000 }),
  research: Object.freeze({ day: 5, month: 50 }),
  observations: Object.freeze({ day: 500, month: null }),
  image_bytes: Object.freeze({ day: 100 * MiB, month: 1024 * MiB })
})
/** DEFAULT: at most this many places with observations still pending verification, per account. */
export const PILOT_PENDING_PLACES_DEFAULT = 20

export const QUOTA_CATEGORIES = Object.freeze(Object.keys(PILOT_QUOTA_DEFAULTS))

const periodStarts = (ms) => {
  const day = new Date(ms).toISOString().slice(0, 10)
  return { day, month: `${day.slice(0, 7)}-01` }
}

/**
 * @param {{ pool: import('pg').Pool, limits?: Partial<Record<string, {day: number | null, month: number | null}>>,
 *   now?: () => number }} deps
 */
export function createHubQuota({ pool, limits = {}, now = Date.now }) {
  const limitsOf = (category) => {
    if (!QUOTA_CATEGORIES.includes(category)) throw new TypeError(`hub quota: unknown category ${category}`)
    return { ...PILOT_QUOTA_DEFAULTS[category], ...limits[category] }
  }

  /**
   * Counts `amount` in `category` for the account, day and month. Pass `db` (a client inside the caller's
   * transaction) to make the charge part of that transaction; on a refusal the caller must roll it back.
   * Without `db` the charge runs in a transaction of its own and a refusal counts nothing.
   * @returns {Promise<{ok: true} | {ok: false, category: string, period: 'day' | 'month', limit: number, used: number}>}
   */
  async function charge(accountId, category, amount, { db } = {}) {
    const limit = limitsOf(category)
    if (!Number.isInteger(amount) || amount < 0)
      throw new TypeError('hub quota: amount must be a whole number >= 0')
    if (!db) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const out = await charge(accountId, category, amount, { db: client })
        await client.query(out.ok ? 'commit' : 'rollback')
        return out
      } catch (error) {
        await client.query('rollback').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    }
    const starts = periodStarts(now())
    for (const period of /** @type {const} */ (['day', 'month'])) {
      const cap = limit[period]
      const { rows } = await db.query(
        `insert into wo_hub_quota_use (account_id, category, period, period_start, used)
         values ($1, $2, $3, $4, 0)
         on conflict (account_id, category, period, period_start) do update set used = wo_hub_quota_use.used
         returning used`,
        [accountId, category, period, starts[period]]
      )
      const used = Number(rows[0].used)
      if (cap != null && used + amount > cap) return { ok: false, category, period, limit: cap, used }
      await db.query(
        `update wo_hub_quota_use set used = used + $5
         where account_id = $1 and category = $2 and period = $3 and period_start = $4`,
        [accountId, category, period, starts[period], amount]
      )
    }
    return { ok: true }
  }

  /** The account's use in the current day and month, per category. */
  async function usage(accountId) {
    const starts = periodStarts(now())
    const { rows } = await pool.query(
      `select category, period, used from wo_hub_quota_use
       where account_id = $1 and ((period = 'day' and period_start = $2) or (period = 'month' and period_start = $3))`,
      [accountId, starts.day, starts.month]
    )
    const out = Object.fromEntries(QUOTA_CATEGORIES.map((c) => [c, { day: 0, month: 0 }]))
    for (const r of rows) out[r.category][r.period] = Number(r.used)
    return out
  }

  return { charge, usage, limitsOf }
}
