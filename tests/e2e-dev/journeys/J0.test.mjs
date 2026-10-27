// J0 — identity smoke. A cookie minted for a run account is accepted, `/auth/me` names EXACTLY
// that account (it can answer 200 with `email: null`, so a status alone proves nothing), and the
// cookie the server itself writes carries the attributes the session depends on.

import { test } from 'node:test'
import { Client } from '../lib/api.mjs'
import { mintCookie } from '../lib/dev.mjs'
import { ENV, runEmail } from '../lib/env.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { cookieAttributes } from '../lib/redact.mjs'
import { noteAccount } from '../lib/run-site.mjs'

test('J0 identity smoke', async (t) => {
  const { runId, manifest } = runContext()
  await journey(t, { id: 'J0' }, async ({ details }) => {
    const email = runEmail(runId, 'owner')
    // The first door this account touches creates its row; the manifest says so before it does.
    noteAccount(manifest, email)

    const owner = new Client({ name: 'owner', email, token: await mintCookie(email) })
    const me = await owner.get('/auth/me')
    details.authMe = {
      status: me.status,
      ms: me.ms,
      emailMatches: me.json?.email === email,
      cfMitigated: me.headers.get('cf-mitigated')
    }
    check(me.status === 200, `/auth/me answered ${me.status}`)
    check(
      me.json?.email === email,
      `/auth/me named ${JSON.stringify(me.json?.email)}, not the minted account`
    )

    // No cookie: the same door must not name anyone.
    const nobody = await new Client({ name: 'stranger' }).get('/auth/me')
    details.noCookie = { status: nobody.status, email: nobody.json?.email ?? null }
    check(nobody.json?.email == null, `/auth/me without a cookie named ${JSON.stringify(nobody.json?.email)}`)

    // A session minted more than an hour ago is renewed by `/auth/me`, which makes the server write
    // its own Set-Cookie — the only way to read the attributes it really sets without an OTP.
    const aged = new Client({ name: 'owner-aged', email, token: await mintCookie(email, { ageS: 2 * 3600 }) })
    const renewed = await aged.get('/auth/me')
    const line = renewed.headers.getSetCookie().find((l) => l.startsWith(`${ENV.sessionCookie}=`))
    check(line, '/auth/me did not renew a two-hour-old session (no Set-Cookie)')
    const { attributes } = cookieAttributes(/** @type {string} */ (line))
    details.cookieAttributes = attributes
    check(attributes.httponly === true, 'session cookie is not HttpOnly')
    check(attributes.secure === true, 'session cookie is not Secure')
    check(
      String(attributes.samesite).toLowerCase() === 'lax',
      `session cookie SameSite=${attributes.samesite}`
    )
    const domain = String(attributes.domain ?? '').replace(/^\./, '')
    check(
      domain === ENV.siteDomain,
      `session cookie Domain=${attributes.domain ?? '(host-only)'}, expected ${ENV.cookieDomain}`
    )
  })
})
