/**
 * A bounded pool for the measuring scripts (preview-check.mjs, preview-parity.mjs, release-measure.mjs): each
 * item runs on one of `size` slots (a slot owns its own browser or stand, so two items never share one), and
 * the results come back in the order of `items`, whatever order the items finished in, so a file written
 * from them is the same as a serial run's. A rejected item fails the pool: no further item is started, the
 * items already running are waited for (their slot's browser is not closed under them), then the first
 * error is thrown. An item that should count as a miss catches its own error and returns it. PURE.
 */

/**
 * @template T, R
 * @param {readonly T[]} items
 * @param {number} size how many items run at once (at least 1, at most items.length)
 * @param {(item: T, index: number, slot: number) => Promise<R>} run
 * @returns {Promise<R[]>}
 */
export async function inPool(items, size, run) {
  const n = Math.max(1, Math.min(Math.floor(size) || 1, items.length))
  /** @type {R[]} */
  const out = Array.from({ length: items.length })
  let next = 0
  /** @type {{ error: unknown } | null} */
  let failed = null
  const worker = async (/** @type {number} */ slot) => {
    while (!failed && next < items.length) {
      const i = next++
      try {
        out[i] = await run(items[i], i, slot)
      } catch (error) {
        failed ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: n }, (_, slot) => worker(slot)))
  if (failed) throw failed.error
  return out
}

/**
 * `--concurrency N` read from argv-style options: a positive integer, else `fallback`.
 * @param {string | null | undefined} raw
 * @param {number} fallback
 */
export function concurrencyOf(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) throw new Error(`--concurrency must be a positive integer, got ${raw}`)
  return n
}
