import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectSnapshot } from '../inspect-invitations-snapshot.mjs'

const bytes = (text) => new TextEncoder().encode(text)
const group = '1 agency dang hoat dong'
const csv = `user_id,email,nhom_gui,noi_bo,unsubscribed_toan_bo,cong_ty\nsentinel-member,sentinel@fixture.test,${group},,khong,sentinel-private-company\nsecond,second@fixture.test,5 ca nhan,khong,co,Synthetic\n`

test('snapshot inspection retains uncertainty and emits only aggregate allowlist', () => {
  const result = inspectSnapshot(bytes(csv))
  assert.equal(result.counts.inputRows, 2)
  assert.equal(result.counts.recheckCandidates, 1)
  assert.equal(result.counts.suppressedCandidates, 1)
  assert.equal(result.groups[group], 1)
  assert.equal(result.issues.invalid_internal, 1)
  assert.deepEqual(result.flags.internal, { yes: 0, no: 1, blank: 1, other: 0 })
  assert.equal(result.eligibleNow, null)
  const output = JSON.stringify(result)
  for (const forbidden of [
    'sentinel',
    'second@',
    'sourceChecksum',
    'previewDigest',
    'candidates',
    'sourceRows',
    'personalization'
  ])
    assert.equal(output.includes(forbidden), false)
})

test('snapshot parser error is code only, never raw values', () => {
  assert.throws(
    () => inspectSnapshot(bytes('email,email\nsentinel,sentinel')),
    (error) => error.code === 'invalid_csv_headers' && error.message === 'invalid_csv_headers'
  )
})

test('snapshot CLI prints aggregate only and sanitizes filesystem errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'invitations-inspect-test-'))
  try {
    const file = join(directory, 'private-sentinel.csv')
    await writeFile(file, csv)
    const run = (...args) =>
      spawnSync(process.execPath, ['scripts/inspect-invitations-snapshot.mjs', ...args], {
        encoding: 'utf8',
        timeout: 10000
      })
    const good = run(file)
    assert.equal(good.status, 0, good.stderr)
    assert.equal(JSON.parse(good.stdout).eligibleNow, null)
    assert.equal(good.stdout.includes('sentinel'), false)
    const missing = run(join(directory, 'private-missing.csv'))
    assert.equal(missing.status, 1)
    assert.deepEqual(JSON.parse(missing.stderr), { code: 'snapshot_read_failed' })
    assert.equal(run().status, 2)
    assert.equal(run(file, file).status, 2)
  } finally {
    await rm(directory, { recursive: true })
  }
})
