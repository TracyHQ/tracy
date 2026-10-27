/**
 * REG-091: the WordPress themes' shared contact handler mails the site's own recipient, never
 * admin_email. S1/S2: the contact suite in real PHP (local `php`, or the PHP image through
 * `php-env.mjs`) exits 0 with 0 failed, 0 skipped and every test passing, at least 73 of them (one
 * discovery case plus eight for each of the nine themes). S3: the shared handler holds no line
 * reading `get_option( 'admin_email' )`.
 */
import { phpEnv } from './php-env.mjs'
import { checks, countLines, nodeTest } from './lib.mjs'

const c = checks()

const php = phpEnv()
process.stdout.write(`# S1 runs PHP with: ${php.how}\n`)
let s1
try {
  s1 = nodeTest(['packages/cms/tracy-wordpress-theme/test/tracy-contact.test.mjs'], { env: php.env })
} finally {
  php.cleanup()
}
c.tapClean('S1', s1)
c.eq('S2: # pass equals # tests', s1.counts.pass, s1.counts.tests)
c.check('S2: # tests is at least 73', s1.counts.tests >= 73, s1.counts.tests)

c.eq(
  "S3: lines of src/tracy/functions.php reading get_option( 'admin_email' )",
  countLines('packages/cms/tracy-wordpress-theme/src/tracy/functions.php', "get_option( 'admin_email' )"),
  0
)
c.done()
