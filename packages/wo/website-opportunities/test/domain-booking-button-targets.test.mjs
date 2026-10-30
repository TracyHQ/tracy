// A button whose words name booking or contact leads to the Contact page, or to the brief's own channel when the site keeps
// no Contact page (spec TracyHQ/tracy#189, COO rule 30/10/2026). Two made-up trades: a locksmith and a tea room.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookingButtonTargets } from '../domain/booking-button-targets.mjs'

/** A section button and its link, declared as navigation, as a content map holds them. */
const button = (entity, label, link) => [
  {
    key: `${entity}.label`,
    entity,
    type: 'text',
    role: 'editorial.button_label',
    sample: label,
    action: { kind: 'navigation', urlKey: `${entity}.link` }
  },
  {
    key: `${entity}.link`,
    entity,
    type: 'url',
    role: 'editorial.navigation_url',
    sample: link,
    action: { kind: 'navigation' }
  }
]

const contentMap = {
  pages: [
    { entity: 'menuItem-20', route: 'services' },
    { entity: 'menuItem-21', route: 'about/contact' }
  ],
  slots: [
    ...button('module-7', 'Start practicing', 'index.php?Itemid=20'),
    ...button('module-8', 'See our services', 'index.php?Itemid=20'),
    ...button('module-9', 'Join today', 'index.php?Itemid=21'),
    {
      key: 'module-10.send',
      entity: 'module-10',
      type: 'text',
      role: 'editorial.button_label',
      sample: 'Send',
      action: { kind: 'submit-form' }
    }
  ]
}

const locksmith = {
  pages: [
    { role: 'home', path: '/', decision: 'keep' },
    { role: 'services', path: '/services', decision: 'keep' },
    { role: 'contact', path: '/about/contact', decision: 'keep' }
  ],
  channels: [{ kind: 'phone', value: '+1 555 0190', href: 'tel:+15550190', label: 'Call +1 555 0190' }]
}

test('locksmith: a button the writer worded "Book an appointment" leaves the services list for the Contact page', () => {
  const words = {
    'module-7.label': 'Book an appointment',
    'module-8.label': 'See our services',
    'module-9.label': 'Contact us',
    'module-10.send': 'Book now'
  }
  assert.deepEqual(bookingButtonTargets({ words, contentMap, sitePlan: locksmith }), {
    'module-7.link': 'index.php?Itemid=21'
  })
})

test('tea room with no Contact page kept: a "Reserve a table" button calls the brief’s own channel', () => {
  const teaRoom = {
    pages: [
      { role: 'home', path: '/', decision: 'keep' },
      { role: 'contact', path: '/about/contact', decision: 'drop' }
    ],
    primaryAction: { label: 'WhatsApp us', href: 'https://wa.me/15550191', channel: 'whatsapp' },
    channels: [{ kind: 'phone', value: '+1 555 0191', href: 'tel:+15550191', label: 'Call +1 555 0191' }]
  }
  const words = { 'module-7.label': 'Reserve a table', 'module-9.label': 'Get in touch' }
  assert.deepEqual(bookingButtonTargets({ words, contentMap, sitePlan: teaRoom }), {
    'module-7.link': 'https://wa.me/15550191',
    'module-9.link': 'https://wa.me/15550191'
  })
})

test('a demo build (no site plan) and a link already on a channel are left alone', () => {
  const words = { 'module-7.label': 'Book an appointment', 'module-7.link': 'tel:+15550190' }
  assert.deepEqual(bookingButtonTargets({ words, contentMap, sitePlan: null }), {})
  assert.deepEqual(bookingButtonTargets({ words, contentMap, sitePlan: locksmith }), {})
})
