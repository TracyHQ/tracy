// The journal of a record write in a revision run (#599), split from `step-chain-draft-journal.js`: each column read and
// kept before the call, checked for an edit made outside Tracy, and a JSON column sent over only the keys Tracy owns.
//
// 🔒 WHAT A REVISION NO LONGER SENDS DOES NOT STAY. The end state of a revision is a full build of the same plan plus the
// owner's own keys:
//   - a JSON key the previous build owned (`previous.state.shapes`) that the revision no longer sends is taken out
//     (`step-chain-draft-owned-keys.js`), every key the owner added kept; a row's keys a full build writes empty are in
//     what is sent already (`rowFillsOf`);
//   - a column the previous build wrote on a record a build made that the operation written again whole (`:rewrite`)
//     no longer sends is emptied (`''`, what a new record holds there) and kept in `state.cleared`, NOT in
//     `state.wrote` (the record no longer claims a value there): a later write over it, a restore or an abandon finds
//     it blank or stops on the owner's value; a column with no empty value (an id, a state, a type) stops
//     `revision_needs_removal`;
//   - taking either off over an owner's edit (the place holds no value Tracy left there) stops `site_changed_outside`.
// `undo.prior` keeps the shape the previous build owned at each JSON place, so a restore and an abandon put every key
// taken out back exactly.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { ownedColumnOf, shapeUnion } from './step-chain-draft-owned-keys.js'
import { placeHolds, placeShapeOf } from './step-chain-draft-place-value.js'
import { holdsSent, holdsWrote } from './step-chain-draft-wrote.js'

const list = (value) => (Array.isArray(value) ? value : [])
/** Columns no empty text can stand for: an id, a state, a type or a name a record must keep. */
const NO_EMPTY = new Set(
  'id catid parent_id component_id template_style_id ordering access published state home language menutype module position type link alias title name extension note showtitle'.split(
    ' '
  )
)

const noEmptyStop = (place) =>
  new DraftWriteError(
    'revision_needs_removal',
    `${place} is no longer written and has no empty value to take it back to`,
    { place, why: 'column_without_empty_value' },
    { noRerun: true }
  )

/**
 * The record writer of a revision's journal.
 * @param {{doors: object, record: object, undo: Function, save: Function, check: Function, wrote: Function,
 *   keep: Function, previous: {wrote: object, shapes: object, cleared: string[]}, isHeld: Function,
 *   outside: Function}} io
 */
export function recordKeeper(io) {
  const { doors, record, undo, save, check, wrote, keep, previous, isHeld, outside } = io
  /** Whether a place holds a value Tracy left there, with no room for the value about to be written. */
  const tracyLeft = (place, now, journaled) =>
    holdsWrote(place, now, { wrote: previous.wrote, shapes: previous.shapes }) ||
    holdsWrote(place, now, record.state) ||
    holdsSent(place, now, record.state.undo) ||
    (journaled !== undefined && !isHeld(journaled) && placeHolds(place, journaled, now))

  /** A JSON column sent over the keys Tracy owns, the keys it owned before and no longer sends taken out. */
  function ownedValueOf(place, now, value, journaled) {
    const state = record.state
    const known = Boolean(previous.wrote[place] || state.wrote?.[place])
    const before = known ? shapeUnion(previous.shapes[place] ?? {}, state.shapes?.[place] ?? {}) : null
    const shape = placeShapeOf(place, value)
    const owned = before && shape ? shapeUnion(before, shape) : shape
    const out = ownedColumnOf(now, value, owned, before)
    if (out.overOwner) throw outside(place)
    if (out.taken.length && !tracyLeft(place, now, journaled)) throw outside(place)
    if (previous.shapes[place]) {
      undo().prior ??= {}
      undo().prior[place] ??= previous.shapes[place]
    }
    return out.value
  }

  /** The columns the previous build wrote on this record that a whole write no longer sends: emptied. */
  function clearedOf(kind, id, fields) {
    const prefix = `record:${kind}:${Number(id)}:`
    const out = {}
    for (const place of Object.keys(previous.wrote)) {
      if (!place.startsWith(prefix) || previous.cleared.includes(place)) continue
      const column = place.slice(prefix.length)
      if (Object.hasOwn(fields, column)) continue
      if (NO_EMPTY.has(column)) throw noEmptyStop(place)
      out[column] = ''
    }
    return out
  }

  /** A place the record no longer claims: its hash and its keys dropped. */
  const forget = (place) => {
    delete record.state.wrote?.[place]
    delete record.state.shapes?.[place]
  }

  /** Every column of a record update read, checked and kept before the call; the fields to send. */
  return async function keepRecord(kind, id, fields, { whole = false } = {}) {
    const key = `${kind}:${Number(id)}`
    const row = await doors.get({ kind, id })
    const cleared = whole ? clearedOf(kind, id, fields ?? {}) : {}
    const all = { ...fields, ...cleared }
    const kept = undo().records[key] ?? { kind, id: Number(id), fields: {} }
    const sent = { ...all }
    for (const column of Object.keys(all)) {
      const place = `record:${key}:${column}`
      const had = Object.hasOwn(kept.fields, column)
      const journaled = had ? kept.fields[column] : undefined
      check(place, row[column] ?? null, all[column], journaled)
      sent[column] = ownedValueOf(place, row[column] ?? null, all[column], journaled)
      // A column emptied is no longer Tracy's: the record claims no value there (`state.cleared` guards it instead).
      if (Object.hasOwn(cleared, column)) forget(place)
      else wrote(place, all[column])
      if (!had) kept.fields[column] = keep(row[column] ?? null)
    }
    const state = record.state
    const gone = new Set(Object.keys(fields ?? {}).map((c) => `record:${key}:${c}`))
    state.cleared = [
      ...new Set([
        ...list(state.cleared).filter((p) => !gone.has(p)),
        ...Object.keys(cleared).map((c) => `record:${key}:${c}`)
      ])
    ]
    undo().records[key] = kept
    state.touched = true
    await save()
    return sent
  }
}
