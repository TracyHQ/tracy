// The coverage gate: every content map slot a kit page shows is in the kit with its limit and source, every link's
// label is a slot of the block holding the link, the main menu row has a whole-row limit, every text slot says its
// paragraphs and bullets, and what the page prints but the contract cannot write says so. Fabricated swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyCoverage, audioSourceChecks, coverageGate } from '../template-kit/lib/coverage-gate.mjs'

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

test('a shown text slot the theme declares non-visual needs no limit; a number-less slot that is not declared still fails', () => {
  const map = {
    ...MAP,
    slots: [
      ...MAP.slots,
      {
        key: 'chrome.label',
        type: 'text',
        sample: 'Switch appearance',
        nonVisual: true,
        nonVisualFrom: 'an aria-label'
      }
    ]
  }
  const kit = kitOf()
  applyCoverage(kit, { map })
  const slot = { id: 'chrome.label', type: 'text', sample: 'Switch appearance', paragraphs: 1, bullets: 0 }
  const extra = { id: 'block-9', slots: [slot], lists: [], demoOwned: [], links: [] }
  Object.defineProperty(extra, 'shownSlots', { value: new Set(['chrome.label']) })
  kit.blocks.push(extra)
  Object.assign(slot, { nonVisual: true, maxCharactersFrom: 'not drawn in a box: an aria-label' })
  assert.equal(coverageGate(kit, { map }), 0)
  delete slot.nonVisual
  assert.equal(coverageGate(kit, { map }) > 0, true)
  assert.ok(kit.coverage.failures.some((f) => f.part === 'slotsMissing'))
})

test('audio capability gate requires exact typed source ownership and error-free player metadata', () => {
  const slot = {
    key: 'article-7.9',
    entity: 'article-7',
    type: 'url',
    role: 'business.audio',
    column: 'attribs',
    jsonPath: ['ctm_audio', 'audio-src', 2],
    group: { id: 'article-7.audio.2', item: 2, kind: 'business' },
    sample: 'images/audio/Same.mp3'
  }
  const link = {
    id: slot.key,
    sourceSlot: slot.key,
    action: 'media-source',
    mediaKind: 'audio',
    target: slot.sample,
    sourceBase: 'https://site.example/sub/',
    sourceUrl: 'https://site.example/sub/images/audio/Same.mp3',
    sourceBinding: { entity: slot.entity, column: slot.column, jsonPath: slot.jsonPath, group: slot.group },
    observed: {
      entity: slot.entity,
      track: '2',
      value: '/sub/images/audio/Same.mp3',
      initialized: true,
      metadata: true,
      mediaError: null
    }
  }
  const block = { id: 'body-album', source: { entity: slot.entity }, links: [link], frames: [] }
  const map = { slots: [slot] },
    kit = { blocks: [block] }
  const count = () => audioSourceChecks({ kit, map, fail: () => {} })
  assert.equal(count(), 0)
  for (const over of [
    { entity: 'article-8' },
    { track: '1' },
    { metadata: false },
    { mediaError: 4 },
    { initialized: false },
    { value: '/sub/images/audio/same.mp3' }
  ]) {
    const original = link.observed
    link.observed = { ...original, ...over }
    assert.equal(count(), 1)
    link.observed = original
  }
  block.links.push({ ...link })
  assert.equal(count(), 1)
  block.links.pop()
  block.frames.push({ id: link.id, kind: 'image' })
  assert.equal(count(), 1)
  block.frames.pop()
  block.links = []
  assert.equal(count(), 1)
})

test('audio capability stored field stays source media and never supplies CTA addresses or navigation QA', async () => {
  const { settleButtons } = await import('../template-kit/lib/button-slots.mjs')
  const { settleStoredFields } = await import('../template-kit/lib/stored-fields.mjs')
  const { buttonsOfBlock } = await import('../../../../apps/tracy-web/src/write-step/kit-buttons.js')
  const { planLinkTable } = await import('../../../../apps/tracy-web/src/write-step/plan-link-table.js')
  const audio = {
    key: 'article-7.9',
    entity: 'article-7',
    type: 'url',
    role: 'business.audio',
    column: 'attribs',
    jsonPath: ['ctm_audio', 'audio-src', '2'],
    group: { id: 'article-7.audio.2', item: 2, kind: 'business' },
    sample: 'images/audio/Same.mp3'
  }
  const label = {
    key: 'article-7.10',
    entity: 'article-7',
    type: 'text',
    column: 'attribs',
    role: 'contact.cta_label',
    sample: 'Listen',
    group: audio.group
  }
  const source = {
    id: audio.key,
    sourceSlot: audio.key,
    action: 'media-source',
    mediaKind: 'audio',
    target: audio.sample
  }
  const block = {
    id: 'body-album',
    source: { entity: audio.entity },
    visibleAt: [1440],
    links: [source, { id: 'cta', label: 'Listen' }]
  }
  const kit = { blocks: [block], pages: [], site: {} },
    map = { slots: [audio, label] }
  settleButtons(kit, { map })
  assert.equal(block.buttons[0].urlSlot, null)
  delete block.buttons
  assert.equal(buttonsOfBlock(block, map)[0].urlSlot, null)
  settleStoredFields(kit, { map })
  const field = kit.storedFields.find((s) => s.slot === audio.key)
  assert.deepEqual([field.mediaKind, field.role, field.listedIn], ['audio', 'business.audio', block.id])
  assert.deepEqual(field.jsonPath, audio.jsonPath)
  const qa = planLinkTable({
    kit,
    brief: { facts: [] },
    plan: {
      sharedBlocks: [
        {
          block: block.id,
          decision: 'keep',
          links: [{ link: source.id, leadsTo: 'https://media.example/Same.mp3' }]
        }
      ],
      pages: []
    }
  })
  assert.deepEqual(qa.planLinks, [])
})
