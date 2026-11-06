// Setting slots: a map a button opens, drawn from a block's own map shortcode, becomes one writable slot the button
// points at; the contact's empty mobile line becomes one too, with the telephone line's limit. Fabricated swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mapSettingOf, parseJamap } from '../template-kit/lib/site/adapters/joomla-map.mjs'
import { settleSettingSlots } from '../template-kit/lib/setting-slots.mjs'

const SHORTCODE =
  `{jamap mode='normal' locations='{"location":{"0":"12 Harbour Road"},"latitude":{"0":"10.5"},` +
  `"longitude":{"0":"-20.25"},"info":{"0":""}}' zoom='12' }{/jamap}`

const MAP = {
  entities: [{ key: 'module-40', kind: 'module' }],
  pages: [
    {
      entity: 'menuItem-7',
      route: 'visit/contact',
      assignedModules: [{ entity: 'module-40', position: 'map' }]
    },
    { entity: 'menuItem-8', route: 'lessons', assignedModules: [] }
  ]
}

const kitOf = () => ({
  pages: [
    { id: 'page-visit_contact', path: '/visit/contact', blocks: { 1440: ['header', 'body-visit_contact'] } },
    { id: 'page-lessons', path: '/lessons', blocks: { 1440: ['header', 'body-lessons'] } }
  ],
  blocks: [
    {
      id: 'body-visit_contact',
      links: [
        {
          id: 'body-visit_contact.button-1',
          label: 'SEE THE POOL ON A MAP',
          element: 'button',
          opens: { kind: 'modal', element: '#poolMap', shows: 'map', writable: false, writableReason: 'old' }
        }
      ]
    },
    {
      id: 'body-lessons',
      links: [{ id: 'body-lessons.button-1', element: 'button', opens: { kind: 'modal', shows: 'map' } }]
    }
  ],
  site: {
    contactBlocks: [
      {
        block: 'body-visit_contact',
        accepts: {
          entity: 'contact-3',
          fields: [
            {
              kind: 'phone',
              column: 'telephone',
              printed: true,
              id: 'contact-3.2',
              writable: true,
              maxCharacters: 18,
              maxCharactersFrom: 'kit frame'
            },
            { kind: 'mobile', column: 'mobile', printed: true, writable: false, writableReason: 'no slot' },
            { kind: 'fax', column: 'fax', printed: true, writable: false, writableReason: 'no slot' }
          ]
        }
      }
    ]
  }
})

test('a block whose whole content is one map shortcode is a map setting, written from a template', () => {
  assert.equal(parseJamap(SHORTCODE).zoom, '12')
  assert.equal(parseJamap(`<p>Find us</p>${SHORTCODE}`), null)
  const m = mapSettingOf({ id: '40', content: SHORTCODE })
  assert.equal(m.entity, 'module-40')
  assert.deepEqual(m.location, { address: '12 Harbour Road', latitude: '10.5', longitude: '-20.25' })
  assert.ok(m.template.includes(`"location":{"0":"<address>"}`))
  assert.ok(m.template.endsWith(`zoom='12' }{/jamap}`))
  const two = SHORTCODE.replace('"0":"12 Harbour Road"}', '"0":"12 Harbour Road","1":"Pier 4"}')
  assert.equal(mapSettingOf({ id: '40', content: two }), null)
})

test('the map button points at the one map setting assigned to its page; one without any keeps its reason', () => {
  const kit = kitOf()
  const setting = mapSettingOf({ id: '40', content: SHORTCODE })
  const r = settleSettingSlots(kit, { map: MAP, mapSettings: [setting] })
  assert.equal(r.tied, 1)
  const [contact, lessons] = kit.blocks.map((b) => b.links[0].opens)
  assert.deepEqual(
    [contact.writable, contact.slotId, contact.writableReason],
    [true, 'block-40.map-location', undefined]
  )
  assert.equal(lessons.writable, false)
  assert.match(lessons.writableReason, /no content map slot holds/)
  const slot = kit.site.settingSlots.find((s) => s.id === contact.slotId)
  assert.deepEqual(slot.writeTo.entity, 'module-40')
  assert.match(slot.fillFrom, /`address` fact/)
  assert.match(slot.fillFrom, /placeId/)
})

test('the empty mobile line is a setting slot with the telephone limit; fax stays not writable', () => {
  const kit = kitOf()
  settleSettingSlots(kit, { map: MAP, mapSettings: [] })
  const [, mobile, fax] = kit.site.contactBlocks[0].accepts.fields
  assert.deepEqual([mobile.id, mobile.writable, mobile.maxCharacters], ['contact-3.mobile', true, 18])
  assert.equal(mobile.writableReason, undefined)
  assert.deepEqual(
    kit.site.settingSlots.map((s) => s.id),
    ['contact-3.mobile']
  )
  assert.deepEqual(kit.site.settingSlots[0].writeTo, { entity: 'contact-3', column: 'mobile' })
  assert.equal(fax.writable, false)
  // Settling again gives the same kit.
  const once = JSON.stringify(kit)
  settleSettingSlots(kit, { map: MAP, mapSettings: [] })
  assert.equal(JSON.stringify(kit), once)
})
