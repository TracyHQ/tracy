import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { MAX_WRITE_DIAGNOSTICS_BYTES, stepNineDiagnostics } from '../src/step-chain-write-diagnostics.js'

for (const status of ['done', 'stopped']) {
  test(`the terminal chain retains structured write diagnostics when ${status}`, async () => {
    const diagnostics = { version: 2, write: { status, causeCode: null } }
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
    // A Write step that stops twice stops the build (ADR 0047): its measurement travels on the stop error.
    const result = await engine.apply(ctx, prepared).catch((error) => error)
    assert.deepEqual(result.chain.steps.findLast((s) => s.step === 'write').diagnostics, diagnostics)
    assert.equal(result.chain.ending, status === 'done' ? 'complete' : 'stopped')
  })
}

test('the write summary keeps the cause code and counts, and nothing of a site check or a repair pass', () => {
  const privateText = 'Bearer private-secret prompt@example.test'
  const diagnostic = stepNineDiagnostics({
    report: {
      status: 'stopped',
      writeStatus: 'done',
      cause: { code: 'INSPECT_REFUSED', reason: privateText },
      counts: { written: 3, hidden: 1, failed: 2 }
    },
    // A report from the old step nine still carrying check and repair parts: none of them is kept (ADR 0047).
    firstCheck: { status: 'red', groups: [{ name: 'read-back', failures: [{ reason: privateText }] }] },
    siteCheck: { status: 'red', groups: [] },
    repair: { status: 'incomplete', turns: [{ text: privateText }] },
    writersSettled: false
  })
  assert.deepEqual(diagnostic, {
    version: 2,
    write: {
      status: 'stopped',
      writeStatus: 'done',
      causeCode: 'INSPECT_REFUSED',
      counts: { written: 3, hidden: 1, failed: 2 }
    },
    writersSettled: false
  })
  for (const gone of ['firstCheck', 'finalCheck', 'repair']) assert.equal(gone in diagnostic, false, gone)
  assert.equal(JSON.stringify(diagnostic).includes(privateText), false)
})

test('an unknown cause code and hostile counts stay bounded and never leak', () => {
  const diagnostic = stepNineDiagnostics({
    report: {
      status: '../../etc/secret',
      cause: { code: 'Bearer secret' },
      counts: { written: -1, skipped: 'x' }
    }
  })
  assert.equal(diagnostic.write.status, 'unknown')
  assert.equal(diagnostic.write.causeCode, 'unknown')
  assert.deepEqual(diagnostic.write.counts, {})
  assert.ok(Buffer.byteLength(JSON.stringify(diagnostic)) <= MAX_WRITE_DIAGNOSTICS_BYTES)
})
