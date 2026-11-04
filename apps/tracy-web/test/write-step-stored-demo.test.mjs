// What the plan's files never name and the template still prints: a field the kit calls unprinted, the address of a link whose
// words left, and the spaces a template sets around its highlight. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptPagesOf, keepSpaceAround, storedDemoClaims } from '../src/write-step/stored-demo.js'
import { hideDoor, hideKit } from './_write-step-hide.mjs'
import { copy, plan, runStep } from './_write-step-run.mjs'

const kit = {
  blocks: [
    {
      id: 'body-rowing',
      source: { entity: 'article-8' },
      lists: [
        {
          rowSlots: [
            {
              field: 'custom:hero-title',
              printed: false,
              slots: [{ id: 'article-8.7' }, { id: 'article-9.7' }]
            },
            { field: 'custom:kind', slots: [{ id: 'article-8.9' }] }
          ]
        }
      ],
      links: [{ id: 'body-rowing.link-1', labelId: 'languageString-5.0' }]
    }
  ],
  pages: [
    { id: 'page-home', path: '/' },
    { id: 'page-rowing', path: '/halls/rowing' },
    { id: 'page-old', path: '/old' }
  ]
}
const contentMap = {
  slots: [
    { key: 'article-8.7', entity: 'article-8', type: 'text', sample: 'Demo <span>Rowing</span>' },
    { key: 'article-8.8', entity: 'article-8', type: 'text', sample: '#', jsonPath: ['hero-signup'] },
    { key: 'article-8.10', entity: 'article-8', type: 'text', sample: '#', jsonPath: ['kept-signup'] },
    { key: 'article-9.8', entity: 'article-9', type: 'text', sample: '#', jsonPath: ['hero-signup'] }
  ]
}
const planWith = (decision) => ({
  sharedBlocks: [],
  pages: [
    { id: 'page-home', decision: 'keep', blocks: [] },
    {
      id: 'page-rowing',
      decision: 'keep',
      blocks: [{ block: 'body-rowing', decision: 'keep', ...decision }]
    },
    { id: 'page-old', decision: 'drop', blocks: [] }
  ]
})
const slots = (claims) => claims.map((c) => c.slot).sort()

test('a field the kit calls unprinted is hidden, because its template may print it all the same', () => {
  const claims = storedDemoClaims({
    plan: planWith({}),
    kit,
    contentMap,
    filled: new Set(),
    file: 'kit.json'
  })
  assert.deepEqual(slots(claims), ['article-8.7', 'article-9.7'])
  assert.ok(claims.every((c) => c.kind === 'hide' && c.owner === 'kit' && c.file === 'kit.json'))
  assert.match(claims[0].why, /no file gives it words/)
})

test('a field a file fills stays that file’s', () => {
  const claims = storedDemoClaims({
    plan: planWith({}),
    kit,
    contentMap,
    filled: new Set(['article-8.7']),
    file: 'kit.json'
  })
  assert.deepEqual(slots(claims), ['article-9.7'])
})

test('a link whose words the plan hides takes the placeholder address its entity stores', () => {
  const claims = storedDemoClaims({
    plan: planWith({
      links: [{ link: 'body-rowing.link-1', leadsTo: 'page-home', labelSlot: 'languageString-5.0' }],
      hiddenSlots: [{ slot: 'languageString-5.0', why: 'no words' }]
    }),
    kit,
    contentMap,
    filled: new Set(['article-8.7', 'article-9.7']),
    file: 'kit.json'
  })
  assert.deepEqual(slots(claims), ['article-8.10', 'article-8.8'], 'on its own entity, never another')
  assert.match(claims[0].why, /address left|words of the link/)
})

test('a placeholder address the kit knows is a slot of the plan’s, and stays out of this', () => {
  const claims = storedDemoClaims({
    plan: planWith({
      links: [{ link: 'body-rowing.link-1', leadsTo: 'page-home', labelSlot: 'languageString-5.0' }],
      hiddenSlots: [{ slot: 'languageString-5.0', why: 'no words' }]
    }),
    kit: {
      ...kit,
      blocks: [
        { ...kit.blocks[0], source: { entity: 'module-4' }, slots: [{ id: 'block-4.2', type: 'url' }] }
      ]
    },
    contentMap: { slots: [{ key: 'module-4.2', entity: 'module-4', type: 'text', sample: '#' }] },
    filled: new Set(['article-8.7', 'article-9.7']),
    file: 'kit.json'
  })
  assert.deepEqual(claims, [])
})

test('an address inside HTML is no stored field: it holds a link of the page, and stays', () => {
  const claims = storedDemoClaims({
    plan: planWith({
      links: [{ link: 'body-rowing.link-1', leadsTo: 'page-home', labelSlot: 'languageString-5.0' }],
      hiddenSlots: [{ slot: 'languageString-5.0', why: 'no words' }]
    }),
    kit,
    contentMap: {
      slots: [
        {
          key: 'article-8.12',
          entity: 'article-8',
          type: 'url',
          sample: '#',
          xpath: '/html/body/div/a[1]/@href'
        }
      ]
    },
    filled: new Set(['article-8.7', 'article-9.7']),
    file: 'kit.json'
  })
  assert.deepEqual(claims, [])
})

test('with the words kept, a placeholder address stays', () => {
  const claims = storedDemoClaims({
    plan: planWith({
      links: [{ link: 'body-rowing.link-1', leadsTo: 'page-home', labelSlot: 'languageString-5.0' }]
    }),
    kit,
    contentMap,
    filled: new Set(['article-8.7', 'article-9.7']),
    file: 'kit.json'
  })
  assert.deepEqual(claims, [])
})

test('words beside a highlight keep the space the template set there, and nothing else moves', () => {
  const map = {
    slots: [
      { key: 'module-1.1', xpath: '/html/body/div/text()[1]', sample: 'Join over ' },
      { key: 'module-1.2', xpath: '/html/body/div/span/text()', sample: '100k' },
      { key: 'module-1.3', xpath: '/html/body/div/text()[2]', sample: ' of them' },
      { key: 'module-1.4', xpath: '/html/body/div/p/text()', sample: '\r\n  A paragraph' },
      { key: 'module-1.5', xpath: '/html/body/div/text()[3]', sample: 'tight' }
    ]
  }
  assert.deepEqual(
    keepSpaceAround(
      {
        'module-1.1': 'Open to',
        'module-1.2': 'Every age',
        'module-1.3': 'every level',
        'module-1.4': 'Own words',
        'module-1.5': 'held',
        'module-1.6': 'no slot'
      },
      map
    ),
    {
      'module-1.1': 'Open to ',
      'module-1.2': 'Every age',
      'module-1.3': ' every level',
      'module-1.4': 'Own words',
      'module-1.5': 'held',
      'module-1.6': 'no slot'
    }
  )
})

test('the pages the plan keeps, by their kit paths', () => {
  assert.deepEqual(keptPagesOf(planWith({}), kit), [
    { id: 'page-home', path: '/' },
    { id: 'page-rowing', path: '/halls/rowing' }
  ])
})

test('a run names on its report the pages the plan keeps, for the check to open', async () => {
  const { report } = await runStep(
    { plan: plan(), copy: copy() },
    { hideDoor: hideDoor({ overrides: {} }) },
    { kit: hideKit() }
  )
  assert.deepEqual(report.keptPages.map((p) => p.path).sort(), ['/', '/about-us'].sort())
})
