/**
 * REG-027: an invitation opened while signed in with another address offers a sign-out-and-sign-in
 * form, not a link back to the same refusal. Runs the two in-process suites with no database
 * (`env -u TEST_DATABASE_URL`) and requires each test that carries one of the case's expectations.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const env = { ...process.env }
delete env.TEST_DATABASE_URL
const r = nodeTest(
  ['apps/tracy-web/test/invite-account-switch.test.mjs', 'apps/tracy-web/test/seats-pages.test.mjs'],
  { env }
)
c.tapClean('S1', r)
for (const name of [
  // 403 with no cookie, and the action leads to the sign-in door, not the refusal.
  '#799: the action on the wrong-account page leads to the sign-in door, not back to the refusal',
  'loading the page signs nobody out: no Set-Cookie',
  // Posting the form answers 303 to /login and clears tracy_sess, tracy_site and tracy_tok_*.
  'the action is a native POST to /auth/signout carrying the sign-in address, and clears every cookie',
  // The refusal runs one statement only.
  'the refusal runs its rate query and nothing else',
  // Foreign origin / wrong body type refused, off-origin next sent home.
  'a sign-out post from anywhere but this origin is refused and clears nothing',
  'a sign-out post with a body type the door does not read is refused and clears nothing',
  '`next` on the sign-out form cannot leave this origin, whatever is posted',
  // The page's one action: the form, its hidden next, its labelled button, in every language.
  'wrongAccountPage: one native form posts to /auth/signout and carries the sign-in address as `next`',
  'wrongAccountPage: the form wraps the paragraph',
  'wrongAccountPage: every language renders the same form, with its own translated button'
])
  c.passes('S2', r, name)
c.done()
