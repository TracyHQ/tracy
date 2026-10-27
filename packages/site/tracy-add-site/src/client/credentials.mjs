/**
 * The store of site viewing keys: which cookie to send to which host, and for how long.
 *
 * WHY IT IS IN THE HOST HALF. The sidebar's embed route (`/sidebar/frame`) runs server-side, so it is
 * the only thing that can send a cookie to the customer's site — in the browser the frame is third-party and the cookie
 * is blocked, and on a developer's machine the origin differs from the site entirely. But that route does not
 * know who is viewing, so the plugin's host half keeps this table and answers when asked.
 *
 * 🔒 TIME-LIMITED, AND SHORT. A viewing session cannot be revoked once issued; the only thing limiting
 * the damage of a stolen copy is that it expires. The seat book is still the real gate — `fleet-bar` re-asks the role
 * on every load, so a withdrawn seat loses access on the next request even if the cookie is still valid. The limit here
 * only stops an old key lingering in the process's memory.
 *
 * 🔒 IN MEMORY, NOT ON DISK. When dsh restarts every key is lost, and that is right: a
 * viewing session belongs to the viewing, not to the machine.
 *
 * Plain JavaScript, for the same reason as `site-label.mjs`: pure logic, run directly by `node --test`.
 */

/** The token shape `mintSession` produces. Storing anything else promises a key that opens nothing. */
const TOKEN_SHAPE = /^v1\./

/** Default 30 minutes — enough for one viewing, much shorter than the token's own lifetime. */
const DEFAULT_TTL_MS = 30 * 60 * 1000

export class CredentialStore {
  /**
   * @param {() => number} now The clock. Injected so tests do not have to really wait.
   */
  constructor(now = () => Date.now()) {
    /** @type {Map<string, {cookie: string, expiresAt: number}>} */
    this.entries = new Map()
    this.now = now
  }

  /** How many keys are held. Present so tests can assert that expired keys do NOT linger. */
  get size() {
    return this.entries.size
  }

  /**
   * Take a key for a host.
   *
   * A token of the wrong shape is IGNORED silently: the caller just asked for it from `cowork-web`, which already checked
   * the shape once: a strange value arriving here means something in between answered instead, and storing it
   * would let the promise break on the customer's page load.
   * @param {string} host The site's host, e.g. `a.tracy.ai`.
   * @param {string} token The viewing-session token.
   * @param {number} ttlMs Lifetime.
   * @returns {void}
   */
  put(host, token, ttlMs = DEFAULT_TTL_MS) {
    if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return
    if (typeof host !== 'string' || host === '') return
    this.entries.set(host.toLowerCase(), {
      cookie: `tracy_sess=${token}`,
      expiresAt: this.now() + ttlMs
    })
  }

  /**
   * The key for a host, or `null`.
   *
   * An expired key is DELETED right here, not just ignored — a table that only grows is a memory
   * leak, and a dead token lingering in memory is a token still readable.
   * @param {string} host The site's host.
   * @returns {{cookie: string}|null} The key, or null.
   */
  forHost(host) {
    if (typeof host !== 'string') return null
    const key = host.toLowerCase()
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return null
    }
    return { cookie: entry.cookie }
  }

  /**
   * Forget a host's key.
   * @param {string} host The site's host.
   * @returns {void}
   */
  forget(host) {
    if (typeof host === 'string') this.entries.delete(host.toLowerCase())
  }
}
