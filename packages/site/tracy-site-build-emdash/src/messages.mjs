/**
 * The sentences only the EmDash build says to a customer, keyed by a stable code — the plugin's
 * half of `@tracy/site-build-core/host-messages` (read its header for the rule).
 *
 * The host stages fill them for the English `detail`; `src/client/strings.ts` spreads them into
 * this plugin's namespace as `host.<code>`, where they are translated. Codes are part of the job
 * file: never rename one. A personalize run's own output is not here: it is the tool's diagnosis
 * and travels as written.
 */
export const EMDASH_MESSAGES = Object.freeze({
  E_NO_ADDRESS: 'This build names no site address. Start it from the Build tab, which makes one.',
  E_NOT_EMDASH: '{url} answers, but not as an EmDash site.',
  E_NO_ANSWER: '{url} did not answer as a site in time ({reason}).',
  E_NO_DOCKER: 'docker is not available on this host, so the site cannot be reached.'
})
