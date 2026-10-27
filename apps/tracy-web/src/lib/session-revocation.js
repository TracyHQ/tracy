/**
 * Sign-ins ended on the server (J1.3, 11/10/2026).
 *
 * A session token (`./session.js`) is signed and self-contained, so clearing the cookie at
 * sign-out used to end nothing: a copy of the token kept working for its full lifetime, and
 * `/auth/me` kept re-minting it. Every token now carries a `jti` — one per sign-in, kept when the
 * token is renewed — and sign-out writes that `jti` here. `./session.js` refuses a token whose `jti`
 * is in this book, at every door that reads the cookie.
 *
 * WHY A ROW LIVES ONE TTL AFTER SIGN-OUT. A refused token cannot be renewed, so every token of a
 * revoked sign-in — including a copy someone renewed just before the sign-out — has expired
 * `SESSION_TTL_S` after the sign-out at the latest. After that the row protects nothing.
 *
 * Tokens minted before 11/10/2026 have no `jti`: they cannot be revoked and expire on their own
 * clock, so the deploy signed nobody out.
 */

/** How long "not revoked" is trusted without asking the database again. A sign-out on this
 * process is seen at once (it writes the cache); another replica sees it within this window. */
export const NOT_REVOKED_CACHE_MS = 15_000
const MAX_CACHED = 10_000

/** @typedef {{ revoke(jti: string, until: Date): Promise<void>, isRevoked(jti: string): Promise<boolean> }} RevocationBook */

/** @returns {RevocationBook} - a book in this process only, for the memory-store mode. */
export function memorySessionRevocations({ now = () => Date.now() } = {}) {
  const rows = new Map()
  return {
    async revoke(jti, until) {
      rows.set(jti, until.getTime())
    },
    async isRevoked(jti) {
      const until = rows.get(jti)
      if (until === undefined) return false
      if (until > now()) return true
      rows.delete(jti)
      return false
    }
  }
}

/** @returns {RevocationBook} - table `session_revocation` (migration 093). */
export function pgSessionRevocations(pool) {
  return {
    async revoke(jti, until) {
      await pool.query(
        `insert into session_revocation (jti, expires_at) values ($1, $2)
           on conflict (jti) do update set expires_at = greatest(session_revocation.expires_at, excluded.expires_at)`,
        [jti, until]
      )
      // Housekeeping rides on the rare write, never on the per-request read.
      await pool.query('delete from session_revocation where expires_at < now()')
    },
    async isRevoked(jti) {
      const { rowCount } = await pool.query(
        'select 1 from session_revocation where jti = $1 and expires_at > now()',
        [jti]
      )
      return rowCount > 0
    }
  }
}

/**
 * `book` behind a small in-process cache, so the per-request check is a map lookup almost always.
 * A revoked answer is kept for good (a revoked jti never comes back); a "not revoked" answer for
 * `NOT_REVOKED_CACHE_MS`.
 * @param {RevocationBook} book
 * @returns {RevocationBook}
 */
export function cachedSessionRevocations(book, { now = () => Date.now() } = {}) {
  /** @type {Map<string, number>} jti → until when the answer holds (Infinity for revoked) */
  const cache = new Map()
  const remember = (jti, until) => {
    if (cache.size >= MAX_CACHED) {
      const t = now()
      for (const [key, value] of cache) if (value <= t) cache.delete(key)
      if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value)
    }
    cache.set(jti, until)
  }
  const revoked = new Set()
  return {
    async revoke(jti, until) {
      await book.revoke(jti, until)
      revoked.add(jti)
      cache.delete(jti)
      if (revoked.size > MAX_CACHED) revoked.delete(revoked.values().next().value)
    },
    async isRevoked(jti) {
      if (revoked.has(jti)) return true
      const holds = cache.get(jti)
      if (holds !== undefined && holds > now()) return false
      if (await book.isRevoked(jti)) {
        revoked.add(jti)
        if (revoked.size > MAX_CACHED) revoked.delete(revoked.values().next().value)
        return true
      }
      remember(jti, now() + NOT_REVOKED_CACHE_MS)
      return false
    }
  }
}
