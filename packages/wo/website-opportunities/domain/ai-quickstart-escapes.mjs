// The print side escaping of every place a build writes (`escapes` of the mapping file). Pure. Called by
// `mappingProblems` (`ai-quickstart-mapping.mjs`).
//
// `escapes: {why, legacyReferences: {rule, why}, places: [entry]}`, an entry
// `{match, escaped, unsafe?, doorRefuses?, prints?, source, why}`:
//   match        the places it is for: `kind` and `column`, and any of `nestedJson`, `key`, `block`, `menutype`
//                (`ai-quickstart-escapes-places.mjs`). A place takes the entry that matches it with the most keys;
//   escaped      `false`: every print outputs the stored value as HTML (the build escapes the words itself);
//                `true`: every print escapes it (the build writes plain words, never escaped);
//                `"mixed"`: some prints output it as HTML, some escape it (the build writes neither markup nor an
//                escape: the characters of `unsafe` are left out or replaced);
//                `"not-printed"`: no page prints it; `"not-text"`: a value with no words (a number, an id, a
//                setting, a class, a style); `"not-written"`: the build never writes it (an unbuilt page type, a
//                place the mapping keeps by decision);
//   unsafe       for `true` and `"mixed"`: the characters some print does not show as written (`"`, `'`, `<`, `>`,
//                `&`, `reference` for a character reference, `((` for a JA ACM marker); a `"mixed"` entry names at
//                least `<`, `>`, `&` and `reference`, which no value can make read the same printed raw and escaped;
//   doorRefuses  the characters the door refuses at the place (the blank site contract), when it refuses some;
//   prints       where it prints and how (for a reader); source `measured` or `template-source`.
// The check: every place the build writes takes exactly one entry, every entry is taken by at least one place.
import { writtenPlacesOf } from './ai-quickstart-escapes-places.mjs'

export const ESCAPED_VALUES = Object.freeze([true, false, 'mixed', 'not-printed', 'not-text', 'not-written'])
export const UNSAFE_MARKS = Object.freeze(['"', "'", '<', '>', '&', 'reference', '(('])
export const MIXED_UNSAFE = Object.freeze(['<', '>', '&', 'reference'])
export const MATCH_KEYS = Object.freeze(['kind', 'column', 'nestedJson', 'key', 'block', 'menutype'])
export const ESCAPE_SOURCES = Object.freeze(['measured', 'template-source', 'decision'])

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const each = (value) => (Array.isArray(value) ? value : [])

const matches = (match, place) => isObject(match) && Object.entries(match).every(([k, v]) => place[k] === v)

/** The entries a place takes: those whose match has the most keys among the ones that match it. */
function bestOf(entries, place) {
  const found = entries.filter((e) => matches(e.entry.match, place))
  const most = Math.max(0, ...found.map((e) => Object.keys(e.entry.match).length))
  return found.filter((e) => Object.keys(e.entry.match).length === most)
}

/**
 * The escaping entry of a place (`ai-quickstart-escapes-places.mjs` `placeOf`), or null when none or two match:
 * how the build reads the declaration for a value it writes.
 */
export function escapeOf(mapping, place) {
  const entries = each(mapping?.escapes?.places).map((entry, i) => ({ entry, i }))
  const best = bestOf(entries, place)
  return best.length === 1 ? best[0].entry : null
}

function entryProblems(entry, at, report) {
  if (!isObject(entry)) return report(at, 'an escapes entry is {match, escaped, source, why}')
  const match = entry.match
  if (!isObject(match) || !isName(match.kind) || !isName(match.column))
    report(`${at}.match`, 'match names at least the record kind and column of the places')
  else
    for (const k of Object.keys(match))
      if (!MATCH_KEYS.includes(k))
        report(`${at}.match.${k}`, `a match key is one of ${MATCH_KEYS.join(', ')}`)
  if (!ESCAPED_VALUES.includes(entry.escaped))
    report(`${at}.escaped`, `escaped is one of ${ESCAPED_VALUES.map((v) => JSON.stringify(v)).join(', ')}`)
  const unsafe = entry.unsafe
  if (unsafe !== undefined && (!Array.isArray(unsafe) || !unsafe.every((m) => UNSAFE_MARKS.includes(m))))
    report(`${at}.unsafe`, `unsafe lists marks of ${UNSAFE_MARKS.join(' ')}`)
  if ((entry.escaped === true || entry.escaped === 'mixed') && !Array.isArray(unsafe))
    report(
      `${at}.unsafe`,
      'an escaped or mixed place lists what it does not show as written (unsafe, may be [])'
    )
  if (entry.escaped === 'mixed' && Array.isArray(unsafe))
    for (const m of MIXED_UNSAFE)
      if (!unsafe.includes(m))
        report(`${at}.unsafe`, `a mixed place cannot show ${m} as written both raw and escaped: list it`)
  if (entry.escaped === false && Array.isArray(unsafe) && unsafe.length)
    report(`${at}.unsafe`, 'a place printed raw shows every character once the build escapes it: no unsafe')
  const refuses = entry.doorRefuses
  if (refuses !== undefined && (!Array.isArray(refuses) || !refuses.every((m) => UNSAFE_MARKS.includes(m))))
    report(`${at}.doorRefuses`, `doorRefuses lists marks of ${UNSAFE_MARKS.join(' ')}`)
  if (!ESCAPE_SOURCES.includes(entry.source))
    report(`${at}.source`, `source is one of ${ESCAPE_SOURCES.join(', ')}`)
  if (!isName(entry.why)) report(`${at}.why`, 'say why: what was measured or read')
}

/** Every problem of the `escapes` declaration of a mapping file. */
export function escapesProblems(mapping, report) {
  const e = mapping.escapes
  if (!isObject(e))
    return report('escapes', 'declare how every place the build writes is escaped where it prints: escapes')
  if (!isName(e.why)) report('escapes.why', 'say how the escaping was measured')
  if (!isObject(e.legacyReferences) || !isName(e.legacyReferences.rule) || !isName(e.legacyReferences.why))
    report(
      'escapes.legacyReferences',
      'declare the rule for a legacy reference without its semicolon: {rule, why}'
    )
  if (!Array.isArray(e.places)) return report('escapes.places', 'places is a list of entries')
  e.places.forEach((entry, i) => entryProblems(entry, `escapes.places[${i}]`, report))
  const entries = e.places.map((entry, i) => ({ entry, i })).filter(({ entry }) => isObject(entry?.match))
  const seen = new Set(
    entries
      .map(({ entry }) => JSON.stringify(Object.entries(entry.match).sort()))
      .filter((k, i, all) => all.indexOf(k) !== i)
  )
  for (const k of seen) report('escapes.places', `two entries match the same places: ${k}`)
  const taken = new Set()
  for (const { at, place } of writtenPlacesOf(mapping)) {
    const best = bestOf(entries, place)
    if (best.length === 0)
      report(at, `no escapes entry matches the place ${JSON.stringify(place)}: declare how it prints`)
    else if (best.length > 1)
      report(at, `escapes entries ${best.map((b) => b.i).join(' and ')} match ${JSON.stringify(place)} alike`)
    else taken.add(best[0].i)
  }
  for (const { i } of entries)
    if (!taken.has(i)) report(`escapes.places[${i}]`, 'no place the build writes takes this entry')
}
