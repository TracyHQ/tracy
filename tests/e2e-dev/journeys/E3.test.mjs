// E3 — the open-source Website Opportunities, self-hosted by a stranger: "Connect with Tracy" (the OAuth device
// flow approved on `/connect` by the run's own account — what `wo-stranger*` does by hand), then "Build it with
// Tracy" for a spa. The host receives `demo-request/v2` with the place profile; the demo is built for the beauty
// trade and judged like E1.

import { test } from 'node:test'
import { check, journey, runContext } from '../lib/journey.mjs'
import { actor, askPublicDemo, hostAccepts, judgeDemo } from '../lib/place-profile/demo-case.mjs'
import { demoRequestV2 } from '../lib/place-profile/fixtures.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { revokeDemosToken } from '../lib/public-demos.mjs'

test('E3 open repo, demo-request/v2 for a spa', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E3' }, async ({ details }) => {
    const { owner, browser } = await actor(run)
    let asked = null
    try {
      const body = demoRequestV2('spa')
      // The host must announce profile/1 before a sender may send v2 (T2a negotiation).
      requireLine(details, 'T2b host stores the v2 profile; accepts profile/1', await hostAccepts(owner))
      asked = await askPublicDemo({ run, details, owner, browser, body, drive: true })
      check(
        asked.created.status === 202,
        `POST /v1/demos v2 answered ${asked.created.status} ${details.create.code ?? ''}`
      )
      check(
        asked.demo?.status === 'ready',
        `the demo ended ${asked.demo?.status} (${details.demo.seen.join(' → ')})`
      )
      await judgeDemo({
        run,
        details,
        browser,
        id: 'E3',
        siteKey: asked.demo.site.key,
        profile: body.profile,
        releaseKey: 'tracy-base/j6'
      })
      check(details.profile.trade === 'beauty', `the profile's trade is ${details.profile.trade}, not beauty`)
    } finally {
      await revokeDemosToken(asked?.token?.refreshToken)
      browser.detach()
    }
  })
})
