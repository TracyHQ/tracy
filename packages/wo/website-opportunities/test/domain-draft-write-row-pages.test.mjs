// A row keyed to a page is written only for a page the module prints on (ticket #597, gate run 7): the masthead copy
// for the site is assigned to the pages that place it, so a row keyed to the home page, which places no masthead, is
// written and never seen. The plan skips it, typed and counted (`row_keyed_page_without_block`). An every-page module
// prints everywhere, so the same row is kept. The invented florist on the real JA Boxing kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-row-pages.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftWriteCoverage, writePlanOf } from '../domain/draft-write-plan.mjs'
import { ROW_KEYED_PAGE_WITHOUT_BLOCK } from '../domain/draft-write-row-pages.mjs'
import { plan, site } from './fixtures/draft-write/guarded.mjs'

const keyedPages = (p) =>
  (p.ops.find((op) => op.key === 'copy:site.block-162')?.values ?? [])
    .filter((v) => v.rule === 'key_at')
    .map((v) => v.value.ref.slice('page:'.length))
    .sort()
const placing = site.order.pages
  .filter((page) => page.blocks.some((b) => b.block === 'block-162' && b.state !== 'hidden'))
  .map((page) => page.id)

test('the masthead keys rows only to the pages that place it; the home row is skipped, typed', () => {
  assert.deepEqual(placing.sort(), ['classes', 'contact'])
  for (const page of keyedPages(plan)) assert.ok(placing.includes(page), `a row keyed to ${page}`)
  assert.ok(!keyedPages(plan).includes('home'))
  const skipped = plan.skipped.filter((s) => s.reason === ROW_KEYED_PAGE_WITHOUT_BLOCK)
  assert.ok(skipped.length > 0)
  assert.ok(skipped.every((s) => s.entry.includes('.pages.')))
  const coverage = draftWriteCoverage(site.order, plan)
  assert.equal(coverage.byReason[ROW_KEYED_PAGE_WITHOUT_BLOCK], skipped.length)
  assert.deepEqual(coverage.unexplained, [])
})

test('an invented kit shape: a masthead on every page prints the home row, so it is written', () => {
  const aiq = structuredClone(site.aiq)
  aiq.mapping.placements['block-162'].assign = 'every-page'
  const every = writePlanOf(site.order, aiq, { stored: site.stored })
  assert.ok(keyedPages(every).includes('home'))
  assert.ok(!every.skipped.some((s) => s.reason === ROW_KEYED_PAGE_WITHOUT_BLOCK))
})

test('an invented kit shape: a copy per page prints only its own page row', () => {
  const aiq = structuredClone(site.aiq)
  aiq.mapping.placements['block-162'].assign = 'page'
  const own = writePlanOf(site.order, aiq, { stored: site.stored })
  for (const op of own.ops.filter((o) => o.key.startsWith('copy:') && o.source?.entity === 'module-162')) {
    const page = op.key.slice('copy:'.length).split('.')[0]
    // The rows of the pages list (the block's own keyed row, `keyedRow`, is the block's and stays).
    for (const v of op.values.filter((x) => x.rule === 'key_at' && x.entry.includes('.pages.')))
      assert.equal(v.value.ref, `page:${page}`)
  }
})
