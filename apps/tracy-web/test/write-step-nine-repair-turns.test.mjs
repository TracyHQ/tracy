// Step 9b (#448): what the repair pass's turns carry and how it follows them, tested at the step 9 entry point with the
// site agent faked: each item as the popover sends it (the content.locate answer and the served block's selector), every
// turn of the pass's request ids judged and undone like the rest, time limits on every wait, the pages a turn changed
// read from its writes, and undo failures kept. Pages and words are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REPAIR_LIMITS } from '../src/write-step/repair-pass/repair-limits.js'
import { checkOf, failure, fakeAgent, fakeClock, stepNine } from './_write-step-nine-repair.mjs'

const DEMO = failure('demo-words', '/', 'block-2.1', 'Call Demo Gym today')
const ALT = failure('alt-matches-picture', '/index.php/about', 'block-4.1', 'Demo coach lifting weights')
const PAGE = `<html><body><div id="Mod2" class="t4-module"><div data-tracy-src="module:2"><h2>Call Demo Gym today</h2>
  <p>Other words</p></div></div></body></html>`
const LEVELS = [{ kind: 'module', id: '2', label: 'Hero', writable: true, value: 'Call Demo Gym today' }]

const itemsOf = (agent) => agent.sent.requests.flatMap((r) => r.items)

test('an item carries the content.locate answer for its element and the served block selector, as the popover sends it', async () => {
  const answer = { status: 'resolved', levels: LEVELS }
  const agent = fakeAgent({ locate: () => answer })
  await stepNine({
    checks: [checkOf([DEMO]), checkOf([])],
    agent,
    input: { pageHtml: async (page) => (page === '/' ? PAGE : null) }
  })
  assert.deepEqual(agent.sent.located, [
    { url: 'https://site.example/', text: 'Call Demo Gym today', marks: ['module:2'] }
  ])
  const [item] = itemsOf(agent)
  assert.equal(item.url, 'https://site.example/')
  assert.equal(item.element.selector, '#Mod2')
  assert.deepEqual(item.element.marks, ['module:2'])
  assert.deepEqual(item.locate, answer)
  assert.equal(item.locateFrom, 'content.locate')
  // The turn is built from the real answer: the field's own value line, as for a person's comment.
  assert.match(agent.sent.prompts[0].text, /Call Demo Gym today/)
  assert.match(agent.sent.prompts[0].text, /module/)
})

test('with content.locate unavailable the item keeps the fault levels (slot and record) and says so', async () => {
  const agent = fakeAgent({ locate: () => ({ status: 'unavailable', code: 'CONTENT_ADAPTER_UNSUPPORTED' }) })
  await stepNine({ checks: [checkOf([DEMO]), checkOf([])], agent })
  const [item] = itemsOf(agent)
  assert.equal(item.locateFrom, 'fault')
  assert.match(item.locateProblem, /unavailable/)
  assert.equal(item.locate.status, 'unchecked', 'nothing was looked up')
  assert.deepEqual(
    item.locate.levels.map((l) => [l.kind, l.label]),
    [
      ['field', 'block-2.1'],
      ['record', 'module 2']
    ]
  )
})

test('a comment page address is the page as the site serves it; an agent with no page address is refused', async () => {
  const agent = fakeAgent()
  await stepNine({ checks: [checkOf([ALT]), checkOf([])], agent })
  assert.equal(itemsOf(agent)[0].url, 'https://site.example/index.php/about')
  const bare = fakeAgent()
  delete bare.pageUrl
  const { result } = await stepNine({ checks: [checkOf([ALT])], agent: bare })
  assert.equal(result.repair.errors.length, 1, 'the page fails, logged with why')
  assert.match(result.repair.errors[0].error, /page address/)
  assert.equal(bare.sent.requests.length, 0, 'no comment goes out with a bare path')
})

test('a prompt the queue runs after the resend gave up is judged and undone like the rest', async () => {
  const clock = fakeClock()
  // The home page's first prompt runs only after both waits; its resend never runs. The about turn is still at work.
  const agent = fakeAgent({
    clock,
    behave: ({ page, attempt }) =>
      page === '/' ? (attempt === 1 ? { appearAfterMs: 150_000 } : { silent: true }) : { openForMs: 180_000 }
  })
  const later = checkOf([failure('text-overflow', '/', 'block-2.1', 'wider than 390 px')])
  const { result } = await stepNine({ checks: [checkOf([DEMO, ALT]), later], agent, clock })
  assert.equal(result.repair.dropped.length, 1)
  const late = result.repair.turns.find((t) => t.page === '/')
  assert.ok(late, 'the late turn is in the ledger')
  assert.equal(late.how, 'late')
  assert.deepEqual(agent.sent.undone, [late.turnId], 'it broke its page, so it is undone')
})

test('a resend that yields two turns keeps both, and both are judged', async () => {
  const clock = fakeClock()
  // The first prompt's turn opens late, after the resend went out, and so does the resend's.
  const agent = fakeAgent({
    clock,
    behave: ({ attempt }) => (attempt === 1 ? { appearAfterMs: 61_000 } : { ms: 5_000 })
  })
  const later = checkOf([failure('text-overflow', '/', 'block-2.1', 'wider than 390 px')])
  const { result } = await stepNine({ checks: [checkOf([DEMO]), later], agent, clock })
  const home = result.repair.turns.filter((t) => t.page === '/')
  assert.equal(home.length, 2, JSON.stringify(home.map((t) => t.turnId)))
  assert.deepEqual(home.map((t) => t.how).sort(), ['duplicate', 'sent'])
  assert.deepEqual(agent.sent.undone.slice().sort(), home.map((t) => t.turnId).sort())
})

test('a turn still open at ten minutes is waited for, never judged while open, and the step returns by twelve', async () => {
  const clock = fakeClock()
  // Opened at once, the home turn runs ten minutes and a quarter.
  const agent = fakeAgent({ clock, behave: () => ({ openForMs: 10 * 60_000 + 15_000 }) })
  const from = clock.t
  const later = checkOf([failure('text-overflow', '/', 'block-2.1', 'wider than 390 px')])
  const { result, checksRun } = await stepNine({
    checks: [checkOf([DEMO]), later, checkOf([])],
    agent,
    clock
  })
  const [turn] = result.repair.turns
  assert.equal(turn.state, 'closed', 'waited for until it closed')
  assert.equal(checksRun, 3, 'judged once it closed, then measured after its undo')
  assert.deepEqual(agent.sent.undone, [turn.turnId])
  assert.ok(clock.t - from <= REPAIR_LIMITS.returnByMs, `${(clock.t - from) / 1000} s`)
})

test('a turn still open at the return is cancelled through its session, logged, and kept when it made nothing worse', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({ clock, canCancel: true, behave: () => ({ openForMs: 30 * 60_000 }) })
  const from = clock.t
  const { result, logged } = await stepNine({ checks: [checkOf([DEMO]), checkOf([])], agent, clock })
  assert.equal(agent.sent.cancelled, 1)
  assert.ok(
    logged.some((l) => /still open/.test(l)),
    logged.join('\n')
  )
  const [turn] = result.repair.turns
  assert.equal(turn.cancelled, true)
  assert.deepEqual(agent.sent.undone, [], 'judged by the check after it, which shows nothing worse')
  assert.ok(clock.t - from <= REPAIR_LIMITS.returnByMs, `${(clock.t - from) / 1000} s`)
})

test('every agent call and the site check are raced against the time left; the comment request is told it', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({ clock })
  // A request that never answers: the race ends it, and 9b fails cleanly instead of hanging.
  agent.request = async (input) => {
    agent.sent.requests.push(input)
    return new Promise(() => {})
  }
  let fire = null
  const timer = (go) => {
    fire = go
    return () => {}
  }
  const run = stepNine({ checks: [checkOf([DEMO])], agent, clock, input: { timer } })
  for (let i = 0; i < 5000 && !agent.sent.requests.length; i++) await new Promise((r) => setImmediate(r))
  fire?.()
  const { result } = await run
  assert.equal(result.repair.status, 'done', 'the step returns, the page that hung logged')
  assert.match(result.repair.errors[0].error, /did not answer in the time left/)
  assert.ok(
    agent.sent.requests[0].timeLeftMs > 0 && agent.sent.requests[0].timeLeftMs <= REPAIR_LIMITS.stopNewWorkMs
  )
})

test('the first check shares the step clock: a slow first check leaves 9b less time for new work', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({ clock })
  const { result } = await stepNine({
    checks: [checkOf([DEMO]), checkOf([])],
    agent,
    clock,
    input: {
      checkSite: async () => {
        clock.t += 10 * 60_000 + 1
        return checkOf([DEMO])
      }
    }
  })
  assert.equal(agent.sent.prompts.length, 0, 'no turn starts past ten minutes of the step')
  assert.deepEqual(
    result.repair.notSent.map((n) => [n.page, n.reason]),
    [['/', 'time-limit']]
  )
})

test('the pages a turn changed come from what it wrote, not only the page it was sent for', async () => {
  // The home turn wrote the record the contact page's item located: it is judged by the contact page too.
  const contact = failure('demo-words', '/contact', 'block-5.1', 'demo@example.test')
  const locate = ({ url }) =>
    url.endsWith('/contact')
      ? { status: 'resolved', levels: [{ kind: 'module', id: '7', label: 'Footer', writable: true }] }
      : { status: 'unavailable' }
  const agent = fakeAgent({
    locate,
    behave: ({ page }) =>
      page === '/'
        ? { changes: [{ action: 'content.update', target: { kind: 'module', id: '7' } }] }
        : { changes: [] }
  })
  const later = checkOf([failure('dead-links', '/index.php/contact', 'block-5.2', '/missing')])
  const { result } = await stepNine({ checks: [checkOf([DEMO, contact]), later, checkOf([])], agent })
  const home = result.repair.turns.find((t) => t.page === '/')
  assert.deepEqual(home.changedPages, ['/contact'])
  assert.deepEqual(agent.sent.undone, [home.turnId])
})

test('a write the pass cannot place on a page counts as changing every page', async () => {
  const agent = fakeAgent({ behave: () => ({ changes: [{ action: 'content.contract', target: null }] }) })
  const later = checkOf([failure('dead-links', '/index.php/contact', 'block-5.2', '/missing')])
  const { result } = await stepNine({ checks: [checkOf([DEMO]), later, checkOf([])], agent })
  assert.equal(result.repair.turns[0].changedPages, '*')
  assert.deepEqual(agent.sent.undone, [result.repair.turns[0].turnId])
})

test('an undo the site refuses, or that throws, is kept in repair-pass.json as undo-failed with its reason', async () => {
  const agent = fakeAgent({
    undo: (turnId) => {
      if (turnId.startsWith('sess-1:')) return { ok: false, code: 'TURN_UNDO_CONFLICT' }
      throw new Error('undo door answered 502')
    }
  })
  const later = checkOf([
    failure('text-overflow', '/', 'block-2.1', 'wider than 390 px'),
    failure('text-overflow', '/index.php/about', 'block-4.1', 'wider than 390 px')
  ])
  const { saved } = await stepNine({ checks: [checkOf([DEMO, ALT]), later, later], agent })
  const undone = saved.get('repair-pass.json').undone
  assert.deepEqual(
    undone.map((u) => [u.status, u.reason]),
    [
      ['undo-failed', 'undo door answered 502'],
      ['undo-failed', 'TURN_UNDO_CONFLICT']
    ]
  )
})

test('a turn that only changed design files counts as changing every page: a new blocking failure anywhere undoes it whole', async () => {
  // A site-wide CSS change: the turn wrote no record, only files (the bench agent's `files` change).
  const css = { action: 'files', outcome: 'ok', target: null, via: 'files', files: 1, headSha: 'abc1234' }
  const agent = fakeAgent({ behave: () => ({ changes: [css] }) })
  const later = checkOf([failure('text-overflow', '/index.php/contact', 'block-5.2', 'wider than 390 px')])
  const { result } = await stepNine({ checks: [checkOf([DEMO]), later, checkOf([])], agent })
  const [turn] = result.repair.turns
  assert.equal(turn.changedPages, '*')
  assert.deepEqual(agent.sent.undone, [turn.turnId])
  assert.equal(result.repair.undone[0].status, 'undone')
})
