/**
 * REG-PR-1723-wo-maps-menu-link: the menu link Google Maps lists reaches the profile's menus as a Maps link.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()
const s1 = nodeTest(['packages/wo/website-opportunities/test/google-maps-menu-link.test.mjs'])
c.tapClean('S1', s1)
c.passes('S1', s1, 'the place lookup returns the menu link Google lists for the place')
c.passes('S1', s1, 'a menu link that is not a public https page is dropped')
const s2 = nodeTest(['apps/tracy-web/test/website-opportunities-google-maps.test.mjs'], {
  env: { ...process.env, TEST_DATABASE_URL: db }
})
c.tapClean('S2', s2)
c.passes(
  'S2',
  s2,
  'shared Research collects menu20 separately, preserves official Google and carries menu sources to brief/demo'
)
c.done()
