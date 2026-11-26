// The WordPress export of a site copy (src/lib/site-copy/contract-mapping-wordpress.js): plain words keyed by content
// map slot, except where the slot keeps its inline markup and its demo is one element around all its words, which keeps
// that element (a button's link and class) around the new words. All data made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wordpressContractMapping, wrapperOf } from '../src/lib/site-copy/contract-mapping-wordpress.js'

const slot = (key, sample, more = {}) => ({
  key,
  entity: 'page-front-page',
  type: 'text',
  sample,
  maxCharacters: 80,
  ...more
})
const contentMap = {
  slots: [
    slot('hero.button', '((a class="btn btn-primary" href="/about-us"))Book a Table((/a))', {
      markup: 'inline'
    }),
    slot('hero.lead', 'The ((span class="jd-name"))Three Broomsticks((/span)) is a pub', {
      markup: 'inline'
    }),
    slot('hero.title', 'Hey Harry!!!'),
    slot('hero.badge', '((span class="label"))New((/span))', { markup: 'inline' }),
    slot('hero.plain', '((a href="/x"))Go((/a))')
  ]
}
const w = (key, text) => ({ slot: key, owner: 'writer', text, factIds: [] })

test('a slot whose demo is one inline element around its words keeps it; every other slot is plain words', () => {
  const { mapping, problems } = wordpressContractMapping({
    copy: {
      version: 'site-copy/1',
      fingerprint: {
        kit: 'tracy-template-kit/2 demo/wp7/1.0.0',
        planSha256: 'a'.repeat(64),
        briefSha256: 'b'.repeat(64),
        promptSha256: 'c'.repeat(64)
      },
      slots: [
        w('hero.button', 'Book a table'),
        w('hero.lead', 'Harbour Kitchen is a fish restaurant'),
        w('hero.title', 'Harbour Kitchen'),
        w('hero.badge', 'Fresh'),
        w('hero.plain', 'Visit')
      ],
      alts: [],
      seo: [],
      pages: [],
      notebook: [],
      returns: []
    },
    contract: 'demo/wp7/1.0.0',
    revision: 'r1',
    contentMap
  })
  assert.deepEqual(problems, [])
  assert.deepEqual(mapping.changes, {
    'hero.button': '((a class="btn btn-primary" href="/about-us"))Book a table((/a))',
    'hero.lead': 'Harbour Kitchen is a fish restaurant',
    'hero.title': 'Harbour Kitchen',
    'hero.badge': '((span class="label"))Fresh((/span))',
    // No inline markup kept by the plugin for this slot: plain words.
    'hero.plain': 'Visit'
  })
})

test('the wrapper is the one element around all the words, never part of a sentence or a nested one', () => {
  assert.deepEqual(wrapperOf(contentMap.slots[0]), {
    open: '((a class="btn btn-primary" href="/about-us"))',
    close: '((/a))'
  })
  assert.equal(wrapperOf(contentMap.slots[1]), null)
  assert.equal(wrapperOf(slot('x', '((a href="/x"))((span))Go((/span))((/a))', { markup: 'inline' })), null)
  assert.equal(wrapperOf(slot('x', '((a href="/x"))Go((/span))', { markup: 'inline' })), null)
  assert.equal(wrapperOf(slot('x', '((script))x((/script))', { markup: 'inline' })), null)
})
