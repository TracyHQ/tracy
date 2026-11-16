// The copy step's parts written at the same time are merged into one answer with each slot once (writer-parts.js
// mergePartAnswers): a slot printed on pages of two parts is written by both, and kept twice it failed W02 for good.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergePartAnswers } from '../src/site-writer/writer-parts.js'
import { mergeTurnAnswers } from '../src/site-writer/writer-turns.js'

const part1 = {
  slots: [
    { slot: 'block-1.0', text: 'Boxing for every level', owner: 'writer' },
    { slot: 'languageString-7.0', text: 'Book a class', owner: 'writer' }
  ],
  alts: [{ frame: 'block-1.2', text: 'A coach holding pads.' }],
  seo: [{ page: 'page-home', title: 'Home', description: 'Boxing in Harbour Lane.' }],
  pages: [],
  returns: [],
  notebook: [{ page: 'page-home', facts: ['f1'] }]
}
const part2 = {
  slots: [
    { slot: 'languageString-7.0', text: 'Book your class', owner: 'writer' },
    { slot: 'block-2.0', text: 'Private sessions', owner: 'writer' }
  ],
  alts: [
    { frame: 'block-1.2', text: 'Pads and gloves on a bench.' },
    { frame: 'block-2.1', text: 'A heavy bag.' }
  ],
  seo: [{ page: 'page-private', title: 'Private', description: 'One to one.' }],
  pages: [{ id: 'legal:privacy', body: ['What we keep.'] }],
  returns: [],
  notebook: [{ page: 'page-private', facts: ['f2'] }]
}

test('a slot or alt two parts both wrote keeps the first part entry, and everything else stays in writing order', () => {
  const merged = mergePartAnswers([part1, part2])
  assert.deepEqual(
    merged.slots.map((s) => [s.slot, s.text]),
    [
      ['block-1.0', 'Boxing for every level'],
      ['languageString-7.0', 'Book a class'],
      ['block-2.0', 'Private sessions']
    ]
  )
  assert.deepEqual(
    merged.alts.map((a) => [a.frame, a.text]),
    [
      ['block-1.2', 'A coach holding pads.'],
      ['block-2.1', 'A heavy bag.']
    ]
  )
  assert.deepEqual(
    merged.seo.map((s) => s.page),
    ['page-home', 'page-private']
  )
  assert.deepEqual(merged.pages, part2.pages)
  assert.deepEqual(
    merged.notebook.map((n) => n.page),
    ['page-home', 'page-private']
  )
})

test('one part is returned as it is, and writing turns that follow each other still merge without dropping', () => {
  assert.equal(mergePartAnswers([part1]), part1)
  // Turns merge as before: an entry written twice stays twice there, for the copy check to report.
  assert.equal(mergeTurnAnswers([part1, part2]).slots.length, 4)
})

test('an entry with no name is never dropped', () => {
  const loose = { slots: [{ text: 'no slot named' }], alts: [], seo: [], pages: [], returns: [] }
  assert.equal(mergePartAnswers([loose, loose]).slots.length, 2)
})
