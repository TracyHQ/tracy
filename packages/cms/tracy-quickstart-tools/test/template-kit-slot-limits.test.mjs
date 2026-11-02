// One character limit per slot across the whole kit, copied from the contract and the kit's own frame readings,
// never measured again: the narrowest of the content map's measured fit, the kit's frame reading and the content
// map's declared number. A fit that is only the box of the demo word on an auto-sizing item (a menu label, a button)
// is no limit. Every place that lists the slot carries the one number and its source. Fabricated swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { slotLimitChecks, unifyLimits } from '../template-kit/lib/slot-limits.mjs'

const fit = (desktop, phone) => ({
  measured: true,
  maxChars: { desktop, phone },
  maxCharacters: Math.min(desktop, phone)
})
const MAP = [
  {
    key: 'menuItem-101.0',
    type: 'text',
    role: 'editorial.menu_label',
    sample: 'Home',
    maxCharacters: 40,
    fit: fit(4, 32)
  },
  {
    key: 'menuItem-156.0',
    type: 'text',
    role: 'editorial.menu_label',
    sample: 'Login',
    maxCharacters: 40,
    fit: fit(18, 30)
  },
  {
    key: 'article-4.0',
    type: 'text',
    role: 'editorial.paragraph',
    sample: 'A long intro',
    maxCharacters: 292,
    fit: fit(146, 136)
  },
  {
    key: 'module-7.0',
    type: 'text',
    role: 'editorial.heading',
    sample: 'Our pools',
    maxCharacters: 96,
    fit: fit(30, 34)
  },
  { key: 'module-7.2', type: 'text', role: 'editorial.heading', sample: 'Lane one', maxCharacters: 40 },
  { key: 'module-7.3', type: 'text', role: 'editorial.heading', sample: 'Lane two', maxCharacters: 40 },
  {
    key: 'contact-1.2',
    type: 'text',
    role: 'contact.phone',
    sample: '(555) 010-2000',
    maxCharacters: 48,
    fit: fit(24, 36)
  }
]
// The kit's own frame readings (text-fit.json), taken when the kit was built.
const TEXT_FIT = {
  'article-4.0': { limit: 142, byWidth: { 390: 150, 1440: 142 } },
  'block-7.2': { limit: 18, byWidth: { 390: 20, 1440: 18 } },
  'block-7.3': { limit: 25, byWidth: { 390: 25, 1440: 25 } }
}

const kitOf = () => ({
  blocks: [
    {
      id: 'header',
      slots: [
        { id: 'menuItem-101.0', type: 'text', maxCharacters: 40 },
        { id: 'menuItem-156.0', type: 'text', maxCharacters: 40 }
      ],
      lists: [],
      demoOwned: []
    },
    {
      id: 'block-7',
      slots: [{ id: 'block-7.0', type: 'text', maxCharacters: 96 }],
      lists: [
        {
          id: 'block-7.lane',
          rowSlots: [{ id: 'block-7.2', role: 'lane.title', type: 'text', maxCharacters: 18 }],
          rows: [
            { slots: [{ id: 'block-7.2', role: 'lane.title', type: 'text', maxCharacters: 18 }] },
            { slots: [{ id: 'block-7.3', role: 'lane.title', type: 'text', maxCharacters: 25 }] }
          ]
        }
      ],
      demoOwned: []
    },
    {
      id: 'body-news',
      slots: [],
      lists: [
        {
          id: 'body-news.items',
          rowKind: 'items',
          rowSlots: [
            {
              field: 'intro',
              type: 'text',
              maxCharacters: 142,
              slots: [{ id: 'article-4.0', maxCharacters: 142 }]
            }
          ]
        }
      ],
      demoOwned: []
    },
    {
      id: 'body-article-4',
      slots: [{ id: 'article-4.0', type: 'text', maxCharacters: 292 }],
      lists: [],
      demoOwned: []
    }
  ],
  site: {
    navigationGroups: [
      { id: 'nav-main', items: [{ labelSlot: 'menuItem-101.0', maxCharacters: 4, limitFrom: 'slot-fit' }] }
    ],
    contactBlocks: [
      {
        block: 'body-contact',
        accepts: { fields: [{ kind: 'phone', column: 'telephone', id: 'contact-1.2', printed: true }] }
      }
    ]
  },
  errors: []
})

const run = () => {
  const kit = kitOf()
  unifyLimits(kit, { mapSlots: MAP, textFit: TEXT_FIT })
  return kit
}

test('a menu label whose fit is only its demo word takes the declared number, and every place says why', () => {
  const kit = run()
  const [home, login] = kit.blocks[0].slots
  assert.equal(home.maxCharacters, 40)
  assert.match(home.maxCharactersFrom, /^content map declared/)
  assert.match(home.maxCharactersFrom, /demo word/)
  const nav = kit.site.navigationGroups[0].items[0]
  assert.deepEqual([nav.maxCharacters, nav.maxCharactersFrom], [40, home.maxCharactersFrom])
  assert.equal(nav.limitFrom, undefined, 'one source field, the same everywhere')
  assert.equal(login.maxCharacters, 18, 'a dropdown box wider than its demo word is a real frame')
  assert.match(login.maxCharactersFrom, /^content map fit \(desktop 18, phone 30\)/)
})

test('a slot shown on a card and on its own page takes the kit frame reading, the narrowest of its places, in both', () => {
  const kit = run()
  const field = kit.blocks[2].lists[0].rowSlots[0]
  const own = kit.blocks[3].slots[0]
  assert.deepEqual([field.maxCharacters, field.slots[0].maxCharacters, own.maxCharacters], [142, 142, 142])
  assert.equal(
    own.maxCharactersFrom,
    'kit frame (390px 150, 1440px 142)',
    'the frame reading, not the content map estimate'
  )
  assert.equal(field.maxCharactersFrom, own.maxCharactersFrom)
})

test('the slots at one place of every list row share the narrowest, and so does the row template', () => {
  const kit = run()
  const list = kit.blocks[1].lists[0]
  assert.deepEqual(
    [...list.rows.map((r) => r.slots[0].maxCharacters), list.rowSlots[0].maxCharacters],
    [18, 18, 18]
  )
  assert.equal(list.rows[1].slots[0].maxCharactersFrom, 'kit frame of block-7.2 (390px 20, 1440px 18)')
})

test('a contact field with a slot carries the slot limit', () => {
  const kit = run()
  const phone = kit.site.contactBlocks[0].accepts.fields[0]
  assert.deepEqual(
    [phone.maxCharacters, phone.maxCharactersFrom],
    [24, 'content map fit (desktop 24, phone 36)']
  )
})

test('self-check: a slot holding two limits anywhere in the kit, or a text slot without a limit and source', () => {
  const kit = run()
  assert.equal(slotLimitChecks({ kit, errors: [] }), 0)
  kit.blocks[3].slots[0].maxCharacters = 292
  delete kit.blocks[1].slots[0].maxCharactersFrom
  const errors = []
  assert.equal(slotLimitChecks({ kit, errors }), 2)
  assert.deepEqual(errors.map((e) => e.slot).sort(), ['article-4.0', 'block-7.0'])
})

// A row of tabs: each tab grows with its words, so the content map fit of each is its own demo word's box.
const TABS = [
  { key: 'module-9.1', type: 'text', role: 'step.title', sample: 'Basic', maxCharacters: 40, fit: fit(5, 5) },
  {
    key: 'module-9.2',
    type: 'text',
    role: 'step.title',
    sample: 'Trial practice',
    maxCharacters: 48,
    fit: fit(14, 14)
  }
]
const tabsKit = () => ({
  blocks: [
    {
      id: 'block-9',
      slots: [],
      demoOwned: [],
      lists: [
        {
          id: 'block-9.step',
          rowSlots: [{ id: 'block-9.1', role: 'step.title', type: 'text' }],
          rows: [
            { slots: [{ id: 'block-9.1', role: 'step.title', type: 'text' }] },
            { slots: [{ id: 'block-9.2', role: 'step.title', type: 'text' }] }
          ]
        }
      ]
    }
  ],
  site: {}
})

test('a fit that is only a tab word box is never lent to the other tabs: the container reading decides', () => {
  const declared = tabsKit()
  unifyLimits(declared, { mapSlots: TABS })
  assert.deepEqual(
    declared.blocks[0].lists[0].rows.map((r) => r.slots[0].maxCharacters),
    [40, 40],
    'no frame reading: the smaller declared number, never the 5 of "Basic"'
  )
  const framed = tabsKit()
  unifyLimits(framed, {
    mapSlots: TABS,
    textFit: { 'block-9.1': { limit: 22, byWidth: { 390: 22, 1440: 31 } } }
  })
  const [basic] = framed.blocks[0].lists[0].rows.map((r) => r.slots[0])
  assert.deepEqual([basic.maxCharacters, basic.maxCharactersFrom], [22, 'kit frame (390px 22, 1440px 31)'])
})

test('no number below the demo words: a short frame reading is set aside, and a group holds its longest demo', () => {
  const kit = tabsKit()
  // "Basic" filled to 9 holds "Basic" but not "Trial practice", which shows fine in its own tab.
  unifyLimits(kit, {
    mapSlots: TABS,
    textFit: {
      'block-9.1': { limit: 9, byWidth: { 1440: 9 } },
      'block-9.2': { limit: 3, byWidth: { 1440: 3 } }
    }
  })
  const [basic, trial] = kit.blocks[0].lists[0].rows.map((r) => r.slots[0])
  assert.equal(basic.maxCharacters, 40)
  assert.equal(trial.maxCharacters, 40)
})
