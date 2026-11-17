// The whole brand file travels with the draft (#575, P1 of the brand audit): the brand step's pictures are stored as
// draft pictures and the draft keeps the brand file with their ids beside the look record; a run built from the draft
// reads it, held to the plan's template; the plan card's door answers the logo on each ground and the icon by id. No
// database: a fake picture store and fake draft doors. Invented data.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-brand-kept.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftBrandStep } from '../src/build-draft-wiring.js'
import { brandRunOf } from '../src/build-draft/engine-steps.js'
import { draftShape } from '../src/build-draft/rules.js'
import { keptBrandOf, readEngineDraft } from '../src/build-draft/store.js'
import { draftSource } from '../src/step-chain-draft-source.js'

const ACCOUNT = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const template = { slug: 'ja-boxing', version: '1.0.11' }
const record = { schema: 'tracy-brand-look/v1' }
const kept = () => ({
  schema: 'tracy-brand-kept/v1',
  kit: 'ja-boxing@1.0.11',
  brandFile: { kind: 'brand-file', version: 10 },
  logos: [
    { spot: 'logo-header-1', side: 'light', file: 'spots/a.png' },
    { spot: 'logo-header-2', side: 'dark', file: 'spots/b.png' }
  ],
  favicon: { ico: 'favicon/favicon.ico', png32: 'favicon/favicon-32.png' },
  pictures: {
    'spots/a.png': { sha256: 'a'.repeat(64), mime: 'image/png', size: 3 },
    'spots/b.png': { sha256: 'b'.repeat(64), mime: 'image/png', size: 3 },
    'favicon/favicon.ico': { sha256: 'c'.repeat(64), mime: 'image/x-icon', size: 3 },
    'favicon/favicon-32.png': { sha256: 'd'.repeat(64), mime: 'image/png', size: 3 }
  }
})
const bytes = () => new Map(Object.keys(kept().pictures).map((name) => [name, Buffer.from(name)]))
const stepWith = ({ keepPicture, usd = 0.5 }) =>
  draftBrandStep({
    pool: null,
    stepsOf: () => assert.fail('the fake run needs no steps'),
    brandBeforeSite: async () => ({ record, records: [], usd, brand: kept(), pictures: bytes() }),
    kitRefOf: () => 'ja-boxing/j6/1.0.11',
    keepPicture
  })
const research = { brief: { brand: { name: 'Fernway Boxing Club' } }, ids: { revisionId: 'rev-1' } }

test('every brand picture is stored for the account, and the draft keeps the brand file with their ids', async () => {
  const stored = []
  const step = stepWith({
    keepPicture: async (account, p) => (
      stored.push([account, p.name, p.sha256, p.bytes.toString()]), `id-${stored.length}`
    )
  })
  const answer = await step({ research, template, accountId: ACCOUNT })
  assert.equal(answer.record, record)
  assert.equal(answer.costCents, 50)
  assert.deepEqual(
    stored.map(([account, name]) => [account, name]),
    Object.keys(kept().pictures).map((name) => [ACCOUNT, name])
  )
  assert.ok(
    stored.every(([, name, , text]) => text === name),
    'the bytes of each picture'
  )
  assert.deepEqual(
    Object.values(answer.file.pictures).map((p) => p.id),
    ['id-1', 'id-2', 'id-3', 'id-4']
  )
  // The engine keeps it beside the record.
  const ran = await brandRunOf({ research, template }, { brandStep: async () => answer, kit: {} })
  assert.deepEqual(ran.file, answer.file)
})

test('a picture the store refuses stops the step typed; no store wired keeps only the record', async () => {
  await assert.rejects(
    stepWith({ keepPicture: async () => null })({ research, template, accountId: ACCOUNT }),
    (e) => {
      assert.equal(e.code, 'brand_picture_not_stored')
      assert.equal(e.noRerun, true)
      return true
    }
  )
  const bare = await stepWith({ keepPicture: null, usd: null })({ research, template, accountId: ACCOUNT })
  assert.equal(bare, record)
})

test('the engine draft answers the kept brand file, live or from the approved snapshot', async () => {
  const file = kept()
  const row = {
    id: 'd1',
    needs_profile: {},
    research: {},
    fault: null,
    brand: { record, template, file },
    build: null
  }
  const pool = (r) => ({ query: async () => ({ rows: [r] }) })
  assert.deepEqual((await readEngineDraft(pool(row), ACCOUNT)).brand, { file, template })
  const snapshot = { profile: {}, research: {}, brand: keptBrandOf(row.brand) }
  const approved = { ...row, brand: null, build: { snapshot } }
  assert.deepEqual((await readEngineDraft(pool(approved), ACCOUNT)).brand, { file, template })
  assert.equal(keptBrandOf({ record, template }), null, 'a record without a brand file')
})

const plan = { id: 'plan-1', revision: 3, pages: [{ id: 'home', blocks: [] }], look: { template } }
const runCtx = { runId: 'r1', accountId: 'a1', brief: { draftId: 'd1', plan: { id: 'plan-1', revision: 3 } } }
const doorsWith = (brand) => ({
  readEngineDraft: async () => ({
    draftId: 'd1',
    needsProfile: { facts: {} },
    research: { manifest: [] },
    brand
  }),
  draftPlanForBuild: async () => ({ draftId: 'd1', plan, lastEdit: null })
})

test('a run reads the brand file of its plan template; one of another template stops the build typed', async () => {
  const brand = { file: kept(), template }
  assert.deepEqual((await draftSource(doorsWith(brand)).of(runCtx)).brand, brand)
  assert.equal((await draftSource(doorsWith(null)).of(runCtx)).brand, null)
  const other = {
    file: { ...kept(), kit: 'ja-diner@1.0.8' },
    template: { slug: 'ja-diner', version: '1.0.8' }
  }
  await assert.rejects(
    draftSource(doorsWith(other)).of(runCtx),
    (e) => e.code === 'draft_brand_other_template'
  )
})

test('the draft door answers the logo on each ground and the icon by draft picture id, beside the look sources', () => {
  const file = kept()
  for (const [name, p] of Object.entries(file.pictures)) p.id = `pic-${name.length}-${name.at(-5)}`
  const at = new Date(0)
  const base = { id: 'd1', undo_edit: null, created_at: at, updated_at: at }
  const shape = draftShape({
    ...base,
    brand: { record, template, file, lookSources: { accent: { from: 'logo' } } }
  })
  assert.deepEqual(shape.lookSources, {
    accent: { from: 'logo' },
    pictures: {
      logoLight: { picture: file.pictures['spots/a.png'].id, mime: 'image/png' },
      logoDark: { picture: file.pictures['spots/b.png'].id, mime: 'image/png' },
      favicon: { picture: file.pictures['favicon/favicon-32.png'].id, mime: 'image/png' }
    }
  })
  assert.equal(draftShape({ ...base, brand: { record, template } }).lookSources, undefined)
})
