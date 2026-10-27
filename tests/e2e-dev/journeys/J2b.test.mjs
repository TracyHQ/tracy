// J2b — add a site through the API, for each CMS of the run, one after another:
//   POST /api/sites → job `done` within the measured budget → the home page answers 200 to its
//   owner in a real browser with no site error → a stranger (no cookie) reads the draft copy but
//   not Tracy's data about it, and robots.txt asks crawlers to stay out → DELETE → no container
//   of the label left on the dev host.
//
// A stranger is NOT shown a sign-in screen any more: the draft gate was removed on purpose
// (16/09/2026, `apps/tracy-web/src/bar/route.js`). What still separates a stranger from the
// owner on the site's own hostname is `/__tracy/errors` (401 without a session) and robots.txt.

import { test } from 'node:test'
import { Client } from '../lib/api.mjs'
import { launch, roleContext } from '../lib/browser.mjs'
import { mintCookie } from '../lib/dev.mjs'
import { ENV, addressLabel, runEmail, runLabel, siteOrigin } from '../lib/env.mjs'
import { triage } from '../lib/errors.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { noteAccount } from '../lib/run-site.mjs'
import { containersOf, createSite, deleteSite, waitForJob } from '../lib/sites.mjs'

test('J2b add site via API', async (t) => {
  const { runId, cms, keep, manifest } = runContext()
  const email = runEmail(runId, 'owner')
  noteAccount(manifest, email)
  const owner = new Client({ name: 'owner', email, token: await mintCookie(email) })
  const browser = await launch()
  try {
    for (const platform of cms) {
      await t.test(`J2b ${platform}`, async (st) => {
        await journey(st, { id: 'J2b', cms: platform, retries: 1 }, async ({ attempt, details, notes }) => {
          const typed = runLabel(runId, `${platform[0]}${attempt ? attempt : ''}`)
          const label = addressLabel(typed)
          const budget = ENV.readyBudgetMs[platform]
          details.label = label
          details.budgetMs = budget
          let siteKey = null
          try {
            // ── create and wait ──────────────────────────────────────────────────────────────
            const t0 = Date.now()
            const created = await createSite(owner, manifest, {
              label: typed,
              platform,
              ...ENV.builds[platform]
            })
            siteKey = created.siteKey
            details.post = { status: created.status, ms: created.ms }
            const job = await waitForJob(owner, siteKey, created.jobId, ENV.readyCapMs)
            details.readyMs = Date.now() - t0
            details.job = {
              state: job.state,
              polls: job.polls,
              steps: job.steps,
              laneError: job.body?.laneError ?? null,
              repoError: job.body?.repoError ?? null,
              // A failed provision says why only in its output (e.g. "[ERROR] Connection refused").
              ...(job.state === 'done' ? {} : { outputTail: String(job.body?.output ?? '').slice(-1500) })
            }
            const firstError = /\[ERROR\][^\n]*/.exec(String(job.body?.output ?? ''))?.[0]?.trim()
            check(
              job.state === 'done',
              `job ended ${job.state} after ${details.readyMs} ms at step "${job.steps.at(-1) ?? '—'}": ${firstError ?? job.body?.error ?? job.body?.detail ?? 'no reason given'}`
            )
            check(
              details.readyMs <= budget,
              `ready after ${details.readyMs} ms, over the ${budget} ms budget (S0 measurement × 1.5)`
            )

            // ── the owner opens the home page in a real browser ─────────────────────────────
            const site = siteOrigin(label)
            const ownerCtx = await roleContext(browser, { name: 'owner', token: owner.token })
            try {
              const page = await ownerCtx.newPage()
              ownerCtx.step('site-home')
              const res = await page.goto(`${site}/`, { waitUntil: 'load', timeout: 90_000 })
              await page.waitForTimeout(3_000)
              const { fails, notes: errNotes } = triage(ownerCtx.eventsOf('site-home'), {
                siteStep: true,
                siteLabels: [label]
              })
              details.ownerHome = {
                status: res?.status() ?? null,
                finalUrl: page.url(),
                fails: fails.length,
                notes: errNotes.length
              }
              details.ownerHomeErrors = fails
                .slice(0, 10)
                .map((e) => ({ type: e.type, owner: e.owner, message: e.message, url: e.url }))
              for (const n of errNotes.slice(0, 10))
                notes.push(`${n.owner}: ${n.message ?? ''} ${n.url ?? ''}`.trim())
              check(res?.status() === 200, `home page answered ${res?.status()} to its owner`)
              check(
                new URL(page.url()).hostname === new URL(site).hostname,
                `home page left the site: ${page.url()}`
              )
              check(
                fails.length === 0,
                `${fails.length} browser error(s) on the home page: ${fails
                  .slice(0, 3)
                  .map((e) => `${e.message} ${e.url ?? ''}`)
                  .join(' | ')}`
              )
            } finally {
              await ownerCtx.close()
            }

            // ── a stranger, and what tells the two apart ────────────────────────────────────
            const stranger = new Client({ name: 'stranger' })
            const sHome = await stranger.get(`${site}/`, {
              headers: { accept: 'text/html' },
              timeoutMs: 90_000
            })
            const robots = await stranger.get(`${site}/robots.txt`)
            const sErrors = await stranger.get(`${site}/__tracy/errors`)
            const oErrors = await owner.get(`${site}/__tracy/errors`)
            details.stranger = {
              home: sHome.status,
              errorsDoor: sErrors.status,
              ownerErrorsDoor: oErrors.status,
              robots: robots.status
            }
            check(
              sHome.status === 200,
              `the draft copy answered ${sHome.status} to a stranger (expected 200 since 16/09)`
            )
            check(!sHome.text.includes(email), 'the page served to a stranger names the owner')
            check(
              sErrors.status === 401,
              `/__tracy/errors answered ${sErrors.status} to a stranger (expected 401)`
            )
            check(
              oErrors.status === 200,
              `/__tracy/errors answered ${oErrors.status} to the owner (expected 200)`
            )
            check(
              robots.status === 200 &&
                /^Disallow: \/\s*$/m.test(robots.text) &&
                /search=no/.test(robots.text),
              `robots.txt of a draft does not refuse crawlers (HTTP ${robots.status})`
            )
          } finally {
            // ── delete through the door, then look at the host ──────────────────────────────
            if (siteKey && !keep) {
              const d0 = Date.now()
              const del = await deleteSite(owner, siteKey, label)
              manifest.mark('site', siteKey, del.state, del.detail)
              details.delete = { ms: Date.now() - d0, ...del }
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
