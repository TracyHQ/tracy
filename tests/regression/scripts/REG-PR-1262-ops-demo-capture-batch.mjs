/**
 * REG-PR-1262-ops-demo-capture-batch: six /ops defects measured on dev on 12/10/2026, each held by
 * the test that went red before its fix. S1 the shooter loads a page once per shot, S2 a baseline
 * queued on the heavy lock says it is waiting, S3 the install door answers at once and never with a
 * 502 and the capture door names pictures per release (both need Postgres: TEST_DATABASE_URL), S4
 * tracy-host's keyed teardown, S5 the /ops new-bundle watch and the whole-row hit target.
 */
import { cannotRun, checks, nodeTest } from './lib.mjs'

if (!process.env.TEST_DATABASE_URL) cannotRun('TEST_DATABASE_URL is not set (S3 needs Postgres)')
const c = checks()

const s1 = nodeTest(['apps/tracy-host/test/capture.test.mjs'])
c.tapClean('S1', s1)
c.passes(
  'S1',
  s1,
  'makeShoot: a shot past the caller ceiling is retaken at one CSS pixel from the SAME loaded page'
)
c.passes('S1', s1, 'makeShoot: a page too heavy even at 1× is shot shorter rather than given up on')

const s2 = nodeTest(['packages/fleet/tracy-fleet-operation/test/webroot-heavy-lock-queue.test.mjs'])
c.tapClean('S2', s2)
c.passes('S2', s2, 'a baseline queued behind another heavy job says it is waiting, then says it is building')

const s3 = nodeTest(['apps/tracy-web/test/ops-demos.test.mjs', 'apps/tracy-web/test/ops-capture.test.mjs'])
c.tapClean('S3', s3)
for (const name of [
  'a demo host answering 502 is a JSON 503 with a reason, never our own 502',
  'a demo host that does not answer is given a bounded wait, then a JSON 503',
  'a demo host slower than the quick window: 202 at once with the id the host will use, followed to the end',
  'a host that never takes the job after a 202: the job reads failed in words, and the next press is a clean retry',
  'the door predicts the host job id with the same rule tracy-host names a keyed job by',
  'two CMSes of one template shoot the same page key into two pictures, and an older card keeps its own'
])
  c.passes('S3', s3, name)

const s4 = nodeTest(['apps/tracy-host/test/provision.test.mjs'])
c.tapClean('S4', s4)
c.passes(
  'S4',
  s4,
  'POST /_host/teardown with a jobKey answers the job named by that key, and starts nothing twice'
)

const s5 = nodeTest([
  'packages/web/tracy-harness/test/bundle-freshness.test.mjs',
  'packages/web/tracy-harness/test/templates-row-hit.test.mjs'
])
c.tapClean('S5', s5)
c.passes('S5', s5, 'a deploy that changed the bundle is reported once, and the watch stops')
c.passes(
  'S5',
  s5,
  'a click anywhere on the row opens it: thumbnail, name, chips, warnings pill, empty cell, chevron'
)
c.passes('S5', s5, 'the row is one keyboard stop, and Enter opens it')
c.done()
