import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CHROME_SLOTS, initialsOf, resolveChromeSlots } from '../src/chrome-slots.mjs'
import { planJoomlaContract } from '../src/plan-joomla-contract.mjs'

const NOW = new Date('2026-09-12T00:00:00Z')

/** The four footer slots as the Claude Cowork plugin actually reports them, lengths included. */
const footer = () => [
  { key: 'module-174.0', sample: 'Built on the OpenDesign ', maxCharacters: 68, requiresEvidence: false },
  { key: 'module-174.1', sample: 'apple', maxCharacters: 40, requiresEvidence: false },
  {
    key: 'module-174.2',
    sample: ' design system — 56 tokens, one blue accent, capsule geometry.',
    maxCharacters: 144,
    requiresEvidence: false
  },
  {
    key: 'module-175.0',
    sample: '© 2026 Tracy Apple. A JoomlArt T4 template.',
    maxCharacters: 106,
    requiresEvidence: false
  }
]

test('the colophon loses the base archive branding on every served profile', () => {
  const withColophon = Object.keys(CHROME_SLOTS).filter((c) => 'module-174.0' in CHROME_SLOTS[c])
  assert.ok(withColophon.length >= 2)
  for (const contract of withColophon) {
    const { values, pending } = resolveChromeSlots({
      contract,
      slots: footer(),
      site: { name: 'Harbour Air Charters' },
      now: NOW
    })
    assert.deepEqual(pending, [], `${contract} should resolve its whole footer`)
    const colophon = values['module-174.0'] + values['module-174.1'] + values['module-174.2']
    assert.equal(colophon, 'Built with Tracy.')
    // The bug this file exists for: one base archive, two designs, and the word "apple" reaching
    // an Airbnb customer's footer.
    assert.ok(!/apple/i.test(colophon), `${contract} colophon still names the base design`)
    assert.ok(
      !/OpenDesign|design system|token/i.test(colophon),
      `${contract} colophon still sells a design system`
    )
  }
})

test("the legal line is the customer's own name, and the year is not the sample's", () => {
  const { values } = resolveChromeSlots({
    contract: 'tracy-airbnb/j6/1.1.0',
    slots: footer(),
    site: { name: 'Harbour Air Charters' },
    now: new Date('2031-02-03T00:00:00Z')
  })
  assert.equal(values['module-175.0'], '© 2031 Harbour Air Charters.')
  assert.ok(!/Tracy Apple|JoomlArt/.test(values['module-175.0']))
})

test('no business name means no legal line — a missing fact stays missing', () => {
  const { values, pending } = resolveChromeSlots({
    contract: 'tracy-airbnb/j6/1.1.0',
    slots: footer(),
    site: { headline: 'Seaplanes, since 1982' },
    now: NOW
  })
  assert.ok(pending.includes('module-175.0'))
  assert.equal(values['module-175.0'], undefined)
  // The colophon still resolves: it never needed the customer for anything.
  assert.equal(values['module-174.1'], 'Tracy')
})

test('a legal line too long for its slot waits instead of being clipped', () => {
  const slots = footer()
  const { values, pending } = resolveChromeSlots({
    contract: 'tracy-apple/j6/1.2.0',
    slots,
    site: { name: 'X'.repeat(200) },
    now: NOW
  })
  assert.ok(pending.includes('module-175.0'))
  assert.equal(values['module-175.0'], undefined)
})

test('a contract that does not carry a chrome slot is left alone', () => {
  const { values, pending, handled } = resolveChromeSlots({
    contract: 'tracy-apple/j6/1.2.0',
    slots: [{ key: 'module-9.0', sample: 'x', maxCharacters: 10 }],
    site: { name: 'Harbour Air Charters' },
    now: NOW
  })
  assert.deepEqual(values, {})
  assert.deepEqual(pending, [])
  assert.equal(handled.size, 0)
})

test('an unknown contract resolves nothing rather than guessing a footer', () => {
  const { values, pending, handled } = resolveChromeSlots({
    contract: 'tracy-someone-else/j6/9.9.9',
    slots: footer(),
    site: { name: 'Harbour Air Charters' },
    now: NOW
  })
  assert.deepEqual(values, {})
  assert.deepEqual(pending, [])
  assert.equal(handled.size, 0)
})

test('the planner never shows a chrome slot to the model', async () => {
  const seen = []
  const plan = await planJoomlaContract({
    state: {
      contract: 'tracy-airbnb/j6/1.1.0',
      revision: 'r1',
      slots: [
        ...footer(),
        { key: 'article-2.0', sample: 'Demo headline', maxCharacters: 80, requiresEvidence: false }
      ]
    },
    site: { name: 'Harbour Air Charters' },
    now: NOW,
    generate: async ({ input }) => {
      seen.push(...input.slots.map((s) => s.key))
      return JSON.stringify({ values: { 'article-2.0': 'Seaplane charters' }, pending: [] })
    }
  })
  assert.deepEqual(seen, ['article-2.0'], 'only real customer content should reach the model')
  assert.equal(plan.changes['module-174.1'], 'Tracy')
  assert.equal(plan.changes['module-175.0'], '© 2026 Harbour Air Charters.')
  assert.equal(plan.changes['article-2.0'], 'Seaplane charters')
  assert.deepEqual(plan.pending, [])
})

test('a footer that cannot resolve still stops the build, through the same door as before', async () => {
  const plan = await planJoomlaContract({
    state: { contract: 'tracy-airbnb/j6/1.1.0', revision: 'r1', slots: footer() },
    site: { headline: 'no name here' },
    now: NOW,
    generate: async () => JSON.stringify({ values: {}, pending: [] })
  })
  assert.deepEqual(plan.pending, ['module-175.0'])
})

test("the site's own routes are never asked about, and never changed", async () => {
  const seen = []
  const plan = await planJoomlaContract({
    state: {
      contract: 'tracy-airbnb/j6/1.1.0',
      revision: 'r1',
      slots: [
        { key: 'nav.0', sample: 'index.php?Itemid=263', maxCharacters: 2048, requiresEvidence: false },
        { key: 'nav.1', sample: '/resources/contact', maxCharacters: 2048, requiresEvidence: false },
        // An EXTERNAL destination is a real customer fact and must still be asked for.
        { key: 'cta.0', sample: 'https://example.test/book', maxCharacters: 2048, requiresEvidence: false },
        { key: 'copy.0', sample: 'Demo headline', maxCharacters: 80, requiresEvidence: false }
      ]
    },
    site: { name: 'Harbour Air' },
    now: NOW,
    generate: async ({ input }) => {
      seen.push(...input.slots.map((s) => s.key))
      return JSON.stringify({
        values: { 'copy.0': 'Seaplanes', 'cta.0': 'https://book.example' },
        pending: []
      })
    }
  })
  assert.deepEqual(seen.sort(), ['copy.0', 'cta.0'], 'internal routes must not reach the model')
  assert.equal(plan.changes['nav.0'], undefined, 'and must not be rewritten')
  assert.equal(plan.changes['nav.1'], undefined)
  assert.deepEqual(plan.pending, [], 'nor stall the build waiting for a route nobody can supply')
})

test('a pending slot records which rule sent it back', async () => {
  const plan = await planJoomlaContract({
    state: {
      contract: 'tracy-airbnb/j6/1.1.0',
      revision: 'r1',
      slots: [
        { key: 'a.0', sample: 'Demo', maxCharacters: 80, requiresEvidence: false },
        { key: 'b.0', sample: 'Demo', maxCharacters: 5, requiresEvidence: false },
        { key: 'c.0', sample: 'Demo', maxCharacters: 80, requiresEvidence: true }
      ]
    },
    site: { name: 'Harbour Air' },
    now: NOW,
    generate: async () =>
      JSON.stringify({
        values: { 'b.0': 'far too long for five', 'c.0': 'not in the brief' },
        pending: ['a.0']
      })
  })
  // Three keys, three different actions: ask the customer, fix a length, ask the model again.
  assert.equal(plan.reasons['a.0'], 'model-pended')
  assert.equal(plan.reasons['b.0'], 'too-long')
  assert.equal(plan.reasons['c.0'], 'evidence-missing')
})

// ── Tracy Business: the archive's own brand in its footer ───────────────────────────────────────
//
// 🔒 A BUSINESS SITE WENT OUT UNDER THE DEMO'S NAME. `tracy-business/j6` has no chrome entry, so its
// footer brand ("NG", "NORTHGATE") and legal line ("© 2026 Northgate Industrial JSC. Template running
// on Joomla 5.") went to the model with everything else — and the model, told not to invent, pended
// them. Measured 23/09/2026 on `j-8zjzs6`: 615 slots `model-pended`, the site name among them.

/** The footer slots of `tracy-business/j6` as its content map declares them. */
const businessFooter = () => [
  { key: 'module-435.0', entity: 'module-435', sample: 'NG', maxCharacters: 40, requiresEvidence: false },
  {
    key: 'module-435.1',
    entity: 'module-435',
    sample: 'NORTHGATE',
    maxCharacters: 40,
    requiresEvidence: false
  },
  {
    key: 'module-439.0',
    entity: 'module-439',
    sample: '© 2026 Northgate Industrial JSC. Template running on Joomla 5.',
    maxCharacters: 144,
    requiresEvidence: false
  },
  { key: 'module-455.0', entity: 'module-455', sample: 'NG', maxCharacters: 40, requiresEvidence: false },
  {
    key: 'module-455.1',
    entity: 'module-455',
    sample: 'NORTHGATE',
    maxCharacters: 40,
    requiresEvidence: false
  },
  {
    key: 'module-459.0',
    entity: 'module-459',
    sample: '© 2026 АО «Норткейт Индастриал». Шаблон работает на Joomla 5.',
    maxCharacters: 142,
    requiresEvidence: false
  }
]

test('the Business footer wears the customer’s name, mark and legal line, on both versions', () => {
  for (const contract of ['tracy-business/j6/1.0.0', 'tracy-business/j6/1.1.0']) {
    const { values, pending } = resolveChromeSlots({
      contract,
      slots: businessFooter(),
      site: { name: 'Toyota Hà Nội' },
      now: NOW
    })
    assert.deepEqual(pending, [], contract)
    assert.equal(values['module-435.0'], 'THN')
    assert.equal(values['module-435.1'], 'TOYOTA HÀ NỘI')
    assert.equal(values['module-439.0'], '© 2026 Toyota Hà Nội.')
    assert.equal(values['module-459.0'], '© 2026 Toyota Hà Nội.')
    assert.ok(!Object.values(values).some((v) => /northgate|норткейт/i.test(v)), 'no demo brand left')
  }
  // No name: nothing to write, and the build says so rather than keeping the demo's brand quietly.
  const none = resolveChromeSlots({
    contract: 'tracy-business/j6/1.1.0',
    slots: businessFooter(),
    site: {},
    now: NOW
  })
  assert.deepEqual(none.values, {})
  assert.equal(none.pending.length, 6)
})

test('initials: the same mark as the EmDash template makes for the same name', () => {
  assert.equal(initialsOf('Toyota Hà Nội'), 'THN')
  assert.equal(initialsOf('An Leather handmade Studio'), 'ALS', 'first two and the last of four words')
  assert.equal(initialsOf('Northgate Industrial JSC'), 'NI', 'a legal form is not a word of the name')
  assert.equal(initialsOf('Granite'), 'GR')
})

test('🔒 chrome in an edition the customer did not choose keeps its words', async () => {
  // The customer's name goes into the languages they asked for, and only those — the same rule the
  // planner applies to every other slot (`languageScope`).
  const id = 'tracy-business/j6/1.1.0'
  const dataDir = mkdtempSync(path.join(tmpdir(), 'chrome-'))
  mkdirSync(path.join(dataDir, 'quickstart-contracts', id), { recursive: true })
  writeFileSync(
    path.join(dataDir, 'quickstart-contracts', id, 'content-map.json'),
    JSON.stringify({
      entities: [
        { key: 'module-435', identity: { language: 'en-GB' } },
        { key: 'module-439', identity: { language: 'en-GB' } },
        { key: 'module-455', identity: { language: 'ru-RU' } },
        { key: 'module-459', identity: { language: 'ru-RU' } }
      ],
      slots: [],
      pages: []
    })
  )
  const seen = []
  const plan = await planJoomlaContract({
    state: { contract: id, revision: 'r1', slots: businessFooter() },
    site: { name: 'Toyota Hà Nội', languages: ['en-GB'] },
    now: NOW,
    dataDir,
    generate: async ({ input }) => {
      seen.push(...input.slots.map((s) => s.key))
      return JSON.stringify({ values: {}, pending: [] })
    }
  })
  assert.deepEqual(seen, [], 'chrome never reaches the model, in any language')
  assert.equal(plan.changes['module-435.1'], 'TOYOTA HÀ NỘI')
  assert.equal(plan.changes['module-439.0'], '© 2026 Toyota Hà Nội.')
  assert.equal(plan.changes['module-455.1'], undefined, 'the Russian edition keeps its words')
  assert.equal(plan.changes['module-459.0'], undefined)
  assert.deepEqual(plan.pending, [])
})

// 🔒 JA KINETIC AND JA VOYARA (plan T11, measured 07/10/2026 on two dev sites): the model wrote each © line its own way
// (Kinetic lost the year, Voyara's home footer kept "Voyara Travel Co."). The line is now the customer's, made here.
test('Kinetic and Voyara: every © slot is "© <year> <name>.", never shown to the model', async () => {
  const legal = (key, sample, maxCharacters) => ({ key, sample, maxCharacters, requiresEvidence: false })
  const profiles = {
    'ja-kinetic/j6/1.0.0': [legal('module-226.0', '© 2026 Helix Labs, Inc. All rights reserved.', 108)],
    'ja-kinetic/j6/1.0.2': [legal('module-226.0', '© 2026 Kinetic Labs, Inc. All rights reserved.', 112)],
    'ja-voyara/j6/1.0.1': [
      legal('module-465.0', '© 2026 Voyara Travel Co.', 68),
      legal('module-910.0', '© 2026 Voyara Travel Co.', 68)
    ],
    'ja-voyara/j6/1.0.2': [
      legal('module-465.0', '© 2026 Voyara Travel Co.', 68),
      legal('module-910.0', '© 2026 Voyara Travel Co.', 68)
    ],
    'ja-voyara/j6/1.0.3': [
      legal('module-465.0', '© 2026 Voyara Travel Co.', 68),
      legal('module-910.0', '© 2026 Voyara Travel Co.', 68)
    ]
  }
  for (const [contract, slots] of Object.entries(profiles)) {
    const seen = []
    const plan = await planJoomlaContract({
      state: {
        contract,
        revision: 'r1',
        slots: [
          ...slots,
          { key: 'article-2.0', sample: 'Demo headline', maxCharacters: 80, requiresEvidence: false }
        ]
      },
      site: { name: 'Tamq Bakery Test' },
      now: new Date('2031-02-03T00:00:00Z'),
      generate: async ({ input }) => {
        seen.push(...input.slots.map((s) => s.key))
        return JSON.stringify({ values: { 'article-2.0': 'Fresh bread' }, pending: [] })
      }
    })
    assert.deepEqual(seen, ['article-2.0'], `${contract}: the © slots must not reach the model`)
    for (const { key } of slots)
      assert.equal(plan.changes[key], '© 2031 Tamq Bakery Test.', `${contract} ${key}`)

    // No name: the slot is not written, so the template's own line stays.
    const nameless = resolveChromeSlots({ contract, slots, site: {}, now: NOW })
    assert.deepEqual(nameless.values, {}, contract)
    assert.deepEqual(nameless.pending.sort(), slots.map((s) => s.key).sort(), contract)
  }
})
