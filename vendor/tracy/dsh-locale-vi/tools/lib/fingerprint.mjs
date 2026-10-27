/**
 * Fingerprint locale dictionaries.
 *
 * The workflow needs to know when upstream copy changed, but this repository
 * does not redistribute upstream's strings. A short salted digest per key
 * satisfies both: it changes whenever the English text changes, and it does not
 * carry the text itself.
 *
 * @module tools/lib/fingerprint
 */
import { createHash } from 'node:crypto'

/**
 * Digest one string. Truncated to 16 hex characters: long enough that an
 * accidental collision between two revisions of the same key is not a practical
 * concern, short enough to keep the baseline readable.
 * @param value - the English string.
 * @returns 16-character hex digest.
 */
export function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)
}

/**
 * Fingerprint every key of every namespace.
 * @param dicts - dictionaries by namespace.
 * @returns the same shape with digests instead of strings, keys sorted.
 */
export function fingerprint(dicts) {
  const out = {}
  for (const ns of Object.keys(dicts).sort()) {
    out[ns] = Object.fromEntries(Object.keys(dicts[ns]).sort().map((key) => [key, digest(dicts[ns][key])]))
  }
  return out
}
