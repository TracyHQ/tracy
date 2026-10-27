// E6 — Details shows the place profile (T5b): every block the profile holds data for, and one coverage row per
// target with its exact status — seven statuses stay seven (blocked, failed and not applicable are never folded
// into "not there"); the targets the seller must know about (menu, offerings, prices, hours, phone, media, brand)
// are always listed.

import { test } from 'node:test'
import { ENV } from '../lib/env.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { actor } from '../lib/place-profile/demo-case.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { AREAS, findAndSave, readPlaceProfile, research } from '../lib/place-profile/wo-flow.mjs'
import { chromeWatchErrors, localStamp } from '../lib/watched-browser.mjs'

const COVERAGE_STATUSES = [
  'found',
  'partial',
  'searched_not_found',
  'not_researched',
  'blocked',
  'failed',
  'not_applicable'
]
const IMPORTANT = ['menu', 'offerings', 'prices', 'hours', 'phone', 'media', 'brand']

test('E6 Details draws the place profile and its coverage', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E6' }, async ({ details }) => {
    requireLine(details, 'T5b Details place profile block and its door')
    const { owner, browser } = await actor(run)
    try {
      const { opportunity } = await findAndSave(owner, {
        area: AREAS.hanoi,
        trade: 'food',
        pick: (c) => Boolean(c.website)
      })
      details.research = await research(owner, opportunity.id)
      const profile = await readPlaceProfile(owner, opportunity.id)
      const api = profile.coverage.map((c) => ({ target: c.target, status: c.status }))
      details.coverage = api
      check(
        api.every((c) => COVERAGE_STATUSES.includes(c.status)),
        `unknown coverage status: ${JSON.stringify(api)}`
      )

      const since = localStamp()
      await browser.viewport('desktop')
      await browser.goto(
        `${ENV.origin}/new/?tab=tracy:website-opportunities&wo-view=mine&wo-opp=${opportunity.id}&wo-page=details`,
        { settleMs: 8000 }
      )
      const drawn = await browser.evaluate(
        `[...document.querySelectorAll('li[data-status]')].map((li) => ({ status: li.getAttribute('data-status'), text: li.innerText.slice(0, 80) }))`
      )
      details.drawn = drawn
      details.shot = await browser.shot(run.runDir, 'E6-details-desktop')
      const errors = await chromeWatchErrors({ since, page: 'website-opportunities' }).catch((e) => [
        { error: e.message }
      ])
      details.browserErrors = { since, count: errors.length, first: errors.slice(0, 10) }
      const apiStatuses = new Set(
        api.filter((c) => IMPORTANT.includes(c.target) || c.status !== 'not_researched').map((c) => c.status)
      )
      const drawnStatuses = new Set(drawn.map((d) => d.status))
      check(drawn.length > 0, 'Details draws no coverage row')
      check(
        [...drawnStatuses].every((s) => COVERAGE_STATUSES.includes(s)),
        `a drawn status is outside the seven: ${[...drawnStatuses]}`
      )
      check(
        [...apiStatuses].every((s) => drawnStatuses.has(s)),
        `statuses folded on screen: api ${[...apiStatuses]} drawn ${[...drawnStatuses]}`
      )
      const missing = IMPORTANT.filter(
        (target) =>
          api.some((c) => c.target === target) && !drawn.some((d) => d.text.toLowerCase().includes(target))
      )
      details.importantNotNamed = missing
    } finally {
      browser.detach()
    }
  })
})
