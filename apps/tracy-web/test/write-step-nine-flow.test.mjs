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
  assert.equal(result.repair.status, 'incomplete')
  assert.equal(result.report.status, 'stopped')
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

test('a failed scripted write checkpoint stops before checks or native repair prompts', async () => {
  const agent = fakeAgent()
  const { result, checksRun, saved } = await stepNine({
    checks: [checkOf([DEMO])],
    agent,
    input: {
      beforeRepair: async () => {
        throw new Error('setup moment did not finish')
      }
    }
  })
  assert.equal(result.report.status, 'stopped')
  assert.equal(result.report.cause.code, 'STEP_NINE_BASELINE_UNPROVEN')
  assert.equal(checksRun, 0)
  assert.equal(agent.sent.opened, 0)
  assert.equal(agent.sent.prompts.length, 0)
  assert.equal(saved.get('site-write-report.json').cause.reason, 'setup moment did not finish')
})

test('a chain build runs 9b on the faults it sends beside those it never sends, and hands the site over without it when it has none to send', async () => {
  // Dev, 27/11/2026: a fault 9b never sends no longer keeps it from those it sends; with none to send it does not run.
  const UNADDRESSABLE = failure('unaddressable-items', null, 'block-9.1', 'Nothing to write it to')
  const gated = { repairOnlyWhatItCanSend: true }
  const mixed = await stepNine({
    checks: [checkOf([DEMO, UNADDRESSABLE]), checkOf([UNADDRESSABLE])],
    agent: fakeAgent(),
    input: gated
  })
  assert.ok(
    mixed.saved.get('repair-pass.json').timeline.some((s) => s.stage === 'turn'),
    'the demo words are sent though a plan item has no slot'
  )
  assert.equal(
    mixed.result.report.status,
    'stopped',
    'a fault 9b never sends still holds the site for review'
  )
  const skipped = await stepNine({
    checks: [checkOf([UNADDRESSABLE])],
    agent: fakeAgent(),
    input: gated
  })
  const notRun = skipped.saved.get('repair-pass.json')
  assert.equal(notRun.status, 'not-run')
  assert.match(notRun.reason, /none of a kind the repair pass sends \(unaddressable-items\)/)
  assert.deepEqual(
    notRun.timeline.map((s) => s.stage),
    ['write', 'first-check']
  )
  assert.equal(skipped.checksRun, 1, 'the first check is the one handed over')
  const finishes = await stepNine({
    checks: [checkOf([DEMO]), checkOf([])],
    agent: fakeAgent(),
    input: gated
  })
  assert.ok(
    finishes.saved.get('repair-pass.json').timeline.some((s) => s.stage === 'turn'),
    'the pass ran a turn'
  )
  // Without the option (the write step bench), 9b still runs on the same faults.
  const bench = await stepNine({
    checks: [checkOf([DEMO, UNADDRESSABLE]), checkOf([UNADDRESSABLE])],
    agent: fakeAgent()
  })
  assert.ok(bench.saved.get('repair-pass.json').timeline.some((s) => s.stage === 'turn'))
})
