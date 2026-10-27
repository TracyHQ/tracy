// Copied from tracy-web `lib/same-secret.js` (ADR 0036): the standalone server carries its own.
import { timingSafeEqual } from 'node:crypto'

/** A header value equals the configured secret, compared in constant time. @param {string | null | undefined} a @param {string} b */
export function sameSecret(a, b) {
  if (typeof a !== 'string') return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
