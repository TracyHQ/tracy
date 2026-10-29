import assert from 'node:assert/strict'
import test from 'node:test'
import { numberlessSentence } from '../domain/numberless-sentence.mjs'

// Brief facts as the place profile states them (fictional club).
const followers = { id: 'stat:followers', value: { amount: 1819, label: 'followers', scope: 'instagram' } }
const members = { id: 'stat:members', value: { amount: 240, label: 'members', scope: 'site' } }
const founded = { id: 'fact:founded', value: { amount: 2015, label: 'founded', scope: 'site' } }
const digits = /\d/

test('a heading with a demo number and no brief fact is rewritten with no number', () => {
  const got = numberlessSentence({ text: 'No1 boxing club since 2008' })
  assert.equal(got.state, 'neutral')
  assert.equal(got.text, 'Boxing club')
  assert.deepEqual(got.dropped, ['No1', '2008'])
  assert.deepEqual(got.factRefs, [])
})

test('quantities and their glue words go with the number', () => {
  assert.equal(numberlessSentence({ text: 'Over 5k happy members' }).text, 'Happy members')
  assert.equal(numberlessSentence({ text: '20 years of experience' }).text, 'Experience')
  assert.equal(
    numberlessSentence({ text: 'Trusted by more than 1,200 athletes.' }).text,
    'Trusted by athletes.'
  )
  assert.equal(numberlessSentence({ text: '98% of members train again' }).text, 'Members train again')
  assert.equal(numberlessSentence({ text: 'Rated 4.9/5 by our members' }).text, 'Rated by our members')
})

test('a heading whose number exists in the brief uses the brief number', () => {
  const got = numberlessSentence({ text: 'Join 5k followers', facts: [followers] })
  assert.equal(got.state, 'sourced')
  assert.equal(got.text, 'Join 1,819 followers')
  assert.deepEqual(got.factRefs, ['stat:followers'])
  assert.deepEqual(got.dropped, [])
})

test('a founding year comes from the brief, and a rank with no fact still goes', () => {
  const got = numberlessSentence({ text: 'No1 boxing club since 2008', facts: [founded, members] })
  assert.equal(got.state, 'sourced')
  assert.equal(got.text, 'Boxing club since 2015')
  assert.deepEqual(got.factRefs, ['fact:founded'])
  assert.deepEqual(got.dropped, ['No1'])
})

test('a fact about something else never stands in for the demo number', () => {
  const got = numberlessSentence({ text: 'Over 500 happy members', facts: [followers] })
  assert.equal(got.text, 'Happy members')
  assert.deepEqual(got.factRefs, [])
})

test('the brief number is printed the way the site language prints numbers', () => {
  const got = numberlessSentence({ text: '500 members trust us', facts: [members], locale: 'de' })
  assert.equal(got.text, '240 members trust us')
  const big = { id: 's', value: { amount: 12400, label: 'members', scope: 'site' } }
  assert.equal(numberlessSentence({ text: '500 members', facts: [big], locale: 'de' }).text, '12.400 members')
})

test('a heading with no number stays as it is', () => {
  assert.deepEqual(numberlessSentence({ text: 'Train with us' }), {
    state: 'unchanged',
    text: 'Train with us',
    factRefs: [],
    dropped: []
  })
})

test('a heading that is nothing but its number empties', () => {
  assert.deepEqual(numberlessSentence({ text: 'Since 2008' }), {
    state: 'empty',
    text: '',
    factRefs: [],
    dropped: ['2008']
  })
  assert.equal(numberlessSentence({ text: '24/7' }).state, 'empty')
})

test('no demo number ever stays in the rewritten text', () => {
  const demo = [
    'Top 10 gym in town since 1999',
    'We have 3 rings, 12 coaches and 1500+ members',
    '#1 choice for 25 years',
    'Open 7 days, 6am to 10pm',
    'Save 30% on your 1st month',
    'Est. 2001 - 4.8 stars on 300 reviews'
  ]
  for (const text of demo) {
    const got = numberlessSentence({ text })
    assert.ok(!digits.test(got.text), `${text} -> ${got.text}`)
  }
})
