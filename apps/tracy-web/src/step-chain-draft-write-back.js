// The write back of a restore or an abandon (#599), split from `step-chain-draft-restore.js`: every place of a run's
// undo journal written back once and read back, each first checked for an edit made outside Tracy. A JSON column is
// written only at the keys the run owned there: the shape it wrote (`state.shapes`), the earlier values it sent
// (`undo.sent`) and the shape the build before it owned (`undo.prior`), so a key the revision took out comes back
// exactly and a key the owner added since stays.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { ownedColumnOf, shapeUnion } from './step-chain-draft-owned-keys.js'
import { placeHolds } from './step-chain-draft-place-value.js'
import { deleteUpload, undoAct } from './step-chain-draft-removal-run.js'
import { checkUnchanged } from './step-chain-draft-restore-plan.js'

const list = (value) => (Array.isArray(value) ? value : [])

const ATTEMPTS = 2

const mismatch = (place) =>
  new DraftWriteError('read_back_mismatch', `${place.key} reads another value after the restore`, {
    place: place.key
  })

/**
 * The columns of a record written back: a JSON column only at the keys the run owned (its shapes, those of the
 * earlier values it sent there, and those the build before it owned), over what the site holds now.
 */
async function ownedFieldsOf(place, doors, state) {
  const row = await doors.get({ kind: place.kind, id: place.id })
  const out = {}
  for (const [column, value] of Object.entries(place.fields)) {
    const name = `record:${place.kind}:${place.id}:${column}`
    const owned = [
      state?.shapes?.[name],
      ...list(state?.undo?.sent?.[name]).map(([, shape]) => shape),
      state?.undo?.prior?.[name]
    ]
      .filter(Boolean)
      .reduce((a, b) => shapeUnion(a, b), null)
    out[column] = ownedColumnOf(row[column] ?? null, value, owned).value
  }
  return out
}

/** One place written back and read back; a record the run made hidden; a file it uploaded deleted when unused. */
async function restorePlace(place, doors, applyId, state, record) {
  if (place.type === 'hide' || place.type === 'unassign') return undoAct(place, doors, applyId)
  if (place.type === 'media') return deleteUpload(place, doors, applyId, (record.state.left ??= []))
  if (place.type === 'record') {
    const fields = await ownedFieldsOf(place, doors, state)
    await doors.update({ applyId, kind: place.kind, id: place.id, fields })
    const row = await doors.get({ kind: place.kind, id: place.id })
    for (const [column, value] of Object.entries(fields))
      if (!placeHolds(`record:${place.kind}:${place.id}:${column}`, value, row[column] ?? null))
        throw mismatch(place)
  } else if (place.type === 'assignment') {
    // A module with no pages before is set to none: Joomla shows a module with no assignment row on no page.
    const menuids = JSON.stringify(place.menuids ?? [])
    await doors.update({ applyId, kind: 'moduleAssignment', id: Number(place.id), fields: { menuids } })
    const got = (await doors.get({ kind: 'moduleAssignment', id: Number(place.id) })).menuids
    if (!placeHolds(`assignment:${Number(place.id)}`, menuids, got)) throw mismatch(place)
  } else if (place.type === 'slots') {
    const { revision } = await doors.inspect()
    await doors.contract({ applyId, expectedRevision: revision, changes: place.slots, removes: [] })
    const got = await doors.read({ slots: Object.keys(place.slots) })
    for (const [key, value] of Object.entries(place.slots)) if (got[key] !== value) throw mismatch(place)
  } else {
    await doors.identity({ applyId, fields: place.fields })
    const got = await doors.readIdentity()
    for (const [key, value] of Object.entries(place.fields))
      if (!placeHolds(`identity:${key}`, value, got[key] ?? null)) throw mismatch(place)
  }
}

/**
 * Every place written back once and read back, all checked before the first write, and each again right before it is
 * written, for an edit made outside Tracy (`state`: the run's
 * `{wrote, shapes}`; `changed`: the code of that stop), the done places kept in `record.state.done` so a crashed write
 * back resumes; a failing place is tried twice, then `failed` (noRerun).
 */
export async function writeBack({ places, doors, record, state, applyId, failed, changed }) {
  // Every place checked before the first write: an edit outside Tracy at any of them stops with nothing written.
  for (const place of places)
    if (!record.state.done.includes(place.key)) await checkUnchanged(place, doors, state, changed)
  for (const place of places) {
    if (record.state.done.includes(place.key)) continue
    await checkUnchanged(place, doors, state, changed)
    for (let attempt = 1; ; attempt++) {
      try {
        await restorePlace(place, doors, applyId(place), state, record)
        break
      } catch (error) {
        if (error?.fatal) throw error
        if (attempt >= ATTEMPTS)
          throw new DraftWriteError(
            failed,
            `${place.key} failed ${attempt} time(s)`,
            {
              place: place.key,
              cause: error?.code ?? null
            },
            { noRerun: true }
          )
      }
    }
    record.state.done.push(place.key)
    await record.save?.(record.state)
  }
}
