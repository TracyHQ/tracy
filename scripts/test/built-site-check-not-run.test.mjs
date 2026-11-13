// A check that examined nothing while there was something to examine says not_run, never ran (ticket #601); and a
// write over a design line's parent or under it is a design write.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { overlaps } from '../built-site-check/check-design.mjs'
import { kit, pages, writeResult } from './fixtures/built-site-check/florist.mjs'
import { reportOf } from './fixtures/built-site-check/report-of.mjs'

const gutter = { slot: 'module-10.4', entity: 'module-10', column: 'params', jsonPath: ['gutter'] }
const designWrite = (loc) => writeResult({ values: [{ loc, entry: null, value: '8' }] })

test('a write of the whole column, a parent or a deeper path of a design line is a design write', async () => {
  for (const [loc, slot] of [
    [{ entity: 'module-10', column: 'params' }, 'module-10.3'],
    [{ entity: 'module-10', column: 'params', jsonPath: [] }, 'module-10.3'],
    [{ entity: 'module-10', column: 'params', jsonPath: ['gutter', 'size'] }, 'module-10.4']
  ]) {
    const report = await reportOf({ write: designWrite(loc) })
    assert.deepEqual(
      report.checks.design.findings.map((f) => [f.kind, f.place.slot]),
      [['design_field_written', slot]],
      JSON.stringify(loc)
    )
  }
})

test('near miss: a sibling path, another column or another record is not a design write', async () => {
  for (const loc of [
    { entity: 'module-10', column: 'params', jsonPath: ['gutters'] },
    { entity: 'module-10', column: 'title' },
    { entity: 'module-11', column: 'params' }
  ])
    assert.equal(overlaps(loc, gutter), false, JSON.stringify(loc))
  assert.equal(
    overlaps({ entity: 'module-10', column: 'params', xpath: '/div' }, { ...gutter, xpath: '/divs' }),
    false
  )
  assert.equal(
    overlaps({ entity: 'module-10', column: 'params', xpath: '/div' }, { ...gutter, xpath: '/div/a' }),
    true
  )
})

test('nothing of the write ran: design and limits say not_run, not zero findings', async () => {
  const report = await reportOf({ write: writeResult({ ran: [] }) })
  for (const name of ['design', 'limits']) {
    assert.equal(report.checks[name].status, 'not_run', name)
    assert.match(report.checks[name].reason, /^nothing_ran/)
  }
})

test('a kit with no design place: the design check says not_run', async () => {
  const k = kit()
  k.blockStore.blocks[0].fields.pop()
  delete k.mapping.blocks['hero-main'].designLines
  delete k.mapping.blocks['hero-main'].fields['design-overlay']
  k.contentMap.slots = k.contentMap.slots.filter((s) => !s.role)
  const report = await reportOf({ kit: k })
  assert.match(report.checks.design.reason, /^no_design_place/)
})

test('written values naming no entry of the order: the limits check says not_run', async () => {
  const w = writeResult()
  for (const v of w.plan.ops.at(-1).values) v.entry = `x/${v.entry}`
  const report = await reportOf({ write: w })
  assert.match(report.checks.limits.reason, /^write_order_unmatched: none of 3/)
})

test('a plan with no page, and no page read: pages, demo and links say not_run', async () => {
  const empty = await reportOf({ approval: { plan: { pages: [] } } })
  assert.match(empty.checks.pages.reason, /^plan_has_no_pages/)
  const noPage = await reportOf({
    files: { 'readme.txt': 'x' },
    demoScan: async () => [],
    linkCheck: async () => []
  })
  for (const name of ['demo', 'links']) assert.match(noPage.checks[name].reason, /^no_rendered_page/, name)
  const near = await reportOf({ files: pages(), demoScan: async () => [], linkCheck: async () => [] })
  assert.deepEqual([near.checks.demo.status, near.checks.links.status], ['ran', 'ran'])
})
