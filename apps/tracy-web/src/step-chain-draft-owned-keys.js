// A JSON column written over by a revision, a restore or an abandon (#599): only the keys Tracy owns change. A Joomla
// record keeps its settings as one JSON column (`attribs`, `images`, `params`), and the owner adds keys to it in the
// admin (a Joomla save adds its own too): the column is never sent whole. What the site holds now is the base; at every
// key Tracy owns (its shape, `shapeOf` of `step-chain-draft-place-value.js`), the value sent is set, an object inside
// both read the same way one level down; every other key, and everything inside a value Tracy wrote as an empty
// object, stays as the site holds it. A value that is not a JSON object on both sides is sent as it is.
//
// A revision also guards the keys it did not own before (`before`: the shape the previous build, or this run before a
// crash, wrote there): such a key the site already holds with another value is a value the owner set, and writing over
// it is an edit outside Tracy (`site_changed_outside`), as it is for any value Tracy wrote.
import { canonicalOf as parsed, columnHolds } from './step-chain-draft-write-check.js'

const isPlain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
/** The plain object a column holds (a JSON text or an object), else null. */
const objectOf = (value) => {
  const v = parsed(value)
  return isPlain(v) ? v : null
}
const same = (a, b) => columnHolds(a, b) && columnHolds(b, a)

/** The shape owned one level down: an object shape as it is, a leaf owned whole (no guard), else none owned. */
const inner = (before, key) => {
  if (before === null) return null
  const at = before[key]
  return isPlain(at) ? at : at === 0 ? null : {}
}

/**
 * `now` with the owned keys (`owned`, a shape) set from `sent` and every other key kept; a key owned but missing from
 * `sent` is taken out. Returns null when the revision would write over a key it did not own (`before`), else the value.
 */
function overOwned(now, sent, owned, before) {
  const out = { ...now }
  for (const [key, shape] of Object.entries(owned)) {
    if (!Object.hasOwn(sent, key)) {
      delete out[key]
      continue
    }
    if (isPlain(shape) && isPlain(sent[key]) && isPlain(now[key])) {
      const deeper = overOwned(now[key], sent[key], shape, inner(before, key))
      if (deeper === null) return null
      out[key] = deeper
      continue
    }
    const ownedBefore = before === null || Object.hasOwn(before, key)
    if (!ownedBefore && Object.hasOwn(now, key) && !same(now[key], sent[key])) return null
    out[key] = sent[key]
  }
  return out
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
 * @param {object|null} owned the shape of the keys owned (`shapeOf`), null to send `sent` as it is
 * @param {object|null} [before] a revision's guard: the shape owned before (null: no guard)
 * @returns {{value: unknown, overOwner: boolean}} `value`: the text to send (`sent` itself when nothing is merged);
 *   `overOwner`: the revision would write over a key the owner set
 */
export function ownedColumnOf(now, sent, owned, before = null) {
  const site = objectOf(now)
  const meant = objectOf(sent)
  if (!site || !meant || !isPlain(owned)) return { value: sent, overOwner: false }
  const guard = before === null || before === undefined ? null : isPlain(before) ? before : {}
  const out = overOwned(site, meant, owned, guard)
  if (out === null) return { value: sent, overOwner: true }
  return { value: JSON.stringify(out), overOwner: false }
}
