// Index of a template kit for the site plan checker: groups, pages, blocks, slots, frames, links and their
// limits, roles and label slots. Ported from the approved checker script, section "index the kit".
import { arr, has, obj, str } from './rule-set.js'

export function pageBlockOrder(page) {
  const w = obj(page.blocks)
  const widths = Object.keys(w)
  const key = w['1440'] ? '1440' : widths[0]
  const seen = new Set()
  const order = []
  for (const k of [key, ...widths])
    for (const id of arr(w[k]))
      if (!seen.has(id)) {
        seen.add(id)
        order.push(id)
      }
  return order // desktop order first, then any phone-only blocks
}

export function indexKit(kit) {
  const kitGroups = new Map(arr(kit.pageGroups).map((g) => [g.id, g]))
  const kitPages = new Map(arr(kit.pages).map((p) => [p.id, p]))
  const kitBlocks = new Map(arr(kit.blocks).map((b) => [b.id, b]))
  const navGroups = new Map(arr(obj(kit.site).navigationGroups).map((g) => [g.id, g]))
  const formBlocks = new Set(arr(obj(kit.site).forms).map((f) => f.block))
  const logoIds = new Set()
  for (const s of arr(obj(kit.site).logoSpots)) {
    logoIds.add(s.id)
    logoIds.add(s.frameId)
  }
  for (const b of kitBlocks.values()) for (const f of arr(b.frames)) if (f.kind === 'logo') logoIds.add(f.id)

  // Per block: every slot id, limits, row membership, frames, links, lists, fixed texts.
  const blockIx = new Map()
  const audioLinkProblems = new Map()
  const linkIx = new Map() // link id -> kit link
  const slotOwner = new Map() // slot id -> block id
  const slotLimit = new Map()
  const slotRow = new Map() // slot id -> { list, row }
  const frameById = new Map()
  const framesBlock = new Map() // frame id -> block id
  function ix(b) {
    const o = {
      slots: new Set(),
      frames: new Map(),
      links: new Map(),
      lists: new Map(),
      fields: new Map(),
      fixed: [],
      demo: arr(b.demoOwned)
    }
    const addSlot = (id, limit, list, row) => {
      if (!has(id)) return
      o.slots.add(id)
      if (!slotOwner.has(id)) slotOwner.set(id, b.id)
      if (typeof limit === 'number') slotLimit.set(id, limit)
      if (list !== undefined && !slotRow.has(id)) slotRow.set(id, { list, row })
    }
    for (const d of o.demo) addSlot(d.id)
    // Block-level text slots (heading, intro, button) the kit lists in the block's own slots array.
    for (const s of arr(b.slots)) addSlot(s.id, s.maxCharacters)
    for (const l of arr(b.lists)) {
      o.lists.set(l.id, l)
      arr(l.rows).forEach((row, ri) =>
        arr(row.slots).forEach((s) => addSlot(s.id, s.maxCharacters, l.id, ri))
      )
      // Lists of rowKind "items" name their row slots by field ("title", "summary", "custom:..."), not by id.
      o.fields.set(
        l.id,
        new Set(
          arr(l.rowSlots)
            .map((rs) => rs.field)
            .filter(has)
        )
      )
      for (const rs of arr(l.rowSlots)) {
        addSlot(rs.id, rs.maxCharacters)
        arr(rs.slots).forEach((s, si) => {
          const ri = Array.isArray(l.shown) ? l.shown.indexOf(s.item) : si
          addSlot(s.id, s.maxCharacters ?? rs.maxCharacters, l.id, ri < 0 ? si : ri)
        })
      }
    }
    for (const f of arr(b.frames)) {
      o.frames.set(f.id, f)
      frameById.set(f.id, f)
      framesBlock.set(f.id, b.id)
      if (!slotOwner.has(f.id)) slotOwner.set(f.id, b.id)
    }
    for (const l of arr(b.links)) {
      o.links.set(l.id, l)
      if (l.action === 'media-source') {
        const s = l.sourceBinding
        const row = s?.jsonPath?.[2]
        const valid =
          l.mediaKind === 'audio' &&
          l.id === l.sourceSlot &&
          !l.labelId &&
          /^article-\d+$/.test(s?.entity ?? '') &&
          s.column === 'attribs' &&
          s.jsonPath?.length === 3 &&
          s.jsonPath[0] === 'ctm_audio' &&
          s.jsonPath[1] === 'audio-src' &&
          /^(?:0|[1-9]\d*)$/.test(String(row)) &&
          Number.isSafeInteger(Number(row)) &&
          s.group?.id === `${s.entity}.audio.${Number(row)}` &&
          s.group.item === Number(row) &&
          s.group.kind === 'business' &&
          [b.source?.entity, ...arr(b.source?.contains)].includes(s.entity)
        if (!valid) audioLinkProblems.set(l.id, 'audio source has no exact article/track owner binding')
      }
      if (linkIx.has(l.id) && (l.action === 'media-source' || linkIx.get(l.id)?.action === 'media-source'))
        audioLinkProblems.set(l.id, 'audio source id occurs more than once in the kit')
      linkIx.set(l.id, l)
    }
    o.fixed = arr(b.fixedText).map((t) => ({ ...t, block: b.id }))
    blockIx.set(b.id, o)
  }
  kitBlocks.forEach(ix)
  // Kit role of every slot (deep scan: block slots, row slots, site fields). A label slot is one whose role
  // ends in "_label" (menu item, button, tab, social link); the plan gives its printed words in "text".
  const slotRole = new Map()
  ;(function scanRoles(o, depth) {
    if (!o || typeof o !== 'object' || depth > 10) return
    if (!Array.isArray(o) && has(o.id) && has(o.role) && !slotRole.has(o.id)) slotRole.set(o.id, o.role)
    for (const v of Object.values(o)) scanRoles(v, depth + 1)
  })(kit, 0)
  const isLabelSlot = (id) => str(slotRole.get(id)).endsWith('_label')
  // Label slot of each link: the slot whose kit "labelOf" lists the link. A link the kit ties to no slot has
  // none (labelSlot null in the plan); the planner never picks one itself.
  const linkLabelSlot = new Map()
  ;(function scanLabelOf(o, depth) {
    if (!o || typeof o !== 'object' || depth > 10) return
    if (!Array.isArray(o) && has(o.id) && Array.isArray(o.labelOf))
      for (const l of o.labelOf) if (has(l) && !linkLabelSlot.has(l)) linkLabelSlot.set(l, o.id)
    for (const v of Object.values(o)) scanLabelOf(v, depth + 1)
  })(kit, 0)
  // The link's own "labelId" is authoritative; "labelOf" on slots is only the fallback for links without one.
  for (const [lid, kl] of linkIx) if (has(kl.labelId)) linkLabelSlot.set(lid, kl.labelId)
  // Items the kit marks writable:false: the page prints them but nothing can write them. The plan may name
  // them (hidden, a note) but never write text into them.
  const unwritable = new Set()
  ;(function scanUnwritable(o, depth) {
    if (!o || typeof o !== 'object' || depth > 8) return
    if (!Array.isArray(o) && o.writable === false) {
      const id = o.slot ?? o.slotId ?? o.id
      if (has(id)) unwritable.add(id)
    }
    for (const v of Object.values(o)) scanUnwritable(v, depth + 1)
  })(kit, 0)
  // Contact fields: the kit gives each field of site.contactBlocks a slot id (accepts.fields[] and lines[]).
  // Only ids the kit gives count; an id the planner composes itself is never accepted.
  for (const cb of arr(obj(kit.site).contactBlocks)) {
    const o = blockIx.get(cb.block)
    if (!o) continue
    const ids = [...arr(obj(cb.accepts).fields), ...arr(cb.lines)]
      .map((f) => obj(f).slot ?? obj(f).slotId ?? obj(f).id)
      .filter(has)
    for (const id of ids) {
      if (unwritable.has(id)) continue
      o.slots.add(id)
      if (!slotOwner.has(id)) slotOwner.set(id, cb.block)
    }
  }
  // Fixed texts also live under site.fixedTexts (with a block field); merge without duplicates.
  for (const t of arr(obj(kit.site).fixedTexts)) {
    const o = blockIx.get(t.block)
    if (o && !o.fixed.some((x) => x.text === t.text)) o.fixed.push({ ...t })
  }
  // Navigation labels carry limits too.
  for (const g of navGroups.values())
    for (const it of arr(g.items))
      if (has(it.labelSlot) && typeof it.maxCharacters === 'number')
        slotLimit.set(it.labelSlot, it.maxCharacters)

  // Slots a block owns in the kit (ownedBy): a shared slot is listed in several blocks but owned by one.
  const slotOwnedBy = new Map()
  for (const b of kitBlocks.values())
    for (const sl of arr(b.slots)) if (has(sl.id) && has(sl.ownedBy)) slotOwnedBy.set(sl.id, sl.ownedBy)

  return {
    kitGroups,
    kitPages,
    kitBlocks,
    navGroups,
    formBlocks,
    logoIds,
    blockIx,
    linkIx,
    audioLinkProblems,
    slotOwner,
    slotOwnedBy,
    slotLimit,
    slotRow,
    frameById,
    framesBlock,
    slotRole,
    isLabelSlot,
    linkLabelSlot,
    unwritable
  }
}
