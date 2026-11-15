// The write step's wiring on a REAL site (#597): `deps.draftWrite` of a draft run made from the Apply door the step
// chain engine hands the Write step (`how.door.apply`, `applyFor(email, runId)`: every call a write of the setup run)
// and the site wiring `app.js` injects (`deps.site`). Spec: docs/references/draft-write-doors.md.
//
//   deps.site.siteDoors({send, siteKey, publicFile, signal})
//                                        the door client (scripts/ai-quickstart/site-doors.mjs): the doors
//                                        `runDraftWrite` calls, each made of plugin calls through `send`
//                                        (`step-chain-draft-send.js`). REQUIRED: absent, no doors exist
//   deps.site.publicFile(siteKey, path)  optional: the bytes of a public file of the site, or null (the upload read back,
//                                        door `media`; no plugin operation reads a file's bytes)
//   deps.site.blankContract(kit)         the blank site contract's content map of the kit, or null
//   deps.site.pictures                   optional `{stored(order), openStored(id)}` in place of the stored pictures of
//                                        `step-chain-draft-stored.js` (a picture source a test or a later generator gives)
//
// With no Apply door, no door factory or no site key the wiring is null, and the step stops typed
// (`write_not_ready_for_draft`), writing nothing. The run record is kept in this process by run id, between the
// frame's two attempts of the step (a run is never resumed in another process: `sites/brief-build.js`).
import { recordedDoor } from './sites/brief-engines/shared.js'
import { draftSendOf } from './step-chain-draft-send.js'
import { storedPicturesOf } from './step-chain-draft-stored.js'

/**
 * @param {{site?: {siteDoors?: Function, publicFile?: Function, blankContract?: Function, pictures?: object},
 *   openDraftPicture?: Function}} deps the draft deps
 * @param {{runId?: string, siteKey?: string, accountId?: string, signal?: AbortSignal, applied?: Function}} ctx the run
 * @param {{door?: {apply?: Function}} | undefined} how what the engine hands the Write step
 * @param {{kit: object, plan: object}} inputs the kit and plan steps' values
 * @param {Map<string, object>} records the run records of this process, by run id
 * @returns {object | null} the `draftWrite` wiring, or null when the site doors are not all there
 */
export function siteWriteOf(deps, ctx, how, inputs, records) {
  const site = deps?.site
  const apply = how?.door?.apply
  if (typeof site?.siteDoors !== 'function' || typeof apply !== 'function') return null
  if (typeof ctx?.siteKey !== 'string' || ctx.siteKey === '') return null
  const runId = ctx.runId ?? 'draft'
  const pictures =
    site.pictures ??
    storedPicturesOf({
      manifest: inputs?.plan?.research?.manifest,
      look: inputs?.plan?.plan?.look ?? null,
      accountId: ctx.accountId ?? null,
      openDraftPicture: deps.openDraftPicture
    })
  return {
    // Every apply id is kept on the run's row (`recordedDoor`), and no call goes out once the run is stopped.
    doors: async (c) =>
      site.siteDoors({
        send: draftSendOf({ apply: recordedDoor(c, apply), siteKey: c.siteKey, signal: c.signal ?? null }),
        siteKey: c.siteKey,
        publicFile: typeof site.publicFile === 'function' ? (path) => site.publicFile(c.siteKey, path) : null,
        signal: c.signal ?? null
      }),
    record: async () => {
      if (!records.has(runId)) records.set(runId, {})
      return records.get(runId)
    },
    stored: async (order) => pictures.stored(order),
    openStored: (id) => pictures.openStored(id),
    blankContract: (kit) => site.blankContract?.(kit) ?? kit?.aiq?.blankContract ?? null
  }
}
