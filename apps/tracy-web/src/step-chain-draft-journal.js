// The journals of a draft write (#599).
//
// `wroteDoors` (every draft run, a first build too): before each write, the sha256 of the value it sends is kept per
// place in the run record (`state.wrote`), so the build result says what the site should hold at every place the
// build, or a build before it, wrote. A place is named, never its text:
//   record:<kind>:<id>:<column>   assignment:<module id>   slot:<slot key>   identity:<field>
//
// `journaledDoors` (a revision run): before any door call writes over a place, what that place held is read and kept in
// the run record (`state.undo`), saved BEFORE the call, first value kept: a place written twice in one run, or again
// after a crash and resume, keeps what the previous build left there. The restore (`step-chain-draft-restore.js`)
// writes these values back. Kept per place:
//   records      `<kind>:<id>` -> {kind, id, fields: {<column>: value before}} (a column the record did not have: null)
//   assignments  `<module id>` -> the module's pages before, or null when it had none
//   slots        `<slot key>` -> the slot's value before; `removed`: the slots the run took out (no door puts one back)
//   identity     `<field>` -> the site identity value before
//   uploads      the paths the run uploaded that held no file before (no door deletes a file)
// A value before that names a text the revision holds is never kept: `HELD_BEFORE` stands in for it, and the restore
// stops on it (`restore_shows_held_text`). A record the run MADE needs nothing kept: it is every id of the run record
// the previous build did not have.
//
// 🔒 AN OWNER'S EDIT IS NEVER WRITTEN OVER. On the first touch of a place in a revision run, the value read is compared
// with what the previous build wrote there (`previousWrote`); another value was written outside Tracy since, and the
// run stops (`site_changed_outside`, noRerun, naming the place, never the text). A place this very run already touched
// (a resume after a crash) is in the journal and is not compared again.
import { createHash } from 'node:crypto'
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { namesAnyIn } from 'website-opportunities/domain/revision-text-forms.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The hash of a value a place holds: a missing value, a text, or any other value as JSON (`4000` and `"4000"` alike). */
export const valueHashOf = (value) =>
  createHash('sha256')
    .update(
      value === null || value === undefined
        ? '\u0000none'
        : typeof value === 'string'
          ? value
          : JSON.stringify(value)
    )
    .digest('hex')

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

/** The doors of any draft run, keeping the hash of each value written in `state.wrote`. */
export function wroteDoors(doors, record) {
  const wrote = (place, value) => {
    if (!record.state) return
    record.state.wrote ??= {}
    record.state.wrote[place] = valueHashOf(value)
  }
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

/**
 * The doors of a revision run, keeping the journal in `state.undo` and saving the record before each write.
 * @param {object} doors the site doors
 * @param {{state: object, save?: Function}} record the run record
 * @param {{previousWrote?: Record<string, string>, held?: string[]}} [options] `previousWrote`: the previous build's
 *   `state.wrote`; `held`: the texts the revision holds
 */
export function journaledDoors(doors, record, { previousWrote = {}, held = [] } = {}) {
  const undo = () => (record.state.undo ??= emptyUndo())
  const save = async () => record.save?.(record.state)
  /** The value kept for a place: the value, or the held stand in. */
  const keep = (value) => (held.length && value !== null && namesAnyIn(value, held) ? HELD_BEFORE : value)
  /** A place first touched: its value must still be what the previous build wrote (or what this run writes). */
  const check = (place, before, next) => {
    const was = previousWrote[place]
    if (!was || valueHashOf(before) === was || valueHashOf(before) === valueHashOf(next)) return
    throw new DraftWriteError(
      'site_changed_outside',
      `${place} holds another value than the previous build wrote: it was edited outside Tracy`,
      { place },
      { noRerun: true }
    )
  }
  async function keepRecord(kind, id, fields) {
    if (kind === 'moduleAssignment') {
      const key = String(id)
      if (Object.hasOwn(undo().assignments, key)) return
      let before = null
      let raw = null
      try {
        raw = (await doors.get({ kind, id })).menuids
        before = JSON.parse(raw)
      } catch (error) {
        if (error?.code !== 'NOT_FOUND') throw error
      }
      check(`assignment:${Number(id)}`, raw, fields?.menuids)
      undo().assignments[key] = before
      return save()
    }
    if (Number(id) === 0) return
    const key = `${kind}:${Number(id)}`
    const row = await doors.get({ kind, id })
    const kept = undo().records[key] ?? { kind, id: Number(id), fields: {} }
    let added = false
    for (const column of Object.keys(fields ?? {}))
      if (!Object.hasOwn(kept.fields, column)) {
        check(`record:${key}:${column}`, row[column] ?? null, fields[column])
        kept.fields[column] = keep(row[column] ?? null)
        added = true
      }
    undo().records[key] = kept
    if (added) return save()
  }
  return {
    ...doors,
    async update(call) {
      await keepRecord(call.kind, call.id, call.fields)
      return doors.update(call)
    },
    async contract(call) {
      const keys = [...Object.keys(call.changes ?? {}), ...list(call.removes)].filter(
        (k) => !Object.hasOwn(undo().slots, k)
      )
      if (keys.length) {
        const before = await doors.read({ slots: keys })
        for (const k of keys) check(`slot:${k}`, before[k] ?? null, call.changes?.[k] ?? null)
        for (const k of keys) undo().slots[k] = keep(before[k] ?? null)
      }
      for (const k of list(call.removes)) if (!undo().removed.includes(k)) undo().removed.push(k)
      if (keys.length || list(call.removes).length) await save()
      return doors.contract(call)
    },
    async identity(call) {
      const fields = Object.keys(call.fields ?? {}).filter((f) => !Object.hasOwn(undo().identity, f))
      if (fields.length) {
        const before = await doors.readIdentity()
        for (const f of fields) check(`identity:${f}`, before[f] ?? null, call.fields[f])
        for (const f of fields) undo().identity[f] = keep(before[f] ?? null)
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
