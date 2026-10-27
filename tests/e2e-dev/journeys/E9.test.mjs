// E9 — a sidecar that is missing, stale or malformed. Locally, on copies of the Tracy Base j6 contract: the reader
// says which, and the Road to live step reports it as a warning or a to-do, never a Publish refusal. On dev, the
// same in `/ops` for a release with no sidecar (E5 reads the screen), and a demo built on such a release still
// builds and invents nothing (judged without a baseline).
//
// A stale or malformed sidecar cannot be put on dev without a crafted image, so those two are judged locally only.

import { test } from 'node:test'
import { Blocked, check, journey, runContext } from '../lib/journey.mjs'
import { findContractDir } from '../lib/place-profile/baseline.mjs'
import { actor, judgeDemo } from '../lib/place-profile/demo-case.mjs'
import { requireLine } from '../lib/place-profile/line.mjs'
import { sidecarStates } from '../lib/place-profile/sidecar-states.mjs'
import { opsStaff, slotRolesOfRow } from '../lib/place-profile/ops-road.mjs'
import { AREAS, buildDemo, findAndSave, readPlaceProfile, research } from '../lib/place-profile/wo-flow.mjs'

test('E9 broken sidecars warn, never block, never invent', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E9' }, async ({ details }) => {
    const states = sidecarStates(findContractDir({ slug: 'tracy-base', line: 'j6', version: '1.0.5' }))
    details.local = states
    check(states.ready.step.code === 'roles-ready', `ready: ${JSON.stringify(states.ready)}`)
    for (const [name, code] of [
      ['missing', 'roles-missing'],
      ['stale', 'roles-stale'],
      ['invalid', 'roles-invalid']
    ]) {
      check(states[name].state === name, `${name}: the reader says ${states[name].state}`)
      check(
        ['warn', 'todo'].includes(states[name].step.state) && states[name].step.code === code,
        `${name}: step ${JSON.stringify(states[name].step)}`
      )
    }

    requireLine(details, 'T5 Slot roles step on dev, T6 fallback without a sidecar')
    const { releases } = await opsStaff()
    const without = releases.find((r) => r.road && /ja-impact/.test(String(r.tag ?? '')))
    if (!without) throw new Blocked('no ja-impact release on this deployment', 'environment')
    const road = slotRolesOfRow(without)
    details.dev = { release: without?.tag ?? null, step: road.step, publishBlockedBy: road.publishBlockedBy }
    check(road.publishBlockedBy !== 'slot-roles', 'Publish waits on Slot roles')

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
        selection: { cms: 'wordpress', design: 'ja-impact' }
      })
      details.build = { state: built.action.state, seen: built.seen, siteKey: built.siteKey }
      check(
        built.siteKey && built.action.state === 'completed',
        `the build without a sidecar ended ${built.action.state}`
      )
      // No sidecar: judged with no baseline (layout skipped), every fabrication check still on.
      await judgeDemo({
        run,
        details,
        browser,
        id: 'E9',
        siteKey: built.siteKey,
        profile,
        releaseKey: null,
        paths: ['/']
      })
    } finally {
      browser.detach()
    }
  })
})
