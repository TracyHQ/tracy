// E5 — `/ops` Road to live, the Slot roles step (T5): a release with no sidecar shows a warning (or a to-do before
// it is published) that names the slots without a role and offers a Copy prompt; a release with a sidecar shows it
// done; neither holds Publish. Read through the API the Templates screen reads, then the screen itself in the
// watched browser (the step's words and its Copy button).

import { test } from 'node:test'
import { ENV } from '../lib/env.mjs'
import { check, journey, runContext, writeEvidence } from '../lib/journey.mjs'
import { NEEDS_LINE } from '../lib/place-profile/line.mjs'
import { opsStaff, releaseRow, slotRolesOfRow } from '../lib/place-profile/ops-road.mjs'
import { Blocked } from '../lib/journey.mjs'
import { chromeWatchErrors, localStamp, watchedRole } from '../lib/watched-browser.mjs'

test('E5 /ops Road to live shows Slot roles without holding Publish', async (t) => {
  const run = runContext()
  await journey(t, { id: 'E5' }, async ({ details }) => {
    const { staff, releases } = await opsStaff()
    const withSidecar = releaseRow(releases, 'tracy-base/j6', '1.0.5')
    // Any release of a template no sidecar was written for.
    const without = releases.find((r) => r.road && /ja-impact|ja-essence/.test(String(r.tag ?? ''))) ?? null
    details.releases = {
      total: releases.length,
      withSidecar: withSidecar?.tag ?? null,
      without: without?.tag ?? null
    }
    const a = slotRolesOfRow(withSidecar)
    const b = slotRolesOfRow(without)
    details.roads = { withSidecar: a, without: b }
    writeEvidence(run.runDir, 'E5-roads.json', details.roads)
    if (!a.step && !b.step)
      throw new Blocked(
        `needs: ${NEEDS_LINE} — the road has no slot-roles step (${a.steps.join(', ')})`,
        NEEDS_LINE
      )
    if (!withSidecar || !without)
      throw new Blocked('the two releases to compare are not on this deployment', 'environment')
    check(
      a.step?.state === 'done' && a.step.code === 'roles-ready',
      `with a sidecar: ${a.step?.state} ${a.step?.code}`
    )
    check(
      ['warn', 'todo'].includes(b.step?.state) && b.step.code === 'roles-missing',
      `without: ${b.step?.state} ${b.step?.code}`
    )
    check(
      a.publishBlockedBy !== 'slot-roles' && b.publishBlockedBy !== 'slot-roles',
      'Publish waits on Slot roles'
    )

    // The screen: the step's line and its Copy prompt.
    const since = localStamp()
    const browser = await watchedRole({ name: 'ops', token: staff.token })
    try {
      await browser.viewport('desktop')
      await browser.goto(`${ENV.origin}/ops/cms/templates`, { settleMs: 6000 })
      const seen = await browser.evaluate(`(() => {
        const text = document.body.innerText
        const copy = [...document.querySelectorAll('button')].filter((b) => /copy/i.test(b.innerText || b.getAttribute('aria-label') || ''))
        return { slotRoles: /slot roles/i.test(text), copyButtons: copy.length }
      })()`)
      details.screen = { ...seen, shot: await browser.shot(run.runDir, 'E5-ops-cms-templates') }
      const errors = await chromeWatchErrors({ since, page: '/ops' }).catch((e) => [{ error: e.message }])
      details.browserErrors = { since, count: errors.length, first: errors.slice(0, 10) }
      check(seen.slotRoles, 'the Templates screen never says "Slot roles"')
      check(seen.copyButtons > 0, 'the Templates screen offers no Copy prompt')
    } finally {
      browser.detach()
    }
  })
})
