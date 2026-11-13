// W06 and W07 (ADR 0042): nothing repeats, and nothing of the demo business survives.
import { allTexts } from './copy-view.js'
import { repeatsOf } from 'website-opportunities/domain/copy-repeats.mjs'
import { hasPhrase, wordsOf } from '../../lib/site-copy/text-tools.js'

// The rule itself is shared with the AI quickstart page writer: `website-opportunities/domain/copy-repeats.mjs`.
export { MIN_EQUAL_WORDS, RUN_WORDS } from 'website-opportunities/domain/copy-repeats.mjs'

const clip = (words) => (words.length > 8 ? `${words.slice(0, 8).join(' ')} ...` : words.join(' '))

// Sentences compared by W06: writer slots and page descriptions. Alt text, titles and labels are left out:
// alts and titles repeat the business name on purpose, labels are the planner's words. A shared run (or a whole
// equal sentence) that lies wholly inside the normalised value of any brief fact is not a repeat: a phone number,
// an address or opening hours must be free to appear on every page that needs them.
export function checkW06({ R, view, idx }) {
  const entries = []
  for (const s of view.slots)
    if (s.owner === 'writer' && !idx.iconFields?.get(s.slot)?.has(s.items.join(' ')))
      for (const t of s.items) entries.push({ where: s.slot, text: t })
  for (const p of view.pages)
    p.body.forEach((t, i) => entries.push({ where: `${p.page} (body ${i + 1})`, text: t }))
  for (const s of view.seo) entries.push({ where: `${s.page} (description)`, text: s.description })
  for (const { entry: e, words, hit } of repeatsOf(entries, { facts: idx?.facts?.values() ?? [] }))
    if (hit)
      R.w06.fail(
        e.where,
        `${e.where}: "${clip(words)}" repeats ${hit.other.where}: shared run "${hit.run}"`,
        'repeat'
      )
    else R.w06.ok()
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
