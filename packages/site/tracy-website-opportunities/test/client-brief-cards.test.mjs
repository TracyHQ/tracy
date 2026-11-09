/**
 * The brief as "How Tracy understands {business}" cards (#520): which card each part of the structured brief feeds, and
 * that a part the brief does not cover leaves its card out instead of filling it. The business is made up.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-brief-cards.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefCards } from '../src/client/brief-cards-model.ts'
import { en } from '../src/client/strings.ts'

/** The real English table, so the test reads what a seller reads. */
const t = (key, params = {}) => {
  const text = en[key]
  if (text === undefined) throw new Error(`missing string ${key}`)
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}

const item = (label) => ({ id: label, label, quote: label, source: { kind: 'instagram' } })

const full = {
  business: {
    name: 'Harbour Lane Bakery',
    address: '12 Harbour Lane, Example Town',
    phone: '+1 555 0100',
    otherPhones: [{ phone: '+1 555 0101' }],
    hours: ['Mon to Fri 07:00 to 15:00', 'Sat 08:00 to 13:00'],
    website: 'https://harbour-lane.example',
    socials: { instagram: 'https://instagram.example/harbourlane', facebook: 'https://facebook.example/hl' },
    serviceAreas: [{ text: 'Example Town and the old port', source: { kind: 'website' }, quote: 'x' }],
    cuisine: ['Bakery']
  },
  contact: { whatsapp: { number: '+1 555 0100', href: 'https://wa.example/15550100' } },
  keyMessages: [{ id: 'k1', label: 'Sourdough baked every morning' }],
  reading: {
    method: 'model',
    about: 'A family bakery on the harbour since 1998',
    story: [item('Started by two sisters')],
    services: [item('Sourdough bread'), item('Celebration cakes')],
    audience: [item('Early commuters'), item('Families at the weekend')],
    team: [item('Mara')],
    facts: [item('Flour milled in the region')]
  }
}

test('each part of the brief lands on its card, in the order a seller reads them', () => {
  const view = briefCards(full, t)
  assert.equal(view.business, 'Harbour Lane Bakery')
  assert.deepEqual(
    view.cards.map((c) => c.id),
    ['who', 'offer', 'standout', 'serve', 'reach']
  )
  const of = (id) => view.cards.find((c) => c.id === id).items
  assert.deepEqual(of('who'), ['A family bakery on the harbour since 1998', 'Started by two sisters'])
  assert.deepEqual(of('offer'), ['Sourdough bread', 'Celebration cakes', 'Bakery'])
  assert.deepEqual(of('standout'), ['Sourdough baked every morning', 'Flour milled in the region'])
  assert.deepEqual(of('serve'), [
    'Early commuters',
    'Families at the weekend',
    'Example Town and the old port'
  ])
  assert.deepEqual(of('reach'), [
    '12 Harbour Lane, Example Town',
    '+1 555 0100',
    '+1 555 0101',
    'WhatsApp +1 555 0100',
    'Mon to Fri 07:00 to 15:00; Sat 08:00 to 13:00',
    'https://harbour-lane.example',
    'Facebook, Instagram'
  ])
})

test('a part the brief does not cover leaves its card out; nothing is filled in', () => {
  const thin = {
    business: { name: 'Corner Tailor', address: null, phone: '+1 555 0199', hours: null },
    reading: { method: 'rules', services: [item('Alterations')], audience: [], team: [], story: [] }
  }
  const view = briefCards(thin, t)
  assert.deepEqual(
    view.cards.map((c) => c.id),
    ['offer', 'reach']
  )
  assert.deepEqual(view.cards[1].items, ['+1 555 0199'])
})

test('a brief with nothing readable has no cards and no name, so the view shows only the full brief', () => {
  assert.deepEqual(briefCards(null, t), { business: null, cards: [] })
  assert.deepEqual(briefCards({ business: {} }, t), { business: null, cards: [] })
})

test('the same line twice shows once', () => {
  const view = briefCards(
    {
      business: { name: 'Twin Cafe', phone: '+1 555 0111' },
      contact: { whatsapp: { number: '+1 555 0111' } },
      keyMessages: [{ label: 'Open late' }],
      reading: { services: [], audience: [], team: [], story: [], facts: [item('Open late')] }
    },
    t
  )
  assert.deepEqual(view.cards.find((c) => c.id === 'standout').items, ['Open late'])
})
