// The journals of a draft write (#599).
//
// `wroteDoors` (every draft run, a first build too): before each write, the hash of the value it sends is kept per
// place in the run record (`state.wrote`), with the keys of a JSON value (`state.shapes`), so the build result says
// what the site should hold at every place the build, or a build before it, wrote. The hash is taken in the form the
// write step's read back compares that place by (`revision-place-value.mjs`): a site that stores a JSON column its own
// way (re-encoded, keys added) holds what Tracy wrote. A place is named, never its text:
//   record:<kind>:<id>:<column>   assignment:<module id>   slot:<slot key>   identity:<field>
//
// `journaledDoors` (a revision run): before any door call writes over a place, what that place held is read and kept in
// the run record (`state.undo`), saved BEFORE the call, first value kept: a place written twice in one run, or again
// after a crash and resume, keeps what the previous build left there. The restore (`step-chain-draft-restore.js`) and
// the abandon of a crashed run (`step-chain-draft-abandon.js`) write these values back. Kept per place:
//   records      `<kind>:<id>` -> {kind, id, fields: {<column>: value before}} (a column the record did not have: null)
//   assignments  `<module id>` -> the module's pages before, or null when it had none
//   slots        `<slot key>` -> the slot's value before; `removed`: the slots the run took out (no door puts one back)
//   identity     `<field>` -> the site identity value before
//   uploads      the paths the run uploaded that held no file before (no door deletes a file)
// A value before that names a text the revision holds is never kept: `HELD_BEFORE` stands in for it, and the restore
// stops on it (`restore_shows_held_text`). A record the run MADE needs nothing kept: it is every id of the run record
// the previous build did not have.
//
// 🔒 AN OWNER'S EDIT IS NEVER WRITTEN OVER. At EVERY write over a place, first touch or a resume after a crash, the value
// the place holds must be one Tracy left there: what the previous build wrote, what this run wrote, the value about to
// be written, or the value before this run journaled. Any other value was written outside Tracy, and the run stops
// (`site_changed_outside`, noRerun, naming the place, never the text). A place no build wrote is free on first touch.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { placeHolds } from 'website-opportunities/domain/revision-place-value.mjs'
import { namesAnyIn } from 'website-opportunities/domain/revision-text-forms.mjs'
import { holdsSent, holdsWrote, keepWrote, wroteDoors } from './step-chain-draft-wrote.js'

export { holdsWrote, keepWrote, wroteDoors }

const list = (value) => (Array.isArray(value) ? value : [])

/** What the journal keeps for a value before that names a held text. */
export const HELD_BEFORE = Object.freeze({ held: true })
export const isHeldBefore = (value) => Boolean(value && typeof value === 'object' && value.held === true)

/** An empty journal. */
export const emptyUndo = () => ({
  records: {},
  assignments: {},
  slots: {},
  removed: [],
  identity: {},
  uploads: []
})

/** The typed stop of a place edited outside Tracy. */
export const outsideEdit = (place) =>
  new DraftWriteError(
    'site_changed_outside',
    `${place} holds another value than Tracy wrote there: it was edited outside Tracy`,
    { place },
    { noRerun: true }
  )

/**
 * The doors of a revision run, keeping the journal in `state.undo` and saving the record before each write.
 * @param {object} doors the site doors
 * @param {{state: object, save?: Function}} record the run record
 * @param {{previousWrote?: Record<string, string>, previousShapes?: Record<string, unknown>, held?: string[]}}
 *   [options] `previousWrote`/`previousShapes`: the previous build's `state.wrote` and `state.shapes`; `held`: the
 *   texts the revision holds
 */
export function journaledDoors(doors, record, options = {}) {
  const { previousWrote = {}, previousShapes = {}, held = [] } = options
  const undo = () => (record.state.undo ??= emptyUndo())
  const save = async () => record.save?.(record.state)
  /** The value kept for a place: the value, or the held stand in. */
  const keep = (value) => (held.length && value !== null && namesAnyIn(value, held) ? HELD_BEFORE : value)
  /** A place about to be written must hold a value Tracy left there (above); `journaled`: its kept value, if any. */
  const check = (place, now, next, journaled) => {
    if (!previousWrote[place] && journaled === undefined) return
    const ok =
      holdsWrote(place, now, { wrote: previousWrote, shapes: previousShapes }) ||
      holdsWrote(place, now, record.state) ||
      holdsSent(place, now, record.state.undo) ||
      placeHolds(place, next, now) ||
      (journaled !== undefined && !isHeldBefore(journaled) && placeHolds(place, journaled, now))
    if (!ok) throw outsideEdit(place)
  }
  // What the call writes is kept with the journal, saved BEFORE the call: a crash after the call acted leaves a site
  // whose new value the saved record names (the abandon and a resume take it for Tracy's, not for an owner's edit).
  const wrote = (place, value) => keepWrote(record.state, place, value, undo())
  async function keepRecord(kind, id, fields) {
    if (kind === 'moduleAssignment') {
      const key = String(id)
      let raw = null
      try {
        raw = (await doors.get({ kind, id })).menuids
      } catch (error) {
        if (error?.code !== 'NOT_FOUND') throw error
      }
      const kept = undo().assignments[key]
      const was = kept === undefined || kept === null ? kept : JSON.stringify(kept)
      check(`assignment:${Number(id)}`, raw, fields?.menuids, was)
      wrote(`assignment:${Number(id)}`, fields?.menuids)
      if (!Object.hasOwn(undo().assignments, key))
        undo().assignments[key] = raw === null ? null : JSON.parse(raw)
      return save()
    }
    // A record made: no value before; the journal says a make was sent, so no rollback takes the site for whole.
    if (Number(id) === 0) {
      undo().making = [...new Set([...list(undo().making), kind])]
      return save()
    }
    const key = `${kind}:${Number(id)}`
    const row = await doors.get({ kind, id })
    const kept = undo().records[key] ?? { kind, id: Number(id), fields: {} }
    for (const column of Object.keys(fields ?? {})) {
      const place = `record:${key}:${column}`
      const had = Object.hasOwn(kept.fields, column)
      check(place, row[column] ?? null, fields[column], had ? kept.fields[column] : undefined)
      wrote(place, fields[column])
      if (!had) kept.fields[column] = keep(row[column] ?? null)
    }
    undo().records[key] = kept
    return save()
  }
  return {
    ...doors,
    async update(call) {
      await keepRecord(call.kind, call.id, call.fields)
      return doors.update(call)
    },
    async contract(call) {
      const keys = [...Object.keys(call.changes ?? {}), ...list(call.removes)]
      if (keys.length) {
        const before = await doors.read({ slots: keys })
        for (const k of keys)
          check(`slot:${k}`, before[k] ?? null, call.changes?.[k] ?? null, undo().slots[k])
        for (const k of keys) wrote(`slot:${k}`, call.changes?.[k] ?? null)
        for (const k of keys) if (!Object.hasOwn(undo().slots, k)) undo().slots[k] = keep(before[k] ?? null)
      }
      for (const k of list(call.removes)) if (!undo().removed.includes(k)) undo().removed.push(k)
      await save()
      return doors.contract(call)
    },
    async identity(call) {
      const fields = Object.keys(call.fields ?? {})
      if (fields.length) {
        const before = await doors.readIdentity()
        for (const f of fields) check(`identity:${f}`, before[f] ?? null, call.fields[f], undo().identity[f])
        for (const f of fields) wrote(`identity:${f}`, call.fields[f])
        for (const f of fields)
          if (!Object.hasOwn(undo().identity, f)) undo().identity[f] = keep(before[f] ?? null)
        await save()
      }
      return doors.identity(call)
    },
    async upload(call) {
      if (!undo().uploads.includes(call.path) && (await doors.media({ path: call.path })) === null) {
        undo().uploads.push(call.path)
        await save()
      }
      return doors.upload(call)
    }
  }
}
