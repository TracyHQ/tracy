// W15 (ADR 0042, 2026-11-04): a slot whose demo is a lead paragraph followed by short points is written in that shape. The page
// prints the first item as the lead paragraph and every other item as a point (lib/site-copy/contract-mapping.js joinItems), so
// three equal sentences in such a slot print as one paragraph and two long bullets. The shape comes from the kit
// (lib/site-copy/slot-shape.js), the same numbers the writer is given.
import { boundsOf, slotShape } from '../../lib/site-copy/slot-shape.js'
import { sentencesOf } from '../../lib/site-copy/text-tools.js'

/** A point may run this many times the longest demo point before it reads as a paragraph. */
export const POINT_STRETCH_MAX = 1.5

export function checkW15({ R, view, idx }) {
  const returned = new Set(view.returns.map((r) => r.slot).filter(Boolean))
  const seen = new Set()
  for (const s of view.slots) {
    if (s.owner !== 'writer' || returned.has(s.slot) || seen.has(s.slot) || idx.hidden.has(s.slot)) continue
    seen.add(s.slot)
    const kit = idx.kitSlots.get(s.slot)
    if (!kit) continue
    const shape = slotShape(kit)
    if (!shape.lead) continue
    const faults = []
    if (s.items.length < 2)
      faults.push([
        `${s.items.length} item, the demo shows a lead paragraph and ${shape.points} points: write the lead as the first item and each point after it`,
        'no-points'
      ])
    else {
      const lead = boundsOf(shape.leadChars, 0)
      const n = s.items[0].trim().length
      if (lead && (n < lead.floor || n > lead.ceiling))
        faults.push([
          `the lead paragraph is ${n} characters, the demo lead is ${shape.leadChars} (${lead.floor} to ${lead.ceiling})`,
          n < lead.floor ? 'lead-short' : 'lead-long'
        ])
      const max = shape.pointChars ? Math.round(shape.pointChars.max * POINT_STRETCH_MAX) : null
      s.items.slice(1).forEach((t, i) => {
        const len = t.trim().length
        if (sentencesOf(t).length > 1)
          faults.push([
            `point ${i + 1} is ${sentencesOf(t).length} sentences, a point is one short phrase`,
            'point-sentences'
          ])
        else if (max !== null && len > max)
          faults.push([
            `point ${i + 1} is ${len} characters, at most ${max} (${POINT_STRETCH_MAX} times the longest demo point, ${shape.pointChars.max})`,
            'point-long'
          ])
      })
    }
    if (!faults.length) R.w15.ok()
    for (const [detail, cause] of faults) R.w15.fail(s.slot, `${s.slot}: ${detail}`, cause)
  }
}
