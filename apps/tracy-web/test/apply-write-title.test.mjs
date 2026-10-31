// The record title the dsh host sends beside an Apply write (`x-tracy-write-title`, `writeTitleOf`,
// `src/sites/route.js`), as the write's target keeps it. No Postgres: the reading alone; the door
// that reads it only from the host's signed actor is held in `component.test.mjs`.
//
//   node --test apps/tracy-web/test/apply-write-title.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeEffects, effectsOf } from '../src/sites/activity-describe.js'
import { writeTitleOf } from '../src/sites/route.js'
import { targetOf } from '../src/sites/turn-undo.js'

test('a title is decoded, put on one line and trimmed (council D1, 20/10/2026)', () => {
  assert.equal(writeTitleOf(encodeURIComponent('Yêu chính mình')), 'Yêu chính mình')
  assert.equal(writeTitleOf(encodeURIComponent(' About\n\tus  ')), 'About us')
  // Control characters a header could smuggle in once decoded never reach the label.
  assert.equal(writeTitleOf('Home%00%07page'), 'Home page')
})

test('none, a blank one and one that does not decode are no title: a write is never refused over its label', () => {
  for (const header of [undefined, null, '', '%20%20', '%0A', '%', '%E0%A4%A', '%ZZ'])
    assert.equal(writeTitleOf(header), null, String(header))
  assert.equal(writeTitleOf(42), null)
})

test('a title is capped at 200 characters without splitting a character', () => {
  assert.equal(writeTitleOf('a'.repeat(300)), 'a'.repeat(200))
  const cut = writeTitleOf(encodeURIComponent('😀'.repeat(201)))
  assert.equal([...cut].length, 200)
  assert.equal(cut, '😀'.repeat(200))
  // A cut that lands after a space does not leave it trailing.
  assert.equal(writeTitleOf(`${'b'.repeat(199)} c`), 'b'.repeat(199))
})

// #257: a write the dsh host marked as the site's static front page (`x-tracy-write-front`, kept as
// `target.front`) reaches the card and Site changes with the mark, beside the record's own title.
test('a front page mark reaches the turn card and Site changes beside the title, and only when set (#257)', () => {
  const front = { kind: 'post', id: '97', title: 'Read the latest News + Blog', front: true }
  assert.deepEqual(targetOf(front), front)
  assert.deepEqual(targetOf({ kind: 'post', id: '97', title: 'About' }), {
    kind: 'post',
    id: '97',
    title: 'About'
  })
  assert.equal('front' in targetOf({ kind: 'post', id: '97', front: 'yes' }), false, 'only true marks it')
  const { effects } = effectsOf({
    writes: [{ action: 'content.update', via: 'apply', outcome: 'ok', target: front }]
  })
  assert.deepEqual(describeEffects(effects), {
    key: 'resource.op',
    params: { op: 'update', type: 'post', id: '97', title: 'Read the latest News + Blog', front: true },
    isRequestOnly: false
  })
  const plain = effectsOf({
    writes: [{ action: 'content.update', via: 'apply', outcome: 'ok', target: { kind: 'post', id: '5' } }]
  })
  assert.equal('front' in describeEffects(plain.effects).params, false)
})
