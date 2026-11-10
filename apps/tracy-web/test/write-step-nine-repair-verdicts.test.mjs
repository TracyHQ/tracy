import assert from 'node:assert/strict'
import { test } from 'node:test'
import { faultsToSend } from '../src/write-step/repair-pass/repair-faults.js'
import { changeSentence } from '../src/write-step/repair-pass/repair-items.js'
import { checkOf, failure, fakeAgent, stepNine } from './_write-step-nine-repair.mjs'

const unavailable = (page = '/') =>
  failure('dead-links', page, null, 404, {
    reason: 'A kept page does not answer (404)'
  })
const demo = failure('demo-words', '/', 'module-176.1', 'Demo Boxing Studio')

test('page recovery keeps the successful write and repairs newly observable content in its bounded second round', async () => {
  const agent = fakeAgent({ behave: () => ({ changes: [{ target: { kind: 'menuItem', id: 101 } }] }) })
  const { result } = await stepNine({
    checks: [checkOf([unavailable()]), checkOf([demo]), checkOf([])],
    agent
  })
  assert.deepEqual(agent.sent.undone, [])
  assert.equal(agent.sent.prompts.length, 2)
  assert.equal(result.repair.turns[0].newlyObserved[0].group, 'demo-words')
  assert.equal(result.siteCheck.status, 'green')
  assert.equal(result.report.status, 'done')
})

test('a new read-back failure during page recovery still rolls back the write', async () => {
  const agent = fakeAgent()
  const { result } = await stepNine({
    checks: [
      checkOf([unavailable()]),
      checkOf([failure('read-back', '/', 'module-2.1', 'missing')]),
      checkOf([unavailable()])
    ],
    agent
  })
  assert.equal(agent.sent.undone.length, 1)
  assert.equal(result.repair.turns[0].regressions[0].group, 'read-back')
  assert.equal(result.report.status, 'stopped')
})

test('a genuine regression after recovery is compared against the last completed check', async () => {
  const agent = fakeAgent()
  const overflow = failure('text-overflow', '/', 'module-2.1', 'too wide')
  await stepNine({
    checks: [checkOf([unavailable()]), checkOf([demo]), checkOf([overflow]), checkOf([demo])],
    agent
  })
  assert.equal(agent.sent.prompts.length, 2)
  assert.deepEqual(agent.sent.undone, ['sess-1:2'])
})

test('a closed no-op gets a fresh check and one retry, then can pass on measured evidence', async () => {
  const agent = fakeAgent({ behave: ({ attempt }) => (attempt === 1 ? { changes: [] } : {}) })
  const { result, checksRun } = await stepNine({
    checks: [checkOf([demo]), checkOf([demo]), checkOf([])],
    agent
  })
  assert.equal(checksRun, 3)
  assert.equal(agent.sent.prompts.length, 2)
  assert.equal(result.report.status, 'done')
})

test('persistent no-op never claims done and records the unresolved finding', async () => {
  const agent = fakeAgent({ behave: () => ({ changes: [] }) })
  const { result, checksRun } = await stepNine({ checks: [checkOf([demo])], agent })
  assert.equal(agent.sent.prompts.length, 2)
  assert.equal(checksRun, 3)
  assert.equal(result.repair.status, 'incomplete')
  assert.equal(result.report.status, 'stopped')
  assert.equal(result.report.writeStatus, 'done')
  assert.equal(result.report.cause.code, 'STEP_NINE_CHECK_FAILED')
  assert.equal(result.repair.remaining[0].group, 'demo-words')
  assert.equal(result.repair.turns[1].verdict, 'no-change')
})

test('a no-op whose fresh check is green does not waste a retry', async () => {
  const agent = fakeAgent({ behave: () => ({ changes: [] }) })
  const { result, checksRun } = await stepNine({ checks: [checkOf([demo]), checkOf([])], agent })
  assert.equal(checksRun, 2)
  assert.equal(agent.sent.prompts.length, 1)
  assert.equal(result.report.status, 'done')
})

test('availability repairs are serialized so a shared menu repair clears queued failures', async () => {
  const agent = fakeAgent({ behave: () => ({ changes: [{ target: { kind: 'menuItem', id: 101 } }] }) })
  const { result } = await stepNine({
    checks: [checkOf([unavailable(), unavailable('/login'), unavailable('/registration')]), checkOf([])],
    agent
  })
  assert.equal(agent.sent.opened, 1)
  assert.equal(result.siteCheck.status, 'green')
})

test('excluded faults remain blocking and unmeasured checks cannot claim acceptance', async () => {
  const { result } = await stepNine({
    checks: [checkOf([failure('read-back', '/', null, 'missing')])],
    agent: fakeAgent()
  })
  assert.equal(result.repair.status, 'incomplete')
  assert.equal(result.report.status, 'stopped')
  assert.equal(result.repair.skipped[0].code, 'not-visible')
  const unmeasured = { ...checkOf([]), status: 'unmeasured', counts: { block: 0, unmeasured: 1 } }
  const run = await stepNine({ checks: [unmeasured], agent: fakeAgent() })
  assert.equal(run.result.report.status, 'stopped')
})

test('an unavailable kept page asks to restore the page, not remove a link', () => {
  const fault = faultsToSend({ firstCheck: checkOf([unavailable()]) }).pages[0].faults[0]
  assert.equal(fault.kind, 'unavailable-page')
  assert.match(changeSentence(fault), /restore its existing CMS route and publication state/)
  assert.match(changeSentence(fault), /default Home menu/)
  assert.doesNotMatch(changeSentence(fault), /or remove it/)
  const brokenLink = failure('dead-links', '/', null, 404, { reason: 'A link to /missing answers 404' })
  assert.equal(faultsToSend({ firstCheck: checkOf([brokenLink]) }).pages[0].faults[0].kind, 'bad-link')
})

test('an unmeasured check never labels a no-op fixed', async () => {
  const agent = fakeAgent({ behave: () => ({ changes: [] }) })
  const unmeasured = {
    ...checkOf([]),
    status: 'unmeasured',
    counts: { block: 0, unmeasured: 1 },
    groups: [{ name: 'demo-words', status: 'unmeasured', failures: [] }]
  }
  const { result } = await stepNine({ checks: [checkOf([demo]), unmeasured], agent })
  assert.equal(result.repair.turns[0].verdict, 'unverified')
  assert.equal(result.report.status, 'stopped')
})

test('step 9 refuses to unpublish a native default Home item even when its path is /home', async () => {
  const { doorCall } = await import('../src/write-step/settings-door.js')
  const calls = []
  const call = doorCall(
    {
      apply: async (request) => {
        calls.push(request)
        return request.action === 'content.get'
          ? { ok: true, item: { id: 101, home: 1, path: 'home', published: 1 } }
          : { ok: true }
      }
    },
    'invented.example.test'
  )
  await assert.rejects(
    call('content.update', { kind: 'menuItem', id: 101, fields: { published: 0 } }),
    /default Home menu item/
  )
  assert.deepEqual(
    calls.map((c) => c.action),
    ['content.get']
  )
})

test('step 9 can still unpublish an ordinary menu item and publish a default Home item', async () => {
  const { doorCall } = await import('../src/write-step/settings-door.js')
  const calls = []
  const call = doorCall(
    {
      apply: async (request) => {
        calls.push(request)
        return request.action === 'content.get' ? { ok: true, item: { id: 102, home: 0 } } : { ok: true }
      }
    },
    'invented.example.test'
  )
  await call('content.update', { kind: 'menuItem', id: 102, fields: { published: 0 } })
  await call('content.update', { kind: 'menuItem', id: 101, fields: { published: 1 } })
  assert.deepEqual(
    calls.map((c) => c.action),
    ['content.get', 'content.update', 'content.update']
  )
})

test('a repair that loses a previously measured contract is undone even without explicit findings', async () => {
  const before = checkOf([demo])
  const unreadable = {
    ...checkOf([]),
    status: 'red',
    counts: { block: 0, unmeasured: 2 },
    groups: [
      { name: 'demo-words', status: 'unmeasured', failures: [], reason: 'JSON slot is missing' },
      { name: 'read-back', status: 'unmeasured', failures: [], reason: 'JSON slot is missing' }
    ]
  }
  const agent = fakeAgent()
  const { result } = await stepNine({ checks: [before, unreadable, before], agent })
  assert.deepEqual(agent.sent.undone, ['sess-1:1'])
  assert.equal(agent.sent.prompts.length, 1, 'do not retry a write after its verification was lost')
  assert.equal(result.repair.turns[0].verdict, 'reverted')
  assert.equal(result.repair.turns[0].regressions[0].kind, 'verification-lost')
  assert.equal(result.report.status, 'stopped')
})

test('an unmeasured no-op preserves its unresolved faults without sending a blind retry', async () => {
  const unreadable = {
    ...checkOf([]),
    status: 'unmeasured',
    groups: [{ name: 'demo-words', status: 'unmeasured', failures: [] }]
  }
  const agent = fakeAgent({ behave: () => ({ changes: [] }) })
  const { result } = await stepNine({ checks: [checkOf([demo]), unreadable], agent })
  assert.equal(agent.sent.prompts.length, 1)
  assert.equal(result.repair.turns[0].remaining.length, 1)
  assert.equal(result.repair.turns[0].verdict, 'unverified')
  assert.equal(result.report.status, 'stopped')
})
