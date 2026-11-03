// Gate sections: header (kind, version, kit), the name and its slots (decision 21), and the colours (accent only,
// decisions C, 8 and 9). Each section only appends rejected fields to ctx.
import { HEX } from './gate-context.js'
import { liftAccent, neutralReason } from './colour-math.js'

export function checkHeaderAndName(ctx) {
  const { b, bad, exact, NS } = ctx
  if (b.kind !== 'brand-file') bad('kind', 'must be "brand-file"')
  if (b.version !== 10) bad('version', 'must be 10')
  if (b.kit !== ctx.kitId) bad('kit', `must be "${ctx.kitId}" (kit quickstart.product@quickstart.version)`)
  if (b.name?.value !== (exact ?? null) && !(typeof exact !== 'string' && b.name?.value == null)) {
    bad('name.value', `must be exactly brief.brand.name ("${exact}")`)
  }
  if (b.name?.from !== 'brief.brand.name') bad('name.from', 'must be "brief.brand.name"')

  // name slots, recomputed by name_slots from the kit and the brief
  if (!Array.isArray(b.name?.slots)) {
    bad('name.slots', 'array: every kit site.nameSlots slot once, as name_slots returned it')
    return
  }
  const got = new Map()
  for (const s of b.name.slots) got.set(s?.id, [...(got.get(s?.id) ?? []), s])
  for (const want of NS.slots) {
    const hit = got.get(want.id) ?? []
    if (hit.length !== 1) {
      bad('name.slots', `slot "${want.id}" must appear exactly once (found ${hit.length})`)
      continue
    }
    const s = hit[0]
    for (const k of ['kind', 'current', 'status', 'value', 'handOff']) {
      if (s[k] !== want[k])
        bad(
          `name.slots["${want.id}"].${k}`,
          `must equal what name_slots computes (${JSON.stringify(want[k])})`
        )
    }
    if (
      want.status === 'handed-off' &&
      !(s.handOff === 'writer' && typeof s.reason === 'string' && s.reason.trim())
    ) {
      bad(`name.slots["${want.id}"].reason`, 'a hand-off has handOff "writer" and a reason')
    }
    if (want.status === 'written' && s.value !== want.value)
      bad(`name.slots["${want.id}"].value`, `must be ${JSON.stringify(want.value)}`)
  }
  const known = new Set(NS.slots.map((x) => x.id))
  for (const id of got.keys())
    if (!known.has(id)) bad('name.slots', `slot "${id}" is not in the kit's nameSlots`)
}

export function checkColours(ctx) {
  const { b, brief, K, bad, fileOk } = ctx
  const C = b.colours ?? {}
  ctx.C = C
  const tplAccent = K.site.brandColours.primary?.value?.toLowerCase()
  const briefColours = [...(brief?.brand?.colors ?? []).map((c) => c.hex), brief?.brand?.accent?.hex]
    .filter(Boolean)
    .map((h) => h.toLowerCase())
  const usable = brief?.brand?.colorsFrom === 'logo' ? briefColours.filter((h) => !neutralReason(h)) : []
  if (!['new-accent', 'kept-template'].includes(C.decision))
    bad('colours.decision', 'new-accent | kept-template')
  if (!C.why) bad('colours.why', 'one sentence')
  if (C.replaces !== tplAccent) bad('colours.replaces', `the template's accent "${tplAccent}"`)
  if (C.keeps !== 'template')
    bad(
      'colours.keeps',
      'must be "template" (backgrounds, heading and body text colours, fonts never change)'
    )
  for (const k of ['bg', 'system', 'text', 'fonts'])
    if (k in C) bad(`colours.${k}`, 'not in version 5: only the accent changes')
  if (C.decision === 'new-accent') {
    if (!HEX.test(C.brandColour ?? ''))
      bad('colours.brandColour', '#rrggbb: the brief colour the accent was built from')
    else checkBrandColour(ctx, C, usable, tplAccent)
    if (!Number.isInteger(C.builds) || C.builds < 1 || C.builds > 2) bad('colours.builds', '1 or 2')
    if (!Array.isArray(C.shifts)) bad('colours.shifts', 'array (empty when the accent did not move)')
    else {
      C.shifts.forEach((s, i) => {
        if (!['dark', 'light'].includes(s.side)) bad(`colours.shifts[${i}].side`, 'dark|light')
        if (typeof s.opens !== 'boolean')
          bad(`colours.shifts[${i}].opens`, 'boolean: true on the side the site opens on')
        if (!['accent', 'accent-text'].includes(s.colour))
          bad(`colours.shifts[${i}].colour`, 'accent | accent-text (only the accent shifts)')
        for (const k of ['from', 'to', 'on'])
          if (!HEX.test(s[k] ?? '')) bad(`colours.shifts[${i}].${k}`, '#rrggbb')
        if (HEX.test(s.from ?? '') && s.from.toLowerCase() !== C.accent?.toLowerCase())
          bad(`colours.shifts[${i}].from`, 'must be colours.accent (the colour built, after the lift)')
        if (typeof s.ratio !== 'number') bad(`colours.shifts[${i}].ratio`, 'number')
      })
    }
    if (!C.module || typeof C.module !== 'object') bad('colours.module', '{ file, bytes, slot }')
    else {
      fileOk('colours.module.file', C.module.file)
      if (!Number.isInteger(C.module.bytes) || C.module.bytes < 1 || C.module.bytes > 64000)
        bad('colours.module.bytes', '1..64000')
      if (!/^.+@.+$/.test(C.module.slot ?? '')) bad('colours.module.slot', '"<slot contract id>@<version>"')
    }
  } else if (C.decision === 'kept-template') {
    if (C.accent?.toLowerCase() !== tplAccent)
      bad('colours.accent', `kept-template: the template's accent "${tplAccent}"`)
    if (C.builds !== 0) bad('colours.builds', 'kept-template builds nothing: 0')
    if (!Array.isArray(C.shifts) || C.shifts.length) bad('colours.shifts', 'kept-template: []')
    if (C.module !== null) bad('colours.module', 'kept-template: null')
    if (C.brandColour !== null) bad('colours.brandColour', 'kept-template: null')
    if (C.lift !== null) bad('colours.lift', 'kept-template: null')
  }
}

/** The brief colour the accent was built from, and the lift the design system build made from it (recomputed). */
function checkBrandColour(ctx, C, usable, tplAccent) {
  const { brief, G, bad } = ctx
  const bc = C.brandColour.toLowerCase()
  if (neutralReason(bc))
    bad('colours.brandColour', `${neutralReason(bc)}: black, grey and white are never an accent`)
  else if (!usable.includes(bc)) {
    bad(
      'colours.brandColour',
      brief?.brand?.colorsFrom === 'logo'
        ? 'not one of brief.brand.colors / brief.brand.accent'
        : 'brief.brand.colorsFrom is not "logo": keep the template\'s accent'
    )
  }
  if (bc === tplAccent) bad('colours.brandColour', "the template's own accent: that is kept-template")
  if (neutralReason(bc)) return // already rejected
  const want = liftAccent(bc, G.opening, G.other)
  if (!want.to) {
    bad('colours.brandColour', `cannot be worn: ${want.refused}`)
  } else if (!want.lifted) {
    if (C.lift !== null)
      bad('colours.lift', `null: ${bc} reads ${want.before.opening}:1 on the opening ground as given`)
    if ((C.accent ?? '').toLowerCase() !== bc) bad('colours.accent', 'no lift: must be colours.brandColour')
  } else {
    if (!C.lift || typeof C.lift !== 'object') {
      bad(
        'colours.lift',
        `${bc} reads ${want.before.opening}:1 on the opening ground ${G.opening}: record the lift build_design_system made`
      )
    } else {
      if ((C.lift.from ?? '').toLowerCase() !== bc) bad('colours.lift.from', 'must be colours.brandColour')
      if ((C.lift.to ?? '').toLowerCase() !== want.to)
        bad(
          'colours.lift.to',
          `the tool's lift of ${bc} is ${want.to} (copy it from build_design_system, never pick it)`
        )
      if (C.lift.lightnessFrom !== want.lightnessFrom || C.lift.lightnessTo !== want.lightnessTo) {
        bad(
          'colours.lift.lightnessFrom/To',
          `${want.lightnessFrom} -> ${want.lightnessTo} (from build_design_system)`
        )
      }
      if (typeof C.lift.say !== 'string' || !C.lift.say.trim())
        bad('colours.lift.say', "one plain sentence for the owner, in the site's language")
    }
    if ((C.accent ?? '').toLowerCase() !== want.to)
      bad('colours.accent', `lifted: must be colours.lift.to (${want.to})`)
  }
}
