// J12 — session and site life cycle, per CMS, on the run's shared site of that CMS (the last
// journey of a run, so deleting the shared site here takes nothing from a later one):
//   1. The owner's workspace opens in a real browser; a reload keeps the session (`/auth/me` from
//      the page still names the owner, the page is not sent to /login).
//   2. Sign-out from that page clears the browser's session: `/auth/me` names nobody and the
//      workspace asks for a sign-in.
//   3. DELETE the site through the door: the site's hostname answers 404 (or 410), the workspace
//      no longer offers it, `/api/sites` no longer lists it, and no container of its label is left
//      on the dev host (stopped ones included).
//
// Sessions are stateless signed tokens (`lib/session.js`): sign-out clears the cookie in the
// browser, it does not revoke the token. Whether a copy of the token still works after sign-out is
// recorded as a note, never as the verdict — the plan's check is the browser's session.

import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { openWorkspace } from '../lib/chat-turn.mjs'
import { ENV } from '../lib/env.mjs'
import { triage } from '../lib/errors.mjs'
import { withoutKnown } from '../lib/known-errors.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { runAccount, sharedSite } from '../lib/run-site.mjs'
import { containersOf, deleteSite } from '../lib/sites.mjs'

/** `/auth/me` asked from inside the page, with the browser's own cookie jar. */
async function meFromPage(page) {
  return page.evaluate(async () => {
    const r = await fetch('/auth/me', { credentials: 'include' })
    return { status: r.status, email: (await r.json().catch(() => ({})))?.email ?? null }
  })
}

test('J12 session and site life cycle', async (t) => {
  const run = runContext()
  const { cms, keep, manifest } = run
  const owner = await runAccount(run, 'owner')
  const browser = await launch()
  try {
    for (const platform of cms) {
      await t.test(`J12 ${platform}`, async (st) => {
        await journey(st, { id: 'J12', cms: platform }, async ({ details, notes }) => {
          const site = await sharedSite(run, owner, platform)
          details.site = { siteKey: site.siteKey, reused: !site.created }
          const ctx = await roleContext(browser, { name: 'owner', token: owner.token })
          try {
            const page = await ctx.newPage()

            // ── 1. open, reload ───────────────────────────────────────────────────────────────
            ctx.step('workspace')
            const opened = await openWorkspace(page, site.siteKey)
            details.open = opened
            check(opened.status === 200, `workspace answered ${opened.status}`)
            ctx.step('reload')
            await page.reload({ waitUntil: 'load', timeout: 120_000 })
            const afterReload = await meFromPage(page)
            details.reload = { url: new URL(page.url()).pathname, me: afterReload.email === owner.email }
            check(!/\/login\b/.test(page.url()), `a reload sent the owner to ${new URL(page.url()).pathname}`)
            check(
              afterReload.email === owner.email,
              `after a reload /auth/me named ${JSON.stringify(afterReload.email)}`
            )
            const { fails, known } = withoutKnown(
              triage(
                ctx.events.filter((e) => e.step === 'workspace' || e.step === 'reload'),
                {
                  siteStep: false,
                  siteLabels: [site.label]
                }
              ).fails
            )
            for (const k of known) notes.push(`known ${k.known}: ${k.message ?? ''} ${k.url ?? ''}`.trim())
            details.workspaceErrors = fails
              .slice(0, 10)
              .map((e) => ({ type: e.type, message: e.message, url: e.url }))
            check(
              fails.length === 0,
              `${fails.length} Tracy error(s) opening the workspace: ${fails
                .slice(0, 3)
                .map((e) => `${e.message} ${e.url ?? ''}`)
                .join(' | ')}`
            )

            // ── 2. sign out ───────────────────────────────────────────────────────────────────
            ctx.step('signout')
            const out = await page.evaluate(async () => {
              const r = await fetch('/auth/signout', { method: 'POST', credentials: 'include' })
              return { status: r.status, body: await r.json().catch(() => null) }
            })
            const me = await meFromPage(page)
            const jar = (await ctx.context.cookies(ENV.origin)).some((c) => c.name === ENV.sessionCookie)
            await page.goto(`${ENV.origin}/${site.siteKey}/`, { waitUntil: 'load', timeout: 90_000 })
            details.signout = {
              status: out.status,
              ok: out.body?.ok ?? null,
              meAfter: me.email,
              cookieLeft: jar,
              workspaceAfter: new URL(page.url()).pathname
            }
            check(out.status === 200 && out.body?.ok === true, `POST /auth/signout answered ${out.status}`)
            check(me.email == null, `after sign-out /auth/me named ${JSON.stringify(me.email)}`)
            check(!jar, 'after sign-out the browser still holds a session cookie')
            check(
              /\/login\b/.test(page.url()) || (await page.locator('input[type="email"]').count()) > 0,
              `after sign-out the workspace did not ask for a sign-in (at ${details.signout.workspaceAfter})`
            )
            // Not a verdict (see the header): the token itself is not revoked.
            const replay = await owner.get('/auth/me')
            if (replay.json?.email === owner.email)
              notes.push('a copy of the signed-out token still authenticates (stateless session, by design)')
          } finally {
            await ctx.close()
          }

          // ── 3. delete the site ──────────────────────────────────────────────────────────────
          if (keep) {
            notes.push('--keep: the site was not deleted, step 3 not run')
            return
          }
          const d0 = Date.now()
          const del = await deleteSite(owner, site.siteKey, site.label)
          manifest.mark('site', site.siteKey, del.state, del.detail)
          details.delete = { ms: Date.now() - d0, ...del }
          check(del.state === 'cleaned', `delete left the site: ${JSON.stringify(del.detail)}`)

          const gone = await fetch(`${site.origin}/`, {
            headers: { 'user-agent': ENV.userAgent, accept: 'text/html' },
            redirect: 'manual',
            signal: AbortSignal.timeout(60_000)
          })
          const listed = await owner.get('/api/sites')
          const workspace = await owner.get(`/${site.siteKey}/`, { headers: { accept: 'text/html' } })
          const left = await containersOf(site.label)
          details.afterDelete = {
            siteHome: gone.status,
            listed: (listed.json?.sites ?? []).some((s) => s.siteKey === site.siteKey),
            workspace: workspace.status,
            containers: left.map((c) => `${c.name} (${c.state})`)
          }
          check(
            gone.status === 404 || gone.status === 410,
            `the deleted site's hostname answered ${gone.status}`
          )
          check(!details.afterDelete.listed, 'GET /api/sites still lists the deleted site')
          check(workspace.status !== 200, `the deleted site's workspace still answered ${workspace.status}`)
          check(
            left.length === 0,
            `containers left after delete: ${details.afterDelete.containers.join(', ')}`
          )
        })
      })
    }
  } finally {
    await browser.close()
  }
})
