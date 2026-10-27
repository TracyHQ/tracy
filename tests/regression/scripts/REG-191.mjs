/**
 * REG-191: small QA defects — the account read that fails is not "signed out", a poster that fails
 * leaves no broken image, the Ops rail's API link, the Sign out warnings on User Interface. Runs
 * every step of the case: S1/S2 the four suites (exit 0, 0 failed, 0 skipped, 0 cancelled, every
 * named test passing), S3 `build-client.mjs --check` in the three packages whose client it ships.
 */
import { join } from 'node:path'
import { ROOT, checks, nodeTest, run } from './lib.mjs'

const c = checks()

// S1 + S2
const s1 = nodeTest(
  [
    'packages/site/tracy-my-sites/test/account-read.test.mjs',
    'packages/design/tracy-design-inspiration/test/poster-failure.test.mjs',
    'packages/web/tracy-harness/test/ops-small-defects.test.mjs',
    'packages/core/tracy-core/test/ui-switches.test.mjs'
  ],
  { extra: ['--import', 'tsx', '--test-timeout=120000'] }
)
c.tapClean('S1', s1)
// "Every 'a failed read is said as a failure, not as signed out' test passes": a rejected request,
// error statuses, an empty / HTML / malformed / null / list body, and a missing, empty or
// non-string email.
const FAILED_READ = 'a failed read is said as a failure, not as signed out: '
for (const shape of [
  'the request is rejected',
  'the door answers 500 with JSON',
  'the door answers 502 with an HTML page',
  'the door answers 401',
  'an error status carries the signed-out shape',
  'a 200 with an empty body',
  'a 200 with an HTML page',
  'a 200 with malformed JSON',
  'a 200 whose JSON is null',
  'a 200 whose JSON is a list',
  'a 200 with no email field',
  'a 200 with an empty email',
  'a 200 whose email is not a string'
])
  c.passes('S1', s1, FAILED_READ + shape)
c.eq('S1: no failed-read test fails', s1.failed.filter((t) => t.startsWith(FAILED_READ)).length, 0)
for (const name of [
  'the door’s own signed-out answer (200, email: null) still reads as not signed in',
  'a usable address shows the account and Sign out',
  'Try again asks the same door once more and shows the account when it answers',
  'Try again that reaches a signed-out door shows not signed in',
  'Try again that fails again keeps the failure and the retry',
  'a poster that fails to load stops pulsing and leaves the no-picture ground, no broken image',
  'the failure stays through a redraw with the same address',
  'a new poster address after a failure is asked for, pulses and can load',
  'a new poster address that fails too ends on the no-picture ground',
  'the preview’s live demo frame sends no referrer and is not sandboxed',
  'the Ops rail carries exactly one link to the staff API reference, labelled API',
  'a plain press on the API link is left to the browser: the SPA neither cancels it nor routes',
  'a modifier press on the API link stays a real link too',
  'User Interface warns that Account off leaves no Sign out',
  'every switch that can take away the only Sign out says so before it is turned off'
])
  c.passes('S1', s1, name)

// S3
for (const pkg of [
  'packages/site/tracy-my-sites',
  'packages/design/tracy-design-inspiration',
  'packages/ui/tracy-settings'
]) {
  const r = run(process.execPath, ['scripts/build-client.mjs', '--check'], { cwd: join(ROOT, pkg) })
  c.eq(`S3 ${pkg}: build-client --check exit code`, r.status, 0)
  if (r.status !== 0) process.stdout.write(`${r.stdout}\n${r.stderr}\n`.slice(-1500))
}
c.done()
