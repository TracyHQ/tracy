/**
 * REG-PR-940-ops-beta-screens: the /ops Beta group (Signals, Attention). Runs the case's steps: S0
 * builds the harness SPA, S1 to S4 the Chrome drive in `tasks/evidence/ops-beta-screens/verify.mjs`
 * (the real app on 127.0.0.1 against TEST_DATABASE_URL, the installed Google Chrome launched by the
 * drive itself), then the unit suite the case names. Evidence the drive writes goes to a scratch
 * folder, so a rerun leaves the committed evidence alone.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cannotRun, checks, nodeTest, run, testDatabaseUrl, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const db = testDatabaseUrl()
const env = { ...process.env, TEST_DATABASE_URL: db }

// S0: the SPA the stand serves as /ops, built from this checkout.
const build = run('pnpm', ['--filter', '@tracy/harness-web', 'build'])
c.eq('S0: harness build exit code', build.status, 0)

// S1 to S4: the drive prints one `ok   <name>` or `FAIL <name>` line per check, then its verdict.
const drive = run(process.execPath, ['tasks/evidence/ops-beta-screens/verify.mjs'], {
  env: { ...env, EVIDENCE_DIR: mkdtempSync(join(tmpdir(), 'reg-940-')) }
})
if (/Executable doesn't exist|Chromium distribution 'chrome' is not found/.test(drive.stderr))
  cannotRun('Google Chrome is not installed (the drive launches channel "chrome")')
c.eq('drive: exit code', drive.status, 0)
c.check(
  'drive: verdict PASS checks 22',
  /^verdict PASS checks 22$/m.test(drive.stdout),
  drive.stdout.slice(-400)
)
for (const name of [
  'rail: User Data Analytics is above Agents',
  'rail: growth and stuck sites are listed, template attention stays',
  'rail: Attention badge counts the two open customers',
  'signals: New users 4',
  'signals: New sites 2 (1 created, 1 imported)',
  'signals: Waitlist 2',
  'signals: Stuck counts sites (3), not attempts (4)',
  'signals: the bar names email, blog, demo and none',
  'signals: latest sign-ins newest first',
  'signals: source details retain channel, source, campaign and link',
  'signals: 14 day rows by default',
  'signals: the 7-day window draws 7 rows',
  'stuck: two open rows, oldest waiting first',
  'stuck: the row names customer, plan, source, reason and times',
  'stuck: Mark handled takes the row off Open',
  'stuck: the rail badge follows (1)',
  'stuck: one ops.handled signal by the owner',
  'stuck: Closed in period distinguishes manual handling and recovery',
  'stuck: Reopen puts the row back on Open',
  'developer: Mark handled is disabled before any press',
  'developer: the reason is on the button',
  'stranger: the door answers a bare 403'
])
  c.check(
    `drive: ${name}`,
    drive.stdout.split('\n').some((line) => line.startsWith(`ok   ${name}`))
  )

// Also: the unit suite.
const unit = nodeTest(['apps/tracy-web/test/ops-beta.test.mjs'], { env })
c.tapClean('unit', unit)
for (const name of [
  'stuckState: failures count up while open',
  'signals: by day in Vietnam time',
  'signals: any window other than 7, 14 or 30 reads as 14',
  'stuck: open rows newest first',
  'stuck: an owner closes a row by hand and opens it again'
])
  c.passes('unit', unit, name)
c.done()
