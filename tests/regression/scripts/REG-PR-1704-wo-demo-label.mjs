/**
 * REG-PR-1704-wo-demo-label: /v1/demos queues its demo action without the business name as the site label,
 * so the build names the site itself instead of failing INVALID_LABEL. Runs the door's suite on the test Postgres.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const s1 = nodeTest(['test/wo-public-demos.test.mjs'], {
  cwd: 'apps/tracy-web',
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S1', s1)
c.passes('S1', s1, 'a business name that is no site address never becomes the build’s label')
c.done()
