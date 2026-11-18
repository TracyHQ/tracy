// name_slots(): code reads brief.brand.name EXACTLY (and whether the brief holds it back) and the kit's
// site.nameSlots, and returns for every slot its id, kind, where, the current text, and either the new value
// (status "written") or a hand-off to the writing step. The rule lives in lib/brand-name-slots.js (the gate recomputes it).
import { computeNameSlots } from '../../lib/brand-name-slots.js'
import { BrandToolError } from './common.js'

export const tool = {
  name: 'name_slots',
  description:
    "Code fills the template's name slots from brand.name: whole-name slots and the empty site-name setting get the exact name, the copyright line gets only the template name replaced, template marketing sentences are handed to the writing step. A name missing or held back by the brief writes nothing and returns the owner task confirm-name. No input.",
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(_input, ctx) {
    if (!ctx.brief) throw new BrandToolError('the run has no brief')
    const r = computeNameSlots(ctx.kit, ctx.brief)
    return {
      ok: true,
      ...r,
      written: r.slots.filter((s) => s.status === 'written').length,
      handedOff: r.slots.filter((s) => s.status === 'handed-off').length
    }
  }
}
