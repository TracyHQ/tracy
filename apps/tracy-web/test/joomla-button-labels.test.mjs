/**
 * A button's label names where it leads (TCH #1013). Measured 10/10/2026 on dev g58-ess-j-full (JA Essence j6 1.0.4, FULL,
 * Vietnamese): the header's "Subscribe" and the footer's "Become a subscriber" both lead to the Contact page, and both came
 * back "Xem thực đơn" ("See the menu"), a page the site does not have. The planner is told each button's destination.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { essenceModel, runEssence } from './_joomla-essence-site.mjs'

test('the Subscribe buttons are planned knowing they lead to the contact page', async () => {
  const model = essenceModel()
  await runEssence({ model })
  const asked = new Map()
  for (const call of model.calls)
    for (const slot of call.input?.slots ?? []) if (!asked.has(slot.key)) asked.set(slot.key, slot)
  for (const key of ['module-110.1', 'module-122.1']) {
    const slot = asked.get(key)
    assert.ok(slot, `${key} is planned`)
    assert.match(
      String(slot.leadsTo ?? ''),
      /contact/i,
      `${key} "${slot.sample}" is told it leads to the contact page`
    )
  }
})

test('every button label the planner is shown carries where its link leads (JA Essence j6 1.0.4)', async () => {
  const { labelOf } = await import('../../../packages/cms/tracy-seeder/src/plan-joomla-contract.mjs')
  const { map } = await import('./_joomla-essence-site.mjs')
  const model = essenceModel()
  await runEssence({ model })
  const labels = new Set(
    map.slots
      .filter((s) => s.type === 'url' && String(s.sample ?? '').trim() !== '')
      .map((link) => labelOf(map.slots, link)?.key)
      .filter(Boolean)
  )
  const shown = new Map()
  for (const call of model.calls)
    for (const slot of call.input?.slots ?? []) if (labels.has(slot.key)) shown.set(slot.key, slot)
  assert.ok(shown.size >= 2, `${shown.size} button labels are planned`)
  const blind = [...shown.values()].filter(
    (s) => !s.leadsTo && !/social|instagram|facebook/i.test(`${s.label} ${s.sample}`)
  )
  assert.deepEqual(
    blind.map((s) => `${s.key} "${s.sample}"`),
    [],
    'no label is planned without its destination'
  )
})
