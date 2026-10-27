/**
 * What paid provider calls cost, read from the cost ledger (`../cost-ledger.js`) for the operator's Spend tab. A row
 * counts what it commits against a cap (`COMMITTED`): a settled call its cost, an open or unreconciled one its
 * ceiling, a released one nothing (it never went out, so it is not a call either).
 */
import { COMMITTED } from '../cost-ledger.js'

export const LEDGER_STATES = Object.freeze(['reserved', 'settled', 'released', 'unreconciled'])
export const MAX_SPEND_DAYS = 90
const DAY_MS = 86_400_000
const ROWS_MAX = 200

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10)
const int = (v) => Number(v ?? 0)

/** The spend caps the settings hold, as the Spend tab shows them beside what was spent. */
export function spendCaps(settings) {
  return {
    researchDailyCapCents: settings.researchDailyCapCents,
    researchJobCapCents: settings.researchJobCapCents,
    researchPublicDailyCapCents: settings.researchPublicDailyCapCents,
    maxChargeUsdPerRun: settings.maxChargeUsdPerRun,
    socialStatsProviderDailyCap: settings.socialStatsProviderDailyCap
  }
}

/**
 * Totals of the last `days` UTC days (today included): overall, per provider, per purpose and per day, plus today's
 * split into spent, held and unreconciled (what the daily cap is checked against).
 * @param {import('pg').Pool} pool
 * @param {{days: number, now?: () => number}} options
 */
export async function spendSummary(pool, { days, now = Date.now }) {
  const today = utcDay(now())
  const since = utcDay(now() - (days - 1) * DAY_MS)
  const sent = `state <> 'released'`
  const totals = (
    await pool.query(
      `select count(*) filter (where ${sent}) as calls,
              coalesce(sum(${COMMITTED}), 0) as committed,
              coalesce(sum(coalesce(actual_cents, reserved_cents)) filter (where state = 'settled'), 0) as settled,
              coalesce(sum(reserved_cents) filter (where state = 'reserved'), 0) as open,
              coalesce(sum(${COMMITTED}) filter (where state = 'unreconciled'), 0) as unreconciled,
              count(*) filter (where state = 'unreconciled') as unreconciled_calls,
              count(*) filter (where state = 'released') as released_calls
         from wo_cost_ledger where budget_day between $1 and $2`,
      [since, today]
    )
  ).rows[0]
  const grouped = async (column) =>
    (
      await pool.query(
        `select ${column} as key, count(*) filter (where ${sent}) as calls, coalesce(sum(${COMMITTED}), 0) as committed,
                count(*) filter (where state = 'unreconciled') as unreconciled_calls
           from wo_cost_ledger where budget_day between $1 and $2
          group by 1 order by 3 desc, 1 nulls last`,
        [since, today]
      )
    ).rows
  const [byProvider, byPurpose, byDay] = await Promise.all([
    grouped('provider'),
    grouped('purpose'),
    pool
      .query(
        `select budget_day::text as key, count(*) filter (where ${sent}) as calls, coalesce(sum(${COMMITTED}), 0) as committed
           from wo_cost_ledger where budget_day between $1 and $2 group by 1 order by 1`,
        [since, today]
      )
      .then((r) => r.rows)
  ])
  const t = (
    await pool.query(
      `select coalesce(sum(${COMMITTED}), 0) as committed,
              coalesce(sum(coalesce(actual_cents, reserved_cents)) filter (where state = 'settled'), 0) as spent,
              coalesce(sum(reserved_cents) filter (where state = 'reserved'), 0) as reserved,
              coalesce(sum(${COMMITTED}) filter (where state = 'unreconciled'), 0) as unreconciled
         from wo_cost_ledger where budget_day = $1`,
      [today]
    )
  ).rows[0]
  return {
    days,
    since,
    today: {
      day: today,
      committedCents: int(t.committed),
      spentCents: int(t.spent),
      reservedCents: int(t.reserved),
      unreconciledCents: int(t.unreconciled)
    },
    totals: {
      calls: int(totals.calls),
      committedCents: int(totals.committed),
      settledCents: int(totals.settled),
      openCents: int(totals.open),
      unreconciledCents: int(totals.unreconciled),
      unreconciledCalls: int(totals.unreconciled_calls),
      releasedCalls: int(totals.released_calls)
    },
    byProvider: byProvider.map((r) => ({
      provider: r.key,
      calls: int(r.calls),
      committedCents: int(r.committed),
      unreconciledCalls: int(r.unreconciled_calls)
    })),
    byPurpose: byPurpose.map((r) => ({
      purpose: r.key ?? null,
      calls: int(r.calls),
      committedCents: int(r.committed),
      unreconciledCalls: int(r.unreconciled_calls)
    })),
    byDay: byDay.map((r) => ({ day: r.key, calls: int(r.calls), committedCents: int(r.committed) }))
  }
}

const encodeCursor = (row) => Buffer.from(`${row.created_at.toISOString()}|${row.id}`).toString('base64url')

/** The `{at, id}` a cursor names, or null when it is not one this module made. */
export function decodeSpendCursor(cursor) {
  const text = Buffer.from(String(cursor), 'base64url').toString('utf8')
  const [at, id] = text.split('|')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(Date.parse(at))) return null
  return { at: new Date(at), id }
}

/**
 * Ledger rows newest first, `limit` at a time; `cursor` (from `next`) continues after the last row shown.
 * @param {import('pg').Pool} pool
 * @param {{state?: string | null, provider?: string | null, purpose?: string | null,
 *   cursor?: {at: Date, id: string} | null, limit?: number}} filter
 */
export async function spendRows(
  pool,
  { state = null, provider = null, purpose = null, cursor = null, limit = 50 } = {}
) {
  const take = Math.max(1, Math.min(ROWS_MAX, limit))
  const { rows } = await pool.query(
    `select id, budget_day::text as budget_day, created_at, settled_at, provider, operation, purpose, payer, state, reserved_cents,
            actual_cents, cost_reported
       from wo_cost_ledger
      where ($1::text is null or state = $1) and ($2::text is null or provider = $2) and ($3::text is null or purpose = $3)
        and ($4::timestamptz is null or (created_at, id) < ($4, $5::uuid))
      order by created_at desc, id desc limit $6`,
    [state, provider, purpose, cursor?.at ?? null, cursor?.id ?? null, take + 1]
  )
  const page = rows.slice(0, take)
  return {
    rows: page.map((r) => ({
      id: r.id,
      day: r.budget_day,
      createdAt: r.created_at.toISOString(),
      settledAt: r.settled_at?.toISOString() ?? null,
      provider: r.provider,
      operation: r.operation,
      purpose: r.purpose ?? null,
      payer: r.payer ?? null,
      state: r.state,
      reservedCents: r.reserved_cents,
      actualCents: r.actual_cents ?? null,
      costReported: r.cost_reported
    })),
    next: rows.length > take ? encodeCursor(page[page.length - 1]) : null
  }
}
