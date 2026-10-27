// `removeBuildInfo` (scripts/lib/build-info.mjs): the incremental-build records a dsh build must not
// inherit from a build of another dsh in the same checkout.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { removeBuildInfo } from '../lib/build-info.mjs'

test('every *.tsbuildinfo goes, wherever it sits, and nothing else; node_modules is not walked', () => {
  const root = mkdtempSync(join(tmpdir(), 'build-info-'))
  const put = (path) => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), 'x')
  }
  put('tsconfig.host.tsbuildinfo')
  put('apps/desktop/lib/tsconfig.tsbuildinfo')
  put('apps/desktop/lib/index.js')
  put('apps/desktop/src/main.ts')
  put('node_modules/some/tsconfig.tsbuildinfo')
  const removed = removeBuildInfo(root)
  assert.deepEqual(removed.sort(), ['apps/desktop/lib/tsconfig.tsbuildinfo', 'tsconfig.host.tsbuildinfo'])
  assert.equal(existsSync(join(root, 'apps/desktop/lib/tsconfig.tsbuildinfo')), false)
  assert.equal(existsSync(join(root, 'apps/desktop/lib/index.js')), true)
  assert.equal(existsSync(join(root, 'apps/desktop/src/main.ts')), true)
  assert.equal(existsSync(join(root, 'node_modules/some/tsconfig.tsbuildinfo')), true)
})
