// A chat app is inferred on a mobile only by the country table (COO rule 29/10/2026): WhatsApp in the WhatsApp-first
// countries, Zalo in Vietnam; a landline and a country not listed never; a sourced channel always wins, and an inferred one
// says so. Every number and business here is made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactChannelsOf } from '../domain/contact-reading.mjs'
import { checkContactFacts } from '../domain/contact-fact-check.mjs'
import { inferredMessagingAppOf } from '../domain/messaging-apps.mjs'

const chats = (brief) =>
  contactChannelsOf(brief)
    .filter((c) => c.kind === 'whatsapp' || c.kind === 'zalo')
    .map((c) => ({ kind: c.kind, href: c.href, label: c.label, inferred: c.inferred === true }))

test('a UAE mobile is inferred to have WhatsApp, marked inferred', () => {
  const brief = { business: { name: 'Dune Padel', phone: '+971 50 000 1234' } }
  assert.deepEqual(chats(brief), [
    { kind: 'whatsapp', href: 'https://wa.me/971500001234', label: 'WhatsApp us', inferred: true }
  ])
})

test('a Vietnamese mobile is inferred to have Zalo; a Vietnamese landline is not', () => {
  const mobile = { business: { name: 'Pho Corner', phone: '+84 90 000 1234' } }
  assert.deepEqual(chats(mobile), [
    { kind: 'zalo', href: 'https://zalo.me/84900001234', label: 'Zalo us', inferred: true }
  ])
  const landline = { business: { name: 'Pho Corner', phone: '+84 24 0000 1234' } }
  assert.deepEqual(chats(landline), [])
  // Written the national way, the business's own country gives the calling code.
  const national = { business: { name: 'Pho Corner', phone: '090 000 1234', country: 'VN' } }
  assert.equal(chats(national)[0]?.href, 'https://zalo.me/84900001234')
})

test('a mobile of a country not in the table is never inferred', () => {
  const brief = { business: { name: 'Harbour Bikes', phone: '+44 7700 900 123' } }
  assert.deepEqual(chats(brief), [])
  assert.equal(inferredMessagingAppOf('+44 7700 900 123'), null)
  assert.equal(inferredMessagingAppOf('+1 415 555 0100'), null)
})

test('a sourced WhatsApp wins over an inferred one; a second mobile is not guessed beside it', () => {
  const brief = {
    business: {
      name: 'Oasis Dental',
      phone: '+971 50 000 1234',
      otherPhones: [{ phone: '+971 55 000 5678', whatsapp: true }]
    }
  }
  assert.deepEqual(chats(brief), [
    { kind: 'whatsapp', href: 'https://wa.me/971550005678', label: 'WhatsApp us', inferred: false }
  ])
})

test('the brief’s own WhatsApp keeps the inference mark its fact carries', () => {
  const brief = {
    business: { name: 'Dune Padel', phone: '+971 50 000 1234' },
    contact: {
      whatsapp: { number: '+971 50 000 1234', href: 'https://wa.me/971500001234', factId: 'fact_1' }
    },
    facts: [{ id: 'fact_1', field: 'whatsapp', confidence: 'inferred' }]
  }
  assert.deepEqual(chats(brief), [
    { kind: 'whatsapp', href: 'https://wa.me/971500001234', label: 'WhatsApp us', inferred: true }
  ])
  const sourced = { ...brief, facts: [{ id: 'fact_1', field: 'whatsapp', confidence: 'corroborated' }] }
  assert.equal(chats(sourced)[0].inferred, false)
})

test('the check names an inferred chat app no page links, with its mark; a zalo.me link shows it', () => {
  const brief = { business: { name: 'Pho Corner', phone: '+84 90 000 1234' } }
  const missing = checkContactFacts({ pages: [{ path: '/', html: '<p>+84 90 000 1234</p>' }], brief })
  assert.deepEqual(
    missing.map((m) => [m.kind, m.inferred === true]),
    [['zalo', true]]
  )
  const linked = checkContactFacts({
    pages: [{ path: '/', html: '<a href="https://zalo.me/84900001234">Zalo us</a> +84 90 000 1234' }],
    brief
  })
  assert.deepEqual(linked, [])
})
