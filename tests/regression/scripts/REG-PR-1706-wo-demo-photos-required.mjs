/**
 * REG-PR-1706-wo-demo-photos-required: /v1/demos refuses a request with no usable photo before accepting it.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const s1 = nodeTest(['test/wo-public-demos.test.mjs'], {
  cwd: 'apps/tracy-web',
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S1', s1)
c.passes('S1', s1, 'a demo with no usable photo of the business is refused before anything is built')
c.done()
