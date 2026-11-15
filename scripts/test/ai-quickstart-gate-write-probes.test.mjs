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
