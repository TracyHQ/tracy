// The parts of a step chain run built from a build draft (#597): which runs are assembled, the draft read and its typed
// stops, the frame's assembled steps, and the alt text hand-off on a site that is not in English. Invented data, no
// database, no model.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-units.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { altProblemsOf, withAltTexts, withDraftPictures } from '../src/step-chain-draft-pictures.js'
import { draftSource, isDraftRun } from '../src/step-chain-draft-source.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'

const plan = { id: 'plan-1', pages: [{ id: 'home', blocks: [] }] }
const doors = (over = {}) => ({
  readEngineDraft: async () => ({ draftId: 'd1', needsProfile: { facts: {} }, research: null }),
  draftPlanForBuild: async () => ({ draftId: 'd1', plan, lastEdit: null }),
  ...over
})
const ctx = (over = {}) => ({ runId: 'r1', accountId: 'a1', brief: { draftId: 'd1' }, ...over })

test('only a run that names its draft is assembled; any other run keeps the bench chain', () => {
  assert.equal(isDraftRun(ctx()), true)
  assert.equal(isDraftRun({ brief: { researchRevisionId: 'rev-1' } }), false)
  const steps = createStepChainSteps({
    pool: {},
    config: {},
    secret: 's'.repeat(32),
    log: {},
    recordsDir: '/'
  })
  assert.equal(steps.assembles({ brief: {} }), false)
  assert.equal(steps.assembles(ctx()), true)
})

test('the draft is read once per run; a changed, missing or unowned draft stops with its own code, never re-run', async () => {
  let reads = 0
  const once = draftSource(doors({ draftPlanForBuild: async () => (reads++, { draftId: 'd1', plan }) }))
  await once.of(ctx())
  await once.of(ctx())
  assert.equal(reads, 1)
  const codeOf = (d, c = ctx()) =>
    draftSource(d)
      .of(c)
      .catch((e) => [e.code, e.noRerun])
  assert.deepEqual(await codeOf(doors(), ctx({ accountId: null })), ['draft_account_missing', true])
  assert.deepEqual(await codeOf(doors({ draftPlanForBuild: async () => null })), ['draft_missing', true])
  assert.deepEqual(await codeOf(doors({ draftPlanForBuild: async () => ({ draftId: 'd2', plan }) })), [
    'draft_changed',
    true
  ])
  assert.deepEqual(await codeOf(doors({ readEngineDraft: async () => ({ draftId: 'd1' }) })), [
    'draft_profile_missing',
    true
  ])
  assert.deepEqual(await codeOf({}), ['draft_doors_missing', true])
})

test('the frame runs icons then order after the copy and the pictures, and hands the order to the Write step', async () => {
  const ran = []
  const step = (name) => async (_ctx, inputs) => (
    ran.push([name, Object.keys(inputs).sort()]), { value: name }
  )
  const steps = Object.fromEntries(
    ['kit', 'brand', 'plan', 'copy', 'pictures', 'icons', 'order'].map((n) => [n, step(n)])
  )
  let wrote = null
  steps.write = async (_ctx, inputs) => (
    (wrote = inputs), { value: { report: { status: 'done', counts: {} } } }
  )
  const engine = createStepChainEngine({ steps, applyFor: () => async () => ({}) })
  const c = { runId: 'r1', signal: new AbortController().signal, progress: async () => {} }
  const run = await engine.prepare(c)
  await engine.apply(c, run)
  assert.deepEqual(ran.slice(-2), [
    ['icons', ['copy', 'kit', 'pictures', 'plan']],
    ['order', ['brand', 'copy', 'icons', 'kit', 'pictures', 'plan']]
  ])
  assert.equal(wrote.order, 'order')
  // A run the steps do not assemble stops after the copy and the pictures, as before.
  ran.length = 0
  const plain = createStepChainEngine({
    steps: { ...steps, assembles: () => false },
    applyFor: () => async () => ({})
  })
  await plain.prepare({ ...c, runId: 'r2' })
  assert.ok(!ran.some(([n]) => n === 'icons' || n === 'order'))
})

test('on a site not in English the alt is the item own label or the site name, never a held name', () => {
  const profile = {
    facts: { 'business.name': [{ value: 'Atelier Fleur des Bois' }] },
    items: {
      service: [
        { id: 'svc-1', kind: 'service', fields: { 'offering.name': { value: 'Bouquet des champs' } } }
      ]
    }
  }
  const withheld = { people: ['Odile Marchetin'] }
  const frames = [
    { id: 'f1', source: 'own', item: 'svc-1', label: 'A bunch of wild flowers' },
    { id: 'f2', source: 'generated', label: 'Odile Marchetin arranging' },
    { id: 'f3', source: 'none' }
  ]
  const fr = withAltTexts(frames, { profile, language: 'fr', withheld })
  assert.deepEqual(
    fr.map((f) => f.label),
    ['Bouquet des champs', 'Atelier Fleur des Bois', undefined]
  )
  const en = withAltTexts(frames, { profile, language: 'en', withheld })
  assert.deepEqual(
    en.map((f) => f.label),
    ['A bunch of wild flowers', 'Atelier Fleur des Bois', undefined]
  )
  const order = {
    pictures: [
      { frame: 'f1', source: 'own', alt: null },
      { frame: 'f2', source: 'initials', alt: 'Odile Marchetin' },
      { frame: 'f3', source: 'none' }
    ]
  }
  assert.deepEqual(altProblemsOf(order, withheld), [
    { code: 'alt_text_missing', frame: 'f1' },
    { code: 'alt_text_withheld', frame: 'f2' }
  ])
})

test('a draft picture that cannot be opened leaves the profile as a missing picture; others are untouched', async () => {
  const profile = {
    items: {
      gallery: [
        {
          id: 'g1',
          pictureId: 'm1',
          fields: { 'business.gallery_image': { value: 'https://shop.example/1.jpg' } }
        },
        {
          id: 'g2',
          pictureId: 'm2',
          fields: { 'business.gallery_image': { value: 'https://shop.example/2.jpg' } }
        },
        { id: 'g3', fields: { 'business.gallery_image': { value: 'https://shop.example/3.jpg' } } }
      ]
    }
  }
  const manifest = [
    { id: 'm1', origin: 'draft', mime: 'image/png' },
    { id: 'm2', origin: 'draft', sourceUrl: 'https://shop.example/2.jpg' },
    { id: 'm3', origin: 'place', sourceUrl: 'https://shop.example/3.jpg' }
  ]
  const asked = []
  const out = await withDraftPictures({
    profile,
    manifest,
    accountId: 'a1',
    openDraftPicture: async (id, opts) => (
      asked.push([id, opts.accountId]), id === 'm1' ? { bytes: Buffer.from('x') } : null
    )
  })
  assert.deepEqual(asked, [
    ['m1', 'a1'],
    ['m2', 'a1']
  ])
  assert.deepEqual(out.used, ['m1'])
  assert.deepEqual(out.missing, ['m2'])
  assert.equal(
    out.refs.get('https://shop.example/1.jpg'),
    `data:image/png;base64,${Buffer.from('x').toString('base64')}`
  )
  const values = out.profile.items.gallery.map((g) => g.fields['business.gallery_image'].value)
  assert.deepEqual(values, ['https://shop.example/1.jpg', null, 'https://shop.example/3.jpg'])
})
