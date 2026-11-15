// One gate, the same rules at compose and at revise (#609, sixth real run): the compose gate took two over long
// services off a list of three, kept the list with one item under its minimum of two, and the first change request,
// which never touched that list, was refused for it (`too_few_items`). A block the gate leaves under its minimum now
// leaves the plan, or is a problem when it is the page's main block (`plan-below-min-blocks.mjs`). And every plan the
// compose gate passes passes the revise gate again with a change that changes nothing. The invented florist on the
// JA Boxing block store, the invented club on the invented template; scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-below-min.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { dropBelowMinBlocks } from '../domain/plan-below-min-blocks.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { answer, firstPlan, kit as clubKit, requestFor } from './fixtures/plan-composer/plan-request.mjs'
import { scriptedModel } from './fixtures/plan-composer/invented-club.mjs'
import { boxingComposition, boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import {
  INPUT,
  SHARED,
  b,
  composition,
  contactPage,
  contextOf,
  homeOf
} from './fixtures/write-order/boxing-gate.mjs'

const LONG = ['Wild meadow bouquet with hand tied ribbon', 'Seasonal posy in a recycled glass jar']

/** The florist with two more services whose names are longer than the list's name field (35 characters). */
function floristWithLongServices() {
  const profile = boxingProfile()
  const [first] = profile.items.service
  LONG.forEach((name, i) => {
    const item = structuredClone(first)
    item.id = `service-long-${i + 1}`
    item.fields['offering.name'] = { ...item.fields['offering.name'], value: name }
    profile.items.service.push(item)
  })
  return profile
}
/** The real run's shape: one service on the home page, the list page holds one short service and the two long ones. */
const listPage = (data) => ({
  pageType: 'classes',
  name: 'Bouquets',
  blocks: [...SHARED(), b('class-list', data)]
})
const runShape = (profile, list) => composition([homeOf(profile), listPage(list), contactPage()])

test('a main block the gate leaves under its minimum is a too_few_items problem at compose, as at revise', async () => {
  const profile = floristWithLongServices()
  const [s0, s1, s2] = profile.items.service.map((s) => s.id)
  const first = runShape(profile, [s1, 'service-long-1', 'service-long-2'])
  const second = runShape(profile, [s1, s2, 'service-long-1'])
  const model = scriptedModel(JSON.stringify(first), JSON.stringify(second))
  const composed = await composePlan({ ...INPUT, profile, model })
  assert.deepEqual(
    composed.attempts[0].problems.map((p) => `${p.code}@${p.at}`),
    ['too_few_items@pages[1].blocks[2].data']
  )
  assert.match(composed.attempts[0].problems[0].message, /service-long-1.*characters/)
  assert.equal(composed.attempts.length, 2)
  const list = composed.plan.pages
    .find((p) => p.pageType === 'classes')
    .blocks.find((x) => x.block === 'class-list')
  assert.deepEqual(list.data, [s1, s2])
  assert.ok(s0)
})

test('a block that is not the main block leaves the plan under its minimum, with its items accounted for', () => {
  const profile = boxingProfile()
  const context = contextOf(profile)
  const photos = profile.items.gallery.slice(0, 2).map((g) => g.id)
  const pages = [
    {
      id: 'home',
      pageType: 'home',
      blocks: [
        { id: 'home-b1', block: 'block-156', label: 'Welcome', data: ['business-name'] },
        { id: 'home-b2', block: 'block-166', label: 'Photo gallery', data: photos }
      ]
    }
  ]
  const problems = []
  const out = dropBelowMinBlocks(pages, context, new Map([['home', 0]]), (...p) => problems.push(p))
  assert.deepEqual(problems, [])
  assert.deepEqual(
    out.pages[0].blocks.map((x) => x.id),
    ['home-b1']
  )
  assert.deepEqual(out.leftOut[0], {
    what: 'Photo gallery',
    kind: 'block',
    reason:
      'This section needs at least 3 of your photos, and only 2 are left for it, so I left the section out.',
    code: 'section_below_minimum',
    params: { min: 3, shown: 2 }
  })
  assert.deepEqual(
    out.leftOut.slice(1).map((e) => [e.id, e.code, e.params.min]),
    photos.map((id) => [id, 'section_below_minimum', 3])
  )
})

/** A change request whose one change sets a block's data to what it already shows. */
async function reviseWithNothing(plan, profile, kit) {
  const page = plan.pages[0]
  const block = page.blocks.at(-1)
  const text = 'Please keep the last section as it is.'
  const change = {
    op: 'set_block_data',
    page: page.id,
    block: block.id,
    data: [...block.data],
    request: 'keep the last section'
  }
  const model = scriptedModel(answer([change]), answer([change]))
  return revisePlan({ ...kit, plan, profile, request: requestFor(plan, text), model })
}

test('every plan the compose gate accepts passes the revise gate with a change that changes nothing', async () => {
  const boxingKit = INPUT
  const cases = []
  cases.push({ name: 'invented club', ...(await firstPlan()), kit: clubKit() })
  for (const [name, profileOf, compositionOf] of [
    ['florist, every page', boxingProfile, boxingComposition],
    ['florist, home and contact', boxingProfile, (p) => composition([homeOf(p), contactPage()])],
    [
      'florist, the real run shape',
      floristWithLongServices,
      (p) => runShape(p, [p.items.service[1].id, 'service-long-1', 'service-long-2'])
    ]
  ]) {
    const profile = profileOf()
    const c = compositionOf(profile)
    // The run shape fails its first attempt (the main block under its minimum); the second keeps the list whole.
    const fixed = runShape(
      profile,
      profile.items.service.slice(1, 3).map((s) => s.id)
    )
    const model = scriptedModel(JSON.stringify(c), JSON.stringify(fixed))
    const composed = await composePlan({ ...boxingKit, profile, model })
    cases.push({ name, plan: composed.plan, profile: composed.profile, kit: boxingKit })
  }
  for (const { name, plan, profile, kit } of cases) {
    const revised = await reviseWithNothing(plan, profile, kit).catch((e) => {
      throw new Error(`${name}: ${JSON.stringify(e.details?.problems)}`)
    })
    assert.equal(revised.attempts.length, 1, `${name}: ${JSON.stringify(revised.attempts)}`)
    assert.deepEqual(revised.attempts[0].problems, [], name)
    assert.equal(revised.unchanged, true, `${name}: ${JSON.stringify(revised.changed)}`)
  }
})
