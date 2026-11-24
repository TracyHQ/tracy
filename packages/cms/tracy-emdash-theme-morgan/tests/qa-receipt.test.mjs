// F11: a receipt written by qa-receipt.mjs is exactly what qa.mjs accepts — same identity, evidence
// copied and hashed — and the tool refuses a gate it does not know or a report without identity.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { buildReceipt, writeReceipt } from '../tools/qa-receipt.mjs'
import { assessReceipt } from '../tools/qa.mjs'

const report = { contractHash: 'sha256:c', artifactHash: 'sha256:a', origin: 'http://127.0.0.1:1' }
describe('F11 — receipts', () => {
  it('writeReceipt copies and hashes evidence; assessReceipt accepts the result for that report only', () => {
    const src = mkdtempSync(path.join(tmpdir(), 'rcpt-src-')),
      out = path.join(mkdtempSync(path.join(tmpdir(), 'rcpt-out-')), 'reviews')
    writeFileSync(path.join(src, 'bootstrap.log'), 'ok')
    const { file, receipt } = writeReceipt(out, {
      gate: 'clean-install',
      report,
      reviewer: 'me',
      method: 'ran it',
      cases: ['x/y/default'],
      evidenceFiles: [path.join(src, 'bootstrap.log')]
    })
    assert.equal(path.basename(file), 'clean-install.json')
    assert.equal(readFileSync(path.join(out, 'clean-install/bootstrap.log'), 'utf8'), 'ok')
    assert.equal(assessReceipt('clean-install', receipt, report, out).status, 'pass')
    assert.equal(
      assessReceipt(
        'clean-install',
        JSON.parse(readFileSync(file, 'utf8')),
        { ...report, origin: 'http://127.0.0.1:2' },
        out
      ).status,
      'fail'
    )
  })
  it('an evidence file named like the receipt cannot overwrite it', () => {
    const src = mkdtempSync(path.join(tmpdir(), 'rcpt-src-')),
      out = path.join(mkdtempSync(path.join(tmpdir(), 'rcpt-out-')), 'reviews')
    writeFileSync(path.join(src, 'editability.json'), '{"steps":[]}')
    const { file, receipt } = writeReceipt(out, {
      gate: 'editability',
      report,
      reviewer: 'me',
      method: 'ui',
      cases: ['x'],
      evidenceFiles: [path.join(src, 'editability.json')]
    })
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).gate, 'editability')
    assert.equal(assessReceipt('editability', receipt, report, out).status, 'pass')
  })
  it('refuses an unknown gate, a report without identity, and a receipt without evidence', () => {
    assert.throws(
      () =>
        buildReceipt({
          gate: 'routing',
          report,
          reviewer: 'me',
          method: 'm',
          cases: ['a'],
          evidence: [{ path: 'x', sha256: 's' }]
        }),
      /unknown review gate routing/
    )
    assert.throws(
      () =>
        buildReceipt({
          gate: 'build',
          report: { contractHash: 'sha256:c' },
          reviewer: 'me',
          method: 'm',
          cases: ['a'],
          evidence: [{ path: 'x', sha256: 's' }]
        }),
      /report lacks artifactHash/
    )
    assert.throws(
      () => buildReceipt({ gate: 'build', report, reviewer: 'me', method: 'm', cases: ['a'], evidence: [] }),
      /evidence are required/
    )
  })
})
