import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const s1 = nodeTest(['test/wo-fact-assessment.test.mjs', 'test/wo-profile-revision.test.mjs'], {
  cwd: 'apps/tracy-web'
})
c.tapClean('S1', s1)
const s2 = nodeTest(['test/wo-public-demos.test.mjs', 'test/wo-place-profile-freeze.test.mjs'], {
  cwd: 'apps/tracy-web',
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S2', s2)
c.passes('S2', s2, 'v2 freezes the sender profile')
c.passes('S2', s2, 'internal revisions freeze the acceptance read')
c.done()
