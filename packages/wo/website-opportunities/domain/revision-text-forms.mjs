// The text matching of a plan revision (ticket #599): whether a stored value names a text, on every leaf string of the
// value (an object's keys too), in every form a person or a browser reads it. Pure.
//
// A leaf is read in every plain form of the write guard's own helper (`plainFormsOf` of `draft-write-held.mjs`, #597:
// references read until stable, each percent run read, tags and markers out or read as a space, accents and zero width
// characters out, white space as one space). A text is matched as whole words in any case and accent, or in slug form
// (`namesHeldInAnyForm`). Unlike that helper's `leafStringsOf`, the leaves here include object keys and numbers: a
// record key or a path key can name a held person.
import { createHash } from 'node:crypto'
import { plainFormsOf } from './draft-write-held.mjs'
import { plainOf } from './draft-write-entities.mjs'
import { namesHeldInAnyForm } from './plan-withheld.mjs'

/** Every form of one text the matching reads. */
export const formsOf = (text) => plainFormsOf(text).filter((t) => t !== '')

/** Every leaf string of a value: strings, numbers as text, and the keys of its objects. */
export function leavesOf(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (typeof value === 'number' && Number.isFinite(value)) out.push(String(value))
  else if (Array.isArray(value)) for (const v of value) leavesOf(v, out)
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.push(k)
      leavesOf(v, out)
    }
  return out
}

/**
 * The held texts with the short forms a block renders a person by: a name of two words or more also as its first word
 * and the initial of its last (`Wenna C`), and as the initial of its first and its last word (`W Clout`), so a review
 * signed `Wenna C.` is held too. Used wherever a run keeps, writes back or reports a value.
 */
export function withShortForms(texts) {
  const out = new Set()
  for (const t of Array.isArray(texts) ? texts : []) {
    if (typeof t !== 'string' || !t.trim()) continue
    out.add(t)
    const words = plainOf(t).split(' ').filter(Boolean)
    if (words.length < 2) continue
    const [first, last] = [words[0], words.at(-1)]
    if (/^\p{L}/u.test(last)) out.add(`${first} ${last[0]}`)
    if (/^\p{L}/u.test(first)) out.add(`${first[0]} ${last}`)
  }
  return [...out]
}

/** Every held text of a profile's `withheld`, the people with their short forms, the held business name as it is. */
export const heldFormsOf = (withheld) => [
  ...withShortForms(Array.isArray(withheld?.people) ? withheld.people : []),
  ...(Array.isArray(withheld?.names) ? withheld.names : [])
]

/** The forms a text itself is matched by: as it is and as a person reads it. */
const needlesOf = (text) => [...new Set([String(text), plainOf(String(text))])].filter(Boolean)

/** The texts (of `texts`) any leaf of `value` names in any form. */
export function textsNamedIn(value, texts) {
  const list = (Array.isArray(texts) ? texts : []).filter((t) => typeof t === 'string' && t.trim())
  if (!list.length) return []
  const forms = leavesOf(value).flatMap(formsOf)
  return list.filter((t) => namesHeldInAnyForm(forms, needlesOf(t)))
}

/** Whether any leaf of `value` names any of `texts` in any form. */
export const namesAnyIn = (value, texts) => textsNamedIn(value, texts).length > 0

const short = (text) => createHash('sha256').update(String(text)).digest('hex').slice(0, 12)
/** The stand in for a string that names a held text: the same string gives the same stand in, never the text. */
export const maskedOf = (text) => `held:${short(text)}`

/**
 * A copy of a value with every leaf string (and object key) that names a held text replaced by its stand in, for what
 * a run records or reports (operation keys, refs, paths).
 */
export function maskHeld(value, held) {
  if (!Array.isArray(held) || held.length === 0) return value
  const one = (text) => (namesAnyIn(text, held) ? maskedOf(text) : text)
  const walk = (v) => {
    if (typeof v === 'string') return one(v)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [one(k), walk(x)]))
    return v
  }
  return walk(value)
}
