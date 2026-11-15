// The write step's side of the door client (#597 over #585): the doors `siteDoors` (website-opportunities/domain/
// site-doors.mjs, owned by the door client) answers, made to keep the promises the write step, a restore and an
// abandon rely on (`step-chain-draft-write.js`, `step-chain-draft-restore.js`). The door client is never changed here:
// every door is passed through, and only these differences are settled on our side
// (docs/references/draft-write-doors.md, "The door client on the branch"):
//
//   DOOR_NOT_AVAILABLE   a door the plugin has no operation for (`contract` with removes, `media` with no public file
//                        reader, `deleteRecord`, `revertDelete`) -> the typed stop `door_not_available` naming the door,
//                        `noRerun` (a second attempt finds the same door missing) and `fatal`, so the executor passes it
//                        on as it is (with what ran) instead of trying the operation again and folding it into
//                        `redo_failed`
//   ABORTED              a door the run's signal stopped before it was sent -> `fatal` (never retried in place; the run
//                        record says where a resume starts), code kept
//   get -> null          a record the site does not hold: the write step reads columns off the answer, so it is the
//                        refusal `NOT_FOUND` naming the kind and id (as the memory site answers), never a null to crash on
//
// Every other error is the door client's or the plugin's own, passed on unchanged (its `code` is the stop's cause).
import { DOOR_NOT_AVAILABLE, UNAVAILABLE_DOORS } from 'website-opportunities/domain/site-doors.mjs'

/** The code of the write step's stop when a door it calls does not exist on this site. */
export const DOOR_NOT_AVAILABLE_STOP = 'door_not_available'

/** The typed stop of a door that does not exist on the site. */
function unavailableStop(name, error, siteKey) {
  const door = String(error?.details?.door ?? name)
  return Object.assign(
    new Error(`${DOOR_NOT_AVAILABLE_STOP}: the ${door} door is not available on this site`),
    {
      code: DOOR_NOT_AVAILABLE_STOP,
      details: { door, reason: UNAVAILABLE_DOORS[door] ?? null, siteKey },
      noRerun: true,
      fatal: true,
      cause: error
    }
  )
}

/** The refusal of a `get` that found no record. */
const notFound = (args) =>
  Object.assign(new Error(`NOT_FOUND: ${args?.kind ?? 'record'} ${args?.id ?? ''}`.trim()), {
    code: 'NOT_FOUND',
    details: { kind: args?.kind ?? null, id: args?.id ?? null }
  })

/**
 * The doors of `doors` with the differences above settled. Non function members (`html`) are kept as they are.
 * @param {object | null} doors what the door factory answered
 * @param {{siteKey?: string | null}} [opts] the site, named in a stop
 * @returns {object | null}
 */
export function typedDoors(doors, { siteKey = null } = {}) {
  if (!doors || typeof doors !== 'object') return doors ?? null
  const out = { ...doors }
  for (const [name, door] of Object.entries(doors)) {
    if (typeof door !== 'function') continue
    out[name] = async (...args) => {
      let answer
      try {
        answer = await door.apply(doors, args)
      } catch (error) {
        if (error?.code === DOOR_NOT_AVAILABLE) throw unavailableStop(name, error, siteKey)
        if (error?.code === 'ABORTED' && error && typeof error === 'object')
          throw Object.assign(error, { fatal: true })
        throw error
      }
      if (name === 'get' && (answer === null || answer === undefined)) throw notFound(args[0])
      return answer
    }
  }
  return out
}
