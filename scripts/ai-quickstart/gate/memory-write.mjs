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
 * Refusals the real plugin gives that the memory site does not: each one was met on the gate's first run on a real
 * blank site (plugin 0.24.85) and is laid over the memory doors, so the memory write learns it as a write step gap
 * before the real site is written. Each is a finding for the build team: `{code, door, when(call), message}`.
 */
export const MEASURED_REFUSALS = Object.freeze([
  {
    code: 'write_failed',
    door: 'update',
    message: 'Category is required.',
    why: 'an article created with no category is refused by Joomla; the write plan gives it none',
    when: ({ kind, id, fields }) => kind === 'article' && !Number(id) && !fields?.catid
  },
  {
    code: 'write_failed',
    door: 'update',
    message: "Field 'params' doesn't have a default value",
    why: 'a contact created with no params column is refused by the database; the write plan sends none',
    when: ({ kind, id, fields }) => kind === 'contact' && !Number(id) && fields?.params === undefined
  }
])

/** The memory doors with the measured refusals laid over them. */
export function withMeasuredRefusals(doors, refusals = MEASURED_REFUSALS) {
  const out = { ...doors }
  for (const r of refusals) {
    const inner = out[r.door]
    out[r.door] = async (call) => {
      if (r.when(call)) throw Object.assign(new Error(`${r.code}: ${r.message}`), { code: r.code })
      return inner(call)
    }
  }
  return out
}

/**
 * A `tryWrite` for `markerBuild`: runs the write plan on a fresh memory site of the kit's blank site contract.
 * @param {{lock: object, blankContract: object}} kit
 */
export const memoryTryWrite = (kit) => async (built) => {
  const memory = memoryDoors({ lock: kit.lock, contentMap: kit.blankContract })
  const report = await runDraftWrite({
    plan: built.writePlan,
    doors: withMeasuredRefusals(memory.doors),
    record: {},
    openStored: openMarkerPicture(built.registry),
    runId: 'run-marker-memory'
  })
  return { report, memory }
}
