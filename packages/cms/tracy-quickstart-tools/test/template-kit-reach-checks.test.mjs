// Reach self-checks (reach-checks.mjs): a button with no door, a map no slot moves and a phone outside a link are counted from
// the kit alone, named in coverage.failures, and counted again to 0 once the kit has what they need. Fabricated studio kit.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isDeadControl,
  keepEmbeddedMaps,
  REACH_PARTS,
  reachChecks
} from '../template-kit/lib/reach-checks.mjs'

const studio = () => ({
  checks: { orphanTexts: 0 },
  coverage: { parts: {}, failures: [{ part: 'slotsMissing', where: 'x', reason: 'kept' }] },
  site: {
    settingSlots: [],
    contactBlocks: [
      {
        block: 'body-contact',
        accepts: {
          entity: 'contact-3',
          fields: [
            { kind: 'phone', id: 'contact-3.2', printed: true, writable: true },
            { kind: 'mobile', id: 'contact-3.mobile', printed: true, writable: true },
            { kind: 'fax', printed: true, writable: false }
          ]
        }
      }
    ]
  },
  blocks: [
    {
      id: 'body-lesson',
      links: [
        { id: 'body-lesson.link-1', label: 'Book a trial round', target: null, action: 'page-control' },
        {
          id: 'body-lesson.link-2',
          label: null,
          target: null,
          action: 'page-control',
          icon: { mechanism: 'font-icon' }
        },
        {
          id: 'body-lesson.link-3',
          label: 'Watch',
          target: null,
          action: 'page-control',
          opens: { kind: 'modal' }
        },
        { id: 'body-lesson.link-4', label: 'Timetable', target: '/timetable', action: 'navigate' }
      ]
    },
    {
      id: 'body-contact',
      source: { entity: 'module-40' },
      slots: [{ id: 'block-9.1', role: 'contact.phone' }],
      demoOwned: [{ id: 'contact-3.2', role: 'contact.phone' }],
      embeddedMaps: [{ what: 'iframe https://www.google.com/maps/embed?pb=1' }],
      links: [
        {
          id: 'body-contact.link-1',
          label: '(555) 010-0199',
          target: '#',
          action: 'contact',
          labelId: 'block-9.1'
        },
        {
          id: 'body-contact.button-1',
          label: 'Open the map',
          target: null,
          action: 'page-control',
          opens: { kind: 'modal', shows: 'map', writable: false, writableReason: 'no map setting' }
        }
      ]
    }
  ]
})

test('a control with words and no door counts; one with something it opens, an address or no words does not', () => {
  const kit = studio()
  assert.equal(isDeadControl(kit.blocks[0].links[0]), true)
  assert.deepEqual(kit.blocks[0].links.slice(1).map(isDeadControl), [false, false, false])
  const counts = reachChecks(kit)
  assert.equal(counts.deadControls, 1)
  const named = kit.coverage.failures.filter((f) => f.part === 'deadControls')
  assert.deepEqual(
    named.map((f) => f.where),
    ['links[body-lesson.link-1]']
  )
  assert.ok(
    kit.coverage.failures.some((f) => f.part === 'slotsMissing'),
    'other parts are kept'
  )
})

test('a map button with no slot and an embedded map with no map-location slot count; a tied map does not', () => {
  const kit = studio()
  assert.equal(reachChecks(kit).mapLocationUnmapped, 2)
  kit.blocks[1].links[1].opens = {
    kind: 'modal',
    shows: 'map',
    writable: true,
    slotId: 'block-40.map-location'
  }
  kit.site.settingSlots = [
    { id: 'block-40.map-location', kind: 'map-location', writeTo: { entity: 'module-40' } }
  ]
  assert.equal(reachChecks(kit).mapLocationUnmapped, 0)
  assert.equal(kit.coverage.failures.filter((f) => f.part === 'mapLocationUnmapped').length, 0)
})

test('a phone outside any link counts, the slot a link shows as its words does not; a printed mobile field counts', () => {
  const kit = studio()
  const counts = reachChecks(kit)
  assert.equal(counts.phoneNotCallable, 2)
  assert.deepEqual(
    kit.coverage.failures.filter((f) => f.part === 'phoneNotCallable').map((f) => f.where),
    ['slots[contact-3.2]', 'slots[contact-3.mobile]']
  )
  kit.blocks[1].links.push({
    id: 'body-contact.link-2',
    labelId: 'contact-3.2',
    target: 'tel:5550100',
    action: 'contact'
  })
  kit.blocks[1].links.push({
    id: 'body-contact.link-3',
    labelId: 'contact-3.mobile',
    target: 'tel:5550101',
    action: 'contact'
  })
  assert.equal(reachChecks(kit).phoneNotCallable, 0)
})

test('counting twice gives the same failures once; the maps a read found are kept on the block', () => {
  const kit = studio()
  reachChecks(kit)
  reachChecks(kit)
  const reach = kit.coverage.failures.filter((f) => REACH_PARTS.includes(f.part))
  assert.equal(reach.length, 5)
  keepEmbeddedMaps(kit, new Map([['body-lesson', { maps: [{ what: 'div with coordinates' }] }]]))
  assert.deepEqual(kit.blocks[0].embeddedMaps, [{ what: 'div with coordinates' }])
  assert.equal('embeddedMaps' in kit.blocks[1], false)
})

test('a phone the demo leaves empty is not counted: an empty contact field or an empty phone slot', () => {
  const kit = studio()
  kit.site.contactBlocks[0].accepts.fields[0].filled = false
  kit.site.contactBlocks[0].accepts.fields[1].filled = false
  kit.blocks[1].demoOwned[0].sample = ''
  const counts = reachChecks(kit)
  assert.equal(counts.phoneNotCallable, 0)
  kit.site.contactBlocks[0].accepts.fields[1].filled = true
  assert.equal(reachChecks(kit).phoneNotCallable, 1)
})
