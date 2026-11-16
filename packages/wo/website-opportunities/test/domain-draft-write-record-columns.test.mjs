// The kit keys of #587 the draft write reads (ticket #597) and the dates of the articles it creates: a page type's
// `record.facts` (the business name in an article's `created_by_alias`, where the site printed "Admin"), the field
// group hides of block-166 (`setting`: no statistic, no tile) and block-170 (`unassign`: no logo, the footer logo
// module on no page), a hide whose way the write does not know (a typed stop), and dates apart in the list's order.
// Real JA Boxing kit, invented florist.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-record-columns.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
const planOf = ({ order = site.order, mapping = site.aiq.mapping, blockStore = site.aiq.blockStore } = {}) =>
  writePlanOf(order, { ...site.aiq, mapping, blockStore }, { stored: site.stored })
const plan = planOf()
const articles = (p) => p.ops.filter((op) => op.kind === 'article.create')
const business = site.order.facts.find((f) => f.kind === 'business.name').value

test('every created record of a page type whose record declares facts holds them, read from the kit', () => {
  const pages = site.aiq.mapping.pages
  const declared = Object.entries(pages).filter(([, p]) => p.record?.facts)
  assert.ok(declared.length > 0, 'the kit declares record facts')
  const written = plan.ops.filter(
    (op) =>
      op.kind.endsWith('.create') &&
      declared.some(([t, p]) => t === op.pageType && p.record.kind === op.recordKind)
  )
  assert.ok(written.length > 0, 'the florist creates records of those page types')
  for (const op of written)
    for (const column of Object.keys(pages[op.pageType].record.facts)) {
      const v = op.values.find((x) => x.loc.column === column)
      assert.equal(v?.value, business, `${op.key} ${column}`)
      assert.equal(v.rule, 'record.fact:name')
      assert.ok(v.entry, 'the fact entry it comes from')
    }
})

test('a record fact column outside the kind closed list stops the plan; a kit with none writes none', () => {
  const mapping = structuredClone(site.aiq.mapping)
  mapping.pages.class.record.facts = { metakey: { fact: 'name', why: 'invented' } }
  assert.throws(() => planOf({ mapping }), { code: 'record_fact_column_unknown' })
  delete mapping.pages.class.record.facts
  for (const op of articles(planOf({ mapping })))
    assert.equal(
      op.values.some((v) => v.loc.column === 'created_by_alias'),
      false
    )
})

test('the statistics tile with no statistic writes show-on 0; the footer logo with no logo is unassigned', () => {
  const show = plan.ops
    .flatMap((op) => (op.values ?? []).map((v) => ({ op, v })))
    .filter(({ v }) => JSON.stringify(v.loc.jsonPath ?? []).includes('isotope[show-on]'))
  assert.equal(show.length, 1)
  assert.deepEqual([show[0].v.value, show[0].v.rule], ['0', 'hides.setting'])
  const unassign = plan.ops.find((op) => op.kind === 'module.unassign')
  assert.equal(unassign.record, 'store:module-170')
  assert.equal(unassign.sourceId, 170)
  assert.equal(
    plan.ops.some((op) => op.key === 'assign:store:module-170'),
    false,
    'never assigned and unassigned'
  )
  // A field group is no pair: it is not listed among the controls the pair guard reads.
  assert.equal(
    plan.controls.some((c) => c.fields.includes('logo')),
    false
  )
  // It is listed in `fieldGroups`, which the release gate accounts it by: both groups taken off.
  assert.deepEqual(
    plan.fieldGroups
      .filter((g) => g.block === 'block-170' || g.block === 'block-166')
      .map((g) => [g.block, g.by, g.taken])
      .sort(),
    [
      ['block-166', 'setting', true],
      ['block-170', 'unassign', true]
    ]
  )
})

test('a field group with one field written keeps its module on its pages: a logo picture is the footer logo', () => {
  const order = structuredClone(site.order)
  order.look.logo = { kind: 'image' }
  const p = planOf({ order })
  assert.ok(
    p.ops.some(
      (op) =>
        op.key === 'contract:store:module-170' && op.values.some((v) => v.rule.startsWith('fact:logoDark'))
    ),
    'the logo is written into the footer module'
  )
  assert.equal(
    p.ops.some((op) => op.kind === 'module.unassign'),
    false
  )
  assert.ok(p.ops.some((op) => op.key === 'assign:store:module-170'))
  assert.deepEqual(
    p.fieldGroups.filter((g) => g.block === 'block-170').map((g) => g.taken),
    [false]
  )
})

test('a hide whose way the write does not know stops the plan, typed', () => {
  const mapping = structuredClone(site.aiq.mapping)
  mapping.hides['block-170'][0].by = 'unpublish'
  assert.throws(
    () => planOf({ mapping }),
    (e) => e.code === 'hide_by_unknown' && e.details.by === 'unpublish'
  )
})

test('created articles are dated apart: the first item of a newest first list is the newest', () => {
  const list = site.order.pages.flatMap((p) => p.blocks).find((b) => b.block === 'class-list')
  assert.equal(site.aiq.blockStore.blocks.find((b) => b.id === 'class-list').itemsOrder.direction, 'desc')
  const ranks = list.items.map((i) => articles(plan).find((op) => op.key === `article:${i.data}`).dated.rank)
  assert.deepEqual(ranks, [0, 1])
  // Read from the kit's own declaration: a list ordered oldest first dates its first item oldest.
  const blockStore = structuredClone(site.aiq.blockStore)
  blockStore.blocks.find((b) => b.id === 'class-list').itemsOrder.direction = 'asc'
  const asc = articles(planOf({ blockStore }))
  assert.deepEqual(
    list.items.map((i) => asc.find((op) => op.key === `article:${i.data}`).dated.rank),
    [1, 0]
  )
  // The same plan twice gives the same ranks: a resume and a read back agree.
  assert.deepEqual(
    articles(planOf()).map((op) => op.dated),
    articles(plan).map((op) => op.dated)
  )
})
