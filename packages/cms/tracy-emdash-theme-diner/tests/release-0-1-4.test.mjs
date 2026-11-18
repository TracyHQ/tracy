// What 0.1.4 changes (DECISIONS D-K7; cut as 0.1.3 until the renumber, D-K20): the content map is built on role vocabulary v3 (place-content-roles/3) and measured
// again; the release does its SQLite work through better-sqlite3, so a machine without the sqlite3 CLI can cut it (G5);
// and the residue check names a revision written in a later second than the seed's write (G5b).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')

test('G5: the release reads, copies and scrubs the state through better-sqlite3, never the sqlite3 CLI', () => {
  const release = read('tools/release.mjs')
  assert.match(release, /^import Database from 'better-sqlite3'$/m)
  assert.match(release, /await source\.backup\(db\)/)
  assert.match(release, /const sql = sqlText\(stateDb\)/)
  assert.match(release, /stateDb\.close\(\)/)
  assert.doesNotMatch(release, /execFileSync\('sqlite3'/)
})

test('G5b: the residue check compares revision times by the second, not with a two-second margin', () => {
  const residue = read('tools/state-residue.mjs')
  assert.match(residue, /strftime\('%s', created_at\)/)
  assert.doesNotMatch(residue, /2\.0 \/ 86400/)
})

test('0.1.4 is the version the template, the package and the image label name', () => {
  assert.equal(JSON.parse(read('package.json')).version, '0.1.4')
  assert.equal(JSON.parse(read('template.config.json')).version, '0.1.4')
  assert.match(read('Dockerfile'), /io\.tracy\.template\.version="0\.1\.4"/)
})
