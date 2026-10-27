/**
 * REG-PR-1170-ops-templates-feedback-2: the Road to live has seven steps with no hand check, the demo waits
 * for the content contract and the listing for a live demo, and the template page reads in short compact rows.
 * Runs S1 the server road and quickstart door suites (Postgres), S2 the tracy-harness typecheck and its
 * suites. Each run must exit 0 with 0 failed and 0 skipped, and every test the case names must pass.
 */
import { checks, nodeTest, run, ROOT, testDatabaseUrl } from './lib.mjs'

const c = checks()
const env = { ...process.env, TEST_DATABASE_URL: testDatabaseUrl() }

// S1
const s1 = nodeTest(
  ['apps/tracy-web/test/road-to-live.test.mjs', 'apps/tracy-web/test/ops-quickstarts.test.mjs'],
  {
    env,
    extra: ['--test-timeout=120000']
  }
)
c.tapClean('S1', s1)
for (const name of [
  'the steps come in one fixed order, each with a state and a code',
  'an installer release is the full path: the demo and the listing wait for the contract',
  'a live demo is kept while the contract is made: the listing and the contract run side by side',
  'once the contract is in place the demo opens; without a live demo the listing waits for it',
  'a shown listing is published, and with nothing to polish every step is done',
  'a demo that failed on an older version: the road says which, and Sites built from it marks the demo'
])
  c.passes('S1', s1, name)

// S2
const tsc = run(process.execPath, [
  `${ROOT}/node_modules/typescript/bin/tsc`,
  '--noEmit',
  '-p',
  'packages/web/tracy-harness/tsconfig.json'
])
c.eq('S2: tracy-harness tsc exit code', tsc.status, 0)
const s2 = nodeTest(['packages/web/tracy-harness/test/*.test.mjs'])
c.tapClean('S2', s2)
for (const name of [
  'Road to live for ja-restaurant: seven steps in the order they finish, only the contract to start now',
  'Road to live of a Published release: the GitHub link still shows, every step done reads 7/7 and Live',
  'Road to live CMS header: collapsed on load, the whole row is one toggle, the chevron at its right edge, To do now never closes it',
  'no contract on Joomla: ONE prompt with the whole sequence, the version not pinned, never batch-contracts out of scope',
  'short copy: why lines and fact lines fit one line, /ops steps are at most three short ones',
  'a failed install reads as one row: Failed, the tried and latest versions, Retry install at the right',
  'while the road holds the demo for the contract, Install demo and Retry install are off with the reason; Update stays on',
  'no contract: one line, a None mark and a link to the contract step',
  'waiting for the demo: one muted line, no checklist, the form hidden',
  'Hidden and waiting for a step: Publish is off and muted, every step on hover only',
  'No listing yet: no Publish button at all, never a dead one'
])
  c.passes('S2', s2, name)
c.done()
