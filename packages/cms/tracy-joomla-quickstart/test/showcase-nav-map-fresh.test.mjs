import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

// A content map that changed without regenerating its showcase navigation map leaves a map whose baseHash no longer
// matches, and the local site runner refuses it. The generator's own --check recomputes the hash for every pinned map.
test('every pinned showcase navigation map matches the content map it was generated from', () => {
  const run = spawnSync(process.execPath, ['scripts/build-joomla-showcase-nav.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
})
