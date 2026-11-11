/**
 * The section rail and the section level of the Business facts sub-page (#537, layout B): every band's state mark
 * (a tick, Check this, Off the site) in page order with the count of sections left to check, the band that is current
 * under the sticky header, the one source a section names in its header (and the row chips that repeat it), and the
 * opening hours on one row when every day is the same. Pure functions only. Every business in this file is invented.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-facts-rail.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { currentBand, railState, railView, sameSummary } from '../src/client/facts-rail-model.ts'
import { collapseHours, fromLabel, mainChip, sameSource } from '../src/client/facts-section-model.ts'

const band = (id, over = {}) => ({ id, name: id, count: 2, check: false, on: true, ...over })
const ORDER = ['business', 'hours', 'services', 'about', 'team', 'brand', 'messages']
const chip = (source, word = 'profile') => ({ word, source, ref: null, at: null })
const t = (key, params) => (params ? `[${key}${JSON.stringify(params)}]` : `[${key}]`)

test('a band kept off the site is Off, a flagged one is Check this, any other a tick; off wins over a flag', () => {
  assert.equal(railState({ check: false, on: true }), 'ok')
  assert.equal(railState({ check: true, on: true }), 'check')
  assert.equal(railState({ check: true, on: false }), 'off')
  assert.equal(railState({ check: false, on: false }), 'off')
})

test('the rail lists the bands in page order, whatever order they reported in, and counts what is left to check', () => {
  const view = railView(
    [
      band('team', { on: false, count: 1 }),
      band('business', { count: 6 }),
      band('hours', { check: true }),
      band('extra'),
      band('about', { check: true, on: false })
    ],
    ORDER
  )
  assert.deepEqual(
    view.items.map((i) => [i.id, i.state]),
    [
      ['business', 'ok'],
      ['hours', 'check'],
      ['about', 'off'],
      ['team', 'off'],
      ['extra', 'ok']
    ]
  )
  assert.equal(view.toCheck, 1)
  assert.equal(view.items[0].count, 6)
})

test('a band with nothing in it draws no count', () => {
  const view = railView([band('team', { count: 0 }), band('brand', { count: null })], ORDER)
  assert.deepEqual(
    view.items.map((i) => i.count),
    [null, null]
  )
  assert.equal(railView([], ORDER).toCheck, 0)
})

test('the current band is the one at the top of the view, even a short one; at the end, the last one that shows', () => {
  const boxes = [
    { id: 'business', top: -400, bottom: 90 },
    { id: 'hours', top: 106, bottom: 200 },
    { id: 'services', top: 216, bottom: 900 }
  ]
  // The view starts at 100 (under the sticky header): Hours crosses the line 24px below it.
  assert.equal(currentBand(boxes, 100, 800), 'hours')
  // Between two cards, the next card is current.
  assert.equal(currentBand(boxes, 70, 800, false, 25), 'hours')
  assert.equal(currentBand(boxes, 0, 800), 'business')
  assert.equal(currentBand(boxes, 100, 800, true), 'services')
  assert.equal(currentBand(boxes, 1000, 1200), null)
})

test('a report that changed nothing is the same; one changed field is not', () => {
  assert.equal(sameSummary(undefined, band('team')), false)
  assert.equal(sameSummary(band('team'), band('team')), true)
  assert.equal(sameSummary(band('team'), band('team', { on: false })), false)
  assert.equal(sameSummary(band('team'), band('team', { count: 3 })), false)
})

test('a section names the platform most of its rows come from; the owner and Not found name none', () => {
  assert.equal(
    mainChip([chip('instagram', 'post'), chip('website'), chip('instagram', 'bio')]).source,
    'instagram'
  )
  assert.equal(
    mainChip([chip('google-maps', 'google'), chip('google-places', 'google')]).source,
    'google-maps'
  )
  assert.equal(mainChip([{ word: 'you', source: null, ref: null, at: null }, null]), null)
  assert.equal(mainChip([]), null)
})

test('a row chip of the section platform is not drawn again; another platform, the owner and Not found are', () => {
  const section = chip('instagram')
  assert.equal(sameSource(chip('instagram', 'post'), section), true)
  assert.equal(sameSource(chip('website', 'website'), section), false)
  assert.equal(sameSource({ word: 'you', source: null, ref: null, at: null }, section), false)
  assert.equal(sameSource(chip('instagram'), null), false)
  assert.equal(sameSource(chip('google-maps', 'google'), chip('google', 'google')), true)
})

test('the source line reads From Google, From Instagram, From your website, From you', () => {
  assert.equal(fromLabel(t, chip('google-places', 'google')), '[facts.from{"source":"[chip.word.google]"}]')
  assert.equal(fromLabel(t, chip('instagram', 'bio')), '[facts.from{"source":"Instagram"}]')
  assert.equal(fromLabel(t, chip('website', 'website')), '[facts.from.website]')
  assert.equal(fromLabel(t, chip('listing', 'listing')), '[facts.from.website]')
  assert.equal(fromLabel(t, { word: 'you', source: null, ref: null, at: null }), '[facts.from.you]')
})

test('the hours read as one row when every day has the same hours, otherwise as they were', () => {
  const range = (from, to) => `${from} to ${to}`
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  assert.deepEqual(
    collapseHours(
      days.map((d) => `${d}: Open 24 hours`),
      range
    ),
    ['Monday to Sunday: Open 24 hours']
  )
  const mixed = days.map((d) => `${d}: ${d === 'Sunday' ? 'Closed' : '09:00 - 18:00'}`)
  assert.deepEqual(collapseHours(mixed, range), mixed)
  assert.deepEqual(collapseHours(['Monday: 09:00 - 18:00'], range), ['Monday: 09:00 - 18:00'])
  assert.deepEqual(collapseHours(['Open 24 hours', 'Open 24 hours'], range), [
    'Open 24 hours',
    'Open 24 hours'
  ])
  assert.deepEqual(collapseHours([], range), [])
})
