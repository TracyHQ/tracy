#!/usr/bin/env node
/**
 * Regression check for the wo_principal migrations (PR 1686): Tracy's own chain moves the seven WO foreign keys from
 * `account` to `wo_principal` with no manual step, keeps every row, and does not deadlock a live ledger writer.
 * Needs TEST_DATABASE_URL (a Postgres it may create scratch databases on); without it the tests would skip, so this
 * exits 2 instead of reporting a pass.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
if (!process.env.TEST_DATABASE_URL) {
  console.log('BLOCKED: set TEST_DATABASE_URL')
  process.exit(2)
}
const run = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=spec', 'test/wo-schema-baseline.test.mjs'],
  { cwd: resolve(ROOT, 'apps/tracy-web'), encoding: 'utf8', env: process.env }
)
const out = `${run.stdout}${run.stderr}`
const skipped = /# skipped [1-9]|ℹ skipped [1-9]/.test(out)
const ok = run.status === 0 && !skipped && /171 does not deadlock/.test(out)
console.log(
  out
    .split('\n')
    .filter((l) => /^[✔✖]|ℹ (pass|fail|skipped)/.test(l))
    .join('\n')
)
console.log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
