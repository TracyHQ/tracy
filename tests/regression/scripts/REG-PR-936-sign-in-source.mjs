/**
 * REG-PR-936-sign-in-source: a first sign-in records the utm_* of the link it came from. Runs the
 * case's steps: S0 to S6 the Chrome drive in `tasks/evidence/sign-in-source/verify.mjs` (it builds
 * the real app on 127.0.0.1 against TEST_DATABASE_URL and launches the installed Google Chrome
 * itself), then the three unit suites the case names. Evidence the drive writes goes to a scratch
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

// S0 to S6: the drive prints one `ok   <name>` or `FAIL <name>` line per check, then its verdict.
const drive = run(process.execPath, ['tasks/evidence/sign-in-source/verify.mjs'], {
  env: { ...env, EVIDENCE_DIR: mkdtempSync(join(tmpdir(), 'reg-936-')) }
})
if (/Executable doesn't exist|Chromium distribution 'chrome' is not found/.test(drive.stderr))
  cannotRun('Google Chrome is not installed (the drive launches channel "chrome")')
c.eq('S0: drive exit code', drive.status, 0)
c.check(
  'S0: drive verdict PASS checks 25',
  /^verdict PASS checks 25$/m.test(drive.stdout),
  drive.stdout.slice(-400)
)
for (const name of [
  'S1 / with utm lands on /login carrying the utm',
  'S1 the email form holds the four utm fields',
  'S1 the signal carries the source',
  'S1 the account carries the same source',
  'S1 the Telegram message ends with the Source line',
  'S2 script off: the code step keeps the source on the resend form',
  'S2 script off: the signal carries medium blog and its content',
  'S3 /new/ sends to /login with the utm inside next',
  'S3 the form reads the source out of next',
  'S3 gate on: member badge and the demo source',
  'S4 / with no utm is the bare /login',
  'S4 no utm fields on the page',
  'S4 the signal has no source key',
  'S4 no Source line in the message',
  'S5 root keeps only cleaned utm (no ref, no next)',
  'S5 the form holds the cleaned values',
  'S5 no script ran from the link',
  'S6 the demo banner link opens the card and carries the demo campaign',
  'S6 the Build press keeps the four utm on /new/ and drops open/provider',
  'S6 /new/ sends to /login with the demo utm inside next',
  'S6 the form reads the demo source',
  'S6 the first sign-in records the demo and the template'
])
  c.check(
    `drive: ${name}`,
    drive.stdout.split('\n').some((line) => line.startsWith(`ok   ${name}`))
  )

// Also: the unit suites.
const unit = nodeTest(
  ['apps/tracy-web/test/sign-in-source.test.mjs', 'apps/tracy-web/test/build-with-tracy-demo.test.mjs'],
  { env }
)
c.tapClean('unit', unit)
c.passes('unit', unit, 'spec 4.7 #39: the link carries the campaign and the template as utm_content')
c.passes('unit', unit, 'the card folds into the pill on close')
const page = nodeTest(['packages/web/tracy-design-page/test/templates.test.mjs'])
c.tapClean('design page', page)
c.passes('design page', page, 'Create with carries the four utm_* of this page, and only them')
c.done()
