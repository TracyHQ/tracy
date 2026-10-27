/**
 * The numbers behind the operator's Provider order (Settings): per capability group and
 * provider, how often it was asked, how often it gave a usable result and what that cost, plus a
 * "misordered" mark the operator acts on BY HAND. Nothing here changes the stored order.
 *
 * Sources, both read-only:
 *   - calls and usable results: the attempts research keeps on each snapshot source
 *     (`wo_place_snapshot_source.coverage.attempts`, `domain/capabilities.mjs runInOrder`). A call is an
 *     attempt that went out (a `credential_missing` skip never did); a usable result is `complete`.
 *   - cost: `wo_cost_ledger`, a sent call's cost (released rows never went out). It is `real` only when
 *     every counted row carries a cost the provider reported (`cost_reported`, migration 163).
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WO_DOMAIN_DIR } from './domain-loader.js'

const { APIFY_ACTORS } = await import(pathToFileURL(path.join(WO_DOMAIN_DIR, 'apify.mjs')).href)
const { BROWSER_ACTOR } = await import(pathToFileURL(path.join(WO_DOMAIN_DIR, 'website-browser.mjs')).href)

/** The product's thresholds, in one place: calls before any number shows, and the gap that marks an order. */
export const PROVIDER_REPORT = Object.freeze({ minCalls: 30, misorderRatio: 1.5, windowDays: 30 })

/** Attempt statuses that count as a usable result: the provider alone answered enough. */
const USABLE = new Set(['complete'])

const SOCIAL_GROUPS = ['facebook', 'instagram', 'tiktok']
const APIFY_GROUP = new Map(Object.entries(APIFY_ACTORS).map(([group, actor]) => [actor, group]))

/**
 * The capability group and provider a ledger row paid for, or null when the row is not one group's
 * call (social stats runs, a search two groups share, Google facts, vision).
 * @param {string} provider @param {string} operation
 */
export function capabilityOfCharge(provider, operation) {
  const at = (group, id = provider) => ({ group, provider: id })
  if (provider === 'scrapecreators') {
    const network = operation.replace(/-profile$/, '')
    return operation.endsWith('-profile') && SOCIAL_GROUPS.includes(network) ? at(network) : null
  }
  if (provider === 'apify') {
    if (operation === BROWSER_ACTOR) return at('website-content', 'apify-browser')
    return APIFY_GROUP.has(operation) ? at(APIFY_GROUP.get(operation)) : null
  }
  if (provider === 'apify-browser') return at('website-content')
  if ((provider === 'jina' || provider === 'firecrawl') && operation === 'read') return at('website-content')
  if ((provider === 'jina' || provider === 'firecrawl') && operation === 'search') return at('web-search')
  if (provider === 'serpapi' && operation.startsWith('tripadvisor-')) return at('tripadvisor')
  if (provider === 'rapidapi' && operation.startsWith('tripadvisor-'))
    return at('tripadvisor', 'rapidapi-tripadvisor')
  if (provider === 'litescrape') return at('tripadvisor')
  if (provider === 'serpapi' && operation === 'google-search')
    return at('menu-links', 'serpapi-google-search')
  if (provider === 'serpapi' && operation === 'web-search') return at('web-search', 'serpapi-google-search')
  if (provider === 'serpapi' && operation === 'google-maps-menu')
    return at('menu-photos', 'serpapi-google-maps')
  return null
}

/**
 * Each group's provider tallies over the last `windowDays`:
 * `{[group]: {[provider]: {calls, usable, charges, chargedCents, reported}}}`.
 * @param {import('pg').Pool | null} pool
 */
export async function readProviderUsage(
  pool,
  { now = Date.now, windowDays = PROVIDER_REPORT.windowDays } = {}
) {
  const usage = {}
  if (!pool) return usage
  const since = new Date(now() - windowDays * 86_400_000)
  const slot = (group, provider) => {
    usage[group] ??= {}
    return (usage[group][provider] ??= { calls: 0, usable: 0, charges: 0, chargedCents: 0, reported: true })
  }
  try {
    const { rows } = await pool.query(
      `select s.source as grp, a->>'provider' as provider,
              count(*)::int as calls, count(*) filter (where a->>'status' = any($2))::int as usable
         from wo_place_snapshot_source s
         cross join lateral jsonb_array_elements(case when jsonb_typeof(s.coverage->'attempts') = 'array'
           then s.coverage->'attempts' else '[]'::jsonb end) a
        where coalesce(s.collected_at, s.attempted_at) > $1
          and not (a->>'status' = 'skipped' and a->>'reason' = 'credential_missing')
        group by 1, 2`,
      [since, [...USABLE]]
    )
    for (const r of rows) Object.assign(slot(r.grp, r.provider), { calls: r.calls, usable: r.usable })
  } catch {}
  try {
    const { rows } = await pool.query(
      `select provider, operation, count(*)::int as charges,
              coalesce(sum(case when state = 'settled' then coalesce(actual_cents, reserved_cents)
                else greatest(reserved_cents, coalesce(actual_cents, 0)) end), 0)::int as cents,
              bool_and(state = 'settled' and cost_reported) as reported
         from wo_cost_ledger
        where created_at > $1 and state in ('settled', 'unreconciled')
        group by 1, 2`,
      [since]
    )
    for (const r of rows) {
      const owner = capabilityOfCharge(r.provider, r.operation)
      if (!owner) continue
      const s = slot(owner.group, owner.provider)
      s.charges += r.charges
      s.chargedCents += r.cents
      s.reported &&= r.reported
    }
  } catch {}
  for (const providers of Object.values(usage))
    for (const s of Object.values(providers)) if (!s.charges) s.reported = false
  return usage
}

/** One provider's numbers, or `{enough: false, calls}` below `minCalls`. */
function numbersOf(t, minCalls) {
  const calls = t?.calls ?? 0
  if (calls < minCalls) return { enough: false, calls }
  const usableRate = t.usable / calls
  const perCallCents = t.charges ? t.chargedCents / t.charges : null
  return {
    enough: true,
    calls,
    usable: t.usable,
    usableRate,
    cost: {
      kind: !t.charges ? 'none' : t.reported ? 'real' : 'ceiling',
      perCallCents,
      perUsableCents: perCallCents !== null && t.usable ? perCallCents / usableRate : null
    }
  }
}

/**
 * Why X, placed ahead of Y, looks misordered, or null: X costs more than `ratio`× Y per usable result
 * (both costs real), else X's usable rate is below Y's ÷ `ratio`. `times` is null when X never gave one.
 */
function misorder(x, y, ratio) {
  const costs = [x, y].every((p) => p.cost.kind === 'real' && p.cost.perUsableCents !== null)
  if (costs) {
    const [xc, yc] = [x.cost.perUsableCents, y.cost.perUsableCents]
    // A later provider that reported no cost at all beats any paid one; `times` null says so.
    if (yc === 0) return xc > 0 ? { basis: 'cost', times: null } : null
    return xc / yc > ratio ? { basis: 'cost', times: round(xc / yc) } : null
  }
  if (x.usableRate < y.usableRate / ratio)
    return { basis: 'rate', times: x.usableRate ? round(y.usableRate / x.usableRate) : null }
  return null
}

const round = (n) => Math.round(n * 100) / 100

/**
 * Every provider's report for one group: numbers from `usage`, and on a provider in `order` the strongest
 * reason it should sit after one placed later. Pure; `order` is read, never changed.
 * @param {string[]} order @param {Record<string, any>} usage
 */
export function providerReport(
  order,
  usage,
  { minCalls = PROVIDER_REPORT.minCalls, misorderRatio = PROVIDER_REPORT.misorderRatio } = {}
) {
  const ids = [...new Set([...order, ...Object.keys(usage ?? {})])]
  const report = Object.fromEntries(ids.map((id) => [id, numbersOf(usage?.[id], minCalls)]))
  order.forEach((id, i) => {
    const x = report[id]
    if (!x.enough) return
    let worst = null
    for (const later of order.slice(i + 1)) {
      const y = report[later]
      if (!y.enough) continue
      const why = misorder(x, y, misorderRatio)
      if (why && (!worst || stronger(why, worst))) worst = { ...why, than: later }
    }
    if (worst) x.misordered = worst
  })
  return report
}

// A cost reason outranks a rate one; within a basis the larger gap wins, and "never"/"free" (null) is largest.
const strength = (why) => [why.basis === 'cost' ? 1 : 0, why.times ?? Number.POSITIVE_INFINITY]
const stronger = (a, b) => {
  const [sa, sb] = [strength(a), strength(b)]
  return sa[0] !== sb[0] ? sa[0] > sb[0] : sa[1] > sb[1]
}
