/**
 * Preload for suites that build fixtures under `os.tmpdir()` (the legacy provider/route/site-tools
 * tests): point `os.tmpdir()` at `$QA_HARNESS_ARTIFACT_ROOT/tmp` so their scratch lands in the task
 * artifact folder and is removed with it — without changing `TMPDIR` or the folder sockets live in.
 *
 *   QA_HARNESS_ARTIFACT_ROOT=… node --import ./tests/qa/layers/harness/scratch-preload.mjs --test …
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const root = process.env.QA_HARNESS_ARTIFACT_ROOT
if (root !== undefined && root !== '') {
  const dir = path.join(path.resolve(root), 'tmp')
  fs.mkdirSync(dir, { recursive: true })
  const real = fs.realpathSync(dir)
  os.tmpdir = () => real
  // `import { tmpdir } from 'node:os'` binds to the live export: refresh it.
  syncBuiltinESMExports()
}
