/**
 * REG-PR-1704-wo-demo-profile-frozen: a /v1/demos demo's revision carries the business it was sent in
 * profile_effective, and its brief names the business. Runs the door's suite on the test Postgres.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const s1 = nodeTest(['test/wo-public-demos.test.mjs'], {
  cwd: 'apps/tracy-web',
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S1', s1)
c.passes('S1', s1, 'the demo is built from the business it was sent: its profile is frozen into the revision')
c.done()
