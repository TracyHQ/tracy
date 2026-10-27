/**
 * REG-PR-1043-wp-menu-labels-language: a WordPress site written in a language other than its source edition's gets every
 * menu label (wp_navigation links, submenus, menus inside template parts) in that language through the sweep's judge;
 * links and buttons to an unticked page are removed instead of relinked to Contact, and its children drafted (S1). JA Resort j6
 * asks only the dark logo (S2). A Tracy Business Joomla site written in one other language declares it, and articles of an unticked category are unpublished (S3). Each run must exit 0 with 0 failed and 0 skipped.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest([
  'apps/tracy-web/test/brief-wp-residue.test.mjs',
  'apps/tracy-web/test/brief-wordpress.test.mjs',
  'apps/tracy-web/test/brief-wp-unlink.test.mjs',
  'apps/tracy-web/test/brief-wp-kept-pages.test.mjs'
])
c.tapClean('S1', s1)

// S2
const s2 = nodeTest([
  'apps/tracy-web/test/brief-brand-joomla.test.mjs',
  'apps/tracy-web/test/fit-questions.test.mjs',
  'apps/tracy-web/test/template-profiles.test.mjs'
])
c.tapClean('S2', s2)

// S3
const s3 = nodeTest([
  'apps/tracy-web/test/brief-joomla.test.mjs',
  'apps/tracy-web/test/joomla-unticked-articles.test.mjs'
])
c.tapClean('S3', s3)
c.done()
