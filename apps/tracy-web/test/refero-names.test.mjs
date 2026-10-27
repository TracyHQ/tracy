/**
 * Distinct display names for the offered Refero systems (`src/lib/refero-names.js`): a name several
 * offered systems share gets a suffix from the source data (page, domain, theme, then a number);
 * a name nobody else has is left alone. Cases from the real catalogue (Akemi, 12/10/2026).
 *
 *   node --test apps/tracy-web/test/refero-names.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { distinctReferoNames, pageLabelOf } from '../src/lib/refero-names.js'

const row = (uuid, name, sourceWebsite, theme = 'light') => ({ uuid, name, sourceWebsite, theme })
const named = (rows) => {
  const names = distinctReferoNames(rows)
  return Object.fromEntries(rows.map((r) => [r.uuid, names.get(r.uuid)]))
}

test('page label: the last path segment, words title-cased, brand casing kept, numbers stay', () => {
  assert.equal(pageLabelOf('https://www.apple.com/iphone-18-pro'), 'iPhone 18 Pro')
  assert.equal(pageLabelOf('https://www.apple.com/apple-watch-se-3'), 'Apple Watch SE 3')
  assert.equal(pageLabelOf('https://www.apple.com/macbook-neo'), 'MacBook Neo')
  assert.equal(pageLabelOf('https://www.apple.com/ipad-air/'), 'iPad Air')
  assert.equal(pageLabelOf('https://www.apple.com/airpods-pro'), 'AirPods Pro')
  assert.equal(pageLabelOf('https://www.perplexity.ai/products/computer'), 'Computer')
  assert.equal(pageLabelOf('https://www.apple.com'), null, 'a home page has no page')
  assert.equal(pageLabelOf('not a url'), null)
})

test('a name nobody else has stays as it is', () => {
  assert.deepEqual(named([row('a', 'Moxie', 'https://moxie.com'), row('b', 'Notion', 'https://notion.so')]), {
    a: 'Moxie',
    b: 'Notion'
  })
})

test('same site, different pages: the page; the home page: its domain', () => {
  assert.deepEqual(
    named([
      row('06ee', 'Apple', 'https://www.apple.com/apple-watch-ultra-4', 'dark'),
      row('40be', 'Apple', 'https://www.apple.com/iphone-18-pro', 'dark'),
      row('a731', 'Apple', 'https://www.apple.com/iphone-duo'),
      row('aeca', 'Apple', 'https://www.apple.com')
    ]),
    {
      '06ee': 'Apple · Apple Watch Ultra 4',
      '40be': 'Apple · iPhone 18 Pro',
      a731: 'Apple · iPhone Duo',
      aeca: 'Apple · apple.com'
    }
  )
  assert.deepEqual(
    named([
      row('7c4e', 'Perplexity AI', 'https://www.perplexity.ai/products/computer'),
      row('81af', 'Perplexity AI', 'https://perplexity.ai')
    ]),
    { '7c4e': 'Perplexity AI · Computer', '81af': 'Perplexity AI · perplexity.ai' }
  )
})

test('different domains: the domain without www', () => {
  assert.deepEqual(
    named([row('0f0d', 'Coda', 'https://coda.io'), row('e0ad', 'Coda', 'https://www.coda.co')]),
    { '0f0d': 'Coda · coda.io', e0ad: 'Coda · coda.co' }
  )
  assert.deepEqual(
    named([
      row('108e', 'Dovetail', 'https://dovetail.com', 'dark'),
      row('1d51', 'Dovetail', 'https://dovetail.no'),
      row('6f94', 'Dovetail', 'https://dovetailapp.com', 'dark')
    ]),
    {
      '108e': 'Dovetail · dovetail.com',
      '1d51': 'Dovetail · dovetail.no',
      '6f94': 'Dovetail · dovetailapp.com'
    }
  )
})

test('same site and page: the theme, then a number in id order', () => {
  assert.deepEqual(
    named([
      row('2', 'Spotify', 'https://www.spotify.com', 'light'),
      row('1', 'Spotify', 'https://spotify.com', 'dark')
    ]),
    { 1: 'Spotify · Dark', 2: 'Spotify · Light' }
  )
  // The real pair: both dark.
  assert.deepEqual(
    named([
      row('cc59e195', 'Spotify', 'https://www.spotify.com', 'dark'),
      row('1514a95f', 'Spotify', 'https://spotify.com', 'dark')
    ]),
    { '1514a95f': 'Spotify · Dark', cc59e195: 'Spotify · Dark 2' }
  )
})

test('every name comes out distinct, even against another base name', () => {
  const rows = [
    row('a', 'Coda', 'https://coda.io'),
    row('b', 'Coda', 'https://coda.co'),
    row('c', 'Coda · coda.io', 'https://elsewhere.com')
  ]
  const names = [...distinctReferoNames(rows).values()]
  assert.equal(new Set(names).size, names.length, names.join(' | '))
  assert.equal(distinctReferoNames(rows).get('c'), 'Coda · coda.io', 'a name of its own is kept')
})
