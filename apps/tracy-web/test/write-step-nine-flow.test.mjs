// Step 9 as one flow (#448, ADR 0044): the write, the first site check (a script), step 9b sending that check's
// customer-visible faults to Tracy's site agent, a second check of only the pages a turn changed, undo of a turn that made
// things worse, hand-over. No model looks at screenshots. Tested at the step 9 entry point with the site agent and the
// site check faked; the write runs for real on the invented files of _write-step-run.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkOf, failure, fakeAgent, fakeClock, stepNine } from './_write-step-nine-repair.mjs'

const DEMO = failure('demo-words', '/', 'module-2.1', 'Call Demo Gym today')
const ALT = failure('alt-matches-picture', '/index.php/about', 'module-4.1', 'Demo coach lifting weights')
const CONTACT = failure('dead-links', '/contact', 'module-7.1', '/index.php/demo-page')

/** A demo fault whose words are long enough that two of them do not fit one comment turn. */
const longDemo = (i) =>
  failure(
    'demo-words',
    '/about',
    `article-1${i}.text`,
    `Demo words ${i} ${'lorem ipsum dolor sit amet '.repeat(40)}`
  )

test('step 9 is write, first check, 9b on its faults, a check of the changed pages; no finder stage', async () => {
  const agent = fakeAgent()
  const { result, checkOptions, saved } = await stepNine({ checks: [checkOf([ALT]), checkOf([])], agent })
  const repair = saved.get('repair-pass.json')
  assert.deepEqual(
    repair.timeline.map((s) => s.stage),
    ['write', 'first-check', 'session', 'turn', 'check']
  )
  assert.equal('finder' in repair, false, 'repair-pass.json names no finder')
  assert.deepEqual(Object.keys(repair.costUsd), ['agent'])
  assert.deepEqual(checkOptions[0].pages, undefined, 'the first check reads every page')
  assert.deepEqual(checkOptions[1].pages, ['/about'], 'the second check reads only the page the turn changed')
  assert.equal(result.repair.status, 'done')
})

test("9b sends the first check's customer-visible faults, never accent emphasis or a step's own check", async () => {
  const agent = fakeAgent()
  const accent = failure('accent-emphasis', '/', 'module-2.2', 'Strong words')
  const readBack = failure('read-back', '/', 'module-2.3', 'written value missing')
  const { result } = await stepNine({
    checks: [checkOf([DEMO, accent, readBack, ALT]), checkOf([])],
    agent
  })
  const sent = agent.sent.requests.flatMap((r) => r.items.map((i) => i.element.label))
  assert.deepEqual(sent.sort(), ['module-2.1', 'module-4.1'])
  assert.deepEqual(result.repair.skipped.map((s) => s.code).sort(), ['never-sent', 'not-visible'])
})

test('a page whose faults do not fit one comment turn is split into several turns, each within the limit', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({ clock })
  const faults = [0, 1, 2].map(longDemo)
  const { result, checksRun } = await stepNine({ checks: [checkOf(faults), checkOf([])], agent, clock })
  assert.equal(result.repair.status, 'done')
  assert.ok(agent.sent.prompts.length >= 2, 'more than one turn')
  assert.equal(agent.sent.opened, 1, "the page's turns share its session")
  assert.equal(
    result.repair.turns.reduce((n, t) => n + t.faults.length, 0),
    3,
    'every fault is sent, none lost to the split'
  )
  assert.deepEqual(result.repair.notSent, [])
  assert.ok(checksRun >= 2, 'the second check ran')
})

test('a turn that throws is logged for its page, the other pages proceed, and the second check runs', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({ clock })
  const request = agent.request
  agent.request = async (input) => {
    if (input.items[0]?.page === '/about') throw new Error('requests door answered 500')
    return request(input)
  }
  const { result, logged, checkOptions } = await stepNine({
    checks: [checkOf([DEMO, ALT, CONTACT]), checkOf([])],
    agent,
    clock
  })
  assert.equal(result.repair.status, 'done')
  assert.deepEqual(result.repair.turns.map((t) => t.page).sort(), ['/', '/contact'])
  assert.deepEqual(agent.sent.undone, [], 'the turns of the other pages are kept')
  assert.deepEqual(
    result.repair.errors.map((e) => [e.page, e.error]),
    [['/about', 'requests door answered 500']]
  )
  assert.ok(logged.some((line) => line.includes('/about') && line.includes('requests door answered 500')))
  assert.ok(checkOptions.length >= 2, 'the second check ran')
  assert.deepEqual([...new Set(checkOptions.slice(1).flatMap((o) => o.pages ?? ['every page']))].sort(), [
    '/',
    '/contact'
  ])
})
