/**
 * REG-PR-972-ops-waitlist: `/ops` › Beta › Waitlist and the WordPress relay that feeds it. Runs the
 * case's steps: S0 builds the harness SPA, S1 to S5 the drive in `tasks/evidence/ops-waitlist/verify.mjs`
 * (the real app on 127.0.0.1 against TEST_DATABASE_URL, the relay called as the tracy.ai plugin calls
 * it, the installed Google Chrome launched by the drive itself), then the unit suites the case
 * names. Evidence the drive writes goes to a scratch folder, so a rerun leaves the committed evidence alone.
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

// S1 to S5: one `ok   <name>` or `FAIL <name>` line per check, then the verdict.
const drive = run(process.execPath, ['tasks/evidence/ops-waitlist/verify.mjs'], {
  env: { ...env, EVIDENCE_DIR: mkdtempSync(join(tmpdir(), 'reg-972-')) }
})
if (/Executable doesn't exist|Chromium distribution 'chrome' is not found/.test(drive.stderr))
  cannotRun('Google Chrome is not installed (the drive launches channel "chrome")')
c.eq('drive: exit code', drive.status, 0)
c.check(
  'drive: verdict PASS checks 21',
  /^verdict PASS checks 21$/m.test(drive.stdout),
  drive.stdout.slice(-400)
)
for (const name of [
  'relay: deliver false answers stored',
  'relay: a full form with utm is mailed',
  'relay: the hourly retry without utm moves nothing and keeps the source',
  'relay: only the full form was mailed, once',
  'rail: Waitlist sits under Attention in Beta',
  'signals: the Waitlist tile is a link to the list',
  'signals: a click opens /ops/waitlist in the page',
  'waitlist: 30 days by default',
  'waitlist: 4 on the list, 1 of them both turned away and sent the form',
  'waitlist: 2 turned away, 3 sent the form, 1 signed in later',
  'waitlist: one row per address, newest first',
  'waitlist: turned away twice, last time by Google',
  'waitlist: the form answers as the plugin sent them',
  'waitlist: the form page source is shown',
  'waitlist: the confirmation went out',
  'waitlist: a form held back reads not sent yet',
  'waitlist: a form from before this PR says its answers were not kept',
  'waitlist: someone who came in later shows when',
  'waitlist: the 7-day window still lists the four',
  'developer: a read-only seat reads the list',
  'stranger: the door answers a bare 403'
])
  c.check(
    `drive: ${name}`,
    drive.stdout.split('\n').some((line) => line.startsWith(`ok   ${name}`))
  )

// Also: the unit suites.
const unit = nodeTest(
  ['apps/tracy-web/test/ops-beta.test.mjs', 'apps/tracy-web/test/whitelist-confirmation.test.mjs'],
  {
    env
  }
)
c.tapClean('unit', unit)
for (const name of [
  'waitlist: one row per address, turned away and the form joined, newest first; staff only',
  'waitlist: nobody in the window answers an empty list',
  'the form answers are kept for /ops; an identical retry changes nothing, new answers do',
  'the form page utm_* are cleaned and kept; a retry without them keeps the source',
  'deliver: false keeps the form and sends nothing; the later call mails as before'
])
  c.passes('unit', unit, name)
c.done()
