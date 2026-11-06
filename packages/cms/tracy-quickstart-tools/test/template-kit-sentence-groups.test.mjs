// Slots printed as one sentence around a highlight are one group, told from the addresses of their text in the stored
// HTML. Fabricated swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sentenceGroupsOf, settleSentenceGroups } from '../template-kit/lib/sentence-groups.mjs'

const slot = (key, xpath, sample, jsonPath = ['intro']) => ({
  key,
  entity: key.replace(/\.\d+$/, ''),
  column: 'params',
  jsonPath,
  type: 'text',
  xpath,
  sample
})
const P = '/html/body/div/p'
const MAP = {
  slots: [
    slot('module-3.0', `${P}/text()[1]`, 'Swim with over '),
    slot('module-3.1', `${P}/span/text()`, '900'),
    slot('module-3.2', `${P}/text()[2]`, ' happy members'),
    // Two links side by side: labels, no sentence.
    slot('module-3.3', '/html/body/div/nav/a[1]/text()', 'Lanes'),
    slot('module-3.4', '/html/body/div/nav/a[2]/text()', 'Lessons'),
    // The same address in two stored fields: two elements on the page.
    slot('module-3.5', `${P}/text()`, 'Open daily', ['a']),
    slot('module-3.6', `${P}/text()`, 'Closed Sundays', ['b']),
    // A coloured word inside a word: no space belongs there.
    slot('module-5.0', `${P}/text()[1]`, 'Aqua'),
    slot('module-5.1', `${P}/b/text()`, 'fit')
  ]
}

test('a bare text and its inline highlight in one stored field are one sentence, in order', () => {
  const groups = sentenceGroupsOf(MAP)
  assert.deepEqual(groups[0], {
    slots: ['block-3.0', 'block-3.1', 'block-3.2'],
    sample: 'Swim with over 900 happy members',
    pieces: ['Swim with over', '900', 'happy members'],
    joins: [' ', ' '],
    kept: [true, true]
  })
})

test('links side by side and fields apart are not a sentence', () => {
  const all = sentenceGroupsOf(MAP).flatMap((g) => g.slots)
  for (const id of ['block-3.3', 'block-3.4', 'block-3.5', 'block-3.6']) assert.ok(!all.includes(id))
})

test('where the demo prints no space the group says so', () => {
  assert.deepEqual(sentenceGroupsOf(MAP)[1].joins, [''])
})

test('the kit lists a group on the block that shows it, and no group the kit does not show', () => {
  const kit = {
    blocks: [
      { id: 'block-1', slots: [] },
      {
        id: 'block-3',
        slots: [{ id: 'block-3.0', type: 'text' }],
        lists: [
          {
            id: 'block-3.row',
            rowSlots: [
              { id: 'block-3.1', type: 'text' },
              { id: 'block-3.2', type: 'text' }
            ]
          }
        ]
      }
    ]
  }
  settleSentenceGroups(kit, { map: MAP })
  assert.equal(kit.blocks[0].sentences, undefined)
  assert.deepEqual(kit.blocks[1].sentences, [
    {
      id: 'block-3.sentence-1',
      slots: ['block-3.0', 'block-3.1', 'block-3.2'],
      sample: 'Swim with over 900 happy members',
      pieces: ['Swim with over', '900', 'happy members'],
      joins: [' ', ' '],
      kept: [true, true]
    }
  ])
})

test('a space on a lone text node is one the write step does not put back', () => {
  const map = {
    slots: [slot('module-7.0', `${P}/text()`, 'Swim '), slot('module-7.1', `${P}/b/text()`, 'daily')]
  }
  assert.deepEqual(sentenceGroupsOf(map)[0].joins, [' '])
  assert.deepEqual(sentenceGroupsOf(map)[0].kept, [false])
})
