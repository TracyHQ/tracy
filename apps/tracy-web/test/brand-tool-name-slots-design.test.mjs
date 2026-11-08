// name_slots and build_design_system at the seam tool.run(input, ctx). The design system runs the real
// tracy-ds-slot in accent-only mode on the committed JA Boxing 1.0.10 kit.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeNameSlots } from '../src/lib/brand-name-slots.js'
import { BrandToolError, toolByName } from '../src/brand-step/tools/index.js'
import { BRIEF, KIT, makeCtx } from './_brand-tool-fixtures.mjs'

test('name_slots: the lab output, the exact name written where the rule says', async () => {
  const r = await toolByName('name_slots').run({}, makeCtx())
  assert.deepEqual(
    { ...r, ok: undefined, written: undefined, handedOff: undefined },
    { ...computeNameSlots(KIT, BRIEF), ok: undefined, written: undefined, handedOff: undefined }
  )
  assert.equal(r.ok, true)
  assert.equal(r.name, 'Harbor Padel Club')
  assert.ok(r.written >= 2 && r.handedOff >= 1)
  assert.ok(r.slots.some((s) => s.status === 'written' && s.value === 'Harbor Padel Club'))
  assert.ok(r.slots.some((s) => s.status === 'handed-off' && s.handOff === 'writer'))
  assert.deepEqual(r.ownerTasks, [])
})

test('name_slots: a name the brief holds back writes nothing and returns confirm-name', async () => {
  const held = { brand: { name: 'Harbor Padel Club' }, missing: [{ field: 'brand.name' }] }
  const r = await toolByName('name_slots').run({}, makeCtx({ brief: held }))
  assert.ok(r.slots.every((s) => s.status === 'not-written'))
  assert.equal(r.ownerTasks[0].kind, 'confirm-name')
  await assert.rejects(toolByName('name_slots').run({}, makeCtx({ brief: null })), BrandToolError)
})

const build = (accent, ctx = makeCtx()) => toolByName('build_design_system').run({ accent }, ctx)
const refused = async (input, ctx = makeCtx()) => {
  try {
    await toolByName('build_design_system').run(input, ctx)
  } catch (e) {
    return e
  }
  assert.fail('expected a refusal')
}

test('build_design_system: a readable colour is built as given and only the accent family is worn', async () => {
  const ctx = makeCtx()
  const r = await build('#2b6cb0', ctx)
  assert.equal(r.ok, true)
  assert.equal(r.brandColour, '#2b6cb0')
  assert.equal(r.accent, '#2b6cb0')
  assert.equal(r.lift, null)
  assert.equal(r.replaces, KIT.site.brandColours.primary.value)
  assert.equal(r.module.file, 'design-system/module.html')
  assert.ok(r.module.bytes > 1000 && r.module.bytes < r.module.limit)
  const html = ctx.files.read(r.module.file).toString()
  assert.match(html, /<style id="tracy-ds-slot"/)
  assert.match(html, /tracy-ds-slot: brand:accent-only-2b6cb0/, 'never the whole design-system style')
  assert.doesNotMatch(html.replace(/\/\*[\s\S]*?\*\//g, ''), /--ds-c-|font-|border-radius/)
  assert.match(html, /--ds-c-surface:#/, 'what the picture step reads stays in a comment')
  assert.match(r.keeps, /every non-accent role equals/)
  assert.deepEqual(Object.keys(r.sides).sort(), ['dark', 'light'])
  assert.ok(r.contrast.dark.every((c) => c.ok))
  assert.ok(Array.isArray(r.shifts))
  const again = await build('#2b6cb0', ctx)
  assert.equal(again.module.file, 'design-system/module.v2.html')
})

test('build_design_system: a dark colour with a hue is lifted by code, the lift is reported', async () => {
  const r = await build('#042515')
  assert.equal(r.brandColour, '#042515')
  assert.notEqual(r.accent, '#042515')
  assert.equal(r.lift.from, '#042515')
  assert.equal(r.lift.to, r.accent)
  assert.ok(r.lift.after.opening >= 3)
  assert.match(r.lift.forTheOwner, /was made lighter/)
})

test('build_design_system: neutrals, grounds and text colours are refused with the lab reasons', async () => {
  for (const grey of ['#000000', '#808080', '#ffffff']) {
    const e = await refused({ accent: grey })
    assert.ok(e instanceof BrandToolError)
    assert.match(e.message, /never an accent/)
    assert.equal(e.extra.refusedBy, 'neutral')
  }
  assert.match((await refused({ accent: '#2b6cb0', bg: '#ffffff' })).message, /bg is not taken/)
  assert.match((await refused({ accent: '#2b6cb0', fg: '#000000' })).message, /fg is not taken/)
  assert.match((await refused({ accent: 'blue' })).message, /#rrggbb/)
  assert.match((await refused({})).message, /usage/)
})

test('build_design_system: a template without a slot contract is refused before anything is built', async () => {
  const kit = structuredClone(KIT)
  kit.quickstart.product = 'no-such-template'
  const e = await refused({ accent: '#2b6cb0' }, makeCtx({ kit }))
  assert.ok(e instanceof BrandToolError)
  assert.match(e.message, /no template contract for no-such-template/)
})
