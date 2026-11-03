import { arr, obj, str } from './rule-set.js'

// R19 map buttons. A kit link whose opens.slotId names a site.settingSlots entry of kind map-location opens a
// map the build fills from the brief's address fact. With a usable address fact (field "address", not withheld
// in brief.missing) the button and its label stay and the link leads to map:<that fact>, the same fact as a
// site.contactChannels entry of kind map; without one, the button is hidden.
export function checkR19(ctx) {
  const {
    R,
    plan,
    kit,
    blockIx,
    linkLabelSlot,
    facts,
    missingFields,
    keptPageIds,
    keptDecisions,
    decisionParts,
    W
  } = ctx
  const r = R.r19
  const mapSlots = new Set(
    arr(obj(kit.site).settingSlots)
      .filter((s) => obj(s).kind === 'map-location')
      .map((s) => s.id)
  )
  if (!arr(obj(kit.site).settingSlots).length) r.note('cannot check: the kit has no site.settingSlots')
  const addressUsable = !missingFields.has('address')
  const addressFacts = [...facts.values()].filter((f) => f.field === 'address').map((f) => f.id)
  const mapChannels = new Set(
    arr(obj(plan.site).contactChannels)
      .filter((c) => obj(c).kind === 'map')
      .map((c) => c.factId)
  )
  keptDecisions.forEach((x) => {
    if (x.page && !keptPageIds.has(x.page)) return
    const o = blockIx.get(x.d.block)
    if (!o) return
    const parts = decisionParts(x.d)
    const hidden = new Set(parts.hidden.map((h) => h.slot))
    for (const [lid, kl] of o.links) {
      if (!mapSlots.has(obj(kl.opens).slotId)) continue
      const label = linkLabelSlot.get(lid)
      const where = W(x, `link ${lid}`)
      if (hidden.has(lid) || (label && hidden.has(label))) {
        if (addressUsable && addressFacts.length)
          r.fail(
            where,
            `map button is hidden while the brief has an address fact (${addressFacts.join(', ')}); keep it and lead it to map:<address fact id>`,
            'plan'
          )
        else r.ok()
        continue
      }
      const pl = parts.links.find((l) => l.link === lid)
      const m = /^map:(.+)$/.exec(str(pl && pl.leadsTo).trim())
      const f = m && facts.get(m[1])
      let p = null
      if (!pl) p = 'map button is neither hidden nor in links'
      else if (!m) p = `map button leads to "${str(pl.leadsTo)}", not map:<address fact id>`
      else if (!f) p = `map:${m[1]} names no fact of the brief`
      else if (f.field !== 'address') p = `map:${m[1]} names a ${f.field} fact, not an address fact`
      else if (!addressUsable) p = `map:${m[1]} names an address the brief withholds in missing`
      else if (!mapChannels.has(m[1])) p = `map:${m[1]} is not a site.contactChannels entry of kind map`
      else if (label && hidden.has(label)) p = `map button is kept but its label slot ${label} is hidden`
      p ? r.fail(where, p, 'plan') : r.ok()
    }
  })
}

// R10h judgement items (not checkable by script)
export function checkR10h(ctx) {
  const { R } = ctx
  const r = R.r10h
  r.skip('needs a reviewer, not a script')
  ;[
    'every brief service appears somewhere; nothing on the site is missing from the brief',
    'rows never exceed the number of true items the brief has',
    'picture wishes fit the frame size and the words beside them; gallery frames are any-real with a scene in shows; every other frame is specific',
    '"seen" lines match the block image',
    'no invented fact, person, price, number or hour inside a says line (only fact-id presence is checked)',
    'lines inferred from the trade are basis "trade", never "brief"; no place or concrete promise (result, guarantee, weather) in a trade line without a brief fact',
    'a link whose target the kit does not expose (no link entry) has its label slot hidden; a map button the kit opens on a map setting slot is checked by R19',
    'review quotes appear only in reviews/testimonial blocks; no mix of quote and paraphrase',
    'no service or item appears in two blocks of one page; row says lines are distinct per row',
    'social rows: one per profile, icon fits the network; summary contact blocks do not exceed the demo line count per kind',
    'forms kept only when the brief says where answers go',
    'owner task exists for a missing logo/favicon, a withheld business name, and each trade offer',
    'business name is not shown when brief.missing withholds it'
  ].forEach((m) => r.note(`judgement: ${m}`))
}
