// The write plan of a draft build (ticket #597) on the real JA Boxing kit with an invented florist
// (`fixtures/draft-write/boxing-site.mjs`): every entry of the write order is written by exactly one operation or
// skipped with its reason, none unexplained; the plan is the same twice; the home page comes before every other
// record; a container copy before the copies it holds; one contract apply per in-place record. The totals are printed.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-plan.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftWriteCoverage, entriesOfOrder, writePlanOf } from '../domain/draft-write-plan.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
const plan = writePlanOf(site.order, site.aiq, { stored: site.stored })
const kindsOf = (ops) => ops.reduce((out, op) => ({ ...out, [op.kind]: (out[op.kind] ?? 0) + 1 }), {})

test('entries in = entries written + entries skipped with a reason, 0 unexplained, none written twice', () => {
  const coverage = draftWriteCoverage(site.order, plan)
  console.log(
    `JA Boxing draft write: ${coverage.in} entries in, ${coverage.written} written, ${coverage.skipped} skipped ` +
      `${JSON.stringify(coverage.byReason)}; ${plan.ops.length} operations ${JSON.stringify(kindsOf(plan.ops))}; ` +
      `unproven ${JSON.stringify(plan.unproven.map((u) => u.code))}`
  )
  assert.deepEqual(coverage.unexplained, [])
  assert.deepEqual(coverage.twice, [])
  assert.equal(coverage.in, coverage.written + coverage.skipped)
  assert.equal(coverage.in, entriesOfOrder(site.order).length)
  assert.ok(coverage.written > 100)
})

test('an entry no operation writes and no skip explains is caught by the coverage', () => {
  const lost = structuredClone(plan)
  const op = lost.ops.find((o) => o.entries.length > 0)
  const [dropped] = op.entries.splice(0, 1)
  assert.deepEqual(draftWriteCoverage(site.order, lost).unexplained, [dropped])
  const twice = structuredClone(plan)
  twice.ops.at(-1).entries.push(op.entries[0])
  assert.deepEqual(draftWriteCoverage(site.order, twice).twice, [op.entries[0]])
})

test('the plan is deterministic: the same order and kit give the same operations', () => {
  const again = writePlanOf(site.order, site.aiq, { stored: site.stored })
  assert.deepEqual(again, plan)
})

test('every operation names the entries it writes and the rules it follows; every value its entry or rule', () => {
  for (const op of plan.ops) {
    assert.ok(Array.isArray(op.entries), op.key)
    assert.ok(op.rules.length > 0, op.key)
    for (const v of op.values ?? []) assert.ok(v.entry || v.rule, `${op.key} ${JSON.stringify(v.loc)}`)
  }
})

test('the home page is created before every other record, a container copy before the copies it holds', () => {
  const firstRecord = plan.ops.findIndex((op) => op.kind !== 'picture.upload')
  assert.equal(plan.ops[firstRecord].key, `menuItem:${plan.mainMenu}:home`)
  const keys = plan.ops.map((op) => op.key)
  const container = keys.indexOf('copy:plans.plans-b3')
  assert.ok(container >= 0 && container < keys.indexOf('copy:plans.plans-b4'))
  assert.ok(container < keys.indexOf('copy:plans.plans-b5'))
  const contracts = plan.ops.filter((op) => op.kind === 'contract.apply').map((op) => op.record)
  assert.equal(new Set(contracts).size, contracts.length)
})
