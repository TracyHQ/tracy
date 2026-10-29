// The picture decisions of the site plan (spec TracyHQ/tracy#189, tickets #194 and #195): the fill plan decided per slot
// (a demo file shared by cards is no longer one unit), then a drawing from the owner's photos where no photo fits
// (`fill-draw.mjs`), then an icon or a cut-out where the slot carries the demo's subject (`decor-plan.mjs`). Pure.
import { planDecor } from './decor-plan.mjs'
import { planDrawings } from './fill-draw.mjs'
import { planFill } from './fill-plan.mjs'

/**
 * @param {{slots: any[], pages?: any[], entities?: any[]}} contentMap - the whole map, declared slots included
 * @param {any} brief
 * @param {Record<string, string>} [cardNames] - the brief label each kept card shows, by group id (the site plan's
 *   `honesty.cardNames`, #192): a card's photo, drawing or icon shows the offering or person its words name
 * @returns {Map<string, any>} slot key → decision (`action`, `reason`, and a drawing, a glyph or a cut-out mode)
 */
export function pictureDecisionsOf(contentMap, brief, cardNames = {}) {
  const fill = planFill({ contentMap, brief, cardNames, perSlot: true })
  const drawn = planDrawings({ fill, contentMap, brief })
  const out = new Map(drawn.slots.map((d) => [d.key, d]))
  const decor = planDecor({ contentMap, brief, offerings: fill.offerings, canDraw: true })
  for (const d of decor.slots) {
    // A decorative slot is decided by its subject alone: no photo or drawing of the fill plan stays on it.
    const { mediaId: _m, crop: _c, drawing: _d, substitute: _s, ...rest } = out.get(d.key) ?? {}
    out.set(d.key, { ...rest, ...d })
  }
  return out
}
