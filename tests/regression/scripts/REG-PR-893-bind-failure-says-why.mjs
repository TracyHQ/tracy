/**
 * REG-PR-893-bind-failure-says-why: a failed bind says why (curl exit, HTTP status, never the
 * token), and an unbound site is said without an invented cause. Runs both steps of the case:
 * S1 the WordPress quickstart suite, S2 the shared brief suite; each exits 0 with # fail 0 and its
 * named test 'ok'.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

const s1 = nodeTest(['packages/fleet/tracy-fleet-operation/test/wordpress-quickstart.test.mjs'])
c.tapClean('S1', s1, { noSkip: false })
c.passes('S1', s1, 'a bind or inspect answer that is not JSON says what curl saw, and never the token')

const s2 = nodeTest(['apps/tracy-web/test/brief-shared.test.mjs'])
c.tapClean('S2', s2, { noSkip: false })
c.passes('S2', s2, 'an unbound site is said without a cause the refusal does not give')
c.done()
