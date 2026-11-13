// The undo journal of a revision run (#599): before any door call of the run writes over a place of the site, what that
// place held is read and kept in the run record (`state.undo`), saved BEFORE the call, first value kept: a place
// written twice in one run, or again after a crash and resume, keeps what the previous build left there. The restore
// (`step-chain-draft-restore.js`) writes these values back. Kept per place:
//   records      `<kind>:<id>` -> {kind, id, fields: {<column>: value before}} (a column the record did not have: null)
//   assignments  `<module id>` -> the module's pages before, or null when it had none
//   slots        `<slot key>` -> the slot's value before; `removed`: the slots the run took out (no door puts one back)
//   identity     `<field>` -> the site identity value before
//   uploads      the paths the run uploaded that held no file before (no door deletes a file)
// A record the run MADE needs nothing kept: it is every id of the run record the previous build did not have.
const list = (value) => (Array.isArray(value) ? value : [])

/** An empty journal. */
export const emptyUndo = () => ({
  records: {},
  assignments: {},
  slots: {},
  removed: [],
  identity: {},
  uploads: []
})

/**
 * The doors of a revision run, keeping the journal in `state.undo` and saving the record before each write.
 * @param {object} doors the site doors
 * @param {{state: object, save?: Function}} record the run record
 */
export function journaledDoors(doors, record) {
  const undo = () => (record.state.undo ??= emptyUndo())
  const save = async () => record.save?.(record.state)
  async function keepRecord(kind, id, fields) {
    if (kind === 'moduleAssignment') {
      const key = String(id)
      if (Object.hasOwn(undo().assignments, key)) return
      let before = null
      try {
        before = JSON.parse((await doors.get({ kind, id })).menuids)
      } catch (error) {
        if (error?.code !== 'NOT_FOUND') throw error
      }
      undo().assignments[key] = before
      return save()
    }
    if (Number(id) === 0) return
    const key = `${kind}:${Number(id)}`
    const row = await doors.get({ kind, id })
    const kept = (undo().records[key] ??= { kind, id: Number(id), fields: {} })
    let added = false
    for (const column of Object.keys(fields ?? {}))
      if (!Object.hasOwn(kept.fields, column)) {
        kept.fields[column] = row[column] ?? null
        added = true
      }
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
        for (const k of keys) undo().slots[k] = before[k] ?? null
      }
      for (const k of list(call.removes)) if (!undo().removed.includes(k)) undo().removed.push(k)
      if (keys.length || list(call.removes).length) await save()
      return doors.contract(call)
    },
    async identity(call) {
      const fields = Object.keys(call.fields ?? {}).filter((f) => !Object.hasOwn(undo().identity, f))
      if (fields.length) {
        const before = await doors.readIdentity()
        for (const f of fields) undo().identity[f] = before[f] ?? null
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
