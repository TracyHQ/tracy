// The tab title of a page (src/lib/page-title.ts, TCH #1013 NAME-1, NAME-2): the home tab names the business alone once
// the customer gave a name; every other page, and the template as released, reads "Page — Name".
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TEMPLATE_NAME, pageTitleOf } from '../src/lib/page-title.ts'

test('NAME-1: the home tab is the name alone once the site has a name of its own', () => {
  assert.equal(pageTitleOf({ title: 'Home', siteTitle: 'Tamarind Bakery', home: true }), 'Tamarind Bakery')
})

test('NAME-2: every other page keeps "Page — Name"', () => {
  assert.equal(
    pageTitleOf({ title: 'News', siteTitle: 'Tamarind Bakery', home: false }),
    'News — Tamarind Bakery'
  )
})

test('the template as released keeps its home tab: no name given, or the demo name itself', () => {
  assert.equal(pageTitleOf({ title: 'Home', siteTitle: null, home: true }), `Home — ${TEMPLATE_NAME}`)
  assert.equal(pageTitleOf({ title: 'Home', siteTitle: '  ', home: true }), `Home — ${TEMPLATE_NAME}`)
  assert.equal(
    pageTitleOf({ title: 'Home', siteTitle: TEMPLATE_NAME, home: true }),
    `Home — ${TEMPLATE_NAME}`
  )
})
