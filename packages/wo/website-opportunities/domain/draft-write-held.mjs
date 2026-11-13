// Whether a held text (a held person, the held business name) appears in one leaf string of whatever a build writes or
// keeps, in any plain form (ticket #597): as written; with its entities read until the text stops changing (bounded,
// so `O&amp;#39;Neill` is `O'Neill`); with its percent escapes read (`Siobhan%20O%27Neill`, `siobhan%2Do%2Dneill`,
// a `+` as a space in a query); each also as a person reads it (`plainOf`: tags and markers as a space or as nothing,
// accents and zero width characters out, white space as one space). A held text is matched as whole words or in slug
// form (`namesHeldInAnyForm`: `pellam-orrick`, `PellamOrrick`). The write guard reads every value of a write plan
// with it; the restore and the revision impact (#599) read the same helper. Not matched: a name written in other
// letters that look alike (a Cyrillic `o`), in another order, or by its initials. Pure.
import { decodeEntities, plainOf } from './draft-write-entities.mjs'
import { namesHeldInAnyForm } from './plan-withheld.mjs'

/** How many times references are read again: deeper nesting than this is no plausible text. */
const ROUNDS = 4

function untilStable(text, read) {
  let out = text
  for (let n = 0; n < ROUNDS; n++) {
    const next = read(out)
    if (next === out) break
    out = next
  }
  return out
}
/** Every run of valid percent escapes read; an invalid run (`50% off`, a lone byte) stays as written. */
const percentRead = (text) =>
  text.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run)
    } catch {
      return run
    }
  })

/** The plain forms of one string a held text is looked for in. */
export function plainFormsOf(text) {
  const raw = String(text)
  const decoded = untilStable(raw, (t) => decodeEntities(t))
  const both = untilStable(decoded, (t) => decodeEntities(percentRead(t)))
  const base = [raw, decoded, both, both.replace(/\+/g, ' ')]
  return [...new Set(base.flatMap((f) => [f, plainOf(f), plainOf(f, { joined: true })]))]
}

/**
 * Whether any held text appears in a leaf string, in any plain form.
 * @param {string} text one leaf string (a value, an address, an alt text, a stored column)
 * @param {string[]} heldTexts the held texts (`heldTextsOf(withheld)`)
 */
export function heldInLeaf(text, heldTexts) {
  if (typeof text !== 'string' || !Array.isArray(heldTexts) || heldTexts.length === 0) return false
  const held = [
    ...new Set(heldTexts.filter((t) => typeof t === 'string' && t.trim()).flatMap((t) => [t, plainOf(t)]))
  ]
  return held.length > 0 && namesHeldInAnyForm(plainFormsOf(text), held)
}

/** Every string inside a value (object keys left out), at most `depth` levels deep. */
export function leafStringsOf(value, depth = 12) {
  const out = []
  const walk = (v, d) => {
    if (typeof v === 'string') out.push(v)
    else if (v && typeof v === 'object' && d < depth) for (const inner of Object.values(v)) walk(inner, d + 1)
  }
  walk(value, 0)
  return out
}
