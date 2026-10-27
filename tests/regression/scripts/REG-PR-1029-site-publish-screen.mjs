/**
 * REG-PR-1029-site-publish-screen: "Publish" in a My Sites row's menu opens a tab of its own
 * (`tracy:site-publish`) and the Settings tab no longer carries the Domains section; the DNS record
 * rows of an own domain line up and both the name and the value can be copied; and the two texts
 * that said a draft copy is closed to strangers say what the router does. Runs S1 the unit and DOM
 * suites, S2 the tab in a real browser (the suite launches Playwright's Chromium itself) and S3 the
 * assistant's links. Each run must exit 0 with 0 failed (S1 and S2: 0 skipped too), and every test
 * the case names must pass.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest(
  [
    'packages/site/tracy-my-sites/test/more-settings.test.mjs',
    'packages/site/tracy-my-sites/test/site-publish-dom.test.mjs',
    'packages/core/tracy-core/test/site-publish-dom.test.mjs',
    'packages/core/tracy-core/test/ui-switches.test.mjs',
    'packages/fleet/tracy-fleet-operation/test/site-folder.test.mjs'
  ],
  { extra: ['--test-timeout=120000', '--test-force-exit'], timeoutS: 900 }
)
c.tapClean('S1', s1)
for (const [tag, name] of [
  ['TABOF', 'each tab entry opens its own tab type for the row it was pressed on'],
  ['LINE', 'the Publish line: one line for every seated row whose state the list gave'],
  ['MENU', 'the row menu has one line "Publish" right after Settings'],
  ['NOLINE', 'no such line where the list gave no state, and Settings keeps opening its own tab'],
  [
    'RUNNING',
    'while a publish runs on a site its row reads Publishing… and its menu keeps the one line "Publish"'
  ],
  ['SETTINGS', 'Settings keeps the site head and the CMS rows and has no Domains section'],
  [
    'SETTINGSDOMAIN',
    'Settings with a domain of the site’s own: the domain, its records and its actions are not drawn there'
  ],
  ['ARRIVAL', 'the arrival for one section is gone'],
  ['CHIP', 'the Settings chip follows a publish the Publish tab of the same site read'],
  ['OWNTELLING', 'the Publish tab does not answer its own telling with a second read'],
  ['SETTINGSREAD', 'Settings reads its snapshot like the Publish tab'],
  [
    'DRAFT',
    'Draft: the chip says Draft once, the card shows the address with its copy button and one Publish button'
  ],
  ['OTHERSITE', 'another site picked while a quiet re-read of the first is pending'],
  ['RECORDS', 'each record says what to create and what the last lookup found there'],
  ['SWITCH', 'an operator can hide the way in'],
  ['POLICY', "the site's Settings and Publish tabs have no switch of their own"],
  ['HINT', 'Connect domain is a switch of the Publish tab, and its hint says where the button is'],
  ['STAGING', 'AGENTS.md of an imported site says the staging copy is open to anyone who has its address'],
  ['NOADDRESS', 'an address that is missing or is not one is never written into the staging sentence'],
  [
    'AUTHORED',
    'a folder whose AGENTS.md was written with the earlier staging sentence is left as the team has it'
  ]
])
  c.passes(`S1 ${tag}`, s1, name)

// S2
const s2 = nodeTest(
  [
    'packages/site/tracy-site-tabs/test/e2e/site-publish-screen.test.mjs',
    'packages/site/tracy-site-tabs/test/e2e/tab-loading.test.mjs'
  ],
  { extra: ['--test-timeout=120000', '--test-force-exit'], timeoutS: 900 }
)
c.tapClean('S2', s2)
for (const [tag, name] of [
  ['BROWSERMENU', 'the row menu: Settings, and directly below it one line "Publish"'],
  [
    'OWNTAB',
    '"Publish" opens a tab of its own for that site; Settings is another tab and has no Domains section'
  ],
  [
    'FOLLOW',
    'a publish pressed on the Publish tab is followed by the chip of the Settings tab of the same site'
  ],
  ['RETARGET', 'the open Publish tab follows a retarget'],
  ['CONNECT', 'Connect domain is the Owner’s alone, and the `site-connect-domain` switch hides it'],
  ['ROWS', 'DNS record rows: each label shares a baseline with its value'],
  [
    'COPYNAME',
    'the copy button of Record name writes the name, and the one of Record value writes the value'
  ],
  ['FOCUS', 'focus on the Publish tab is one 1px stroke, never a halo'],
  ['LOADING', 'every site tab shows one bar and no loading words']
])
  c.passes(`S2 ${tag}`, s2, name)

// S3: the assistant's links. The other tests of this file need TEST_DATABASE_URL and skip without
// it; they are not this case's, so a skip here is not a failure.
const s3 = nodeTest(['apps/tracy-web/test/assistant.test.mjs'], {
  extra: ['--test-timeout=120000', '--test-force-exit'],
  timeoutS: 300
})
c.tapClean('S3', s3, { noSkip: false })
c.passes(
  'S3 ASSISTANT',
  s3,
  'navigationFor: Add site is always offered; each own site gets its workspace and tabs'
)
c.done()
