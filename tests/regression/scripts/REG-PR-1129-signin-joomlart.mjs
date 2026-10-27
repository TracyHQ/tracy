/**
 * REG-PR-1129-signin-joomlart: "Login with JoomlArt" + template landing + quickstart download.
 * S1: the identity doors — a correctly signed aMember answer signs in, a wrong signature / unknown
 * nonce / replay / unverified email / malicious next is refused, the beta rule admits a paid
 * entitlement, and a round for /new?template=<id> leaves the template waiting on the account.
 * S2: /new?template=<id> — signed out goes to /login and back; signed in lands on one page with
 * Build (the creation-workspace intent) and Download (the quickstart door); a template Tracy does
 * not offer gets the member-area page; a broken catalogue says try again; the root sends a person
 * with a template waiting to that page once.
 * S3: the download door — 401 without a session, 404 for an unknown/unoffered tag, the zip streams
 * with its headers, a GitHub 302 is followed without the token, a foreign host is refused, the
 * hour cap answers 429.
 * S4: the three migrations are present and the doors are in the API reference snapshot.
 * The mechanism is exercised in-process with the test suite's own signer standing in for aMember —
 * no stand, no network; the real round trip against aMember is the dev acceptance in the plan.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, nodeTest } from './lib.mjs'
const c = checks()
const WEB = 'apps/tracy-web'
const files = (names) => names.map((n) => `test/${n}`)

const identity = nodeTest(files(['identity-joomlart.test.mjs', 'joomlart-sso.test.mjs']), { cwd: WEB })
c.tapClean('S1: identity doors', identity, { noSkip: false })
c.passes('S1', identity, 'callback: a correctly signed answer')
c.passes('S1', identity, 'callback: a replay of the same signed answer loses')
c.passes('S1', identity, 'callback: email_verified=false is refused')
c.passes('S1', identity, 'callback: next comes from the state row through safePath')
c.passes('S1', identity, 'beta gate on: a paid, unexpired entitlement admits')
c.passes('S1', identity, 'callback: a round started for /new?template=<id> leaves that template waiting')

const publicSignIn = nodeTest(files(['public-signin.test.mjs']), { cwd: WEB })
c.tapClean('S5: public sign-in without membership', publicSignIn)
c.passes('S5', publicSignIn, 'public email sign-in with legacy BETA_GATE=on')
c.passes('S5', publicSignIn, 'public email sign-in with legacy BETA_GATE=off')
c.passes('S1', identity, 'legacy beta gate on: free, expired and absent memberships')

const otherDoors = nodeTest(files(['discord-doors.test.mjs', 'security-headers.test.mjs']), { cwd: WEB })
c.tapClean('S6: public linking and login CSP', otherDoors)
c.passes('S6', otherDoors, 'legacy beta gate on: a non-member receives a code and can link Discord')
c.passes('S6', otherDoors, 'public Google sign-in does not allow a whitelist redirect in form-action')

const landing = nodeTest(files(['template-intent.test.mjs']), { cwd: WEB })
c.tapClean('S2: template landing', landing)
c.passes('S2', landing, 'a signed-out person is sent to sign in')
c.passes('S2', landing, 'in Tracy Desktop, a signed-in person lands on the page with Build and Download')
c.passes('S2', landing, 'on the web, a signed-in person gets the same Build and Download')
c.passes('S2', landing, 'a template Tracy does not offer gets the member-area page')
c.passes('S2', landing, 'a catalogue that cannot be read says try again')
c.passes('S2', landing, 'in Tracy Desktop, a signed-in person with a template waiting is sent from the root')
c.passes('S2', landing, 'on the web, the landing leaves the template waiting for the app')

const download = nodeTest(files(['quickstart-download.test.mjs']), { cwd: WEB })
c.tapClean('S3: quickstart download door', download, { noSkip: false })

for (const m of ['086-identity-entitlement.sql', '087-quickstart-download.sql', '088-desktop-intent.sql'])
  c.check(`S4: migration ${m} present`, existsSync(join(ROOT, WEB, 'src/db/migrations', m)))
const snapshot = readFileSync(join(ROOT, WEB, 'api-reference.snapshot.json'), 'utf8')
for (const door of [
  '/signin/joomlart',
  '/signin/joomlart/callback',
  '/api/quickstarts/{template}/{cms}/quickstart.zip'
])
  c.check(`S4: snapshot names ${door}`, snapshot.includes(door))
c.done()
