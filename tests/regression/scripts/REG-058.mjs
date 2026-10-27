/**
 * REG-058: Create site asks the template's own questionnaire (a popup until #998, the "Customize your site"
 * sheet since), and the answers travel by question id. Runs the three steps of the case: S1 the brief unit suites, S2 the sites door
 * against the test Postgres (TEST_DATABASE_URL), S3 the sheet end to end in a real browser (the
 * suite launches Playwright's Chromium itself). Each run must exit 0 with 0 failed and 0 skipped,
 * and every test the case names must pass.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()

// S1
const s1 = nodeTest([
  'packages/site/tracy-add-site/test/site-brief.test.mjs',
  'apps/tracy-web/test/site-brief.test.mjs',
  'apps/tracy-web/test/site-brief-normalize.test.mjs'
])
c.tapClean('S1', s1)
for (const name of [
  'a name typed into the name question is the name as typed',
  'the languages picked in the language question are the site languages, as picked',
  'the sector answer is the sector'
])
  c.passes('S1', s1, name)

// S2
const s2 = nodeTest(['apps/tracy-web/test/sites-route.test.mjs'], {
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S2', s2)
c.passes('S2', s2, 'POST /api/sites/brief/rewrite: capped per person per hour')
c.passes('S2', s2, 'POST /api/sites with answers by question id')

// S3 (since #998 the questions are asked in the "Customize your site" sheet, not a popup).
// No `--test-timeout`: it bounds the whole FILE as well as each test, and the file outgrew it —
// 20 tests at #998, 61 after #1019, ~410 s on a loaded Mac — so every run was cancelled part way
// (09/10/2026: `testTimeoutFailure` at create-brief-sheet.test.mjs:1:1 after 120 s). The run's own
// bound (`timeoutS`, 600 by default) is raised to leave room above those 410 s.
const s3 = nodeTest(['packages/site/tracy-add-site/test/e2e/create-brief-sheet.test.mjs'], {
  timeoutS: 1200
})
c.tapClean('S3', s3)
for (const name of [
  "the sheet slides over the panel with the template's own questions",
  'another template asks other questions',
  'Create site sends the answers with the hash of the set they answer; a hidden answer does not travel',
  'when the questions cannot load the card says so',
  'AI rewrite is offered on the long-text question and not on the others; Undo puts the words back',
  'a rewrite the door refuses with 429',
  'a rewrite the door refuses with 503',
  'a rewrite that comes back after the customer edited the text'
])
  c.passes('S3', s3, name)
c.done()
