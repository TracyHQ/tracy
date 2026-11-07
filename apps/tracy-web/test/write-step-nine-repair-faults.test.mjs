// Step 9b (#448): which faults the repair pass sends, tested at the step 9 entry point with the site agent faked. A value
// the brief gives is never sent as the demo's, a fault past the per-turn cap is logged, every kind that is not sent says
// why. The brief is the invented one of the copy check tests.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REPAIR_LIMITS } from '../src/write-step/repair-pass/repair-limits.js'
import { brief } from './_site-copy-check.mjs'
import { checkOf, failure, fakeAgent, stepNine } from './_write-step-nine-repair.mjs'

const itemsOf = (agent) => agent.sent.requests.flatMap((r) => r.items)
const codes = (repair) => repair.skipped.map((s) => s.code)

test("a fault naming the brief's own phone, e-mail, name or address is logged not-demo and never sent", async () => {
  const agent = fakeAgent()
  const first = checkOf([
    // The brief's phone, spaced another way, measured as a demo fact.
    failure('demo-words', '/', 'block-2.1', 'Call +000 5550 100'),
    failure('demo-links', '/contact', 'block-5.1', 'mailto:hello@quay-fitness.example'),
    // The brief's name and address, measured as demo words.
    failure('demo-words', '/', 'block-2.3', 'Quay Fitness Studio'),
    failure('demo-words', '/contact', 'block-5.2', '12 Harbour Row - Quay District - Example City'),
    failure('demo-words', '/about', 'block-4.2', 'Welcome to Quay Fitness Studio'),
    // A demo fact that is the demo's: still sent.
    failure('demo-words', '/', 'block-2.2', 'Call Demo Gym on 111 222 3333')
  ])
  const { result } = await stepNine({ checks: [first, checkOf([])], agent, files: { brief: brief() } })
  const notDemo = result.repair.skipped.filter((s) => s.code === 'not-demo')
  assert.equal(notDemo.length, 5, JSON.stringify(result.repair.skipped))
  assert.ok(notDemo.every((s) => /the brief gives/.test(s.reason)))
  assert.deepEqual(
    itemsOf(agent).map((i) => i.element.label),
    ['block-2.2'],
    'only the demo fault that is the demo is sent'
  )
})

test('a demo fault is sent as before when the step has no brief', async () => {
  const agent = fakeAgent()
  const { result } = await stepNine({
    checks: [checkOf([failure('demo-words', '/', 'block-2.1', '000 555 0100')]), checkOf([])],
    agent
  })
  assert.equal(itemsOf(agent).length, 1)
  assert.ok(!codes(result.repair).includes('not-demo'))
})

test('faults past the per-turn item cap are logged in notSent as item-cap, never dropped silently', async () => {
  const agent = fakeAgent()
  const cap = REPAIR_LIMITS.itemsPerTurn
  const many = Array.from({ length: cap + 3 }, (_, i) =>
    failure('demo-words', '/', `block-2.${i + 1}`, `Demo words number ${i + 1}`)
  )
  const { result } = await stepNine({ checks: [checkOf(many), checkOf([])], agent })
  assert.equal(itemsOf(agent).length, cap)
  const capped = result.repair.notSent.filter((n) => n.reason === 'item-cap')
  assert.equal(capped.length, 1)
  assert.equal(capped[0].page, '/')
  assert.equal(capped[0].faults, 3)
  assert.deepEqual(
    capped[0].slots,
    many.slice(cap).map((f) => f.slot)
  )
})

test('every fault not sent says why by code; an unknown group or kind is unknown-kind, not dropped', async () => {
  const agent = fakeAgent()
  const first = checkOf([
    failure('accent-emphasis', '/', 'block-2.1', 'Strong body'),
    failure('read-back', '/', 'block-2.1', 'written value missing'),
    failure('kit-version', '/', null, '1.0.9'),
    failure('a-group-no-table-names', '/', 'block-2.3', 'something'),
    failure('demo-words', null, 'block-6.2', 'Demo Gym')
  ])
  const { result } = await stepNine({ checks: [first], agent })
  assert.equal(agent.sent.prompts.length, 0)
  const byGroup = Object.fromEntries(result.repair.skipped.map((s) => [s.group ?? s.kind, s.code]))
  assert.deepEqual(byGroup, {
    'accent-emphasis': 'never-sent',
    'read-back': 'not-visible',
    'kit-version': 'not-visible',
    'a-group-no-table-names': 'unknown-kind',
    'demo-words': 'no-page'
  })
  assert.ok(result.repair.skipped.every((s) => typeof s.reason === 'string' && s.reason))
})
