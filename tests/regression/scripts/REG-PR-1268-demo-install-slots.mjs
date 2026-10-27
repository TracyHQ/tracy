/**
 * REG-PR-1268-demo-install-slots: a demo host runs at most DEMO_INSTALL_SLOTS demo installs at
 * once; the rest wait in order with a step that says so, and a customer's provision never waits.
 * S1 the host's provision door and config suites; S2 the demo door sends `demo: true` (Postgres).
 */
import { cannotRun, checks, nodeTest } from './lib.mjs'

if (!process.env.TEST_DATABASE_URL) cannotRun('TEST_DATABASE_URL is not set (S2 needs Postgres)')
const c = checks()
const s1 = nodeTest([
  'apps/tracy-host/test/provision.test.mjs',
  'apps/tracy-host/test/config.test.mjs',
  'apps/tracy-host/test/install-memory-gate.test.mjs'
])
c.tapClean('S1', s1)
for (const name of [
  'POST /_host/provision: demo installs beyond the slots queue, say how many are ahead, and start as slots free',
  'POST /_host/provision: a customer provision never waits behind demo installs',
  'readConfig: DEMO_INSTALL_SLOTS sets how many demo installs run at once; anything but a positive whole number is 2',
  'POST /_host/provision: a demo install on a host short of memory answers 202, waits with the memory step, then runs',
  'a demo install waits in its slot while memory is short, says how much there is, and starts when there is enough',
  'no reading of memory (no /proc on this machine) never holds an install back'
])
  c.passes('S1', s1, name)
const s3 = nodeTest(['apps/tracy-host/test/capture.test.mjs'])
c.tapClean('S3', s3)
c.passes(
  'S3',
  s3,
  'makeShoot: a step whose picture would pass the pixel cap is skipped, so a tall desktop page is drawn at 1×'
)
const s2 = nodeTest(['apps/tracy-web/test/ops-demos.test.mjs'])
c.tapClean('S2', s2)
c.passes('S2', s2, 'a demo provision says it is a demo, so the host gives it an install slot')
c.done()
