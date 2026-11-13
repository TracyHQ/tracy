// The held text matcher (`held-text-match.mjs`, #609, decision D46), both sides of every rule: a held name in a script
// written without spaces, a multi word name never found inside other words, a common word name only where it reads as
// a name, a first name alone, and the cost of many names on a long text. Invented names and texts only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-held-text-match.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heldNamesIn, heldSlugsIn } from '../domain/held-reviews.mjs'
import { heldSpansIn, withoutHeldSentences } from '../domain/held-text-match.mjs'

const found = (text, names, opts) => heldSpansIn(text, names, opts).map((s) => text.slice(s.start, s.end))
const reading = { casedCommon: true }

test('a held name in a script written without spaces is found with no word boundary (B1)', () => {
  for (const [name, text] of [
    ['山田花子', '山田花子さんが陶芸を教えます。'],
    ['山田花子', '講師は山田花子です。'],
    ['山田 花子', '講師は山田花子です。'],
    ['王芳', '王芳老师每天上课'],
    ['สมชาย', 'ครูสมชายสอนทุกวัน'],
    ['김민지', '김민지가 가르칩니다.'],
    ['김민지', '김민지 선생님이 가르칩니다.'],
    ['Mira Solent', 'Mira Solentさんの教室']
  ]) {
    assert.ok(found(text, [name]).length, text)
    assert.deepEqual(heldNamesIn(text, [name]), [name], text)
    assert.equal(withoutHeldSentences(text, [name]).heldOut, 1, text)
  }
  // Near misses: a kana voicing mark is a letter of its own, and a Latin name still needs whole words.
  assert.deepEqual(found('カク教室', ['ガク']), [])
  assert.deepEqual(found('Mirasolent classes', ['Mira']), [])
})

test('a multi word name is whole words at both ends in prose, and whole tokens when glued in a slug (B5)', () => {
  for (const [name, text] of [
    ['Ed Lee', 'Fed leeks to the garden club.'],
    ['Ed Lee', 'Ask Fred Lee about the garden club.'],
    ['Al Ma', 'Normal maps of the shop.'],
    ['Ana Bo', 'banana-boat.jpg'],
    ['Ed Lee', 'used-leek.jpg'],
    ['Ed Lee', '/img/fedlee.png'],
    ['Al Ma', 'animal-magic.jpg']
  ])
    assert.deepEqual(found(text, [name]), [], `${name} in ${text}`)
  for (const [name, text] of [
    ['Ed Lee', 'Ask Ed Lee today.'],
    ['Ed Lee', 'ed-lee.jpg'],
    ['Brannoch Vey', 'Ask for Brannoch.\nVey runs raku.'],
    ['Brannoch Vey', 'Follow @brannochvey for raku.'],
    ['Pellam Orrick', 'pellam-orrick2.jpg'],
    ['Zoe Marlow', 'zoe.marlow@example.test']
  ])
    assert.ok(found(text, [name]).length, `${name} in ${text}`)
  assert.deepEqual(heldSlugsIn('brannochvey.jpg', ['Brannoch Vey']), ['Brannoch Vey'])
})

test('a common word name is held in prose only with a capital mid sentence, or with a name context (B5)', () => {
  // Words, not names: lower case, or at a sentence start with nothing that marks a name.
  for (const [name, text] of [
    ['Rose', 'Our rose bouquets are back.'],
    ['Will', 'We will deliver to offices.'],
    ['May', 'You may book online.'],
    ['Will', 'Will you deliver on Sunday?'],
    ['May', 'May is our busiest month.']
  ])
    assert.deepEqual(found(text, [name], reading), [], `${name} in ${text}`)
  // Names: mid sentence with a capital, a title, a role, a possessive, another name part; a slug; an author field.
  for (const [name, text] of [
    ['Rose', 'Ask Rose about the bouquets.'],
    ['May', 'Same day delivery in May and June.'],
    ['Rose', 'Rose, our florist, made it.'],
    ['Will', 'Will is our head baker.'],
    ['Will', "Will's sourdough sells out."],
    ['Rose', 'Rose Tan made my bouquet.'],
    ['Will', 'Chef Will cooks on Fridays.'],
    ['Rose', 'rose-portrait.jpg']
  ])
    assert.ok(found(text, [name], reading).length, `${name} in ${text}`)
  assert.ok(found('Rose', ['Rose'], { ...reading, asName: true }).length)
  // Without the reading's option (a review, a value bound for the site) privacy wins: any case is held.
  assert.deepEqual(heldNamesIn('Our rose bouquets are back.', ['Rose']), ['Rose'])
})

test("a held person's first name alone is held with a capital; two letters or a lower case word is not", () => {
  const people = { people: ['Brannoch Vey', 'Ed Lee', 'Rose Tan', '山田 花子'], casedCommon: true }
  const names = people.people
  assert.deepEqual(found('Ask Brannoch about raku nights.', names, people), ['Brannoch'])
  assert.deepEqual(found('Brannoch leads raku.', names, people), ['Brannoch'])
  assert.deepEqual(found('brannoch is lower case here.', names, people), [])
  assert.deepEqual(found('Ed was here.', names, people), [])
  assert.deepEqual(found('Rose is our florist.', names, people), ['Rose'])
  assert.deepEqual(found('Rose bouquets are back.', names, people), [])
  assert.deepEqual(found('講師は山田です。', names, people), [])
  // In an address or a handle the first name is the person, in any case.
  assert.deepEqual(found('Write to brannoch@example.test.', names, people), ['brannoch'])
  assert.ok(found('Brannoch', names, { ...people, asName: true }).length)
  // The span names the held person, so a caller knows whom it found.
  assert.equal(heldSpansIn('Ask Brannoch.', names, people)[0].name, 'Brannoch Vey')
})

test('fifty names on a long text are folded once: a coarse time bound (B7)', () => {
  const names = Array.from({ length: 50 }, (_, n) => `Invented${n} Person${n}`)
  const text = 'We fire twice a week in the old bakery oven. '.repeat(4600)
  assert.ok(text.length > 200_000)
  const start = performance.now()
  assert.deepEqual(heldSlugsIn(text, names), [])
  assert.deepEqual(heldNamesIn(text, names), [])
  const ms = performance.now() - start
  assert.ok(ms < 800, `took ${Math.round(ms)} ms`)
})
