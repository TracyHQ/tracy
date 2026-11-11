import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeNameSlots } from '../src/lib/brand-name-slots.js'
import { memoryFiles } from '../src/brand-step/gate-context.js'
import { checkBrandFile } from '../src/brand-step/save-brand-file.js'
import { brandHarnessFor } from '../src/brand-step/brand-harness.js'
import { BRAND_HELD_NAME_CHECK } from '../src/brand-step/gate-logo.js'
import { drawFiles, loadCase } from './_brand-gate-files.mjs'
import { buildSafeVersion } from '../src/brand-step/brand-safe-version.js'
import { brandTools } from '../src/brand-step/tools/index.js'
import { BRIEF, KIT, makeCtx } from './_brand-tool-fixtures.mjs'

async function heldCase(name = null) {
  const c = await loadCase('4-black-grey-symbol')
  c.brief.brand.name = name
  c.brief.missing = [{ field: 'brand.name', why: 'The owner must confirm the name.' }]
  const slots = computeNameSlots(c.kit, c.brief)
  c.brand.name = { value: name, from: 'brief.brand.name', slots: slots.slots }
  c.brand.ownerTasks.push(...slots.ownerTasks)
  c.brand.logo.name = null
  c.brand.logo.logos = { light: null, dark: null, twoLines: null }
  for (const spot of c.brand.logo.spots) spot.shows = 'mark'
  const entries = await drawFiles(c.id, c.brand)
  c.files = memoryFiles(entries)
  return c
}

const check = (c, extra = {}) =>
  checkBrandFile({ brandFile: c.brand, brief: c.brief, kit: c.kit, files: c.files, ...extra })

test('a held null name accepts reviewed fitted marks without inventing unused name pictures', async () => {
  const c = await heldCase()
  const before = JSON.stringify([c.brand, c.brief])
  const result = await check(c)
  assert.deepEqual(result.rejected ?? [], [])
  assert.equal(result.ok, true)
  assert.equal(JSON.stringify([c.brand, c.brief]), before)
  assert.ok(c.brand.name.slots.every((s) => s.status === 'not-written'))
  assert.equal(c.brand.logo.name, null)
})

test('an explicitly withheld authored name also keeps composed name images out of the brand file', async () => {
  const c = await heldCase('Unconfirmed owner name')
  assert.equal((await check(c)).ok, true)
  c.brand.logo.name = { text: 'Unconfirmed owner name', files: {} }
  const result = await check(c)
  assert.ok(result.rejected.some((r) => r.field === 'logo.name' && /held/.test(r.why)))
})

test('holding a name still requires owner confirmation and independently reviewed spot files', async () => {
  const c = await heldCase()
  c.brand.ownerTasks = c.brand.ownerTasks.filter((t) => t.kind !== 'confirm-name')
  c.brand.logo.look = c.brand.logo.look.map((look) => ({ ...look, verdict: 'fail' }))
  const result = await check(c)
  assert.equal(result.ok, false)
  assert.ok(result.rejected.some((r) => r.field === 'ownerTasks'))
  assert.ok(result.rejected.some((r) => /look|spot/.test(r.field)))
})

test('a historical brand gate retains its recorded missing-name behavior', async () => {
  const result = await check(await heldCase(), { heldNameCheck: null })
  assert.equal(result.ok, false)
  assert.ok(result.rejected.some((r) => r.field === 'logo.name.files.light'))
})

test('new brand runs freeze the held-name policy and unsupported versions refuse', async () => {
  assert.equal(brandHarnessFor('deepseek-flash', 'deepseek').brandHeldNameCheck, BRAND_HELD_NAME_CHECK)
  const result = await check(await heldCase(), { heldNameCheck: 'future' })
  assert.equal(result.ok, false)
  assert.deepEqual(result.rejected, [
    { field: '(held name check)', why: 'unsupported held name check version' }
  ])
})

test('the safe version never renders an explicitly held name in a new run', async () => {
  for (const name of [null, 'Unconfirmed owner name']) {
    const brief = { ...BRIEF, brand: { ...BRIEF.brand, name }, missing: [{ field: 'brand.name' }] }
    const ctx = makeCtx({ brief })
    const calls = []
    const tools = brandTools.map((tool) => ({
      ...tool,
      run: (input, context) => (calls.push(tool.name), tool.run(input, context))
    }))
    const before = JSON.stringify(brief)
    const file = await buildSafeVersion({
      tools,
      ctx,
      kit: { doc: KIT },
      brief,
      reason: 'cost-cap',
      heldNameCheck: BRAND_HELD_NAME_CHECK
    })
    assert.deepEqual(calls, ['name_slots'])
    assert.equal(file.name.value, null)
    assert.equal(file.logo.name, null)
    assert.deepEqual(file.logo.logos, { light: null, dark: null, twoLines: null })
    assert.equal(file.favicon, null)
    assert.ok(file.ownerTasks.some((task) => task.kind === 'confirm-name'))
    assert.equal(JSON.stringify(brief), before)
  }
})

test('the safe version refuses unsupported held-name versions before invoking tools', async () => {
  await assert.rejects(
    buildSafeVersion({
      tools: [],
      ctx: {},
      kit: { doc: KIT },
      brief: BRIEF,
      reason: 'gate',
      heldNameCheck: 'future'
    }),
    /BRAND_HELD_NAME_CHECK_CHANGED/
  )
})
