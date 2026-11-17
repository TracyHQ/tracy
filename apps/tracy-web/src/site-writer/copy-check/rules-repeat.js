// W06 and W07 (ADR 0042): nothing repeats, and nothing of the demo business survives.
import { allTexts } from './copy-view.js'
import { hasPhrase, sentencesOf, wordsOf } from '../../lib/site-copy/text-tools.js'

export const RUN_WORDS = 5 // W06: two sentences sharing this many consecutive words are near-duplicates.
export const MIN_EQUAL_WORDS = 3 // W06 and W07: shortest sentence that counts as a sentence on its own.
// W06: a shared run of RUN_WORDS is a near-duplicate only when at least this many of its words carry meaning (are not
// FUNCTION_WORDS). Dev copy runs, 10-17/11/2026: 5 of the 25 repeats left after the last fix round were runs such as
// "are the club s own", "with a warm up then" or "and how to ask about", which a reader never takes for a repeated
// sentence; the writer spent its fix rounds on them and the copy step still ended "failed, best version used"
// (bxr-london-lat10b: its only failure).
export const MIN_MEANING_WORDS = 2

// English function words in the form wordsOf gives (so "club's" is "club s"). A site written in another language
// keeps the strict reading: none of its words is in the list, so every run of RUN_WORDS counts.
export const FUNCTION_WORDS = new Set(
  (
    'a an the and or but nor so yet if then than as at by for from in into of off on onto out over to up down with ' +
    'within without about above after before below between through under until upon via per around across along ' +
    'near behind beyond during toward towards against among is am are was were be been being do does did done have ' +
    'has had having will would shall should can could may might must i me my mine we us our ours you your yours he ' +
    'him his she her hers it its they them their theirs this that these those there here who whom whose which what ' +
    'when where why how all any both each every few more most much many some such no not only own same other ' +
    'another very too just also again once ever even still while because since though although unless whether one ' +
    's t d ll m re ve'
  ).split(' ')
)

const carriesMeaning = (run) => run.filter((w) => !FUNCTION_WORDS.has(w)).length >= MIN_MEANING_WORDS

const clip = (words) => (words.length > 8 ? `${words.slice(0, 8).join(' ')} ...` : words.join(' '))

// Sentences compared by W06: writer slots and page descriptions. Alt text, titles and labels are left out:
// alts and titles repeat the business name on purpose, labels are the planner's words. A shared run (or a whole
// equal sentence) that lies wholly inside the normalised value of any brief fact is not a repeat: a phone number,
// an address or opening hours must be free to appear on every page that needs them. A shared run made almost only of
// function words is not a repeat either (MIN_MEANING_WORDS); a whole equal sentence still is.
export function checkW06({ R, view, idx }) {
  const factTexts = [...(idx?.facts?.values() ?? [])]
    .map((v) => ` ${wordsOf(v).join(' ')} `)
    .filter((v) => v.trim() !== '')
  const isFact = (run) => factTexts.some((f) => f.includes(` ${run} `))
  const entries = []
  for (const s of view.slots)
    if (s.owner === 'writer' && !idx.iconFields?.get(s.slot)?.has(s.items.join(' ')))
      for (const t of s.items) entries.push({ where: s.slot, text: t })
  for (const p of view.pages)
    p.body.forEach((t, i) => entries.push({ where: `${p.page} (body ${i + 1})`, text: t }))
  for (const s of view.seo) entries.push({ where: `${s.page} (description)`, text: s.description })
  const grams = new Map()
  const whole = new Map()
  let n = 0
  for (const e of entries) {
    for (const sentence of sentencesOf(e.text)) {
      const words = wordsOf(sentence)
      const id = n++
      let hit = null
      const full = words.join(' ')
      if (words.length >= MIN_EQUAL_WORDS && whole.has(full) && !isFact(full))
        hit = { other: whole.get(full), run: full }
      for (let i = 0; !hit && i + RUN_WORDS <= words.length; i++) {
        const runWords = words.slice(i, i + RUN_WORDS)
        const run = runWords.join(' ')
        if (grams.has(run) && grams.get(run).id !== id && !isFact(run) && carriesMeaning(runWords))
          hit = { other: grams.get(run), run }
      }
      if (hit)
        R.w06.fail(
          e.where,
          `${e.where}: "${clip(words)}" repeats ${hit.other.where}: shared run "${hit.run}"`,
          'repeat'
        )
      else R.w06.ok()
      if (words.length >= MIN_EQUAL_WORDS && !whole.has(full)) whole.set(full, { id, where: e.where })
      for (let i = 0; i + RUN_WORDS <= words.length; i++) {
        const run = words.slice(i, i + RUN_WORDS).join(' ')
        if (!grams.has(run)) grams.set(run, { id, where: e.where })
      }
    }
  }
}

export function checkW07({ R, view, idx }) {
  for (const t of allTexts(view)) {
    if (t.kind === 'label') continue
    if (t.kind === 'slot' && idx.iconFields?.get(t.where)?.has(t.text)) continue
    let bad = false
    const normal = ` ${wordsOf(t.text).join(' ')} `
    if (t.kind === 'slot')
      for (const d of idx.demo.sentences)
        if (normal.includes(` ${d} `)) {
          bad = true
          R.w07.fail(t.where, `${t.where}: demo sentence left in the copy: "${d}"`, 'demo-sentence')
        }
    for (const name of idx.demo.names)
      if (hasPhrase(t.text, name)) {
        bad = true
        R.w07.fail(t.where, `${t.where}: demo proper name left in the copy: "${name}"`, 'demo-name')
      }
    if (!bad) R.w07.ok()
  }
}
