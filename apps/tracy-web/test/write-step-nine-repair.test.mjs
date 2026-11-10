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
  const LAYOUT = failure('text-overflow', '/', 'module-3.1', 'The heading runs off the page', { width: 390 })
  const first = checkOf([ALT, OVER, DEMO, { ...ALT, width: 390 }, LAYOUT])
  const { result } = await stepNine({ checks: [first, checkOf([])], agent })
  assert.equal(result.report.status, 'done')
  // Two pages, two turns, each page in a session of its own.
  assert.equal(agent.sent.opened, 2)
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
  assert.equal(items.length, 4, 'the alt fault named at two widths is one item')
  const alt = items.find((i) => i.element.label === 'module-4.1')
  assert.equal(alt.url, 'https://site.example/index.php/about', 'the page as the site serves it')
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

test('what is not sent: missing accent emphasis, faults with no page, faults no visitor sees', async () => {
  const agent = fakeAgent()
  const first = checkOf([
    failure('accent-emphasis', '/', 'module-2.1', 'Strong body'),
    failure('demo-words', null, 'module-6.2', 'Demo Gym'),
    failure('read-back', '/', 'module-2.1', 'written value missing')
  ])
  const { result } = await stepNine({ checks: [first], agent })
  assert.equal(agent.sent.opened, 0, 'no fault to send opens no session')
  assert.equal(agent.sent.prompts.length, 0)
  const reasons = result.repair.skipped.map((s) => s.reason)
  assert.equal(result.repair.skipped.length, 3)
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

test('step 9 saves the rejected-picture faults in its final report', async () => {
  const pictures = {
    version: 'site-pictures/1',
    frames: [
      {
        frame: 'hero.1',
        source: 'owner-photo',
        sitePath: 'images/tracy-content/hero.jpg',
        filledBy: { rung: 'best-rejected', faults: ['subject cut off'] }
      }
    ]
  }
  const { result, saved } = await stepNine({
    checks: [checkOf([])],
    agent: fakeAgent(),
    input: { pictures }
  })
  assert.deepEqual(result.report.pictureReview, [
    {
      frame: 'hero.1',
      source: 'owner-photo',
      sitePath: 'images/tracy-content/hero.jpg',
      filledBy: { rung: 'best-rejected', faults: ['subject cut off'] }
    }
  ])
  assert.deepEqual(saved.get('site-write-report.json').pictureReview, result.report.pictureReview)
})

test('a turn that causes a new blocking failure on its page is undone, newest first', async () => {
  const agent = fakeAgent()
  const first = checkOf([DEMO, ALT, failure('demo-words', '/contact', 'module-5.1', 'demo@example.test')])
  // After the turns: both the home page and the contact page broke where they were changed; about is fine.
  const second = checkOf([
    failure('text-overflow', '/', 'module-2.1', 'wider than 390 px'),
    failure('dead-links', '/index.php/contact', 'module-5.2', '/missing')
  ])
  const { result } = await stepNine({
    checks: [first, second, checkOf([])],
    agent,
    input: { limits: { turnsAtOnce: 3 } }
  })
  const byPage = Object.fromEntries(result.repair.turns.map((t) => [t.page, t.turnId]))
  // Pages go in the order their first fault was named: home, contact, about; undone newest first.
  assert.deepEqual(agent.sent.undone, [byPage['/contact'], byPage['/']])
  assert.deepEqual(
    result.repair.undone.map((u) => u.turnId),
    agent.sent.undone
  )
  assert.equal(result.siteCheck.counts.block, 0, 'the pages undone are read again before the hand-over')
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
  const { result, checksRun } = await stepNine({
    checks: [first, second, second],
    agent,
    input: { limits: { turnsAtOnce: 3 } }
  })
  assert.equal(agent.sent.prompts.length, 3)
  assert.deepEqual(
    agent.sent.requests[2].items.map((i) => i.element.label),
    ['module-2.1']
  )
  assert.equal(result.repair.resent.length, 1)
  assert.equal(checksRun, 3, 'first, second, and once after the resend round: no further round')
  assert.deepEqual(agent.sent.undone, [], 'a fault still there is no new failure')
})

test('past ten minutes no new turn starts, and the step returns by twelve', async () => {
  const clock = fakeClock()
  // Three pages at a time, each turn five and a half minutes: the seventh page would start past ten.
  const agent = fakeAgent({ clock, behave: () => ({ openForMs: 5.5 * 60_000 }) })
  const pages = ['/', '/about', '/classes', '/contact', '/prices', '/team', '/faq']
  const from = clock.t
  const { result } = await stepNine({
    checks: [
      checkOf(pages.map((p, i) => failure('demo-words', p, `module-${i}.1`, `Demo Gym ${i}`))),
      checkOf([])
    ],
    agent,
    clock,
    input: { limits: { turnsAtOnce: 3 } }
  })
  assert.equal(agent.sent.prompts.length, 6, 'the seventh page is not started')
  assert.deepEqual(
    result.repair.notSent.map((n) => [n.page, n.reason]),
    [['/faq', 'time-limit']]
  )
  assert.ok(clock.t - from <= REPAIR_LIMITS.returnByMs, `${(clock.t - from) / 1000} s`)
  assert.equal(result.repair.resent.length, 0, 'no resend past the limit')
})

test('a site check that cannot run after the turns hands over the written site with the first check, its turns undone', async () => {
  const agent = fakeAgent()
  const first = checkOf([DEMO, ALT])
  const { result, logged, saved } = await stepNine({
    checks: [first],
    agent,
    input: {
      checkSite: async (_report, options) => {
        if (options?.pages) throw new Error('the site check answered 500')
        return first
      }
    }
  })
  assert.equal(result.report.status, 'stopped')
  assert.equal(result.report.writeStatus, 'done')
  assert.equal(result.siteCheck, first)
  assert.match(result.repair.error, /the site check answered 500/)
  assert.ok(result.repair.turns.length > 0)
  assert.deepEqual(
    agent.sent.undone,
    result.repair.turns.map((t) => t.turnId).reverse(),
    'every turn already made is taken back, newest first'
  )
  assert.ok(logged.some((line) => /the site check answered 500/.test(line)))
  assert.match(saved.get('repair-pass.json').error, /500/)
})

test('a build’s agent retires every session of the pass once it is over, and the bench’s agent is never asked to', async () => {
  const agent = fakeAgent({ canRetire: true })
  const { result } = await stepNine({ checks: [checkOf([DEMO, ALT]), checkOf([])], agent })
  assert.deepEqual(agent.sent.retired, result.repair.sessions)
  assert.ok(agent.sent.retired.length > 0)
  const plain = fakeAgent()
  await stepNine({ checks: [checkOf([DEMO, ALT]), checkOf([])], agent: plain })
  assert.deepEqual(plain.sent.retired, [])
})

test('the sessions are retired when the pass was taken back too, and a retire that fails is logged, not thrown', async () => {
  const agent = fakeAgent({ canRetire: true })
  let thrown = false
  agent.retire = async () => {
    if (!thrown) {
      thrown = true
      throw new Error('dsh refused the archive')
    }
    return { ok: false, reason: 'dsh did not list the session as archived' }
  }
  const first = checkOf([DEMO, ALT])
  const { result, logged } = await stepNine({
    checks: [first],
    agent,
    input: {
      checkSite: async (_report, options) => {
        if (options?.pages) throw new Error('the site check answered 500')
        return first
      }
    }
  })
  assert.equal(result.report.status, 'stopped')
  assert.equal(result.report.writeStatus, 'done')
  assert.ok(logged.some((line) => /could not be retired: dsh refused the archive/.test(line)))
  assert.ok(logged.some((line) => /could not be retired: dsh did not list/.test(line)))
})

test('a step 9 run with no site agent writes and checks, and says the repair pass did not run', async () => {
  const first = checkOf([DEMO])
  const { result } = await stepNine({ checks: [first], agent: null })
  assert.equal(result.siteCheck, first)
  assert.equal(result.repair.status, 'not-run')
})

test('every site check of step 9 runs the page groups even when read-back is red, and read-back stays blocking', async () => {
  const agent = fakeAgent()
  // A red read-back and a page fault the page groups found despite it: the fault is sent, the read-back is not.
  const readBack = failure('read-back', '/', 'module-2.1', 'written value missing')
  const first = checkOf([readBack, ALT])
  const { result, checkOptions } = await stepNine({ checks: [first, checkOf([readBack])], agent })
  assert.ok(checkOptions.length >= 2)
  for (const options of checkOptions) assert.equal(options.allGroups, true)
  assert.deepEqual(
    itemsOf(agent).map((i) => i.element.label),
    ['module-4.1']
  )
  assert.equal(result.siteCheck.status, 'red', 'a read-back failure is still blocking in what is handed over')
})
