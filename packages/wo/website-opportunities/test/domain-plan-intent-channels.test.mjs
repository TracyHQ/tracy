// The plan stage restore of the step chain's site plan (#575), its brief channels and owner lists: WhatsApp and a
// second phone go where the template has a field for them; the owner gets a later list; a revision carries the intent
// inputs; search terms come from the data; reviews are shown on purpose. Invented data only, scripted fake model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { intentContextOf } from '../domain/plan-composer-intent.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { withReviewsOnPurpose } from '../domain/plan-intent.mjs'
import { searchTermsOf } from '../domain/plan-intent-seo.mjs'
import {
  answer,
  blockStore,
  clubProfile,
  goodComposition,
  PHONE_QUESTION,
  pageRecipes,
  REVIEWS,
  SERVICES,
  scriptedModel,
  withIntentNotes
} from './fixtures/plan-composer/invented-club.mjs'
import { brief, inputs, reply, richerKit } from './fixtures/plan-composer/intent-kit.mjs'

test('WhatsApp goes in a social row and a second phone the owner asked for in a second phone field', async () => {
  const kit = richerKit()
  const whatsappBrief = brief({
    contact: { whatsapp: { number: '+1 555 0142 790', href: 'https://wa.me/15550142790', verified: true } },
    facts: [{ id: 'w1', field: 'whatsapp', value: '+1 555 0142 790', evidence: [{ source: 'google' }] }]
  })
  const answerReadings = new Map([
    [
      PHONE_QUESTION,
      {
        facts: [
          { kind: 'contact.phone', value: '+1 555 0142 778', primary: true },
          { kind: 'contact.phone', value: '+1 555 0142 779', primary: false }
        ]
      }
    ]
  ])
  // The model puts every contact channel on the contact page, as the prompt and the gate's contact rule ask.
  const composition = withIntentNotes(goodComposition(), ['km-1', 'km-2'])
  const contact = composition.pages.find((p) => p.pageType === 'contact')
  contact.blocks[0].data.push('contact-phone-2')
  contact.blocks.push({
    block: 'social-row',
    label: 'Social links',
    data: ['contact-whatsapp'],
    reason: 'r',
    message: 'm'
  })
  const model = scriptedModel(reply(composition))
  const { plan } = await composePlan(
    inputs(model, {
      ...kit,
      brief: whatsappBrief,
      answers: [answer(PHONE_QUESTION, { text: 'Show both numbers please' })],
      answerReadings
    })
  )
  const fact = (id) => plan.facts.find((f) => f.id === id)
  assert.equal(fact('contact-whatsapp').value, 'https://wa.me/15550142790')
  assert.deepEqual(fact('contact-whatsapp').sources, [{ kind: 'google', name: 'Google Maps listing' }])
  assert.equal(fact('contact-phone-2').value, '+1 555 0142 779')
  assert.deepEqual(fact('contact-phone-2').sources, [{ kind: 'answer', name: 'Your answer' }])
  const shown = plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data))
  assert.ok(shown.includes('contact-whatsapp') && shown.includes('contact-phone-2'))
  assert.ok(
    !plan.leftOut.some((e) => ['no_place_for_whatsapp', 'no_place_for_other_phones'].includes(e.code))
  )
  assert.deepEqual(checkBuildDocument(plan), { ok: true, problems: [] })
})

test('a WhatsApp number no source labels WhatsApp is not linked, and says so', async () => {
  const kit = richerKit()
  const guessed = brief({
    contact: { whatsapp: { number: '+1 555 0142 778', href: 'https://wa.me/1', verified: false } }
  })
  const model = scriptedModel(reply(withIntentNotes(goodComposition(), ['km-1', 'km-2'])))
  const { plan } = await composePlan(inputs(model, { ...kit, brief: guessed }))
  assert.ok(!plan.facts.some((f) => f.id === 'contact-whatsapp'))
  assert.deepEqual(
    plan.leftOut.filter((e) => e.what === 'WhatsApp').map((e) => e.code),
    ['whatsapp_unconfirmed']
  )
})

test('the later list says what the owner can send, only where the template has a field for it', async () => {
  const model = scriptedModel(reply(withIntentNotes(goodComposition(), ['km-1', 'km-2'])))
  const held = brief({
    missing: [
      { field: 'prices', why: 'x' },
      { field: 'menu', why: 'y' }
    ]
  })
  const { plan } = await composePlan(inputs(model, { brief: held }))
  // Prices fit the services cards; this template has no dish field, so no menu entry; the coach has no photo.
  assert.deepEqual(
    plan.later.map((e) => [e.code, e.params ?? null]),
    [
      ['later_prices', null],
      ['later_portraits', { count: 1 }]
    ]
  )
})

test('a revision carries the key messages, the main action, the later list and the brief channels', () => {
  const profile = clubProfile()
  const data = planDataOf(profile)
  const fromPlan = {
    keyMessages: [{ id: 'km-1', label: 'Coaching for every age' }],
    primaryAction: { factIds: ['contact-phone', 'gone'] },
    later: [{ what: 'Your prices', reason: 'r', code: 'later_prices' }],
    facts: [
      {
        id: 'contact-whatsapp',
        kind: 'contact.social_url',
        label: 'WhatsApp',
        value: 'https://wa.me/1',
        sources: []
      }
    ]
  }
  const blocks = new Map(blockStore().blocks.map((b) => [b.id, b]))
  const recipes = new Map(pageRecipes().recipes.map((r) => [r.pageType, r]))
  const intent = intentContextOf({ brief: null, profile, data, blocks, recipes, fromPlan })
  assert.deepEqual(intent.keyMessages, fromPlan.keyMessages)
  assert.deepEqual(intent.primaryAction, { factIds: ['contact-phone'] })
  assert.deepEqual(intent.later, fromPlan.later)
  assert.ok(data.byId.has('contact-whatsapp'))
})

test('search terms name what the page offers with the town of the address the site shows', () => {
  const data = planDataOf(clubProfile())
  const home = { blocks: [{ data: [SERVICES[0], SERVICES[1]] }] }
  const terms = searchTermsOf(home, { data, shownAddress: '3 Pebble Row - Fernhollow - Example Land' })
  assert.deepEqual(
    terms,
    [SERVICES[0], SERVICES[1]].map((id) => `${data.byId.get(id).entry.label} Fernhollow`)
  )
  const bare = searchTermsOf({ blocks: [] }, { data, shownAddress: null })
  assert.ok(bare.length > 0)
})

test('reviews that hold a key message or name a person of the plan are shown first, within the same choice', () => {
  const data = planDataOf(clubProfile())
  const blocks = new Map([['tracy-reviews', { id: 'tracy-reviews', type: 'reviews' }]])
  const pages = [{ blocks: [{ block: 'tracy-reviews', data: [REVIEWS[1], REVIEWS[0]] }] }]
  const [ordered] = withReviewsOnPurpose(pages, { data, blocks, quotes: ['courts are always swept'] })
  assert.deepEqual(ordered.blocks[0].data, [REVIEWS[0], REVIEWS[1]])
})
