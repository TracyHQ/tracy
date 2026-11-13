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
      if (word.length > 2 && !NOT_A_SUBJECT.has(word) && !out.includes(word)) out.push(word)
  return out
}

/**
 * An item's candidates: library icons whose name holds one of its words (an earlier word first), then icons whose tags
 * hold them (more and earlier words first). At most {@link CANDIDATES_MAX}; empty when no word calls any icon.
 * @param {string[]} words `subjectWordsOf`'s answer
 * @param {Array<{name: string, tags?: string[]}>} catalog `contentCatalog`'s answer
 * @returns {string[]}
 */
export function iconCandidates(words, catalog) {
  const score = (hits) => hits.reduce((sum, at) => sum + (100 - at), 0)
  const byName = []
  const byTag = []
  for (const icon of catalog) {
    const parts = icon.name.split('-')
    const tags = new Set((icon.tags ?? []).map((t) => String(t).toLowerCase()))
    const named = []
    const tagged = []
    words.forEach((word, at) => {
      const forms = formsOf(word)
      if (forms.some((f) => parts.includes(f))) named.push(at)
      else if (forms.some((f) => tags.has(f))) tagged.push(at)
    })
    if (named.length)
      byName.push({ name: icon.name, score: score(named) * 10 + score(tagged) - parts.length })
    else if (tagged.length) byTag.push({ name: icon.name, score: score(tagged) })
  }
  const sorted = (list) =>
    list.sort((a, z) => z.score - a.score || (a.name < z.name ? -1 : 1)).map((s) => s.name)
  return [...sorted(byName), ...sorted(byTag)].slice(0, CANDIDATES_MAX)
}
