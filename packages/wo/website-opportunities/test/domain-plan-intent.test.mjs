// The plan stage restore of the step chain's site plan (#575): each page carries its visitor question, key message,
// search intent and end action; each block its point and the key messages it carries; every key message has a place on
// the home page; WhatsApp and a second phone go where the template has a field for them; the owner gets a later list;
// reviews are shown on purpose. Invented club and invented template only, scripted fake model: no real model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import {
  answer,
  goodComposition,
  scriptedModel,
  withIntentNotes
} from './fixtures/plan-composer/invented-club.mjs'
import { inputs, page, reply, richerKit } from './fixtures/plan-composer/intent-kit.mjs'

test('page and block intent reach the plan, with search terms code makes, and pass Contract B', async () => {
  const model = scriptedModel(reply(withIntentNotes(goodComposition(), ['km-1', 'km-2'])))
  const { plan, attempts } = await composePlan(inputs(model))
  assert.equal(attempts.length, 1)
  const sent = JSON.parse(model.calls[0].user)
  assert.deepEqual(sent.brief.keyMessages, [
    { id: 'km-1', label: 'Coaching for every age' },
    { id: 'km-2', label: 'Courts kept in top shape' }
  ])
  const home = page(plan, 'home')
  assert.match(home.visitorQuestion, /Home page/)
  assert.equal(home.keyMessage, 'A friendly club with coaching for every age.')
  assert.deepEqual(Object.keys(home.seo).sort(), ['descriptionIntent', 'searchTerms', 'titleIntent'])
  assert.ok(home.seo.searchTerms.length > 0 && home.seo.searchTerms.length <= 4)
  const services = home.blocks.find((b) => b.block === 'services-grid')
  assert.deepEqual(services.carries, ['km-1', 'km-2'])
  assert.match(services.message, /Services/)
  assert.deepEqual(plan.keyMessages, [
    { id: 'km-1', label: 'Coaching for every age' },
    { id: 'km-2', label: 'Courts kept in top shape' }
  ])
  assert.deepEqual(checkBuildDocument(plan), { ok: true, problems: [] })
})

test('a key message no home block carries goes back to the model, then code places it on the last attempt', async () => {
  const c = withIntentNotes(goodComposition(), ['km-1', 'km-9'])
  const model = scriptedModel(reply(c), reply(c), reply(c))
  const { plan, attempts, fixes } = await composePlan(inputs(model))
  assert.deepEqual(
    attempts.map((a) => a.problems.map((p) => p.code)),
    [['key_message_unplaced'], ['key_message_unplaced'], []]
  )
  assert.match(attempts[0].problems[0].message, /km-2/)
  const services = page(plan, 'home').blocks.find((b) => b.block === 'services-grid')
  assert.deepEqual(services.carries, ['km-1', 'km-2'])
  assert.deepEqual(
    fixes.filter((f) => f.code.startsWith('key_message')).map((f) => [f.code, f.was, f.now]),
    [
      ['key_message_unknown', 'km-9', null],
      ['key_message_unplaced', null, 'km-2']
    ]
  )
})

test('the intent the prompt asks for goes back while an attempt is left; the last attempt is kept without it', async () => {
  const bare = goodComposition()
  const model = scriptedModel(reply(bare), reply(withIntentNotes(bare, ['km-1', 'km-2'])))
  const { attempts } = await composePlan(inputs(model))
  // The key messages the bare reply places nowhere go back with it.
  assert.ok(attempts[0].problems.every((p) => ['intent_missing', 'key_message_unplaced'].includes(p.code)))
  assert.ok(attempts[0].problems.some((p) => p.at === 'pages[0].blocks[2].message'))
  assert.deepEqual(attempts[1].problems, [])
  const last = scriptedModel(reply(bare), reply(bare), reply(bare))
  const kept = await composePlan(inputs(last))
  assert.equal(kept.attempts.length, 3)
  assert.ok(!('visitorQuestion' in page(kept.plan, 'home')))
})

test('the main action is the owner choice; each page with a call to action block ends with it', async () => {
  const kit = richerKit()
  const model = scriptedModel(reply(withIntentNotes(goodComposition(), ['km-1', 'km-2'])))
  const { plan, fixes } = await composePlan(
    inputs(model, { ...kit, answers: [answer('main-button', { choice: 'call' })] })
  )
  assert.deepEqual(JSON.parse(model.calls[0].user).primaryAction, {
    factIds: ['contact-cta-label', 'contact-phone']
  })
  assert.deepEqual(plan.primaryAction, { factIds: ['contact-cta-label', 'contact-phone'] })
  const home = page(plan, 'home')
  const band = home.blocks.find((b) => b.block === 'cta-band')
  assert.ok(band, 'the call to action block is added')
  assert.ok(band.data.includes('contact-cta-label'))
  assert.deepEqual(home.endAction, { block: band.id, factIds: ['contact-cta-label', 'contact-phone'] })
  // The contact and team pages of this template have no block for it: no end action is invented.
  assert.ok(!('endAction' in page(plan, 'contact')))
  assert.ok(fixes.some((f) => f.code === 'end_action_added'))
  assert.deepEqual(checkBuildDocument(plan), { ok: true, problems: [] })
})
