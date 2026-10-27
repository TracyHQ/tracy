// J14 — a seat key and the public API, on the run's shared WordPress site. The owner mints a Bearer
// key through `POST /api/me/keys` (`apps/tracy-web/src/keys/route.js`) — no screen calls that door
// yet, so the journey calls it the way a screen would, from the workspace origin — and a program
// uses it on the api host (`/v1/*`, `apps/tracy-web/src/lib/v1-routes.js`):
//   1. Mint: 201 with the key once; `GET /api/me/keys` lists it without any secret.
//   2. `/v1/me` names the owner, the site and the scopes; `/v1/sites/:key` describes the site.
//   3. The cookie is not a credential on `/v1` (401 with the session and no Bearer).
//   4. Revoke: `DELETE /api/me/keys/:id` 204, and the same key is refused on `/v1/me` at once.
// The key lives in this process's memory only and never reaches the report.

import { test } from 'node:test'
import { Client } from '../lib/api.mjs'
import { ENV } from '../lib/env.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { runAccount, sharedSite } from '../lib/run-site.mjs'

test('J14 seat key and public API', async (t) => {
  const run = runContext()
  await journey(t, { id: 'J14' }, async ({ details }) => {
    const owner = await runAccount(run, 'owner')
    const site = await sharedSite(run, owner, 'wordpress')
    details.site = { siteKey: site.siteKey, reused: !site.created }
    const api = (path) => `${ENV.apiOrigin}${path}`
    const bearer = (key) => ({ headers: { authorization: `Bearer ${key}` } })
    const program = new Client({ name: 'program' })

    // ── 1. mint ─────────────────────────────────────────────────────────────────────────────
    const minted = await owner.post('/api/me/keys', {
      siteKey: site.siteKey,
      label: `e2e ${run.runId}`,
      scopes: ['content'],
      expiresInDays: 1
    })
    const id = minted.json?.id ?? null
    const key = typeof minted.json?.key === 'string' ? minted.json.key : null
    details.mint = {
      status: minted.status,
      code: minted.json?.code ?? null,
      id,
      keyShape: key ? 'trk_<id>.<secret>' : null
    }
    check(
      minted.status === 201 && id && key?.startsWith(`trk_${id}.`),
      `POST /api/me/keys answered ${minted.status} ${minted.json?.code ?? ''}`
    )
    try {
      const listed = await owner.get('/api/me/keys')
      const mine = (listed.json?.keys ?? []).find((k) => k.id === id) ?? null
      details.list = {
        status: listed.status,
        found: Boolean(mine),
        fields: mine ? Object.keys(mine).sort() : null
      }
      check(mine, `GET /api/me/keys does not list key ${id}`)
      check(!JSON.stringify(listed.json ?? {}).includes(key), 'GET /api/me/keys hands the secret back')

      // ── 2. the program uses it ──────────────────────────────────────────────────────────────
      const me = await program.get(api('/v1/me'), bearer(key))
      details.me = {
        status: me.status,
        email: me.json?.email ?? null,
        siteKey: me.json?.siteKey ?? null,
        scopes: me.json?.scopes ?? null
      }
      check(me.status === 200, `GET /v1/me answered ${me.status} ${me.json?.code ?? ''}`)
      check(me.json?.email === owner.email, `/v1/me names ${me.json?.email}, not the owner`)
      check(me.json?.siteKey === site.siteKey, `/v1/me names site ${me.json?.siteKey}`)
      const describe = await program.get(api(`/v1/sites/${encodeURIComponent(site.siteKey)}`), bearer(key))
      details.describe = { status: describe.status, code: describe.json?.code ?? null }
      check(
        describe.status === 200,
        `GET /v1/sites/:key answered ${describe.status} ${describe.json?.code ?? ''}`
      )

      // ── 3. the session cookie is not a credential on /v1 ───────────────────────────────────
      const byCookie = await owner.get(api('/v1/me'))
      details.cookieOnly = byCookie.status
      check(
        byCookie.status === 401,
        `GET /v1/me with the session cookie and no key answered ${byCookie.status}`
      )
    } finally {
      // ── 4. revoke, whatever happened above ─────────────────────────────────────────────────
      if (id) {
        const gone = await owner.request(`/api/me/keys/${id}`, { method: 'DELETE' })
        details.revoke = gone.status
      }
    }
    check(details.revoke === 204, `DELETE /api/me/keys/:id answered ${details.revoke}`)
    const after = await program.get(api('/v1/me'), bearer(key))
    details.afterRevoke = after.status
    check(after.status === 401, `the revoked key still answers ${after.status} on /v1/me`)
  })
})
