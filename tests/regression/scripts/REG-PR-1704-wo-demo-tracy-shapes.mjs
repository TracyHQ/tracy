/**
 * REG-PR-1704-wo-demo-tracy-shapes: the open WO server's tracy builder against a fake Tracy that answers in
 * Tracy's real /v1/demos shapes, and the Build card view models. Exit 0 only when both suites are clean and
 * the named tests pass.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const PKG = 'packages/wo/website-opportunities'
const s1 = nodeTest(
  [`${PKG}/test/plugins-builder-tracy.test.mjs`, `${PKG}/test/ui-tracy-view-models.test.mjs`],
  {
    env: { ...process.env, TEST_DATABASE_URL: db }
  }
)
c.tapClean('S1', s1)
c.passes('S1', s1, 'Build it with Tracy sends the place, then the tick follows the demo to ready')
c.passes('S1', s1, 'the live demo limit comes back with its numbers')
c.passes('S1', s1, 'Build: a failed demo says why, with Tracy’s code')
c.passes('S1', s1, 'Build: a sent demo shows how many live demos the account has of its limit')
c.done()
