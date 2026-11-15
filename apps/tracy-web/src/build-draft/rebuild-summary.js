/**
 * What the chat reads of a rebuild beside the build in small (#612, `build-route.js buildSummaryOf`): which run the
 * build is, the sentence for the owner, the actions the site chat offers, and the flag a held file raises. Pure.
 *
 *   kind        'partial' for a rebuild (absent for the first build)
 *   say         the sentence for the owner: how the last update, restore or abandon ended (`rebuild-say.js`)
 *   restorable  the last update is done and was not gone back from: "Restore the previous version" is offered
 *   unfinished  an earlier update did not finish: "Undo the unfinished update" is offered
 *   busy        a restore or an abandon holds the site right now
 *   heldFile    `{code, say, files}` when a held person's photo is still a file of the site
 */
import { partialOf } from './rebuild-progress.js'
import { DONE_SAY, UNAVAILABLE_SAY, heldFilesOf, rebuildSayOf } from './rebuild-say.js'

const list = (value) => (Array.isArray(value) ? value : [])
const UNAVAILABLE = new Set(['REVISION_RUN_UNAVAILABLE', 'REVISION_START_FAILED'])

/** The newest change (restore, abandon) of the build, when it came after the build's last run ended. */
function lastChangeOf(build) {
  const change = list(build.changes).at(-1)
  if (!change) return null
  const at = Date.parse(String(change.at ?? ''))
  const ended = Date.parse(String(build.endedAt ?? ''))
  return Number.isFinite(at) && (!Number.isFinite(ended) || at >= ended) ? change : null
}

/**
 * @param {{build: object, brief?: object | null, unfinished?: boolean}} input `brief`: the site's brief row as
 *   `readRun` reads it; `unfinished`: the build store marks an unfinished update on the site
 */
export function rebuildFactsOf({ build, brief = null, unfinished = false }) {
  if (!build?.site?.siteKey) return {}
  const partial = partialOf(build, brief)
  const row = partial ? partial.brief : brief
  const chain = row?.timings?.chain ?? null
  const code = build.refusal?.code ?? chain?.stop?.code ?? null
  const ended = Boolean(build.endedAt)
  const change = lastChangeOf(build)
  const out = {}
  if (partial) out.kind = 'partial'
  if (change) {
    out.say =
      change.result === 'done' ? DONE_SAY[change.kind] : (rebuildSayOf(change.code) ?? UNAVAILABLE_SAY)
  } else if (ended && build.result === 'stopped') {
    const said = UNAVAILABLE.has(code) ? UNAVAILABLE_SAY : rebuildSayOf(code)
    if (said) out.say = said
  } else if (ended && partial && build.result === 'done') out.say = DONE_SAY.partial
  out.restorable =
    ended &&
    partial !== null &&
    build.result === 'done' &&
    !(change?.kind === 'restore' && change.result === 'done')
  // The store's own mark says whether an update is unfinished (`deps.builds.unfinished`), whatever the chat last saw.
  out.unfinished = ended && unfinished
  if (out.unfinished && !out.say) out.say = rebuildSayOf('previous_run_unfinished')
  if (build.busy?.kind) out.busy = build.busy.kind
  const write = list(chain?.steps).findLast((line) => line?.step === 'write')
  const held = heldFilesOf(write?.output?.flags)
  if (held) out.heldFile = held
  return out
}
