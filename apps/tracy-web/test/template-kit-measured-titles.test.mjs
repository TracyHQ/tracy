// A measured title is the only stored field projected into the writable kit view; invented fixtures exercise real doors.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withMeasuredTitles } from '../src/lib/template-kit/measured-titles.js'
import { openKit } from '../src/lib/template-kit-source.js'
import { kitOfContract } from '../src/lib/template-kit/reader.js'
import { defaultContracts } from '../src/lib/contracts.js'
import { indexInputs } from '../src/lib/site-copy/inputs-index.js'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { runBenchRun } from '../src/lib/bench-run-loop.js'
import { CHECKER_VERSION as WRITER_VERSION } from '../src/site-writer/copy-check/check-copy.js'
import { CHECKER_VERSION as PICTURE_VERSION } from '../src/site-pictures/picture-check/check-pictures.js'
import { KIT, copy, plan, runStep, CONTRACT } from './_write-step-run.mjs'
import { readBackGroup } from '../src/site-check/read-back.js'
import { unownedSlots } from '../src/write-step/owner-table.js'

function fixture() {
  const kit = KIT(),
    planned = plan(),
    native = {
      key: 'module-2.9',
      entity: 'module-2',
      column: 'params',
      jsonPath: ['titles', '8'],
      type: 'text',
      role: 'editorial.heading',
      requiresEvidence: false,
      sample: 'Reservation',
      maxCharacters: 42,
      fit: {
        measured: true,
        maxCharacters: 11,
        maxChars: { desktop: 11, phone: 18 },
        boxes: { desktop: { width: 119, height: 72 }, phone: { width: 306, height: 43 } }
      }
    }
  kit.doc.pages = [
    { id: 'page-home', titleSlot: 'block-2.9', path: '/', blocks: { 1440: ['block-2'], 390: ['block-2'] } }
  ]
  kit.doc.blocks.find((b) => b.id === 'block-2').source = { entity: 'module-2' }
  kit.doc.storedFields = [
    {
      slot: 'block-2.9',
      listedIn: 'block-2',
      field: 'params.titles.8',
      type: 'text',
      sample: 'Reservation',
      drives: [{ page: '/', shown: true, title: true, attribute: 'text' }]
    },
    { slot: 'block-2.10', listedIn: 'block-2', field: 'params.other', type: 'text', sample: 'Unrelated' }
  ]
  planned.pages[0].blocks[0].copy.push({
    slot: 'block-2.9',
    says: 'the page heading',
    basis: 'trade',
    maxCharacters: 11
  })
  return { kit, planned, map: { slots: [native] } }
}

test('exact measured title reaches planner, writer index, owner and native write; live read-back rejects reopening', async () => {
  const { kit, planned, map } = fixture()
  const before = JSON.stringify({ kit, map, planned })
  const projected = withMeasuredTitles(kit.doc, map, { contract: CONTRACT })
  const title = projected.blocks.find((b) => b.id === 'block-2').slots.find((s) => s.id === 'block-2.9')
  assert.equal(title.maxCharacters, 11)
  const checked = checkPlan({ kit: projected, plan: planned, brief: { facts: [] } })
  assert.equal(checked.rules.find((r) => r.id === 'R20').status, 'pass')
  assert.ok(!checked.rules.find((r) => r.id === 'R01').failures.some((f) => f.where.includes('block-2.9')))
  const index = indexInputs({ kit: projected, plan: planned, brief: {} })
  assert.equal(index.kitSlots.get('block-2.9').maxCharacters, 11)
  assert.ok(!index.kitSlots.has('block-2.10'))
  const written = copy()
  written.slots.push({ slot: 'block-2.9', owner: 'writer', text: 'Booking', factIds: [] })
  const done = await runStep(
    { plan: planned, copy: written },
    { extraKeys: ['module-2.9'] },
    { kit: { ...kit, doc: projected } }
  )
  assert.equal(done.line('block-2.9').status, 'written')
  assert.ok(done.site.applies().some((call) => call.params.changes?.['module-2.9'] === 'Booking'))
  const report = { ...done.report, slots: [done.line('block-2.9')] }
  const read = async (action, params) => {
    const result = await done.site.door.apply({ siteKey: done.report.site, action, params })
    if (action === 'content.contract' && params.operation === 'inspect')
      result.slots.find((s) => s.key === 'module-2.9').current = done.site.held['module-2.9']
    return result
  }
  assert.equal((await readBackGroup.run({ report, read })).failures.length, 0)
  done.site.held['module-2.9'] = 'Reservation'
  assert.ok((await readBackGroup.run({ report, read })).failures.some((f) => f.slot === 'block-2.9'))
  assert.equal(JSON.stringify({ kit, map, planned }), before)
})

test('mismatched, unmeasured, hidden-only and competing fields never gain a title declaration', () => {
  for (const scenario of [
    'contract',
    'path',
    'owner',
    'type',
    'sample',
    'unmeasured',
    'missing-phone',
    'no-fit-limit',
    'unwritable',
    'stored-unwritable',
    'other-owner',
    'brand',
    'not-on-page',
    'duplicate',
    'no-title',
    'evidence',
    'no-drive',
    'wrong-drive',
    'conflicting-listed-in',
    'missing-entity',
    'empty-entity',
    'missing-column',
    'empty-column',
    'owner-unwritable',
    'owner-prefix',
    'native-prefix',
    'missing-role',
    'invalid-role'
  ]) {
    const { kit, map } = fixture()
    const native = map.slots[0],
      stored = kit.doc.storedFields[0]
    if (scenario === 'contract') map.contract = 'another-contract'
    if (scenario === 'path') native.jsonPath[1] = '9'
    if (scenario === 'owner') native.entity = 'module-3'
    if (scenario === 'type') native.type = 'url'
    if (scenario === 'sample') native.sample = ''
    if (scenario === 'unmeasured') native.fit.measured = false
    if (scenario === 'missing-phone') delete native.fit.boxes.phone
    if (scenario === 'no-fit-limit') delete native.fit.maxCharacters
    if (scenario === 'unwritable') native.writable = false
    if (scenario === 'stored-unwritable') stored.writable = false
    if (scenario === 'other-owner')
      kit.doc.blocks.find((b) => b.id === 'block-3').slots.push({ id: 'block-2.9', type: 'text' })
    if (scenario === 'brand')
      (kit.doc.site ??= {}).nameSlots = [{ kind: 'slot', id: 'block-2.9', block: 'block-2' }]
    if (scenario === 'not-on-page') kit.doc.pages[0].blocks = { 1440: ['block-3'] }
    if (scenario === 'duplicate') map.slots.push({ ...native })
    if (scenario === 'no-title') kit.doc.pages[0].titleSlot = null
    if (scenario === 'evidence') native.requiresEvidence = true
    if (scenario === 'no-drive') delete stored.drives
    if (scenario === 'wrong-drive') stored.drives[0].page = '/other'
    if (scenario === 'conflicting-listed-in') stored.listedIn = 'block-3'
    if (scenario === 'missing-entity' || scenario === 'empty-entity') {
      // With only one block, absent/empty entities must never form a misleading unique owner join.
      kit.doc.blocks = [kit.doc.blocks.find((b) => b.id === 'block-2')]
      native.entity = scenario === 'empty-entity' ? '' : undefined
      kit.doc.blocks[0].source.entity = native.entity
    }
    if (scenario === 'missing-column' || scenario === 'empty-column') {
      native.column = scenario === 'empty-column' ? '' : undefined
      stored.field = '.titles.8'
    }
    if (scenario === 'owner-unwritable') kit.doc.blocks.find((b) => b.id === 'block-2').writable = false
    if (scenario === 'owner-prefix') {
      const owner = kit.doc.blocks.find((b) => b.id === 'block-3')
      owner.source = { entity: native.entity }
      delete kit.doc.blocks.find((b) => b.id === 'block-2').source
      stored.listedIn = owner.id
      kit.doc.pages[0].blocks = { 1440: [owner.id], 390: [owner.id] }
    }
    if (scenario === 'native-prefix') {
      native.entity = 'module-other'
      kit.doc.blocks.find((b) => b.id === 'block-2').source.entity = native.entity
    }
    if (scenario === 'missing-role') delete native.role
    if (scenario === 'invalid-role') native.role = 'editorial.not-a-heading'
    const projected = withMeasuredTitles(kit.doc, map)
    assert.equal(projected, kit.doc, scenario)
  }
})

test('a projected title of a dropped page in a kept masthead stays outside closing writes', async () => {
  const { kit, planned, map } = fixture()
  kit.doc.pages.push({
    id: 'page-dropped',
    titleSlot: 'block-2.11',
    path: '/dropped',
    blocks: { 1440: ['block-2'], 390: ['block-2'] }
  })
  kit.doc.storedFields.push({
    slot: 'block-2.11',
    listedIn: null,
    field: 'params.titles.9',
    type: 'text',
    sample: 'Offers',
    drives: [{ page: '/dropped', shown: true, title: true, attribute: 'text' }]
  })
  map.slots.push({ ...map.slots[0], key: 'module-2.11', jsonPath: ['titles', '9'], sample: 'Offers' })
  planned.pages.push({ id: 'page-dropped', decision: 'drop', why: 'No supported offers.' })
  const projected = withMeasuredTitles(kit.doc, map)
  const unowned = unownedSlots({ plan: planned, kit: projected, owners: new Map() })
  assert.ok(
    unowned.some((s) => s.slot === 'block-2.9'),
    'an unfilled title on a kept page still requires closure'
  )
  assert.ok(!unowned.some((s) => s.slot === 'block-2.11'))
  assert.ok(projected.blocks.find((b) => b.id === 'block-2').slots.some((s) => s.id === 'block-2.11'))
  const written = copy()
  written.slots.push({ slot: 'block-2.9', owner: 'writer', text: 'Booking', factIds: [] })
  const done = await runStep(
    { plan: planned, copy: written },
    { extraKeys: ['module-2.9', 'module-2.11'] },
    { kit: { ...kit, doc: projected } }
  )
  assert.equal(done.line('block-2.9').status, 'written')
  assert.equal(done.line('block-2.11'), undefined)
  assert.ok(!done.report.unowned.some((s) => s.slot === 'block-2.11'))
  assert.ok(
    done.site
      .applies()
      .every(
        (call) =>
          !Object.hasOwn(call.params.changes ?? {}, 'module-2.11') &&
          !(call.params.empty_slots ?? []).includes('module-2.11')
      )
  )
})

test('a projected measured title still obeys native slot refusal', async () => {
  const { kit, planned, map } = fixture()
  const written = copy()
  written.slots.push({ slot: 'block-2.9', owner: 'writer', text: 'Booking', factIds: [] })
  const done = await runStep(
    { plan: planned, copy: written },
    {
      extraKeys: ['module-2.9'],
      refuse: { 'module-2.9': { code: 'SLOT_READ_ONLY', message: 'Native field is read-only.' } }
    },
    { kit: { ...kit, doc: withMeasuredTitles(kit.doc, map) } }
  )
  assert.notEqual(done.line('block-2.9')?.status, 'written')
  assert.ok(!Object.hasOwn(done.site.held, 'module-2.9'))
})

test('the released Diner kit stays immutable while openKit supplies only its measured omitted titles', () => {
  const contract = [...defaultContracts().values()].find((c) => c.id === 'ja-diner/j6/1.0.8')
  const raw = kitOfContract(contract).doc
  // Released Reservation evidence: null listedIn, exact measured text drive/path and native masthead owner.
  const stored = raw.storedFields.find((s) => s.slot === 'block-106.11')
  assert.equal(stored.listedIn, null)
  assert.equal(stored.field, 'params.menuitem_config.title.8')
  assert.ok(
    stored.drives.some(
      (drive) =>
        drive.page === '/reservation' &&
        drive.shown === true &&
        drive.title === true &&
        drive.attribute === 'text'
    )
  )
  assert.equal(raw.blocks.find((b) => b.id === 'block-106').source.entity, 'module-106')
  const before = JSON.stringify(raw)
  assert.ok(!raw.blocks.find((b) => b.id === 'block-106').slots.some((s) => s.id === 'block-106.11'))
  const view = openKit(contract.id).doc
  const title = view.blocks.find((b) => b.id === 'block-106').slots.find((s) => s.id === 'block-106.11')
  assert.equal(title.maxCharacters, 11)
  assert.deepEqual(title.pageTitleOf, ['page-reservation'])
  assert.equal(JSON.stringify(raw), before)
})

test('old paid writer and picture runs refuse the changed kit view before prepare, storage reads or provider calls', async () => {
  for (const [prefix, old, current] of [
    ['SITE_WRITER', 'site-copy-check/9', WRITER_VERSION],
    ['SITE_PICTURES', 'site-pictures-check/2', PICTURE_VERSION]
  ]) {
    const prompt = { text: 'Frozen.', sha256: 'a'.repeat(64) }
    const row = { id: 'paid-frozen-run', checker_version: old, prompt_sha256: prompt.sha256 }
    const finishes = []
    const step = {
      codePrefix: prefix,
      prompt: () => prompt,
      checker: { version: current },
      prepare: async () => {
        throw Error('must not prepare a mismatched run')
      }
    }
    await runBenchRun(
      step,
      {
        pool: {
          query: () => {
            throw Error('must not read paid data')
          }
        },
        fetchImpl: () => {
          throw Error('must not call a provider')
        }
      },
      row,
      {
        token: 'frozen',
        finish: async (result) => {
          finishes.push(result)
          return true
        }
      }
    )
    assert.equal(finishes[0].status, 'failed')
    assert.match(finishes[0].error, new RegExp(`^${prefix}_CHECKER_CHANGED:`))
    assert.equal(row.checker_version, old)
  }
})
