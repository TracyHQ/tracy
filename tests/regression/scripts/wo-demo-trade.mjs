/**
 * WO public demos: the sender's category sets the trade the brief is built for. A gym or a spa is no
 * restaurant (no Menu page, no dishes asked); a cuisine from an older client is food; unknown text is `other`.
 * Needs TEST_DATABASE_URL (run.needs postgres).
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

testDatabaseUrl()
const c = checks()

const host = nodeTest(['test/wo-public-demos.test.mjs'], { cwd: 'apps/tracy-web' })
c.tapClean('S1', host)
c.passes('S1', host, 'the sender’s category sets the trade the brief is built for')
c.done()
