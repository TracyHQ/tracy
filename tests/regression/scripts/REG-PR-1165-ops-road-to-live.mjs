/**
 * REG-PR-1165-ops-road-to-live: the template page on /ops shows the road to live of each release, a failed demo
 * install says why, and a demo or stock EmDash site with no owner gets its relay address as the mail sender.
 * Runs S1 the server road and demo/stock sender suites (Postgres), S2 the tracy-host and fleet script suites for
 * --mail-sender and the failure reason, S3 the tracy-harness typecheck and its suites. Each run must exit 0 with
 * 0 failed and 0 skipped (S1 and S2), and every test the case names must pass.
 */
import { checks, nodeTest, run, ROOT, testDatabaseUrl } from './lib.mjs'

const c = checks()
const env = { ...process.env, TEST_DATABASE_URL: testDatabaseUrl() }

// S1
const s1 = nodeTest(
  [
    'apps/tracy-web/test/road-to-live.test.mjs',
    'apps/tracy-web/test/ops-quickstarts.test.mjs',
    'apps/tracy-web/test/ops-demos.test.mjs',
    'apps/tracy-web/test/inventory-prepare.test.mjs',
    'apps/tracy-web/test/inventory-advance.test.mjs'
  ],
  { env, extra: ['--test-timeout=120000'] }
)
c.tapClean('S1', s1)
for (const name of [
  'the steps come in one fixed order, each with a state and a code',
  'ja-restaurant on dev: release ok, demo failed on 1.0.0, no listing, no contract',
  'an installer release is the full path',
  'an install file the door refuses holds the contract, the demo, the listing and Publish',
  'a sweep-driven redeploy keeps the presser through a poll that rewrote the job, and gives the site its relay sender',
  'a sweep-driven redeploy with no known presser names no owner, never demo-sweep@tracy, and still has a sender',
  'prepare: an EmDash stock instance carries its relay sender and still names no owner',
  'prepare: with no site mail domain configured, no sender is invented',
  'advance: a failed build records the reason the host log gives, with its step',
  'a failed mail step says the helper line, not the generic refusal printed after it',
  "a Joomla CLI installer failure says the installer's error, never its usage synopsis"
])
  c.passes('S1', s1, name)

// S2
const s2 = nodeTest([
  'apps/tracy-host/test/provision.test.mjs',
  'packages/fleet/tracy-fleet-operation/test/emdash-post-up.test.mjs',
  'packages/fleet/tracy-fleet-operation/test/joomla-installer-error.test.mjs'
])
c.tapClean('S2', s2)
for (const name of [
  'provisionArgs: mailSender reaches provision.sh as --mail-sender, and an absent one emits no flag',
  'mail (',
  'provision.sh takes --mail-sender',
  'the message of the error block, trimmed and on one line, never the synopsis',
  'the installer call prints that message as its own !! installer: line on failure'
])
  c.passes('S2', s2, name)

// S3
const tsc = run(process.execPath, [
  `${ROOT}/node_modules/typescript/bin/tsc`,
  '--noEmit',
  '-p',
  'packages/web/tracy-harness/tsconfig.json'
])
c.eq('S3: tracy-harness tsc exit code', tsc.status, 0)
const s3 = nodeTest(['packages/web/tracy-harness/test/*.test.mjs'])
c.tapClean('S3', s3)
for (const name of [
  'a mail failure has its own short fact line, then retry and report',
  'any other reason gets no fact line, only the retry and the report, said once'
])
  c.passes('S3', s3, name)
c.done()
