#!/usr/bin/env node
/**
 * Moving between My opportunities and Details inside the Opportunities tab (spec #512, ticket #514,
 * `src/client/my-nav.ts`): a row or its name opens Details and pushes a history entry; the pin opens Google Maps in
 * a new tab; Back (the control or the browser's) comes back to the list with its view, filter and scroll.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-my-navigation.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addressFromSearch, searchWithAddress } from '../src/client/my-address.ts'
import { clickTarget, createListMemory, historyWrite, listAddress, pageDepth } from '../src/client/my-nav.ts'

const ID = '0b6f5c2e-6a51-4c55-9a8e-3f1d2c4b5a69'
const LIST = { view: 'mine', stage: 'demo', q: 'bistro', opp: null, page: null, brief: null, section: null }
const MAPS = 'https://www.google.com/maps/search/?api=1&query=Sunny+Fork'

test('a row click and a name click both open Details of that place, in the same tab', () => {
  for (const kind of ['row', 'name']) {
    const target = clickTarget(kind, LIST, { id: ID, mapsUrl: MAPS })
    assert.deepEqual(target, {
      kind: 'details',
      address: {
        view: 'mine',
        stage: 'demo',
        q: 'bistro',
        opp: ID,
        page: 'details',
        brief: null,
        section: null
      }
    })
  }
})

test('the pin opens Google Maps in a new tab and leaves the list where it is', () => {
  assert.deepEqual(clickTarget('pin', LIST, { id: ID, mapsUrl: MAPS }), {
    kind: 'maps',
    href: MAPS,
    target: '_blank',
    rel: 'noopener noreferrer'
  })
})

test('opening Details pushes a history entry; changes within one screen replace it', () => {
  const details = { ...LIST, opp: ID, page: 'details' }
  assert.equal(historyWrite(LIST, details), 'push')
  assert.equal(historyWrite(LIST, { ...LIST, stage: 'outreach' }), 'replace')
  assert.equal(historyWrite(details, { ...details, page: 'brief', brief: ID }), 'push')
  assert.equal(historyWrite(details, listAddress(details)), 'replace')
})

test('Details keeps the address keys wo-view, wo-opp and wo-page, and the list keeps its filter under it', () => {
  const details = clickTarget('row', LIST, { id: ID, mapsUrl: MAPS }).address
  const search = searchWithAddress('?tab=tracy:website-opportunities', details)
  const params = new URLSearchParams(search)
  assert.equal(params.get('wo-view'), 'mine')
  assert.equal(params.get('wo-opp'), ID)
  assert.equal(params.get('wo-page'), 'details')
  assert.equal(params.get('wo-stage'), 'demo')
})

test('Back restores the filter from the address and the view and scroll from memory', () => {
  const memory = createListMemory()
  // The list before the press: Compact rows, scrolled down.
  memory.remember({ view: 'rows', scroll: 840 })
  const listSearch = searchWithAddress('?tab=tracy:website-opportunities', LIST)
  // The browser's Back lands on the list's own entry; the tab reads it again.
  const back = addressFromSearch(listSearch)
  assert.equal(back.page, null)
  assert.equal(back.stage, 'demo')
  assert.equal(back.q, 'bistro')
  assert.deepEqual(memory.recall(), { view: 'rows', scroll: 840 })
})

test('the list address of a page drops the place and the page only', () => {
  assert.deepEqual(listAddress({ ...LIST, opp: ID, page: 'brief', brief: ID }), LIST)
})

test('opening a section of Details pushes an entry; the pager and the way back to Details replace it', () => {
  const details = { ...LIST, opp: ID, page: 'details' }
  const brief = { ...details, section: 'brief' }
  assert.equal(historyWrite(details, brief), 'push')
  assert.equal(historyWrite(brief, { ...details, section: 'media' }), 'replace')
  assert.equal(historyWrite(brief, details), 'replace')
  assert.equal(listAddress(brief).section, null)
})

test('page depth: the list 0, Details 1, a section or a brief 2', () => {
  const details = { ...LIST, opp: ID, page: 'details' }
  assert.equal(pageDepth(LIST), 0)
  assert.equal(pageDepth(details), 1)
  assert.equal(pageDepth({ ...details, section: 'profile' }), 2)
  assert.equal(pageDepth({ ...details, page: 'brief', brief: ID }), 2)
})
