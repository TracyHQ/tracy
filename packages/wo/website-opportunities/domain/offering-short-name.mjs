// An offering's name in a box too narrow for the brief's label (COO decision, spec TracyHQ/tracy#189 item 30): the site
// refuses words over a slot's measured box (`SlotFit.php`: "Content too long for its box"), and a refused name kept the
// template's demo name on the card, its page and every menu that mirrors it. Measured 29/10/2026 on a local brief build: a
// fourth offering of 20 characters for a box of 15 was refused, and the club's site named the demo's class instead.
//
// 🔒 A SHORTER NAME IS THE BRIEF'S OWN WORDS, NEVER AN INVENTION. A name is a hard fact: its short form is a run of the
// label's own words that ends on the word the name is about (the last word before a "for", "with", "of"...), never a word
// cut, never an ellipsis. A run made only of words every offering could carry ("Lessons", "Services") names nothing and is
// not a short form. With no such run, there is none: the card is taken off, never left with the demo's name.
// Rules by words only, never by trade, template or business. Pure and deterministic.

/** Words that start the part of a name that says who or what it is for: the name is about the word before them. */
const QUALIFIERS = new Set(['for', 'with', 'of', 'in', 'at', 'by', 'to', 'from', 'on', 'near', 'per'])
/** Words that only join two others: a short form never starts or ends on one. */
const JOINERS = new Set(['&', '+', '/', '-', '–', 'and', 'or', 'the', 'a', 'an', ...QUALIFIERS])
/** Words any offering could carry: a short form needs at least one word besides them. */
const GENERIC = new Set([
  'lesson',
  'lessons',
  'class',
  'classes',
  'course',
  'courses',
  'session',
  'sessions',
  'service',
  'services',
  'training',
  'trainings',
  'program',
  'programs',
  'programme',
  'programmes',
  'package',
  'packages',
  'plan',
  'plans',
  'product',
  'products',
  'option',
  'options',
  'offer',
  'offers'
])

const fold = (/** @type {string} */ word) => word.toLowerCase().replace(/[.,;:!?]+$/u, '')
const length = (/** @type {string} */ text) => [...text].length

/**
 * The label as it is when it fits; else the longest run of its own words, ending on the word the name is about, that holds
 * in `limit` characters.
 * @param {string} label - the brief's name of the offering
 * @param {number} limit - the characters its box holds
 * @returns {string | null} the label, a shorter honest form of it, or null when there is none
 */
export function shortOfferingName(label, limit) {
  const name = String(label ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name || !Number.isInteger(limit) || limit < 1) return null
  if (length(name) <= limit) return name
  const words = name.split(' ')
  const qualifier = words.findIndex((word, i) => i > 0 && QUALIFIERS.has(fold(word)))
  const core = qualifier > 0 ? words.slice(0, qualifier) : words
  // Every run of the core ending on its last word, the longest first: "Seasonal Fruit Tarts" → "Fruit Tarts" → "Tarts".
  for (let start = 1; start < core.length; start++) {
    const run = core.slice(start)
    if (JOINERS.has(fold(run[0])) || JOINERS.has(fold(run.at(-1) ?? ''))) continue
    if (run.every((word) => GENERIC.has(fold(word)))) continue
    const text = run.join(' ')
    if (length(text) <= limit) return text
  }
  // The core itself, when only the qualifier made the name too long: "Pottery for Beginners" → "Pottery".
  const whole = core.join(' ')
  if (
    core.length < words.length &&
    length(whole) <= limit &&
    !JOINERS.has(fold(core.at(-1) ?? '')) &&
    !core.every((word) => GENERIC.has(fold(word)))
  )
    return whole
  return null
}
