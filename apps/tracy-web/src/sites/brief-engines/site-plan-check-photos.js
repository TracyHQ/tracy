/**
 * The photo rules of the site plan check (`site-plan-check.js`, ticket TracyHQ/tracy#234, COO 30/10/2026): every photo of
 * the brief (`brief-photos.js`) has exactly one decision in the plan's `photos` list, either
 * `{photo, decision: 'use', slots: [picture element ids]}` or `{photo, decision: 'skip', reason}`; a photo whose labels
 * already refuse it (`verdict: 'reject'`) is never used; a used photo goes only into picture slots of the template.
 */

import { closestIds } from './site-plan-defaults-parts.js'

const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])

/**
 * @param {any} plan @param {any[]} photos - the brief photos @param {Map<string, any>} elements - the template inventory
 */
export function photoReasons(plan, photos, elements) {
  const out = []
  const known = new Map(list(photos).map((p) => [p.id, p]))
  const pictures = [...elements.values()].filter((e) => e?.kind === 'picture').map((e) => e.id)
  /** @type {Map<string, any>} */
  const decided = new Map()
  for (const entry of list(plan?.photos)) {
    const id = String(entry?.photo ?? '')
    if (!known.has(id))
      out.push({
        rule: 'unknown-photo',
        element: id,
        message: `${id} is not a photo of the brief; use an id of ids.photos exactly, the closest: ${closestIds(id, known.keys()).join(', ')}`
      })
    else if (decided.has(id))
      out.push({ rule: 'photo-decided-twice', element: id, message: `${id} has more than one decision` })
    else decided.set(id, entry)
  }
  for (const photo of known.values()) {
    const entry = decided.get(photo.id)
    const slots = list(entry?.slots).map(String)
    const complete =
      (entry?.decision === 'use' && slots.length > 0) ||
      (entry?.decision === 'skip' && String(entry?.reason ?? '').trim() !== '')
    if (!complete) {
      out.push({
        rule: 'photo-undecided',
        element: photo.id,
        message: `${photo.id} ("${photo.caption ?? ''}") needs one decision: used in named picture slots, or not used with a reason`
      })
      continue
    }
    if (entry.decision !== 'use') continue
    if (photo.verdict === 'reject')
      out.push({
        rule: 'photo-unusable-used',
        element: photo.id,
        message: `${photo.id} cannot be used: its labels refuse it (${list(photo.rejectedFor).join(', ')})`
      })
    for (const slot of slots.filter((s) => elements.get(s)?.kind !== 'picture'))
      out.push({
        rule: 'unknown-element',
        element: slot,
        message: `${photo.id} is placed in ${slot}, which is not a picture slot of the template; use an id of ids.pictureSlots exactly, the closest: ${closestIds(slot, pictures).join(', ')}`
      })
  }
  return out
}
