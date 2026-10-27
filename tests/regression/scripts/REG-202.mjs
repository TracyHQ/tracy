/**
 * REG-202: a mail that lands in Spam still has a way through — the invite link in the send answer,
 * a dismissible Spam tip, and a one-click unsubscribe per notification group. Runs S2 against the
 * Postgres in TEST_DATABASE_URL (run.needs postgres) and S3, and requires every test the case names.
 * A test skipped for want of a database is not a pass.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

testDatabaseUrl()
const c = checks()
const s2 = nodeTest([
  'apps/tracy-web/test/team-invite-link.test.mjs',
  'apps/tracy-web/test/spam-tip.test.mjs',
  'apps/tracy-web/test/notification-unsubscribe.test.mjs',
  'apps/tracy-web/test/notification-mail.test.mjs'
])
c.tapClean('S2', s2)
for (const name of [
  'the inviter gets the accept link of the invitation mail, and only the inviter',
  'no link when nothing was granted: already on the team, or refused',
  'the link opens only for the invited address',
  'one click turns off that group’s email only, and stays idempotent',
  'opening the link (GET) changes nothing by itself and offers the one-click form',
  'a forged, tampered, expired or locked-group token changes nothing',
  'the locked join-request letters carry no one-click header',
  'C3-B: the invitation keeps three links, the join request two, and no brand link anywhere',
  'storage that throws still shows the tip',
  'the script shows the tip, and a dismissal is remembered per tip'
])
  c.passes('S2', s2, name)
const s3 = nodeTest(['packages/core/tracy-core/test/team-invite.test.mjs'])
c.tapClean('S3', s3)
c.done()
