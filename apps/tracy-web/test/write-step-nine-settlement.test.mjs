// A green site check cannot finish step 9 while an earlier accepted repair request has no terminal native record.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkOf, failure, fakeAgent, fakeClock, stepNine } from './_write-step-nine-repair.mjs'

const fault = failure('demo-words', '/', 'module-2.1', 'Demo Gym')

test('step 9 stops a green resend when the original accepted request has no terminal native record', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({
    clock,
    behave: ({ attempt }) => (attempt === 1 ? { silent: true } : {}),
    canRetire: true
  })
  const { result, saved } = await stepNine({ checks: [checkOf([fault]), checkOf([])], agent, clock })
  assert.equal(agent.sent.prompts.length, 2)
  assert.match(agent.sent.prompts[1].requestId, /-resend$/)
  assert.equal(result.siteCheck.status, 'green')
  assert.equal(result.writersSettled, false)
  assert.equal(result.report.status, 'stopped')
  assert.equal(result.repair.status, 'incomplete')
  assert.match(result.repair.reason, /terminal native turn record/)
  assert.equal(saved.get('site-write-report.json').status, 'stopped')
  assert.equal(saved.get('repair-pass.json').status, 'incomplete')
})

test('step 9 completes and persists success when every accepted repair request has a terminal native record', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({ clock, canRetire: true })
  const { result, saved } = await stepNine({ checks: [checkOf([fault]), checkOf([])], agent, clock })
  assert.equal(result.writersSettled, true)
  assert.equal(result.report.status, 'done')
  assert.equal(result.repair.status, 'done')
  assert.equal(saved.get('site-write-report.json').status, 'done')
  assert.equal(saved.get('repair-pass.json').status, 'done')
})

test('step 9 stops when an original repair turn writes another page during session retirement', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({
    clock,
    behave: ({ attempt }) =>
      attempt === 1 ? { appearAfterMs: 100_000, changes: [{ applyId: 'late-write', page: '/about' }] } : {},
    canRetire: true
  })
  const retire = agent.retire
  agent.retire = async (input) => {
    // The original queued request finishes after the final sweep/check, while archival is pending.
    clock.t += 120_000
    return retire(input)
  }
  const { result, saved, checkOptions } = await stepNine({
    checks: [checkOf([fault]), checkOf([])],
    agent,
    clock
  })
  const native = await agent.turns({
    sessionId: 'sess-1',
    requestIds: agent.sent.prompts.map((p) => p.requestId)
  })
  assert.equal(native.length, 2)
  assert.equal(native[0].changes[0].page, '/about')
  assert.equal(result.repair.turns.length, 1, 'the late original was absent from the last sweep')
  assert.deepEqual(checkOptions.at(-1).pages, ['/'], 'the last check did not read the late write on /about')
  assert.equal(
    result.writersSettled,
    true,
    'all native writers ended, so confirmed site failure can still recover'
  )
  assert.equal(result.report.status, 'stopped')
  assert.equal(result.repair.status, 'incomplete')
  assert.match(result.repair.reason, /after the last verified site check/)
  assert.equal(saved.get('site-write-report.json').status, 'stopped')
  assert.equal(saved.get('repair-pass.json').status, 'incomplete')
})

test('step 9 stops when a terminal native turn gains write evidence after its site check', async () => {
  const clock = fakeClock()
  const agent = fakeAgent({ clock, canRetire: true })
  let retired = false
  const retire = agent.retire
  agent.retire = async (input) => {
    retired = true
    return retire(input)
  }
  const turns = agent.turns
  agent.turns = async (input) =>
    (await turns(input)).map((turn) =>
      retired ? { ...turn, changes: [...turn.changes, { applyId: 'late-write', page: '/about' }] } : turn
    )
  const { result } = await stepNine({ checks: [checkOf([fault]), checkOf([])], agent, clock })
  assert.equal(result.writersSettled, true)
  assert.equal(result.report.status, 'stopped')
  assert.equal(result.repair.status, 'incomplete')
  assert.match(result.repair.reason, /after the last verified site check/)
})

// Normal calls resolve before this timer fires. Once the test's external door blocks, advance the fake deadline.
function blockedTimer(clock, isBlocked) {
  return (fire, ms) => {
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      if (!isBlocked()) {
        setImmediate(tick)
        return
      }
      clock.t += ms
      fire()
    }
    setImmediate(tick)
    return () => {
      cancelled = true
    }
  }
}

for (const blockedDoor of ['retirement', 'final native read']) {
  test(`step 9 returns stopped at its deadline when ${blockedDoor} never answers`, async () => {
    const clock = fakeClock()
    const started = clock.t
    const agent = fakeAgent({ clock, canRetire: true })
    let blocked = false
    if (blockedDoor === 'retirement')
      agent.retire = async () => {
        blocked = true
        return new Promise(() => {})
      }
    else {
      let retired = false
      const retire = agent.retire
      agent.retire = async (input) => {
        retired = true
        return retire(input)
      }
      const turns = agent.turns
      agent.turns = async (input) => {
        if (!retired) return turns(input)
        blocked = true
        return new Promise(() => {})
      }
    }
    const returnByMs = 20_000
    const { result, saved } = await stepNine({
      checks: [checkOf([fault]), checkOf([])],
      agent,
      clock,
      input: {
        limits: { returnByMs, stopNewWorkMs: 10_000, undoReserveMs: 2_000, judgeReserveMs: 2_000 },
        timer: blockedTimer(clock, () => blocked)
      }
    })
    assert.equal(blocked, true)
    assert.equal(clock.t - started, returnByMs, 'cleanup shares the existing return deadline')
    assert.equal(result.writersSettled, false, 'a timeout cannot authorize backup recovery')
    assert.equal(result.report.status, 'stopped')
    assert.equal(result.repair.status, 'incomplete')
    assert.equal(saved.get('site-write-report.json').status, 'stopped')
  })
}
