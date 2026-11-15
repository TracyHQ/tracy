// What a restore or an abandon (#599) checks before it writes back a JSON key the revision took out of a record's
// column (`undo.prior`, the shape the build before it owned there): the site must hold, at that key, what the revision
// left (the key absent, or a blank holder: an empty text, null, an empty object or list, as an admin save stores a field
// nobody filled), or the very value it held before the run (a site that puts its own default back on save). Any other
// value is the owner's, set since: writing the key back would write over it, so the restore
// stops (`restore_site_changed`, the abandon `site_changed_outside`) before any write, as for an owned key edited.
import { isBlankHolder } from './step-chain-draft-owned-keys.js'
import { shapedOf } from './step-chain-draft-place-value.js'
import { canonicalOf } from './step-chain-draft-write-check.js'

const isPlain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** The paths of `prior` (a shape) that `now` (the run's own shape there) does not have: the keys taken out. */
export function takenPathsOf(prior, now, path = []) {
  if (!isPlain(prior)) return []
  const out = []
  for (const [key, shape] of Object.entries(prior)) {
    if (!isPlain(now) || !Object.hasOwn(now, key)) out.push([...path, key])
    else if (isPlain(shape) && isPlain(now[key])) out.push(...takenPathsOf(shape, now[key], [...path, key]))
  }
  return out
}

/** Two leaves alike as the read back reads them (`4000` and `"4000"` alike). */
const same = (a, b) => JSON.stringify(shapedOf(a)) === JSON.stringify(shapedOf(b))

/** The value at a path of a JSON value, `undefined` when a step is missing. */
function valueAt(value, path) {
  let at = canonicalOf(value)
  for (const key of path) {
    if (!isPlain(at) || !Object.hasOwn(at, key)) return undefined
    at = canonicalOf(at[key])
  }
  return at
}

/**
 * Whether the site holds an owner's value at a key the run took out of a place (`state.undo.prior[place]` against
 * `state.shapes[place]`) that is not the value it held there before (`before`, the column before the run: writing it
 * back changes nothing at that key, as when the site itself puts its default back there).
 * @param {string} place a place name (`record:<kind>:<id>:<column>`)
 * @param {unknown} now what the site holds there
 * @param {unknown} before what the column held before the run (the journal's value)
 * @param {{shapes?: object, undo?: {prior?: object}}} state the run's record state
 */
export function ownerOverTaken(place, now, state, before) {
  const prior = state?.undo?.prior?.[place]
  if (!isPlain(prior)) return false
  return takenPathsOf(prior, state?.shapes?.[place] ?? null).some((path) => {
    const at = valueAt(now, path)
    return !isBlankHolder(at) && !same(at, valueAt(before, path))
  })
}
