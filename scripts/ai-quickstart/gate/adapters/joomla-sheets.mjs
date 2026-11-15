// The `sheets` door of the gate's real write on a Joomla site (ticket #586, review round 2): the stylesheets the
// template serves on the home page, as a visitor reads them, read the same way the app gives the write step this door
// (`templateSheets` of `apps/tracy-web/src/app.js`, `readSiteSheets` of `apps/tracy-web/src/write-step/site-sheets.js`).
// The accent module is built from them; without the door the write step stops at the accent (`door_not_available`).
// Reads only, never past the site's own address.
import { readSiteSheets } from '../../../../apps/tracy-web/src/write-step/site-sheets.js'

/** A page or a sheet of the site as text, or null when it does not answer. */
const textOf = (fetchImpl) => async (url) => {
  try {
    const answer = await fetchImpl(String(url), { signal: AbortSignal.timeout(20000) })
    return answer.ok ? await answer.text() : null
  } catch {
    return null
  }
}

/**
 * @param {{base: string, fetchImpl?: typeof fetch}} input
 * @returns {(args?: {variables?: string[]}) => Promise<string[]>} the door, as `runDraftWrite` calls it
 */
export function joomlaSheetsDoor({ base, fetchImpl = fetch }) {
  const origin = new URL(base).origin
  return async () => readSiteSheets({ origin, platform: 'joomla', paths: ['/'], text: textOf(fetchImpl) })
}
