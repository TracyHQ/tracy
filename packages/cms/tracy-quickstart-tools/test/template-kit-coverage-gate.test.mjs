// The coverage gate: every content map slot a kit page shows is in the kit with its limit and source, every link's
// label is a slot of the block holding the link, the main menu row has a whole-row limit, every text slot says its
// paragraphs and bullets, and what the page prints but the contract cannot write says so. Fabricated swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyCoverage, coverageGate } from '../template-kit/lib/coverage-gate.mjs'

const fit = (desktop, phone) => ({
  measured: true,
  maxChars: { desktop, phone },
  maxCharacters: Math.min(desktop, phone)
})
const MAP = {
  slots: [
    {
      key: 'menuItem-101.0',
      entity: 'menuItem-101',
      type: 'text',
      role: 'editorial.menu_label',
      sample: 'Home',
      maxCharacters: 40,
      fit: fit(4, 32)
    },
    {
      key: 'menuItem-150.0',
      entity: 'menuItem-150',
      type: 'text',
      role: 'editorial.menu_label',
      sample: 'Lessons',
      maxCharacters: 40,
      fit: fit(9, 30)
    },
    {
      key: 'module-4.1',
      entity: 'module-4',
      type: 'text',
      role: 'editorial.button_label',
      sample: 'Book a lane',
      maxCharacters: 24,
      fit: fit(13, 13)
    },
    {
      key: 'module-4.0',
      entity: 'module-4',
      type: 'text',
      role: 'editorial.heading',
      sample: 'Swim with us',
      maxCharacters: 60,
      fit: fit(30, 22)
    },
    {
      key: 'contact-1.1',
      entity: 'contact-1',
      column: 'address',
      type: 'text',
      role: 'contact.address',
      sample: '1 Pool Road',
      maxCharacters: 255,
      fit: fit(40, 30)
    },
    {
      key: 'contact-1.2',
      entity: 'contact-1',
      column: 'telephone',
      type: 'text',
      role: 'contact.phone',
      sample: '(555) 010-2000',
      maxCharacters: 48,
      fit: fit(24, 36)
    }
  ],
  menuBlocks: { 'module-1': { menu: 'mainmenu' } }
}

const kitOf = () => {
  const header = {
    id: 'header',
    slots: [],
    lists: [],
    demoOwned: [],
    links: [
      {
        id: 'header.link-1',
        label: 'HOME',
        labelId: 'menuItem-101.0',
        menuItem: 'menuItem-101',
        menu: 'module-1'
      },
      {
        id: 'header.link-2',
        label: 'LESSONS',
        labelId: 'menuItem-150.0',
        menuItem: 'menuItem-150',
        menu: 'module-1'
      },
      { id: 'header.link-3', label: 'BOOK A LANE', labelId: 'block-4.1' }
    ]
  }
  const cta = {
    id: 'block-4',
    slots: [
      { id: 'block-4.0', type: 'text', sample: 'Swim with us', paragraphs: 1, bullets: 0 },
      { id: 'block-4.1', type: 'text', sample: 'Book a lane', paragraphs: 1, bullets: 0 }
    ],
    lists: [],
    demoOwned: [],
    links: []
  }
  const contact = { id: 'body-contact', slots: [], lists: [], demoOwned: [], links: [] }
  Object.defineProperty(header, 'shownSlots', {
    value: new Set(['menuItem-101.0', 'menuItem-150.0', 'block-4.1'])
  })
  Object.defineProperty(cta, 'shownSlots', { value: new Set(['block-4.0', 'block-4.1']) })
  return {
    blocks: [header, cta, contact],
    site: {
      navigationGroups: [
        {
          id: 'nav-block-1',
          block: 'block-1',
          menu: 'mainmenu',
          items: [
            { level: 1, label: 'Home', labelSlot: 'menuItem-101.0', maxCharacters: 4, limitFrom: 'slot-fit' },
            {
              level: 1,
              label: 'Lessons',
              labelSlot: 'menuItem-150.0',
              maxCharacters: 9,
              limitFrom: 'slot-fit'
            }
          ]
        }
      ],
      contactBlocks: [
        {
          block: 'body-contact',
          accepts: {
            entity: 'contact-1',
            fields: [
              { kind: 'address', column: 'address', printed: true, filled: true },
              { kind: 'phone', column: 'telephone', printed: true, filled: true },
              { kind: 'mobile', column: 'mobile', printed: true, filled: false },
              { kind: 'fax', column: 'fax', printed: false, filled: false }
            ]
          }
        }
      ]
    },
    checks: { orphanTexts: 0 },
    errors: []
  }
}

test('a link label owned by another block is listed in the link block as a reference, never a second owner', () => {
  const kit = kitOf()
  applyCoverage(kit, { map: MAP })
  const ids = kit.blocks[0].slots.map((s) => [s.id, s.ownedBy ?? null])
  assert.deepEqual(ids, [
    ['menuItem-101.0', null],
    ['menuItem-150.0', null],
    ['block-4.1', 'block-4']
  ])
  const ref = kit.blocks[0].slots[2]
  assert.deepEqual([ref.paragraphs, ref.maxCharacters], [1, 24])
  // Which link prints the slot is said once, by the link's labelId; no slot carries a copy.
  assert.equal(kit.blocks[0].links.find((l) => l.labelId === 'block-4.1')?.id, 'header.link-3')
  assert.ok(!JSON.stringify(kit).includes('labelOf'))
  assert.equal(kit.blocks[0].slots[0].sample, 'Home')
})

test('the main menu row gets a whole-row limit: the top-level labels as the contract measured the demo row', () => {
  const kit = kitOf()
  applyCoverage(kit, { map: MAP })
  const row = kit.site.navigationGroups[0].rowLimit
  assert.equal(row.maxCharacters, 13)
  assert.deepEqual(row.items, ['menuItem-101.0', 'menuItem-150.0'])
  assert.match(row.maxCharactersFrom, /content map fit/)
  assert.equal(kit.site.navigationGroups[0].items[0].maxCharacters, 40)
})

test('a contact field gets the map slot of its column, or says it cannot be written and why, with no made-up id', () => {
  const kit = kitOf()
  applyCoverage(kit, { map: MAP })
  const [address, phone, mobile, fax] = kit.site.contactBlocks[0].accepts.fields
  assert.deepEqual([address.id, address.maxCharacters], ['contact-1.1', 30])
  assert.deepEqual([phone.id, phone.maxCharacters, phone.writable], ['contact-1.2', 24, true])
  // The mobile line has no map slot: it is written through a setting slot with the telephone line's limit.
  assert.deepEqual([mobile.id, mobile.writable, mobile.maxCharacters], ['contact-1.mobile', true, 24])
  assert.equal(fax.id, undefined)
  assert.equal(fax.writable, false)
  assert.match(fax.writableReason, /no slot for the contact's fax column/)
})

test('the gate is 0 for a kit that covers every shown slot, and lists every failure when it is not', () => {
  const kit = kitOf()
  applyCoverage(kit, { map: MAP })
  assert.equal(coverageGate(kit, { map: MAP }), 0)
  assert.deepEqual(kit.coverage.failures, [])
  const k2 = kitOf()
  applyCoverage(k2, { map: MAP })
  k2.blocks[1].slots.splice(0, 1) // block-4.0 shown, now declared nowhere
  k2.blocks[0].slots.pop() // the button label is no longer a slot of the header
  delete k2.site.navigationGroups[0].rowLimit
  k2.site.settingSlots = [] // the mobile field names a setting slot the kit no longer lists
  delete k2.blocks[1].slots[0].bullets
  assert.equal(coverageGate(k2, { map: MAP }), 5)
  assert.deepEqual(
    k2.coverage.failures.map((f) => f.part),
    [
      'slotsMissing',
      'linkLabelsOutsideBlock',
      'textFormatMissing',
      'mainMenuRowLimitMissing',
      'contactFieldsUnresolved'
    ]
  )
  assert.equal(k2.coverage.parts.orphanTexts, 0)
})

test('the gate names a limit below the demo words, and a text slot of a list without a sample row', () => {
  const kit = kitOf()
  applyCoverage(kit, { map: MAP })
  kit.blocks[1].slots[0].maxCharacters = 5 // "Swim with us" shows 12 characters
  kit.blocks[1].lists.push({ id: 'block-4.quote', rowSlots: [{ id: 'block-4.0', type: 'text' }], rows: [] })
  coverageGate(kit, { map: MAP })
  const failed = kit.coverage.failures.map((f) => `${f.part} ${f.where}`)
  assert.ok(failed.includes('limitsBelowDemo slots[block-4.0]'), failed.join(' | '))
  assert.ok(failed.includes('textFormatMissing slots[block-4.0]'), failed.join(' | '))
})

test('the main menu row takes its reading in the page, at every width it shows as one row, when there is one', () => {
  const kit = kitOf()
  const rowFit = { 'nav-block-1': { maxCharacters: 41, byWidth: { 1440: 64, 1024: 41 }, narrowest: 1024 } }
  applyCoverage(kit, { map: MAP, rowFit })
  const row = kit.site.navigationGroups[0].rowLimit
  assert.deepEqual([row.maxCharacters, row.narrowestWidth], [41, 1024])
  assert.match(row.maxCharactersFrom, /^kit frame: .*1440px 64, 1024px 41/)
})
