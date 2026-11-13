// Held names and customer text kept out of the report, in the forms a page or Part 1 can write them (ticket #601).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { foldHeld } from '../../packages/wo/website-opportunities/domain/held-text-match.mjs'
import { redacted } from '../built-site-check/held-mask.mjs'
import { pathOnly, placeOf } from '../built-site-check/part-one.mjs'
import { HELD_PERSON } from './fixtures/built-site-check/florist.mjs'
import { reportOf } from './fixtures/built-site-check/report-of.mjs'

const leaks = (text, words) => words.some((w) => foldHeld(text).includes(w))

test('a held name read through references, percent escapes and a digit between its words is masked', () => {
  for (const form of [
    'Odalys&nbsp;Brenwick',
    'Odalys &amp; Brenwick',
    'Odalys%20Brenwick',
    '/odalys%2Dbrenwick/',
    'Odalys1Brenwick',
    '/team/Odalys%26nbsp%3BBrenwick'
  ])
    assert.ok(!leaks(redacted(form, [HELD_PERSON]), ['odalys', 'brenwick']), form)
})

test('a one word held name glued in a slug or a path is masked; in prose only as a whole word', () => {
  for (const form of [
    'brenwickflowers',
    '/brenwick-flowers',
    'shop/brenwickflowers',
    'Brenwick2',
    '@brenwick'
  ])
    assert.equal(redacted(form, ['Brenwick']).includes('[held]'), true, form)
  assert.equal(redacted('Brenwick’s roses', ['Brenwick']), '[held]’s roses')
})

test('near miss: a short held name inside a longer word, and a string with no held name, stay as written', () => {
  for (const form of ['banana', 'elbow room', '/bananas', 'Caf&eacute; posies'])
    assert.equal(redacted(form, ['Ana', 'Bo', 'Brenwick']), form)
})

test('an href from Part 1 keeps only its path and anchor: no scheme detail, host or query', () => {
  assert.equal(pathOnly('mailto:odalys@shop.example?subject=Order'), 'mailto:')
  assert.equal(pathOnly('tel:+15550100'), 'tel:')
  assert.equal(pathOnly('//cdn.example/a/b?token=abc'), '/a/b')
  assert.equal(pathOnly('https://florist.test/team/x?y=1#bio'), '/team/x#bio')
  assert.equal(pathOnly('/a?b=1'), '/a')
})

test('a place from Part 1 keeps only its known keys, each short', () => {
  assert.equal(placeOf({ label: 'Our story by the owner, in full words' }), null)
  assert.deepEqual(placeOf({ element: 'a', menu: true, label: 'x', nested: { a: 1 } }), {
    element: 'a',
    menu: true
  })
  assert.equal([...placeOf({ element: 'e'.repeat(90) }).element].length, 40)
})

test('Part 1 link findings with mail links, a host and an escaped held name reach the report masked', async () => {
  const report = await reportOf({
    linkCheck: async () => [
      { kind: 'missing_page', page: '/', place: { x: 1 }, href: 'mailto:odalys@shop.example?subject=Order' },
      { kind: 'missing_page', page: '/', place: null, href: '//cdn.example/Odalys%20Brenwick/x?token=abc' },
      { kind: 'missing_page', page: '/', place: { label: 'Our story by the owner' }, href: '/a' }
    ]
  })
  const out = JSON.stringify(report.checks.links)
  assert.deepEqual(
    report.checks.links.findings.map((f) => [f.href, f.place]),
    [
      ['mailto:', null],
      ['/[held]/x', null],
      ['/a', null]
    ]
  )
  assert.ok(!leaks(out, ['odalys', 'brenwick', 'cdn.example', 'token', 'our story']), out)
})
