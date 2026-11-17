// The legal and not-found pages of an approved plan in the draft write (#575), on the real JA Boxing kit with an invented
// florist: the build cannot create a Privacy page or write the not-found words yet, so the write plan builds neither,
// never crashes on them, and says so with a reason (`draft-write-system-pages.mjs`).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-system-pages.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftWriteCoverage, writePlanOf } from '../domain/draft-write-plan.mjs'
import {
  LEGAL_PAGE_NOT_BUILT,
  NOT_FOUND_PAGE_NOT_WRITTEN,
  systemPagesNotBuiltOf
} from '../domain/draft-write-system-pages.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
const approved = site.build.approval.plan

test('the approved plan carries a created Privacy page and the not-found page', () => {
  assert.equal(approved.legalPages[0].use, 'create')
  assert.equal(approved.legalPages[0].id, 'legal:privacy')
  assert.ok(approved.notFound.leadsTo.length > 0)
})

test('the write plan builds neither, with a reason each, and still covers every entry of the order', () => {
  const plan = writePlanOf(site.order, site.aiq, { stored: site.stored, approved })
  assert.deepEqual(plan.notBuilt, [
    { page: 'legal:privacy', kind: 'privacy', reason: LEGAL_PAGE_NOT_BUILT },
    { page: 'notFound', reason: NOT_FOUND_PAGE_NOT_WRITTEN }
  ])
  assert.equal(JSON.stringify(plan.ops).includes('legal:privacy'), false, 'no record of a page not built')
  const coverage = draftWriteCoverage(site.order, plan)
  assert.deepEqual(coverage.unexplained, [])
  assert.equal(coverage.in, coverage.written + coverage.skipped + coverage.conflicted)
})

test("a plan without them, or whose Privacy page is the template's own page, builds nothing aside", () => {
  assert.deepEqual(systemPagesNotBuiltOf(null), [])
  assert.deepEqual(systemPagesNotBuiltOf({ pages: [] }), [])
  const own = { legalPages: [{ kind: 'privacy', use: 'contact', id: 'contact' }] }
  assert.deepEqual(systemPagesNotBuiltOf(own), [])
})
