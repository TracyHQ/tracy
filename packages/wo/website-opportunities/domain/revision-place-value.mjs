// How a revision compares what a place of the site holds with what a build wrote there (#599). A site may store a
// value in its own form: Joomla's Registry re-encodes a JSON column (key order, escaped slashes, spacing) and adds the
// keys it defaults, on Tracy's write and again on every save of the record by the owner. The write step's read back
// (`holds()` in `apps/tracy-web/src/step-chain-draft-write-check.js`, not exported) accepts that; every later
// comparison of a place mirrors exactly the tolerance of the read back of that place's kind, no looser:
//
//   record and module pages (`record:<kind>:<id>:<column>`, `assignment:<id>`)   the `holds` form: a value that starts
//     with `{` or `[` and parses is read as JSON; an object is compared on the keys Tracy wrote only (`shapeOf` the sent
//     value: a key the site or the owner adds is not seen), a list by its length and each element, any other value as
//     its text (`4000` and `"4000"` alike, a missing value and `""` alike); text that is not JSON exactly
//   contract slots (`slot:<key>`)   exactly, as `readContract` reads them (a removed slot reads null)
//   site identity (`identity:<field>`)   as text (`String(value ?? '')`), as `readIdentity` reads it
//
// So a site's own re-encoding is never taken for an owner's edit, and an owner's edit of a value Tracy wrote (a value
// inside the JSON, a word of a text) is. What no comparison sees: a key the owner adds to a JSON column by hand.
import { createHash } from 'node:crypto'

/** A text that reads as JSON, parsed; any other value as it is (the read back's `parsed`). */
function parsed(value) {
  if (typeof value !== 'string' || !/^\s*[[{]/.test(value)) return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/** The keys and list lengths of a sent value (sorted keys, `0` for a leaf): what the comparison looks at. */
export function shapeOf(value) {
  const a = parsed(value)
  if (Array.isArray(a)) return a.map(shapeOf)
  if (a && typeof a === 'object')
    return Object.fromEntries(
      Object.keys(a)
        .sort()
        .map((k) => [k, shapeOf(a[k])])
    )
  return 0
}

/** A value read in a shape: the leaves as text, a part that does not fit the shape as null. */
export function canonicalOf(value, shape = 0) {
  const b = parsed(value)
  if (Array.isArray(shape))
    return Array.isArray(b) && b.length === shape.length ? b.map((x, i) => canonicalOf(x, shape[i])) : null
  if (shape && typeof shape === 'object')
    return b && typeof b === 'object'
      ? Object.fromEntries(Object.keys(shape).map((k) => [k, canonicalOf(b[k], shape[k])]))
      : null
  return String(b ?? '')
}

/** The kind of comparison a place takes, by its name. */
export const placeKindOf = (place) =>
  place.startsWith('slot:') ? 'exact' : place.startsWith('identity:') ? 'text' : 'holds'

/** The shape kept for a place written with `value`: only a `holds` place with a JSON value has one, else null. */
export function placeShapeOf(place, value) {
  if (placeKindOf(place) !== 'holds') return null
  const shape = shapeOf(value)
  return shape === 0 ? null : shape
}

const sha = (text) => createHash('sha256').update(text).digest('hex')

/** The hash of what a place holds, in the form its kind compares (`shape`: the one `placeShapeOf` kept, or null). */
export function placeHashOf(place, value, shape = null) {
  const kind = placeKindOf(place)
  if (kind === 'exact')
    return sha(
      value === null || value === undefined
        ? '\u0000none'
        : typeof value === 'string'
          ? value
          : JSON.stringify(value)
    )
  if (kind === 'text') return sha(String(value ?? ''))
  return sha(JSON.stringify(canonicalOf(value, shape ?? 0)))
}

/** Whether `got` holds `sent` at a place, as the read back of that place's kind reads it. */
export const placeHolds = (place, sent, got) =>
  placeHashOf(place, got, placeShapeOf(place, sent)) === placeHashOf(place, sent, placeShapeOf(place, sent))
