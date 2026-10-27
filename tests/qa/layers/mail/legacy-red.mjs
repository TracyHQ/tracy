// Which recorded mutations (red.mjs) each adapted suite is expected to turn red, and the exact
// tests that must turn red under each. Measured by running the suite on a scratch copy under the
// mutation: a pair is listed only for tests that pass on the real tree and fail with an assertion
// on the mutant. The runner re-proves every named test on every --prove-red run: a named test that
// does not turn red leaves the suite case PENDING. A suite earns PASS only for the tests named
// here; its other tests are judged green but not RED-proven. Suites that need PostgreSQL cannot
// run here, so they have no entry.
export const LEGACY_RED = {
  'access-email-design': {
    'drop-escaping': [
      '\\#794: a workspace invitation prints its action link escaped, and refuses one that is not http(s)'
    ]
  },
  'notification-mail': {
    'drop-escaping': ['unlinkedHtml escapes first and breaks only @ and . between letters or digits'],
    'safeurl-accepts-anything': ['data is escaped and a button that goes nowhere is refused']
  },
  'transactional-mail': {
    'drop-escaping': [
      'F-S1-010: both invitation builders print the action link they are given, in text and HTML'
    ],
    'drop-expiry': ['F-S1-005 state matrix: a code past its lifetime'],
    'signin-keep-spent-code': ['F-S1-005 state matrix: a code already used to sign in']
  },
  'audit-mail-fixes': {
    'person-line-drops-address': [
      '3: the workspace mails name the inviter "Name (email)", local part when nameless'
    ]
  },
  'invite-expiry': {
    'drop-expiry': [
      'F-S3-017: a link 7 days and 1 second old is refused and nothing is written',
      'F-S3-017: an expired link says so to a signed-out reader too, instead of sending them to sign in',
      'F-S3-017: the age is read against the clock the door is given, to the second',
      'F-S3-017: an expired link takes away nothing a person already holds',
      'F-S3-017: the expired page states the lifetime in each of the eight languages',
      'F-S3-017: inviting again while the seat still waits sends a new link, and the row stays as it was'
    ],
    'invite-ignore-signature': [
      'F-S3-017: a forged, broken or foreign token is still refused whatever its age'
    ]
  },
  'mail-unavailable': {
    'wrong-recipient': [
      'F-S1-009: with local preview on, sign-in works from the log and the page, as it did'
    ],
    'transport-ignore-status': [
      'F-S1-009: the Resend transport is available, sends text and HTML, and a provider refusal is not a success'
    ]
  },
  'notification-letter-languages': {
    'ignore-language': [
      'team.join_request: its own words in each of the eight languages',
      'team.join_answered: its own words in each of the eight languages',
      'team.approved: its own words in each of the eight languages',
      'team.declined: its own words in each of the eight languages',
      'team.invite_accepted: its own words in each of the eight languages',
      'team.invite_declined: its own words in each of the eight languages',
      'team.joined: its own words in each of the eight languages',
      'team.removed: its own words in each of the eight languages',
      'team.role_changed: its own words in each of the eight languages',
      'team.left: its own words in each of the eight languages',
      'team.invite_cancelled: its own words in each of the eight languages',
      'team.site_restored: its own words in each of the eight languages',
      'team.site_deleted: its own words in each of the eight languages',
      'team.site_renamed: its own words in each of the eight languages',
      'comment.mention: its own words in each of the eight languages',
      'comment.reply: its own words in each of the eight languages',
      'comment.resolved: its own words in each of the eight languages',
      'comment.reopened: its own words in each of the eight languages',
      'teamInviteMail: its own words in each of the eight languages',
      'joinRequestMail: its own words in each of the eight languages'
    ]
  },
  'site-mail-message': {
    'bcc-stays-in-message': [
      'mode tracy: From rewritten with the display name kept, Reply-To = original From, Bcc gone',
      'mode own-smtp: From is the site own; Bcc still removed'
    ]
  },
  'site-mail-policy': {
    'sitemail-own-cms-relays': ['refusals: draft first, then off/own-cms']
  },
  'site-mail-smtp': {
    'smtp-never-implicit-tls': ['framing helpers']
  },
  'site-mail-token': {
    'sitemail-token-ignores-label': [
      'the token is the one the fleet computes with openssl',
      'verify accepts the exact token only'
    ]
  }
}
