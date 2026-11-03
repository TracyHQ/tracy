import { arr, has, obj, str } from './rule-set.js'

// R14 picture kind, R15 one subject.
// Why: the picture step reads the plan only, and it handles kinds differently (icons are matched from an icon
// library, cutouts need a clear background, photos are made or found). So every wish must carry the frame's
// kind (photo, cutout, icon) and it must equal the kit frame's kind; the step must not guess it from the
// words. A "shows" line with alternatives ("A or B") leaves the choice to a step that cannot judge it, so
// the planner must pick one subject. R15 applies to all kinds. Logo frames get no wish (R10b/R03).
export function checkR14R15(ctx) {
  const { R, frameById, decisions, decisionParts, W } = ctx
  const r14 = R.r14,
    r15 = R.r15
  decisions.forEach((x) => {
    decisionParts(x.d).pics.forEach((p) => {
      const w = W(x, `frame ${p.frame}`)
      const f = frameById.get(p.frame)
      if (f && has(f.kind)) {
        if (!has(p.kind)) r14.fail(w, `picture wish has no "kind"; the kit frame kind is "${f.kind}"`, 'plan')
        else if (p.kind !== f.kind)
          r14.fail(w, `wish kind "${p.kind}" differs from the kit frame kind "${f.kind}"`, 'plan')
        else r14.ok()
      } else if (f) r14.fail(w, 'kit frame has no "kind", cannot compare', 'kit')
      if (has(p.shows)) {
        if (/\bor\b/i.test(str(p.shows)))
          r15.fail(w, `shows offers alternatives, pick one subject: "${str(p.shows)}"`, 'plan')
        else r15.ok()
      }
    })
  })
  r14.note('frames unknown to the kit are reported by R01, not here; logo frames get no wish')
}

// R16 a row's own point.
// Why: a review or team/place/audience fact describes the business as a whole; when cited by one row it turns
// a shared point into a false distinguishing point. The shared point belongs once in the block intro or in
// proof. So in a list row, every copy entry other than the row's name line (and label slots) may cite only
// the facts the name line cites. proof.factIds are exempt. A row with no identifiable name line is skipped
// and counted in the notes.
// Two exemptions: only lists with 2 or more kept rows are checked (the rule compares rows side by side; a single
// row is skipped, noted as "single row"), and facts whose brief field is a contact channel (phone, email, address,
// socials, ... plus every key of brief.contact) never count as foreign, since a contact line is not a distinguishing point.
export function checkR16(ctx) {
  const { R, brief, kitBlocks, slotRole, facts, decisions, W } = ctx
  const r = R.r16
  // Kit list definitions: name slot ids and role per slot id, per list id.
  const listDefs = new Map()
  for (const b of kitBlocks.values())
    for (const l of arr(b.lists)) {
      const nameIds = new Set()
      const roleOf = new Map()
      const isName = (rs) =>
        rs.kind === 'title' ||
        str(rs.role).endsWith('.name') ||
        (l.rowKind !== 'items' && /(_name|title)$/.test(str(rs.role)))
      for (const rs of arr(l.rowSlots)) {
        const ids = [rs.id, ...arr(rs.slots).map((s) => obj(s).id)].filter(has)
        ids.forEach((id) => roleOf.set(id, rs.role))
        if (isName(rs)) ids.forEach((id) => nameIds.add(id))
      }
      for (const row of arr(l.rows))
        for (const sl of arr(obj(row).slots)) {
          const sx = obj(sl)
          if (!has(sx.id)) continue
          roleOf.set(sx.id, sx.role)
          if (isName(sx)) nameIds.add(sx.id)
        }
      listDefs.set(l.id, { nameIds, roleOf })
    }
  const CONTACT_FIELDS = new Set([
    'phone',
    'otherPhones',
    'email',
    'whatsapp',
    'address',
    'contactChannels',
    'socials',
    ...Object.keys(obj(brief.contact))
  ])
  let skipped = 0
  let single = 0
  decisions.forEach((x) =>
    arr(obj(x.d).lists).forEach((l) => {
      const def = listDefs.get(l.list)
      if (arr(l.items).length < 2) {
        single++
        return
      }
      arr(l.items).forEach((it, i) => {
        const item = obj(it)
        const where = (c) => W(x, `list ${l.list} / row ${i} (${str(item.about)}) / slot ${c.slot}`)
        const copies = arr(item.copy).map(obj)
        const names = def ? copies.filter((c) => def.nameIds.has(c.slot)) : []
        if (!names.length) {
          skipped++
          return
        }
        const own = new Set(names.flatMap((c) => arr(c.factIds)))
        copies.forEach((c) => {
          if (names.includes(c)) return
          const role = str(def.roleOf.get(c.slot) || slotRole.get(c.slot))
          if (role.endsWith('_label')) return
          const foreign = arr(c.factIds).filter(
            (f) => !own.has(f) && !CONTACT_FIELDS.has(str(obj(facts.get(f)).field))
          )
          if (foreign.length) {
            const desc = foreign
              .map((f) => `${f} (${str(obj(facts.get(f)).field) || 'unknown field'})`)
              .join(', ')
            r.fail(
              where(c),
              `cites facts outside the row's own name line: ${desc}; says "${str(c.says).slice(0, 80)}". A fact about the whole business belongs once in the block intro or in proof`,
              'plan'
            )
          } else r.ok()
        })
      })
    })
  )
  r.note(`rows skipped for lacking an identifiable name copy: ${skipped}`)
  r.note(`lists skipped, single row: ${single}`)
}
