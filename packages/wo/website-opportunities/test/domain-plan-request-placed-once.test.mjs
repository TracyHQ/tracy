// A service the owner removes frees a place, and nothing the plan shows elsewhere moves into it (#609, sixth real run:
// after a removal one service showed on both Home and the list page). The plan's rule is one block per item on a page
// (`item_repeated_on_page`); across pages an item may show twice only where the composition puts it twice (a detail
// page, a home teaser the model chose). The gate's placement fills a free place only with an item shown nowhere
// (`plan-placement.mjs`), so a removal never doubles one. The invented florist on the JA Boxing block store; scripted
// fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-request-placed-once.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { composePlan } from '../domain/plan-composer.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { answer, requestFor } from './fixtures/plan-composer/plan-request.mjs'
import { scriptedModel } from './fixtures/plan-composer/invented-club.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import { INPUT, SHARED, b, composition, contactPage, homeOf } from './fixtures/write-order/boxing-gate.mjs'

const MORE = ['Dried flower wreath', 'Weekly desk flowers']

/** The florist with five services: three on the home page, two on the list page. */
function florist() {
  const profile = boxingProfile()
  const [first] = profile.items.service
  MORE.forEach((name, i) => {
    const item = structuredClone(first)
    item.id = `service-more-${i + 1}`
    item.fields['offering.name'] = { ...item.fields['offering.name'], value: name }
    profile.items.service.push(item)
  })
  return profile
}

test('removing a service from the home block never places another one there that the list page shows', async () => {
  const profile = florist()
  const ids = profile.items.service.map((s) => s.id)
  const home = homeOf(profile)
  home.blocks.find((x) => x.block === 'block-160').data = ids.slice(0, 3)
  const list = { pageType: 'classes', name: 'Bouquets', blocks: [...SHARED(), b('class-list', ids.slice(3))] }
  const composed = await composePlan({
    ...INPUT,
    profile,
    model: scriptedModel(JSON.stringify(composition([home, list, contactPage()])))
  })
  const plan = composed.plan
  const homeBlock = plan.pages[0].blocks.find((x) => x.block === 'block-160')
  const text = `Please remove ${profile.items.service[2].label ?? 'the third bouquet'} from the home page.`
  const change = {
    op: 'set_block_data',
    page: 'home',
    block: homeBlock.id,
    data: ids.slice(0, 2),
    request: text
  }
  const request = requestFor(plan, text)
  const model = scriptedModel(answer([change]))
  const revised = await revisePlan({ ...INPUT, plan, profile: composed.profile, request, model })
  assert.deepEqual(
    revised.attempts.map((a) => a.problems),
    [[]]
  )
  const where = new Map()
  for (const page of revised.plan.pages)
    for (const block of page.blocks)
      for (const id of block.data.filter((x) => ids.includes(x)))
        where.set(id, [...(where.get(id) ?? []), page.id])
  assert.deepEqual(Object.fromEntries(where), {
    [ids[0]]: ['home'],
    [ids[1]]: ['home'],
    [ids[3]]: ['classes'],
    [ids[4]]: ['classes']
  })
  assert.ok(revised.plan.leftOut.some((e) => e.item === ids[2]))
})
