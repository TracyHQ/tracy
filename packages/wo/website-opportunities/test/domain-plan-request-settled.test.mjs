// What a change request keeps (ticket #617): the customer's earlier answers and plan edits survive a request that does
// not name them, even when the fake model tries to undo them; a request that names one wins and says so. Invented club,
// scripted fake model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { PHONE_QUESTION, SERVICES, answer as reply } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, kit, revision } from './fixtures/plan-composer/plan-request.mjs'

const PHONE = '+1 555 0142 700'
const edit = (plan, changes) => ({
  schema: 'tracy-build-plan-edit/v1',
  id: `edit-${plan.revision}`,
  plan: { id: plan.id, revision: plan.revision },
  changes
})
/** The first plan with the phone answered, then edited on the plan card in one edit. */
async function editedPlan() {
  const first = await firstPlan(undefined, undefined, [reply(PHONE_QUESTION, { text: PHONE })])
  const k = kit()
  const gated = gateEditedPlan({
    ...k,
    plan: first.plan,
    profile: first.profile,
    edit: edit(first.plan, [
      { field: 'pages[team].name', value: 'Our coaches' },
      { field: 'items[service-junior-coaching].label', value: 'Junior academy' },
      { field: 'facts[contact-hours].value', value: 'Mon to Sat 8:00 to 21:00' },
      { field: 'pages[home].blocks[home-b3].data', value: SERVICES.slice(0, 3) },
      { field: 'look.accent', value: '#2a6f4a' },
      { field: 'look.logo', value: { kind: 'text' } },
      { field: 'language', value: 'de' },
      { field: 'pictures.generated.frames', value: 0 }
    ])
  })
  assert.equal(gated.ok, true, JSON.stringify(gated.problems))
  return { plan: gated.plan, profile: gated.profile }
}
const fact = (plan, id) => plan.facts.find((f) => f.id === id)?.value
const settledOf = (plan) => ({
  team: plan.pages.find((p) => p.id === 'team')?.name,
  label: plan.items.find((i) => i.id === 'service-junior-coaching').label,
  hours: fact(plan, 'contact-hours'),
  phone: fact(plan, 'contact-phone'),
  services: plan.pages[0].blocks.find((b) => b.block === 'services-grid').data,
  accent: plan.look.accent,
  logo: plan.look.logo.kind,
  language: plan.language,
  generated: plan.pictures.generated.frames,
  modelAssumption: plan.assumptions.some((a) => a.id === 'model-1')
})

test('earlier customer answers and structured edits survive a request that does not mention them', async () => {
  const edited = await editedPlan()
  const before = settledOf(edited.plan)
  assert.equal(before.phone, PHONE)
  const { input } = revision(
    edited,
    'Put the contact page right after home.',
    answer([
      {
        op: 'order_pages',
        pages: ['home', 'contact', 'team'],
        request: 'Put the contact page right after home',
        said: 'Contact now comes right after Home.'
      }
    ])
  )
  const result = await revisePlan(input)
  assert.deepEqual(
    result.plan.pages.map((p) => p.id),
    ['home', 'contact', 'team']
  )
  assert.deepEqual(settledOf(result.plan), before)
  // The service the customer took off stays off: the gate's placement does not bring it back.
  assert.ok(!result.plan.pages.some((p) => p.blocks.some((b) => b.data.includes(SERVICES[3]))))
  assert.equal(checkBuildDocument(result.plan).ok, true)
})

test('a request that does not mention an earlier edit: the edit survives even when the fake model drops it', async () => {
  const edited = await editedPlan()
  const before = settledOf(edited.plan)
  const dropping = answer([
    {
      op: 'order_pages',
      pages: ['home', 'contact', 'team'],
      request: 'Put the contact page right after home',
      said: 'Contact comes after Home.'
    },
    {
      op: 'rename_page',
      page: 'team',
      name: 'Coaches',
      request: 'keep the usual page names',
      said: 'Coaches is back.'
    },
    {
      op: 'set_block_data',
      page: 'home',
      block: 'home-b3',
      data: SERVICES,
      request: 'show everything',
      said: 'All services show.'
    }
  ])
  const keeping = answer([
    {
      op: 'order_pages',
      pages: ['home', 'contact', 'team'],
      request: 'Put the contact page right after home',
      said: 'Contact comes after Home.'
    }
  ])
  const { input } = revision(edited, 'Put the contact page right after home.', dropping, keeping)
  const result = await revisePlan(input)
  assert.deepEqual(
    result.attempts[0].problems.map((p) => p.code),
    ['change_unlinked', 'change_unlinked']
  )
  assert.deepEqual(settledOf(result.plan), before)
})

test('a request that contradicts an earlier structured edit: the request wins, and changed says so', async () => {
  const edited = await editedPlan()
  const { input } = revision(
    edited,
    'Rename the coaches page to Tennis coaches.',
    answer([
      {
        op: 'rename_page',
        page: 'team',
        name: 'Tennis coaches',
        request: 'Rename the coaches page to Tennis coaches',
        said: 'The Our coaches page is now called Tennis coaches.'
      }
    ])
  )
  const result = await revisePlan(input)
  assert.equal(result.plan.pages.find((p) => p.id === 'team').name, 'Tennis coaches')
  assert.deepEqual(result.changed, ['The Our coaches page is now called Tennis coaches.'])
  const { team: _team, ...rest } = settledOf(edited.plan)
  const { team, ...after } = settledOf(result.plan)
  assert.equal(team, 'Tennis coaches')
  assert.deepEqual(after, rest)
})
