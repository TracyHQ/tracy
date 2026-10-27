// E1 — a gym, end to end in Website Opportunities (tasks/plan-wo-place-profile-code.md §4): the seller finds
// "gym" in an area, opens the place's profile, and builds with Tracy Base (Joomla). The demo has no Menu page and
// no "Book a table"; team, prices and statistics stay empty or carry the neutral copy of §7, never a name, price or
// figure the profile does not hold; every section and card of the template is there (baseline: the sidecar).

import { test } from 'node:test'
import { check, journey, runContext } from '../lib/journey.mjs'
import { actor, judgeDemo } from '../lib/place-profile/demo-case.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { AREAS, buildDemo, findAndSave, readPlaceProfile, research } from '../lib/place-profile/wo-flow.mjs'

test('E1 gym on Tracy Base (Joomla)', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E1' }, async ({ details }) => {
    requireLine(details, 'T3 neutral copy, T6 pins, T7 trade-aware prompt')
    const { owner, browser } = await actor(run)
    try {
      const { opportunity, candidate } = await findAndSave(owner, { area: AREAS.lisbon, trade: 'fitness' })
      details.place = { name: candidate.name, trade: candidate.trade ?? null, provider: candidate.provider }
      details.research = await research(owner, opportunity.id)
      const profile = await readPlaceProfile(owner, opportunity.id)
      const built = await buildDemo({
        owner,
        manifest: run.manifest,
        role: browser,
        id: opportunity.id,
        selection: { cms: 'joomla', quickstart: 'tracy-base/j6' }
      })
      details.build = { state: built.action.state, seen: built.seen, ms: built.ms, siteKey: built.siteKey }
      check(built.siteKey, `the build made no site (${built.seen.join(' → ')})`)
      check(
        built.action.state === 'completed',
        `the build ended ${built.action.state}: ${built.action.error ?? ''}`
      )
      await judgeDemo({
        run,
        details,
        browser,
        id: 'E1',
        siteKey: built.siteKey,
        profile,
        releaseKey: 'tracy-base/j6'
      })
      const menuPages = (details.linked ?? []).filter((u) => /\/menu(\/|$)/i.test(new URL(u).pathname))
      check(menuPages.length === 0, `a gym demo links a Menu page: ${menuPages.join(', ')}`)
    } finally {
      browser.detach()
    }
  })
})
