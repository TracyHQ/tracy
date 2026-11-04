// W12: slots the kit marks as one sentence (`blocks[].sentences`, template-kit sentence-groups.mjs) are read joined, as
// the page prints them. Each piece may read well alone and the sentence still break: no space where two pieces meet
// and nothing puts one back, or a capital in the middle.
import { printedSentence } from './sentence-join.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const CAPITALISED = /^["'(]?(\p{Lu}\p{Ll}[\p{L}'-]*)/u

export function checkW12({ R, view, kit, idx }) {
  const written = new Map(view.slots.map((s) => [s.slot, s]))
  const textOf = (id) => written.get(id)?.items.join(' ') ?? ''
  for (const block of arr(kit?.blocks))
    for (const group of arr(block?.sentences)) {
      const { text, pieces, missing } = printedSentence(group, textOf)
      if (pieces.length < 2) continue
      const names = pieces.map((p) => p.slot)
      const place = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
      let bad = false
      const fail = (detail, cause) => {
        bad = true
        R.w12.fail(group.id, `${group.id}: ${detail}; ${place} print as "${text}"`, cause)
      }
      for (const i of missing) fail(`no space where ${names[i - 1]} and ${names[i]} meet`, 'missing-space')
      for (const [i, piece] of pieces.entries()) {
        if (i === 0) continue
        const word = CAPITALISED.exec(piece.text.trimStart())?.[1]
        if (!word || /[.!?:]["')]?\s*$/.test(pieces[i - 1].text)) continue
        if (/^\p{Lu}/u.test(arr(group.pieces)[piece.at] ?? '')) continue
        const cited = arr(written.get(piece.slot)?.factIds).map((id) => idx.facts.get(id) ?? '')
        if (!cited.some((t) => t.includes(word)))
          fail(`"${word}" starts with a capital in mid sentence`, 'capital-mid-sentence')
      }
      if (!bad) R.w12.ok()
    }
}
