/**
 * `<userData>/policy.json` (src/policy-store.js): the last minimum version policy whose channel file
 * verified, so a start without the network still knows it (tasks/todo-desktop-update-policy.md C5/C6).
 *
 *   node --test packages/desktop/tracy-desktop/test/policy-store.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createPolicyStore } = require('../src/policy-store.js')

const fresh = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-store-'))
  const lines = []
  return {
    file: path.join(dir, 'policy.json'),
    lines,
    store: (file) => createPolicyStore({ file, log: (l) => lines.push(l) })
  }
}

test('nothing saved yet reads as null', () => {
  const { file, store } = fresh()
  assert.equal(store(file).read(), null)
})

test('a saved policy reads back, with its revision and when it was verified', () => {
  const { file, store } = fresh()
  const record = { policy: { minimumVersion: '0.6.0', policyRevision: 4 }, revision: 4, verifiedAt: 1_000 }
  store(file).write(record)
  assert.deepEqual(store(file).read(), record)
  // A cleared policy keeps its revision, so an older one cannot come back.
  const cleared = { policy: { policyRevision: 5 }, revision: 5, verifiedAt: 2_000 }
  store(file).write(cleared)
  assert.deepEqual(store(file).read(), cleared)
})

test('a broken, foreign or inconsistent file reads as null and says so', () => {
  const { file, lines, store } = fresh()
  for (const body of [
    'not json',
    '[]',
    JSON.stringify({ policy: { minimumVersion: '0.6.0', policyRevision: 4 }, revision: 3, verifiedAt: 1 }),
    JSON.stringify({ policy: { minimumVersion: 'soon', policyRevision: 4 }, revision: 4, verifiedAt: 1 }),
    JSON.stringify({ policy: { policyRevision: 4, extra: 1 }, revision: 4, verifiedAt: 1 }),
    JSON.stringify({ policy: null, revision: 0, verifiedAt: 'yesterday' })
  ]) {
    fs.writeFileSync(file, body)
    assert.equal(store(file).read(), null, body)
  }
  assert.ok(lines.length >= 6)
})

test('writing leaves no temporary file behind and refuses a record of the wrong shape', () => {
  const { file, store } = fresh()
  store(file).write({ policy: null, revision: 0, verifiedAt: 5 })
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['policy.json'])
  assert.throws(() => store(file).write({ policy: { policyRevision: 2 }, revision: 3, verifiedAt: 5 }))
})
