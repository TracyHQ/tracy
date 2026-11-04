// Settle the samples of a written kit again from the content map, as `relabel` does for link labels: no browser, no
// capture, no image. Every declared text slot (`textSlotsOf`) takes the whole demo text as its `sample` and its
// lengths as `demoChars` (text-format.mjs); nothing else moves: no slot id, list, role, count or image. A kit built
// before samples were whole (cut at their first words) reads the demo's real length after this.
import { neutralKey } from './ids.mjs'
import { demoCharsOf, partsOfSample, SAMPLE_CAP, sampleOf, textSlotsOf } from './text-format.mjs'

/**
 * @param {object} kit changed in place
 * @param {{map: object}} o the content map beside the contract
 * @returns {{slots: number, changed: number, cutBefore: number, cutAfter: number, capped: number, withoutMapSlot: string[]}}
 */
export function settleSamples(kit, { map }) {
  const raw = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s]))
  const ids = new Set()
  const cutBefore = new Set()
  const cutAfter = new Set()
  const capped = new Set()
  const withoutMapSlot = new Set()
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
      if (s.sample !== sample || JSON.stringify(s.demoChars) !== JSON.stringify(demoChars)) changed++
      s.sample = sample
      s.demoChars = demoChars
      if (sample.includes('…')) cutAfter.add(s.id)
      if (sample.length > SAMPLE_CAP) capped.add(s.id)
    }
  return {
    slots: ids.size,
    changed,
    cutBefore: cutBefore.size,
    cutAfter: cutAfter.size,
    capped: capped.size,
    withoutMapSlot: [...withoutMapSlot]
  }
}
