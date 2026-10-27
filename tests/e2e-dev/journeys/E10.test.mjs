// E10 — the group lock (T6): two services with near-identical names and different prices and pictures. A card
// never pairs A's name with B's price; fewer services than the template has cards leaves the extra cards neutral
// or empty, every card still there.

import { test } from 'node:test'
import { siteOrigin } from '../lib/env.mjs'
import { check, journey, runContext } from '../lib/journey.mjs'
import { actor, askPublicDemo, hostAccepts, judgeDemo } from '../lib/place-profile/demo-case.mjs'
import { nearTwinServices } from '../lib/place-profile/fixtures.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { PAIRS_EXPRESSION } from '../lib/place-profile/page-probe.mjs'
import { revokeDemosToken } from '../lib/public-demos.mjs'

test('E10 near-twin services keep their own prices', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E10' }, async ({ details }) => {
    const { owner, browser } = await actor(run)
    let asked = null
    try {
      requireLine(details, 'T6 group lock (one entity per card)', await hostAccepts(owner))
      const body = nearTwinServices()
      asked = await askPublicDemo({ run, details, owner, browser, body, drive: true })
      check(asked.demo?.status === 'ready', `the demo ended ${asked.demo?.status}`)
      await judgeDemo({
        run,
        details,
        browser,
        id: 'E10',
        siteKey: asked.demo.site.key,
        profile: body.profile,
        releaseKey: 'tracy-base/j6'
      })
      await browser.goto(`${siteOrigin(asked.demo.site.key.split('.')[0])}/`)
      const pairs = await browser.evaluate(
        PAIRS_EXPRESSION(['Deep tissue massage 60', 'Deep tissue massage 90'])
      )
      details.pairs = pairs
      const crossed = [
        ...(pairs['Deep tissue massage 60'] ?? []).filter((p) => /115/.test(p)),
        ...(pairs['Deep tissue massage 90'] ?? []).filter((p) => /\b80\b/.test(p))
      ]
      check(crossed.length === 0, `a service shows the other's price: ${JSON.stringify(pairs)}`)
    } finally {
      await revokeDemosToken(asked?.token?.refreshToken)
      browser.detach()
    }
  })
})
