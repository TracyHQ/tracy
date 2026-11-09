/**
 * Source rows as a seller reads them (#524).
 *
 * - ONE ROW PER PAGE: a link the seller pasted that names the same page as the shared research (an Instagram page with
 *   share tracking, a trailing slash) is not a second source; the row with data stands for both.
 * - A server's own key problem (`credential_invalid`, `credential_missing`) is the operator's to fix and shows on
 *   /ops/wo; the seller's row says the source was not collected, never an infrastructure error.
 */
import { untrackedUrl } from '../domain/social-links.mjs'

/** Reasons that name this server's setup, not the place: shown to operators only. */
export const SERVER_KEY_REASONS = Object.freeze(['credential_invalid', 'credential_missing'])
const RANK = { complete: 0, partial: 1, skipped: 2, blocked: 3, failed: 4 }

/** The page a row reads, as one comparable string: no scheme, no `www.`, no tracking, no trailing slash, lower case. */
export function samePageKey(source, ref) {
  if (typeof ref !== 'string' || !ref) return null
  try {
    const u = new URL(untrackedUrl(ref, source))
    return `${source}\n${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '').toLowerCase()}`
  } catch {
    return `${source}\n${ref.trim().toLowerCase()}`
  }
}

/**
 * The rows with the same page kept once: the shared row when it holds data or the own one holds none, else the own one.
 * Order is kept (the first of a page holds its place).
 */
export function mergeSamePageRows(rows) {
  const best = new Map()
  for (const row of rows) {
    const key = samePageKey(row.source, row.ref)
    if (!key) continue
    const held = best.get(key)
    if (!held || (RANK[row.status] ?? 9) < (RANK[held.status] ?? 9)) best.set(key, row)
  }
  const placed = new Set()
  const out = []
  for (const row of rows) {
    const key = samePageKey(row.source, row.ref)
    if (!key) {
      out.push(row)
      continue
    }
    if (placed.has(key)) continue
    placed.add(key)
    out.push(best.get(key))
  }
  return out
}

/** A row's status and reason as the seller sees them: a server key problem reads as not collected. */
export function sellerStatusOf(row) {
  if (SERVER_KEY_REASONS.includes(row?.reason)) return { status: 'skipped', reason: 'not_collected' }
  return { status: row?.status ?? null, reason: row?.reason ?? null }
}
