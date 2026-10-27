/**
 * REG-PR-1047-joomla-unticked-buttons-hide: on Joomla, a button or link to a page the customer unticked is taken off through
 * `empty_links` where Claude Cowork 0.24.4 reviewed its layout (`emptyLink`), left and said elsewhere, and never relinked to
 * Contact (S1); the seeder's contract write carries `empty_links` (S2); every Joomla pin is 0.24.4 in both catalogues (S3).
 */
import { readFileSync } from 'node:fs'
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest(['apps/tracy-web/test/brief-joomla.test.mjs'])
c.tapClean('S1', s1)
for (const name of [
  'a link in a page that leads to a page the customer unticked is taken off, before any language copies it',
  'a link whose layout the site has not reviewed is left as it is and said, never sent to the contact page',
  'only the reviewed links of a page are taken off; the others are left and said',
  'a link the site will not take off is set aside by name and the others still go',
  'a link the words could not move is not asked again, and one a person changed since is left to them'
])
  c.passes('S1', s1, name)

// S2
const s2 = nodeTest(['packages/cms/tracy-seeder/test/apply-joomla-contract.test.mjs'])
c.tapClean('S2', s2)
c.passes('S2', s2, 'links to take off are sent as empty_links, alone or beside changes')
c.passes('S2', s2, 'a mapping without links to take off keeps the request it always had')
c.passes('S2', s2, 'a link the site has not marked, or one also changed, is refused by name before any write')

// S3
const files = [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]
const [a, b] = files.map((f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8'))
c.check('S3: both quickstarts.json identical', a === b)
const joomla = Object.values(JSON.parse(a)).filter((e) => e?.platform === 'joomla' && e.cowork)
c.check('S3: Joomla pins found', joomla.length > 0, joomla.length)
c.check(
  'S3: every Joomla pin is 0.24.4',
  joomla.every((e) => e.cowork.version === '0.24.4' && e.cowork.url.includes('/joomla-v0.24.4/')),
  joomla.map((e) => e.cowork.version)
)
c.done()
