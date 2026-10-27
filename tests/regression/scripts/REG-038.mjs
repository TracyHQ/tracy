/**
 * REG-038: transactional mail — sign-in code lifetime and rate-limit copy, invitation links, the
 * HTML each mail reaches the provider with, and wp-ja-morgan's Contact form that cannot be turned
 * into a mail relay. Runs the three steps of the case: S1 the tracy-web suites with
 * TEST_DATABASE_URL unset, S2 the WordPress contact-mail suite in real PHP (local `php`, or the PHP
 * image through `php-env.mjs`), S3 the lane gateway's copy suite; each must exit 0 with 0 failures
 * and 0 skipped, and every test the case names must pass.
 */
import { phpEnv } from './php-env.mjs'
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1: with TEST_DATABASE_URL unset.
const env1 = { ...process.env }
delete env1.TEST_DATABASE_URL
const s1 = nodeTest(
  [
    'apps/tracy-web/test/transactional-mail.test.mjs',
    'apps/tracy-web/test/access-email-design.test.mjs',
    'apps/tracy-web/test/web-languages.test.mjs'
  ],
  { env: env1 }
)
c.tapClean('S1', s1)
for (const name of [
  'F-S1-005: the login page, the local preview and the mail all state CODE_TTL_MS',
  'F-S1-005: the rate-limit sentence is the restricted one, stored whole in each of the eight languages',
  'F-S1-005: every consumer of the rate-limit sentence prints the restricted text',
  'F-S1-005 state matrix: an inbox that was never mailed a code',
  'F-S1-005 state matrix: a code used up by wrong tries',
  'F-S1-005 state matrix: a code already used to sign in',
  'F-S1-005 state matrix: a code past its lifetime',
  'F-S1-005 state matrix: a code replaced by "Send a new code"',
  'F-S1-005 state matrix: the latest valid code is kept through the refusal',
  'F-S1-006: the "request sent" page makes no promise of a reply by mail, in any language',
  'F-S1-006: reopening the join page shows what the note says: waiting, approved, and nothing for a declined request',
  'every mail that carries a link refuses an address that does not parse, and keeps one that does',
  'F-S1-010: an origin that makes an unopenable link mails nothing and answers 202 notified:false',
  'F-S1-010 + F-S1-017: inviting Tracy staff mails the /ops/invite link, HTML and text (no account yet)',
  'F-S1-010 + F-S1-017: inviting Tracy staff mails the /ops/invite link, HTML and text (has an account)',
  'F-S1-010: the mailed link sends a signed-out reader to sign in and back to the same link',
  'F-S1-010: the invited account accepts its OWN pending grant through the mailed link',
  'F-S1-010: another account, a revoked grant or no grant opens nothing through the same link',
  'F-S1-017: the team invitation reaches the provider with the HTML the builder wrote',
  'F-S1-017: a join request reaches every admin, through the notifier',
  'F-S1-017: the removal code reaches the caller with the HTML the builder wrote',
  'F-S1-017: a rejected team invitation keeps the seat and answers notified:false',
  'F-S1-010: a staff invitation the provider rejects keeps the grant and answers 202 notified:false',
  'F-S1-017: a removal code the provider refuses still answers 502 MAIL_NOT_SENT'
])
  c.passes('S1', s1, name)

// S2: real PHP.
const php = phpEnv()
process.stdout.write(`# S2 runs PHP with: ${php.how}\n`)
let s2
try {
  s2 = nodeTest(['packages/cms/tracy-wordpress-theme/test/wp-contact-mail.test.mjs'], { env: php.env })
} finally {
  php.cleanup()
}
c.tapClean('S2', s2)
for (const base of ['overlays', 'src'])
  for (const name of [
    '"send me a copy" selects no recipient, however it is posted',
    'a valid message goes once, to the administrator only',
    'a filled, malformed or missing honeypot sends nothing',
    'a missing, empty, non-string or oversized field is refused before any mail',
    'a missing, wrong or non-string nonce is refused before anything is read',
    'no usable administrator address: nothing is sent',
    'one client address sends 5 an hour; the next is refused',
    'headers a visitor controls do not move them to another bucket',
    'a store that cannot be written refuses the message instead of letting it through',
    'a send the mailer reports as failed is never reported as sent',
    'a request left over from the hour before cannot clear or reopen this hour’s places',
    'Quick Contact spends the same hourly count and is refused once it is used up'
  ])
    c.passes('S2', s2, `${base}: ${name}`)

// S3
const s3 = nodeTest(['vendor/tracy/dsh-passwords/test/tracy/transactional-mail-copy.test.ts'], {
  extra: ['--import', 'tsx']
})
c.tapClean('S3', s3)
c.passes('S3', s3, 'I3: the code page states no lifetime of its own, in any of the eight languages')
c.passes(
  'S3',
  s3,
  'I3: the six catalogue files hold no unsourced translation of it: those languages read the English sentence'
)
c.done()
