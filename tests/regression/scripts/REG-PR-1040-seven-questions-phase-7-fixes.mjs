/**
 * REG-PR-1040-seven-questions-phase-7-fixes: round 2 of the fixes measured on dev. S1 replays the #1034 case it carries,
 * S2 the WordPress sweep (slot blocks kept, ticked pages stay, second-chance pass) and the pinned contracts, S3 the
 * WordPress planner (binding language, tone definitions, entities and null), S4 the EmDash tool (labels in the written
 * language, tone). Each run must exit 0 with 0 failed and 0 skipped.
 */
import { spawnSync } from 'node:child_process'
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = spawnSync(
  process.execPath,
  ['tests/regression/scripts/REG-PR-1034-seven-questions-phase-6-fixes.mjs'],
  {
    stdio: 'ignore'
  }
)
c.eq('S1: REG-PR-1034 exit code', s1.status, 0)

// S2
const s2 = nodeTest([
  'apps/tracy-web/test/brief-wp-slot-blocks.test.mjs',
  'apps/tracy-web/test/brief-wp-kept-pages.test.mjs',
  'apps/tracy-web/test/brief-wp-repair.test.mjs',
  'apps/tracy-web/test/contracts.test.mjs'
])
c.tapClean('S2', s2)

// S3
const s3 = nodeTest([
  'packages/cms/tracy-seeder/test/plan-wordpress-contract-language.test.mjs',
  'packages/cms/tracy-seeder/test/tone.test.mjs',
  'packages/cms/tracy-seeder/test/plan-wordpress-contract.test.mjs'
])
c.tapClean('S3', s3)

// S4
const s4 = nodeTest(['tests/personalize-labels.test.mjs', 'tests/personalize-tone.test.mjs'], {
  cwd: 'packages/cms/tracy-emdash-theme-business',
  extra: ['--test-timeout=120000']
})
c.tapClean('S4', s4)
c.done()
