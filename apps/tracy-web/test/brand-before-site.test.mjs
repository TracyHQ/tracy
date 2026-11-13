// The brand step before the site exists (ticket #616): the step chain's own kit and brand steps run outside a build,
// on a research revision and a kit only, and the brand file they write becomes the look record. The steps are scripted
// fakes (no bench, no model, no database); the brand files are invented.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrandBeforeSite } from '../src/brand-before-site.js'

const brief = {
  brand: {
    name: 'Harrow Lane Bakery',
    colorsFrom: 'logo',
    colors: [{ hex: '#3b0f2e', role: 'primary' }],
    logo: 'logo-hlb',
    logoResearch: { status: 'found', chosen: { mediaId: 'logo-hlb', source: 'website' } }
  }
}
const brandFile = {
  kind: 'brand-file',
  version: 10,
  kit: 'example-court@1.0.0',
  name: { value: 'Harrow Lane Bakery', from: 'brief.brand.name' },
  colours: {
    decision: 'new-accent',
    why: 'A visible hue.',
    brandColour: '#3b0f2e',
    lift: null,
    accent: '#8a2c6c'
  },
  logo: { material: { mediaId: 'logo-hlb' }, mark: { decision: 'cut' } }
}

function fakeSteps(...answers) {
  const seen = { kit: [], brand: [], disposed: [] }
  const steps = {
    async kit(ctx) {
      seen.kit.push(ctx.contract.id)
      return { value: { ref: ctx.contract.id, doc: { site: {} } }, usd: 0 }
    },
    async brand(ctx, { kit }, how) {
      seen.brand.push({
        revision: ctx.brief.researchRevisionId,
        kit: kit.ref,
        attempt: how.attempt,
        runId: ctx.runId
      })
      const next = answers.shift()
      if (next instanceof Error) throw next
      return { value: { file: next }, usd: 0.25 }
    },
    async dispose(prepared) {
      seen.disposed.push(prepared)
    }
  }
  return { steps, seen }
}
const files = { 'brand/brand-file.json': brandFile, 'brand-attempt-2/brand-file.json': brandFile }
const readJson = async (file) => structuredClone(files[file])

test('the brand step runs on the research revision and the kit, and its brand file is the look record', async () => {
  const { steps, seen } = fakeSteps('brand/brand-file.json')
  const brandBeforeSite = createBrandBeforeSite({ steps, briefOf: async () => brief, readJson, now: () => 1 })
  const out = await brandBeforeSite({
    revisionId: 'rev-1',
    kitRef: 'example-court@1.0.0',
    siteLanguage: 'en'
  })
  assert.deepEqual(seen.kit, ['example-court@1.0.0'])
  assert.deepEqual(
    seen.brand.map(({ revision, kit, attempt }) => [revision, kit, attempt]),
    [['rev-1', 'example-court@1.0.0', 1]]
  )
  assert.equal(out.record.accent.hex, '#8a2c6c')
  assert.deepEqual(out.record.logo, {
    kind: 'own',
    from: 'website',
    source: 'Website',
    mediaId: 'logo-hlb',
    mark: 'cut'
  })
  assert.equal(out.usd, 0.25)
  assert.equal(seen.disposed.length, 1)
  assert.equal(seen.disposed[0].runId, out.runId)
  assert.equal(seen.disposed[0].chain.length, 1)
})

test('a failing run is run once more; a second failure stops and still keeps both record lines', async () => {
  const { steps, seen } = fakeSteps(new Error('gate failed'), 'brand-attempt-2/brand-file.json')
  const brandBeforeSite = createBrandBeforeSite({ steps, briefOf: async () => brief, readJson })
  const out = await brandBeforeSite({ revisionId: 'rev-1', kitRef: 'example-court@1.0.0' })
  assert.deepEqual(
    seen.brand.map((b) => b.attempt),
    [1, 2]
  )
  assert.deepEqual(
    out.records.map((r) => r.outcome),
    ['failed', 'done']
  )
  const twice = fakeSteps(new Error('first'), new Error('second'))
  await assert.rejects(
    createBrandBeforeSite({ steps: twice.steps, briefOf: async () => brief, readJson })({
      revisionId: 'rev-1',
      kitRef: 'example-court@1.0.0'
    }),
    (e) => e.code === 'brand_step_failed' && e.noRerun === true
  )
  assert.equal(twice.seen.disposed[0].chain.length, 2)
})

test('no research brief, no run', async () => {
  const { steps, seen } = fakeSteps()
  await assert.rejects(
    createBrandBeforeSite({ steps, briefOf: async () => null, readJson })({
      revisionId: 'gone',
      kitRef: 'k@1'
    }),
    (e) => e.code === 'brief_missing'
  )
  assert.equal(seen.brand.length, 0)
})
