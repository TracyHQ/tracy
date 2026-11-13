// The copy check of the page writer (ticket #594): it measures the declared limit and type of each field, never demo
// length, and has no floor, so a short value is never sent back to be padded.
import assert from 'node:assert/strict'
import test from 'node:test'
import { charCount, checkPageCopy, fieldValueProblems } from '../domain/page-copy-check.mjs'
import { inventedDataOf } from '../domain/page-writer-data-guard.mjs'

const heading = { name: 'heading', type: 'text', kind: 'editorial.heading', limit: 30 }
const codes = (field, value, context) => fieldValueProblems(field, value, context).map((p) => p.code)

test('a value within the declared limit passes, however short: there is no floor', () => {
  assert.deepEqual(codes(heading, 'Courts'), [])
  assert.deepEqual(codes(heading, 'x'.repeat(30)), [])
  assert.deepEqual(codes({ ...heading, demo: 'A much longer demo heading of the template' }, 'Hi'), [])
})

test('over the declared limit fails, counted in characters the customer reads', () => {
  assert.deepEqual(codes(heading, 'x'.repeat(31)), ['over_limit'])
  assert.equal(charCount('Café \u{1F3BE}'), 6)
  assert.deepEqual(codes({ ...heading, limit: 6 }, 'Café \u{1F3BE}'), [])
})

test('the type is checked: a text field holds a non-empty plain string', () => {
  assert.deepEqual(codes(heading, 12), ['wrong_type'])
  assert.deepEqual(codes(heading, ['a']), ['wrong_type'])
  assert.deepEqual(codes(heading, undefined), ['missing'])
  assert.deepEqual(codes(heading, '   '), ['empty'])
  assert.deepEqual(codes(heading, ' Courts'), ['edge_space'])
  assert.deepEqual(codes(heading, '<b>Courts</b>'), ['markup'])
  assert.deepEqual(codes(heading, `Courts ${String.fromCharCode(0x2014)} open`), ['dash'])
  assert.deepEqual(codes({ name: 'price', type: 'number' }, 12), ['not_a_copy_field'])
})

test('a page check lists only the failing slots', () => {
  const slots = [
    { key: 'p-b1/heading', field: heading },
    { key: 'p-b1/sub', field: { ...heading, name: 'sub', limit: 5 } }
  ]
  const result = checkPageCopy(slots, { 'p-b1/heading': 'Fine', 'p-b1/sub': 'Too long' })
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.failing.map((f) => f.key),
    ['p-b1/sub']
  )
})

test('a value made only of invisible characters is empty', () => {
  for (const value of ['​', '​‌‍', '﻿ ', '⁠', ' ㅤ ', '­'])
    assert.deepEqual(codes(heading, value), ['empty'], JSON.stringify(value))
})

test('plain text means one line with no HTML tag, no markdown marker and no control character', () => {
  assert.deepEqual(codes(heading, 'Courts\nopen'), ['line_break'])
  assert.deepEqual(codes(heading, 'Courts\r\nopen'), ['line_break'])
  assert.deepEqual(codes(heading, 'Courts open'), ['line_break'])
  assert.deepEqual(codes(heading, 'Courts\topen'), ['control_character'])
  for (const value of [
    '**Bold** courts',
    '# Courts',
    '[Book](x)',
    '`code` here',
    '- a court',
    '> quoted',
    '__big__ day',
    '1. First',
    '*soft* touch'
  ])
    assert.deepEqual(codes(heading, value), ['markdown'], value)
  for (const value of [
    'a & b <3',
    '5* rating',
    'Rates 2 * 3',
    'Courts, lessons and more.',
    '...',
    'Mon to Fri'
  ])
    assert.deepEqual(codes(heading, value), [], value)
})

test('every dash the rule bans fails: figure, en, em, horizontal bar and minus sign', () => {
  for (const code of [0x2012, 0x2013, 0x2014, 0x2015, 0x2212])
    assert.deepEqual(codes(heading, `x${String.fromCharCode(code)}y`), ['dash'], code.toString(16))
  assert.deepEqual(codes(heading, 'well-kept courts'), [])
})

test('the limit counts code points, the unit of Contract A field limits', () => {
  assert.equal(charCount('Zo\u00eb'), 3)
  assert.equal(charCount('\u{1F3BE}\u{1F3BE}'), 2)
  assert.deepEqual(codes({ ...heading, limit: 2 }, '\u{1F3BE}\u{1F3BE}'), [])
})

test('copy cannot carry a phone, an email, a link or a price the plan data does not hold', () => {
  const known = [
    '+44 20 7946 0123',
    'desk@brindlewick.example',
    'https://brindlewick.example/book',
    'Junior coaching',
    '£45 a term'
  ]
  const smuggled = (value) => codes({ ...heading, limit: 200 }, value, { known })
  assert.deepEqual(smuggled('Call +1 555 0100 today'), ['invented_data'])
  assert.deepEqual(smuggled('Write to hello@other.example'), ['invented_data'])
  assert.deepEqual(smuggled('Visit www.other-club.example'), ['invented_data'])
  assert.deepEqual(smuggled('Book at https://other.example/x'), ['invented_data'])
  assert.deepEqual(smuggled('Lessons from $30'), ['invented_data'])
  assert.deepEqual(smuggled('Lessons from 30 EUR'), ['invented_data'])
  assert.deepEqual(smuggled('Call +44 (20) 7946-0123'), [])
  assert.deepEqual(smuggled('Write to DESK@brindlewick.example'), [])
  assert.deepEqual(smuggled('Book at brindlewick.example/book'), [])
  assert.deepEqual(smuggled('Junior coaching from £45'), [])
  assert.deepEqual(smuggled('Four courts, all weather'), [])
  const problem = fieldValueProblems({ ...heading, limit: 200 }, 'Call +1 555 0100', { known })[0]
  assert.match(problem.message, /phone/)
})

const what = (value, known) => inventedDataOf(value, known).map((f) => f.what)

test('a price in copy is proven only by a known price: same amount, same currency, never a bare number', () => {
  assert.deepEqual(what('Lessons from $9', ['Mon 9:00 to 10:00']), ['price'])
  assert.deepEqual(what('Lessons from $2010', ['Founded in 2010']), ['price'])
  assert.deepEqual(what('Hire a court for $5', ['5 rounds of pads']), ['price'])
  assert.deepEqual(what('Classes from 20 AUD', ['A 20 minute class']), ['price'])
  assert.deepEqual(what('Classes from €20', ['Classes from $20']), ['price'])
  assert.deepEqual(what('Membership €1.200 a year', ['Membership €1,200']), [])
  assert.deepEqual(what('Membership 1.200,00 € a year', ['Membership €1,200']), [])
  assert.deepEqual(what('Court hire $20.50 an hour', ['$20.5']), [])
  assert.deepEqual(what('Court hire $18 an hour', ['Court hire from $18 an hour']), [])
})

test('copy cannot carry opening hours, a year, a count or an award the plan data does not hold', () => {
  const known = ['Mo-Fr 07:00-22:00; Sa 08:00-18:00', 'Founded in 1987', 'Ages 6 to 15', '4.8']
  assert.deepEqual(what('Open from 7am to 10pm on weekdays', known), [])
  assert.deepEqual(what('Courts open at 06:30', known), ['hours'])
  assert.deepEqual(what('We are open 24/7', known), ['hours'])
  assert.deepEqual(what('Open 24 hours', known), ['hours'])
  assert.deepEqual(what('Coaching since 1987', known), [])
  assert.deepEqual(what('Coaching since 1998', known), ['year'])
  assert.deepEqual(what('Juniors aged 6 to 15', known), [])
  assert.deepEqual(what('Over 500+ members', known), ['number'])
  assert.deepEqual(what('Rated 4.8 by players', known), [])
  assert.deepEqual(what('An award-winning club', known), ['award'])
  assert.deepEqual(what('Certified coaches on every court', known), ['award'])
  assert.deepEqual(what('Coached by a national champion', known), ['award'])
  assert.deepEqual(what('Certified coaches on every court', [...known, 'All coaches are certified']), [])
  assert.deepEqual(what('Open 24 hours', ['Open 24 hours']), [])
})

test('copy never describes the page or a section of it', () => {
  for (const value of [
    'On this page you will find our classes',
    'This section shows our coaches',
    'Here you can find prices'
  ])
    assert.deepEqual(codes({ ...heading, limit: 200 }, value), ['about_the_page'], value)
  assert.deepEqual(codes({ ...heading, limit: 200 }, 'Coaching for every level'), [])
})

test('copy never uses a phrase the business voice avoids', () => {
  const avoid = ['cheap', 'world class']
  assert.deepEqual(codes({ ...heading, limit: 200 }, 'World-class coaching', { avoid }), ['avoided_phrase'])
  assert.deepEqual(codes({ ...heading, limit: 200 }, 'Coaching for every level', { avoid }), [])
  assert.deepEqual(
    codes({ ...heading, limit: 200 }, 'Cheaper by the term', { avoid }),
    [],
    'whole words only'
  )
})
