/**
 * REG-PR-1706-wo-demo-sends-photos: the open WO server's demo request carries the place's own public photos,
 * addressed from its research rows (the brief's assets keep no address).
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const PKG = 'packages/wo/website-opportunities'
const s1 = nodeTest([`${PKG}/test/plugins-builder-tracy.test.mjs`, `${PKG}/test/tracy-request.test.mjs`], {
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S1', s1)
c.passes('S1', s1, 'a researched place sends its own public photos, never a Places resource name')
c.passes('S1', s1, 'a researched place: business facts, items and only public https photos')
c.done()
