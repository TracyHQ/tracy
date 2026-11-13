// The pages and sections of a change request (ticket #617, review of 2026-11-14): a main section never leaves with
// its page unasked, a removed page takes its own data off the site, ids survive a revision, a new page cannot be a
// target, duplicates are refused, and the lines name the final state. Invented club, scripted fake model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { composePlan } from '../domain/plan-composer.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { REMOVED_PAGE_DATA_REASON } from '../domain/plan-request-apply.mjs'
import {
  COACH,
  SERVICES,
  clubProfile,
  goodComposition,
  scriptedModel
} from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, kit, requestFor, revision } from './fixtures/plan-composer/plan-request.mjs'

const codes = (result, n = 0) => result.attempts[n].problems.map((p) => p.code)
const shown = (plan) => new Set(plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
const lessons = (name) => ({
  op: 'add_page',
  pageType: 'services',
  name,
  blocks: [{ block: 'services-grid', label: 'Lessons', data: SERVICES.slice(0, 3), reason: 'Your lessons.' }],
  request: 'add a page with our lessons'
})

test('removing the main section of a page is a problem for the re-compose, never a page silently gone', async () => {
  const first = await firstPlan()
  const banner = answer([
    { op: 'remove_block', page: 'home', block: 'home-b2', request: 'Remove the main banner' }
  ])
  const refusing = answer(
    [],
    [{ what: 'The main banner', reason: 'outside_plan', why: 'A page keeps its main section.' }]
  )
  const { input } = revision(first, 'Remove the main banner.', banner, refusing)
  const result = await revisePlan(input)
  assert.deepEqual(codes(result), ['main_block_removed'])
  assert.match(result.attempts[0].problems[0].message, /cannot lose its main section/)
  assert.equal(result.plan, first.plan)
  // Emptying the main section loses the page in the gate: also a problem, with the same message.
  const emptied = answer([
    { op: 'set_block_data', page: 'team', block: 'team-b1', data: [], request: 'Remove the coach section' }
  ])
  const again = revision(first, 'Remove the coach section.', emptied, refusing)
  const second = await revisePlan(again.input)
  assert.ok(codes(second).includes('page_lost'))
  assert.equal(second.plan, first.plan)
})

test('a removed page takes the data only it showed off the site, with the removed page reason; a free block does not take it', async () => {
  const k = kit()
  k.pageRecipes.recipes.find((r) => r.pageType === 'home').blocks.push('team-cards')
  const composed = await composePlan({
    ...k,
    profile: clubProfile(),
    answers: [],
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  const model = scriptedModel(
    answer([{ op: 'remove_page', page: 'team', request: 'Remove the coaches page' }])
  )
  const result = await revisePlan({
    ...k,
    plan: composed.plan,
    profile: composed.profile,
    request: requestFor(composed.plan, 'Remove the coaches page.'),
    model
  })
  assert.ok(!shown(result.plan).has(COACH))
  assert.deepEqual(result.changed, ['The Coaches page is removed.', 'No longer shown: Ilse Varrow.'])
  assert.ok(
    result.plan.leftOut.some((e) => e.what === 'Ilse Varrow' && e.reason === REMOVED_PAGE_DATA_REASON)
  )
})

test('after removing a block in the middle, every surviving block keeps its id and data, and assumptions still resolve', async () => {
  const composition = goodComposition()
  composition.assumptions.push(
    { field: 'pages[home].blocks[home-b5].data', said: 'Your contact strip shows the phone first.' },
    { field: 'pages[home].blocks[home-b4].data', said: 'Your own photos come first.' }
  )
  const first = await firstPlan(composition)
  const { input } = revision(
    first,
    'Remove the photos.',
    answer([{ op: 'remove_block', page: 'home', block: 'home-b4', request: 'Remove the photos' }])
  )
  const result = await revisePlan(input)
  const blocksOf = (plan) => new Map(plan.pages.flatMap((p) => p.blocks.map((b) => [b.id, b])))
  const before = blocksOf(first.plan)
  const after = blocksOf(result.plan)
  assert.deepEqual(
    [...after.keys()],
    [...before.keys()].filter((id) => id !== 'home-b4')
  )
  for (const [id, b] of after)
    assert.deepEqual([b.block, b.data], [before.get(id).block, before.get(id).data])
  for (const a of result.plan.assumptions) {
    const m = /^pages\[([^\]]+)\](?:\.blocks\[([^\]]+)\])?/.exec(a.field)
    if (m?.[2]) assert.equal(after.get(m[2]).block, before.get(m[2]).block)
  }
  assert.ok(result.plan.assumptions.some((a) => a.field === 'pages[home].blocks[home-b5].data'))
  // An assumption on the removed section goes with it.
  assert.ok(first.plan.assumptions.some((a) => a.field.includes('home-b4')))
  assert.ok(!result.plan.assumptions.some((a) => a.field.includes('home-b4')))
})

test('a page or block this answer adds cannot be removed or renamed by it', async () => {
  const first = await firstPlan()
  const text = 'Add a page with our lessons. Then remove that page.'
  const { input } = revision(
    first,
    text,
    answer([lessons('Lessons'), { op: 'remove_page', page: 'new-0', request: 'remove that page' }]),
    answer()
  )
  const result = await revisePlan(input)
  assert.deepEqual(codes(result), ['change_target_new'])
})

test('a page the plan already has is not added again; a name another page has is a problem', async () => {
  const first = await firstPlan()
  const text = 'add a page with our lessons'
  const { input } = revision(first, text, answer([lessons('Lessons'), lessons('Lessons again')]))
  const result = await revisePlan(input)
  assert.deepEqual(result.changed, ['A Lessons page is added.'])
  assert.deepEqual(result.notDone, [
    { what: 'Lessons again', reason: 'outside_plan', why: 'The plan already has this page.' }
  ])
  // A page of the same type with other main data (a detail page of another item) is another page.
  const other = { ...lessons('Court hire'), blocks: [{ ...lessons('x').blocks[0], data: SERVICES.slice(1) }] }
  const two = revision(first, text, answer([lessons('Lessons'), other]))
  assert.deepEqual(
    (await revisePlan(two.input)).plan.pages.map((p) => p.id),
    ['home', 'team', 'contact', 'services-r2', 'services-r2-2']
  )
  const taken = revision(
    first,
    'Rename the contact page to Home.',
    answer([
      { op: 'rename_page', page: 'contact', name: 'Home', request: 'Rename the contact page to Home' }
    ]),
    answer()
  )
  assert.deepEqual(codes(await revisePlan(taken.input)), ['page_name_taken'])
})

test('lines name the final state, and the pictures estimate a revision changes has its line', async () => {
  const first = await firstPlan()
  const twice = revision(
    first,
    'Rename the contact page to Visit us, no, to Find us.',
    answer([
      {
        op: 'rename_page',
        page: 'contact',
        name: 'Visit us',
        request: 'Rename the contact page to Visit us'
      },
      { op: 'rename_page', page: 'contact', name: 'Find us', request: 'to Find us' }
    ])
  )
  assert.deepEqual((await revisePlan(twice.input)).changed, ['The Contact page is now called Find us.'])
  const photos = revision(
    first,
    'Remove the photos.',
    answer([{ op: 'remove_block', page: 'home', block: 'home-b4', request: 'Remove the photos' }])
  )
  const result = await revisePlan(photos.input)
  assert.deepEqual(result.changed.slice(-2), [
    'The plan now uses 1 photo of yours.',
    'No picture will be drawn now.'
  ])
})
