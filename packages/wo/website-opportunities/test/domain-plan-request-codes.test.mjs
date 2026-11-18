// The codes and their parameters beside every line code writes after a change request (`result.codes`): a code per
// changed line (the kind of unit) with `changedParams` (page id and name, section id, label and label code, counts,
// names with their counts), `notDoneParams` and `notDoneReasons` for the not done lines. A line the model wrote keeps
// code null. Invented club, scripted fake model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { revisePlan } from '../domain/plan-request.mjs'
import { COACH, SERVICES, goodComposition } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, revision } from './fixtures/plan-composer/plan-request.mjs'

const run = async (first, text, changes, notDone = []) =>
  (await revisePlan(revision(first, text, answer(changes, notDone)).input)).codes

test('a page removed, renamed and its data taken off: a code and parameters per line', async () => {
  const first = await firstPlan()
  const removed = await run(first, 'Remove the contact page.', [
    { op: 'remove_page', page: 'contact', request: 'Remove the contact page', said: 'ok' }
  ])
  assert.deepEqual(removed.changed, ['page-removed', 'data-off'])
  assert.deepEqual(removed.changedParams[0], { page: 'contact', name: 'Contact' })
  assert.deepEqual(removed.changedParams[1], { names: [{ name: 'Email', count: 1 }], count: 1 })
  const renamed = await run(first, 'Rename the team page to Staff.', [
    { op: 'rename_page', page: 'team', name: 'Staff', request: 'Rename the team page', said: 'ok' }
  ])
  assert.deepEqual(renamed.changedParams, [{ page: 'team', from: 'Coaches', name: 'Staff' }])
})

test('a section removed: the page, the section and the code of its label; the photo counts follow', async () => {
  const first = await firstPlan()
  const codes = await run(first, 'Remove the photos.', [
    { op: 'remove_block', page: 'home', block: 'home-b4', request: 'Remove the photos', said: 'ok' }
  ])
  // The photos the owner took off fill no other frame either (`plan-picture-count.mjs`): the hero keeps its drawing,
  // so the drawn count does not change and has no line.
  assert.deepEqual(codes.changed, ['block-removed', 'data-off', 'pictures-own'])
  assert.deepEqual(codes.changedParams[0], {
    page: 'home',
    pageName: 'Home',
    block: 'home-b4',
    label: 'Photos',
    section: 'gallery'
  })
  assert.deepEqual(codes.changedParams[2], { count: 0 })
})

test('a section whose data changes: the names are grouped with their counts', async () => {
  const first = await firstPlan()
  const data = SERVICES.filter((id) => id !== 'service-cardio-tennis')
  const codes = await run(first, 'Stop showing cardio tennis.', [
    {
      op: 'set_block_data',
      page: 'home',
      block: 'home-b3',
      data,
      request: 'Stop showing cardio tennis',
      said: 'ok'
    }
  ])
  const at = codes.changed.indexOf('block-data')
  const params = codes.changedParams[at]
  assert.deepEqual(
    [params.page, params.block, params.section, params.count],
    ['home', 'home-b3', 'services', 3]
  )
  assert.ok(params.names.every((n) => typeof n.name === 'string' && n.count === 1))
})

test('the lines code writes itself for the owner carry parameters too', async () => {
  const first = await firstPlan()
  const refuse = [{ what: 'Rename the service.', reason: 'outside_plan', why: 'Not on the plan card.' }]
  const renamed = await run(first, 'Rename the service "Court hire" to "Court rental".', [], refuse)
  assert.deepEqual(renamed.changed, ['item_renamed'])
  assert.deepEqual(renamed.changedParams, [
    { item: 'service-court-hire', from: 'Court hire', name: 'Court rental' }
  ])
  const composition = goodComposition()
  composition.pages[0].blocks[2].data = SERVICES.filter((id) => id !== 'service-cardio-tennis')
  composition.leftOut.push({
    item: 'service-cardio-tennis',
    reason: 'This is longer than the section can show.'
  })
  const hidden = await run(
    await firstPlan(composition),
    'Remove the service "Cardio tennis". It is the same class as another one.',
    [],
    [{ what: 'Remove the service', reason: 'outside_plan', why: 'That service is not shown.' }]
  )
  assert.deepEqual(hidden.changed, ['item_taken_off'])
  assert.deepEqual(hidden.changedParams, [{ item: 'service-cardio-tennis', name: 'Cardio tennis' }])
})

test('not done lines: the kind of refusal for every line, code and parameters for the ones code wrote', async () => {
  const first = await firstPlan()
  const model = await run(
    first,
    'Add a blog.',
    [],
    [{ what: 'A blog', reason: 'no_recipe', why: 'No blog page.' }]
  )
  assert.deepEqual([model.notDone, model.notDoneParams, model.notDoneReasons], [[null], [{}], ['no_recipe']])
  const empty = await run(first, 'Make the site pop.', [])
  assert.deepEqual([empty.notDone, empty.notDoneReasons], [['nothing_to_change'], ['outside_plan']])
  const unfilled = await run(first, 'Add reviews to the contact page.', [
    {
      op: 'add_block',
      page: 'contact',
      add: { block: 'tracy-reviews', label: 'Reviews', data: [], reason: 'What members say.' },
      request: 'Add reviews to the contact page',
      said: 'ok'
    }
  ])
  assert.deepEqual(unfilled.notDone, ['section_not_filled'])
  assert.deepEqual(unfilled.notDoneParams, [{ name: 'Reviews' }])
  assert.deepEqual(unfilled.notDoneReasons, ['no_data'])
})

test('a page the plan already has is refused with a code and the name asked for', async () => {
  const first = await firstPlan()
  const twin = {
    op: 'add_page',
    pageType: 'team',
    name: 'Staff',
    blocks: [{ block: 'team-cards', label: 'Coach', data: [COACH], reason: 'Your head coach.' }],
    request: 'add a staff page',
    said: 'ok'
  }
  const codes = await run(first, 'Please add a staff page.', [twin])
  assert.deepEqual([codes.notDone, codes.notDoneParams], [['page_already_on_plan'], [{ name: 'Staff' }]])
})
