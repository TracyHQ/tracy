// The hashes of what a draft run wrote at each place of the site (#599): `state.wrote` (the last value per place, in the
// form the read back compares it by, `step-chain-draft-place-value.js`) and `state.shapes` (the keys of a JSON value), kept by
// `wroteDoors` for every draft run, and by the journal of a revision run (`step-chain-draft-journal.js`) before each
// call. A place a revision run writes twice keeps the earlier values it sent in `undo.sent`, so a crash between the two
// writes is never taken for an edit made outside Tracy.
import { placeHashOf, placeShapeOf } from './step-chain-draft-place-value.js'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * Keep in `state` the hash (and the JSON keys) of a value written at a place; with `undo` (a revision's journal), an
 * earlier value this run sent there is kept in `undo.sent[place]`.
 */
export function keepWrote(state, place, value, undo) {
  state.wrote ??= {}
  state.shapes ??= {}
  const shape = placeShapeOf(place, value)
  const hash = placeHashOf(place, value, shape)
  const was = state.wrote[place]
  if (undo && was && was !== hash && touched(undo, place)) {
    undo.sent ??= {}
    const sent = list(undo.sent[place])
    if (!sent.some(([h]) => h === was)) undo.sent[place] = [...sent, [was, state.shapes[place] ?? null]]
  }
  state.wrote[place] = hash
  if (shape) state.shapes[place] = shape
  else delete state.shapes[place]
}

/** Whether this run's journal already holds a value before for a place (it wrote there before). */
function touched(undo, place) {
  const [type, ...rest] = place.split(':')
  if (type === 'record') {
    const column = rest.pop()
    return Object.hasOwn(undo.records?.[rest.join(':')]?.fields ?? {}, column)
  }
  const key = rest.join(':')
  if (type === 'assignment') return Object.hasOwn(undo.assignments ?? {}, key)
  if (type === 'slot') return Object.hasOwn(undo.slots ?? {}, key)
  return Object.hasOwn(undo.identity ?? {}, key)
}

/** Whether a place holds what `wrote`/`shapes` say was written there. */
export const holdsWrote = (place, now, { wrote = {}, shapes = {} } = {}) =>
  Boolean(wrote[place]) && placeHashOf(place, now, shapes[place] ?? null) === wrote[place]

/** Whether a place holds an earlier value this run sent there (`undo.sent`). */
export const holdsSent = (place, now, undo) =>
  list(undo?.sent?.[place]).some(([hash, shape]) => placeHashOf(place, now, shape) === hash)

/** The doors of any draft run, keeping the hash of each value written in `state.wrote`. */
export function wroteDoors(doors, record) {
  const wrote = (place, value) => record.state && keepWrote(record.state, place, value)
  const columns = (kind, id, fields) => {
    if (kind === 'moduleAssignment') return wrote(`assignment:${Number(id)}`, fields?.menuids)
    for (const [column, value] of Object.entries(fields ?? {}))
      wrote(`record:${kind}:${Number(id)}:${column}`, value)
  }
  return {
    ...doors,
    async update(call) {
      if (Number(call.id) !== 0) columns(call.kind, call.id, call.fields)
      const answer = await doors.update(call)
      if (Number(call.id) === 0 && answer?.id) columns(call.kind, answer.id, call.fields)
      return answer
    },
    async contract(call) {
      for (const [key, value] of Object.entries(call.changes ?? {})) wrote(`slot:${key}`, value)
      for (const key of list(call.removes)) wrote(`slot:${key}`, null)
      return doors.contract(call)
    },
    async identity(call) {
      for (const [field, value] of Object.entries(call.fields ?? {})) wrote(`identity:${field}`, value)
      return doors.identity(call)
    }
  }
}
