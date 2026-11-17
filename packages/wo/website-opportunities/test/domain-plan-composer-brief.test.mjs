// The plan composer inherits the step chain's site planner (gap audit of the plan stage, 17/11/2026): the brief's key
// messages, audience, voice and held fields reach its model; what no block can show (WhatsApp, a second phone,
// Google's rating) is in the plan's left out list instead of lost; a failing plan gets two fix rounds, each carrying
// the last plan and its problems. Invented club, scripted fake model only: no test calls a real model, so the
// quality of a real model's plan is not judged here.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan, PLAN_COMPOSE_ATTEMPTS, PLAN_COMPOSER_PROMPT } from '../domain/plan-composer.mjs'
import {
  BRIEF_LEFT_OUT,
  briefContextOf,
  briefLeftOutOf,
  NEUTRAL_HELD_REASON
} from '../domain/plan-composer-brief.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const WHATSAPP = '+00 555 0100 77'
const SECOND = '+00 555 0100 88'
const HELD_NAME = 'Old Court Invented Club'
const brief = () => ({
  keyMessages: [
    { id: 'km-1', label: 'Coaching for every age, from first serve to league play', factRefs: ['f1'] },
    { id: 'km-2', label: 'friendly coaches', basis: 'praise', factRefs: ['f2'] }
  ],
  reading: { audience: [{ label: 'Families with children learning tennis', quote: 'kids love it' }] },
  brand: { voice: 'Warm and encouraging' },
  missing: [
    { field: 'prices', why: 'No supported price is available in the business reading: show no price.' },
    {
      field: 'hours',
      why: 'The sources disagree on the opening hours: show no hours, not even sample hours, until the owner confirms them.'
    },
    {
      field: 'name',
      why: `Sources call the business ${HELD_NAME}: write no business name.`,
      values: [HELD_NAME]
    },
    { field: 'socials', why: `The owner left ${HELD_NAME} Instagram off.`, values: [HELD_NAME] }
  ],
  contact: { whatsapp: { number: WHATSAPP, href: 'https://wa.me/000555010077' } },
  business: { otherPhones: [{ phone: SECOND }] },
  googlePlace: { rating: 4.7, userRatingCount: 31 }
})
const inputs = (model, overrides = {}) => ({
  profile: clubProfile(),
  blockStore: blockStore(),
  pageRecipes: pageRecipes(),
  library: library(),
  template: template(),
  brand: brand(),
  planId: 'plan-club',
  model,
  ...overrides
})
const inventing = () => {
  const c = goodComposition()
  c.pages[0].blocks[2].data.push('service-padel-nights')
  return c
}

test('the brief context holds key messages, audience, voice and held fields, never a held value', () => {
  const context = briefContextOf(brief())
  assert.deepEqual(context.keyMessages, [
    'Coaching for every age, from first serve to league play',
    'Customers praise: friendly coaches'
  ])
  assert.deepEqual(context.audience, ['Families with children learning tennis'])
  assert.equal(context.voice, 'Warm and encouraging')
  assert.deepEqual(
    context.held.map((h) => h.field),
    ['prices', 'hours', 'name', 'socials']
  )
  assert.match(context.held[1].why, /sources disagree on the opening hours/)
  assert.equal(context.held[2].why, NEUTRAL_HELD_REASON)
  assert.equal(context.held[3].why, NEUTRAL_HELD_REASON)
  assert.ok(!JSON.stringify(context).includes(HELD_NAME))
  assert.equal(briefContextOf({}), null)
  assert.equal(briefContextOf(null), null)
})

test('what no block can show is left out with a plain reason, its value never repeated', () => {
  const entries = briefLeftOutOf(brief())
  assert.deepEqual(
    entries.map((e) => [e.what, e.kind, e.code]),
    [
      ['WhatsApp', 'feature', 'stated'],
      ['Other phone numbers', 'feature', 'stated'],
      ['Google rating', 'feature', 'stated']
    ]
  )
  assert.ok(!JSON.stringify(entries).match(/555|4\.7/))
  assert.deepEqual(briefLeftOutOf({ googlePlace: {} }), [])
})

test('the composer model reads the brief context; the plan card lists what no block can show', async () => {
  const model = scriptedModel(JSON.stringify(goodComposition()))
  const { plan } = await composePlan(inputs(model, { brief: brief() }))
  const sent = JSON.parse(model.calls[0].user)
  assert.deepEqual(Object.keys(sent).sort(), ['blocks', 'brief', 'business', 'language', 'recipes'])
  assert.deepEqual(sent.brief, briefContextOf(brief()))
  for (const value of [WHATSAPP, SECOND, HELD_NAME, '4.7'])
    assert.ok(!model.calls[0].user.includes(value), value)
  const listed = plan.leftOut.filter((e) => Object.values(BRIEF_LEFT_OUT).some((b) => b.what === e.what))
  assert.deepEqual(
    listed.map((e) => [e.what, e.reason, e.code]),
    Object.values(BRIEF_LEFT_OUT).map((b) => [b.what, b.reason, 'stated'])
  )
  assert.deepEqual(checkBuildDocument(plan), { ok: true, problems: [] })
})

test('without a brief the request and the left out list are as before', async () => {
  const model = scriptedModel(JSON.stringify(goodComposition()))
  const { plan } = await composePlan(inputs(model))
  assert.ok(!('brief' in JSON.parse(model.calls[0].user)))
  assert.ok(!plan.leftOut.some((e) => e.what === 'WhatsApp'))
})

test('two fix rounds like the step chain: each carries the problems and the last plan as the gate read it', async () => {
  assert.equal(PLAN_COMPOSE_ATTEMPTS, 3)
  const model = scriptedModel(
    JSON.stringify(inventing()),
    JSON.stringify(inventing()),
    JSON.stringify(goodComposition())
  )
  const { attempts } = await composePlan(inputs(model))
  assert.equal(model.calls.length, 3)
  assert.deepEqual(
    attempts.map((a) => a.problems.map((p) => p.code)),
    [['invented_item'], ['invented_item'], []]
  )
  for (const call of model.calls.slice(1)) {
    const sent = JSON.parse(call.user)
    assert.deepEqual(
      sent.problems.map((p) => p.at),
      ['pages[0].blocks[2].data[4]']
    )
    assert.ok(sent.firstPlan.pages[0].blocks[2].data.includes('service-padel-nights'))
  }
})

test('the prompt keeps the step chain planner rules that shape the plan card', () => {
  for (const heading of [
    '## Your job',
    '## Input 1: the business',
    '## Input 2: the template form',
    '## One job per block',
    '## Trade knowledge',
    '## What you may decide',
    '## What you must never do',
    '## How to work',
    '## Output: the site plan',
    '## Self-check before you answer',
    '## After you answer'
  ])
    assert.ok(PLAN_COMPOSER_PROMPT.includes(`\n${heading}\n`), heading)
  for (const rule of [
    /Fix only\s+what they name, keep every other decision as it is/,
    /at most two such\s+rounds/,
    /the\s+question it answers, the message it gets across, or the proof/,
    /`keyMessages\[\]`/,
    /`held\[\]`/,
    /Keep it only when the business has an email its answers\s+can go to/,
    /never more than the business has true\s+items for/,
    /Never promise a contact channel/
  ])
    assert.match(PLAN_COMPOSER_PROMPT, rule)
  // An en or em dash, written by code point.
  assert.doesNotMatch(PLAN_COMPOSER_PROMPT, new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`))
})
