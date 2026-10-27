import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { IMPLEMENTATIONS, Fixtures, checkImplementations, runScenario } from '../scenarios.mjs'
import { SCENARIOS, assertionIdsOf } from '../scenario-meta.mjs'
import { startFakeStand } from './fake-stand.mjs'

const open = []
after(async () => {
  for (const s of open) await s.close()
})
const withStand = async (faults) => {
  const s = await startFakeStand(faults)
  open.push(s)
  return { ...s, fx: new Fixtures({ stand: s.stand, intent: null, run: s.run, tag: 't1' }) }
}

test('every declared scenario has an implementation and every implementation is declared', () => {
  assert.deepEqual(checkImplementations(), { missing: [], extra: [] })
  assert.ok(Object.keys(SCENARIOS).length >= 15)
  assert.deepEqual(assertionIdsOf('signin-replay'), [
    'signin-replay#used-code-refused',
    'signin-replay#replay-sets-no-session'
  ])
})

test('known-good: the sign-in scenarios pass on a correct stand, and name what they observed', async () => {
  const s = await withStand()
  for (const name of ['signin-happy', 'signin-wrong-code', 'signin-replay', 'signin-new-returning']) {
    const r = await runScenario(name, s.fx)
    assert.equal(r.outcome, 'PASS', `${name}: ${r.reason}`)
    assert.deepEqual(
      r.assertions.map((x) => x.name),
      SCENARIOS[name].assertions
    )
    assert.ok(
      r.assertions.every((x) => x.ok && typeof x.observed === 'string' && typeof x.expected === 'string')
    )
  }
})

test('injected fault: a stand that accepts any code makes signin-wrong-code FAIL on the named assertion', async () => {
  const s = await withStand({ acceptAnyCode: true })
  const r = await runScenario('signin-wrong-code', s.fx)
  assert.equal(r.outcome, 'FAIL')
  assert.match(r.reason, /wrong-code-sets-no-session/)
  assert.equal(r.assertions.find((x) => x.name === 'wrong-code-sets-no-session').ok, false)
})

test('injected fault: a code that is not burned makes signin-replay FAIL', async () => {
  const s = await withStand({ keepCode: true })
  const r = await runScenario('signin-replay', s.fx)
  assert.equal(r.outcome, 'FAIL')
  assert.match(r.reason, /used-code-refused/)
})

test('missing dependency: an unreachable stand and an unreadable mail sink are ENV with their probe', async () => {
  const dead = await withStand()
  dead.fx.stand = { ...dead.stand, origin: 'http://127.0.0.1:1' }
  const a = await runScenario('signin-happy', dead.fx)
  assert.equal(a.outcome, 'ENV')
  assert.match(a.probe, /GET http:\/\/127\.0\.0\.1:1\/login failed/)
  const nosink = await withStand({ sinkDown: true })
  const b = await runScenario('signin-happy', nosink.fx)
  assert.equal(b.outcome, 'ENV')
  assert.match(b.probe, /docker logs/)
})

test('a login the product refuses after good prerequisites is a product FAIL, not ENV; the same fault makes a dependent scenario TEST_INVALID', async () => {
  const s = await withStand({ loginDown: true })
  const r = await runScenario('signin-happy', s.fx)
  assert.equal(r.outcome, 'FAIL')
  assert.match(r.reason, /otp-in-sink.*POST \/login answered 500/)
  const dependent = await runScenario('signin-replay', s.fx)
  assert.equal(
    dependent.outcome,
    'PENDING',
    'its positive control failed: a harness problem, not a verdict on replay'
  )
  assert.match(dependent.reason, /TEST_INVALID/)
})

test('a scenario that reports other assertion names than it declares is TEST_INVALID', async () => {
  const s = await withStand()
  const original = IMPLEMENTATIONS['signin-replay']
  IMPLEMENTATIONS['signin-replay'] = async () => [
    { name: 'something-else', ok: true, observed: '', expected: '' }
  ]
  try {
    const r = await runScenario('signin-replay', s.fx)
    assert.equal(r.outcome, 'PENDING')
    assert.match(r.reason, /TEST_INVALID/)
  } finally {
    IMPLEMENTATIONS['signin-replay'] = original
  }
})

test('secrets: the cookie and the code never appear in what a scenario returns', async () => {
  const s = await withStand()
  const r = await runScenario('signin-happy', s.fx)
  const text = JSON.stringify(r)
  assert.ok(!/tracy_sess=/.test(text))
  assert.ok(!/\b\d{6}\b/.test(text.replace(/"observed":"six digits found in the sink"/, '')))
})
