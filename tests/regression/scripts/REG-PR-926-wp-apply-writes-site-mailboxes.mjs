/**
 * REG-PR-926-wp-apply-writes-site-mailboxes: Apply writes a WordPress site's own mailboxes (option
 * tracy_contact_to and contact.email of tracy_site_identity). Runs S2 and S3 and checks the sweep
 * writes options through content.update (S4).
 */
import { checks, countLines, nodeTest } from './lib.mjs'

const c = checks()
const s2 = nodeTest(['apps/tracy-web/test/brief-wp-residue.test.mjs'], {
  pattern:
    'contact form sends to|account that pressed Apply, which is never shown|option already right|no recipient and asked nothing'
})
c.tapClean('S2', s2, { pass: 4 })
for (const name of [
  "the theme's own contact form sends to the mailbox the customer typed",
  'with no mailbox typed, the form sends to the account that pressed Apply, which is never shown',
  'an option already right is not written again, a nested identity keeps its shape, and one that cannot be read is said and left',
  'a sweep with no recipient and asked nothing about contacts writes no option'
])
  c.passes('S2', s2, name, 1)
c.tapClean(
  'S3',
  nodeTest(['apps/tracy-web/test/brief-wordpress.test.mjs', 'apps/tracy-web/test/brief-wp-residue.test.mjs'])
)
const options = countLines('apps/tracy-web/src/sites/brief-engines/wp-residue.js', "kind: 'option'")
c.check('S4 grep -c "kind: \'option\'" wp-residue.js >= 1', options >= 1, options)
c.done()
