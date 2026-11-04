// Slots the kit marks as printed in one sentence are read joined, as the page prints them. Invented gym (see
// _site-copy-check.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { kitListsIndex } from '../src/site-writer/reading-page/kit-lists.js'
import { writerInput } from '../src/site-writer/writer-input.js'
import { brief, copy, kit, plan, slotOf } from './_site-copy-check.mjs'

const GROUP = {
  id: 'block-2.sentence-1',
  slots: ['block-2.1', 'block-3.6'],
  sample: 'Become the fittest version of yourself today',
  joins: [' ']
}
const sentenced = (extra = {}) => {
  const k = kit()
  k.blocks.find((b) => b.id === 'block-2').sentences = [{ ...GROUP, ...extra }]
  return k
}
function w12(first, second, k = sentenced(), mutate) {
  const c = copy()
  slotOf(c, 'block-2.1').text = first
  slotOf(c, 'block-3.6').text = second
  mutate?.(c)
  return checkCopy({ copy: c, plan: plan(), kit: k, brief: brief() }).rules.find((r) => r.id === 'W12')
}

test('W12 passes a sentence that reads as one', () => {
  assert.equal(w12('Train with a coach ', 'who knows you').status, 'pass')
  assert.equal(w12('Train with a coach', ' who knows you').status, 'pass')
})

test('W12 flags a missing space where the demo prints one, quoting the joined sentence', () => {
  const rule = w12('Train with a coach', 'who knows you')
  assert.equal(rule.status, 'fail')
  assert.equal(rule.failures[0].cause, 'missing-space')
  assert.match(rule.failures[0].detail, /"Train with a coachwho knows you"/)
  assert.match(rule.failures[0].detail, /block-2\.1 and block-3\.6/)
})

test('W12 leaves a word the demo itself prints without a space', () => {
  assert.equal(w12('Train', 'fit', sentenced({ joins: [''] })).status, 'pass')
})

test('W12 flags a capital in mid sentence', () => {
  const rule = w12('Train with a coach ', 'Every day')
  assert.equal(rule.failures[0].cause, 'capital-mid-sentence')
  assert.match(rule.failures[0].detail, /"Every"/)
})

test('W12 allows a capital after a full stop, a name the cited facts hold, and a capital in the demo', () => {
  assert.equal(w12('Train with a coach. ', 'Every day').status, 'pass')
  assert.equal(
    w12('Train with ', 'Nia Brook', sentenced(), (c) => (slotOf(c, 'block-3.6').factIds = ['f-coach']))
      .status,
    'pass'
  )
  const k = sentenced({ pieces: ['Join ', 'Monday'] })
  assert.equal(w12('Train ', 'Every day', k).status, 'pass')
})

test('W12 flags both faults of one sentence', () => {
  const rule = w12('Open to', 'Every age')
  assert.deepEqual(rule.failures.map((f) => f.cause).sort(), ['capital-mid-sentence', 'missing-space'])
})

test('W12 skips a kit with no sentence groups', () => {
  assert.equal(w12('a', 'b', kit()).status, 'skip')
})

test('the writer input shows the whole group and which page a slot titles', () => {
  const k = sentenced()
  const hero = k.blocks.find((b) => b.id === 'block-2')
  hero.slots[0].pageTitleOf = ['page-home']
  const input = writerInput({ plan: plan(), brief: brief(), kit: k })
  const block = input.blocks.find((b) => b.id === 'block-2')
  assert.equal(block.slots[0].pageTitleOf[0], 'page-home')
  assert.deepEqual(block.sentences[0].slots, GROUP.slots)
  assert.equal(block.sentences[0].demoPrints, GROUP.sample)
  assert.match(block.sentences[0].note, /one sentence/)
})

test('the reading page reads a group joined, as it will print', () => {
  const written = new Map([
    ['block-2.1', { text: 'Open to', owner: 'writer' }],
    ['block-3.6', { text: 'Every age', owner: 'writer' }]
  ])
  const index = kitListsIndex({ kit: sentenced(), written, hiddenWhy: new Map(), returned: new Map() })
  assert.deepEqual(index.sentencesOf('block-2'), [
    { id: GROUP.id, slots: GROUP.slots, demo: GROUP.sample, written: 'Open toEvery age' }
  ])
  assert.deepEqual(index.sentencesOf('block-3'), [])
})
