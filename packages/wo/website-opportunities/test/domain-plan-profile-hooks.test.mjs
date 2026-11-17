// The plan stage reads the needs profile's new inputs (#575, plan stage inputs): what the brief holds back becomes left
// out lines by code and count; held opening hours get their own line; a person only customers named keeps `namedBy`
// on the plan; the owner's videos reach the composer; entries the profile merged are never left out lines. Invented
// club and template, scripted fake model: no real model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { HELD_BACK_REASONS, heldBackLeftOutOf } from '../domain/plan-held-back.mjs'
import {
  blockStore,
  clubProfile,
  goodComposition,
  scriptedModel,
  withIntentNotes
} from './fixtures/plan-composer/invented-club.mjs'
import { brief, inputs, reply } from './fixtures/plan-composer/intent-kit.mjs'

const composition = () => withIntentNotes(goodComposition(), ['km-1', 'km-2'])

test('what the brief holds back is a left out line by code and count; hours and channels keep their own lines', () => {
  const lines = heldBackLeftOutOf({
    heldBack: [
      { field: 'prices', code: 'not_collected', count: 3 },
      { field: 'team', code: 'owner_left_off', count: 1 },
      { field: 'socials', code: 'sources_disagree', count: 2 },
      { field: 'hours', code: 'not_collected', count: 1 },
      { field: 'whatsapp', code: 'kept_off_site', count: 1 }
    ]
  })
  assert.deepEqual(lines, [
    {
      what: 'Prices',
      kind: 'feature',
      reason: HELD_BACK_REASONS.not_collected,
      code: 'not_collected',
      params: { count: 3 }
    },
    {
      what: 'Team',
      kind: 'feature',
      reason: HELD_BACK_REASONS.owner_withheld,
      code: 'owner_withheld',
      params: { count: 1 }
    },
    {
      what: 'Social profiles',
      kind: 'feature',
      reason: HELD_BACK_REASONS.sources_disagree,
      code: 'sources_disagree',
      params: { count: 2 }
    }
  ])
  assert.deepEqual(heldBackLeftOutOf({}), [])
})

test('the composed plan lists the held back lines and the held hours line, and passes Contract B', async () => {
  const profile = { ...clubProfile(), heldBack: [{ field: 'prices', code: 'not_collected', count: 2 }] }
  const held = brief({
    missing: [{ field: 'hours', why: 'x' }],
    facts: [{ id: 'h1', field: 'hours', onSite: false, reasons: ['owner-left-off'] }]
  })
  const { plan } = await composePlan(inputs(scriptedModel(reply(composition())), { profile, brief: held }))
  const lines = plan.leftOut.map((e) => [e.what, e.code, e.params?.count ?? null])
  assert.ok(lines.some(([what, code, n]) => what === 'Prices' && code === 'not_collected' && n === 2))
  assert.ok(lines.some(([what, code]) => what === 'Opening hours' && code === 'owner_withheld'))
  assert.deepEqual(checkBuildDocument(plan), { ok: true, problems: [] })
})

test('held hours on a kit with no hours field are said to have no place in the design', async () => {
  const store = blockStore()
  for (const b of store.blocks) b.fields = b.fields.filter((f) => f.kind !== 'contact.hours')
  const held = brief({
    missing: [{ field: 'hours', why: 'x' }],
    facts: [{ id: 'h1', field: 'hours', onSite: false, reasons: ['owner-left-off'] }]
  })
  const c = composition()
  for (const p of c.pages) for (const b of p.blocks) b.data = b.data.filter((id) => id !== 'contact-hours')
  const { plan } = await composePlan(inputs(scriptedModel(reply(c)), { blockStore: store, brief: held }))
  const hours = plan.leftOut.filter((e) => e.what === 'Opening hours')
  assert.ok(hours.length > 0 && hours.every((e) => e.code === 'no_place_in_design'), JSON.stringify(hours))
})

test('a person customers named keeps namedBy on the plan; videos reach the model; merged entries are not left out', async () => {
  const profile = clubProfile()
  profile.items.person[0].namedBy = 'customer'
  profile.videos = { count: 2, sources: [] }
  profile.merged = [
    { code: 'same_offer_merged', why: 'Named twice.', item: { id: 'service-court-rental', kind: 'service' } }
  ]
  const model = scriptedModel(reply(composition()))
  const { plan } = await composePlan(inputs(model, { profile }))
  const sent = JSON.parse(model.calls[0].user).business
  assert.equal(sent.items.find((i) => i.id === 'person-ilse-varrow').namedBy, 'customer')
  assert.equal(sent.videos.count, 2)
  assert.equal(plan.items.find((i) => i.id === 'person-ilse-varrow').namedBy, 'customer')
  assert.ok(!JSON.stringify(plan.leftOut).includes('service-court-rental'))
  assert.ok(!plan.leftOut.some((e) => e.code === 'same_offer_merged'))
  assert.deepEqual(checkBuildDocument(plan), { ok: true, problems: [] })
})
