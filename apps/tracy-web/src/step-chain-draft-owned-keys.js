// A JSON column written over by a revision, a restore or an abandon (#599): only the keys Tracy owns change. A Joomla
// record keeps its settings as one JSON column (`attribs`, `images`, `params`), and the owner adds keys to it in the
// admin (a Joomla save adds its own too): the column is never sent whole. What the site holds now is the base; at every
// key Tracy owns (its shape, `shapeOf` of `step-chain-draft-place-value.js`), the value sent is set, an object inside
// both read the same way one level down; a key owned but no longer sent is taken out (a full build of the same plan
// would not write it); every other key, and everything inside a value Tracy wrote as an empty object, stays as the
// site holds it. A value that is not a JSON object on both sides is sent as it is.
//
// An object Tracy owned and no longer sends goes with only the keys Tracy owned in it: an owner key inside it stays. A
// list is written whole and taken out whole (its rows have no keys to merge by): when a row Tracy wrote holds a key
// Tracy never owned (the owner's, `ownerRowKeyUnder`), a revision stops `site_changed_outside` at that column, before
// its write, rather than lose the key, whether it still sends the list or no longer does. A restore and an abandon
// make the same check before their first write (`ownerInListRow` of `step-chain-draft-restore-taken.js`).
//
// A revision also guards the keys it did not own before (`before`: the shape the previous build, or this run before a
// crash, wrote there): such a key the site already holds with another value is a value the owner set, and writing over
// it is an edit outside Tracy (`site_changed_outside`), as it is for any value Tracy wrote. A blank holder there (an
// empty text, null, an empty object or list: what a site stores for a field nobody filled, as an admin save does) is
// not an owner's value.
import { canonicalOf as parsed, columnHolds } from './step-chain-draft-write-check.js'

const isPlain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
/** The plain object a column holds (a JSON text or an object), else null. */
const objectOf = (value) => {
  const v = parsed(value)
  return isPlain(v) ? v : null
}
const same = (a, b) => columnHolds(a, b) && columnHolds(b, a)

/** Whether a value is a blank holder: an empty text, null, an empty object or an empty list (as JSON text too). */
export function isBlankHolder(value) {
  const v = typeof value === 'string' && value.trim() !== '' ? parsed(value) : value
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return isPlain(v) && Object.keys(v).length === 0
}

/** The shape owned one level down: an object shape as it is, a leaf owned whole (no guard), else none owned. */
const inner = (before, key) => {
  if (before === null) return null
  const at = before[key]
  return isPlain(at) ? at : at === 0 ? null : {}
}

/**
 * `now` with the owned keys (`owned`, a shape) set from `sent` and every other key kept, in the order of `sent` and
 * then the other keys `now` holds (a restore puts a column back as it was, key for key); a key owned but missing from
 * `sent` is taken out, its path pushed to `taken`. Returns null when the revision would write over a key it did not
 * own (`before`) that holds an owner's value, else the value.
 */
function overOwned(now, sent, owned, before, taken, path = []) {
  const out = {}
  for (const key of new Set([...Object.keys(sent), ...Object.keys(now)])) {
    if (!Object.hasOwn(owned, key)) {
      if (Object.hasOwn(now, key)) out[key] = now[key]
      continue
    }
    const shape = owned[key]
    if (!Object.hasOwn(sent, key)) {
      // A list taken out with an owner's key in one of its rows (at any depth): taking it out would lose that key.
      if (before !== null && ownerRowKeyUnder(now[key], shape)) return null
      // An object taken out whole: only the keys Tracy owned in it go, the owner's beside them stay.
      const rest = isPlain(shape) && isPlain(now[key]) ? overOwned(now[key], {}, shape, null, [], []) : {}
      if (Object.keys(rest).length) out[key] = rest
      taken.push([...path, key])
      continue
    }
    if (isPlain(shape) && isPlain(sent[key]) && isPlain(now[key])) {
      const deeper = overOwned(now[key], sent[key], shape, inner(before, key), taken, [...path, key])
      if (deeper === null) return null
      out[key] = deeper
      continue
    }
    // A list whose rows hold keys Tracy never owned (an owner's): a row cannot be merged by key, so a revision stops.
    if (before !== null && Array.isArray(now[key]) && ownerKeysIn(now[key], shape)) return null
    const ownedBefore = before === null || Object.hasOwn(before, key)
    const ownerValue = Object.hasOwn(now, key) && !same(now[key], sent[key]) && !isBlankHolder(now[key])
    if (!ownedBefore && ownerValue) return null
    out[key] = sent[key]
  }
  return out
}

/** Whether a list holds, in a row Tracy wrote, a key its shape does not own (at any depth). */
function ownerKeysIn(value, shape) {
  if (Array.isArray(value) && Array.isArray(shape))
    return value.some((row, i) => shape[i] !== undefined && ownerKeysIn(row, shape[i]))
  if (!isPlain(value) || !isPlain(shape)) return false
  return Object.keys(value).some((k) => !Object.hasOwn(shape, k) || ownerKeysIn(value[k], shape[k]))
}

/**
 * Whether a value holds, inside a row of a list Tracy wrote (reached through the keys its shape owns), a key the shape
 * does not own: the owner's, which writing or taking out the list whole would lose.
 */
export function ownerRowKeyUnder(value, shape) {
  const v = parsed(value)
  if (Array.isArray(v)) return ownerKeysIn(v, shape)
  if (!isPlain(v) || !isPlain(shape)) return false
  return Object.keys(shape).some((k) => Object.hasOwn(v, k) && ownerRowKeyUnder(v[k], shape[k]))
}

/** Every key of two shapes (a key in either), an object at both sides joined one level down. */
export function shapeUnion(a, b) {
  if (!isPlain(a)) return isPlain(b) ? b : (a ?? b ?? null)
  if (!isPlain(b)) return a
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = Object.hasOwn(out, k) ? shapeUnion(out[k], v) : v
  return out
}

/**
 * The value to send to a JSON column so only the owned keys change.
 * @param {unknown} now what the site holds there now
 * @param {unknown} sent the value meant (a JSON text or an object)
 * @param {object|null} owned the shape of the keys owned (`shapeOf`; a revision passes what it sends joined with
 *   what the previous build owned there), null to send `sent` as it is
 * @param {object|null} [before] a revision's guard: the shape owned before (null: no guard)
 * @returns {{value: unknown, overOwner: boolean, taken: string[][]}} `value`: the text to send (`sent` itself when
 *   nothing is merged); `overOwner`: the revision would write over a key the owner set; `taken`: the paths of the
 *   owned keys the site holds that `sent` no longer has (taken out)
 */
export function ownedColumnOf(now, sent, owned, before = null) {
  const site = objectOf(now)
  const meant = objectOf(sent)
  if (!site || !meant || !isPlain(owned)) return { value: sent, overOwner: false, taken: [] }
  const guard = before === null || before === undefined ? null : isPlain(before) ? before : {}
  const taken = []
  const out = overOwned(site, meant, owned, guard, taken)
  if (out === null) return { value: sent, overOwner: true, taken: [] }
  return { value: JSON.stringify(out), overOwner: false, taken }
}
