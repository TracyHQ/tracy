#!/usr/bin/env node
/**
 * Regression check for PR 1501: the /ops preview-door probe (`lib/preview-door-health.js`) keeps a
 * stylesheet the demo itself has not got (asset door 404 DEMO_UNREADABLE) out of the PREV-1 failures,
 * while a door that cannot serve (502), a 404 NOT_FOUND and a page where no asset loads still fail.
 * Runs the door-health unit test file; exit 0 only when it passes.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const t = spawnSync(process.execPath, ['--test', 'apps/tracy-web/test/preview-door-health.test.mjs'], {
  cwd: ROOT,
  stdio: 'inherit'
})
console.log(`${t.status === 0 ? 'PASS' : 'FAIL'} preview-door-health.test.mjs`)
process.exit(t.status === 0 ? 0 : 1)
