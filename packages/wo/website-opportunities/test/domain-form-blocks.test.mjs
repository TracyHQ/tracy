// Spec TracyHQ/tracy#189, COO rule 29/10/2026: a form or sign-up block stays only when it has a real destination for the
// business. Two made-up trades (a bakery, a dental clinic) on two module shapes; every name below is invented.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSite } from '../domain/site-plan.mjs'
import { checkDemoLeftovers, LEFTOVER_KINDS } from '../domain/demo-leftovers.mjs'

const served = { set: { contentHash: 'd'.repeat(64) }, questions: [{ id: 'name', kind: 'text' }] }
const NOW = '2026-10-29T00:00:00.000Z'

const text = (entity, n, role, sample) => ({
  key: `${entity}.${n}`,
  entity,
  column: 'params',
  type: 'text',
  role,
  sample,
  maxCharacters: 90
})
const mod = (key, module, title) => ({ key, kind: 'module', identity: { module, title } })

/** A footer with a mailing-list extension, a custom sign-up block, a pricing section and a contact-form module. */
function map() {
  return {
    roleVocabularyVersion: 'place-content-roles/3',
    pages: [],
    entities: [
      mod('module-1', 'mod_acym', 'Subscription'),
      mod('module-2', 'mod_ja_acm', 'Footer - Newsletter Signup'),
      mod('module-3', 'mod_ja_acm', 'Subscription plans'),
      mod('module-4', 'mod_jaquickcontact', 'Send us a message'),
      mod('module-5', 'mod_sr_checkavailability', 'Check availability'),
      mod('module-6', 'mod_login', 'Login Form')
    ],
    slots: [
      text('module-1', 0, 'editorial.heading', 'Join our weekly newsletter'),
      text('module-1', 1, 'editorial.paragraph', 'Fresh tips in your inbox.'),
      text('module-2', 0, 'editorial.heading', 'Stay in the loop'),
      text('module-2', 1, 'editorial.paragraph', 'Join our mailing list for news.'),
      text('module-2', 2, 'editorial.button_label', 'Subscribe'),
      text('module-3', 0, 'editorial.heading', 'Choose a plan'),
      text('module-3', 1, 'editorial.button_label', 'Subscribe'),
      text('module-4', 0, 'editorial.heading', 'Write to us'),
      text('module-5', 0, 'editorial.button_label', 'Check availability'),
      text('module-6', 0, 'editorial.heading', 'Login')
    ]
  }
}

const bakery = (integrations) => ({
  business: { name: 'Copperleaf Bakery', email: 'hello@copperleaf.example' },
  reading: { about: 'Sourdough and pastries.' },
  integrations
})
const clinic = (integrations) => ({
  business: { name: 'Quillfield Dental', email: 'desk@quillfield.example' },
  reading: { about: 'Family dentistry.' },
  integrations
})
const planOf = (brief) => planSite(brief, served, { now: NOW, contentMap: map() })
const hiddenOf = (plan) =>
  plan.honesty.hide.filter((h) => h.reason === 'no-form-destination').map((h) => h.entity)
const decisionOf = (plan, key) => plan.slots.find((s) => s.key === key)

test('a clinic with no email-marketing account: both sign-up blocks, the booking widget and the login box go whole', () => {
  const plan = planOf(clinic([]))
  assert.deepEqual(hiddenOf(plan).sort(), ['module-1', 'module-2', 'module-5', 'module-6'])
  for (const hide of plan.honesty.hide.filter((h) => h.reason === 'no-form-destination'))
    assert.deepEqual([hide.how, hide.kind], ['entity', 'module'])
})

test('the words of a block taken off are not written', () => {
  const plan = planOf(clinic([]))
  for (const key of ['module-1.0', 'module-1.1', 'module-2.0', 'module-2.2'])
    assert.equal(decisionOf(plan, key).decision, 'skip', key)
})

test('a pricing section titled "Subscription plans" and the contact-form module stay', () => {
  const plan = planOf(clinic([]))
  assert.ok(!hiddenOf(plan).includes('module-3'))
  assert.ok(!hiddenOf(plan).includes('module-4'))
  assert.notEqual(decisionOf(plan, 'module-4.0').reason, 'no-form-destination')
})

test('a bakery with a verified newsletter integration keeps the sign-up blocks, and nothing else of the rule changes', () => {
  const plan = planOf(
    bakery([{ kind: 'newsletter', url: 'https://lists.example/copperleaf', verified: true }])
  )
  assert.deepEqual(hiddenOf(plan).sort(), ['module-5', 'module-6'])
  assert.notEqual(decisionOf(plan, 'module-1.0').reason, 'no-form-destination')
})

test('an unverified newsletter integration is no destination', () => {
  const plan = planOf(bakery([{ kind: 'newsletter', url: 'https://lists.example/x', verified: false }]))
  assert.ok(hiddenOf(plan).includes('module-1'))
})

test('a verified booking link keeps the booking widget', () => {
  const plan = planOf(clinic([{ kind: 'booking', url: 'https://book.example/quillfield', verified: true }]))
  assert.ok(!hiddenOf(plan).includes('module-5'))
  assert.ok(hiddenOf(plan).includes('module-1'))
})

test('only a contact form on the site: nothing is taken off', () => {
  const only = {
    roleVocabularyVersion: 'place-content-roles/3',
    pages: [],
    entities: [
      mod('module-4', 'mod_jaquickcontact', 'Send us a message'),
      mod('module-7', 'mod_ja_acm', 'Opening hours')
    ],
    slots: [
      text('module-4', 0, 'editorial.heading', 'Write to us'),
      text('module-7', 0, 'editorial.heading', 'Visit us')
    ]
  }
  const plan = planSite(clinic([]), served, { now: NOW, contentMap: only })
  assert.deepEqual(hiddenOf(plan), [])
})

const NEWS_FORM = `<footer><form action="/index.php/component/acym/frontusers" method="post">
  <h4>Join our weekly newsletter</h4><input type="email" name="user[email]" placeholder="Email"><input type="button" value="Subscribe"></form></footer>`
const CONTACT_FORM = `<main><form action="/contact" method="post"><input type="email" name="email"><textarea name="message"></textarea><button>Send</button></form></main>`
const SEARCH_FORM = `<header><form role="search" action="/search"><input type="search" name="q"></form></header>`
const leftover = (html, brief) =>
  checkDemoLeftovers({
    pages: [{ path: '/', status: 200, html: `<html><body>${html}</body></html>` }],
    contentMap: { entities: [], slots: [] },
    brief
  }).findings.filter((f) => f.kind === 'C21')

test('C21 is a kind of the leftover check', () => {
  assert.ok(LEFTOVER_KINDS.C21)
})

test('C21: a visible sign-up form with no destination is reported', () => {
  assert.equal(leftover(NEWS_FORM, clinic([])).length, 1)
})

test('C21: the same form is fine when the brief holds a newsletter integration', () => {
  assert.equal(
    leftover(NEWS_FORM, bakery([{ kind: 'newsletter', url: 'https://lists.example/x', verified: true }]))
      .length,
    0
  )
})

test('C21: a form whose action leads nowhere is reported whatever it is', () => {
  assert.equal(leftover('<form action="#"><input name="q"><button>Go</button></form>', clinic([])).length, 1)
  assert.equal(leftover('<form><input name="a"></form>', clinic([])).length, 1)
})

test('C21: the contact form and the site search are not reported', () => {
  assert.deepEqual(leftover(CONTACT_FORM, clinic([])), [])
  assert.deepEqual(leftover(SEARCH_FORM, clinic([])), [])
})
