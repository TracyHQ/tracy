// E7 — E1 again on EmDash Tracy Base: a gym built for real, its pages read again after personalize (the reload of
// every page in `judgeSite`), against the EmDash sidecar (`tracy-emdash-theme-base/contracts/0.5.6`).

import { test } from 'node:test'
import { check, journey, runContext } from '../lib/journey.mjs'
import { actor, judgeDemo } from '../lib/place-profile/demo-case.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { AREAS, buildDemo, findAndSave, readPlaceProfile, research } from '../lib/place-profile/wo-flow.mjs'

test('E7 gym on Tracy Base (EmDash)', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E7' }, async ({ details }) => {
    requireLine(details, 'T6 EmDash pins (emdash-wo-copy), T3, T7')
    const { owner, browser } = await actor(run)
    try {
      const { opportunity } = await findAndSave(owner, { area: AREAS.lisbon, trade: 'fitness' })
      details.research = await research(owner, opportunity.id)
      const profile = await readPlaceProfile(owner, opportunity.id)
      const built = await buildDemo({
        owner,
        manifest: run.manifest,
        role: browser,
        id: opportunity.id,
        selection: { cms: 'emdash', design: 'tracy' }
      })
      details.build = { state: built.action.state, seen: built.seen, siteKey: built.siteKey }
      check(built.siteKey && built.action.state === 'completed', `the build ended ${built.action.state}`)
      await judgeDemo({
        run,
        details,
        browser,
        id: 'E7',
        siteKey: built.siteKey,
        profile,
        releaseKey: 'tracy-base/emdash-0.x'
      })
    } finally {
      browser.detach()
    }
  })
})
