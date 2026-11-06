// W12: slots the kit marks as one sentence (`blocks[].sentences`, template-kit sentence-groups.mjs) are read joined, as
// the page prints them. Each piece may read well alone and the sentence still break: no space where two pieces meet
// and nothing puts one back, or a capital in the middle.
import { sentenceFaults } from '../../lib/site-copy/sentence-join.js'

const arr = (x) => (Array.isArray(x) ? x : [])

export function checkW12({ R, view, kit, idx }) {
  const written = new Map(view.slots.map((s) => [s.slot, s]))
  const textOf = (id) => written.get(id)?.items.join(' ') ?? ''
  const cites = (word, piece) =>
    arr(written.get(piece.slot)?.factIds).some((id) => (idx.facts.get(id) ?? '').includes(word))
  for (const block of arr(kit?.blocks))
    for (const group of arr(block?.sentences)) {
      const { text, pieces, faults } = sentenceFaults(group, textOf, cites)
      if (pieces.length < 2) continue
      const names = pieces.map((p) => p.slot)
      const place = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
      for (const f of faults)
        R.w12.fail(
          group.id,
          `${group.id}: ${
            f.cause === 'missing-space'
              ? `no space where ${names[f.at - 1]} and ${names[f.at]} meet`
              : `"${f.word}" starts with a capital in mid sentence`
          }; ${place} print as "${text}"`,
          f.cause
        )
      if (!faults.length) R.w12.ok()
    }
}
