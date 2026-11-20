// A chain build plans its first draft in parts at the same time (step-chain-steps.js planArgs): the planner run is
// started with --parallel-pages PLAN_PARTS, which the planner bench takes (site-planner/plan-parts.js), and still with the
// visual review and without the whole kit in its first message. No database, no bench.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parallelPagesProblem, planningParts, plansInParts } from '../src/site-planner/plan-parts.js'
import { PLAN_PARTS, planArgs } from '../src/step-chain-steps.js'

const valueOf = (argv, flag) => argv[argv.indexOf(flag) + 1]

test("the chain's planner run plans its first draft in parts, with the visual review, reading the kit by tools", () => {
  const argv = planArgs('ja-boxing/j6/1.0.11', '7ef2a1d4-d846-49d1-adaa-2fad610dd665')
  assert.equal(valueOf(argv, '--kit'), 'ja-boxing/j6/1.0.11')
  assert.equal(valueOf(argv, '--brief-revision'), '7ef2a1d4-d846-49d1-adaa-2fad610dd665')
  assert.equal(valueOf(argv, '--parallel-pages'), String(PLAN_PARTS))
  assert.ok(argv.includes('--require-visual-review'))
  // The whole kit in the first message put all the reasoning into the writing turn (128k output cap, run15).
  assert.ok(!argv.includes('--kit-in-first-message'))
})

test('the number of parts is one the planner bench takes and plans in parts; a kit with fewer groups gets fewer parts, the whole site first', () => {
  assert.ok(PLAN_PARTS > 1)
  assert.equal(parallelPagesProblem(PLAN_PARTS), null)
  assert.equal(plansInParts({ parallelPages: PLAN_PARTS }), true)
  const page = (id, group, blocks) => ({ id, group, blocks: { 1440: ['header', ...blocks, 'footer'] } })
  const kit = (groups) => ({
    pageGroups: groups.map((g) => ({ id: g, root: `page-${g}` })),
    pages: groups.map((g) => page(`page-${g}`, g, ['a', 'b']))
  })
  // The whole site's part, then the groups over the others.
  const five = planningParts(kit(['home', 'classes', 'about', 'plans', 'contact']), PLAN_PARTS)
  assert.equal(five.length, PLAN_PARTS)
  assert.deepEqual(five[0], [])
  assert.deepEqual(five.flat(), ['home', 'classes', 'about', 'plans', 'contact'])
  assert.deepEqual(planningParts(kit(['home', 'contact']), PLAN_PARTS), [[], ['home'], ['contact']])
})
