// R26: a kept social row links a profile its icon can draw, checked when the plan is made rather than left to the
// copy check (W03), which no copy fix round could clear. No database needed.
//
//   node --test apps/tracy-web/test/site-plan-check-social-icons.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createRuleSet } from '../src/site-planner/plan-check/rule-set.js'
import { checkR26 } from '../src/site-planner/plan-check/rules-social-icons.js'

// The released kit: block-171 is JA Boxing's social list (facebook, instagram, twitter and telegram icons).
const kit = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/template-kit.json',
      import.meta.url
    )
  )
)

/** R26 on one kept (or hidden) social row of block-171 linked to a `network` profile. */
function r26(network, { field = 'block-171.10', link = 'block-171.6', kept = true, hidden = false } = {}) {
  const { R } = createRuleSet()
  const plan = {
    sharedBlocks: [
      {
        block: 'block-171',
        decision: kept ? 'keep' : 'hide',
        copy: [{ slot: field, says: 'The profile icon', factIds: [] }],
        links: [{ link, leadsTo: 'social:profile' }],
        hiddenSlots: hidden ? [{ slot: link }] : []
      }
    ]
  }
  const brief = {
    facts: [{ id: 'profile', field: 'socials', value: { kind: network, url: `https://${network}.com/club` } }]
  }
  checkR26({ R, plan, kit, brief })
  return R.r26.raw
}

test('R26 fails a twitter row linked to a profile the template has no icon for, and says how to fix the plan', () => {
  // The measured Central Padel plan (12/11/2026): the TikTok profile on the twitter row.
  const r = r26('tiktok')
  assert.equal(r.failures.length, 1)
  assert.equal(r.failures[0].where, 'block-171.10')
  assert.match(r.failures[0].detail, /draws twitter but the row links the tiktok profile/)
  assert.match(r.failures[0].detail, /hide the row/)
})

test('R26 passes a row of its own network, a network the icon family can draw, and a row that is not shown', () => {
  for (const [network, opts] of [
    ['twitter', {}],
    ['x', {}],
    // The telegram row linked to YouTube: the family evidences fa-youtube, so the writer changes the class.
    ['youtube', { field: 'block-171.11', link: 'block-171.7' }],
    ['tiktok', { hidden: true }],
    ['tiktok', { kept: false }]
  ]) {
    const r = r26(network, opts)
    assert.deepEqual(r.failures, [], `${network} ${JSON.stringify(opts)}`)
  }
})
