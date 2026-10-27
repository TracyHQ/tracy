import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// The library holds over a thousand systems and the sweep sees fifteen: every contract must hold its
// invariants under any of them, not under the fifteen it was tuned on (David 14/10/2026). One system in
// nine of both libraries here; `node scripts/matrix.mjs` runs all of them.
test('every contract holds its invariants under systems of the whole library, not only the featured fifteen', () => {
  const run = spawnSync(process.execPath, [join(HERE, '../scripts/matrix.mjs'), '--every', '9'], {
    encoding: 'utf8',
    maxBuffer: 1 << 26
  })
  assert.equal(run.status, 0, run.stdout.split('\n').slice(-30).join('\n'))
  assert.match(run.stdout, /(\d+)\/\1 contracts hold every invariant/)
  const [, n] = /× (\d+) systems/.exec(run.stdout) ?? []
  assert.ok(Number(n) > 100, `${n} systems`)
})
