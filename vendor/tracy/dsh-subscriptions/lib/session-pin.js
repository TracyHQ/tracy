const sessionPins = new Map()
const DEFAULT_TTL_MS = 30 * 60 * 1000 // 30 mins

/**
 * Prune expired session pin entries.
 * @param {number} [now]
 * @returns {void}
 */
export function pruneSessionPins(now = Date.now()) {
  for (const [id, entry] of sessionPins.entries()) {
    if (now > entry.expiresAt) {
      sessionPins.delete(id)
    }
  }
}

/**
 * Bind a session id to an account ref for ttlMs (default 30 minutes).
 * @param {string|undefined} sessionId
 * @param {string|undefined} accountRef
 * @param {number} [ttlMs]
 * @returns {void}
 */
export function pinSession(sessionId, accountRef, ttlMs = DEFAULT_TTL_MS) {
  if (!sessionId || !accountRef) return
  if (sessionPins.size >= 50) {
    pruneSessionPins()
  }
  sessionPins.set(sessionId, {
    accountRef,
    expiresAt: Date.now() + ttlMs
  })
}

/**
 * @param {string|undefined} sessionId
 * @returns {string|null} the bound account ref, or null when absent/expired
 */
export function getPinnedAccountRef(sessionId) {
  if (!sessionId) return null
  const entry = sessionPins.get(sessionId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    sessionPins.delete(sessionId)
    return null
  }
  return entry.accountRef
}
