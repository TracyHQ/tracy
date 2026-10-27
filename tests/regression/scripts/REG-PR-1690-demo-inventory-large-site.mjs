#!/usr/bin/env node
/**
 * Regression check for PR 1690: the agent-demo inventory of a large Joomla site reads body pages and the two relation
 * tables instead of one Apply call per record (and per relation), keeps at most eight calls in flight, answers exactly
 * what the per-record read answers, and stops at the first refusal; a build's step budget grows with its template.
 * Exit 0 only when every file passes.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const TESTS = [
  'apps/tracy-web/test/agent-demo-inventory-large-site.test.mjs',
  'apps/tracy-web/test/agent-demo-native-inventory.test.mjs',
  'packages/tools/tracy-site-tools/test/site-context.test.mjs'
]
const t = spawnSync(process.execPath, ['--test', ...TESTS], { cwd: ROOT, stdio: 'inherit' })
console.log(`${t.status === 0 ? 'PASS' : 'FAIL'} unit tests (${TESTS.length} files)`)
process.exit(t.status === 0 ? 0 : 1)
