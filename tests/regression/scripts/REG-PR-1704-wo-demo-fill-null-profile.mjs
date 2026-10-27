/**
 * REG-PR-1704-wo-demo-fill-null-profile: the quickstart fill reads no reviews from a revision frozen without a
 * profile (JSON null) instead of throwing "reading 'googlePlace'".
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const s1 = nodeTest(['test/brief-quickstart-first.test.mjs'], { cwd: 'apps/tracy-web' })
c.tapClean('S1', s1)
c.passes('S1', s1, 'a revision frozen without a profile has no reviews, it does not fail the fill')
c.done()
