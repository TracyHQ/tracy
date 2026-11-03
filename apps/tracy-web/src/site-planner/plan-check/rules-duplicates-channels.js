import { arr, has, obj, str } from './rule-set.js'

// R10g duplicates
export function checkR10g(ctx) {
  const { R, plan, navGroups, planGroups, planPages, decisions, decisionParts, asDecision, W } = ctx
  const r = R.r10g
  const dupes = (list, key, where) => {
    const m = new Map()
    list.forEach((id) => m.set(id, (m.get(id) || 0) + 1))
    for (const [id, n] of m)
      if (n > 1) r.fail(where(id), `${key} ${id} appears ${n} times`)
      else r.ok()
  }
  dupes(
    planGroups.map((g) => g.id),
    'page group',
    (id) => `pageGroups ${id}`
  )
  dupes(
    planPages.map((p) => p.id),
    'page',
    (id) => `pages ${id}`
  )
  dupes(
    arr(plan.sharedBlocks).map((d) => asDecision(d).block),
    'shared block',
    (id) => `sharedBlocks ${id}`
  )
  const shared = new Set(arr(plan.sharedBlocks).map((d) => asDecision(d).block))
  arr(obj(plan.site).footerMenu).forEach((co) => {
    // Spec: a footer column title is decided only in footerMenu.heading, never in the block copy.
    const g = navGroups.get(obj(co).group)
    if (!g || !has(g.titleSlot)) return
    decisions
      .filter((x) => x.d.block === g.block)
      .forEach((x) => {
        if (decisionParts(x.d).copy.some((c) => c.slot === g.titleSlot))
          r.fail(
            `block ${g.block} / slot ${g.titleSlot}`,
            'footer column title is in the block copy; the spec decides it only in site.footerMenu.heading',
            'plan'
          )
      })
  })
  planPages.forEach((p) => {
    dupes(
      arr(p.blocks).map((d) => asDecision(d).block),
      'block',
      (id) => `pages ${p.id} / block ${id}`
    )
    arr(p.blocks)
      .map((d) => asDecision(d).block)
      .filter((b) => shared.has(b))
      .forEach((b) =>
        r.fail(`pages ${p.id} / block ${b}`, 'block is decided in sharedBlocks and again on the page')
      )
  })
  decisions.forEach((x) => {
    const parts = decisionParts(x.d)
    const topCopy = arr(x.d.copy)
      .map((c) => obj(c).slot)
      .filter(has)
    dupes(topCopy, 'slot', (id) => W(x, `slot ${id}`))
    const copied = new Set(parts.copy.map((c) => c.slot))
    parts.hidden.forEach((h) => {
      if (copied.has(h.slot)) r.fail(W(x, `slot ${h.slot}`), 'slot is in copy and in hiddenSlots')
    })
    dupes(
      parts.hidden.map((h) => h.slot),
      'hidden slot',
      (id) => W(x, `slot ${id}`)
    )
    dupes(
      parts.pics.map((p) => p.frame),
      'picture wish',
      (id) => W(x, `frame ${id}`)
    )
    dupes(
      parts.lists.map((l) => l.list),
      'list',
      (id) => W(x, `list ${id}`)
    )
    dupes(
      parts.links.map((l) => l.link),
      'link',
      (id) => W(x, `link ${id}`)
    )
  })
}

// R12 contact channel promises: a block whose copy names WhatsApp, a DM / Instagram or a call must link to
// that channel in the same block (links[].leadsTo "<kind>:<factId>"). Slots whose kit role is contact.* print
// the channel itself and are skipped; so are contact setting slots (site.settingSlots entries whose kind
// starts with "contact", e.g. contact-mobile), which are the channel field itself. The checker reads words; it cannot see a channel promised in other words.
export function checkR12(ctx) {
  const { R, kit, slotRole, keptDecisions, decisionParts, W } = ctx
  const r = R.r12
  const contactSettingSlots = new Set(
    arr(obj(kit.site).settingSlots)
      .filter((s) => str(obj(s).kind).startsWith('contact'))
      .map((s) => s.id)
  )
  const KINDS = [
    ['whatsapp', /whats\s?app/i],
    // A DM is the promise; naming Instagram alone (followers, follow us) is not a contact channel.
    ['social', /\bDMs?\b|direct message/i],
    ['phone', /\bcall\b|\bphone\b|ring us/i]
  ]
  keptDecisions.forEach((x) => {
    const parts = decisionParts(x.d)
    const linked = new Set(
      parts.links.map((l) => (/^([a-z]+):/.exec(str(l.leadsTo)) || [])[1]).filter(Boolean)
    )
    const hidden = new Set(parts.hidden.map((h) => h.slot))
    parts.copy.forEach((c) => {
      if (
        !has(c.slot) ||
        hidden.has(c.slot) ||
        str(slotRole.get(c.slot)).startsWith('contact.') ||
        contactSettingSlots.has(c.slot)
      )
        return
      const words = `${str(c.says)} ${str(c.text)}`
      for (const [kind, re] of KINDS) {
        if (!re.test(words)) continue
        if (linked.has(kind)) r.ok()
        else
          r.fail(
            W(x, `slot ${c.slot}`),
            `names a ${kind} channel ("${str(c.says).slice(0, 70)}") but the block has no link leading to ${kind}:<factId>`,
            'plan'
          )
      }
    })
  })
}
