// The `sheets` door of the gate's real write on a Joomla site (ticket #586, review round 2): the build team's own door
// (`templateSheetsDoor` of `apps/tracy-web/src/step-chain-draft-sheets.js`, #597), the one the app gives the write step,
// over `originReader` (the reader that file names for the release gate: the site's own origin only, no redirect
// followed, a timeout per request). It reads the home page in each theme and every page the site lists
// (`content.contract` inspect, through the gate's door client), bounded, and stops typed with `sheets_unreadable`.
// Without the door the write step stops at the accent (`door_not_available`). Reads only.
import { originReader, templateSheetsDoor } from '../../../../apps/tracy-web/src/step-chain-draft-sheets.js'

/**
 * @param {{base: string, send?: ((door: string, body: object) => Promise<object>) | null, fetchImpl?: typeof fetch}}
 *   input `send`: the gate's door client of the site, for the page list; null reads the home page only
 * @returns {(args?: {variables?: string[]}) => Promise<string[]>} the door, as `runDraftWrite` calls it
 */
export function joomlaSheetsDoor({ base, send = null, fetchImpl = fetch }) {
  const pages = send ? () => send('content.contract', { operation: 'inspect' }) : null
  return templateSheetsDoor({ reader: originReader({ base, fetchImpl }), pages })
}
