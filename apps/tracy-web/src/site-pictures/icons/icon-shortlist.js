// Which icon each icon frame shows (ADR 0043 section 3, #345): code builds a shortlist of library names from the plan's
// words, a text model ranks it, code assigns. Pure and deterministic.
//
// NO KEYWORD TABLE TIED TO A TRADE. The old build branch held a lexicon of trade words (a sport, a cuisine, a craft)
// and their icons; it is not ported. The shortlist reads only the library itself: the names of its icons and the tags
// it gives them, so any trade is covered by the same code.
// A MODEL NEVER DRAWS AND NEVER INVENTS A NAME: it ranks names from the frame's own menu, a name outside it is dropped
// (`validRanking`). NO ICON TWICE IN ONE SECTION: a section is the block the icon frames sit in, whose repeated items
// are read side by side (`assignIcons`).
import { foldWords } from 'website-opportunities/domain/pictures/slot-map.mjs'

/** The most icons one frame's ranking keeps, and the most names one frame's menu offers the model. */
export const RANKING_MAX = 5
export const MENU_MAX = 40

/**
 * The marks a frame takes when no meaning fits, in the order a section uses them: distinct shapes without a subject,
 * so frames nothing matches still differ from each other. Every name is in the library (a test checks).
 */
export const NEUTRAL_MARKS = Object.freeze([
  'check-circle',
  'star',
  'sparkle',
  'circle',
  'diamond',
  'hexagon'
])

/**
 * Words of a drawing style, not of a subject. The planner writes the template's own icon style into `mustInclude`
 * ("thin line, one colour"); the style is measured from the demo icons by code, so these words call no icon.
 */
const STYLE_WORDS = new Set(
  'thin light regular bold fill filled solid line lines stroke outline outlined duotone two tone one colour color icon icons style styled drawn flat rounded minimal simple monochrome single weight'.split(
    ' '
  )
)

/** A word's forms that a library name or tag may hold: the word and its singular. */
const formsOf = (word) => (word.endsWith('s') && word.length > 3 ? [word, word.slice(0, -1)] : [word])

/**
 * The words that call an icon: what the frame shows first, then the plan's other words that are not style words.
 * @param {{shows?: unknown, mustInclude?: unknown}} wish
 * @returns {{subject: string[], extra: string[]}} folded words
 */
export function wordsOfWish(wish) {
  const subject = foldWords(wish?.shows)
  const extra = foldWords(
    Array.isArray(wish?.mustInclude) ? wish.mustInclude.join(' ') : wish?.mustInclude
  ).filter((w) => !STYLE_WORDS.has(w) && !subject.includes(w))
  return { subject: subject.filter((w) => !STYLE_WORDS.has(w)), extra }
}

/** The library cut to the icons a frame may show: brand logos are never a subject. */
export function usableCatalog(catalog) {
  return (catalog ?? []).filter(
    (i) =>
      typeof i?.name === 'string' && !i.name.endsWith('-logo') && !(i.categories ?? []).includes('brands')
  )
}

// Icons whose own name says one of the words (a whole part of the name: `tennis` in `tennis-ball`), best first: the
// name's first part, an earlier word, fewer parts.
function byName(words, catalog) {
  const scored = []
  for (const icon of catalog) {
    const parts = icon.name.split('-')
    let best = -1
    words.forEach((word, at) => {
      for (const form of formsOf(word))
        if (form.length > 2 && parts.includes(form))
          best = Math.max(best, 1000 - at * 10 - parts.length - (parts[0] === form ? 0 : 3))
    })
    if (best >= 0) scored.push({ name: icon.name, score: best })
  }
  return scored.sort((a, z) => z.score - a.score || (a.name < z.name ? -1 : 1)).map((s) => s.name)
}

// Icons whose tags say the words, the subject words counting double.
function byTag({ subject, extra }, catalog) {
  const weight = new Map()
  for (const w of subject.flatMap(formsOf)) weight.set(w, 2)
  for (const w of extra.flatMap(formsOf)) if (!weight.has(w)) weight.set(w, 1)
  return catalog
    .map((i) => ({ name: i.name, score: (i.tags ?? []).reduce((sum, t) => sum + (weight.get(t) ?? 0), 0) }))
    .filter((s) => s.score > 0)
    .sort((a, z) => z.score - a.score || (a.name < z.name ? -1 : 1))
    .map((s) => s.name)
}

/**
 * A frame's menu for the model: library names that say its words, then library icons whose tags do; at most
 * {@link MENU_MAX}, deterministic. Empty when no word of the plan calls any icon.
 * @param {{shows?: unknown, mustInclude?: unknown}} wish
 * @param {Array<{name: string, tags?: string[], categories?: string[]}>} catalog `usableCatalog`'s answer
 * @returns {string[]}
 */
export function iconShortlist(wish, catalog) {
  const words = wordsOfWish(wish)
  const out = []
  for (const name of [...byName([...words.subject, ...words.extra], catalog), ...byTag(words, catalog)])
    if (out.length < MENU_MAX && !out.includes(name)) out.push(name)
  return out
}

/**
 * A ranking as given (by a model), cut to the allowed names: unknown names and repeats dropped, at most
 * {@link RANKING_MAX} kept. Never throws.
 * @param {unknown} list
 * @param {Iterable<string>} allowed the frame's menu
 * @returns {string[]}
 */
export function validRanking(list, allowed) {
  if (!Array.isArray(list)) return []
  const known = allowed instanceof Set ? allowed : new Set(allowed)
  const out = []
  for (const raw of list) {
    const name = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (known.has(name) && !out.includes(name)) out.push(name)
    if (out.length >= RANKING_MAX) break
  }
  return out
}

/**
 * One icon per frame, never one icon twice in a section. Frames are taken in the order given; each takes its best
 * candidate the section has not used, else the first neutral mark it has not used (after the last, the marks repeat,
 * as a section can only show so many).
 * @param {Array<{id: string, section: string, candidates: Array<{name: string, by: string}>}>} items
 * @returns {Map<string, {name: string, by: 'model' | 'shortlist' | 'neutral'}>}
 */
export function assignIcons(items) {
  /** @type {Map<string, Set<string>>} */
  const used = new Map()
  const out = new Map()
  for (const item of items) {
    const taken = used.get(item.section) ?? new Set()
    used.set(item.section, taken)
    const pick = item.candidates.find((c) => !taken.has(c.name))
    const neutral =
      NEUTRAL_MARKS.find((g) => !taken.has(g)) ?? NEUTRAL_MARKS[taken.size % NEUTRAL_MARKS.length]
    const chosen = pick ?? { name: neutral, by: 'neutral' }
    taken.add(chosen.name)
    out.set(item.id, chosen)
  }
  return out
}
