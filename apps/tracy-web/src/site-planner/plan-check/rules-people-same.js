import { arr, has, obj, str } from './rule-set.js'

// R17 person frames.
// Why: a person frame must never be generated or filled with another person's photo; marking it "person" lets
// the picture step fall back to initials. A person row is a list row whose name copy slot has a kit role
// ending in "person.name" (or whose list rowSlots roles start with "person."). (a) every picture wish in such
// a row must have match "person". (b) every wish with match "person" must carry `person`, the fact id of that
// person, and that fact must exist in the brief with a people field (team).
export function checkR17(ctx) {
  const { R, kitBlocks, slotRole, facts, decisions, decisionParts, W } = ctx
  const r = R.r17
  const PEOPLE_FIELDS = new Set(['team', 'staff', 'people'])
  const personLists = new Set()
  for (const b of kitBlocks.values())
    for (const l of arr(b.lists)) {
      const roles = [...arr(l.rowSlots), ...arr(l.rows).flatMap((row) => arr(obj(row).slots))].map((s) =>
        str(obj(s).role)
      )
      if (roles.some((x) => x.endsWith('person.name') || x.startsWith('person.'))) personLists.add(l.id)
    }
  decisions.forEach((x) =>
    decisionParts(x.d).lists.forEach((l) =>
      arr(l.items).forEach((it, i) => {
        const item = obj(it)
        const personRow =
          personLists.has(l.list) ||
          arr(item.copy).some((c) => str(slotRole.get(obj(c).slot)).endsWith('person.name'))
        if (!personRow) return
        arr(item.pictures)
          .map(obj)
          .forEach((p) => {
            if (p.match === 'person' || has(p.sameAs)) return
            r.fail(
              W(x, `list ${l.list} / row ${i} (${str(item.about)}) / frame ${p.frame}`),
              `picture in a person row must have match "person"; block ${x.d.block}, row ${i}, frame ${p.frame}, current match "${str(p.match)}", shows "${str(p.shows).slice(0, 80)}"`,
              'plan'
            )
          })
      })
    )
  )
  decisions.forEach((x) =>
    decisionParts(x.d).pics.forEach((p) => {
      if (p.match !== 'person') return
      const w = W(x, `frame ${p.frame}`)
      const f = facts.get(p.person)
      if (!has(p.person)) r.fail(w, 'match "person" needs `person` set to the fact id of that person', 'plan')
      else if (!f) r.fail(w, `person "${p.person}" is not a fact id in the brief`, 'plan')
      else if (!PEOPLE_FIELDS.has(str(f.field)))
        r.fail(w, `person fact ${p.person} has field "${str(f.field)}", not a people field (team)`, 'plan')
      else r.ok()
    })
  )
}

// R18 same picture twice within one item.
// Why: the template shows the same picture twice within one item on purpose (e.g. a class page shows its
// video still at the top and again further down); without sameAs the picture step may pick two different
// photos. Groups come from the kit: image slots whose demo sample is an image file, grouped by (item, file),
// where item is the slot id before its last "." (article-16.6 -> article-16). Slot ids equal frame ids. In a
// group of 2+ active frames (not hidden by the plan, not a twinOf follower, block kept) the first frame has a
// normal wish and every other one has a wish with only frame, kind and sameAs pointing at a frame of the
// same group that has a full wish. Fails: two or more full wishes in a group; sameAs pointing outside the
// group (or at a frame without a full wish); a sameAs wish that also has its own shows; an active frame
// with no wish at all. Same file across different items does not count.
export function checkR18(ctx) {
  const { R, kitBlocks, frameById, framesBlock, decisions, keptDecisions, decisionParts } = ctx
  const r = R.r18
  const IMG = /\.(jpe?g|png|webp|gif|svg|avif)$/i
  const groups = new Map() // "item|file" -> [frame id]
  for (const b of kitBlocks.values())
    for (const d of arr(b.demoOwned)) {
      const file = str(d.sample).split('#')[0]
      if (!IMG.test(file) || !has(d.id) || !frameById.has(d.id)) continue
      const item = d.id.includes('.') ? d.id.slice(0, d.id.lastIndexOf('.')) : d.id
      const key = `${item}|${file}`
      groups.set(key, [...(groups.get(key) || []), d.id])
    }
  const multi = [...groups.entries()].filter(([, ids]) => ids.length > 1)
  r.note(
    `kit groups of 2+ frames sharing one image file inside one item: ${multi.length ? multi.map(([k, ids]) => `${k.split('|')[0]} (${ids.join(', ')}; ${k.split('|')[1]})`).join(' | ') : 'none'}`
  )
  const wishOf = new Map()
  const hiddenAll = new Set()
  decisions.forEach((x) => {
    const pp = decisionParts(x.d)
    pp.pics.forEach((p) => {
      if (has(p.frame) && !wishOf.has(p.frame)) wishOf.set(p.frame, p)
    })
    pp.hidden.forEach((h) => hiddenAll.add(h.slot))
  })
  const keptBlockIds = new Set(keptDecisions.map((x) => x.d.block))
  for (const [key, ids] of multi) {
    const item = key.split('|')[0]
    const where = (fid) => `item ${item} / frame ${fid}`
    if (!keptBlockIds.has(framesBlock.get(ids[0]))) continue
    const active = ids.filter((id) => !hiddenAll.has(id) && !has(obj(frameById.get(id)).twinOf))
    if (active.length < 2) {
      r.ok()
      continue
    }
    const full = active.filter((id) => wishOf.has(id) && !has(wishOf.get(id).sameAs))
    if (full.length > 1)
      r.fail(
        `item ${item} / frames ${full.join(', ')}`,
        `${full.length} full picture wishes for frames that show the same picture (${key.split('|')[1]}); keep one and give the others sameAs: "<first frame id>"`,
        'plan'
      )
    else r.ok()
    for (const id of active) {
      const w = wishOf.get(id)
      if (!w) {
        r.fail(where(id), 'active frame in a same-picture group has no picture wish', 'plan')
        continue
      }
      if (!has(w.sameAs)) continue
      if (!ids.includes(w.sameAs))
        r.fail(
          where(id),
          `sameAs "${w.sameAs}" is not a frame of this same-picture group (${ids.join(', ')})`,
          'plan'
        )
      else if (w.sameAs === id) r.fail(where(id), 'sameAs points at the frame itself', 'plan')
      else if (!full.includes(w.sameAs))
        r.fail(
          where(id),
          `sameAs "${w.sameAs}" has no full wish of its own (hidden, missing or itself a sameAs)`,
          'plan'
        )
      else r.ok()
      if (has(w.shows))
        r.fail(
          where(id),
          `sameAs wish also has its own shows ("${str(w.shows).slice(0, 60)}"); it must only carry frame, kind and sameAs`,
          'plan'
        )
    }
  }
}
