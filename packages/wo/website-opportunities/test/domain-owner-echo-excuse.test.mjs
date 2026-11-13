// Two edges of the echo guard (`owner-echo.mjs`, decision D46, #609): a public quote excuses only what it holds in a
// row with the copy and the owner's sentence (B3), and the Katakana long vowel mark weighs as Katakana (B4). Invented
// studio texts only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-echo-excuse.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copiesOwner, ownerEchoOf, tokensOf } from '../domain/owner-echo.mjs'

const SENTENCE =
  'Every single one of our pottery classes is capped at six students so that nobody ever has to wait for a wheel.'
const echo = ownerEchoOf([SENTENCE])
const words = SENTENCE.replace('.', '').split(' ')
// 17 of the 22 words kept in order, every fourth one swapped, so no run of four stands.
const COPY = words.map((w, n) => (n % 4 === 3 ? `zz${n}` : w)).join(' ')
// A long review sharing those common words in order, scattered.
const REVIEW =
  'Every class was single handedly one of the best; our teacher at the pottery classes is so kind, capped off a day at ' +
  'six with other students, so that nobody felt left out, ever. Has to be the best: wait for a spot on the wheel.'

test('a public review sharing common words in order excuses none of them: the copy is still a copy (B3)', () => {
  assert.equal(copiesOwner(COPY, echo).rule, 'sentence')
  assert.equal(copiesOwner(COPY, echo, [REVIEW]).rule, 'sentence')
})

test('a public text holding the same words in a row excuses them, and only the rest is held to the rule (B3)', () => {
  const bio = 'Every single one of our pottery classes is capped at six students.'
  // The copy quotes the bio, which says what the owner said: the bio's wording, not the owner's.
  assert.equal(
    copiesOwner('Every single one of our pottery classes is capped at six students', echo, [bio]),
    false
  )
  // The bio excuses its half; the other half still keeps 10 of the 15 words of the rest of the owner's sentence.
  const half = 'every single one of our pottery classes zz at six zz so that nobody zz has to wait zz a wheel'
  assert.equal(copiesOwner(half, echo, [bio]).rule, 'sentence')
  // Keeping only 8 of those 15 is a rewrite of the rest.
  const less = 'every single one of our pottery classes so that nobody zz has to wait zz a wheel'
  assert.equal(copiesOwner(less, echo, [bio]), false)
})

test('the Katakana long vowel mark is Katakana: a short name passes, a long copied run is caught (B4)', () => {
  const weight = (t) => tokensOf(t).reduce((n, x) => n + x.w, 0)
  assert.equal(weight('コーヒー'), 1)
  assert.ok(weight('コーヒーとケーキのセット') < 4)
  assert.equal(
    copiesOwner('コーヒーとケーキのセット', ownerEchoOf(['当店のコーヒーとケーキのセットは人気です'])),
    false
  )
  const long = 'スペシャルティコーヒーとホームメイドケーキのセットメニュー'
  assert.equal(copiesOwner(long, ownerEchoOf([`毎日${long}をご用意しています`])).rule, 'run')
})
