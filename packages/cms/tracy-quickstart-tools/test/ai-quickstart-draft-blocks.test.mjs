// The block half of the AI quickstart draft (#583): kit blocks become block store blocks with typed fields, item
// fields and item counts, and the draft says plainly what it could not decide. Invented template and slots only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { draftBlocks } from '../ai-quickstart/lib/draft-blocks.mjs'

const text = (id, role, maxCharacters, maxCharactersFrom) => ({
  id,
  role,
  type: 'text',
  maxCharacters,
  maxCharactersFrom
})
const KIT_390 = (n) => `kit frame (390px ${n}, 1440px ${n + 9})`

/** An invented content map: every slot the kit names, plus two design values the kit does not show. */
const contentMap = {
  slots: [
    { key: 'module-20.0', entity: 'module-20', type: 'text', role: 'editorial.heading', jsonPath: ['title'] },
    { key: 'module-20.1', entity: 'module-20', type: 'url', role: 'contact.cta_url', jsonPath: ['link'] },
    { key: 'module-20.2', entity: 'module-20', type: 'text', role: 'contact.cta_label', jsonPath: ['label'] },
    {
      key: 'module-20.3',
      entity: 'module-20',
      type: 'text',
      role: 'offering.name',
      jsonPath: ['items', '0']
    },
    {
      key: 'module-20.4',
      entity: 'module-20',
      type: 'text',
      role: 'offering.name',
      jsonPath: ['items', '1']
    },
    {
      key: 'module-20.5',
      entity: 'module-20',
      type: 'image',
      role: 'offering.image',
      jsonPath: ['img', '0']
    },
    {
      key: 'module-20.6',
      entity: 'module-20',
      type: 'image',
      role: 'offering.image',
      jsonPath: ['img', '1']
    },
    {
      key: 'module-20.7',
      entity: 'module-20',
      type: 'text',
      role: 'editorial.paragraph',
      jsonPath: ['grid[gutter]']
    },
    {
      key: 'module-20.8',
      entity: 'module-20',
      type: 'text',
      role: 'editorial.paragraph',
      jsonPath: ['note']
    },
    { key: 'module-21.0', entity: 'module-21', type: 'text', role: 'package.name', jsonPath: ['plans', '0'] },
    {
      key: 'menuItem-5.0',
      entity: 'menuItem-5',
      type: 'text',
      role: 'editorial.menu_label',
      column: 'title'
    },
    {
      key: 'menuItem-6.0',
      entity: 'menuItem-6',
      type: 'text',
      role: 'editorial.menu_label',
      column: 'title'
    },
    { key: 'languageString-9.0', entity: 'languageString-9', type: 'text', role: 'editorial.button_label' }
  ]
}

const servicesBlock = {
  id: 'block-20',
  role: 'section',
  source: { entity: 'module-20', position: 'section-1', contains: ['module-21'] },
  slots: [
    text('block-20.0', 'editorial.heading', 30, KIT_390(30)),
    text('languageString-9.0', 'editorial.button_label', 20, KIT_390(20))
  ],
  lists: [
    {
      id: 'block-20.cta',
      rowKind: 'slots',
      min: 1,
      max: 1,
      rowSlots: [
        {
          id: 'block-20.2',
          role: 'contact.cta_label',
          type: 'text',
          maxCharacters: 18,
          maxCharactersFrom: KIT_390(18)
        },
        { id: 'block-20.1', role: 'contact.cta_url', type: 'url' }
      ]
    },
    {
      id: 'block-20.item',
      rowKind: 'slots',
      min: 1,
      max: 2,
      rowSlots: [
        {
          id: 'block-20.3',
          role: 'offering.name',
          type: 'text',
          maxCharacters: 24,
          maxCharactersFrom: 'content map declared'
        },
        { id: 'block-20.5', role: 'offering.image', type: 'image' }
      ],
      rows: [
        { index: 0, slots: [{ id: 'block-20.3' }, { id: 'block-20.5' }] },
        { index: 1, slots: [{ id: 'block-20.4' }, { id: 'block-20.6' }] }
      ]
    },
    {
      id: 'block-21.item',
      rowKind: 'slots',
      min: 1,
      max: 1,
      rowSlots: [
        {
          id: 'block-21.0',
          role: 'package.name',
          type: 'text',
          maxCharacters: 20,
          maxCharactersFrom: KIT_390(20)
        }
      ]
    }
  ],
  frames: [
    { id: 'block-20.5', width: 300, height: 200, kind: 'photo' },
    { id: 'block-20.6', width: 300, height: 200, kind: 'photo' }
  ]
}

const headerBlock = {
  id: 'header',
  role: 'header',
  source: { entity: null, position: null },
  slots: [
    text('menuItem-5.0', 'editorial.menu_label', 14, KIT_390(14)),
    text('menuItem-6.0', 'editorial.menu_label', 40, 'content map declared')
  ],
  lists: [],
  frames: []
}

const kit = { blocks: [headerBlock, servicesBlock] }
const decisions = {
  blocks: {
    header: { type: 'header', nav: true, noData: { rule: 'fallback', fallback: 'the page titles' } },
    'block-20': { type: 'services' },
    'block-21': { type: 'pricing' }
  }
}

const draft = (over = {}) => draftBlocks({ kit, contentMap, decisions: { ...decisions, ...over } })
const blockOf = (res, id) => res.blocks.find((b) => b.id === id)

test('own slots become fields with a type, a data kind, the content map key and a limit measured at 390 px', () => {
  const block = blockOf(draft(), 'block-20')
  assert.equal(block.type, 'services')
  assert.deepEqual(block.positions, ['section-1'])
  const heading = block.fields.find((f) => f.name === 'heading')
  assert.deepEqual(
    { ...heading },
    {
      name: 'heading',
      kind: 'editorial.heading',
      type: 'text',
      limit: 30,
      limitFrom: KIT_390(30),
      slot: 'module-20.0'
    }
  )
})

test('a single row list becomes fields named after the list; a link stays a link', () => {
  const block = blockOf(draft(), 'block-20')
  const names = block.fields.map((f) => `${f.name}:${f.type}`)
  assert.ok(names.includes('cta-label:text'), names.join(' '))
  assert.ok(names.includes('cta-url:link'), names.join(' '))
})

test('the repeating list becomes item fields with one content map key per item and its item counts', () => {
  const block = blockOf(draft(), 'block-20')
  assert.deepEqual(block.items, { min: 1, max: 2 })
  const image = block.itemFields.find((f) => f.type === 'image')
  assert.deepEqual(image.frame, { width: 300, height: 200 })
  assert.deepEqual(image.slots, ['module-20.5', 'module-20.6'])
})

test('a declared cap is no limit: the draft leaves the limit out and lists the field as not measured', () => {
  const res = draft()
  const name = blockOf(res, 'block-20').itemFields.find((f) => f.kind === 'offering.name')
  assert.equal(name.limit, undefined)
  assert.ok(res.unmeasured.some((u) => u.block === 'block-20' && u.slot === 'module-20.3'))
})

test('a limit measured on the running template fills a field the kit could not measure', () => {
  const measured = { 'module-20.3': { limit: 19, limitFrom: 'measured at 390px on the running demo' } }
  const res = draftBlocks({ kit, contentMap, decisions, measured })
  const name = blockOf(res, 'block-20').itemFields.find((f) => f.kind === 'offering.name')
  assert.equal(name.limit, 19)
  assert.ok(!res.unmeasured.some((u) => u.slot === 'module-20.3'))
})

test('a list of a module the block contains becomes a block of its own, placed inside the container', () => {
  const nested = blockOf(draft(), 'block-21')
  assert.equal(nested.type, 'pricing')
  assert.deepEqual(nested.positions, ['inside:block-20'])
  assert.equal(nested.fields[0].slot, 'module-21.0')
})

test('a language string and a menu label are not fields of a content block: the build writes them elsewhere', () => {
  const res = draft()
  const block = blockOf(res, 'block-20')
  assert.ok(!block.fields.some((f) => f.slot === 'languageString-9.0'))
  assert.ok(res.derived.some((d) => d.slot === 'languageString-9.0' && d.block === 'block-20'))
})

test('a navigation block lists its menu as items: a label limited by the narrowest measured label, and a link', () => {
  const header = blockOf(draft(), 'header')
  assert.deepEqual(header.items, { min: 1, max: 2 })
  const label = header.itemFields.find((f) => f.name === 'label')
  assert.equal(label.limit, 14)
  assert.deepEqual(label.slots, ['menuItem-5.0', 'menuItem-6.0'])
  assert.equal(header.itemFields.find((f) => f.name === 'link').type, 'link')
  assert.deepEqual(header.noData, { rule: 'fallback', fallback: 'the page titles' })
})

test('a stored value the kit does not show and whose key reads as layout is a design field without a kind', () => {
  const block = blockOf(draft(), 'block-20')
  const design = block.fields.find((f) => f.slot === 'module-20.7')
  assert.equal(design.type, 'design')
  assert.equal(design.kind, undefined)
  const res = draft()
  assert.ok(
    res.unlisted.some((u) => u.slot === 'module-20.8'),
    'an unshown value that is not layout is reported'
  )
})

test('every block has a no data rule (hide unless decided) and item counts', () => {
  const block = blockOf(draft(), 'block-21')
  assert.deepEqual(block.noData, { rule: 'hide' })
  assert.deepEqual(block.items, { min: 1, max: 1 })
})

test('a skipped kit block is left out with its reason', () => {
  const res = draft({ blocks: { ...decisions.blocks, header: { skip: 'invented reason' } } })
  assert.equal(blockOf(res, 'header'), undefined)
  assert.deepEqual(res.skipped, [{ kit: 'header', reason: 'invented reason' }])
})

test('a block without a decided type is reported, not guessed', () => {
  const res = draft({ blocks: { 'block-20': {} } })
  assert.ok(res.undecided.includes('header'))
})

test('kit blocks of one layout are one store block whose text limits are the least measured on any page', () => {
  const body = (id, entity, limit) => ({
    id,
    role: 'page-body',
    source: { entity },
    slots: [text(`${entity}.1`, 'editorial.paragraph', limit, KIT_390(limit))],
    lists: [],
    frames: []
  })
  const map = {
    slots: ['article-1', 'article-2'].map((e) => ({
      key: `${e}.1`,
      entity: e,
      type: 'text',
      role: 'editorial.paragraph'
    }))
  }
  const res = draftBlocks({
    kit: { blocks: [body('body-one', 'article-1', 120), body('body-two', 'article-2', 90)] },
    contentMap: map,
    decisions: { groups: [{ match: '^body-', id: 'post-body', type: 'posts' }] }
  })
  assert.equal(res.blocks.length, 1)
  assert.deepEqual(res.blocks[0].from.kit, ['body-one', 'body-two'])
  assert.equal(res.blocks[0].fields[0].limit, 90)
  assert.deepEqual(res.storeIdOf, { 'body-one': 'post-body', 'body-two': 'post-body' })
})

test('a decision can name a stored value as design even when the kit shows it as text', () => {
  const res = draftBlocks({
    kit,
    contentMap,
    decisions: { blocks: { ...decisions.blocks, 'block-20': { type: 'services', design: ['module-20.0'] } } }
  })
  const field = blockOf(res, 'block-20').fields.find((f) => f.slot === 'module-20.0')
  assert.equal(field.type, 'design')
  assert.equal(field.kind, undefined)
})

test('a slot the kit lists in one block but owned by another store block is a field of its owner only', () => {
  const owned = {
    ...headerBlock,
    slots: [
      ...headerBlock.slots,
      { ...text('block-20.0', 'editorial.heading', 30, KIT_390(30)), ownedBy: 'block-20' }
    ]
  }
  const res = draftBlocks({ kit: { blocks: [owned, servicesBlock] }, contentMap, decisions })
  assert.ok(!blockOf(res, 'header').fields.some((f) => f.slot === 'module-20.0'))
  assert.ok(blockOf(res, 'block-20').fields.some((f) => f.slot === 'module-20.0'))
})

test('a retyped value takes its decided kind and type, and a link keeps no length limit', () => {
  const res = draft({
    blocks: {
      ...decisions.blocks,
      'block-20': {
        type: 'services',
        retype: { 'module-20.0': { kind: 'person.social_url', type: 'link', storage: 'html list' } }
      }
    }
  })
  const field = blockOf(res, 'block-20').fields.find((f) => f.slot === 'module-20.0')
  assert.equal(field.type, 'link')
  assert.equal(field.kind, 'person.social_url')
  assert.equal(field.limit, undefined)
})

test('a text never drawn takes the cap its decision names, recorded as not drawn, never as measured', () => {
  const res = draft({ nonVisual: { 'module-20.3': { limit: 24, why: 'invented: an icon link label' } } })
  const name = blockOf(res, 'block-20').itemFields.find((f) => f.kind === 'offering.name')
  assert.equal(name.limit, 24)
  assert.equal(name.limitFrom, 'not drawn at any width: invented: an icon link label')
})

test('a value the demo never shows can be left out of the store with its reason', () => {
  const res = draft({ omit: { 'module-20.2': 'invented: the demo never shows this button' } })
  assert.ok(!blockOf(res, 'block-20').fields.some((f) => f.slot === 'module-20.2'))
  assert.deepEqual(res.omitted, [
    { block: 'block-20', slot: 'module-20.2', why: 'invented: the demo never shows this button' }
  ])
})

test('a text drawn in the same box as a measured one takes its limit and says where it came from', () => {
  const res = draft({ sameBoxAs: { 'module-20.3': 'module-20.0' } })
  const name = blockOf(res, 'block-20').itemFields.find((f) => f.kind === 'offering.name')
  assert.equal(name.limit, 30)
  assert.match(name.limitFrom, /^the same box as module-20.0: kit frame/)
  assert.ok(!res.unmeasured.some((u) => u.slot === 'module-20.3'))
})
