/**
 * /ops › Beta › Usage, research block: the model calls of Website Opportunities research and its Build picture labels,
 * read from the research cost ledger (`wo_cost_ledger`, migration 167), kept apart from the chat panel's
 * `site_turn` tokens. One ledger row is one request (a picture-label batch is one request of several calls).
 * Same rules as the chat block (`ops/usage.js`): no median below 20 measured requests, no p90 below 100, a NULL
 * token snapshot is unmeasured and never zero, people holding a Tracy staff seat are counted apart. Codes only.
 */
import { usageAudience } from './ops-usage-query.js'

export const RESEARCH_PURPOSES = Object.freeze([
  'menu-photos',
  'logo',
  'picture-labels',
  'demo-look',
  'other'
])
/** `unrecorded`: a row from before the payer was stamped. */
export const RESEARCH_PAYERS = Object.freeze([
  'account',
  'public',
  'operator',
  'campaign',
  'none',
  'unrecorded'
])

// What a row cost: a settled call its cost, an open or unreconciled one its ceiling (as the ledger counts it).
const COST = `case l.state when 'settled' then coalesce(l.actual_cents, l.reserved_cents)
  else greatest(l.reserved_cents, coalesce(l.actual_cents, 0)) end`

/**
 * The model rows of the window: every row with a purpose, and the vision rows from before purposes existed.
 * A released call never went out and is not counted.
 * @param {import('pg').Pool} pool @param {{start: Date, observedEnd: Date}} query
 */
export async function readResearchUsage(pool, query) {
  try {
    return (
      await pool.query(
        `select l.created_at, l.purpose, l.payer, lower(a.email) as email, l.tokens, (${COST})::int as cents
         from wo_cost_ledger l left join account a on a.id = l.payer_account_id
         where (l.purpose is not null or l.provider = 'vision') and l.state <> 'released'
           and l.created_at >= $1 and l.created_at < $2`,
        [query.start, query.observedEnd]
      )
    ).rows
  } catch (error) {
    // A deployment without Website Opportunities tables (42P01) or before migration 167 (42703) has no research.
    if (error?.code === '42P01' || error?.code === '42703') return []
    throw error
  }
}

const nearestRank = (sorted, q) => sorted[Math.ceil(sorted.length * q) - 1]

/** @param {any[]} rows */
/** @param {{minForMedian: number, minForP90: number}} rules */
function figures(rows, { minForMedian, minForP90 }) {
  const measured = rows.filter((r) => r.tokens && Number.isSafeInteger(r.tokens.total))
  const sum = (key) => {
    const values = measured.map((r) => r.tokens[key]).filter((v) => Number.isSafeInteger(v))
    return values.length ? values.reduce((a, b) => a + b, 0) : null
  }
  const totals = measured.map((r) => r.tokens.total).sort((a, b) => a - b)
  return {
    requests: rows.length,
    measuredRequests: measured.length,
    partialRequests: measured.filter((r) => r.tokens.measured < r.tokens.calls).length,
    tokens: measured.length
      ? {
          total: sum('total'),
          prompt: sum('prompt'),
          completion: sum('completion'),
          reasoning: sum('reasoning')
        }
      : null,
    perRequest: {
      n: measured.length,
      median: measured.length >= minForMedian ? nearestRank(totals, 0.5) : null,
      p90: measured.length >= minForP90 ? nearestRank(totals, 0.9) : null
    },
    cents: rows.reduce((a, r) => a + (Number(r.cents) || 0), 0)
  }
}

const payerOf = (r) => r.payer ?? 'unrecorded'
const purposeOf = (r) => (RESEARCH_PURPOSES.includes(r.purpose) ? r.purpose : 'other')

/**
 * The research block. `audience` as the rest of Usage: customers = accounts without a staff seat plus the public
 * (`/find`) bucket; staff = staff accounts plus operator runs; all = every row, the campaign, `none` and unrecorded
 * ones included. Research makes no site, so the CMS and demo filters do not apply (`filters`).
 * @param {any[]} rows from {@link readResearchUsage}
 * @param {{audience: string, staff: Set<string>, minForMedian?: number, minForP90?: number}} options the minimums are
 *   `ops/usage.js`'s `MIN_FOR_RATE` and `MIN_FOR_P90`, passed in so the two blocks cannot drift apart
 */
export function summarizeResearchUsage(rows, { audience, staff, minForMedian = 20, minForP90 = 100 }) {
  const rules = { minForMedian, minForP90 }
  const filters = { audience }
  const person = (r) => usageAudience(r.email, filters, staff)
  const included = rows.filter((r) => {
    const payer = payerOf(r)
    if (audience === 'all') return true
    if (payer === 'account') return Boolean(r.email) && person(r)
    if (payer === 'public') return audience === 'customers'
    if (payer === 'operator') return audience === 'staff'
    return false
  })
  const group = (keys, keyOf) =>
    Object.fromEntries(
      keys
        .map((key) => [key, included.filter((r) => keyOf(r) === key)])
        .filter(([, list]) => list.length > 0)
        .map(([key, list]) => [key, figures(list, rules)])
    )
  const emails = [...new Set(included.filter((r) => payerOf(r) === 'account' && r.email).map((r) => r.email))]
  const accounts = emails
    .map((email) => ({
      email,
      ...figures(
        included.filter((r) => r.email === email && payerOf(r) === 'account'),
        rules
      )
    }))
    .sort(
      (a, b) =>
        (b.tokens?.total ?? -1) - (a.tokens?.total ?? -1) ||
        b.requests - a.requests ||
        a.email.localeCompare(b.email)
    )
  return {
    kind: 'research',
    filters: { audience, cms: 'not-applied', demo: 'not-applied' },
    all: figures(included, rules),
    byPurpose: group(RESEARCH_PURPOSES, purposeOf),
    byPayer: group(RESEARCH_PAYERS, payerOf),
    accounts
  }
}
