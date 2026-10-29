// Spec TracyHQ/tracy#189 (round 10): a part of a session outline the writer left in the demo's words, in a record with no
// door that takes one part off (an article's parameters keyed by name, not a JSON list), loses its lines. It is never handed
// on as a card to take off: no write can, and a build that is asked to stopped whole. Made-up businesses of two trades.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leftDemoText } from '../domain/demo-left-text.mjs'

const part = (entity, n, title, items) => {
  const group = { id: `${entity}.outline.${n}`, item: n, kind: 'step', presentation: 'session-outline' }
  return [
    {
      key: `${entity}.${n * 10}`,
      entity,
      type: 'text',
      role: 'step.title',
      sample: title,
      maxCharacters: 40,
      column: 'attribs',
      jsonPath: ['parts', `parts${n}`, 'part_title'],
      group
    },
    ...items.map((item, i) => ({
      key: `${entity}.${n * 10 + i + 1}`,
      entity,
      type: 'text',
      role: 'step.description',
      sample: item,
      maxCharacters: 40,
      column: 'attribs',
      jsonPath: ['parts', `parts${n}`, 'part_desc'],
      xpath: `/html/body/div/ul/li[${i + 1}]/text()`,
      group
    }))
  ]
}

for (const [trade, ownText, written] of [
  [
    'pottery studio',
    'Kilnworth Pottery, wheel and hand-building classes in Ashby.',
    { title: 'Wedging', item: 'Knead the clay until it is smooth' }
  ],
  [
    'swim school',
    'Bluewater Swim School, lessons for children and adults in Harlow.',
    { title: 'Floating', item: 'Lie back with a float under each arm' }
  ]
]) {
  test(`${trade}: an outline part left in the demo's words is emptied, never handed on as a card to take off`, () => {
    const slots = [
      ...part('article-40', 0, 'Warmup:', ['Ten minutes skipping rope', 'Fifteen squats']),
      ...part('article-40', 1, 'Finisher:', [
        'Three-minute round',
        'Rest thirty seconds',
        'Repeat five times'
      ])
    ]
    const out = leftDemoText({
      slots,
      written: {
        'article-40.0': written.title,
        'article-40.1': written.item,
        'article-40.2': written.item
      },
      asked: slots.map((s) => s.key),
      held: slots.filter((s) => s.key.startsWith('article-40.1')).map((s) => s.key),
      ownText,
      business: {},
      pages: [{ entity: 'menuItem-5', link: 'index.php?option=com_content&view=article&id=40' }],
      entities: [{ key: 'article-40', kind: 'article' }]
    })
    assert.deepEqual(out.hides, [], 'no hide the site has no door for')
    assert.deepEqual(
      out.blanks.filter((key) => /^article-40\.1\d$/.test(key)).sort(),
      ['article-40.10', 'article-40.11', 'article-40.12', 'article-40.13'],
      'every line of the part left in the demo is emptied'
    )
    assert.equal(out.counts.hidden, 1, 'the part still counts as taken off')
  })
}
