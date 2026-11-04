// Settle the samples of a written kit again from the content map, as `relabel` does for link labels: no browser, no
// capture, no image. Every declared text slot (`textSlotsOf`) takes the whole demo text as its `sample`, its
// lengths as `demoChars` and its inline emphasis as `inline` (text-format.mjs, inline-marks.mjs); nothing else moves: no slot id, list, role, count or image. A kit built
// before samples were whole (cut at their first words) reads the demo's real length after this.
import { neutralKey } from './ids.mjs'
import { demoCharsOf, partsOfSample, SAMPLE_CAP, sampleOf, textSlotsOf } from './text-format.mjs'

/**
 * @param {object} kit changed in place
 * @param {{map: object}} o the content map beside the contract
 * @returns {{slots: number, changed: number, cutBefore: number, cutAfter: number, capped: number, inline: number, withoutMapSlot: string[]}}
 */
export function settleSamples(kit, { map }) {
  const raw = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s]))
  const ids = new Set()
  const cutBefore = new Set()
  const cutAfter = new Set()
  const capped = new Set()
  const withoutMapSlot = new Set()
  const marked = new Set()
  let changed = 0
  for (const b of kit.blocks ?? [])
    for (const s of textSlotsOf(b)) {
      ids.add(s.id)
      if (String(s.sample ?? '').includes('…')) cutBefore.add(s.id)
      const m = raw.get(s.id)
      // A slot the content map does not hold keeps its sample; its lengths are read from that sample.
      const next = m?.sample != null ? sampleOf(m.sample) : null
      if (!next) withoutMapSlot.add(s.id)
      const sample = next?.sample ?? s.sample ?? ''
      const demoChars = next?.demoChars ?? demoCharsOf(partsOfSample(sample))
      // Without a content map slot nothing says what was marked: an `inline` already there stays.
      const inline = next ? next.inline : (s.inline ?? [])
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
      if (s.sample !== sample || !same(s.demoChars, demoChars) || !same(s.inline ?? [], inline)) changed++
      s.sample = sample
      s.demoChars = demoChars
      if (inline.length) {
        s.inline = inline
        marked.add(s.id)
      } else delete s.inline
      if (sample.includes('…')) cutAfter.add(s.id)
      if (sample.length > SAMPLE_CAP) capped.add(s.id)
    }
  return {
    slots: ids.size,
    changed,
    cutBefore: cutBefore.size,
    cutAfter: cutAfter.size,
    capped: capped.size,
    inline: marked.size,
    withoutMapSlot: [...withoutMapSlot]
  }
}
