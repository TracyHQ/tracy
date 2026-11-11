import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { MAX_WRITE_DIAGNOSTICS_BYTES, stepNineDiagnostics } from '../src/step-chain-write-diagnostics.js'

for (const status of ['done', 'stopped']) {
  test(`the terminal chain retains structured write diagnostics when ${status}`, async () => {
    const diagnostics = { version: 1, write: { status, causeCode: null }, firstCheck: null }
    const answer = async () => ({ value: {}, usd: 0 })
    const engine = createStepChainEngine({
      applyFor: () => async () => ({}),
      steps: {
        kit: answer,
        brand: answer,
        plan: answer,
        copy: answer,
        pictures: answer,
        write: async () => ({ value: { report: { status, counts: { written: 1 } }, diagnostics }, usd: 0 })
      }
    })
    const ctx = { runId: 'diagnostic-test', signal: new AbortController().signal }
    const prepared = await engine.prepare(ctx)
    const result = await engine.apply(ctx, prepared)
    assert.deepEqual(result.chain.steps.find((s) => s.step === 'write').diagnostics, diagnostics)
    assert.equal(result.chain.ending, status === 'done' ? 'complete' : 'soft-failure')
  })
}

test('a failed final check retains fault identities and skipped repairs without private prose', () => {
  const privateText = 'Bearer private-secret /Users/operator/private prompt@example.test'
  const group = {
    name: 'read-back',
    status: 'red',
    checked: 2,
    ms: 25,
    reason: privateText,
    failures: [
      {
        group: 'read-back',
        page: '/about',
        slot: 'module-111.0',
        reason: privateText,
        measured: privateText,
        level: 'block'
      }
    ]
  }
  const check = { status: 'red', counts: { block: 1, warn: 0 }, groups: [group] }
  const diagnostic = stepNineDiagnostics({
    report: {
      status: 'stopped',
      writeStatus: 'done',
      cause: { code: 'STEP_NINE_CHECK_FAILED', reason: privateText }
    },
    firstCheck: check,
    siteCheck: check,
    writersSettled: false,
    repair: {
      status: 'incomplete',
      reason: privateText,
      errors: [privateText],
      turns: [{ text: privateText }],
      sessions: [privateText],
      remaining: [privateText],
      checks: 2,
      skipped: [{ ...group.failures[0], code: 'not-visible', reason: privateText }],
      timeline: [{ stage: 'first-check', startMs: 12, endMs: 37, privateText }]
    }
  })
  assert.equal(diagnostic.write.causeCode, 'STEP_NINE_CHECK_FAILED')
  assert.equal(diagnostic.finalCheck.groups[0].name, 'read-back')
  assert.equal(diagnostic.finalCheck.faults[0].slot, 'module-111.0')
  assert.equal(diagnostic.finalCheck.faults[0].page, '/about')
  assert.equal(diagnostic.repair.skipped[0].code, 'not-visible')
  assert.equal(diagnostic.repair.turnCount, 1)
  assert.equal(diagnostic.repair.errorCount, 1)
  assert.equal(diagnostic.writersSettled, false)
  assert.equal(JSON.stringify(diagnostic).includes(privateText), false)
})

test('an early stopped write records its cause without pretending a site check ran', () => {
  const diagnostic = stepNineDiagnostics({
    report: { status: 'stopped', cause: { code: 'STEP_NINE_BASELINE_UNPROVEN' } },
    writersSettled: true
  })
  assert.equal(diagnostic.write.causeCode, 'STEP_NINE_BASELINE_UNPROVEN')
  assert.equal(diagnostic.firstCheck, null)
  assert.equal(diagnostic.finalCheck, null)
  assert.equal(diagnostic.repair, null)
})

test('zero-turn unmeasured checks remain distinct from a passing nothing-to-send repair', () => {
  const check = {
    status: 'unmeasured',
    counts: { unmeasured: 1, block: 0 },
    groups: [{ name: 'read-back', status: 'unmeasured', checked: 0, failures: [] }]
  }
  const diagnostic = stepNineDiagnostics({
    report: { status: 'stopped', writeStatus: 'done', cause: { code: 'STEP_NINE_CHECK_FAILED' } },
    firstCheck: check,
    siteCheck: check,
    repair: {
      status: 'incomplete',
      turns: [],
      skipped: [],
      notSent: [{ page: '/', faults: 1, reason: 'time-limit' }]
    }
  })
  assert.equal(diagnostic.finalCheck.status, 'unmeasured')
  assert.equal(diagnostic.finalCheck.groups[0].checked, 0)
  assert.equal(diagnostic.finalCheck.faults.length, 0)
  assert.equal(diagnostic.repair.status, 'incomplete')
  assert.equal(diagnostic.repair.turnCount, 0)
  assert.equal(diagnostic.repair.notSent[0].code, 'time-limit')
  assert.equal(
    stepNineDiagnostics({ repair: { status: 'nothing-to-send' } }).repair.status,
    'nothing-to-send'
  )
})

test('oversized and hostile reports remain bounded without losing overall failure counts', () => {
  const failures = Array.from({ length: 400 }, () => ({
    page: '/Users/operator/private',
    slot: '/tmp/secret',
    kind: 'Bearer secret',
    reason: 'private'
  }))
  const check = {
    status: 'red',
    counts: { block: 400 },
    groups: Array.from({ length: 100 }, () => ({ name: 'read-back', status: 'red', checked: 400, failures }))
  }
  const diagnostic = stepNineDiagnostics({
    report: { status: 'stopped' },
    firstCheck: check,
    siteCheck: check
  })
  assert.ok(Buffer.byteLength(JSON.stringify(diagnostic)) <= MAX_WRITE_DIAGNOSTICS_BYTES)
  assert.equal(diagnostic.truncated, true)
  assert.equal(diagnostic.finalCheck.counts.block, 400)
  assert.equal(diagnostic.finalCheck.groupCount, 100)
  assert.equal(JSON.stringify(diagnostic).includes('/Users'), false)
  assert.equal(JSON.stringify(diagnostic).includes('Bearer secret'), false)
})
