// Step 9b (#448): step 9's repair pass through Tracy's site agent, tested at its one seam, the step 9 entry point, with the
// site agent faked. Only what goes out is asserted: what was sent to the agent, what was undone, what was handed over and
// what was logged. The write runs for real on invented frozen files and a fake site (_write-step-run.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REPAIR_LIMITS } from '../src/write-step/repair-pass/repair-limits.js'
import { checkOf, failure, fakeAgent, fakeClock, stepNine } from './_write-step-nine-repair.mjs'

const ALT = failure('alt-matches-picture', '/index.php/about', 'module-4.1', 'Demo coach lifting weights')
const OVER = failure('words-over-picture', '/index.php/about', 'module-4.2', 'Join the class')
const DEMO = failure('demo-words', '/', 'module-2.1', 'Call Demo Gym today')

const itemsOf = (agent) => agent.sent.requests.flatMap((r) => r.items)

test('each visible fault is sent once, with its page, element and one sentence; faults of one page share one turn', async () => {
  const agent = fakeAgent()
  const first = checkOf([ALT, OVER, DEMO, { ...ALT, width: 390 }])
  const found = [
    // The same alt fault the check names, seen by the finder: sent once.
    {
      page: '/about',
      viewport: 'desktop',
      tile: 0,
      slot: 'module-4.1',
      kind: 'wrong-alt',
      seen: 'The alt says "Demo coach"'
    },
    {
      page: '/',
      viewport: 'phone',
      tile: 1,
      slot: null,
      block: 'module-3',
      kind: 'broken-layout',
      seen: 'The heading runs off the page'
    }
  ]
  const { result } = await stepNine({ checks: [first, checkOf([])], agent, found })
  assert.equal(result.report.status, 'done')
  assert.equal(agent.sent.opened, 1)
  // Two pages, two turns, in one session.
  assert.equal(agent.sent.prompts.length, 2)
  const pages = agent.sent.requests.map((r) => r.items.map((i) => i.page))
  assert.deepEqual(
    pages,
    [
      ['/about', '/about'],
      ['/', '/']
    ],
    'pages in the order their first fault was named'
  )
  const items = itemsOf(agent)
  assert.equal(items.length, 4, 'the alt fault named twice and by the finder is one item')
  const alt = items.find((i) => i.element.label === 'module-4.1')
  assert.equal(alt.url, 'https://site.example/about')
  assert.equal(alt.element.text, 'Demo coach lifting weights')
  assert.match(alt.text, /alt text/i)
  assert.ok(!alt.text.includes('\n'), 'one sentence')
  // The turn is the popover's numbered comment turn, citing the request numbers.
  const turn = agent.sent.prompts[0].text
  for (const n of [1, 2]) assert.match(turn, new RegExp(`n="${n}"`))
  assert.match(turn, /module-4\.1/)
  assert.equal(result.repair.turns.length, 2)
  assert.deepEqual(result.repair.undone, [])
})

test('excluded kinds are never sent: accent emphasis, glued words, emphasis codes, a missing h1, faults with no page, invisible faults', async () => {
  const agent = fakeAgent()
  const first = checkOf([
    failure('accent-emphasis', '/', 'module-2.1', 'Strong body'),
    failure('glued-words', '/', 'module-2.2', 'THEPOOL'),
    failure('emphasis-codes-left', '/', 'module-2.3', '((SPAN))'),
    failure('main-heading', '/', null, 'no h1'),
    failure('demo-words', null, 'module-6.2', 'Demo Gym'),
    failure('read-back', '/', 'module-2.1', 'written value missing')
  ])
  const found = [
    {
      page: '/',
      viewport: 'desktop',
      tile: 0,
      kind: 'lost-emphasis',
      seen: 'The accent word lost its colour'
    }
  ]
  const { result } = await stepNine({ checks: [first], agent, found })
  assert.equal(agent.sent.opened, 0, 'no fault to send opens no session')
  assert.equal(agent.sent.prompts.length, 0)
  const reasons = result.repair.skipped.map((s) => s.reason)
  assert.equal(result.repair.skipped.length, 7)
  assert.ok(reasons.some((r) => /accent emphasis/.test(r)))
  assert.ok(reasons.some((r) => /no page/.test(r)))
  assert.equal(result.siteCheck, first, 'nothing changed, so the first check is handed over')
})

test('no faults means no turn, and the site is handed over with the first check', async () => {
  const agent = fakeAgent()
  const first = checkOf([])
  const { result, saved } = await stepNine({ checks: [first], agent })
  assert.equal(agent.sent.opened, 0)
  assert.equal(result.siteCheck, first)
  assert.equal(result.repair.status, 'nothing-to-send')
  // The step's outputs are written side by side, the repair pass's result among them.
  assert.deepEqual([...saved.keys()].sort(), [
    'first-site-check.json',
    'repair-pass.json',
    'site-check.json',
    'site-write-report.json'
  ])
  assert.equal(saved.get('repair-pass.json').status, 'nothing-to-send')
})

test('a turn that causes a new blocking failure on its page is undone, newest first', async () => {
  const agent = fakeAgent()
  const first = checkOf([DEMO, ALT, failure('demo-words', '/contact', 'module-5.1', 'demo@example.test')])
  // After the turns: both the home page and the contact page broke where they were changed; about is fine.
  const second = checkOf([
    failure('text-overflow', '/', 'module-2.1', 'wider than 390 px'),
    failure('dead-links', '/index.php/contact', 'module-5.2', '/missing')
  ])
  const { result } = await stepNine({ checks: [first, second, checkOf([])], agent })
  const byPage = Object.fromEntries(result.repair.turns.map((t) => [t.page, t.turnId]))
  // Pages go in the order their first fault was named: home, contact, about; undone newest first.
  assert.deepEqual(agent.sent.undone, [byPage['/contact'], byPage['/']])
  assert.deepEqual(
    result.repair.undone.map((u) => u.turnId),
    agent.sent.undone
  )
  assert.equal(result.siteCheck.groups.length, 0, 'the check after the undo is the one handed over')
})

test('a prompt that opens no turn is resent once after 60 seconds, then dropped and logged', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({ clock, behave: ({ page }) => (page === '/' ? { silent: true } : {}) })
  const { result, logged } = await stepNine({ checks: [checkOf([DEMO, ALT]), checkOf([])], agent, clock })
  const home = agent.sent.prompts.filter((p) => p.page === '/')
  assert.equal(home.length, 2, 'sent, then resent once')
  assert.notEqual(home[0].requestId, home[1].requestId)
  assert.equal(home[1].text, home[0].text)
  assert.equal(result.repair.dropped.length, 1)
  assert.equal(result.repair.dropped[0].page, '/')
  assert.ok(logged.some((line) => /no turn/.test(line)))
  // The next page still went.
  assert.equal(result.repair.turns.length, 1)
})

test('faults still there after the second check get one resend round, then the pass ends', async () => {
  const agent = fakeAgent()
  const first = checkOf([DEMO, ALT])
  // The home page's demo words are still there; the alt was fixed.
  const second = checkOf([DEMO])
  const { result, checksRun } = await stepNine({ checks: [first, second, second], agent })
  assert.equal(agent.sent.prompts.length, 3)
  assert.deepEqual(
    agent.sent.requests[2].items.map((i) => i.element.label),
    ['module-2.1']
  )
  assert.equal(result.repair.resent.length, 1)
  assert.equal(checksRun, 3, 'first, second, and once after the resend round: no further round')
  assert.deepEqual(agent.sent.undone, [], 'a fault still there is no new failure')
})

test('past ten minutes no new work starts, and the step returns by twelve', async () => {
  const clock = fakeClock()
  // Each turn takes five and a half minutes: the third page would start past ten.
  const agent = fakeAgent({ clock, behave: () => ({ ms: 5.5 * 60_000 }) })
  const from = clock.t
  const { result } = await stepNine({
    checks: [
      checkOf([DEMO, ALT, failure('demo-words', '/contact', 'module-5.1', 'demo@example.test')]),
      checkOf([])
    ],
    agent,
    clock
  })
  assert.equal(agent.sent.prompts.length, 2, 'the third page is not started')
  assert.deepEqual(
    result.repair.notSent.map((n) => n.page),
    ['/about']
  )
  assert.ok(clock.t - from <= REPAIR_LIMITS.returnByMs, `${(clock.t - from) / 1000} s`)
  assert.equal(result.repair.resent.length, 0, 'no resend round past the limit')
})

test('any error in the repair pass hands over the written site with the first check, its turns undone, and logs why', async () => {
  const agent = fakeAgent()
  let requests = 0
  const request = agent.request
  agent.request = async (input) => {
    requests += 1
    if (requests === 2) throw new Error('requests door answered 500')
    return request(input)
  }
  const first = checkOf([DEMO, ALT])
  const { result, logged, saved } = await stepNine({ checks: [first], agent })
  assert.equal(result.report.status, 'done')
  assert.equal(result.siteCheck, first)
  assert.equal(result.report.siteCheck?.status ?? first.status, first.status)
  assert.match(result.repair.error, /requests door answered 500/)
  assert.deepEqual(agent.sent.undone, [result.repair.turns[0].turnId], 'the turn already made is taken back')
  assert.ok(logged.some((line) => /requests door answered 500/.test(line)))
  assert.match(saved.get('repair-pass.json').error, /500/)
})

test('a step 9 run with no site agent writes and checks, and says the repair pass did not run', async () => {
  const first = checkOf([DEMO])
  const { result } = await stepNine({ checks: [first], agent: null })
  assert.equal(result.siteCheck, first)
  assert.equal(result.repair.status, 'not-run')
})
