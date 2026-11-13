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
      if (typeof next === 'function') return next(how)
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
  assert.equal(seen.disposed[0].chain.length, 2)
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
    out.records.map((r) => [r.step, r.outcome]),
    [
      ['kit', 'done'],
      ['brand', 'failed, re-running'],
      ['brand', 'done']
    ]
  )
  const twice = fakeSteps(new Error('first'), new Error('second'))
  await assert.rejects(
    createBrandBeforeSite({ steps: twice.steps, briefOf: async () => brief, readJson })({
      revisionId: 'rev-1',
      kitRef: 'example-court@1.0.0'
    }),
    (e) => e.code === 'brand_step_failed' && e.noRerun === true
  )
  assert.equal(twice.seen.disposed[0].chain.length, 3)
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

const run = (steps, input = {}) =>
  createBrandBeforeSite({ steps, briefOf: async () => brief, readJson })({
    revisionId: 'rev-1',
    kitRef: 'example-court@1.0.0',
    ...input
  })
const stopOf = async (promise) => {
  try {
    await promise
  } catch (error) {
    return error
  }
  assert.fail('the brand step did not stop')
}

test('a stopped signal before the start runs no step and records the attempt as stopped', async () => {
  const { steps, seen } = fakeSteps('brand/brand-file.json')
  const error = await stopOf(run(steps, { signal: AbortSignal.abort(new Error('the build was cancelled')) }))
  assert.equal(error.code, 'brand_step_failed')
  assert.deepEqual(seen.kit, [])
  assert.deepEqual(seen.brand, [])
  assert.deepEqual(
    error.details.records.map((r) => [r.step, r.attempt, r.outcome, r.error]),
    [['kit', 1, 'stopped', 'the build was cancelled']]
  )
})

test('a signal stopped during an attempt is not run again', async () => {
  const stop = new AbortController()
  const { steps, seen } = fakeSteps(() => {
    stop.abort(new Error('cancelled'))
    throw new Error('the bench was stopped')
  })
  const error = await stopOf(run(steps, { signal: stop.signal }))
  assert.equal(seen.brand.length, 1)
  assert.deepEqual(error.details.stop.step, 'brand')
  assert.equal(error.details.records.at(-1).outcome, 'stopped')
})

test('a kit step that throws gets a record line, is run once more, and stops the brand step unrun', async () => {
  const { steps, seen } = fakeSteps('brand/brand-file.json')
  steps.kit = async () => {
    throw Object.assign(new Error('kit not found'), { code: 'kit_missing' })
  }
  const error = await stopOf(run(steps))
  assert.equal(seen.brand.length, 0)
  assert.deepEqual(
    error.details.records.map((r) => [r.step, r.outcome, r.code]),
    [
      ['kit', 'failed, re-running', 'kit_missing'],
      ['kit', 'failed', 'kit_missing']
    ]
  )
  assert.equal(seen.disposed[0].chain.length, 2)
})

test('a brand file that is not one is not run again, and its run keeps its spend and its file', async () => {
  files['bad/brand-file.json'] = { kind: 'brand-file', version: 9 }
  const { steps, seen } = fakeSteps('bad/brand-file.json', 'brand/brand-file.json')
  const error = await stopOf(run(steps))
  assert.equal(seen.brand.length, 1)
  const line = error.details.records.at(-1)
  assert.equal(line.outcome, 'failed')
  assert.equal(line.code, 'brand_file_unreadable')
  assert.equal(line.usd, 0.25)
  assert.deepEqual(line.output, { file: 'bad/brand-file.json' })
})

test('an unknown spend stays unknown, with the known part beside it', async () => {
  const { steps } = fakeSteps(() => ({ value: { file: 'brand/brand-file.json' }, usd: null, knownUsd: 0.1 }))
  const out = await run(steps)
  assert.equal(out.records.at(-1).usd, null)
  assert.equal(out.records.at(-1).knownUsd, 0.1)
  assert.equal(out.usd, null)
  assert.equal(out.knownUsd, 0.1)
  assert.deepEqual(out.prompt, { file: 'brand-step.system.md', version: 10 })
})
