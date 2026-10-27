/**
 * REG-PR-1598-import-qa-fixes: a site import survives a dsh restart, a slow uplink, says its bytes and
 * installs the slim Claude Cowork package first (S1–S5, the host half against mocked engines); and an
 * unfinished import is never opened as a workspace (S6–S8): tracy-web's one readiness rule
 * (`apps/tracy-web/src/lib/import-pending.js`) against the test Postgres (TEST_DATABASE_URL), My Sites
 * in jsdom, and the import recovery page rebuilt from the host's status door. Each run must exit 0
 * with 0 failed and 0 skipped, and every test the case names must pass.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()

// S1–S5
const host = nodeTest(
  [
    'test/run-interrupted.test.mjs',
    'test/files-export-slow.test.mjs',
    'test/import-progress-ui.test.mjs',
    'test/import-gates.test.mjs'
  ],
  { cwd: 'packages/site/tracy-add-site' }
)
c.tapClean('S1-S5', host)
for (const name of [
  '#1565: a run cut by a restart is interrupted, and Continue goes on from the stored parts with no password',
  '#1565: a restart that finds no running import marks nothing',
  '#1565: an upload cursor stays usable while parts keep landing, within a bound',
  '#1566: a part the component could not PUT in time goes inline at the same size, and the read finishes',
  '#1566: a late PUT from a call this side gave up on cannot replace the retried part',
  '#1566: a number reserved before a call dsh never saw end is not used again by Continue',
  '#1566: an inline PUT that throws after sending is retried under a new number',
  '#1566: a slow part waits as long as its size needs at a slow uplink, not a fixed two minutes',
  '#1567: the read says the bytes sent, the site total and when the part on its way started',
  '#1567: an engine that cannot tell its total still reads, with no total',
  '#1567: megabytes sent of the total, a rough time left, and the part on its way with its clock',
  '#1567: the files row says the bytes and the part on its way while the read runs',
  '#1565: an interrupted run offers Continue, or the details again when the host holds no code',
  'a site that could fetch the release itself still gets the slim package, carried over',
  'the URL road is the fallback when the upload road does not install',
  'a package this side cannot download goes over the URL road, as before'
])
  c.passes('S1-S5', host, name)

// S6: landing, named path, pointer cookie, Start the agent and the site list on an unfinished import.
const web = nodeTest(['test/import-pending.test.mjs', 'test/import-address.test.mjs'], {
  cwd: 'apps/tracy-web',
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S6', web)
for (const name of [
  'landing on / with only a failed import goes to the recovery page, not into the site',
  'landing on / with a ready site and a failed import lands on the ready one',
  'a named path to a failed import goes to the recovery page; a fetch gets IMPORT_NOT_FINISHED',
  'a stranger naming a failed import still gets the join page',
  'an old tracy_site pointer to a failed import is forgotten; the person lands as themselves',
  'POST /api/sites/:key/agent on a failed import is refused, the host is not asked, nothing is attached',
  'GET /api/sites flags the unfinished import and keeps it listed; finished and created sites carry no flag',
  'a finished import (provision filed) is a workspace like any other',
  'a migrated row a host already built (it has a port) is never read as unfinished, job on record or not',
  'an unanswered invitation is still listed apart; the recovery page comes before the Inbox',
  'D1: an imported site with a build remains in the account'
])
  c.passes('S6', web, name)

// S7: My Sites says "Import not finished" and links the recovery page.
const mySites = nodeTest(['test/import-pending-dom.test.mjs'], { cwd: 'packages/site/tracy-my-sites' })
c.tapClean('S7', mySites)
c.passes('S7', mySites, 'an unfinished import says so and offers the recovery page, not Start the agent')
c.passes('S7', mySites, 'a site with no agent that is not an unfinished import still offers Start the agent')

// S8: the recovery page after a reload, from the host's status door alone.
const page = nodeTest(['test/error-next-step.test.mjs', 'test/import-recovery.test.mjs'], {
  cwd: 'packages/site/tracy-add-site'
})
c.tapClean('S8', page)
for (const name of [
  'recovery page: a failed read found on the host offers Retry',
  'recovery page: an interrupted read found on the host offers Continue',
  'recovery page: a read still going is followed, never started again',
  'recovery page: no run on the host says so and starts nothing',
  'D1: a newly opened wizard retries a failed read only when the claim has no build',
  'the address tracy-web sends names the site to recover'
])
  c.passes('S8', page, name)

// S9 + S11: the Remove door and the abandoned-import sweep against the test Postgres.
const remove = nodeTest(['test/import-remove.test.mjs'], {
  cwd: 'apps/tracy-web',
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S9-S11', remove)
for (const name of [
  'Remove of an idle unfinished import',
  'Remove while the host reports a read running',
  'Remove with the host unreachable',
  'while a Remove holds the import, the claim (start, retry, Continue), /provision and /agent are refused',
  'a provision and a Remove sent together: exactly one of them wins',
  'Remove refuses a finished import, a site built in Tracy, and a seat that may not delete',
  'sweep: an import idle for 6 h 31 min is removed through the Remove path; 6 h 29 min is kept',
  'sweep: a busy, recently active or unreachable host keeps the import for the next run',
  'sweep: the claim door pressed recently is activity too, and the existing claim sweep is unchanged'
])
  c.passes('S9-S11', remove, name)

// S10: the host half's hold, with the real startRun.
const hold = nodeTest(['test/site-hold.test.mjs'], { cwd: 'packages/site/tracy-add-site' })
c.tapClean('S10', hold)
for (const name of [
  'a read running here: the hold is refused',
  'an idle site is held, and no start, retry or Continue begins under the hold',
  'a start and a hold asked in the same moment: exactly one of them wins',
  'the sweep asks for quiet',
  'forget takes the site’s runs, cursor and code; the hold named the store keys and stays as a tombstone',
  'a hold nobody released lapses by itself',
  'only tracy-web may hold'
])
  c.passes('S10', hold, name)

// S12: the constants, and both Remove buttons.
const ttl = nodeTest(['scripts/test/import-ttl.test.mjs'])
c.tapClean('S12', ttl)
c.passes('S12', ttl, 'the abandoned-import sweep waits at least as long as the host keeps a run')
c.passes('S12', ttl, 'the host keeps a run at least as long as an upload cursor stays usable')
for (const name of [
  'recovery page: Remove on a page with no record asks first',
  'recovery page: a failed read offers Remove beside Retry',
  'the import form (not the recovery page) offers no Remove',
  'a start, retry or Continue refused because the import is being removed says so'
])
  c.passes('S12', page, name)
for (const name of [
  'an owner removes an unfinished import from its row',
  'a read still going, or a host that could not say',
  'only an owner is offered Remove'
])
  c.passes('S12', mySites, name)

// S13: the plain delete on an unfinished import is the Remove path; My Sites reads its answers.
c.passes('S13', remove, 'DELETE /api/sites/:key on an unfinished import takes the Remove path')
c.passes('S13', remove, 'DELETE /api/sites/:key on a finished import keeps the plain teardown')
const answers = nodeTest(['test/import-remove-answers.test.mjs'], { cwd: 'packages/site/tracy-my-sites' })
c.tapClean('S13', answers)
c.passes('S13', answers, 'an unreachable host on an unfinished import is a refusal')
c.passes('S13', answers, 'a read still going, and a site held by a provision or another removal')
c.passes('S13', answers, 'the sentences exist in all eight interface languages')

// S14: review pass 1.
for (const name of [
  'the hold stands until every deletion is done',
  'a clean-up that fails part-way keeps the mark and the hold',
  'DELETE /api/sites/:key/claim on an unfinished import is the Remove path',
  'Remove asks the host on the row, not today’s default'
])
  c.passes('S14', remove, name)

// S15: review pass 2.
for (const name of [
  'a failing transaction leaves every comment file and its stored object in place',
  'after the commit the comment files go',
  'sweep: a stale mark is finished through the Remove path, a fresh one is left alone',
  'two runners on the same stale mark: exactly one proceeds',
  'two sweeps at once on a stale mark: exactly one completes it'
])
  c.passes('S15', remove, name)

c.done()
