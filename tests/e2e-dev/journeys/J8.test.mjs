// J8 — Settings, judged by what each setting DOES, not by the value it stores.
//
//   1. Interface language: the owner opens Settings › General › Language in the workspace of the
//      run's shared WordPress site and picks `Tiếng Việt`; the start screen's title changes from
//      "Your site, ready to edit" to its Vietnamese string, and Tracy's own pages are
//      told through the `tracy_lang` cookie (`packages/ui/tracy-settings`, `language-row.tsx`).
//   2. A notification group switched off: two teammates hold an editor seat on the site; one turns
//      the Inbox off for "about you" (`PUT /api/notifications/preferences`); the owner changes both
//      roles, which notifies `team.role_changed` (`seats/route.js`, about-you group). The other
//      teammate gets the Inbox row, the one who switched it off does not (`notify.js` writes it
//      with `in_inbox = false`, or not at all, and `GET /api/notifications` lists only inbox rows).
// Both teammates' seats are taken off the shared site at the end.

import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { openWorkspace } from '../lib/chat-turn.mjs'
import { ENV } from '../lib/env.mjs'
import { check, journey, runContext, writeEvidence } from '../lib/journey.mjs'
import { noteChild, runAccount, sharedSite } from '../lib/run-site.mjs'

const TITLE = { en: 'Your site, ready to edit', vi: 'Site của bạn, sẵn sàng chỉnh sửa' }

test('J8 settings', async (t) => {
  const run = runContext()
  const { manifest, runDir } = run
  await journey(t, { id: 'J8' }, async ({ details }) => {
    const owner = await runAccount(run, 'owner')
    const site = await sharedSite(run, owner, 'wordpress')
    const keyPath = `/api/sites/${encodeURIComponent(site.siteKey)}`
    details.site = { siteKey: site.siteKey, reused: !site.created }

    // ── 1. interface language ─────────────────────────────────────────────────────────────────
    const browser = await launch()
    try {
      const ctx = await roleContext(browser, { name: 'owner', token: owner.token })
      const page = await ctx.newPage()
      const title = page.locator('[data-tracy-start="site"] .tv-start-title')
      try {
        await openWorkspace(page, site.siteKey)
        await title.waitFor({ timeout: 60_000 })
        const before = (await title.textContent())?.trim() ?? null
        // `?settings=notifications` is the one address that opens Settings; General is its first section.
        await page.goto(`${ENV.origin}/${site.siteKey}/?settings=notifications`, { waitUntil: 'load' })
        await page.locator('button.ts-nav', { hasText: 'General' }).click({ timeout: 60_000 })
        await page.locator('button.ts-select[aria-label^="Language:"]').click({ timeout: 30_000 })
        await page.getByText('Tiếng Việt', { exact: true }).click({ timeout: 30_000 })
        await page.keyboard.press('Escape')
        await page
          .waitForFunction(
            (want) =>
              document.querySelector('[data-tracy-start="site"] .tv-start-title')?.textContent?.trim() ===
              want,
            TITLE.vi,
            { timeout: 30_000 }
          )
          .catch(() => {})
        const after = (await title.textContent().catch(() => null))?.trim() ?? null
        const cookie =
          (await ctx.context.cookies(ENV.origin)).find((c) => c.name === 'tracy_lang')?.value ?? null
        details.language = { before, after, tracyLangCookie: cookie }
        check(before === TITLE.en, `start title before the pick: ${JSON.stringify(before)}`)
        check(after === TITLE.vi, `start title after picking Tiếng Việt: ${JSON.stringify(after)}`)
        check(cookie === 'vi', `tracy_lang cookie after the pick: ${JSON.stringify(cookie)}`)
      } catch (error) {
        await page
          .screenshot({ path: writeEvidence(runDir, 'J8-language.png', ''), fullPage: false })
          .catch(() => {})
        throw error
      } finally {
        await ctx.close()
      }
    } finally {
      await browser.close()
    }

    // ── 2. a notification group switched off ─────────────────────────────────────────────────
    const on = await runAccount(run, 'prefon')
    const off = await runAccount(run, 'prefoff')
    const mates = [on, off]
    const ids = {}
    try {
      const invite = await owner.post('/api/team/invite', {
        emails: mates.map((m) => m.email),
        role: 'editor',
        siteKeys: [site.siteKey]
      })
      for (const m of mates) noteChild(manifest, site.siteKey, { seat: m.email, role: 'editor', by: 'J8' })
      check(invite.status === 200, `owner's invite answered ${invite.status} ${invite.json?.code ?? ''}`)
      for (const m of mates) {
        const accepted = await m.post(`${keyPath}/accept`)
        check(accepted.status === 200, `${m.name} accept answered ${accepted.status}`)
      }
      const team = await owner.get('/api/team')
      for (const s of (team.json?.sites ?? []).find((x) => x.siteKey === site.siteKey)?.seats ?? [])
        ids[s.email] = s.id
      check(ids[on.email] && ids[off.email], 'the teammates are not on the book after accepting')

      const put = await off.request('/api/notifications/preferences', {
        method: 'PUT',
        json: { groups: { 'about-you': { inbox: false } } }
      })
      const aboutYou = (put.json?.groups ?? []).find((g) => g.id === 'about-you') ?? null
      details.preference = { status: put.status, aboutYou }
      check(
        put.status === 200 && aboutYou?.inbox === false,
        `PUT preferences answered ${put.status} ${JSON.stringify(aboutYou)}`
      )

      const changed = {}
      for (const m of mates) {
        const r = await owner.request(`${keyPath}/seats/${ids[m.email]}`, {
          method: 'PATCH',
          json: { role: 'developer' }
        })
        changed[m.name] = r.status
        check(
          r.status === 200 && r.json?.role === 'developer',
          `role change for ${m.name} answered ${r.status} ${r.json?.code ?? ''}`
        )
      }
      // The notifier writes in the request; a short grace covers nothing but the network.
      await new Promise((r) => setTimeout(r, 2_000))
      const rows = {}
      for (const m of mates) {
        const list = await m.get('/api/notifications')
        const mine = (list.json?.notifications ?? []).filter((n) => n.siteKey === site.siteKey)
        rows[m.name] = {
          status: list.status,
          kinds: mine.map((n) => n.kind),
          unread: list.json?.unread ?? null
        }
      }
      details.roleChange = changed
      details.inbox = rows
      check(
        rows.prefon.kinds.includes('team.role_changed'),
        `the teammate with the Inbox on got no team.role_changed row: ${rows.prefon.kinds.join(', ') || 'none'}`
      )
      check(
        rows.prefoff.status === 200,
        `GET /api/notifications for the teammate with it off answered ${rows.prefoff.status}`
      )
      check(
        !rows.prefoff.kinds.includes('team.role_changed'),
        'the teammate who switched "about you" off still got a team.role_changed row in the Inbox'
      )
    } finally {
      // ── leave the accounts and the shared site as they were ──────────────────────────────
      // A profile with fixed accounts (staging) meets this preference again on the next run.
      const back = await off.request('/api/notifications/preferences', {
        method: 'PUT',
        json: { groups: { 'about-you': { inbox: true } } }
      })
      details.preferenceRestored = back.status
      details.seatsRemoved = {}
      for (const m of mates) {
        if (!ids[m.email]) continue
        const r = await owner.request(`${keyPath}/seats/${ids[m.email]}`, {
          method: 'DELETE',
          json: { kind: 'revoke' }
        })
        details.seatsRemoved[m.name] = r.status
      }
    }
  })
})
