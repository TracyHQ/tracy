// The candidate icons of one item (ticket #595, ADR 0043 section 3): code filters the icon library down to the icons
// whose own name or tags say a word of the item's written copy, and the model only ranks that list. Pure and
// deterministic. Like the picture step's shortlist (ADR 0043), it reads only the library itself, its icon names and
// tags: no keyword table tied to a trade, so a yoga studio and a dental practice are served by the same code. Brand
// marks are never a candidate for an item's content (they stand for a network, `icon-social.mjs`).
import { foldWords } from './pictures/slot-map.mjs'

/** The most names one item's candidate list offers the model. */
export const CANDIDATES_MAX = 24

/** Words of a drawing style or of the page itself, not of a subject: they never call an icon. */
const NOT_A_SUBJECT = new Set(
  'icon icons image photo picture style line bold thin light regular fill filled outline more read learn our your you we us with from for and the'.split(
    ' '
  )
)
/**
 * Common words and number words: they say how often or how many, not what an item is about, so they never call an icon
 * (`every six months` never calls `dice-six`, `one to one` never calls `number-one`).
 */
export const ICON_STOP_WORDS = Object.freeze(
  new Set(
    [
      'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen',
      'seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million',
      'first second third fourth fifth sixth seventh eighth ninth tenth once twice half double single',
      'every each all any some many much most very just only also about into onto over under than then',
      'this that these those there here have has had are was were will can may might not but out off get got',
      'make made makes take takes give gives come comes keep keeps start starts per its own new best',
      'why how what when where who which choose offer offers service services quality trust experience'
    ]
      .join(' ')
      .split(' ')
  )
)

/** A word's forms a library name or tag may hold: the word and its singular. */
const formsOf = (word) => {
  const forms = [word]
  if (word.length > 4 && word.endsWith('ies')) forms.push(`${word.slice(0, -3)}y`)
  else if (word.length > 3 && word.endsWith('es')) forms.push(word.slice(0, -2), word.slice(0, -1))
  else if (word.length > 3 && word.endsWith('s')) forms.push(word.slice(0, -1))
  return forms
}

/** The library cut to the icons an item's content may take: never a brand mark. */
export function contentCatalog(icons) {
  return (Array.isArray(icons) ? icons : []).filter(
    (i) =>
      typeof i?.name === 'string' && !i.name.endsWith('-logo') && !(i.categories ?? []).includes('brands')
  )
}

/** The subject words of an item, the first words first (its heading leads), folded, deduplicated. */
export function subjectWordsOf(texts) {
  const out = []
  for (const text of texts)
    for (const word of foldWords(text))
      if (word.length > 2 && !NOT_A_SUBJECT.has(word) && !ICON_STOP_WORDS.has(word) && !out.includes(word))
        out.push(word)
  return out
}

/**
 * The subject of an item in two tiers: the words of its heading, then the words of its other text.
 * @param {{heading?: string[], text?: string[]}} texts
 * @returns {{words: string[], lead: number}} `lead`: how many of the first `words` are heading words
 */
export function subjectOf({ heading = [], text = [] }) {
  const lead = subjectWordsOf(heading)
  const words = subjectWordsOf([...heading, ...text])
  return { words, lead: lead.length }
}

/**
 * An item's candidates: library icons whose name or tags hold one of its words. A heading word outranks any number of
 * body words; within a tier a name match counts twice a tag match and an earlier word more than a later one. At most
 * {@link CANDIDATES_MAX}; empty when no word calls any icon.
 * @param {string[] | {words: string[], lead: number}} subject `subjectOf`'s answer, or bare words (one tier)
 * @param {Array<{name: string, tags?: string[]}>} catalog `contentCatalog`'s answer
 * @returns {string[]}
 */
export function iconCandidates(subject, catalog) {
  const words = Array.isArray(subject) ? subject : (subject?.words ?? [])
  const lead = Array.isArray(subject) ? words.length : (subject?.lead ?? words.length)
  const scored = []
  for (const icon of catalog) {
    const parts = icon.name.split('-')
    const tags = new Set((icon.tags ?? []).map((t) => String(t).toLowerCase()))
    let heading = 0
    let body = 0
    words.forEach((word, at) => {
      const forms = formsOf(word)
      const hit = forms.some((f) => parts.includes(f)) ? 2 : forms.some((f) => tags.has(f)) ? 1 : 0
      if (!hit) return
      if (at < lead) heading += hit * 100 - at
      else body += hit * 100 - at
    })
    if (heading || body) scored.push({ name: icon.name, heading, body, parts: parts.length })
  }
  return scored
    .sort(
      (a, z) => z.heading - a.heading || z.body - a.body || a.parts - z.parts || (a.name < z.name ? -1 : 1)
    )
    .slice(0, CANDIDATES_MAX)
    .map((s) => s.name)
}
