// The change request's lines and what it never shows (ticket #617): a real change the model wrote no line for, a
// section with no data, a request naming a held person. Invented club, scripted fake model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { WITHHELD_REASON, withWithheld } from '../domain/plan-withheld.mjs'
import { COACH, clubProfile, goodComposition } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, revision } from './fixtures/plan-composer/plan-request.mjs'

const ok = (doc) => assert.deepEqual(checkBuildDocument(doc), { ok: true, problems: [] })

test('a real change the model wrote no line for gets a line code writes', async () => {
  const first = await firstPlan()
  // Taking the contact page off also takes the email off the site: the gate leaves it out, and the customer is told.
  const { input } = revision(
    first,
    'Remove the contact page.',
    answer([
      {
        op: 'remove_page',
        page: 'contact',
        request: 'Remove the contact page',
        said: 'The Contact page is removed.'
      }
    ])
  )
  const result = await revisePlan(input)
  assert.deepEqual(result.changed, ['The Contact page is removed.', 'No longer shown: Email.'])
  assert.ok(result.plan.leftOut.some((e) => e.what === 'Email'))
})

test('a request for a section with no data is reported as not done with a reason; nothing is invented', async () => {
  const first = await firstPlan()
  const { input } = revision(
    first,
    'Add reviews to the contact page.',
    answer([
      {
        op: 'add_block',
        page: 'contact',
        add: { block: 'tracy-reviews', label: 'Reviews', data: [], reason: 'What members say.' },
        request: 'Add reviews to the contact page',
        said: 'Reviews are on Contact.'
      }
    ])
  )
  const result = await revisePlan(input)
  assert.equal(result.unchanged, true)
  assert.deepEqual(result.changed, [])
  assert.deepEqual(
    result.notDone.map((e) => [e.what, e.reason]),
    [['Reviews', 'no_data']]
  )
  ok(result.revision)
})

test('a request naming a held person: not done as kept private, and the name shows nowhere', async () => {
  const held = withWithheld(clubProfile(), { withheld: { people: ['Ilse Varrow'] } })
  const composition = goodComposition()
  composition.pages = composition.pages.filter((p) => p.pageType !== 'team')
  composition.assumptions = []
  const first = await firstPlan(composition, held)
  assert.ok(first.plan.leftOut.some((e) => e.reason === WITHHELD_REASON))
  const text = 'Add a page about Ilse Varrow, our coach.'
  const naming = answer(
    [
      {
        op: 'add_block',
        page: 'team',
        add: { block: 'team-cards', label: 'Ilse Varrow', data: [COACH], reason: 'Your coach.' },
        request: 'Add a page about Ilse Varrow',
        said: 'Ilse Varrow is shown.'
      }
    ],
    [
      {
        what: 'A page about Ilse Varrow',
        reason: 'kept_private',
        why: 'You keep her private.',
        request: text
      }
    ]
  )
  const neutral = answer(
    [],
    [
      {
        what: 'A page about a team member',
        reason: 'kept_private',
        why: 'You asked to keep this person off the site.',
        request: text
      }
    ]
  )
  const { input } = revision(first, text, naming, neutral)
  const result = await revisePlan(input)
  assert.ok(result.attempts[0].problems.some((p) => p.code === 'request_text_invalid'))
  assert.equal(result.unchanged, true)
  assert.deepEqual(
    result.notDone.map((e) => e.reason),
    ['kept_private']
  )
  assert.doesNotMatch(JSON.stringify([result.plan, result.revision]), /Ilse|Varrow/)
})
