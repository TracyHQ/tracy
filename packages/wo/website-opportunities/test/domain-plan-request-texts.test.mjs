// The model's texts of a change request (ticket #617, review of 2026-11-14): no word of a held name, no invented claim
// in a page name or a not done line, no template name; and the look a customer chose survives a revision without the
// template look rules turning against it. Invented club, scripted fake model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { heldWordsOf } from '../domain/plan-request-claims.mjs'
import { withWithheld } from '../domain/plan-withheld.mjs'
import { clubProfile, goodComposition } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, kit, revision } from './fixtures/plan-composer/plan-request.mjs'

const codes = (result, n = 0) => result.attempts[n].problems.map((p) => p.code)
const rename = (name) => ({ op: 'rename_page', page: 'contact', name, request: 'Rename the contact page' })
const notDone = (what, why) => answer([], [{ what, reason: 'fact_missing', why }])
async function heldPlan(withheld, answers = []) {
  const composition = goodComposition()
  composition.pages = composition.pages.filter((p) => p.pageType !== 'team')
  composition.assumptions = []
  return firstPlan(composition, withWithheld(clubProfile(), { withheld }), answers)
}

test('a page name or not done line naming a distinctive word of a held name fails; a common word does not', async () => {
  const first = await heldPlan({ people: ['Ilse Varrow'], name: true, siteName: 'Fernhollow Courts' })
  for (const name of ['Brindlewick team', 'Ilse corner', 'Varrow corner']) {
    const { input } = revision(first, 'Rename the contact page.', answer([rename(name)]), answer())
    assert.deepEqual(codes(await revisePlan(input)), ['request_text_invalid'], name)
  }
  const line = revision(
    first,
    'Rename the contact page.',
    notDone('A page for Ilse', 'You keep this off the site.'),
    answer()
  )
  assert.deepEqual(codes(await revisePlan(line.input)), ['request_text_invalid'])
  const common = revision(first, 'Rename the contact page.', answer([rename('Tennis club contact')]))
  assert.deepEqual(codes(await revisePlan(common.input)), [])
  // A word the site shows elsewhere (the site name, a service) is no word of the held name alone.
  assert.deepEqual(heldWordsOf(['Fernhollow Tennis Club'], ['Fernhollow Courts', 'Cardio tennis']), [])
})

test('a held business name the customer chose to show as the site name is not blocked', async () => {
  // The customer answered the site name question with the held name itself (#593): that name is no longer held.
  const name = { schema: 'tracy-build-answer/v1', question: 'site-name', text: 'Brindlewick Tennis Club' }
  const first = await heldPlan({ people: ['Ilse Varrow'], name: true }, [name])
  const { input } = revision(first, 'Rename the contact page.', answer([rename('Brindlewick contact')]))
  assert.deepEqual(codes(await revisePlan(input)), [])
  const person = revision(first, 'Rename the contact page.', answer([rename('Ilse corner')]), answer())
  assert.deepEqual(codes(await revisePlan(person.input)), ['request_text_invalid'])
})

test('invented claims fail in a not done why and in a page name, numbers in words and "most" included', async () => {
  const first = await firstPlan()
  for (const [what, why] of [
    ['Say we have 500 members', 'You have 500 members.'],
    ['A members count', 'You have five hundred members.'],
    ['A price line', 'Lessons cost fifteen dollars.'],
    ['A claim', 'You are the most trusted club around.']
  ]) {
    const { input } = revision(first, 'Say we have many members.', notDone(what, why), answer())
    assert.ok(codes(await revisePlan(input)).includes('request_text_invalid'), why)
  }
  for (const name of ['The most trusted club', 'Five hundred members']) {
    const { input } = revision(first, 'Rename the contact page.', answer([rename(name)]), answer())
    assert.deepEqual(codes(await revisePlan(input)), ['request_text_invalid'], name)
  }
  // The kind of claim refused may be named: "an award" is no claim of one.
  const honest = revision(
    first,
    'Say we won awards.',
    notDone('An awards claim', 'No source of yours mentions an award.')
  )
  assert.deepEqual(codes(await revisePlan(honest.input)), [])
})

test('a text naming the template fails', async () => {
  const first = await firstPlan()
  const { input } = revision(
    first,
    'Rename the contact page.',
    answer([rename('Example Court contact')]),
    answer()
  )
  assert.deepEqual(codes(await revisePlan(input)), ['request_text_invalid'])
})

test('a look the customer chose stays after a revision, and the template look rules hold for the rest', async () => {
  const first = await firstPlan()
  for (const value of [{ kind: 'text' }]) {
    const gated = gateEditedPlan({
      ...kit(),
      plan: first.plan,
      profile: first.profile,
      edit: {
        schema: 'tracy-build-plan-edit/v1',
        id: 'edit-1',
        plan: { id: first.plan.id, revision: 1 },
        changes: [
          { field: 'look.logo', value },
          { field: 'look.accent', value: '#2a6f4a' }
        ]
      }
    })
    const { input } = revision(
      { plan: gated.plan, profile: gated.profile },
      'Remove the coaches page.',
      answer([{ op: 'remove_page', page: 'team', request: 'Remove the coaches page' }])
    )
    const result = await revisePlan(input)
    assert.deepEqual(codes(result), [])
    assert.deepEqual(result.plan.look.logo, value)
    assert.equal(result.plan.look.accent, '#2a6f4a')
  }
})
