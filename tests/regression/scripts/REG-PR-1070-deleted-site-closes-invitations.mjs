/**
 * REG-PR-1070: deleting a site closes the invitations and requests still open on it, so the Inbox
 * stops offering Accept on a site that is gone. Runs site-event-notifications.test.mjs against the
 * Postgres in TEST_DATABASE_URL (run.needs postgres) and requires the new case plus T13.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

testDatabaseUrl()
const c = checks()
const r = nodeTest(['apps/tracy-web/test/site-event-notifications.test.mjs'])
c.tapClean('S2', r)
for (const name of [
  'T13: deleting the site closes the invitations and requests still open on it',
  'T13: deleting the site tells every other member; the rows outlive the site'
])
  c.passes('S3', r, name)
c.done()
