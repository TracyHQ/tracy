// W06 and W07 (ADR 0042): nothing repeats, and nothing of the demo business survives.
import { allTexts } from './copy-view.js'
import { hasPhrase, sentencesOf, wordsOf } from './text-tools.js'

export const RUN_WORDS = 5 // W06: two sentences sharing this many consecutive words are near-duplicates.
export const MIN_EQUAL_WORDS = 3 // W06 and W07: shortest sentence that counts as a sentence on its own.

const clip = (words) => (words.length > 8 ? `${words.slice(0, 8).join(' ')} ...` : words.join(' '))

// Sentences compared by W06: writer slots and page descriptions. Alt text, titles and labels are left out:
// alts and titles repeat the business name on purpose, labels are the planner's words.
export function checkW06({ R, view }) {
  const entries = []
  for (const s of view.slots)
    if (s.owner === 'writer') for (const t of s.items) entries.push({ where: s.slot, text: t })
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
      if (words.length >= MIN_EQUAL_WORDS && whole.has(full)) hit = { other: whole.get(full), run: full }
      for (let i = 0; !hit && i + RUN_WORDS <= words.length; i++) {
        const run = words.slice(i, i + RUN_WORDS).join(' ')
        if (grams.has(run) && grams.get(run).id !== id) hit = { other: grams.get(run), run }
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
