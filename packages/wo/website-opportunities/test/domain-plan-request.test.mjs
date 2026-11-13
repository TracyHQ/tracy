// The plan step's change request (ticket #617): the customer's own words revise the plan through the scripted fake
// model, the same rules gate as a first plan and its single re-compose. Invented club, invented template, no real model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { PLAN_REQUEST_PROMPT, revisePlan } from '../domain/plan-request.mjs'
import { REQUESTED_OFF_REASON } from '../domain/plan-request-taken-off.mjs'
import { REMOVED_PAGE_REASON } from '../domain/plan-request-settled.mjs'
import { PHOTOS, SERVICES } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, revision } from './fixtures/plan-composer/plan-request.mjs'

const ok = (doc) => assert.deepEqual(checkBuildDocument(doc), { ok: true, problems: [] })
const pageIds = (plan) => plan.pages.map((p) => p.id)
const shown = (plan) => new Set(plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))

test('a request to remove a page returns a revised plan that passes the rules gate', async () => {
  const first = await firstPlan()
  const text = 'Please drop the coaches page, we rarely use it.'
  const { input, model } = revision(
    first,
    text,
    answer([
      {
        op: 'remove_page',
        page: 'team',
        request: 'drop the coaches page',
        said: 'The Coaches page is removed.'
      }
    ])
  )
  const result = await revisePlan(input)
  assert.equal(model.calls.length, 1)
  assert.equal(model.calls[0].system, PLAN_REQUEST_PROMPT)
  assert.match(PLAN_REQUEST_PROMPT, /DRAFT, not approved/)
  assert.equal(JSON.parse(model.calls[0].user).request, text)
  assert.deepEqual(pageIds(result.plan), ['home', 'contact'])
  assert.equal(result.plan.revision, first.plan.revision + 1)
  assert.equal(result.plan.id, first.plan.id)
  assert.equal(result.unchanged, false)
  // The coach only that page showed leaves the site with it, and the customer is told.
  assert.deepEqual(result.changed, ['The Coaches page is removed.', 'No longer shown: Ilse Varrow.'])
  assert.ok(result.plan.leftOut.some((e) => e.what === 'Coaches' && e.reason === REMOVED_PAGE_REASON))
  ok(result.plan)
  ok(result.revision)
})

test('a request to add a page the template has a recipe for returns a revised plan that passes the rules gate', async () => {
  const first = await firstPlan()
  const add = {
    op: 'add_page',
    pageType: 'services',
    name: 'Lessons',
    after: 'home',
    blocks: [
      {
        block: 'services-grid',
        label: 'Lessons',
        data: SERVICES.slice(0, 3),
        reason: 'Your lessons, juniors first.'
      }
    ],
    request: 'add a page with our lessons',
    said: 'A Lessons page is added after Home.'
  }
  const { input } = revision(first, 'Could you add a page with our lessons?', answer([add]))
  const result = await revisePlan(input)
  // A page the revision adds gets an id tagged with the revision, so it never takes an id the plan used before.
  assert.deepEqual(pageIds(result.plan), ['home', 'services-r2', 'team', 'contact'])
  assert.deepEqual(result.changed, ['A Lessons page is added.'])
  ok(result.plan)
})

test('a request to remove a section returns a revised plan that passes the rules gate; its data stays off', async () => {
  const first = await firstPlan()
  const { input } = revision(
    first,
    'Remove the photos from the home page.',
    answer([
      {
        op: 'remove_block',
        page: 'home',
        block: 'home-b4',
        request: 'Remove the photos',
        said: 'The photos are off Home.'
      }
    ])
  )
  const result = await revisePlan(input)
  const home = result.plan.pages.find((p) => p.id === 'home')
  assert.ok(!home.blocks.some((b) => b.block === 'gallery-strip'))
  // The gate's placement does not bring the photos back: they are left out at the customer's request.
  for (const id of PHOTOS) assert.ok(!shown(result.plan).has(id))
  assert.equal(result.plan.leftOut.filter((e) => e.reason === REQUESTED_OFF_REASON).length, PHOTOS.length)
  // The pictures summary is counted again for the revised pages, not copied.
  assert.equal(first.plan.pictures.own.frames, 3)
  assert.ok(result.plan.pictures.own.frames < 3)
  ok(result.plan)
})

test('a request to change the order of pages returns a revised plan that passes the rules gate', async () => {
  const first = await firstPlan()
  const { input } = revision(
    first,
    'Put contact before the coaches.',
    answer([
      {
        op: 'order_pages',
        pages: ['home', 'contact', 'team'],
        request: 'Put contact before the coaches',
        said: 'Contact now comes before Coaches.'
      }
    ])
  )
  const result = await revisePlan(input)
  assert.deepEqual(pageIds(result.plan), ['home', 'contact', 'team'])
  assert.deepEqual(result.changed, ['The pages are now in this order: Home, Contact, Coaches.'])
  ok(result.plan)
})

test('the result lists what changed in words the customer can read, and passes the Contract B check', async () => {
  const first = await firstPlan()
  const { input } = revision(
    first,
    'Call the coaches page Our team. Keep the home page name.',
    answer([
      {
        op: 'rename_page',
        page: 'team',
        name: 'Our team',
        request: 'Call the coaches page Our team',
        said: 'Coaches is now called Our team.'
      },
      // A change that changes nothing: its line has no real change behind it and is dropped.
      {
        op: 'rename_page',
        page: 'home',
        name: 'Home',
        request: 'Keep the home page name',
        said: 'Home got a fresh name.'
      }
    ])
  )
  const result = await revisePlan(input)
  // The line is written by code from the real difference, never the model's `said`.
  assert.deepEqual(result.changed, ['The Coaches page is now called Our team.'])
  assert.deepEqual(result.revision, {
    schema: 'tracy-build-plan-revision/v1',
    request: 'request-1',
    plan: { id: 'plan-club', revision: 2 },
    changed: ['The Coaches page is now called Our team.'],
    notDone: []
  })
  ok(result.revision)
})

test('a request for something with no recipe is reported as not done with a reason; nothing is invented', async () => {
  const first = await firstPlan()
  const notDone = [
    {
      what: 'A prices page',
      reason: 'no_recipe',
      why: 'Your template has no prices page.',
      request: 'add a prices page'
    }
  ]
  const { input, model } = revision(
    first,
    'Please add a prices page.',
    // The first answer adds a page type the template has no recipe for: the gate refuses it.
    answer([
      {
        op: 'add_page',
        pageType: 'prices',
        name: 'Prices',
        blocks: [{ block: 'services-grid', label: 'Prices', data: SERVICES, reason: 'Your prices.' }],
        request: 'add a prices page',
        said: 'A Prices page is added.'
      }
    ]),
    answer([], notDone)
  )
  const result = await revisePlan(input)
  assert.equal(model.calls.length, 2)
  assert.ok(result.attempts[0].problems.some((p) => p.code === 'unknown_page_type'))
  assert.equal(result.unchanged, true)
  assert.equal(result.plan, first.plan)
  assert.deepEqual(result.notDone, [
    { what: 'A prices page', reason: 'no_recipe', why: 'Your template has no prices page.' }
  ])
  ok(result.revision)
})
