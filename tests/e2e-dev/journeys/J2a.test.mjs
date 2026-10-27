// J2a — add a site through the Add site wizard, the way a person does, for each CMS of the run
// (WordPress in the core run; Joomla and EmDash as smoke when asked for):
//   `/new/?inspiration=<template>&platform=<cms>` → the wizard starts from that template → type a
//   site address → Create site → the "Tell Tracy about your site" questions (answered "I will do it
//   later": Apply sends a brief the build hands to a model, and this journey does not spend one) →
//   the wizard follows the build and, once the site's agent is up, opens `/<siteKey>/` by itself →
//   the site is on `GET /api/sites` with its agent → DELETE through the door, nothing left on the host.
//
// The site is written into the manifest before Create site is pressed, so a run that dies while
// the wizard builds still leaves its name for cleanup. Time is recorded against the API build's
// budget as a note: the wizard also waits for the agent, which J2b's budget does not include.

import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { ENV, runLabel } from '../lib/env.mjs'
import { triage } from '../lib/errors.mjs'
import { withoutKnown } from '../lib/known-errors.mjs'
import { check, journey, runContext, writeEvidence } from '../lib/journey.mjs'
import { runAccount } from '../lib/run-site.mjs'
import { containersOf, deleteSite } from '../lib/sites.mjs'

const PLATFORM_LABEL = { wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' }

test('J2a add site via the wizard', async (t) => {
  const run = runContext()
  const { runId, runDir, cms, keep, manifest } = run
  const owner = await runAccount(run, 'owner')
  const browser = await launch()
  try {
    for (const platform of cms) {
      await t.test(`J2a ${platform}`, async (st) => {
        await journey(st, { id: 'J2a', cms: platform }, async ({ details, notes }) => {
          const sites = await owner.get('/api/sites')
          const prefix = sites.json?.addressPrefix ?? ''
          const typed = runLabel(runId, `u${platform[0]}`)
          const label = `${prefix}${typed}`
          const siteKey = `${label}.${ENV.siteDomain}`
          const design = ENV.builds[platform].design
          details.label = label
          details.design = design
          const ctx = await roleContext(browser, { name: 'owner', token: owner.token })
          let pressed = false
          const page = await ctx.newPage()
          try {
            // ── choose the template ──────────────────────────────────────────────────────────
            ctx.step('wizard')
            await page.goto(
              `${ENV.origin}/new/?inspiration=${encodeURIComponent(design)}&platform=${platform}`,
              {
                waitUntil: 'load',
                timeout: 120_000
              }
            )
            const start = page.locator('[data-start-template="1"] [data-start-name="1"]')
            await start.waitFor({ timeout: 60_000 })
            details.startsFrom = (await start.textContent())?.trim() ?? null
            check(
              details.startsFrom?.includes(PLATFORM_LABEL[platform]),
              `the wizard starts from ${JSON.stringify(details.startsFrom)}, not on ${PLATFORM_LABEL[platform]}`
            )

            // ── address, Create site, the questions ─────────────────────────────────────────
            await page.getByLabel('Site address').fill(typed)
            manifest.intend('site', siteKey, { label, platform, owner: owner.email, design, via: 'wizard' })
            const t0 = Date.now()
            await page.getByRole('button', { name: 'Create site' }).click()
            pressed = true
            const later = page.getByRole('button', { name: 'I will do it later' })
            const asked = await later
              .waitFor({ timeout: 20_000 })
              .then(() => true)
              .catch(() => false)
            details.questionsShown = asked
            if (asked) await later.click()
            else
              notes.push(
                'the questions popup did not open (no questions loaded, or the template takes no brief)'
              )

            // ── the wizard builds, then opens the site's workspace by itself ────────────────
            ctx.step('building')
            const building = await page
              .locator('[data-stage="building"]')
              .waitFor({ timeout: 60_000 })
              .then(() => true)
              .catch(() => false)
            details.buildingShown = building
            const opened = await page
              .waitForURL((u) => u.pathname.startsWith(`/${siteKey}/`), { timeout: ENV.readyCapMs })
              .then(() => true)
              .catch(() => false)
            details.readyMs = Date.now() - t0
            const failed = await page.locator('[data-stage="build-failed"]').count()
            details.landedOn = new URL(page.url()).pathname.replace(/session-[\w-]+/, 'session-…')
            if (await page.locator('[data-stage]').count())
              details.stage = await page.locator('[data-stage]').first().getAttribute('data-stage')
            manifest.mark('site', siteKey, 'created', { via: 'wizard', readyMs: details.readyMs })
            check(failed === 0, `the wizard shows build-failed after ${details.readyMs} ms`)
            check(building, 'the wizard never showed its building stage')
            check(
              opened,
              `the wizard did not open /${siteKey}/ within ${ENV.readyCapMs} ms (at ${details.landedOn})`
            )
            const budget = ENV.readyBudgetMs[platform]
            if (details.readyMs > budget)
              notes.push(`ready (agent up) after ${details.readyMs} ms; the API build budget is ${budget} ms`)

            const listed = await owner.get('/api/sites')
            const row = (listed.json?.sites ?? []).find((s) => s.siteKey === siteKey)
            details.listed = {
              found: Boolean(row),
              platform: row?.platform ?? null,
              agent: row?.agent ?? null
            }
            check(row, 'GET /api/sites does not list the new site')
            check(row.platform === platform, `the new site is ${row.platform}, not ${platform}`)
            check(row.agent !== null, 'the new site has no agent on GET /api/sites')

            const { fails, known } = withoutKnown(
              triage([...ctx.eventsOf('wizard'), ...ctx.eventsOf('building')], {
                siteStep: false,
                siteLabels: [label]
              }).fails
            )
            for (const k of known) notes.push(`known ${k.known}: ${k.message ?? ''} ${k.url ?? ''}`.trim())
            details.errors = fails.slice(0, 10).map((e) => ({ type: e.type, message: e.message, url: e.url }))
            check(
              fails.length === 0,
              `${fails.length} Tracy error(s) in the wizard: ${fails
                .slice(0, 3)
                .map((e) => `${e.message} ${e.url ?? ''}`)
                .join(' | ')}`
            )
          } catch (error) {
            await page.screenshot({ path: writeEvidence(runDir, `J2a-${platform}.png`, '') }).catch(() => {})
            throw error
          } finally {
            await ctx.close()
            // ── delete through the door, then look at the host ─────────────────────────────
            if (pressed && !keep) {
              const del = await deleteSite(owner, siteKey, label)
              manifest.mark('site', siteKey, del.state, del.detail)
              details.delete = del
            }
          }
          if (!keep) {
            const left = await containersOf(label)
            details.containersAfter = left.map((c) => `${c.name} (${c.state})`)
            check(
              details.delete?.state === 'cleaned',
              `delete left the site: ${JSON.stringify(details.delete?.detail ?? null)}`
            )
            check(left.length === 0, `containers left after delete: ${details.containersAfter.join(', ')}`)
          }
        })
      })
    }
  } finally {
    await browser.close()
  }
})
