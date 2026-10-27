/**
 * The deployment's own facts — origin, site domain, cookie domain, badge URL, GitHub org — read
 * once per page from `GET /api/config` (`apps/tracy-web/src/public/config-door.js`, Task 11).
 *
 * WHY THIS EXISTS. A plugin's built `lib/client.js` is committed and shipped inside a customer's
 * own container — a literal baked in at build time is the SAME literal on `contabo`, on `local`,
 * and inside a Storybook fixture, because none of those know which one built the bundle. Reading
 * this door instead means the ANSWER changes with the deployment, not the code.
 *
 * ROOT-ABSOLUTE, NOT `dshUrl()`. Same reasoning as `@tracy/core/seat`'s `/auth/me`: the door
 * lives at the host's bare root, never under a plugin's own `<base href>` mount — the same rule
 * `/api/sites`, `/auth/me`, `/api/team` and `/login` already follow. (No `dsh-url.ts` copy has
 * been updated to list this door yet; don't cite one as having done so.)
 *
 * MEMOIZED LIKE `readViewer()`. A page mounts several tabs, and they all want the same answer —
 * `asked` below is the one promise every caller on this page shares.
 *
 * NEVER THROWS. A door outage or an offline fixture (Storybook, a unit test) falls back to
 * {@link FALLBACK} instead of rejecting — see that constant's own comment for what each field
 * falls back to and why: most are production's real value, but `cookieDomain` deliberately is
 * NOT, because a wrong guess there is exactly the bug this task exists to remove.
 */

/**
 * @typedef {object} Config
 * @property {string} origin
 * @property {string} siteDomain
 * @property {string[]} siteDomainAliases
 * @property {string} cookieDomain
 * @property {string} sitePort
 * @property {string} badgeUrl
 * @property {string} hostOrg
 */

const CONFIG_DOOR = '/api/config'

/**
 * The answer when the door cannot be read.
 *
 * `siteDomain`, `badgeUrl` and `hostOrg` fall back to production's REAL value — the same
 * "empty means off, production is the default" contract `apps/tracy-web/src/config.js` itself
 * uses for those two. `cookieDomain` does NOT: production's real value is `.tracy.ai`, but this
 * field only ever feeds a `document.cookie` write (`@tracy/i18n`'s `writeLanguageCookie`), and a
 * browser silently REFUSES a cookie whose `Domain=` doesn't match the page's own host. Falling
 * back to `.tracy.ai` on a `localhost` dev box wouldn't read as "production's value" — it would
 * read as "no cookie gets written at all", the exact silent-on-dev failure this whole task exists
 * to remove. Empty (host-only) is the one fallback that is SAFE everywhere, not the one that is
 * true everywhere — `origin` is a per-page read of `location.origin`, never a guess either.
 */
const FALLBACK = Object.freeze({
  origin: typeof location === 'undefined' ? '' : location.origin,
  siteDomain: 'tracy.ai',
  siteDomainAliases: [],
  // '' is PRODUCTION's real answer here, not a blank guess: production serves sites over
  // https on the default port, so there is no port to type. Its neighbours below are
  // production values for the same reason — this one just happens to be empty.
  sitePort: '',
  cookieDomain: '',
  badgeUrl: 'https://tracy.ai/dashboard/badge.js',
  hostOrg: 'TracyHQ'
})

/** @type {Promise<Config> | null} */
let asked = null

/**
 * The deployment's config, read once and remembered for the life of the page.
 * @param {{ fetch?: typeof globalThis.fetch }} [options] Injection seam for tests.
 * @returns {Promise<Config>} Never rejects.
 */
export function tracyConfig(options = {}) {
  const call = options.fetch
  if (call !== undefined) return askDoor(call)
  asked ??= askDoor(globalThis.fetch.bind(globalThis))
  return asked
}

/**
 * One read of the door, never throwing: anything that is not a readable answer falls back to
 * {@link FALLBACK}.
 * @param {typeof globalThis.fetch} call The fetch to use.
 * @returns {Promise<Config>}
 */
async function askDoor(call) {
  try {
    const res = await call(CONFIG_DOOR, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    })
    if (!res.ok) return FALLBACK
    const body = await res.json()
    if (body === null || typeof body !== 'object') return FALLBACK
    return { ...FALLBACK, ...body }
  } catch {
    return FALLBACK
  }
}
