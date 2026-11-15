// The marker build's first write (ticket #585): the write plan run by the build team's write step on a blank site in
// memory (`write-order-memory-doors.mjs`, the plugin rules measured on a real blank site), before any real site is
// touched. A refusal there is a write step gap (`marker-gaps.mjs`): the gate learns it here, so the real site is
// written only with a plan the write step carries to the end.
import { memoryDoors } from '../../../packages/wo/website-opportunities/domain/write-order-memory-doors.mjs'
import { runDraftWrite } from '../../../apps/tracy-web/src/step-chain-draft-write.js'
import { markerPictureBytes } from './marker-pictures.mjs'

/** The stored bytes of a marker picture, by stored id: a small PNG that names its code (`marker-pictures.mjs`). */
export const openMarkerPicture = (registry) => async (id) => ({
  bytes: markerPictureBytes(registry, id),
  mime: 'image/png'
})

/**
 * A `tryWrite` for `markerBuild`: runs the write plan on a fresh memory site of the kit's blank site contract.
 * @param {{lock: object, blankContract: object}} kit
 */
export const memoryTryWrite = (kit) => async (built) => {
  const memory = memoryDoors({ lock: kit.lock, contentMap: kit.blankContract })
  const report = await runDraftWrite({
    plan: built.writePlan,
    doors: memory.doors,
    record: {},
    openStored: openMarkerPicture(built.registry),
    runId: 'run-marker-memory'
  })
  return { report, memory }
}
