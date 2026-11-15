// The write step's wiring on a REAL site (#597): `deps.draftWrite` of a draft run made from the Apply door the step
// chain engine hands the Write step (`how.door.apply`, `applyFor(email, runId)`: every call a write of the setup run)
// and the site wiring `app.js` injects (`deps.site`). Spec: docs/references/draft-write-doors.md.
//
//   deps.site.siteDoors({send, siteKey, publicFile, signal})
//                                        the door client (scripts/ai-quickstart/site-doors.mjs): the doors
//                                        `runDraftWrite` calls, each made of plugin calls through `send`
//                                        (`step-chain-draft-send.js`). REQUIRED: absent, no doors exist. Production:
//                                        `siteDoors` of website-opportunities/domain/site-doors.mjs (`app.js`)
//   deps.site.publicFile(siteKey, path)  optional: the bytes of a public file of the site, or null (the upload read back,
//                                        door `media`; no plugin operation reads a file's bytes). Absent, the `media`
//                                        door stops the write typed (`door_not_available`, door `media`)
//   deps.site.filePresence(siteKey, path)
//                                        optional: whether a public file is there, 'present' (200), 'absent' (404 or
//                                        410) or 'unread' (any other answer, a redirect, a network error): door
//                                        `presence`, read by the media delete of a restore or an abandon
//                                        (`step-chain-draft-media-delete.js`). Absent, the door answers 'unread' (a file
//                                        is then kept, never taken for gone): `media` answers null for any unread file
//   deps.site.blankContract(kit)         the blank site contract's content map of the kit, or null
//   deps.site.templateSheets(siteKey, {variables, pages})
//                                        optional: the stylesheets the site's template serves (door `sheets`, the
//                                        accent module is built from them; `variables`: the accent variables the kit
//                                        declares; `pages()`: the site's inspect answer, its page list). Production:
//                                        `draftTemplateSheets` (`step-chain-draft-sheets.js`). Absent, the accent stops
//                                        the write typed (`door_not_available`)
//   deps.site.pictures                   optional `{stored(order), openStored(id)}` in place of the stored pictures of
//                                        `step-chain-draft-stored.js` (a picture source a test or a later generator gives)
//
// With no Apply door, no door factory or no site key the wiring is null, and the step stops typed
// (`write_not_ready_for_draft`), writing nothing. The run record is kept by run id, between the frame's two attempts of
// the step, and saved through `deps.runRecords` (`step-chain-draft-run-records.js`) when one is wired: a run whose
// process died then resumes, or is abandoned, from what its last save stored.
//
// `siteDoorsFor` below is the same door client over the Apply door of a restore or an abandon of a built site
// (`build-draft-rebuild-wiring.js`), or null while no door factory is wired.
import { durableRunRecord } from './step-chain-draft-run-records.js'
import { recordedDoor } from './sites/brief-engines/shared.js'
import { typedDoors } from './step-chain-draft-doors.js'
import { draftSendOf } from './step-chain-draft-send.js'
import { storedPicturesOf } from './step-chain-draft-stored.js'

/**
 * The `sheets` door over `site.templateSheets`, given the site's page list (`content.contract` inspect through the same
 * transport) so the stylesheets of every listed page are read (`step-chain-draft-sheets.js`); none when not wired.
 */
const sheetsDoorOf = (site, siteKey, send) =>
  typeof site.templateSheets === 'function'
    ? {
        sheets: (args = {}) =>
          site.templateSheets(siteKey, {
            ...args,
            pages: () => send('content.contract', { operation: 'inspect' })
          })
      }
    : {}

/** The `presence` door over `site.filePresence`: 'unread' when not wired, when it fails, or for any other answer. */
const presenceDoorOf = (site, siteKey) => ({
  presence: async ({ path }) => {
    if (typeof site.filePresence !== 'function') return 'unread'
    try {
      const got = await site.filePresence(siteKey, path)
      return got === 'present' || got === 'absent' ? got : 'unread'
    } catch {
      return 'unread'
    }
  }
})

/**
 * The doors of a restore or an abandon of a built site: the door client (`site.siteDoors`) over the Apply door as
 * `email` under the setup run `runId` (`applyFor(email, runId)`), or null when no door factory is wired.
 * @param {{site?: {siteDoors?: Function, publicFile?: Function}, applyFor?: Function}} deps
 * @returns {(input: {siteKey: string, email: string, runId: string, signal?: AbortSignal}) => Promise<object | null>}
 */
export const siteDoorsFor =
  ({ site, applyFor }) =>
  async ({ siteKey, email, runId, signal = null }) => {
    if (typeof site?.siteDoors !== 'function' || typeof applyFor !== 'function') return null
    if (typeof siteKey !== 'string' || siteKey === '' || !email || !runId) return null
    const send = draftSendOf({ apply: applyFor(email, runId), siteKey, signal })
    return typedDoors(
      {
        ...(await site.siteDoors({
          send,
          siteKey,
          publicFile: typeof site.publicFile === 'function' ? (path) => site.publicFile(siteKey, path) : null,
          signal
        })),
        ...sheetsDoorOf(site, siteKey, send),
        ...presenceDoorOf(site, siteKey)
      },
      { siteKey }
    )
  }

/**
 * @param {{site?: {siteDoors?: Function, publicFile?: Function, blankContract?: Function, pictures?: object},
 *   openDraftPicture?: Function, runRecords?: object}} deps the draft deps (`runRecords`: the run record store)
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
    // The door client's answers are settled for the write step by `typedDoors` (`step-chain-draft-doors.js`): a door
    // the site does not have stops typed (`door_not_available`, naming it). No `journal` is passed: the client keeps
    // its replays in memory for this attempt, and the run record (`madeOnce`) is what keeps a resumed or re-run write
    // from making a record twice.
    doors: async (c) => {
      const send = draftSendOf({
        apply: recordedDoor(c, apply),
        siteKey: c.siteKey,
        signal: c.signal ?? null
      })
      return typedDoors(
        {
          ...(await site.siteDoors({
            send,
            siteKey: c.siteKey,
            publicFile:
              typeof site.publicFile === 'function' ? (path) => site.publicFile(c.siteKey, path) : null,
            signal: c.signal ?? null
          })),
          ...sheetsDoorOf(site, c.siteKey, send),
          ...presenceDoorOf(site, c.siteKey)
        },
        { siteKey: c.siteKey }
      )
    },
    record: async () => {
      if (!records.has(runId))
        records.set(runId, deps.runRecords ? await durableRunRecord(deps.runRecords, runId, ctx) : {})
      return records.get(runId)
    },
    stored: async (order) => pictures.stored(order),
    openStored: (id) => pictures.openStored(id),
    blankContract: (kit) => site.blankContract?.(kit) ?? kit?.aiq?.blankContract ?? null
  }
}
