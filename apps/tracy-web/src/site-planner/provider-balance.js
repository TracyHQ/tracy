// The account balance of the site planner door's provider (ADR 0041, #301), read around a bench run so the money a
// run really took can be set beside the cost the bench computed. Only DeepSeek's own API is read today: GET
// {baseUrl}/user/balance answers {is_available, balance_infos: [{currency, total_balance, ...}]}. A failed read is
// recorded as an error and never stops a run. Nothing here keeps or returns the key.

/** The providers whose balance the bench reads. */
export const BALANCE_PROVIDERS = Object.freeze(['deepseek'])

const BALANCE_TIMEOUT_MS = 15_000

/** Whether the bench reads this door's balance. */
export const readsBalance = (door) => BALANCE_PROVIDERS.includes(door?.providerId)

/**
 * One balance read: { at, available, infos: [{ currency, total }] }, or { at, error } when it failed.
 * @param {{ baseUrl: string, apiKey: string }} door
 * @param {{ fetchImpl?: typeof fetch, now?: () => Date }} [options]
 */
export async function readBalance(door, { fetchImpl = fetch, now = () => new Date() } = {}) {
  const at = now().toISOString()
  try {
    const r = await fetchImpl(`${door.baseUrl.replace(/\/+$/, '')}/user/balance`, {
      method: 'GET',
      headers: { authorization: `Bearer ${door.apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS)
    })
    if (!r.ok) return { at, error: `HTTP ${r.status}` }
    const body = await r.json()
    const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : null
    if (!infos) return { at, error: 'the answer has no balance_infos' }
    return {
      at,
      available: body.is_available === true,
      infos: infos
        .filter((i) => typeof i?.currency === 'string' && Number.isFinite(Number(i.total_balance)))
        .map((i) => ({ currency: i.currency, total: Number(i.total_balance) }))
    }
  } catch (error) {
    // The message of a network error names no credential; it is bounded all the same.
    return {
      at,
      error: String(error?.name === 'TimeoutError' ? 'timeout' : (error?.message ?? error)).slice(0, 200)
    }
  }
}

/**
 * The balance before and after a run as one line: "before 12.50 USD, after 12.31 USD, difference -0.19 USD", per
 * currency read both times; or what is missing. Null when the run recorded no balance.
 */
export function balanceLine(balance) {
  if (!balance) return null
  const missing = (b) => (!b ? 'not read' : b.error ? `not read (${b.error})` : null)
  const { before, after } = balance
  const shown = (b) => missing(b) ?? b.infos.map((i) => `${i.total.toFixed(2)} ${i.currency}`).join(', ')
  if (missing(before) || missing(after)) return `before ${shown(before)}, after ${shown(after)}`
  const lines = before.infos
    .map((b) => {
      const a = after.infos.find((i) => i.currency === b.currency)
      if (!a) return null
      const diff = Math.round((a.total - b.total) * 100) / 100
      return `before ${b.total.toFixed(2)} ${b.currency}, after ${a.total.toFixed(2)} ${a.currency}, difference ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} ${b.currency}`
    })
    .filter(Boolean)
  return lines.length ? lines.join('; ') : 'no currency read both before and after'
}
