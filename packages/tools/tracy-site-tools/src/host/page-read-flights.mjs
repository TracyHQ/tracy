/**
 * Share only an equivalent page inventory already on the wire. The caller supplies the complete
 * route/identity/turn/generation key; settled answers are never cached. Each consumer receives a
 * private copy because host-side filtering and revision bookkeeping may change the answer.
 */
export function createPageReadFlights() {
  /** @type {Map<string, Promise<unknown>>} */
  const pending = new Map()
  /** @param {string | null} key @param {() => Promise<unknown>} read */
  return async (key, read) => {
    if (key === null) return read()
    let flight = pending.get(key)
    if (!flight) {
      // Bound retained work on a busy host; excess distinct requests keep their ordinary path.
      if (pending.size >= 128) return read()
      flight = Promise.resolve().then(read)
      pending.set(key, flight)
    }
    try {
      return structuredClone(await flight)
    } finally {
      if (pending.get(key) === flight) pending.delete(key)
    }
  }
}
