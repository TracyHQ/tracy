// How the finisher runs pages side by side and keeps their writes apart (spec #418, #424): at most a few pages at once, and
// one write at a time per place on the site. Repairs of different pages write different rows, but some share one: every
// style repair writes the kit's one head module (style-write.js reads it, sets one line and writes it whole), and every
// content.contract apply is checked against the site's one revision. A write and its undo hold the lock of their place, so
// two read-modify-writes of the same place never cross.

/**
 * Runs `work` on every item, at most `limit` at once, and answers the results in the items' order.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} work
 * @returns {Promise<R[]>}
 */
export async function eachLimited(items, limit, work) {
  const results = Array.from({ length: items.length })
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index], index)
    }
  }
  const lanes = Math.max(1, Math.min(Number(limit) || 1, items.length))
  await Promise.all(Array.from({ length: lanes }, lane))
  return results
}

/** One lock per place: `hold(key, work)` runs `work` after every earlier holder of the same key is done. */
export function placeLocks() {
  const tails = new Map()
  return {
    async hold(key, work) {
      const before = tails.get(key) ?? Promise.resolve()
      let release
      const mine = new Promise((resolve) => {
        release = resolve
      })
      const tail = before.then(() => mine)
      tails.set(key, tail)
      await before
      try {
        return await work()
      } finally {
        release()
        if (tails.get(key) === tail) tails.delete(key)
      }
    }
  }
}
