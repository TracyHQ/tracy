// build_design_system and the gate agree (brand step trial bench, #320): what the tool reports for a brand colour that
// has to be lifted is accepted, field by field, by the gate's colours section, and the grounds the tool judged against
// are the kit's own grounds (the light ground the slot wears is not the kit's, and the lift must not depend on it).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createContext } from '../src/brand-step/gate-context.js'
import { checkColours } from '../src/brand-step/gate-name-colours.js'
import { templateGrounds } from '../src/brand-step/kit-grounds.js'
import { toolByName } from '../src/brand-step/tools/index.js'
import { KIT, makeCtx } from './_brand-tool-fixtures.mjs'

const brief = (colour) => ({
  brand: {
    name: 'Glen Bay Swim Academy',
    logo: null,
    colorsFrom: 'logo',
    colors: [{ hex: colour, role: 'primary' }]
  },
  missing: []
})

/** The colours section of a brand file as an agent copies it from the tool's report. */
const coloursFrom = (r) => ({
  decision: 'new-accent',
  why: 'The brand colour became the accent.',
  brandColour: r.brandColour,
  lift: r.lift && {
    from: r.lift.from,
    to: r.lift.to,
    lightnessFrom: r.lift.lightnessFrom,
    lightnessTo: r.lift.lightnessTo,
    say: r.lift.forTheOwner
  },
  accent: r.accent,
  replaces: r.replaces,
  keeps: 'template',
  builds: 1,
  shifts: r.shifts,
  module: r.module
})

for (const colour of ['#0f4c4a', '#1f6f8b', '#c8693f']) {
  test(`the gate accepts the colours build_design_system reports for ${colour}`, async () => {
    const ctx = makeCtx()
    const r = await toolByName('build_design_system').run({ accent: colour }, ctx)
    assert.equal(r.ok, true, JSON.stringify(r.error))
    const g = createContext({
      brandFile: { colours: coloursFrom(r) },
      brief: brief(colour),
      kit: KIT,
      files: { has: (p) => ctx.files.has(p) }
    })
    checkColours(g)
    assert.deepEqual(g.errors, [])
    const grounds = templateGrounds(KIT)
    for (const shift of r.shifts) assert.match(shift.on, /^#[0-9a-f]{6}$/)
    assert.ok(grounds.opening && grounds.other, 'both kit grounds are known to the tool and the gate')
  })
}
