// The five approved brand cases, as invented businesses, pass the save_brand_file gate (ADR 0041 family, brand bench).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBrandFile } from '../src/brand-step/save-brand-file.js'
import { CASES, loadCase } from './_brand-gate-files.mjs'

const run = async (id) => {
  const c = await loadCase(id)
  return {
    c,
    result: await checkBrandFile({ brandFile: c.brand, brief: c.brief, kit: c.kit, files: c.files })
  }
}

for (const id of CASES) {
  test(`case ${id}: the brand file passes the gate and comes back unchanged`, async () => {
    const { c, result } = await run(id)
    assert.deepEqual(result.rejected ?? [], [])
    assert.equal(result.ok, true)
    assert.equal(result.brandFile, c.brand)
  })
}

test('the gate never modifies its inputs', async () => {
  const c = await loadCase('2-words-only')
  const before = JSON.stringify([c.brand, c.brief, c.kit])
  await checkBrandFile({ brandFile: c.brand, brief: c.brief, kit: c.kit, files: c.files })
  assert.equal(JSON.stringify([c.brand, c.brief, c.kit]), before)
})

test('the five cases keep the quirks of the approved lab cases', async () => {
  const marks = {}
  for (const id of CASES) {
    const { c } = await run(id)
    marks[id] = `${c.brand.logo.mark.decision}/${c.brand.colours.decision}/${c.brand.favicon.tabIcons}`
  }
  assert.deepEqual(marks, {
    '1-padel': 'cut/new-accent/tile',
    '2-words-only': 'icon/new-accent/tile',
    '3-no-logo': 'icon/kept-template/transparent',
    '4-black-grey-symbol': 'cut/kept-template/tile',
    '5-bakery-words': 'icon/new-accent/tile'
  })
})

test('a brief that holds the name back writes nothing and asks the owner to confirm it', async () => {
  const c = await loadCase('3-no-logo')
  const brief = { ...c.brief, missing: [{ field: 'brand.name', why: 'two sources disagree' }] }
  const held = await checkBrandFile({ brandFile: c.brand, brief, kit: c.kit, files: c.files })
  assert.equal(held.ok, false)
  assert.ok(held.rejected.some((r) => r.field === 'ownerTasks' && /confirm-name/.test(r.why)))
  assert.ok(held.rejected.some((r) => /^name\.slots\[".*"\]\.status$/.test(r.field)))
})
