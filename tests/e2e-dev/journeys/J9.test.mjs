// J9 — My Sites and the Design inspiration link.
//   1. My Sites (`tracy:my-sites`, `packages/site/tracy-my-sites`, opened with `?open=my-sites`)
//      lists the run's shared WordPress site, and its row has the Team column
//      (`td.tracy-mysites-team > button`), whose words match the book `GET /api/team` has for it.
//   2. `/new/?inspiration=<id>&platform=wordpress` lands on the Add site wizard with that template
//      chosen: the start card names the template's label from `GET /api/templates` and WordPress,
//      and the WordPress chip is the pressed one (`workspace/route.js` → `/new/s/<session>?tab=…`).

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { ENV } from '../lib/env.mjs'
import { triage } from '../lib/errors.mjs'
import { withoutKnown } from '../lib/known-errors.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { runAccount, sharedSite } from '../lib/run-site.mjs'

test('J9 My Sites and Design inspiration', async (t) => {
  const run = runContext()
  await journey(t, { id: 'J9', retries: 1 }, async ({ details, notes }) => {
    const owner = await runAccount(run, 'owner')
    const site = await sharedSite(run, owner, 'wordpress')
    details.site = { siteKey: site.siteKey, reused: !site.created }

    const templates = await owner.get('/api/templates')
    const design = ENV.builds.wordpress.design
    const card = (templates.json?.templates ?? []).find((x) => x.id === design)
    details.template = { status: templates.status, id: design, label: card?.label ?? null }
    check(card, `GET /api/templates has no card ${design}`)

    const browser = await launch()
    try {
      const ctx = await roleContext(browser, { name: 'owner', token: owner.token })
      try {
        // ── 1. My Sites ───────────────────────────────────────────────────────────────────────
        const page = await ctx.newPage()
        ctx.step('my-sites')
        await page.goto(`${ENV.origin}/${site.siteKey}/?open=my-sites`, {
          waitUntil: 'load',
          timeout: 120_000
        })
        const row = page.locator('tr.tracy-mysites-row', { hasText: site.label })
        await row
          .first()
          .waitFor({ timeout: 60_000 })
          .catch(async (error) => {
            // Leave what the page showed, so a miss can be told from a slow list or a wrong label.
            details.mySitesMiss = {
              url: page.url(),
              rows: await page
                .locator('tr.tracy-mysites-row')
                .evaluateAll((els) => els.map((el) => el.textContent?.trim().slice(0, 80)))
                .catch(() => [])
            }
            const dir = join(runContext().runDir, 'evidence')
            mkdirSync(dir, { recursive: true })
            await page.screenshot({ path: join(dir, 'J9-my-sites.png') }).catch(() => null)
            throw error
          })
        const teamCell = row.first().locator('td.tracy-mysites-team button')
        // Empty before the roster is asked for, "…" while it loads: wait for the words after both.
        await page
          .waitForFunction(
            (label) => {
              const text = [...document.querySelectorAll('tr.tracy-mysites-row')]
                .find((r) => r.textContent?.includes(label))
                ?.querySelector('td.tracy-mysites-team button')
                ?.textContent?.trim()
              return Boolean(text) && text !== '…'
            },
            site.label,
            { timeout: 30_000 }
          )
          .catch(() => {})
        const cellText = (await teamCell.textContent({ timeout: 10_000 }).catch(() => null))?.trim() ?? null
        const team = await owner.get('/api/team')
        const seats = (team.json?.sites ?? []).find((s) => s.siteKey === site.siteKey)?.seats ?? []
        const members = seats.filter((s) => s.status === 'active' || s.status === 'invited').length
        details.mySites = {
          rows: await page.locator('tr.tracy-mysites-row').count(),
          teamCell: cellText,
          members
        }
        check(cellText !== null, 'the shared site has no Team cell in My Sites')
        check(
          members === 1 ? /only you/i.test(cellText) : cellText.includes(String(members)),
          `Team cell reads ${JSON.stringify(cellText)}, the book has ${members} member(s)`
        )
        const { fails: mineErrors, known: mineKnown } = withoutKnown(
          triage(ctx.eventsOf('my-sites'), { siteStep: false, siteLabels: [site.label] }).fails
        )
        for (const k of mineKnown) notes.push(`known ${k.known}: ${k.message ?? ''} ${k.url ?? ''}`.trim())
        details.mySitesErrors = mineErrors.slice(0, 5).map((e) => ({ message: e.message, url: e.url }))
        check(
          mineErrors.length === 0,
          `${mineErrors.length} Tracy error(s) on My Sites: ${mineErrors
            .slice(0, 3)
            .map((e) => `${e.message} ${e.url ?? ''}`)
            .join(' | ')}`
        )

        // ── 2. the inspiration link ───────────────────────────────────────────────────────────
        const wizard = await ctx.newPage()
        ctx.step('inspiration')
        await wizard.goto(`${ENV.origin}/new/?inspiration=${encodeURIComponent(design)}&platform=wordpress`, {
          waitUntil: 'load',
          timeout: 120_000
        })
        const start = wizard.locator('[data-start-template="1"] [data-start-name="1"]')
        await start.waitFor({ timeout: 60_000 })
        const startText = (await start.textContent())?.trim() ?? ''
        const pressed = await wizard.locator('button[aria-pressed="true"]', { hasText: 'WordPress' }).count()
        const landed = new URL(wizard.url())
        details.inspiration = {
          path: landed.pathname.replace(/session-[\w-]+/, 'session-…'),
          tab: landed.searchParams.get('tab'),
          design: landed.searchParams.get('design'),
          startText,
          wordpressPressed: pressed > 0
        }
        check(landed.pathname.startsWith('/new/'), `the link landed on ${landed.pathname}`)
        check(
          startText.includes(card.label),
          `the wizard starts from ${JSON.stringify(startText)}, not ${card.label}`
        )
        check(
          /WordPress/.test(startText),
          `the wizard's start card does not name WordPress: ${JSON.stringify(startText)}`
        )
        check(pressed > 0, 'the WordPress platform chip is not the pressed one')
        const { fails: wizErrors, known: wizKnown } = withoutKnown(
          triage(ctx.eventsOf('inspiration'), { siteStep: false }).fails
        )
        for (const k of wizKnown) notes.push(`known ${k.known}: ${k.message ?? ''} ${k.url ?? ''}`.trim())
        details.inspirationErrors = wizErrors.slice(0, 5).map((e) => ({ message: e.message, url: e.url }))
        check(
          wizErrors.length === 0,
          `${wizErrors.length} Tracy error(s) on the wizard: ${wizErrors
            .slice(0, 3)
            .map((e) => `${e.message} ${e.url ?? ''}`)
            .join(' | ')}`
        )
      } finally {
        await ctx.close()
      }
    } finally {
      await browser.close()
    }
  })
})
