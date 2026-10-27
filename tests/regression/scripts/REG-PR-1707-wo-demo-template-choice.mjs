/**
 * REG-PR-1707-wo-demo-template-choice: the Build card's CMS and template selects come from Tracy's list, and
 * keeping Tracy's default sends nothing.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const PKG = 'packages/wo/website-opportunities'
const s1 = nodeTest(
  [`${PKG}/test/ui-tracy-view-models.test.mjs`, `${PKG}/test/plugins-builder-tracy.test.mjs`],
  {
    env: { ...process.env, TEST_DATABASE_URL: db }
  }
)
c.tapClean('S1', s1)
c.passes('S1', s1, 'Template choice: kept as Tracy’s default, the request names nothing')
c.passes('S1', s1, 'Template choice: a CMS alone takes that CMS’s default; a template names itself')
c.passes('S1', s1, 'Template choice: no options (Tracy did not answer) shows no chooser')
c.passes('S1', s1, 'the template choice is Tracy’s own list of what a demo may be built with')
c.done()
