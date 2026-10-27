/**
 * The import recovery page's address: `/new/?tab=tracy:add-site&import=<siteKey>`.
 *
 * tracy-web sends a person here instead of into a site whose import never finished
 * (`apps/tracy-web/src/lib/import-pending.js` `importRecoveryPath`): from `/`, from a named path or an
 * old pointer to that site, and from My Sites' "Finish import". The address carries only the site;
 * what became of its read is asked of the host each time the page opens (`recoverImport`), so the
 * page is the same after a reload and on another device.
 */

/** The query parameter, named in `importRecoveryPath` on the server too. */
export const IMPORT_RECOVERY_PARAM = 'import'

/**
 * The site an address asks to recover, or undefined. Anything that is not a plain host name reads
 * as nothing: it is sent to a door as a site key.
 * @param {string} search - `location.search`.
 * @returns {string | undefined}
 */
export function recoveryAsk(search) {
  let value
  try {
    value = new URLSearchParams(search).get(IMPORT_RECOVERY_PARAM)?.trim().toLowerCase()
  } catch {
    return undefined
  }
  if (!value || value.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)) return undefined
  return value
}
