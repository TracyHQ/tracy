// The plan gate fixes a mechanical fault itself, recorded, instead of failing the whole plan (#614), and its redo
// message carries the first plan with every problem and the values that pass. Each case is a fault a real build met
// (six compose attempts, every one stopped by the gate), here on the invented florist and the real JA Boxing block
// store. Scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-fixes.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { composePlan } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import {
  INPUT,
  SHARED,
  b,
  composition,
  contactPage,
  contextOf,
  homeOf,
  person
} from './fixtures/write-order/boxing-gate.mjs'

/** The invented florist with a name the page header holds, and two people for a trainers page. */
function florist() {
  const profile = boxingProfile()
  profile.facts['business.name'][0].value = 'Larkspur Blooms'
  profile.items.person = [person(1, 'Maren Holt'), person(2, 'Tobin Ashgrove')]
  return profile
}
const photos = (profile, from, to) => profile.items.gallery.slice(from, to).map((g) => g.id)
const header = (label = 'Page header') => ({ ...b('block-162', ['business-name']), label })
const trainers = (profile, extra = []) => ({
  pageType: 'trainers',
  name: 'Florists',
  blocks: [...SHARED(), header(), b('block-178', ['person-p1', 'person-p2']), ...extra]
})
const codeAt = (list) => list.map((p) => `${p.code}@${p.at}`)

test('a page header labelled with the business name takes the section name, on every page, recorded', () => {
  const profile = florist()
  const contact = contactPage()
  contact.blocks.splice(2, 0, header('Business name'))
  const gated = gatePlan(composition([homeOf(profile), trainers(profile), contact]), contextOf(profile))
  assert.equal(gated.ok, true, JSON.stringify(gated.problems))
  assert.deepEqual(codeAt(gated.fixes), ['label_repeats_data@pages[2].blocks[2].label'])
  assert.deepEqual(
    gated.plan.pages.find((p) => p.id === 'contact').blocks.find((x) => x.block === 'block-162').label,
    'Page header'
  )
})

test('an assumption naming a block by its store id names the plan id of that block, or goes with the block', () => {
  const profile = florist()
  const assumptions = [
    { field: 'pages[home].blocks[block-160].data', said: 'Your best selling bouquet first.' },
    { field: 'pages[home].blocks[block-165].data', said: 'Your steps on the home page.' },
    { field: 'pages[home].name', said: 'Home is the usual name of the first page.' }
  ]
  const gated = gatePlan(composition([homeOf(profile), contactPage()], assumptions), contextOf(profile))
  assert.equal(gated.ok, true, JSON.stringify(gated.problems))
  const home = gated.plan.pages.find((p) => p.id === 'home')
  const services = home.blocks.find((x) => x.block === 'block-160').id
  const model = gated.plan.assumptions.filter((a) => a.id.startsWith('model-'))
  assert.deepEqual(
    model.map((a) => a.field),
    [`pages[home].blocks[${services}].data`, 'pages[home].name']
  )
  assert.deepEqual(
    gated.fixes.map(({ code, at, now }) => ({ code, at, now })),
    [
      { code: 'contract_b', at: 'assumptions[0].field', now: `pages[home].blocks[${services}].data` },
      { code: 'contract_b', at: 'assumptions[1].field', now: null }
    ]
  )
})

test('an assumption naming an id that is no block at all is still a contract problem', () => {
  const profile = florist()
  const assumptions = [{ field: 'pages[home].blocks[block-999].data', said: 'A guess.' }]
  const gated = gatePlan(composition([homeOf(profile), contactPage()], assumptions), contextOf(profile))
  assert.equal(gated.ok, false)
  assert.deepEqual(codeAt(gated.problems), ['contract_b@assumptions[model-1].field'])
})

test('a block on a page whose recipe does not list it: the message names what passes, the redo carries the first plan', async () => {
  const profile = florist()
  const first = composition([
    homeOf(profile),
    trainers(profile, [b('block-181', photos(profile, 0, 2))]),
    contactPage()
  ])
  const requests = []
  const second = structuredClone(first)
  second.pages[1].blocks.pop()
  const model = async (request) => {
    requests.push(JSON.parse(request.user))
    return JSON.stringify(requests.length === 1 ? first : second)
  }
  const result = await composePlan({ ...INPUT, profile, model })
  assert.equal(result.attempts.length, 2)
  const [problem] = requests[1].problems
  assert.equal(problem.at, 'pages[1].blocks[4].block')
  assert.equal(
    problem.message,
    'the trainers recipe does not list block block-181: the gallery blocks it lists are block-166; block block-181 goes on a trainer page; use one of those, or leave the block out'
  )
  assert.deepEqual(requests[1].firstPlan, first)
  assert.equal(requests[0].firstPlan, undefined)
  assert.deepEqual(result.attempts[1].problems, [])
})

test('the redo carries the first plan as the gate read it, after its own fixes, so every place points into it', async () => {
  const profile = florist()
  const services = profile.items.service.map((s) => s.id)
  const first = composition([homeOf(profile), trainers(profile), contactPage()])
  first.leftOut = [{ item: services[0], reason: 'Not this one.' }]
  first.pages[1].pageType = 'no-such-page'
  const requests = []
  const model = async (request) => {
    requests.push(JSON.parse(request.user))
    return JSON.stringify(first)
  }
  await assert.rejects(composePlan({ ...INPUT, profile, model }), { code: 'plan_gate_failed' })
  assert.deepEqual(requests[1].firstPlan.leftOut, [])
  assert.deepEqual(requests[1].firstPlan.pages, first.pages)
  assert.deepEqual(
    requests[1].problems.map((p) => p.at),
    ['pages[1].pageType']
  )
})
