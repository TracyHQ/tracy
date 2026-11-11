// Original-post provenance is enforced at the actual export/write boundary, including failed historical output.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportContractMapping } from '../src/lib/site-copy/contract-mapping.js'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { copy, KIT, plan, runStep } from './_write-step-run.mjs'

function fixture() {
  const kit = KIT()
  kit.doc.blocks.find((b) => b.id === 'block-2').slots[0].role = 'article.title'
  const p = plan()
  const c = copy()
  const wish = p.pages[0].blocks[0].copy[0]
  wish.factIds = ['service']
  c.slots.find((s) => s.slot === wish.slot).factIds = ['service']
  c.slots.find((s) => s.slot === wish.slot).text = 'Invented camp diary'
  const brief = {
    facts: [
      { id: 'service', field: 'services', value: 'Boxing' },
      { id: 'post', field: 'posts', value: { kind: 'post', text: 'Owner camp diary' }, onSite: true },
      { id: 'held', field: 'posts', value: { kind: 'post', text: 'Private diary' }, onSite: false },
      { id: 'other', field: 'posts', value: { kind: 'post', text: 'Owner tournament diary' }, onSite: true }
    ]
  }
  return { kit, plan: p, copy: c, brief, wish }
}
const mapped = (f, over = {}) =>
  exportContractMapping({ ...f, kit: f.kit.doc, contract: f.kit.ref, revision: 'test', ...over })
const title = (f) => f.copy.slots.find((s) => s.slot === 'block-2.1')

for (const fact of ['service', 'held', 'missing'])
  for (const canHide of [false, 'measured'])
    test(`unsupported article citing ${fact} never writes invented copy when native hide is ${canHide}`, async () => {
      const f = fixture()
      f.wish.factIds = title(f).factIds = [fact]
      const before = JSON.stringify(f)
      assert.equal(
        checkPlan({ plan: f.plan, kit: f.kit.doc, brief: f.brief }).rules.find((r) => r.id === 'R25').status,
        'fail'
      )
      const out = mapped(f)
      const { report, site, line } = await runStep(
        { plan: f.plan, copy: f.copy, brief: f.brief },
        { overSlot: (slot) => (slot.key === 'module-2.1' ? { canHide } : {}) },
        { kit: f.kit }
      )
      assert.equal(site.held['module-2.1'], canHide ? '' : undefined)
      assert.ok(
        site.applies().every((call) => call.params.changes?.['module-2.1'] === undefined),
        'unsupported copy never reaches a write'
      )
      assert.equal(line('block-2.1').status, canHide ? 'hidden' : 'failed')
      assert.equal(out.mapping.changes['module-2.1'], undefined)
      assert.equal(out.mapping.evidence['module-2.1'], undefined)
      assert.match(out.problems.find((p) => p.where === 'block-2.1').detail, /original owner post/)
      assert.ok(out.mapping.changes['module-2.2'], 'generic trade content remains exportable')
      assert.notEqual(line('block-2.1')?.status, 'written')
      assert.match(
        report.unaddressable.find((p) => p.slot === 'block-2.1')?.reason ?? '',
        /original owner post/
      )
      assert.ok(site.held['module-2.2'], 'the valid generic service copy still reaches the site')
      assert.equal(JSON.stringify(f), before, 'the boundary never rewrites frozen inputs')
    })

test('a valid article plan cannot authorize a writer to substitute service facts or inconsistent article posts', () => {
  const f = fixture()
  f.wish.factIds = ['post']
  assert.equal(
    checkPlan({ plan: f.plan, kit: f.kit.doc, brief: f.brief }).rules.find((r) => r.id === 'R25').status,
    'pass'
  )
  assert.equal(mapped(f).mapping.changes['module-2.1'], undefined)
  // The title and lead must keep one provenance in the actual writer output too.
  f.kit.doc.blocks.find((b) => b.id === 'block-2').slots[1].role = 'article.lead'
  f.plan.pages[0].blocks[0].copy[1].factIds = ['post']
  title(f).factIds = ['post']
  f.copy.slots.find((s) => s.slot === 'block-2.2').factIds = ['other']
  const out = mapped(f)
  assert.equal(out.mapping.changes['module-2.1'], undefined)
  assert.equal(out.mapping.changes['module-2.2'], undefined)
  assert.match(out.problems[0].detail, /same original post/)
})

test('authentic original article and generic trade copy still export and reach the actual write door', async () => {
  const f = fixture()
  f.wish.factIds = title(f).factIds = ['post']
  title(f).text = 'Owner camp diary'
  const out = mapped(f)
  assert.equal(out.mapping.changes['module-2.1'], 'Owner camp diary')
  assert.equal(out.problems.length, 0)
  const { site, line } = await runStep({ plan: f.plan, copy: f.copy, brief: f.brief }, {}, { kit: f.kit })
  assert.equal(site.held['module-2.1'], 'Owner camp diary')
  assert.equal(line('block-2.1').status, 'written')
})

test('article export refuses missing original context and absent kept article decisions', () => {
  const f = fixture()
  for (const over of [{ plan: undefined }, { brief: undefined }]) {
    const out = mapped(f, over)
    assert.equal(out.mapping.changes['module-2.1'], undefined)
    assert.match(out.problems[0].detail, /provenance is unknown/)
  }
  f.plan.pages[0].blocks[0].copy.shift()
  const out = mapped(f)
  assert.equal(out.mapping.changes['module-2.1'], undefined)
  assert.match(out.problems[0].detail, /no kept original-post decision/)
})

test('WordPress uses the same article boundary before preparing its native mapping', () => {
  const f = fixture()
  const contentMap = {
    slots: [{ key: 'block-2.1', type: 'text', entity: 'post', target: { attr: 'title' } }]
  }
  const out = mapped(f, { platform: 'wordpress', contentMap })
  assert.equal(out.mapping.changes['block-2.1'], undefined)
  assert.match(out.problems.find((p) => p.where === 'block-2.1').detail, /original owner post/)
  f.wish.factIds = title(f).factIds = ['post']
  assert.equal(
    mapped(f, { platform: 'wordpress', contentMap }).mapping.changes['block-2.1'],
    'Invented camp diary'
  )
})

test('surplus detail pages are omitted while one authentic page and its listing teaser remain exportable', () => {
  const f = fixture()
  f.kit.doc.blocks = ['a', 'b', 'listing'].map((id) => ({
    id,
    slots: [
      { id: `${id}.title`, role: 'article.title' },
      { id: `${id}.lead`, role: 'article.lead' }
    ],
    ...(id === 'listing'
      ? { lists: [{ id: 'posts', rows: [{ slots: [{ id: 'listing.title', role: 'article.title' }] }] }] }
      : {})
  }))
  const lines = (id) =>
    ['title', 'lead'].map((field) => ({ slot: `${id}.${field}`, basis: 'brief', factIds: ['post'] }))
  f.plan.sharedBlocks = []
  f.plan.pages = ['a', 'b', 'listing'].map((id) => ({
    id,
    decision: 'keep',
    blocks: [{ block: id, decision: 'keep', copy: lines(id) }]
  }))
  f.copy.slots = ['a', 'b', 'listing'].flatMap((id) =>
    lines(id).map((c) => ({ slot: c.slot, text: 'Owner camp diary', owner: 'writer', factIds: c.factIds }))
  )
  const out = mapped(f)
  assert.equal(out.mapping.changes['a.title'], 'Owner camp diary')
  assert.equal(out.mapping.changes['listing.title'], 'Owner camp diary')
  assert.equal(out.mapping.changes['b.title'], undefined)
  assert.equal(out.mapping.changes['b.lead'], undefined)
  assert.match(out.problems.find((p) => p.where === 'b.title').detail, /surplus article page/)
})

test('two article rows cannot duplicate one post, and two distinct authentic posts still export', () => {
  const f = fixture()
  const b = f.kit.doc.blocks.find((b) => b.id === 'block-3')
  for (const slot of b.lists[0].rowSlots) slot.role = 'article.title'
  for (const row of b.lists[0].rows) row.slots[0].role = 'article.title'
  const d = f.plan.pages.flatMap((p) => p.blocks).find((d) => d.block === 'block-3')
  d.lists[0].items.forEach((item) =>
    item.copy.forEach((c) => {
      c.basis = 'brief'
      c.factIds = ['post']
    })
  )
  for (const slot of f.copy.slots.filter((s) => ['block-3.5', 'block-3.6'].includes(s.slot)))
    slot.factIds = ['post']
  const out = mapped(f)
  assert.ok(out.mapping.changes['module-3.5'])
  assert.equal(out.mapping.changes['module-3.6'], undefined)
  assert.match(out.problems.find((p) => p.where === 'block-3.6').detail, /surplus row/)
  d.lists[0].items[1].copy[0].factIds = ['other']
  f.copy.slots.find((s) => s.slot === 'block-3.6').factIds = ['other']
  assert.ok(mapped(f).mapping.changes['module-3.6'])
})
