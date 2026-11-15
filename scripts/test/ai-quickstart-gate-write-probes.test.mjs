// The probe catalogue of write safety (ticket #586): each probe carries the code of its field, a page that prints it
// as a live element is caught and one that prints it as words is not, a probe applies only where it fits, and a pass
// gives each place a probe the ledger does not have yet.
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { stopClassOf } from '../ai-quickstart/gate/write-safety-judge.mjs'
import {
  applies,
  COMMON_PROBES,
  lengthOf,
  packPass,
  placeTypeOf,
  probedValue,
  probeLedger
} from '../ai-quickstart/gate/write-probes.mjs'

const PROBES = [...COMMON_PROBES, ...JOOMLA_PROBES]
const doc = (html) => parseHTML('<html><body>' + html + '</body></html>').document
const escape = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')

test('every element probe is caught printed raw in an attribute or as words, and passes printed escaped', () => {
  for (const probe of COMMON_PROBES.filter((p) => p.id !== 'other-scripts' && p.id !== 'code-address')) {
    const value = probedValue('QxABC', probe, 'ABC')
    const raw = value
      .replaceAll('((', '<')
      .replaceAll('))', '>')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
    const live = '<p data-v="' + raw + '">' + raw + "</p><p data-w='" + raw + "'></p>"
    assert.ok(probe.judge({ doc: doc(live), code: 'ABC' }), probe.id + ' printed live')
    const safe = '<p data-v="' + escape(value) + '">' + escape(value) + '</p>'
    assert.equal(probe.judge({ doc: doc(safe), code: 'ABC' }), null, probe.id + ' printed escaped')
  }
})

test('a code address is caught in an href, not as words', () => {
  const probe = COMMON_PROBES.find((p) => p.id === 'code-address')
  const value = probedValue('https://qxabc.example/', probe, 'ABC')
  assert.ok(probe.judge({ doc: doc('<a href="' + value + '">x</a>'), code: 'ABC' }))
  assert.equal(probe.judge({ doc: doc('<p>' + value + '</p>'), code: 'ABC' }), null)
})

test('a Joomla plugin code is caught when the page ran it, not when it prints as words', () => {
  for (const probe of JOOMLA_PROBES) {
    const value = probedValue('QxABC', probe, 'ABC')
    assert.equal(probe.judge({ doc: doc('<p>' + value + '</p>'), code: 'ABC' }), null, probe.id)
    assert.ok(probe.judge({ doc: doc('<p>QxABC </p>'), code: 'ABC' }), probe.id)
    // A page that does not print the field at all says nothing.
    assert.equal(probe.judge({ doc: doc('<p>nothing</p>'), code: 'ABC' }), null, probe.id)
  }
})

test('a probe applies to its type of place, within the limit', () => {
  const tag = COMMON_PROBES.find((p) => p.id === 'tag')
  assert.equal(applies({ type: 'text', limit: 30, base: 'QxABC', code: 'ABC' }, tag), true)
  assert.equal(applies({ type: 'text', limit: 8, base: 'QxABC', code: 'ABC' }, tag), false)
  assert.equal(
    applies({ type: 'link', limit: null, base: 'https://qxabc.example/', code: 'ABC' }, tag),
    false
  )
  assert.equal(placeTypeOf({ kind: 'business.hero_image' }), null)
  assert.equal(placeTypeOf({ kind: 'contact.phone' }), null)
  assert.equal(placeTypeOf({ kind: 'contact.cta_url' }), 'link')
  assert.equal(placeTypeOf({ kind: 'editorial.heading' }), 'text')
})

test('a pass spreads the probes over the places and never repeats one the ledger has', () => {
  const places = ['a', 'b', 'c'].map((k, i) => ({
    key: k,
    type: 'text',
    limit: null,
    base: 'QxAA' + i,
    code: 'AA' + i
  }))
  const ledger = probeLedger()
  const seen = new Set()
  for (let n = 0; n < 20; n++) {
    const pass = packPass(places, PROBES, ledger)
    if (!pass.size) break
    assert.ok(
      new Set([...pass.values()].map((p) => p.id)).size === pass.size,
      'one probe per place, different ones'
    )
    for (const [place, probe] of pass) {
      assert.ok(!seen.has(place + probe.id))
      seen.add(place + probe.id)
      ledger.set(place, probe.id, { status: 'written' })
    }
  }
  assert.deepEqual(ledger.missing(places, PROBES), [])
})

test('a stopped write is classed by what stopped it: the site, the door, or the build', () => {
  const of = (code, cause) => stopClassOf({ code, details: { op: 'copy:site.hero', cause } }).kind
  assert.equal(of('redo_failed', 'server_error'), 'server_error')
  assert.equal(of('redo_failed', 'not_json'), 'server_error')
  assert.equal(of('redo_failed', 'SLOT_VALUE_REFUSED'), 'door_refused')
  assert.equal(of('read_back_mismatch', null), 'door_refused')
  assert.equal(of('held_text_in_value', null), 'refused_by_build')
})

test('the edge probes of a text place: the limit, control characters, empty values, tokens, numbers, sequences', async () => {
  const { EDGE_PROBES, PROBE_CATALOGUE } = await import('../ai-quickstart/gate/write-probes-edge.mjs')
  const ids = EDGE_PROBES.map((p) => p.id)
  for (const id of [
    'over-limit',
    'at-limit',
    'control-characters',
    'empty',
    'single-space',
    'format-tokens',
    'number-zero',
    'number-negative',
    'number-huge',
    'number-nan',
    'emoji-joiner',
    'direction-override',
    'acm-unbalanced'
  ])
    assert.ok(ids.includes(id), id)
  assert.equal(PROBE_CATALOGUE.length, COMMON_PROBES.length + EDGE_PROBES.length)
  assert.ok(EDGE_PROBES.every((p) => p.types.length === 1 && p.types[0] === 'text'))
  const of = (id) => EDGE_PROBES.find((p) => p.id === id)
  const place = { type: 'text', limit: 30, base: 'QxABC', code: 'ABC' }
  const value = (id, at = place) => probedValue(at.base, of(id), at.code, at.limit)
  // The limit probes: three times the limit and exactly at it, counted by character; only where a limit is declared.
  assert.equal(lengthOf(value('over-limit')), 90)
  assert.equal(lengthOf(value('at-limit')), 30)
  assert.ok(value('at-limit').startsWith('QxABC '))
  assert.equal(applies(place, of('over-limit')), true)
  assert.equal(applies(place, of('at-limit')), true)
  assert.equal(applies({ ...place, limit: null }, of('over-limit')), false)
  assert.equal(applies({ ...place, limit: null }, of('at-limit')), false)
  assert.equal(applies({ ...place, limit: 6 }, of('at-limit')), false, 'no room past the marker')
  // Whole values replace the marker.
  assert.equal(value('empty'), '')
  assert.equal(value('single-space'), ' ')
  assert.deepEqual(
    ['number-zero', 'number-negative', 'number-huge', 'number-nan'].map((id) => value(id)),
    ['0', '-1', '1e309', 'NaN']
  )
  assert.match(value('control-characters'), /\r\n/)
  assert.ok([1, 8, 27].every((c) => value('control-characters').includes(String.fromCodePoint(c))))
  assert.match(value('format-tokens'), /%s/)
  assert.match(value('format-tokens'), /%d/)
  assert.ok(value('emoji-joiner').includes(String.fromCodePoint(0x200d)))
  assert.ok(value('direction-override').includes(String.fromCodePoint(0x202e)))
  // An unbalanced ACM marker a converter turns into an open tag is caught, printed as words it is not.
  const acm = value('acm-unbalanced')
  assert.ok(acm.includes('((') && !acm.includes('))'))
  const live = '<p>' + acm.replaceAll('((', '<') + '</p>'
  assert.ok(of('acm-unbalanced').judge({ doc: doc(live), code: 'ABC' }))
  assert.equal(of('acm-unbalanced').judge({ doc: doc('<p>' + escape(acm) + '</p>'), code: 'ABC' }), null)
  // A link place takes none of them.
  for (const p of EDGE_PROBES) assert.equal(applies({ ...place, type: 'link' }, p), false, p.id)
})

test('the ledger of the whole catalogue is complete only when every edge probe reached every place it fits', async () => {
  const { PROBE_CATALOGUE } = await import('../ai-quickstart/gate/write-probes-edge.mjs')
  const all = [...PROBE_CATALOGUE, ...JOOMLA_PROBES]
  const places = [
    { key: 'limited', type: 'text', limit: 40, base: 'QxAB1', code: 'AB1' },
    { key: 'open', type: 'text', limit: null, base: 'QxAB2', code: 'AB2' },
    { key: 'link', type: 'link', limit: null, base: 'https://qxab3.example/', code: 'AB3' }
  ]
  const ledger = probeLedger()
  let passes = 0
  for (; passes < 40; passes++) {
    const pass = packPass(places, all, ledger)
    if (!pass.size) break
    for (const [place, probe] of pass) ledger.set(place, probe.id, { status: 'written' })
  }
  assert.deepEqual(ledger.missing(places, all), [])
  const at = (key) =>
    ledger
      .rows()
      .filter((r) => r.place === key)
      .map((r) => r.probe)
  assert.ok(at('limited').includes('over-limit') && at('limited').includes('at-limit'))
  assert.ok(!at('open').includes('over-limit'), 'no limit, no limit probe')
  assert.ok(at('open').includes('empty') && at('open').includes('number-nan'))
  assert.deepEqual(at('link').sort(), ['code-address', 'link-quote'])
  // One pass per probe of the place that takes most: the limits of write safety must allow that many.
  const { LIMITS } = await import('../ai-quickstart/gate/write-safety.mjs')
  assert.ok(passes <= LIMITS.passes, passes + ' passes needed, ' + LIMITS.passes + ' allowed')
})
