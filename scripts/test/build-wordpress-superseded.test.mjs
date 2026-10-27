// The superseded list follows a released WordPress profile corrected in place (Claude Cowork plugin 0.13.6/0.13.7
// regression): the previous base hash moves into `accepts`, a changed presentation lock is refused,
// and --check turns red while the file is stale.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = path.join(ROOT, 'scripts/build-wordpress-superseded.mjs')
const ID = 'tracy-business/wp7/1.1.0'

function tree() {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-superseded-'))
  cpSync(path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts', ID), path.join(dir, ID), {
    recursive: true
  })
  return dir
}
const run = (dir, ...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, TRACY_WP_CONTRACTS: dir },
    encoding: 'utf8'
  })
const read = (dir) => JSON.parse(readFileSync(path.join(dir, ID, 'superseded.json'), 'utf8'))
const touchMap = (dir) => {
  const file = path.join(dir, ID, 'content-map.json')
  const map = JSON.parse(readFileSync(file, 'utf8'))
  map.slots[0].maxCharacters -= 1
  writeFileSync(file, JSON.stringify(map, null, 2) + '\n')
}

test('the committed profile is current', () => {
  const dir = tree()
  assert.equal(run(dir, '--check').status, 0)
})

test('a corrected content map makes the list stale, and regenerating keeps the old base', () => {
  const dir = tree()
  const before = read(dir)
  touchMap(dir)
  const stale = run(dir, '--check')
  assert.equal(stale.status, 1)
  assert.match(stale.stderr, /superseded\.json is stale/)
  assert.equal(run(dir).status, 0)
  const after = read(dir)
  assert.notEqual(after.baseHash, before.baseHash)
  const entry = after.accepts.find((a) => a.baseHash === before.baseHash)
  assert.ok(entry, 'the previous base is accepted')
  assert.equal(entry.presentationLock, before.presentationLock)
  assert.equal(entry.demoTrimHash, before.demoTrimHash)
  for (const a of before.accepts)
    assert.ok(
      after.accepts.some((b) => b.baseHash === a.baseHash),
      'earlier ones stay'
    )
  assert.equal(run(dir, '--check').status, 0)
})

test('a changed presentation lock is a new profile version, never a correction', () => {
  const dir = tree()
  const file = path.join(dir, ID, 'presentation-lock.json')
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\n$/, ' \n'))
  const out = run(dir)
  assert.equal(out.status, 1)
  assert.match(out.stderr, /presentation lock changed/)
})
