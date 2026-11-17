// The brand step before the site keeps the WHOLE brand file (#575, P1 of the brand audit): the look record alone
// (accent, kind of logo, origin) left the logo pictures, the favicon set and the dark side shifts behind in the run's
// folder. The step now answers the brand file with the bytes of every picture it names, checked against the kit as the
// write step checks it (`exportBrandOrders`). Scripted steps, an invented brand file on the real JA Boxing kit.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/brand-before-site-kept.test.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createBrandBeforeSite } from '../src/brand-before-site.js'
import { SPOTS, boxingKitValue, keptBrandFile, keptBrief, writeBrandFolder } from './_brand-kept-fixtures.mjs'

const stepsFor = (file, kit = boxingKitValue()) => ({
  kit: async () => ({ value: kit, usd: 0 }),
  brand: async () => ({ value: { file }, usd: 0.1 }),
  dispose: async () => {}
})
const run = (file, kit) =>
  createBrandBeforeSite({ steps: stepsFor(file, kit), briefOf: async () => keptBrief })({
    revisionId: 'rev-fernway',
    kitRef: 'ja-boxing/j6/1.0.11'
  })

test('the step answers the whole brand file and the bytes of every picture it names', async () => {
  const { dir, file, brandFile } = await writeBrandFolder()
  try {
    const out = await run(file)
    assert.equal(out.record.logo.kind, 'drawn')
    assert.equal(out.brand.schema, 'tracy-brand-kept/v1')
    assert.equal(out.brand.kit, 'ja-boxing@1.0.11')
    assert.deepEqual(out.brand.brandFile, brandFile)
    // Every logo spot of the kit, with the ground it sits on and the template setting or block it is written to.
    assert.deepEqual(
      out.brand.logos.map((l) => [l.spot, l.side, l.setting, l.block]),
      [
        ['logo-header-1', 'light', 'site_logo', 'header'],
        ['logo-header-2', 'dark', 'site_logo_dark', 'header'],
        ['logo-offcanvas-1', 'light', 'site_logo', null],
        ['logo-offcanvas-2', 'dark', 'site_logo_dark', null],
        ['logo-footer-1', 'dark', null, 'block-170']
      ]
    )
    assert.deepEqual(Object.keys(out.brand.favicon), ['ico', 'png32', 'png512', 'phone180'])
    // Every picture named once, with its hash; the bytes travel beside the kept file, never inside it.
    const names = [...SPOTS.map((s) => `spots/${s}.png`), ...Object.values(brandFile.favicon)]
    assert.deepEqual(Object.keys(out.brand.pictures).sort(), [...names].sort())
    for (const name of names) {
      const bytes = readFileSync(path.join(dir, name))
      assert.deepEqual(out.pictures.get(name), bytes)
      assert.equal(out.brand.pictures[name].sha256, createHash('sha256').update(bytes).digest('hex'))
    }
    assert.equal(out.brand.pictures['favicon/favicon.ico'].mime, 'image/x-icon')
    assert.ok(!JSON.stringify(out.brand).includes('"type":"Buffer"'), 'no bytes in the kept file')
    // The run's record line is what it was: the file and the look record.
    const line = out.records.find((r) => r.step === 'brand')
    assert.deepEqual(Object.keys(line.output), ['file', 'record'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a brand file made on another kit stops typed, as the write step refuses it', async () => {
  const { dir, file } = await writeBrandFolder({ brandFile: keptBrandFile({ kit: 'ja-diner@1.0.8' }) })
  try {
    await assert.rejects(run(file), (e) => {
      assert.equal(e.code, 'brand_step_failed')
      assert.equal(e.details.stop.code, 'brand_file_other_kit')
      return true
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a picture the brand file names that is not there stops typed, never a brand without its logo', async () => {
  const { dir, file } = await writeBrandFolder({ leave: ['spots/logo-header-2.png'] })
  try {
    await assert.rejects(run(file), (e) => e.details.stop.code === 'brand_file_picture_missing')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a picture named outside the brand file folder stops typed', async () => {
  const brandFile = keptBrandFile()
  brandFile.favicon.png512 = '../elsewhere.png'
  const { dir, file } = await writeBrandFolder({ brandFile, leave: ['../elsewhere.png'] })
  try {
    await assert.rejects(run(file), (e) => e.details.stop.code === 'brand_file_picture_outside')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
