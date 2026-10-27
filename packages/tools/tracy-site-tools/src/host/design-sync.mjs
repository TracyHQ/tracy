/**
 * The lane's half of the design record (ADR 0023, "Addendum 29/09"). tracy-web owns what a site
 * wears; this lane sends the build's record there (PUT, signed as the person who pressed — tracy-web
 * refuses anything else) and reads it back to refresh the site folder's copy (GET, as whoever this
 * conversation acts as). Pure request builders, so the rules are tested without a server.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

const SITE_KEY = /^[a-z0-9][a-z0-9.-]{0,120}$/
/** A copy refreshed at the start of a turn must not hold the turn up. */
export const DESIGN_SYNC_TIMEOUT_MS = 2500

/**
 * @typedef {{ as: 'prompter', assertion: string, origin: string } | { as: 'viewer', cookie: string, origin: string }} Plan
 */

const base = (/** @type {Plan} */ plan, /** @type {string} */ siteKey) =>
  `${plan.origin.replace(/\/+$/, '')}/api/sites/${encodeURIComponent(siteKey)}/design`

/**
 * @param {Plan | null} plan
 * @param {string} siteKey
 * @param {Record<string, unknown>} record
 */
export function designPutRequest(plan, siteKey, record) {
  if (!plan || plan.as !== 'prompter' || !SITE_KEY.test(siteKey)) return null
  return {
    url: base(plan, siteKey),
    init: {
      method: 'PUT',
      headers: {
        'x-tracy-actor': plan.assertion,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(record)
    }
  }
}

/**
 * The plan a design PUT is signed with — tracy-web takes the record only from the build's signed
 * actor, never a cookie.
 *
 * The person who typed signs as themselves. A build started from the Build FORM has nobody who
 * typed (measured 29/09 on dev: every such build was answered 409 `NO_ACTOR`, and tracy-web held no
 * record), but the person who pressed is there: the browser that sent THIS session's hello — the
 * page the form was pressed on. tracy-web names them from that cookie (`/auth/me`, which checks the
 * signature), and the gate signs for that address; tracy-web then checks, as for anyone, that the
 * address holds a seat on the site. Nothing is widened: never another session's viewer (`bound`
 * false — on a host dsh that is whoever opened any site last), never a cookie tracy-web does not
 * name, never without the gate's signer. Any of those signs nothing, and the PUT is refused as before.
 * `warn` names the one cause that is not "nobody to sign": `/auth/me` failing or unreachable, so a
 * tracy-web outage does not read as a missing signer in the log.
 *
 * 🔒 ONLY THE CONFIGURED TRACY ORIGIN IS ASKED, AND ONLY IT IS SENT TO (`origin`: the plugin config,
 * else `MCP_TRACY_ORIGIN`). A viewer's origin is its hello's `x-forwarded-host`/`host`: on a path
 * that reaches dsh without the fleet proxy (a direct port, a stand) it is whatever the caller typed.
 * Asking that host who a cookie is would let it name any address, and the assertion minted for that
 * address — accepted by every actor door, the Apply door included, for 300 s — would be PUT back to
 * it. The same holds for the person who typed, and `relayPlan` keeps the same pin. No configured
 * origin → nobody signs, and the build logs NO_ACTOR.
 * @param {Plan | null} plan
 * @param {{ origin: string | null | undefined, bound: boolean, mint?: ((email: string) => string | null) | undefined, http?: typeof fetch, warn?: (line: string) => void }} how
 * @returns {Promise<Extract<Plan, { as: 'prompter' }> | null>}
 */
export async function designSigner(plan, { origin, bound, mint, http = fetch, warn }) {
  const tracy = typeof origin === 'string' && origin.trim() !== '' ? origin.trim() : null
  if (plan === null || tracy === null) return null
  if (plan.as === 'prompter') return { ...plan, origin: tracy }
  if (!bound || typeof mint !== 'function') return null
  try {
    const res = await http(`${tracy.replace(/\/+$/, '')}/auth/me`, {
      headers: { cookie: plan.cookie, accept: 'application/json' },
      signal: AbortSignal.timeout(DESIGN_SYNC_TIMEOUT_MS)
    })
    if (!res.ok) {
      warn?.(`[site-design] /auth/me answered ${String(res.status)}; nobody signed`)
      return null
    }
    const email = /** @type {{ email?: unknown }} */ (await res.json())?.email
    if (typeof email !== 'string' || email === '') return null
    const assertion = mint(email)
    return typeof assertion === 'string' && assertion !== ''
      ? { as: 'prompter', assertion, origin: tracy }
      : null
  } catch (error) {
    warn?.(`[site-design] /auth/me unreachable: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * 🔒 Sent to the CONFIGURED Tracy origin only, like `designSigner`'s PUT: the request carries the
 * viewer's cookie or an actor assertion, and the plan's own origin is the hello's host header —
 * on a path that does not pass the fleet proxy, whoever sets that header would receive them.
 * No configured origin → no request.
 * @param {Plan | null} plan
 * @param {string} siteKey
 * @param {string | null | undefined} origin the configured Tracy origin
 */
export function designGetRequest(plan, siteKey, origin) {
  const tracy = typeof origin === 'string' && origin.trim() !== '' ? origin.trim() : null
  if (!plan || tracy === null || !SITE_KEY.test(siteKey)) return null
  return {
    url: base({ ...plan, origin: tracy }, siteKey),
    init: {
      method: 'GET',
      headers:
        plan.as === 'prompter'
          ? { 'x-tracy-actor': plan.assertion, accept: 'application/json' }
          : { cookie: plan.cookie, accept: 'application/json' }
    }
  }
}

/**
 * The site key the fleet wrote into the folder (`.tracy/site.json`), or null.
 * @param {string} folder
 */
export async function siteKeyInFolder(folder) {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(folder, '.tracy', 'site.json'), 'utf8'))
    return typeof parsed?.siteKey === 'string' && SITE_KEY.test(parsed.siteKey) ? parsed.siteKey : null
  } catch {
    return null
  }
}

/**
 * tracy-web's `{design: … | null}` for a site, or null when it did not answer (or refused).
 * @param {{ url: string, init: Record<string, any> } | null} request
 * @param {typeof fetch} [http]
 */
export async function fetchDesign(request, http = fetch) {
  if (request === null) return null
  try {
    const res = await http(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(DESIGN_SYNC_TIMEOUT_MS)
    })
    if (!res.ok) return null
    const body = await res.json()
    return body && typeof body === 'object' && 'design' in body ? body : null
  } catch {
    return null
  }
}
