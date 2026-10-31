import { lookup } from 'node:dns/promises'

/**
 * The address a call from this host to tracy-web is sent to (`index.ts` `apiOriginOf`, #208): the
 * internal origin the host names, when it is a bare http(s) origin and the call was meant for the
 * configured public origin; the call's own origin otherwise (a test's, or a host with no internal
 * address). Only where a call is SENT changes: words people read keep the public origin.
 * @param {string} origin - the origin the call was planned for.
 * @param {string | null} publicOrigin - `MCP_TRACY_ORIGIN`.
 * @param {string | null} internal - `MCP_TRACY_API_ORIGIN`.
 * @returns {string}
 */
export function callOrigin(origin, publicOrigin, internal) {
  return internal && /^https?:\/\/[^/\s]+$/.test(internal) && origin === publicOrigin ? internal : origin
}

/**
 * tracy-web as a fleet host's dsh reaches it on its own network: every server stack joins tracy-web to
 * dsh's network under this name (`deploy/compose.server.yml`, `networks: dsh`). Measured from dev's
 * `tracy-dsh` 31/10/2026: `http://tracy-web:8080` answered in ~80 ms.
 */
export const FLEET_TRACY_WEB = 'http://tracy-web:8080'

/**
 * The internal origin a host's calls go to (#208, what #261 left to the operator): the one the host
 * names (`MCP_TRACY_API_ORIGIN`), else — on a fleet dsh (`MCP_TRACY_FLEET=1`) — `FLEET_TRACY_WEB`
 * while the name `tracy-web` resolves here, else none (the public origin, as before). A name that does
 * not resolve sends nothing, so a shard whose tracy-web lives on another machine keeps the public
 * origin without a failed call. The answer is kept 5 minutes when found, 30 s when not.
 * @param {{ configured: () => string | null, fleet: () => boolean,
 *   resolve?: (host: string) => Promise<unknown>, now?: () => number }} options
 * @returns {() => Promise<string | null>}
 */
export function createInternalOrigin({
  configured,
  fleet,
  resolve = (host) => lookup(host),
  now = Date.now
}) {
  /** @type {{ at: number, origin: string | null } | null} */
  let held = null
  return async () => {
    const named = configured()
    if (named) return named
    if (!fleet()) return null
    if (held && now() - held.at < (held.origin ? 300_000 : 30_000)) return held.origin
    let origin = null
    try {
      await Promise.race([
        resolve('tracy-web'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 1_000).unref?.())
      ])
      origin = FLEET_TRACY_WEB
    } catch {
      origin = null
    }
    held = { at: now(), origin }
    return origin
  }
}
