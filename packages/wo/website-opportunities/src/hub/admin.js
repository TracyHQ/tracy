/**
 * What a hub operator reads about accounts and the verification queue. The changes an operator makes go through the
 * modules that own them (`tokens.js`, `contributions.js`, `revocations.js`); only an account's state is set here.
 */
import { QUOTA_CATEGORIES } from './quota.js'
import { VERIFY_PURPOSE } from './verify-queue.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (id) => UUID.test(String(id))
const iso = (d) => (d ? new Date(d).toISOString() : null)
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10)

/**
 * Hub accounts, newest first, with their active token prefix, contribution counts and quota use this UTC day and month.
 * @param {import('pg').Pool} pool
 * @param {{ now?: () => number, limit?: number, state?: string | null }} [options]
 */
export async function listHubAccounts(pool, { now = Date.now, limit = 100, state = null } = {}) {
  const { rows } = await pool.query(
    `select a.id, a.principal_id, a.state, a.created_at, t.token_prefix, t.created_at as token_created_at,
            (select count(*)::int from wo_hub_contribution c where c.account_id = a.id) as total,
            (select count(*)::int from wo_hub_contribution c where c.account_id = a.id and c.status = 'pending') as pending,
            (select count(*)::int from wo_hub_contribution c where c.account_id = a.id and c.status = 'withdrawn') as withdrawn
       from wo_hub_account a
       left join wo_hub_token t on t.account_id = a.id and t.revoked_at is null
      where ($1::text is null or a.state = $1)
      order by a.created_at desc, a.id desc limit $2`,
    [state, limit]
  )
  const day = utcDay(now())
  const use = rows.length
    ? (
        await pool.query(
          `select account_id, category, period, used from wo_hub_quota_use
            where account_id = any($1::uuid[])
              and ((period = 'day' and period_start = $2) or (period = 'month' and period_start = $3))`,
          [rows.map((r) => r.id), day, `${day.slice(0, 7)}-01`]
        )
      ).rows
    : []
  const usageOf = (id) => {
    const out = Object.fromEntries(QUOTA_CATEGORIES.map((c) => [c, { day: 0, month: 0 }]))
    for (const u of use) if (u.account_id === id) out[u.category][u.period] = Number(u.used)
    return out
  }
  return rows.map((r) => ({
    id: r.id,
    principalId: r.principal_id,
    state: r.state,
    createdAt: iso(r.created_at),
    tokenPrefix: r.token_prefix ?? null,
    tokenCreatedAt: iso(r.token_created_at),
    contributions: { total: r.total, pending: r.pending, withdrawn: r.withdrawn },
    usage: usageOf(r.id)
  }))
}

/** The account row (`{id, principalId, state}`), or null. */
export async function hubAccountById(db, id) {
  if (!isUuid(id)) return null
  const { rows } = await db.query('select id, principal_id, state from wo_hub_account where id = $1', [id])
  return rows[0] ? { id: rows[0].id, principalId: rows[0].principal_id, state: rows[0].state } : null
}

/** Blocks or unblocks an account; a blocked account's token authenticates as nobody (`tokens.js`). */
export async function setHubAccountState(pool, id, state) {
  if (!['active', 'blocked'].includes(state)) throw new TypeError(`hub account: unknown state ${state}`)
  const { rowCount } = await pool.query('update wo_hub_account set state = $2 where id = $1', [id, state])
  return rowCount === 1
}

/** The account's newest contributions (no observation values). */
export async function contributionsOf(pool, accountId, { limit = 50 } = {}) {
  const { rows } = await pool.query(
    `select c.id, c.idempotency_key, c.status, c.received_at, c.withdrawn_at, c.payload_bytes,
            count(o.id)::int as observations,
            count(o.id) filter (where o.status = 'pending')::int as pending,
            count(o.id) filter (where o.status = 'accepted')::int as accepted,
            count(o.id) filter (where o.status = 'rejected')::int as rejected
       from wo_hub_contribution c left join wo_hub_observation o on o.contribution_id = c.id
      where c.account_id = $1
      group by c.id order by c.received_at desc, c.id desc limit $2`,
    [accountId, limit]
  )
  return rows.map((r) => ({
    id: r.id,
    idempotencyKey: r.idempotency_key,
    status: r.status,
    receivedAt: iso(r.received_at),
    withdrawnAt: iso(r.withdrawn_at),
    payloadBytes: r.payload_bytes,
    observations: { total: r.observations, pending: r.pending, accepted: r.accepted, rejected: r.rejected }
  }))
}

/** The account a contribution belongs to, or null. */
export async function contributionAccountOf(db, id) {
  if (!isUuid(id)) return null
  const { rows } = await db.query('select account_id from wo_hub_contribution where id = $1', [id])
  return rows[0]?.account_id ?? null
}

/**
 * What waits for verification (pending observations, their source groups, those deferred for budget, the oldest
 * received) and today's verification spend against its cap.
 */
export async function verifyBacklog(pool, { now = Date.now, verifyDailyCapCents }) {
  const day = utcDay(now())
  const [b, spent] = await Promise.all([
    pool.query(
      `select count(*)::int as pending,
              count(distinct (o.claimed_source_family, o.claimed_source_object_id))::int as groups,
              count(*) filter (where o.reason = 'deferred_budget')::int as deferred,
              min(c.received_at) as oldest
         from wo_hub_observation o join wo_hub_contribution c on c.id = o.contribution_id
        where o.status = 'pending'`
    ),
    pool.query(
      `select coalesce(sum(case state when 'released' then 0 when 'settled' then coalesce(actual_cents, reserved_cents)
         else greatest(reserved_cents, coalesce(actual_cents, 0)) end), 0)::int as cents
       from wo_cost_ledger where purpose = $1 and budget_day = $2`,
      [VERIFY_PURPOSE, day]
    )
  ])
  const r = b.rows[0]
  return {
    backlog: {
      pendingObservations: r.pending,
      pendingGroups: r.groups,
      deferredBudget: r.deferred,
      oldestReceivedAt: iso(r.oldest)
    },
    budget: { day, spentCents: spent.rows[0].cents, capCents: verifyDailyCapCents }
  }
}
