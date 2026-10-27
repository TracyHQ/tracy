/**
 * REG-PR-1709-wo-demo-waiting-card: the open server follows a demo through waiting-for-you, and its Build card links
 * the Tracy chat that finishes it.
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
c.passes('S1', s1, 'Build: a demo waiting for the operator links the chat in Tracy that finishes it')
c.done()
