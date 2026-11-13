// The wiring of the build chat's engine to #616's brand step before the site (`build-draft-wiring.js`): which inputs it
// hands the step (the draft's research brief and logo file, never a revision), and the stop when the draft lacks one. The step itself is a fake; its own tests are
// `brand-before-site.test.mjs`. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-wiring.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { stoppedOf } from '../src/build-draft/engine.js'
import { SAY } from '../src/build-draft/engine-state.js'
import { draftBrandStep, kitRefOf } from '../src/build-draft-wiring.js'
import { STEP_CHAIN_NO_OUTPUT } from '../src/sites/brief-engines/step-chain.js'

const template = { slug: 'example-court', name: 'Example Court', version: '1.0.0' }
const kits = [{ ref: 'example-court/j6/0.9.0' }, { ref: 'example-court/j6/1.0.0' }, { ref: 'other/j6/1.0.0' }]
const brief = { schemaVersion: 2, business: { name: 'Example Court Club' }, facts: [] }
const record = { schema: 'tracy-brand-look/v1', accent: { from: 'logo', hex: '#1f7a4d' } }

test('the kit ref of a template is the step chain kit of its slug and version, or null', () => {
  assert.equal(kitRefOf(template, kits), 'example-court/j6/1.0.0')
  assert.equal(kitRefOf({ ...template, version: '2.0.0' }, kits), null)
})

test('the brand step gets the draft brief, the logo file, the kit ref and the site language, never a revision', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'draft-logo-'))
  const logoFile = path.join(dir, 'logo.png')
  writeFileSync(logoFile, 'invented bytes')
  const calls = []
  const step = draftBrandStep({
    pool: null,
    stepsOf: () => assert.fail('the fake run needs no steps'),
    brandBeforeSite: async (input) => (calls.push(input), { record, records: [] }),
    kitRefOf: (t) => kitRefOf(t, kits)
  })
  const research = { brief, logoFile, profile: { language: { value: 'en' } } }
  assert.deepEqual(await step({ research, template }), record)
  // A logo file no longer on the disk is not passed: the step follows its rule for a business without a logo.
  await step({ research: { brief, logoFile: path.join(dir, 'gone.png') }, template })
  assert.deepEqual(calls, [
    { brief, logoFile, kitRef: 'example-court/j6/1.0.0', siteLanguage: 'en' },
    { brief, kitRef: 'example-court/j6/1.0.0' }
  ])
  rmSync(dir, { recursive: true, force: true })
})

test('through the real step: the step chain context holds the brief and the logo file, no revision id', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'draft-logo-'))
  const logoFile = path.join(dir, 'logo.png')
  writeFileSync(logoFile, 'invented bytes')
  const seen = []
  const steps = {
    async kit(ctx) {
      seen.push(structuredClone(ctx.brief))
      throw Object.assign(new Error('stop here'), { code: 'kit_stop', noRerun: true })
    },
    brand: async () => assert.fail('the kit step stopped the run'),
    dispose: async () => {}
  }
  const step = draftBrandStep({ pool: null, stepsOf: () => steps, kitRefOf: (t) => kitRefOf(t, kits) })
  // The run reached the kit step (never the TypeError of a brief and a revision given together).
  const notTypeError = (e) => !(e instanceof TypeError)
  await assert.rejects(step({ research: { brief, logoFile }, template }), notTypeError)
  await assert.rejects(step({ research: { brief, revisionId: 'r-1' }, template }), notTypeError)
  assert.deepEqual(seen, [{ researchBrief: brief, logoFile }, { researchBrief: brief }])
  assert.ok(seen.every((b) => !('researchRevisionId' in b)))
  rmSync(dir, { recursive: true, force: true })
})

test('without a brief, or with a kit this server does not have, the step stops with a plain reason, never runs', async () => {
  const step = draftBrandStep({
    pool: null,
    stepsOf: () => assert.fail('no run starts'),
    kitRefOf: (t) => kitRefOf(t, kits)
  })
  await assert.rejects(step({ research: { profile: {}, revisionId: 'r' }, template }), {
    code: 'brand_input_missing',
    noRerun: true
  })
  await assert.rejects(step({ research: { brief }, template: { ...template, version: '9.9.9' } }), {
    code: 'brand_input_missing',
    noRerun: true,
    message: 'no template kit on this server for example-court 9.9.9'
  })
  // Both input faults, and a brand step that ended without a brand file, stop with the brand sentence, never the
  // generic one.
  for (const code of ['brand_input_missing', 'brand_input_ambiguous', STEP_CHAIN_NO_OUTPUT])
    assert.deepEqual(stoppedOf({ code, noRerun: true }), {
      state: 'stopped',
      say: SAY.brand,
      reason: 'brand-unavailable'
    })
})
