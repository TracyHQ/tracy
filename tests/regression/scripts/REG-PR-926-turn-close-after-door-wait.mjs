/**
 * REG-PR-926-turn-close-after-door-wait: a chat turn whose moment or seal the host ends after the
 * door stopped waiting is still closed with the commit, audited once, with the seal's outside
 * commits kept. Runs S2 and S3 against the Postgres in TEST_DATABASE_URL (run.needs postgres) and
 * requires all nine 'L31:' tests and all five door-follow-up tests by name. The "before the fix"
 * line of the case is history (red runs at 832a24c20 / 59bbb0759), not re-run here.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

testDatabaseUrl()
const c = checks()
const s2 = nodeTest(['apps/tracy-web/test/sites-route.test.mjs'], { pattern: 'L31|turn|moment' })
c.tapClean('S2', s2)
const L31 = [
  'L31: a moment the host ends after the door stopped waiting still closes its turn with the sha, the answer and one audit line',
  'L31: a moment the host fails after the door stopped waiting closes nothing; one the host never ends is given up after its bound',
  'L31: a late moment of a turn that stopped twice adds its files but never writes over the newer close',
  'L31: a seal the host ends after the door stopped waiting keeps its outside commits',
  'L31: the follow-up is filed with the job, before the door waits',
  'L31: a moment that fails late because the site was busy is asked for once more, and that one closes the turn',
  'L31: a site that stays busy gets at most two more moment jobs',
  'L31: the moment door answers within its wait even when the host stops answering mid-job',
  "L31: a seal that ends after 12 s of the door's wait counts as late"
]
for (const name of L31) c.passes('S2', s2, name, 1)
c.eq("S2: tests named 'L31:' that passed", s2.passed.filter((t) => t.startsWith('L31:')).length, 9)

const s3 = nodeTest(['apps/tracy-web/test/door-follow-up.test.mjs'])
c.tapClean('S3', s3, { pass: 5 })
for (const name of [
  'the job row and its follow-up are written together, in one statement',
  'two callers racing to follow one job through: one audit line, one close',
  'work that throws leaves the job owed, and it is done when tried again',
  'the sweep: a row whose work keeps throwing is tried again, then given up after the bound, said once',
  'the sweep asks a host that did not answer once per run, and holds each row it takes'
])
  c.passes('S3', s3, name, 1)
c.done()
