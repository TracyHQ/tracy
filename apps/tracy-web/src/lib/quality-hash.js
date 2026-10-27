/** Stable hashing shared by frozen evidence and quickstart content. */
import { createHash } from 'node:crypto'

export function qualityHash(value) {
  const stable = (v) =>
    v instanceof Date
      ? v.toISOString()
      : Array.isArray(v)
        ? v.map(stable)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, stable(v[k])])
            )
          : v
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')
}
