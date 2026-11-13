// What the restore of a revision's build (#599, `step-chain-draft-restore.js`) must put back, and the checks it makes
// before it writes: the places of the undo journal, the stops for what no door undoes or what a hold forbids, and the
// check that a place still holds what the revision wrote (else it was edited outside Tracy: `restore_site_changed`).
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { heldFormsOf, namesAnyIn } from 'website-opportunities/domain/revision-text-forms.mjs'
import { isHeldBefore, valueHashOf } from './step-chain-draft-journal.js'

/** What the restore of a revision's build must put back, or why it cannot. */
export function restorePlanOf(build) {
  const state = build?.write?.state
  if (!state?.undo || !Array.isArray(state.baseIds)) return { stop: 'restore_not_a_revision', places: [] }
  const base = new Set(state.baseIds)
  const made = Object.keys(state.ids ?? {}).filter((k) => !base.has(k))
  const { records, assignments, slots, removed, identity, uploads } = state.undo
  if (made.length || removed.length) return { stop: 'restore_needs_removal', made, removed, places: [] }
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
    ...(Object.keys(identity).length ? [{ key: 'identity', type: 'identity', fields: identity }] : [])
  ]
  // A module with no pages before gets an empty list: no door deletes its assignment row (it shows on no page again).
  const unassigned = Object.entries(assignments)
    .filter(([, m]) => m === null)
    .map(([id]) => id)
  return { stop: null, places, left: { uploads: [...uploads], assignments: unassigned } }
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

/** A place that holds neither what the revision wrote nor its value before was edited outside Tracy: a typed stop. */
export async function checkUnchanged(place, doors, wrote) {
  for (const [name, [now, before]] of Object.entries(await heldNow(place, doors))) {
    const hash = valueHashOf(now)
    if (!wrote[name] || hash === wrote[name] || hash === valueHashOf(before)) continue
    throw Object.assign(
      new DraftWriteError(
        'restore_site_changed',
        `${name} was edited outside Tracy after the revision`,
        {
          place: name
        },
        { noRerun: true }
      ),
      { report: { status: 'failed', restored: 0, changed: name } }
    )
  }
}
