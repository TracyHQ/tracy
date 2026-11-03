import { arr, has, obj, str } from './rule-set.js'

// R01 ids exist in the kit, in the right parent
export function checkR01(ctx) {
  const {
    R,
    plan,
    kitGroups,
    kitPages,
    kitBlocks,
    navGroups,
    blockIx,
    slotOwner,
    framesBlock,
    unwritable,
    planGroups,
    planPages,
    decisions,
    isLegalRef,
    pageBlockOrder,
    decisionParts,
    W
  } = ctx
  const r = R.r1
  if (!planGroups.length && !planPages.length) r.note('cannot check: plan.pageGroups and plan.pages missing')
  planGroups.forEach((g) =>
    kitGroups.has(g.id) ? r.ok() : r.fail(`pageGroups ${g.id}`, 'page group id not in kit')
  )
  planPages.forEach((p) => {
    const kp = kitPages.get(p.id)
    if (!kp) return r.fail(`pages ${p.id}`, 'page id not in kit')
    r.ok()
    if (has(p.group) && p.group !== kp.group)
      r.fail(`pages ${p.id}`, `page belongs to group ${kp.group} in the kit, plan says ${p.group}`)
    arr(p.story).forEach((s) => {
      const bid = obj(s).block
      if (!kitBlocks.has(bid)) r.fail(`pages ${p.id} / story`, `block ${bid} not in kit`)
      else if (!pageBlockOrder(kp).includes(bid))
        r.fail(`pages ${p.id} / story`, `block ${bid} is not on this page in the kit`)
    })
  })
  const menuPages = []
  arr(plan.mainMenu).forEach((m, i) => {
    menuPages.push([`mainMenu[${i}]`, obj(m).page])
    arr(obj(m).children).forEach((c, j) => menuPages.push([`mainMenu[${i}].children[${j}]`, obj(c).page]))
  })
  menuPages.forEach(([w, id]) => (kitPages.has(id) ? r.ok() : r.fail(w, `page ${id} not in kit`)))
  const site = obj(plan.site)
  arr(site.footerMenu).forEach((c, i) => {
    const co = obj(c)
    if (!navGroups.has(co.group)) r.fail(`site.footerMenu[${i}]`, `navigation group ${co.group} not in kit`)
    else r.ok()
    const hp = obj(co.heading).page
    if (has(hp) && !kitPages.has(hp)) r.fail(`site.footerMenu[${i}] heading`, `page ${hp} not in kit`)
    arr(co.pages).forEach((pid) => {
      if (!kitPages.has(pid) && !isLegalRef(pid)) r.fail(`site.footerMenu[${i}]`, `page ${pid} not in kit`)
    })
  })
  arr(site.legalPages).forEach((lp, i) => {
    const u = obj(lp).use
    if (has(u) && u !== 'create' && !kitPages.has(u))
      r.fail(`site.legalPages[${i}]`, `"${u}" is neither "create" nor a kit page id`)
  })
  r.note('footer "legal:privacy" is the spec id of a created Privacy page')
  decisions.forEach((x) => {
    const bid = x.d.block
    const kb = kitBlocks.get(bid)
    if (!kb) return r.fail(W(x), 'block id not in kit')
    r.ok()
    if (x.page) {
      const kp = kitPages.get(x.page)
      if (kp && !pageBlockOrder(kp).includes(bid)) r.fail(W(x), `block is not on page ${x.page} in the kit`)
    } else if (kb.shared === false)
      r.fail(W(x), 'listed in sharedBlocks but the kit says the block is not shared')
    const o = blockIx.get(bid)
    const parts = decisionParts(x.d)
    const navSlots = new Set(
      [...navGroups.values()]
        .filter((g) => g.block === bid)
        .flatMap((g) => [g.titleSlot, ...arr(g.items).map((it) => it.labelSlot)])
        .filter(has)
    )
    const own = (id) => slotOwner.get(id) === bid || o.slots.has(id) || navSlots.has(id)
    const prefixOther = (id) => {
      const pre = str(id).split('.')[0]
      return pre !== bid && kitBlocks.has(pre)
    }
    // Strict (spec: never make up an id): every slot in block copy, row copy and hiddenSlots must be an id
    // the kit gives for this block. Things the kit does not list belong in kitGaps.
    const kitHasNoFixedIds = o.fixed.length > 0 && o.fixed.every((t) => !has(t.id))
    parts.copy.forEach((c) => {
      if (!has(c.slot)) return r.note('cannot check: a copy entry has no "slot" field')
      const where = W(x, `${c.inItem ? `list ${c.inItem.list} row ${c.inItem.row} / ` : ''}slot ${c.slot}`)
      if (unwritable.has(c.slot))
        return r.fail(
          where,
          'the kit marks this item writable: false; it can be named but never written to',
          'plan'
        )
      if (own(c.slot)) return r.ok()
      if (c.inItem && o.fields.get(c.inItem.list)?.has(c.slot)) return r.ok() // a field name the kit gives for an items list
      if (slotOwner.has(c.slot))
        return r.fail(where, `slot belongs to block ${slotOwner.get(c.slot)}`, 'plan')
      if (str(c.slot).startsWith('fixedText:'))
        return r.fail(
          where,
          'made-up id for fixed text, which never goes in copy; anything the kit does not list goes in kitGaps',
          'plan'
        )
      r.fail(
        where,
        `slot id not in the kit for this block${prefixOther(c.slot) ? ' (its prefix is another block)' : ''}; anything the kit does not list goes in kitGaps`,
        'plan'
      )
    })
    parts.hidden.forEach((h) => {
      const s = h.slot
      if (!has(s)) return r.note('cannot check: a hiddenSlots entry has no "slot" field')
      const known =
        own(s) ||
        unwritable.has(s) ||
        o.frames.has(s) ||
        o.links.has(s) ||
        o.lists.has(s) ||
        o.fixed.some((t) => has(t.id) && t.id === s)
      if (known) return r.ok()
      if (str(s).startsWith('fixedText:') && kitHasNoFixedIds)
        return r.fail(
          W(x, `hidden ${s}`),
          "made-up id for fixed text: the kit gives this block's fixed texts no id, so there is no legal way to name it",
          'kit'
        )
      if (str(s).startsWith('form:'))
        return r.fail(
          W(x, `hidden ${s}`),
          'made-up id for a form: decide forms in site.forms by their kit block id',
          'plan'
        )
      r.fail(
        W(x, `hidden ${s}`),
        'hidden slot id not in the kit for this block; anything the kit does not list goes in kitGaps',
        'plan'
      )
    })
    parts.pics.forEach((p) => {
      if (!has(p.frame)) return r.note('cannot check: a picture wish has no "frame" field')
      if (!o.frames.has(p.frame))
        r.fail(
          W(x, `frame ${p.frame}`),
          framesBlock.has(p.frame) ? `frame belongs to block ${framesBlock.get(p.frame)}` : 'frame not in kit'
        )
    })
    parts.lists.forEach((l) => {
      if (!o.lists.has(l.list)) r.fail(W(x, `list ${l.list}`), 'list not in this block in the kit')
    })
    parts.links.forEach((l) => {
      if (!o.links.has(l.link) && !o.slots.has(l.link))
        r.fail(W(x, `link ${l.link}`), 'link not in this block in the kit')
    })
  })
}
