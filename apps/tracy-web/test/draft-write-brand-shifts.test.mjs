// The dark side of the accent follows the brand file (#575, P4 of the brand audit). The step chain wrote the brand
// file's colour shifts (`write-step/brand-stage.js`): a lifted fill on the dark side and words its bench measured to
// read there. The draft write painted the dark fill and its words the same colour, the plan's accent. Now, when the
// plan's accent is the brand file's own, its shifts are written as they are. A memory site on the real JA Boxing kit,
// an invented business.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-brand-shifts.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accentShiftsOf } from '../src/step-chain-draft-brand-pictures.js'
import { shiftsOf } from '../src/step-chain-draft-write-accent.js'
import { blankSite, florist, planOf, runOn } from './draft-write-fixtures.mjs'

const SHIFTS = [
  { side: 'dark', colour: 'accent', to: '#5fae80', opens: false },
  { side: 'dark', colour: 'accent-text', to: '#8fd0a8' }
]
const brandOf = (colours) => ({ file: { brandFile: { colours } } })
const accent = florist.order.look.accent
const moduleOf = async (plan) => {
  const memory = blankSite()
  await runOn(memory, { plan })
  const op = plan.ops.find((o) => o.kind === 'look.accent')
  return [...memory.site.records.module.values()].find((m) => m.note === op.mark).content
}

test('the brand shifts ride only with the brand file own new accent and no dark accent of the plan', () => {
  const brand = brandOf({ decision: 'new-accent', accent, shifts: SHIFTS })
  assert.deepEqual(accentShiftsOf(brand, { accent }), SHIFTS)
  assert.deepEqual(accentShiftsOf(brand, { accent: accent.toUpperCase() }), SHIFTS)
  assert.equal(accentShiftsOf(brand, { accent: '#123456' }), null, 'an accent the owner changed')
  assert.equal(accentShiftsOf(brand, { accent, accentDark: '#ffffff' }), null, 'the plan sets its own dark')
  assert.equal(
    accentShiftsOf(brandOf({ decision: 'kept-template', accent, shifts: SHIFTS }), { accent }),
    null
  )
  assert.equal(accentShiftsOf(null, { accent }), null)
})

test('the dark side takes the brand fill and its own words, never the light accent twice', async () => {
  const html = await moduleOf(planOf(structuredClone(florist.order), { accentShifts: SHIFTS }))
  const dark = florist.aiq.mapping.look.accent.sides.darkHook
  assert.ok(
    html.includes(`:root${dark}{--tracy-accent:#5fae80;--tracy-accent-text:#8fd0a8}`),
    html.slice(0, 400)
  )
  assert.ok(html.includes(`:root{--tracy-accent:${accent};--tracy-accent-text:${accent}}`))
})

test('without brand shifts the dark side keeps the plan tones as measured', async () => {
  const plan = planOf(structuredClone(florist.order))
  const op = plan.ops.find((o) => o.kind === 'look.accent')
  assert.equal(op.shifts, undefined)
  assert.deepEqual(
    shiftsOf(op).map((s) => [s.side, s.colour, s.to]),
    [
      ['dark', 'accent', accent],
      ['dark', 'accent-text', accent]
    ]
  )
})
