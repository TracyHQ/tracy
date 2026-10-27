/**
 * REG-PR-1707-wo-demo-place-photo-uri: a Places photo reaches Tracy as its public photoUri, never with the key.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const s1 = nodeTest(['packages/wo/website-opportunities/test/plugins-builder-tracy.test.mjs'], {
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S1', s1)
c.passes(
  'S1',
  s1,
  'a researched place sends its own public photos, a Places photo as its public photoUri, never the key'
)
c.done()
