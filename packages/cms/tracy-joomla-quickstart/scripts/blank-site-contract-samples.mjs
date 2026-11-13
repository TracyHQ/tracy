/**
 * The samples of the blank site contract (ticket #584): each slot a blank site empties says what the blank site holds
 * there, and that it may be filled.
 *
 * The Claude Cowork plugin compares what a write puts in a slot with the slot's sample (`QuickstartContract::checkValue`):
 * a value in a slot whose sample is empty is refused ("Content cannot activate an empty slot") unless the slot carries
 * `opensEmpty`, and an empty value in a slot whose sample is not empty is refused ("Content cannot remove an occupied
 * slot"). A blank site starts empty where the mapping file says the build writes, so each such slot of a kept record
 * gets the value the blank site step leaves in it:
 *   a place that is the whole slot   sample "" and `opensEmpty: true`: the build may fill it, and a later edit may
 *                                    empty it again, the state the blank site shipped;
 *   pieces inside an HTML slot       sample = the released sample with those pieces emptied, by the same function the
 *                                    blank site step uses (`empty-html-places.php`), so it is byte for byte the value
 *                                    the blank site stores; `opensEmpty` only when nothing but white space is left.
 * Every other slot keeps its released sample. Each slot the build writes also takes the kit's limit and loses the
 * flags that would refuse a normal write (`blank-site-contract-fit.mjs`). Pure, apart from the one php run of
 * `emptyHtml`.
 */

import { kitLimitOf, kitUsesBySlot, writableSlot } from './blank-site-contract-fit.mjs'
import { emptyHtmlByPhp, placesToEmpty } from './blank-site-empty-fields.mjs'

/**
 * @param {{ mapping: object, blockStore: object, slots: {key: string, sample: string}[], emptyHtml?: Function }} input
 *   `slots` are the released slots of the records the blank site keeps; `blockStore` gives the kit's limits
 * @returns {Map<string, {sample: string, opensEmpty: boolean, limit: number|null}>} by slot key, only the slots the
 *   blank site empties
 */
export function emptiedSamples({ mapping, blockStore, slots, emptyHtml = emptyHtmlByPhp }) {
  if (!blockStore) throw new Error('emptiedSamples needs the block store: the opened slots take its limits')
  const uses = kitUsesBySlot(blockStore)
  const byKey = new Map(slots.map((s) => [s.key, s]))
  const places = new Map()
  for (const loc of placesToEmpty(mapping))
    if (loc.slot && byKey.has(loc.slot)) places.set(loc.slot, [...(places.get(loc.slot) ?? []), loc])
  const out = new Map()
  const entries = []
  const asked = []
  for (const [key, locs] of [...places].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (locs.some((l) => !l.piece))
      out.set(key, { sample: '', opensEmpty: true, limit: kitLimitOf(uses.get(key), '') })
    else {
      entries.push({ html: byKey.get(key).sample, xpaths: locs.map((l) => l.xpath) })
      asked.push(key)
    }
  }
  emptyHtml(entries).forEach((r, i) => {
    if (r.error) throw new Error(`${asked[i]}: its pieces cannot be emptied: ${r.error}`)
    out.set(asked[i], {
      sample: r.html,
      opensEmpty: r.html.trim() === '',
      limit: kitLimitOf(uses.get(asked[i]), r.html)
    })
  })
  return out
}

/**
 * A released slot as the blank site contract carries it: for a slot named in `emptied`, its sample, `opensEmpty`,
 * the kit's limit and no keep flag; every other slot as released.
 */
export function blankSlot(slot, emptied) {
  const e = emptied.get(slot.key)
  if (!e) return slot
  const { opensEmpty: _, ...rest } = slot
  return writableSlot({ ...rest, sample: e.sample, ...(e.opensEmpty ? { opensEmpty: true } : {}) }, e.limit)
}
