// E4 — an older client: raw `demo-request/v1` (the curl of `/docs/api`) for a gym. The host still answers 202, the
// opportunity it imports carries the gym's trade (B0, #1743: `fitness`, never a restaurant), the brief asks no
// dishes and plans no Menu page, and the demo has its site key.
//
// Without `--full` the journey stops where the seller's AI would start (status `waiting-for-you`): no model turn is
// spent, and the site (claimed, not provisioned yet) is not judged. With `--full` the chat link is opened, the demo is
// followed to its end, its home must answer and open with no broken frame, and it is judged like E1 — that half needs
// the line (T3/T6/T7) to pass.

import { test } from 'node:test'
import { devExec } from '../lib/dev.mjs'
import { Client } from '../lib/api.mjs'
import { ENV, siteOrigin } from '../lib/env.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { actor, askPublicDemo, judgeDemo } from '../lib/place-profile/demo-case.mjs'
import { placeProfileFromDemoRequest } from 'website-opportunities/domain/place-profile-from-demo-request.mjs'
import { demoRequestV1 } from '../lib/place-profile/fixtures.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { observe } from '../lib/place-profile/page-probe.mjs'
import { brokenImages } from '../lib/place-profile/assertions.mjs'
import { revokeDemosToken } from '../lib/public-demos.mjs'

test('E4 demo-request/v1 for a gym still builds for its trade', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E4' }, async ({ details }) => {
    const { owner, browser } = await actor(run)
    let asked = null
    try {
      const body = demoRequestV1('gym')
      asked = await askPublicDemo({ run, details, owner, browser, body, drive: run.full })
      check(
        asked.created.status === 202,
        `POST /v1/demos v1 answered ${asked.created.status} ${details.create.code ?? ''}`
      )
      check(
        ['waiting-for-you', 'ready', 'needs-review'].includes(asked.demo?.status),
        `the demo ended ${asked.demo?.status} (${details.demo.seen.join(' → ')}) ${JSON.stringify(details.demo.error)}`
      )

      // The trade the host imported, and the brief it froze for the build (read-only, by the run's account).
      const rows = await devExec.psqlReadOnly(
        run.runId,
        `select coalesce(o.candidate->>'trade', ''), coalesce(r.brief->'business'->>'trade', ''),
                coalesce((select string_agg(p->>'slug', ',') from jsonb_array_elements(coalesce(r.brief->'sitemap', '[]'::jsonb)) p), ''),
                coalesce((r.brief->'missing')::text, '')
           from wo_public_demo d
           join wo_demo_action a on a.id = d.action_id
           join wo_opportunity o on o.id = a.opportunity_id
           left join wo_revision r on r.id = a.revision_id
          where d.id::text = :'demo' and d.account_id = (select id from account where lower(email) = lower(:'owner'))`,
        { demo: details.demo.id, owner: owner.email }
      )
      const [candidateTrade, briefTrade, pages, missing] = rows[0] ?? []
      details.trade = {
        candidate: candidateTrade ?? null,
        brief: briefTrade ?? null,
        pages: pages ? pages.split(',') : [],
        asksDishes: /dish/i.test(missing ?? '')
      }
      check(
        candidateTrade === 'fitness',
        `the imported opportunity's trade is "${candidateTrade}", not fitness`
      )
      check(!details.trade.pages.includes('menu'), `the brief plans a Menu page for a gym: ${pages}`)
      check(!details.trade.asksDishes, 'the brief asks for dishes for a gym')

      const siteKey = asked.demo.site?.key
      check(siteKey, 'the demo has no site')
      const origin = siteOrigin(siteKey.split('.')[0])
      const reader = new Client({ name: 'visitor' })
      // Measured 26/10 on dev: at `waiting-for-you` the site is claimed but not provisioned (no job, no container,
      // its address answers 502) until the seller's chat starts. Without --full that is recorded, not judged.
      const first = await reader
        .get(`${origin}/`, { headers: { accept: 'text/html' } })
        .catch(() => ({ status: 0 }))
      details.homeAtWaiting = first.status
      if (!run.full) return
      requireLine(details, 'T3 neutral copy, T6 pins, T7 trade-aware prompt', {
        accepts: details.options.accepts
      })
      check(asked.demo.status === 'ready', `the demo ended ${asked.demo.status}`)
      const t0 = Date.now()
      let status = 0
      while (Date.now() - t0 < ENV.readyCapMs) {
        status = (
          await reader.get(`${origin}/`, { headers: { accept: 'text/html' } }).catch(() => ({ status: 0 }))
        ).status
        if (status === 200) break
        await new Promise((r) => setTimeout(r, 10_000))
      }
      details.homeReady = { status, ms: Date.now() - t0 }
      check(
        status === 200,
        `the demo home never answered 200 (last ${status} after ${details.homeReady.ms} ms)`
      )
      const home = await observe(browser, `${origin}/`, 'desktop')
      details.home = {
        url: home.url,
        title: home.title,
        sections: home.sections.length,
        images: home.images.length
      }
      details.home.broken = brokenImages(home.images)
        .map((i) => i.src)
        .slice(0, 10)
      details.home.shot = await browser.shot(run.runDir, 'E4-home-desktop')
      check(
        !/bad gateway|error code|not found/i.test(home.title),
        `the demo home is an error page: ${home.title}`
      )
      check(home.sections.length > 0 || home.text.length > 200, 'the demo home page is empty')
      check(
        details.home.broken.length === 0,
        `broken image frames on the demo home: ${details.home.broken.join(', ')}`
      )

      await judgeDemo({
        run,
        details,
        browser,
        id: 'E4',
        siteKey,
        profile: placeProfileFromDemoRequest(body),
        releaseKey: 'tracy-base/j6'
      })
    } finally {
      await revokeDemosToken(asked?.token?.refreshToken)
      browser.detach()
    }
  })
})
