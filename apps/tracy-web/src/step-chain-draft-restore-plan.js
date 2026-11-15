// What the restore of a revision's build (#599, `step-chain-draft-restore.js`) must put back, and the checks it makes
// before it writes: the places of the undo journal, the stops for what no door undoes or what a hold forbids, and the
// check that a place still holds what the revision wrote (else it was edited outside Tracy: `restore_site_changed`).
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { heldFormsOf, namesAnyIn } from 'website-opportunities/domain/revision-text-forms.mjs'
import { placeHolds } from './step-chain-draft-place-value.js'
import { isHeldBefore } from './step-chain-draft-journal.js'
import { checkAct, HIDE_KINDS, hiddenColumnOf, madeKindOf } from './step-chain-draft-removal.js'
import { isBlankHolder } from './step-chain-draft-owned-keys.js'
import { ownerOverTaken } from './step-chain-draft-restore-taken.js'
import { holdsSent, holdsWrote } from './step-chain-draft-wrote.js'

const list = (value) => (Array.isArray(value) ? value : [])

/** What the restore of a revision's build must put back, or why it cannot. */
export function restorePlanOf(build) {
  const state = build?.write?.state
  if (!state?.undo || !Array.isArray(state.baseIds)) return { stop: 'restore_not_a_revision', places: [] }
  const { records, assignments, slots, removed, identity, uploads } = state.undo
  // A make sent by a run that crashed before it saved the made id (`pending`): no id to hide. A slot taken out: no door
  // puts it back (`contract.removes` is not available either way).
  const pending = Object.keys(state.pending ?? {})
  const { acts, unknown } = madeActsOf(state)
  if (pending.length || unknown.length || removed.length)
    return { stop: 'restore_needs_removal', made: [...unknown, ...pending], removed, places: [] }
  // A place the revision wrote over held a text the owner now keeps off the site: writing it back would show it again.
  const held = heldFormsOf(build.profile?.withheld)
  const before = [records, assignments, slots, identity]
  if (hasHeldMarker(before) || (held.length && namesAnyIn(before, held)))
    return { stop: 'restore_shows_held_text', places: [] }
  const places = [
    ...Object.entries(records).map(([key, r]) => ({ key: `record:${key}`, type: 'record', ...r })),
    ...Object.entries(assignments).map(([id, menuids]) => ({
      key: `assignment:${id}`,
      type: 'assignment',
      id,
      menuids
    })),
    ...(Object.keys(slots).length ? [{ key: 'slots', type: 'slots', slots }] : []),
    ...(Object.keys(identity).length ? [{ key: 'identity', type: 'identity', fields: identity }] : []),
    // Then the records the run made, hidden or put on no page (never deleted), then its files, deleted when unused.
    ...acts.filter((a) => a.type === 'hide' || !Object.hasOwn(assignments, String(a.id))),
    ...list(uploads).map((path) => ({
      key: `media:${path}`,
      type: 'media',
      path,
      mine: mineOf(acts, records, assignments)
    }))
  ]
  // A module with no pages before gets an empty list: no door deletes its assignment row (it shows on no page again).
  const unassigned = Object.entries(assignments)
    .filter(([, m]) => m === null)
    .map(([id]) => id)
  return {
    stop: null,
    places,
    left: { uploads: [], assignments: unassigned, hidden: acts.map((a) => a.key) }
  }
}

/**
 * The records this undo takes off the site, as a dry run names them (`kind:id`): the ones the run made (hidden or put
 * on no page) and the ones it showed again, written back hidden or on no page (`step-chain-draft-show-again.js`). A dry
 * run counts unpublished records too, so these naming a file do not keep it.
 */
function mineOf(acts, records, assignments) {
  const shown = Object.values(records)
    .filter(
      (r) => Number(r.fields?.[hiddenColumnOf(r.kind)]) === 0 && r.fields[hiddenColumnOf(r.kind)] !== null
    )
    .map((r) => `${r.kind}:${r.id}`)
  const none = Object.entries(assignments)
    .filter(([, m]) => list(m).length === 0)
    .map(([id]) => `module:${Number(id)}`)
  return [...acts.map((a) => `${a.kind}:${a.id}`), ...shown, ...none]
}

/** The records a run made (every id its record has that the build it started from had not): how each goes. */
function madeActsOf(state) {
  const base = new Set(state.baseIds)
  const acts = []
  const unknown = []
  for (const [key, id] of Object.entries(state.ids ?? {})) {
    if (base.has(key)) continue
    const kind = madeKindOf(key)
    if (kind === 'module')
      acts.push({ key: `unassign:${id}`, type: 'unassign', kind, id: Number(id), op: key })
    else if (HIDE_KINDS.has(kind))
      acts.push({ key: `hide:${kind}:${id}`, type: 'hide', kind, id: Number(id), op: key })
    else unknown.push(key)
  }
  return { acts, unknown }
}

/** Whether a journal holds the stand in of a held value anywhere. */
function hasHeldMarker(value) {
  if (isHeldBefore(value)) return true
  if (Array.isArray(value)) return value.some(hasHeldMarker)
  return Boolean(value && typeof value === 'object') && Object.values(value).some(hasHeldMarker)
}

/** What a place holds now, by the names `wroteDoors` gives: `{<place name>: [value now, value before]}`. */
async function heldNow(place, doors) {
  if (place.type === 'record') {
    const row = await doors.get({ kind: place.kind, id: place.id })
    return Object.fromEntries(
      Object.entries(place.fields).map(([c, v]) => [
        `record:${place.kind}:${place.id}:${c}`,
        [row[c] ?? null, v]
      ])
    )
  }
  if (place.type === 'assignment') {
    let now = null
    try {
      now = (await doors.get({ kind: 'moduleAssignment', id: Number(place.id) })).menuids
    } catch (error) {
      if (error?.code !== 'NOT_FOUND') throw error
    }
    return { [`assignment:${Number(place.id)}`]: [now, JSON.stringify(place.menuids ?? [])] }
  }
  if (place.type === 'slots') {
    const got = await doors.read({ slots: Object.keys(place.slots) })
    return Object.fromEntries(Object.entries(place.slots).map(([k, v]) => [`slot:${k}`, [got[k] ?? null, v]]))
  }
  const got = await doors.readIdentity()
  return Object.fromEntries(
    Object.entries(place.fields).map(([f, v]) => [`identity:${f}`, [got[f] ?? null, v]])
  )
}

/**
 * A place that holds neither what the run wrote (`state`: `{wrote, shapes}`) nor its value before was edited outside
 * Tracy: a typed stop (`code`: `restore_site_changed` for a restore, `site_changed_outside` for an abandon). So is a
 * place that holds what the run wrote but an owner's value at a JSON key the run took out (`ownerOverTaken`): writing
 * the key back would write over it.
 */
export async function checkUnchanged(place, doors, state, code = 'restore_site_changed') {
  if (place.type === 'media') return
  if (place.type === 'hide' || place.type === 'unassign')
    return checkAct({ ...place, door: place.type }, doors, [state], state.undo, code)
  for (const [name, [now, before]] of Object.entries(await heldNow(place, doors))) {
    if (placeHolds(name, before, now)) continue
    // A column the run emptied (`state.cleared`, claimed by no hash) must still be blank.
    const tracy = list(state.cleared).includes(name)
      ? isBlankHolder(now)
      : !state.wrote?.[name] || holdsWrote(name, now, state) || holdsSent(name, now, state.undo)
    if (tracy && !ownerOverTaken(name, now, state, before)) continue
    throw Object.assign(
      new DraftWriteError(
        code,
        `${name} was edited outside Tracy after the run wrote it`,
        { place: name },
        { noRerun: true }
      ),
      { report: { status: 'failed', restored: 0, changed: name } }
    )
  }
}
