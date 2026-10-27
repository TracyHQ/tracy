/** A pointer to an active read, never an authority to start one or a copy of site credentials. */
export const IMPORT_PENDING_KEY = 'tracy.import.active'

/** @param {Storage | null | undefined} storage */
export function pendingImport(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(IMPORT_PENDING_KEY) ?? 'null')
    if (
      saved &&
      typeof saved.siteKey === 'string' &&
      /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(saved.siteKey) &&
      typeof saved.runId === 'string' &&
      saved.runId.length > 0 &&
      saved.runId.length <= 200 &&
      ['joomla', 'wordpress'].includes(saved.platform)
    )
      return { siteKey: saved.siteKey, platform: saved.platform, runId: saved.runId }
  } catch {
    /* Storage may be disabled or contain a partial value. */
  }
  return null
}

/** @param {Storage | null | undefined} storage @param {{siteKey:string,platform:string,runId:string} | null} run */
export function rememberImport(storage, run) {
  try {
    if (run)
      storage?.setItem(
        IMPORT_PENDING_KEY,
        JSON.stringify({ siteKey: run.siteKey, platform: run.platform, runId: run.runId })
      )
    else storage?.removeItem(IMPORT_PENDING_KEY)
  } catch {
    /* The host keeps reading when a browser cannot retain the pointer. */
  }
}
