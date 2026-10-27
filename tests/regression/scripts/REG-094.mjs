/**
 * REG-094: an answered join request shows its outcome in the Inbox, and the Team dialogs (Invite
 * wizard, Approve). Runs both commands of the case: the unit suites (exit 0, 0 failed, 0 skipped,
 * every named test passing), and the team-notifications suite against the test Postgres
 * (TEST_DATABASE_URL), whose outcome test must pass — skipped is not passed.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()

// Run 1
const r1 = nodeTest([
  'apps/tracy-web/test/seat-pages-card.test.mjs',
  'packages/core/tracy-core/test/settings-rows.test.mjs',
  'packages/core/tracy-core/test/team-invite.test.mjs',
  'packages/core/tracy-core/test/wizard-plan.test.mjs',
  'packages/site/tracy-inbox/test/no-face.test.mjs',
  'packages/site/tracy-inbox/test/rows.test.mjs',
  'packages/site/tracy-inbox/test/sections.test.mjs',
  'packages/site/tracy-my-sites/test/account-copy.test.mjs',
  'packages/site/tracy-my-sites/test/more-settings.test.mjs'
])
c.tapClean('run 1', r1)
for (const name of [
  // rows.test.mjs: outcomeKeyOf('team.join_request', 'approved' | 'declined').
  'an outcome word agrees with its noun: a declined request has its own key',
  // sections.test.mjs: a settled join request is filed by its outcome.
  'an answered join request reads its outcome and takes its colour, like an answered invitation',
  'open requests and invitations need an answer; settled ones are team updates',
  // no-face.test.mjs
  'every Inbox row shape draws its category tile and no person face',
  // team-invite.test.mjs
  'across several sites the wizard offers only the roles every ticked site would accept',
  'a wizard with nowhere to invite to, or no role to give, cannot be sent',
  'D3: the open site is listed first, ticked alone and marked "This site"',
  'D3: role rows read Editor first, and the Sites rows from the Team tab carry the book’s CMS logo',
  'D3: Done says it once for one address, and Invite more starts People again with the same role',
  'V3: Approve shows who asked and when, the approved sentence, and folds what the role can do'
])
  c.passes('run 1', r1, name)

// Run 2: database.
const r2 = nodeTest(['apps/tracy-web/test/team-notifications.test.mjs'], {
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('run 2 (database)', r2)
c.passes(
  'run 2 (database)',
  r2,
  'an answered join request records its outcome on every admin row: approved or declined'
)
c.done()
