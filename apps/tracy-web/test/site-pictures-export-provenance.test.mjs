import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runFiles } from '../src/site-pictures/bench-export.js'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { checkPictures } from '../src/site-pictures/picture-check/check-pictures.js'
import { packageProblems } from '../src/write-step/picture-package.js'
import { inputs } from './_site-pictures-check.mjs'

const wishOf = (i, frame) =>
  i.plan.pages
    .flatMap((p) => p.blocks ?? [])
    .flatMap((b) => b.pictures ?? [])
    .find((w) => w.frame === frame)
const exported = (i, overrides = {}) =>
  exportPictureMapping({
    pictures: i.pictures,
    kit: i.kit,
    plan: i.plan,
    brief: i.brief,
    contract: 'demo-clay/j6/1.0.0',
    revision: 'old-failed-run',
    ...overrides
  })
const source = (i) => i.pictures.frames.find((e) => e.frame === 'block-7.1')

for (const made of ['drawn', 'owner-photo-extended']) {
  test(`a rejected documentary ${made} and its twin never enter the exported mapping, upload or alt list`, () => {
    const i = inputs()
    wishOf(i, 'block-7.1').match = 'any-real'
    Object.assign(source(i), { source: made, alt: 'The business premises' })
    if (made === 'owner-photo-extended') source(i).asset = 'a-wheel'
    const before = JSON.stringify(i)
    assert.equal(checkPictures(i).rules.find((r) => r.id === 'P07').status, 'fail')
    const out = exported(i)
    for (const key of ['module-7.1', 'module-7.2']) assert.ok(!(key in out.mapping.changes))
    assert.ok(!out.uploads.some((u) => u.sha256 === source(i).sha256))
    assert.ok(!('block-7.1' in out.alts))
    assert.ok(out.problems.some((p) => p.where === 'block-7.1' && /documents the business/.test(p.detail)))
    assert.ok(out.problems.some((p) => p.where === 'block-7.2'))
    assert.ok(packageProblems(out, 'demo-clay/j6/1.0.0').some((p) => /documents the business/.test(p)))
    assert.equal(JSON.stringify(i), before)
  })
}

test('an observed business fact or original post keeps a specific photo documentary at export', () => {
  for (const fact of [
    { id: 'source', field: 'facility', sourceKind: 'observed', value: 'The actual workshop' },
    { id: 'source', field: 'posts', value: { kind: 'post', text: 'Our event' } }
  ]) {
    const i = inputs()
    i.brief.facts.push(fact)
    wishOf(i, 'block-7.1').factIds = [fact.id]
    assert.ok(!('module-7.1' in exported(i).mapping.changes))
  }
})

test('documentary site settings are omitted before their files or alts reach the write package', () => {
  const i = inputs()
  wishOf(i, 'block-6.picture-1').match = 'any-real'
  const setting = i.pictures.siteSettings[0]
  setting.alt = 'The actual workshop wall'
  const out = exported(i)
  assert.deepEqual(out.siteSettings, [])
  assert.ok(!out.uploads.some((u) => u.sha256 === setting.sha256))
  assert.ok(!('block-6.picture-1' in out.alts))
  assert.ok(out.problems.some((p) => p.where === 'block-6.picture-1'))
})

test('a generic illustrative picture still exports with its original plan and brief', () => {
  const i = inputs()
  const out = exported(i)
  assert.equal(out.mapping.changes['module-7.1'], source(i).sitePath)
  assert.equal(out.mapping.changes['module-7.2'], source(i).sitePath)
  assert.ok(out.uploads.some((u) => u.sha256 === source(i).sha256))
})

test('missing original inputs or an unknown cited fact cannot silently classify a generated picture as illustrative', () => {
  const i = inputs()
  for (const overrides of [{ plan: undefined }, { brief: undefined }, { kit: undefined }]) {
    const out = exported(i, overrides)
    assert.ok(!('module-7.1' in out.mapping.changes))
    assert.ok(!out.uploads.some((u) => u.sha256 === source(i).sha256))
    assert.ok(out.problems.some((p) => p.where === 'block-7.1' && /provenance is unknown/.test(p.detail)))
    assert.ok(out.mapping.changes['module-2.0'], 'existing real owner photos remain usable')
  }
  wishOf(i, 'block-7.1').factIds = ['missing-observation']
  assert.ok(
    exported(i).problems.some((p) => p.where === 'block-7.1' && /provenance is unknown/.test(p.detail))
  )
})

test('bench get rechecks a historical failed final manifest using its frozen run inputs', () => {
  const i = inputs()
  wishOf(i, 'block-7.1').match = 'any-real'
  const run = {
    id: 'historical-rejected-run',
    kitRef: 'demo-clay/j6/1.0.0',
    status: 'failed',
    plan: i.plan,
    brief: i.brief,
    rounds: [{ round: 0, pictures: i.pictures }]
  }
  const files = new Map(runFiles(run, [], [], i.kit))
  const pkg = JSON.parse(files.get('mapping.json'))
  assert.ok(!('module-7.1' in pkg.mapping.changes))
  assert.ok(pkg.problems.some((p) => p.where === 'block-7.1'))
})

test('a generated picture cannot infer an illustrative purpose from a missing or invalid wish match', () => {
  for (const match of [undefined, 'invented-mode']) {
    const i = inputs()
    wishOf(i, 'block-7.1').match = match
    const out = exported(i)
    assert.ok(!('module-7.1' in out.mapping.changes))
    assert.ok(!('module-7.2' in out.mapping.changes))
    assert.ok(out.problems.some((p) => p.where === 'block-7.1' && /provenance is unknown/.test(p.detail)))
    assert.ok(!out.uploads.some((u) => u.sha256 === source(i).sha256))
  }
})

for (const made of ['drawn', 'owner-photo-extended']) {
  test(`a business gallery role rejects ${made} even when the plan asks for a specific illustration`, () => {
    const i = inputs()
    const frame = i.kit.blocks.flatMap((b) => b.frames ?? []).find((f) => f.id === 'block-7.1')
    frame.role = 'business.gallery_image'
    assert.equal(wishOf(i, frame.id).match, 'specific')
    Object.assign(source(i), { source: made, alt: 'Real photos from our classes' })
    if (made === 'owner-photo-extended') source(i).asset = 'a-wheel'
    assert.equal(checkPictures(i).rules.find((r) => r.id === 'P07').status, 'fail')
    const out = exported(i)
    assert.ok(!('module-7.1' in out.mapping.changes))
    assert.ok(!('module-7.2' in out.mapping.changes), 'a twin cannot carry the rejected gallery picture')
    assert.ok(!out.uploads.some((u) => u.sha256 === source(i).sha256))
    assert.ok(!('block-7.1' in out.alts))
    assert.ok(out.problems.some((p) => p.where === frame.id && /documents the business/.test(p.detail)))
  })
}
