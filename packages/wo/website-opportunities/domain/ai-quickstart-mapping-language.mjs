// The language overrides of an AI quickstart mapping file (`overrides.language`, ticket #587). Pure. Called by
// `overridesProblems` (`ai-quickstart-mapping.mjs`).
//
// An entry names one language key of one extension and language, and says where its words come from: a string
// `value`, the block fields it is `filledBy`, or `keep` with the reason the template's words stay. The shape is
// closed: `key`, `extension`, `language`, `slot`, `value`, `filledBy`, `limit`, `keep`, `notFact`, `why`.
//   - An entry with a `slot` is a template language string of the content map (the draft writes it from the draft
//     report, its keep led by the class it was given, such as "not-drawn: ..." or "kept: ...").
//   - An entry with no `slot` is a string of the platform or an extension (a Joomla core string, a component's
//     form label). The kit declares one only because a page prints it, so its keep says what prints it: a keep that
//     says no page draws it is refused (the release gate turns such a reason into kit_reason_false wherever the
//     string shows).
// One entry per key and language.

const KEYS = Object.freeze([
  'key',
  'extension',
  'language',
  'slot',
  'value',
  'filledBy',
  'limit',
  'keep',
  'notFact',
  'why'
])
const LANGUAGE = /^[a-z]{2,3}-[A-Z]{2}$/
const KEY = /^[A-Z][A-Z0-9_]*$/
// The words of a reason that says the string is not on any page: the same reading as the release gate's.
export const NOT_DRAWN_REASON = /\bnot[- ]drawn\b|no (?:kit )?page draws it|not drawn as visible text/i

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''

/** What is wrong with the reason of one kept entry: empty, only the key, or "no page draws it" for a platform key. */
function keepProblem(entry) {
  const keep = String(entry.keep).trim()
  const bare = keep
    .replace(/^[a-z-]+:\s*/, '')
    .replace(entry.key, '')
    .replace(/[()\s:.,]/g, '')
  if (bare.length < 12) return 'keep says why the words stay: what prints them and why they suit every site'
  if (!isName(entry.slot) && NOT_DRAWN_REASON.test(keep))
    return 'a platform string is declared because a page prints it: say what prints it, not that no page draws it'
  return null
}

/** Every problem of `overrides.language`. */
export function languageOverrideProblems(entries, report) {
  if (entries === undefined) return
  if (!Array.isArray(entries)) return report('overrides.language', 'overrides.language must be a list')
  const seen = new Set()
  entries.forEach((entry, i) => {
    const at = `overrides.language[${i}]`
    if (!isObject(entry) || !isName(entry.key))
      return report(at, 'a language override is {key, extension, language, value | filledBy | keep}')
    for (const k of Object.keys(entry))
      if (!KEYS.includes(k))
        report(`${at}.${k}`, `"${k}" is no key of a language override: ${KEYS.join(', ')}`)
    if (!KEY.test(entry.key))
      report(`${at}.key`, 'a language key is upper case: letters, digits, underscores')
    if (!isName(entry.extension))
      report(
        `${at}.extension`,
        'name the extension whose language file holds the key (e.g. com_content, joomla)'
      )
    if (!LANGUAGE.test(String(entry.language))) report(`${at}.language`, 'the language tag, such as en-GB')
    const id = `${entry.key}|${entry.language}`
    if (seen.has(id)) report(at, `${entry.key} (${entry.language}) is declared twice: one entry per key`)
    seen.add(id)
    const filled = Array.isArray(entry.filledBy) && entry.filledBy.length > 0
    const sources = [typeof entry.value === 'string', filled, entry.keep !== undefined].filter(Boolean)
    // One source only: the build cannot both keep the template's words and write others.
    if (sources.length !== 1)
      return report(
        at,
        'a language override needs its value source: a string value, the fields it is filledBy, or keep with the reason'
      )
    if (entry.keep !== undefined) {
      const problem = isName(entry.keep) ? keepProblem(entry) : 'keep says why the words stay'
      if (problem) report(`${at}.keep`, problem)
    }
    if (typeof entry.value === 'string' && !isName(entry.why))
      report(`${at}.why`, 'say why the key is written with this value')
  })
}
