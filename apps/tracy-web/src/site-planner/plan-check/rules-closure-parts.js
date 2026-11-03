import { arr, has, obj, str } from './rule-set.js'

// R10b list / frame / link closure + picture wishes
export function checkR10b(ctx) {
  const {
    R,
    kit,
    navGroups,
    logoIds,
    blockIx,
    linkIx,
    slotRow,
    isLabelSlot,
    linkLabelSlot,
    slotOwnedBy,
    keptDecisions,
    decisionParts,
    W
  } = ctx
  const r = R.r10b
  const navBlocks = new Set([...navGroups.values()].map((g) => g.block))
  // Label slots decided anywhere in the kept plan: written (with text) or hidden. A label slot can be owned by
  // another block (a menu label shown in several blocks), so the check looks across the whole plan.
  const labelWritten = new Set()
  const labelHidden = new Set()
  const labelDecided = new Set() // slots with any copy entry (says and/or text)
  // Business-name slots (site.nameSlots) are filled by the brand step, never by the plan: no "text" is demanded.
  const nameSlotIds = new Set(
    arr(obj(kit.site).nameSlots)
      .filter((n) => obj(n).kind === 'slot' && has(n.id))
      .map((n) => n.id)
  )
  keptDecisions.forEach((x) => {
    const pp = decisionParts(x.d)
    pp.copy.forEach((c) => {
      labelDecided.add(c.slot)
      if (has(c.text)) labelWritten.add(c.slot)
    })
    pp.hidden.forEach((h) => labelHidden.add(h.slot))
  })
  // Whether a kept, non-hidden link other than exceptLink still uses the label slot, anywhere in the plan.
  const labelStillUsed = (labelId, exceptLink) =>
    keptDecisions.some((y) => {
      const oy = blockIx.get(y.d.block)
      if (!oy) return false
      const hy = new Set(decisionParts(y.d).hidden.map((h) => h.slot))
      for (const lid of oy.links.keys())
        if (lid !== exceptLink && !hy.has(lid) && linkLabelSlot.get(lid) === labelId) return true
      return false
    })
  keptDecisions.forEach((x) => {
    const o = blockIx.get(x.d.block)
    if (!o) return
    const parts = decisionParts(x.d)
    const hiddenSet = new Set(parts.hidden.map((h) => h.slot))
    const hiddenLists = hiddenSet
    const rowsOf = new Map(
      parts.lists.map((l) => [l.list, typeof l.rows === 'number' ? l.rows : arr(l.items).length])
    )
    for (const lid of o.lists.keys()) {
      if (rowsOf.has(lid) || hiddenSet.has(lid)) r.ok()
      else r.fail(W(x, `list ${lid}`), 'list is neither in lists nor in hiddenSlots')
    }
    const wished = new Set(parts.pics.map((p) => p.frame))
    for (const [fid, f] of o.frames) {
      if (f.kind === 'logo' || logoIds.has(fid) || has(f.twinOf) || f.fixed) continue
      const sr = slotRow.get(fid)
      if (sr) {
        if (hiddenLists.has(sr.list)) continue
        const n = rowsOf.get(sr.list)
        if (typeof n === 'number' && sr.row >= n) continue
      }
      if (wished.has(fid) || hiddenSet.has(fid)) r.ok()
      else
        r.fail(W(x, `frame ${fid}`), `frame (${f.kind}) has neither a picture wish nor a hiddenSlots entry`)
    }
    if (!navBlocks.has(x.d.block)) {
      const decidedLinks = new Set(parts.links.map((l) => l.link))
      for (const lid of o.links.keys()) {
        if (decidedLinks.has(lid) || hiddenSet.has(lid)) r.ok()
        else r.fail(W(x, `link ${lid}`), 'link is neither in links nor in hiddenSlots')
      }
    }
    parts.links.forEach((l) => {
      const w = W(x, `link ${l.link}`)
      const want = linkLabelSlot.get(l.link) ?? null
      if (!('labelSlot' in l))
        return r.fail(
          w,
          `link has no "labelSlot" (the kit's label slot is ${want ?? 'none, so null'})`,
          'plan'
        )
      const got = l.labelSlot ?? null
      if (got !== want)
        return r.fail(
          w,
          `labelSlot is ${got ?? 'null'} but the kit ties this link to ${want ?? 'no label slot (null)'}`,
          'plan'
        )
      // "text" exists only on slots whose kit role ends in _label (R04); other label slots must just be decided.
      if (want && !nameSlotIds.has(want) && !labelHidden.has(want)) {
        if (isLabelSlot(want)) {
          if (!labelWritten.has(want))
            return r.fail(w, `label slot ${want} has no "text" in copy and is not hidden`, 'plan')
        } else if (!labelDecided.has(want))
          return r.fail(w, `label slot ${want} is neither in copy nor hidden`, 'plan')
      }
      r.ok()
    })
    // A link the plan hides (its target cannot be set) takes its label slot with it.
    parts.hidden.forEach((h) => {
      const want = linkLabelSlot.get(h.slot)
      if (!want || !linkIx.has(h.slot)) return
      // Exception: the label slot is owned by another block and shared (alsoShownIn). Hiding this link is correct (for
      // example R13, a link must not lead to its own page); the label must still be written for the owner's link while a
      // kept, non-hidden link elsewhere in the plan still uses it. If every such link is hidden, R10b fails as before.
      const owner = slotOwnedBy.get(want)
      if (
        labelWritten.has(want) &&
        !labelHidden.has(want) &&
        owner &&
        owner !== x.d.block &&
        labelStillUsed(want, h.slot)
      )
        return r.ok()
      if (labelWritten.has(want) && !labelHidden.has(want))
        r.fail(W(x, `link ${h.slot}`), `link is hidden but its label slot ${want} is still written`, 'plan')
      else r.ok()
    })
    parts.pics.forEach((p) => {
      const f = o.frames.get(p.frame)
      const w = W(x, `frame ${p.frame}`)
      if (has(p.sameAs)) return r.ok() // sameAs wish: shows the same picture as another frame, R18 checks it
      if (!['any-real', 'specific', 'person'].includes(p.match))
        return r.fail(w, `match "${p.match}" is not any-real|specific|person`)
      r.ok()
      if (!has(p.size)) r.fail(w, 'picture wish has no size')
      if (p.match === 'specific') {
        ;['shows', 'mood'].forEach((k) => {
          if (!has(p[k])) r.fail(w, `specific picture wish has no "${k}"`)
        })
        ;['mustInclude', 'avoid'].forEach((k) => {
          if (!arr(p[k]).length) r.fail(w, `specific picture wish has empty "${k}"`)
        })
      }
      if (f && f.kind === 'cutout') {
        if (!/cut ?out/i.test(str(p.size)))
          r.fail(w, 'cutout wish: size must say "cut out, clear background"')
        if (!has(p.shows)) r.fail(w, 'cutout wish: shows must name one subject')
      }
      if (f && f.kind === 'icon' && p.match === 'any-real')
        r.fail(w, 'icon frame must not use match "any-real"')
    })
  })
  r.note(
    'guess: picture wishes use the documented fields frame/match/size/shows/mustInclude/avoid/mood/factIds; icon "any-real" is flagged because an icon is never a real photo'
  )
}
