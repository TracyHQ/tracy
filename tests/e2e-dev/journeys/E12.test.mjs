// E12 — repeats and recovery. The same request sent twice with one Idempotency-Key, and twice at once (two tabs),
// is one demo; two Build presses in two tabs of the app for one place are one demo action; the profile frozen for
// the build does not change between the rounds. A restart in the middle of a build is NOT driven here: the suite may
// not restart containers on dev (tests/regression/common-dev.md) — it is listed in the notes as not covered.

import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { check, journey, runContext } from '../lib/journey.mjs'
import { actor, hostAccepts } from '../lib/place-profile/demo-case.mjs'
import { demoRequestV2 } from '../lib/place-profile/fixtures.mjs'
import { profileHash, requireLine } from '../lib/place-profile/line.mjs'
import { connectDemosToken, demosApi, revokeDemosToken } from '../lib/public-demos.mjs'
import { AREAS, findAndSave, readPlaceProfile, research } from '../lib/place-profile/wo-flow.mjs'

test('E12 repeats make one demo, the profile holds still', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E12' }, async ({ details, notes }) => {
    notes.push('restart mid-build: not covered (no restart rights on dev)')
    const { owner } = await actor(run)
    requireLine(details, 'T2b frozen profile revision + hash', await hostAccepts(owner))
    const token = await connectDemosToken(owner)
    try {
      const api = demosApi(token.accessToken)
      const body = demoRequestV2('gym')
      const key = `e2e-${run.runId}-e12`
      run.manifest.intend('demo', key, { owner: owner.email })
      const [a, b] = await Promise.all([api.create(body, key), api.create(body, key)])
      const c = await api.create(body, key)
      run.manifest.mark('demo', key, 'created', { demo: a.json?.demo?.id ?? null })
      details.replays = [a, b, c].map((r) => ({ status: r.status, demo: r.json?.demo?.id ?? null }))
      const ids = new Set(details.replays.map((r) => r.demo).filter(Boolean))
      check(ids.size === 1, `one key made ${ids.size} demos: ${JSON.stringify(details.replays)}`)
      const list = await api.list()
      details.listed = list.json?.data?.length ?? null
      check(details.listed === 1, `the account lists ${details.listed} demos`)

      // Two tabs of the app pressing Build for one place: one action, the same profile both times.
      const { opportunity } = await findAndSave(owner, { area: AREAS.lisbon, trade: 'fitness' })
      await research(owner, opportunity.id)
      const before = profileHash(await readPlaceProfile(owner, opportunity.id))
      const press = () =>
        owner.post(`/api/website-opportunities/${opportunity.id}/demo/build`, {
          requestId: `e2e-${randomUUID()}`,
          workflow: 'agent-demo/1',
          selection: { cms: 'joomla', quickstart: 'tracy-base/j6' }
        })
      const presses = await Promise.all([press(), press()])
      const actions = new Set(presses.flatMap((p) => (p.json?.actions ?? []).map((x) => x.id)))
      const after = profileHash(await readPlaceProfile(owner, opportunity.id))
      details.tabs = {
        statuses: presses.map((p) => p.status),
        actions: [...actions],
        profileBefore: before,
        profileAfter: after
      }
      check(actions.size <= 1, `two tabs made ${actions.size} demo actions for one place`)
      check(before === after, 'the place profile changed between the two presses')
    } finally {
      await revokeDemosToken(token.refreshToken)
    }
  })
})
