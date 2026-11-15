// The acts that take things off a built site (#599, `step-chain-draft-removal.js`), run and read back: a revision's
// (`runRemovals`, through the journaled doors, so its restore and its abandon publish and assign again exactly what it
// hid), and a restore's or an abandon's (`undoAct`: the records the revision made hidden; the files it uploaded are
// deleted when nothing else names them, `deleteUpload` of `step-chain-draft-media-delete.js`).
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { DOOR_NOT_AVAILABLE_STOP } from './step-chain-draft-doors.js'
import { placeHolds } from './step-chain-draft-place-value.js'
import { checkAct, hiddenColumnOf } from './step-chain-draft-removal.js'
import { deleteUpload } from './step-chain-draft-media-delete.js'
import { keepHidden } from './step-chain-draft-show-again.js'

export { deleteUpload }

const ATTEMPTS = 2
const DOOR_OF = { hide: 'hide', unassign: 'unassign', media: 'deleteMedia' }

/** The typed stop of a site whose door client has no such door (an older client): before any door. */
export function missingDoorOf(acts, doors) {
  const door = acts.map((a) => DOOR_OF[a.door ?? a.type]).find((d) => d && typeof doors?.[d] !== 'function')
  if (!door) return null
  return new DraftWriteError(
    DOOR_NOT_AVAILABLE_STOP,
    `the ${door} door is not available on this site`,
    { door },
    { noRerun: true }
  )
}

/** One act sent and read back: the record's hidden column reads 0, the module's pages read none. */
export async function undoAct(act, doors, applyId) {
  if (act.door === 'unassign' || act.type === 'unassign') {
    await doors.unassign({ applyId, id: act.id })
    const got = (await doors.get({ kind: 'moduleAssignment', id: act.id })).menuids
    if (!placeHolds(`assignment:${act.id}`, '[]', got)) throw mismatch(act)
    return
  }
  await doors.hide({ applyId, kind: act.kind, id: act.id })
  const row = await doors.get({ kind: act.kind, id: act.id })
  if (Number(row[hiddenColumnOf(act.kind)]) !== 0) throw mismatch(act)
}

const mismatch = (act) =>
  new DraftWriteError('read_back_mismatch', `${act.key} reads another value after the act`, { act: act.key })

/**
 * The acts of a revision, after its writes: every act checked first (an owner edit stops before any of them), each run
 * once (`record.state.removal.done`), tried twice, then `redo_failed` (noRerun).
 * @param {{acts: object[], doors: object, record: {state: object, save?: Function}, previous: object, runId: string}}
 *   input `doors`: the journaled doors (`journaledDoors`); `previous`: the previous build's `{wrote, shapes}`
 */
export async function runRemovals({ acts, doors, record, previous, runId }) {
  const state = record.state
  state.removal ??= {
    acts: acts.map(({ key, door, kind, id, ops }) => ({ key, door, kind, id, ops })),
    done: []
  }
  const todo = acts.filter((a) => !state.removal.done.includes(a.key))
  for (const act of todo) await checkAct(act, doors, [previous, state], state.undo)
  for (const act of todo) {
    // Checked again right before it runs, every column the up-front check read: an owner who edited the record while
    // the acts before it ran is never written over (the journal's own check reads the hidden column only).
    if (act !== todo[0]) await checkAct(act, doors, [previous, state], state.undo)
    for (let attempt = 1; ; attempt++) {
      try {
        await undoAct(act, doors, `${runId}:remove:${act.key}`)
        break
      } catch (error) {
        if (error?.fatal || error?.noRerun || attempt >= ATTEMPTS)
          throw error?.fatal || error?.code === 'site_changed_outside'
            ? error
            : new DraftWriteError(
                'redo_failed',
                `${act.key} failed ${attempt} time(s)`,
                { op: act.key, cause: error?.code ?? null },
                { noRerun: true }
              )
      }
    }
    state.removal.done.push(act.key)
    keepHidden(state, act)
    await record.save?.(state)
  }
  return state.removal
}
