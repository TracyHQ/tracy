// W12: slots the kit marks as one sentence (`blocks[].sentences`, template-kit sentence-groups.mjs) are read joined,
// as the page prints them with nothing in between. Each piece may read well alone and the sentence still break: no
// space at a join, or a capital in the middle.
const arr = (x) => (Array.isArray(x) ? x : [])
const CAPITALISED = /^["'(]?(\p{Lu}\p{Ll}[\p{L}'-]*)/u

export function checkW12({ R, view, kit, idx }) {
  const written = new Map(view.slots.map((s) => [s.slot, s]))
  for (const block of arr(kit?.blocks))
    for (const group of arr(block?.sentences)) {
      const pieces = arr(group.slots)
        .map((id, at) => ({ id, at, slot: written.get(id) }))
        .filter((p) => p.slot && p.slot.items.join(' ').trim() !== '')
      if (pieces.length < 2) continue
      const texts = pieces.map((p) => p.slot.items.join(' '))
      const joined = texts.join('')
      const names = pieces.map((p) => p.id)
      const place = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
      let bad = false
      const fail = (detail, cause) => {
        bad = true
        R.w12.fail(group.id, `${group.id}: ${detail}; ${place} print as "${joined}"`, cause)
      }
      for (let i = 1; i < pieces.length; i++) {
        const before = texts[i - 1]
        const after = texts[i]
        const noSpace = !/\s$/.test(before) && !/^\s/.test(after)
        const adjacent = pieces[i].at === pieces[i - 1].at + 1
        if (
          noSpace &&
          (!adjacent || arr(group.joins)[pieces[i - 1].at] !== '') &&
          /[\p{L}\p{N},;:]$/u.test(before)
        )
          fail('no space where two pieces meet', 'missing-space')
        const word = CAPITALISED.exec(after.trimStart())?.[1]
        if (!word || /[.!?:]["')]?\s*$/.test(before)) continue
        if (/^\p{Lu}/u.test(arr(group.pieces)[pieces[i].at] ?? '')) continue
        const cited = arr(pieces[i].slot.factIds).map((id) => idx.facts.get(id) ?? '')
        if (cited.some((t) => t.includes(word))) continue
        fail(`"${word}" starts with a capital in mid sentence`, 'capital-mid-sentence')
      }
      if (!bad) R.w12.ok()
    }
}
