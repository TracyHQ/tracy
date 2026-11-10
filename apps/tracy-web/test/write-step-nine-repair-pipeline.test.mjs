// Step 9b (#448) as a pipeline: what the customer sees in the first site check is sent; pages run side by side in sessions of their own, each turn judged and undone on its own pages; a turn cut short at the
// time limit is still judged; the check after a turn reads only the pages it changed. Tested at the step 9 entry point
// with the site agent and the site check faked. Nothing here is a real business or a real site.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkOf, failure, fakeAgent, fakeClock, stepNine } from './_write-step-nine-repair.mjs'

const ALT = failure('alt-matches-picture', '/index.php/about', 'module-4.1', 'Demo coach lifting weights')
const DEMO = failure('demo-words', '/', 'module-2.1', 'Call Demo Gym today')
const itemsOf = (agent) => agent.sent.requests.flatMap((r) => r.items)

test('whatever the customer sees is sent, glued words too; only missing accent emphasis is not', async () => {
  const agent = fakeAgent()
  const first = checkOf([
    failure('accent-emphasis', '/', 'module-2.1', 'Strong body'),
    failure('glued-words', '/', 'module-2.2', 'THEPOOL'),
    failure('emphasis-codes-left', '/', 'module-2.3', '((SPAN))'),
    failure('main-heading', '/', null, 'two h1'),
    failure('empty-frames', '/', 'module-2.4', 'empty frame'),
    failure('cms-errors', '/', 'module-2.5', 'Warning: undefined index'),
    failure('demo-words', null, 'module-6.2', 'Demo Gym'),
    failure('read-back', '/', 'module-2.1', 'written value missing')
  ])
  const { result } = await stepNine({ checks: [first, checkOf([])], agent })
  const labels = itemsOf(agent).map((i) => i.element.label)
  for (const sent of ['module-2.2', 'module-2.3', 'main-heading', 'module-2.4', 'module-2.5'])
    assert.ok(labels.includes(sent), `${sent} in ${labels}`)
  const glued = itemsOf(agent).find((i) => i.element.label === 'module-2.2')
  assert.match(glued.text, /space/)
  const skipped = result.repair.skipped.map((s) => [s.kind, s.code])
  assert.deepEqual(
    skipped.sort(),
    [
      ['demo-fact', 'no-page'],
      ['lost-emphasis', 'never-sent'],
      [null, 'not-visible']
    ].sort()
  )
})

test('an explicit concurrency override still bounds page sessions to three turns at once', async () => {
  const clock = fakeClock()
  const pages = ['/', '/about', '/classes', '/contact', '/prices']
  const agent = fakeAgent({ clock, behave: () => ({ openForMs: 3 * 60_000 }) })
  const from = clock.t
  const first = checkOf(pages.map((p, i) => failure('demo-words', p, `module-${i}.1`, `Demo Gym ${i}`)))
  const { result } = await stepNine({
    checks: [first, checkOf([])],
    agent,
    clock,
    input: { limits: { turnsAtOnce: 3 } }
  })
  assert.equal(agent.sent.prompts.length, 5)
  assert.equal(agent.sent.mostOpen, 3)
  assert.equal(new Set(agent.sent.prompts.map((p) => p.sessionId)).size, 5, 'one session per page')
  assert.equal(result.repair.turns.length, 5)
  // Two waves of three minutes, not five turns one after another.
  assert.ok(clock.t - from < 8 * 60_000, `${(clock.t - from) / 60_000} min`)
})

test('the comment requests door is never asked for more items while twenty were asked in the last minute', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({ clock })
  const pages = ['/', '/about', '/classes']
  const first = checkOf(
    pages.flatMap((p, i) =>
      Array.from({ length: 12 }, (_, k) => failure('demo-words', p, `module-${i}.${k}`, `Demo Gym ${i}.${k}`))
    )
  )
  await stepNine({ checks: [first, checkOf([])], agent, clock })
  assert.equal(agent.sent.requests.length, 3, 'every page still went')
  for (const r of agent.sent.requests) {
    const lately = agent.sent.requests
      .filter((x) => x !== r && x.at <= r.at && x.at > r.at - 60_000)
      .reduce((n, x) => n + x.items.length, 0)
    assert.ok(lately < 20, `${lately} items in the minute before a request`)
  }
})

test('each turn is judged on the pages it changed: only the one that broke its page is undone, in its own session', async () => {
  const agent = fakeAgent()
  const later = checkOf([failure('text-overflow', '/', 'module-2.1', 'wider than 390 px')])
  const { result, checkOptions } = await stepNine({
    checks: [checkOf([DEMO, ALT]), later, checkOf([])],
    agent
  })
  const home = result.repair.turns.find((t) => t.page === '/')
  const about = result.repair.turns.find((t) => t.page === '/about')
  assert.deepEqual(agent.sent.undone, [home.turnId])
  assert.notEqual(home.sessionId, about.sessionId)
  // The checks after the turns read only the pages the turns changed.
  const scoped = checkOptions.slice(1).map((o) => o.pages)
  assert.ok(
    scoped.every((p) => Array.isArray(p) && p.length),
    JSON.stringify(scoped)
  )
  assert.ok(scoped.flat().every((p) => ['/', '/about'].includes(p)))
})

test('a turn that changed design files is judged by a check of every page', async () => {
  const css = { action: 'files', outcome: 'ok', target: null, via: 'files', files: 1, headSha: 'abc1234' }
  const agent = fakeAgent({ behave: () => ({ changes: [css] }) })
  const { checkOptions } = await stepNine({ checks: [checkOf([DEMO]), checkOf([])], agent })
  assert.equal(checkOptions[1].pages ?? null, null, 'the whole site')
})

test('a turn cancelled while open at the time limit is judged by the check after it, with the writes read after the cancel', async () => {
  for (const [later, undone] of [
    [checkOf([failure('text-overflow', '/', 'module-2.1', 'wider than 390 px')]), 1],
    [checkOf([]), 0]
  ]) {
    const clock = fakeClock()
    const agent = fakeAgent({
      clock,
      canCancel: true,
      behave: () => ({ openForMs: 30 * 60_000, changesAfterCancel: [{ applyId: 'late-write', page: '/' }] })
    })
    const { result, checksRun } = await stepNine({
      checks: [checkOf([DEMO]), later, checkOf([])],
      agent,
      clock
    })
    const [turn] = result.repair.turns
    assert.equal(turn.cancelled, true)
    assert.equal(turn.changes.length, 1, 'its writes were read after the cancel')
    assert.ok(checksRun >= 2, 'the check after the turns ran')
    assert.equal(agent.sent.undone.length, undone, 'undone only when it made the page worse')
  }
})

test('repair-pass.json holds a timeline of the step: the first check, each turn and each check after', async () => {
  const agent = fakeAgent()
  const { saved } = await stepNine({ checks: [checkOf([DEMO]), checkOf([])], agent })
  const stages = saved.get('repair-pass.json').timeline.map((s) => s.stage)
  for (const stage of ['first-check', 'turn', 'check']) assert.ok(stages.includes(stage), stages.join(', '))
  for (const s of saved.get('repair-pass.json').timeline)
    assert.ok(s.startMs >= 0 && s.endMs >= s.startMs, JSON.stringify(s))
})

test("a write to a record is placed on the pages whose faults name that record's slots, so its check stays scoped", async () => {
  // No content.locate: the article the turn wrote is known only from the faults' slots (article-16.*).
  const agent = fakeAgent({
    behave: ({ page }) =>
      page === '/services/fitness'
        ? { changes: [{ action: 'content.update', target: { kind: 'article', id: '16' } }] }
        : { changes: [] }
  })
  const first = checkOf([
    failure('alt-matches-picture', '/', 'article-16.5', 'Demo coach'),
    failure('alt-matches-picture', '/services/fitness', 'article-16.6', 'Demo coach')
  ])
  const { result, checkOptions } = await stepNine({ checks: [first, checkOf([])], agent })
  const fitness = result.repair.turns.find((t) => t.page === '/services/fitness')
  assert.deepEqual(fitness.changedPages.slice().sort(), ['/', '/services/fitness'])
  assert.deepEqual(checkOptions.at(-1).pages?.slice().sort(), ['/', '/services/fitness'])
})

// A native turn can write shared records and whole-site file moments even when its comment names one page.
test('default repair scheduling finishes and checks each page before another writer starts', async () => {
  const clock = fakeClock()
  const pages = ['/', '/about', '/classes']
  const agent = fakeAgent({ clock, behave: () => ({ openForMs: 30_000 }) })
  const faults = pages.map((p, i) => failure('demo-words', p, `module-${i}.1`, `Demo Gym ${i}`))
  const { result } = await stepNine({
    checks: [checkOf(faults), checkOf(faults.slice(1)), checkOf(faults.slice(2)), checkOf([])],
    agent,
    clock
  })
  assert.equal(agent.sent.mostOpen, 1)
  assert.equal(agent.sent.prompts.length, 3)
  assert.equal(result.repair.checks, 4)
  assert.equal(result.repair.status, 'done')
})
