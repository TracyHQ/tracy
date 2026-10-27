// E2 — a restaurant whose menu research could read, built on ja-restaurant (WordPress): real dishes with their
// prices printed as the menu printed them (`priceScale` respected), dish pictures only where the picture is the
// dish's, extra dish cards in neutral copy, no invented "Coming soon".

import { test } from 'node:test'
import { Blocked, check, journey, runContext } from '../lib/journey.mjs'
import { actor, judgeDemo } from '../lib/place-profile/demo-case.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { amountKey, profileFacts } from '../lib/place-profile/profile-facts.mjs'
import { AREAS, buildDemo, findAndSave, readPlaceProfile, research } from '../lib/place-profile/wo-flow.mjs'

test('E2 restaurant with a menu on ja-restaurant (WordPress)', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E2' }, async ({ details }) => {
    requireLine(details, 'T6 pins by group, T3 neutral copy')
    const { owner, browser } = await actor(run)
    try {
      const { opportunity, candidate } = await findAndSave(owner, {
        area: AREAS.hanoi,
        trade: 'food',
        pick: (c) => Boolean(c.website)
      })
      details.place = { name: candidate.name, website: Boolean(candidate.website) }
      details.research = await research(owner, opportunity.id)
      const profile = await readPlaceProfile(owner, opportunity.id)
      const facts = profileFacts(profile)
      if (facts.priceDigits.size === 0)
        throw new Blocked('research read no priced menu for this place', 'provider')
      const built = await buildDemo({
        owner,
        manifest: run.manifest,
        role: browser,
        id: opportunity.id,
        selection: { cms: 'wordpress', quickstart: 'ja-restaurant/wp7' }
      })
      details.build = { state: built.action.state, seen: built.seen, siteKey: built.siteKey }
      check(built.siteKey && built.action.state === 'completed', `the build ended ${built.action.state}`)
      await judgeDemo({
        run,
        details,
        browser,
        id: 'E2',
        siteKey: built.siteKey,
        profile,
        releaseKey: 'ja-restaurant/wp7',
        paths: ['/', '/menu/']
      })
      // At least one printed price of the profile shows, verbatim, on the menu page.
      const menu = details.pages.find((p) => p.url.endsWith('/menu/') && p.viewport === 'desktop')
      check(menu, 'the demo has no /menu/ page')
      const shown = menu.prices.filter((p) => facts.priceDigits.has(amountKey(p)))
      check(
        shown.length > 0,
        `no price of the profile shows on the menu page (shown: ${menu.prices.join(', ') || 'none'})`
      )
    } finally {
      browser.detach()
    }
  })
})
