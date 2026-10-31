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
