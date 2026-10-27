import { normalizeEmail, validDay, validEmail, parseAccess } from './beta-access.js'
import { sha256Hex } from './hmac.js'

/** Accept a structured export; no heuristic parsing of product names from a marketing CSV. */
export async function fallbackHashes(records, sourceDay) {
  if (!validDay(sourceDay) || !Array.isArray(records) || records.length === 0)
    throw new Error('A dated, non-empty export is required')
  const hashes = new Set()
  for (const record of records) {
    const email = normalizeEmail(record.email)
    if (!validEmail(email)) throw new Error('Export contains an invalid email')
    const result = parseAccess({ ok: true, subscriptions: record.subscriptions }, sourceDay)
    if (result.status === 'error') throw new Error('Export contains invalid subscription data')
    if (result.status === 'allow') hashes.add(await sha256Hex(email))
  }
  if (!hashes.size) throw new Error('Export contains no eligible members; existing fallback was kept')
  return [...hashes]
}
