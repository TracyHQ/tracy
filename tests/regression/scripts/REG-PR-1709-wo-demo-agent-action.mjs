/**
 * REG-PR-1709-wo-demo-agent-action: an outside demo is the agent demo Tracy's own Build demo makes, and its public
 * status says when the seller's chat in Tracy has to finish it.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const s1 = nodeTest(['test/wo-public-demos.test.mjs'], {
  cwd: 'apps/tracy-web',
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S1', s1)
c.passes('S1', s1, 'a demo is the same agent demo Tracy’s own Build demo makes')
c.passes('S1', s1, 'status: waiting-for-you with the chat to open')
c.done()
