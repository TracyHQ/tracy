// REG-PR-1181-create-retry-provision: the three provision fences of #1181 (P-1, P-2, P-3), read from
// the tests that pin them. Prints one `ok -` / `not ok -` line per check; exits 0 only when all pass.
//   P-1 a nameless build whose provision FAILED is retried by the same press (not IDEMPOTENCY_CONFLICT)
//   P-2 provision pours into / installs on MariaDB only once it is the server that stays up
//   P-3 deleting a site while its provision runs ends the provision row (never `running` forever)
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const env = { ...process.env, TEST_DATABASE_URL: testDatabaseUrl() }
const c = checks()

const retry = nodeTest(['test/sites-route.test.mjs'], {
  cwd: 'apps/tracy-web',
  env,
  pattern: 'nameless build whose provision FAILED'
})
c.passes(
  'P-1',
  retry,
  'POST /api/sites/claim: a nameless build whose provision FAILED is retried by the same press'
)
c.eq('P-1: fail', retry.counts.fail, 0)

const db = nodeTest(['packages/fleet/tracy-fleet-operation/test/db-ready.test.mjs'])
c.tapClean('P-2', db)
c.passes('P-2', db, 'provision: a server that stays the temporary one is never taken for ready')
c.passes('P-2', db, 'provision: a database that refuses its first connections is waited for')

const del = nodeTest(['test/site-creation.test.mjs'], {
  cwd: 'apps/tracy-web',
  env,
  pattern: 'deleting a site'
})
c.eq('P-3: fail', del.counts.fail, 0)
c.passes('P-3', del, 'deleting a site while its provision still runs ends the provision row')
c.passes('P-3', del, 'deleting a site whose provision already ENDED keeps that ending as it was')

c.done()
