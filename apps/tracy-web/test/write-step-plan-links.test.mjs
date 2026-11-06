// What the write report keeps for the site check (plan-link-table.js), and the map button no slot holds (link-lines.js). Every
// business, page and number here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lineOrder, lineResult, MAP_NEEDS } from '../src/write-step/link-lines.js'
import { coordinatesOf } from '../src/write-step/page-settings-stage.js'
import { isDeadControl, planLinkTable, targetOf } from '../src/write-step/plan-link-table.js'

const kit = {
  pages: [
    { id: 'page-home', path: '/', blocks: { 1440: ['header', 'block-1'], 390: ['header', 'block-1'] } },
    { id: 'page-lesson', path: '/lessons/one', blocks: { 1440: ['header', 'body-lesson'] } },
    { id: 'page-contact', path: '/contact', blocks: { 1440: ['header', 'body-contact'] } }
  ],
  blocks: [
    {
      id: 'header',
      links: [{ id: 'header.link-1', label: 'Contact', target: '/contact', menuItem: 'menuItem-5' }]
    },
    {
      id: 'body-lesson',
      links: [{ id: 'body-lesson.link-2', label: 'Book a trial', target: null, action: 'page-control' }]
    },
    { id: 'block-1', links: [{ id: 'block-1.link-1', label: 'Call us', target: '#', action: 'contact' }] }
  ]
}
const brief = {
  facts: [
    { id: 'f-phone', field: 'phone', value: '+000 555 0199', onSite: true },
    { id: 'f-off', field: 'phone', value: '+000 555 0100', onSite: false },
    { id: 'f-mail', field: 'email', value: 'desk@studio.example', onSite: true }
  ]
}
const plan = {
  sharedBlocks: [
    {
      block: 'header',
      decision: 'keep',
      links: [{ link: 'header.link-1', leadsTo: 'page-contact', labelSlot: 'menuItem-5.0' }]
    }
  ],
  pages: [
    {
      id: 'page-home',
      decision: 'keep',
      endAction: { intent: 'Call', leadsTo: 'phone:f-phone' },
      blocks: [
        {
          block: 'block-1',
          decision: 'keep',
          links: [{ link: 'block-1.link-1', leadsTo: 'phone:f-phone', labelSlot: null }]
        }
      ]
    },
    {
      id: 'page-lesson',
      decision: 'keep',
      endAction: { intent: 'Book', leadsTo: 'page-contact' },
      blocks: [
        {
          block: 'body-lesson',
          decision: 'keep',
          links: [{ link: 'body-lesson.link-2', leadsTo: 'page-contact', labelSlot: 'lang-1.0' }]
        }
      ]
    },
    {
      id: 'page-contact',
      decision: 'keep',
      endAction: { intent: 'Write', leadsTo: 'page-contact' },
      blocks: []
    },
    { id: 'page-old', decision: 'drop', endAction: { leadsTo: 'page-contact' }, blocks: [] }
  ]
}

test('the report keeps every kept link with its target, the pages it prints on, and whether the template prints it dead', () => {
  const { planLinks, endActions, phones } = planLinkTable({ plan, kit, brief })
  const by = Object.fromEntries(planLinks.map((l) => [l.link, l]))
  assert.deepEqual(
    by['header.link-1'].pages,
    ['page-home', 'page-lesson', 'page-contact'],
    'a shared block prints on every kept page'
  )
  assert.deepEqual(by['header.link-1'].target, { kind: 'page', page: 'page-contact' })
  assert.deepEqual(by['block-1.link-1'].target, { kind: 'phone', digits: '0005550199' })
  assert.equal(by['body-lesson.link-2'].deadControl, true)
  assert.equal('deadControl' in by['header.link-1'], false)
  assert.deepEqual(
    endActions.map((e) => [e.page, e.target.kind]),
    [
      ['page-home', 'phone'],
      ['page-lesson', 'page']
    ],
    'a page that ends on itself and a dropped page are left out'
  )
  assert.deepEqual(phones, ['0005550199'], 'a phone kept off the site is not held to the page')
})

test('targets: a fact off the site, a map, a legal page and a lightbox are not measured', () => {
  const facts = new Map(brief.facts.map((f) => [f.id, f]))
  assert.equal(targetOf('phone:f-off', facts), null)
  assert.equal(targetOf('map:f-phone', facts), null)
  assert.equal(targetOf('legal:privacy', facts), null)
  assert.equal(targetOf('lightbox', facts), null)
  assert.deepEqual(targetOf('email:f-mail', facts), { kind: 'address', url: 'mailto:desk@studio.example' })
  assert.equal(isDeadControl({ action: 'page-control', label: 'Go', opens: { kind: 'panel' } }), false)
})

test('a map button no slot holds is refused, naming what the plugin or the template must give', () => {
  const order = lineOrder(
    { slot: 'body-contact.button-1', content: 'map:f-address' },
    {
      via: 'none',
      link: { action: 'page-control', opens: { kind: 'modal', shows: 'map', writable: false } }
    },
    { kind: 'map' },
    { hiddenKeys: new Map(), leaving: new Set() }
  )
  const line = lineResult(order, {
    settled: new Map(),
    written: new Set(),
    refused: new Map(),
    hides: new Map()
  })
  assert.equal(line.status, 'refused')
  assert.ok(line.reason.endsWith(MAP_NEEDS))
})

// Card AP: a template that prints the map button as a maps search link of the address it prints draws no map from settings, so
// there is nothing to refuse; where it leads is the site check's map-location (it reads the real link on the page).
test('a map button the template prints as a maps search link of an address is not refused', () => {
  const order = lineOrder(
    { slot: 'body-contact.link-3', content: 'map:f-address' },
    {
      via: 'none',
      link: {
        action: 'navigation',
        label: 'OPEN IN MAPS',
        target: 'https://www.google.com/maps/search/?api=1&query=12%20Harbour%20Lane%2C%20Quayside'
      }
    },
    { kind: 'map' },
    { hiddenKeys: new Map(), leaving: new Set() }
  )
  const line = lineResult(order, {
    settled: new Map(),
    written: new Set(),
    refused: new Map(),
    hides: new Map()
  })
  assert.notEqual(line.status, 'refused')
  assert.equal(line.status, 'skipped')
  assert.match(line.reason, /maps search of the address/)
  assert.match(line.reason, /map-location/)
})

test('coordinates come from the run place, else a brief fact, else the place record; a half pair is none', () => {
  assert.deepEqual(coordinatesOf({ latitude: 1.5, longitude: 2 }, null), { latitude: 1.5, longitude: 2 })
  assert.equal(coordinatesOf({ latitude: 1.5 }, null), null)
  const withFact = { facts: [{ field: 'location', value: { lat: '-4.25', lng: '10' } }] }
  assert.deepEqual(coordinatesOf(null, withFact), { latitude: -4.25, longitude: 10 })
  assert.deepEqual(coordinatesOf(null, { googlePlace: { location: { latitude: 3, longitude: 4 } } }), {
    latitude: 3,
    longitude: 4
  })
  assert.equal(coordinatesOf(null, { facts: [{ field: 'location', value: { lat: 200, lng: 1 } }] }), null)
})
