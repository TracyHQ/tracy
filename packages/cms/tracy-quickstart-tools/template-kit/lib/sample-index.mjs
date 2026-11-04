// Which content slot a piece of shown words comes from: tells content (whole, cut short, or split by inline
// markup) from the template's own words.
import { normText } from '../../content-coverage/lib/normalize.mjs'

const words = (t) => t.match(/[\p{L}\p{N}']+/gu) ?? []

/**
 * Do the words of `text` appear in `sample` in order, with a few holes (inline markup the page splits off, a link
 * or a number printed in its own element) and nothing far apart? At least four words, at most three holes of at
 * most twelve words each.
 */
export function wordsInOrder(text, sample) {
  const t = words(text)
  if (t.length < 4) return false
  const s = words(sample)
  for (let start = s.indexOf(t[0]); start !== -1; start = s.indexOf(t[0], start + 1)) {
    let at = start
    let holes = 0
    let ok = true
    for (const w of t.slice(1)) {
      const next = s.indexOf(w, at + 1)
      if (next === -1 || next - at > 13) {
        ok = false
        break
      }
      if (next > at + 1) holes++
      if (holes > 3) {
        ok = false
        break
      }
      at = next
    }
    if (ok) return true
  }
  return false
}

/**
 * Every normalized slot sample of the map, to tell template words from content. `slotOf(text)` names the slot a
 * shown text comes from: the whole sample, a piece of it (a heading split by inline markup), its start cut short
 * with an ellipsis (an intro text on a listing), or its words in order with a few holes.
 */
export function sampleIndex(map) {
  const index = (slots) => {
    const exact = new Map()
    const all = []
    for (const s of slots) {
      if (s.type === 'image' || s.type === 'url') continue
      const n = normText(s.sample)
      if (!n) continue
      if (!exact.has(n)) exact.set(n, s)
      all.push([n, s])
    }
    // One element printing several slots run together ("Join over " + a number + " of inspiring creatives"): the
    // text is content when slot samples, longest first, leave no letter of it. One sample of one word and the
    // rest without letters ("Harbour 2.4.1") is a coincidence, not slots run together.
    const pieces = all
      .filter(([n]) => n.length >= 3 && /\p{L}/u.test(n))
      .sort((x, y) => y[0].length - x[0].length)
    const piecesOf = (t) => {
      let rest = t
      let first = null
      const used = []
      for (const [n, s] of pieces) {
        if (!rest.includes(n)) continue
        rest = rest.split(n).join(' ')
        first ??= s
        used.push(n)
        if (!/\p{L}/u.test(rest)) return used.length > 1 || words(used[0]).length > 1 ? first : null
      }
      return null
    }
    return (t) => {
      if (exact.has(t)) return { slot: exact.get(t), how: 'whole' }
      if (t.length < 3) return null
      const cut = t.replace(/\s*(\.\.\.|…)$/, '')
      for (const [n, s] of all) if (n.length > t.length && n.includes(t)) return { slot: s, how: 'piece' }
      if (cut !== t && cut.length >= 12)
        for (const [n, s] of all) if (n.includes(cut)) return { slot: s, how: 'cut short' }
      for (const [n, s] of all)
        if (n.length > t.length && wordsInOrder(cut, n)) return { slot: s, how: 'words in order' }
      const p = piecesOf(t)
      return p ? { slot: p, how: 'slots run together' } : null
    }
  }
  const whole = index(map.slots ?? [])
  /**
   * `own`: the block's own slots, tried first, so words the demo repeats in many entities name the block's.
   * `matchOf` also says how the words matched (`whole`, `piece`, `cut short`, `words in order`, `slots run together`).
   */
  const matchOf = (t, own = null) => (own?.length ? index(own)(t) : null) ?? whole(t)
  const slotOf = (t, own = null) => matchOf(t, own)?.slot ?? null
  return { has: (t) => slotOf(t) != null, slotOf, matchOf }
}
