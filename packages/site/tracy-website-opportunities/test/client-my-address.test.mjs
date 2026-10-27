/**
 * What the Website Opportunities tab keeps in the page address (`src/client/my-address.ts`): the
 * sub-tab, the My opportunities filter and search, the row open in the Inspector, and the Details or
 * Brief page. Every other parameter (dsh's, `?tab=` from tracy-tab-link) rides along untouched.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addressFromSearch, searchWithAddress } from '../src/client/my-address.ts'

const ID = '0b6f5c2e-6a51-4c55-9a8e-3f1d2c4b5a69'
const REV = '7d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6'

test('an address with nothing of ours reads as no choice: the tab decides the sub-tab itself', () => {
  assert.deepEqual(addressFromSearch('?tab=tracy:website-opportunities'), {
    view: null,
    stage: 'all',
    q: '',
    opp: null,
    page: null,
    brief: null
  })
})

test('the sub-tab, filter, search, open row and page are read back as written', () => {
  const search = searchWithAddress('?tab=tracy:website-opportunities', {
    view: 'mine',
    stage: 'attention',
    q: 'pizza & co',
    opp: ID,
    page: 'brief',
    brief: REV
  })
  assert.deepEqual(addressFromSearch(search), {
    view: 'mine',
    stage: 'attention',
    q: 'pizza & co',
    opp: ID,
    page: 'brief',
    brief: REV
  })
  assert.match(search, /^\?tab=tracy:website-opportunities&/)
})

test('defaults are not written, and other parameters keep their place', () => {
  const search = searchWithAddress('?tab=tracy:website-opportunities&site=a.tracy.site', {
    view: 'find',
    stage: 'all',
    q: '',
    opp: null,
    page: null,
    brief: null
  })
  assert.equal(search, '?tab=tracy:website-opportunities&site=a.tracy.site&wo-view=find')
})

test('clearing every choice removes our parameters and leaves an empty search when nothing else is left', () => {
  const blank = { view: null, stage: 'all', q: '', opp: null, page: null, brief: null }
  assert.equal(searchWithAddress('?wo-view=mine&wo-stage=new&wo-q=x', blank), '')
})

test('values a hand-edited address cannot mean are dropped, not half-applied', () => {
  const read = addressFromSearch(
    `?wo-view=other&wo-stage=nope&wo-opp=not-a-uuid&wo-page=edit&wo-brief=${REV}`
  )
  assert.deepEqual(read, { view: null, stage: 'all', q: '', opp: null, page: null, brief: null })
})

test('a Brief page needs its opportunity and brief; a Details page needs its opportunity', () => {
  assert.equal(addressFromSearch(`?wo-page=brief&wo-opp=${ID}`).page, null)
  assert.equal(addressFromSearch(`?wo-page=details`).page, null)
  assert.equal(addressFromSearch(`?wo-page=details&wo-opp=${ID}`).page, 'details')
})

test('a search longer than the server takes is cut to its 100 characters', () => {
  assert.equal(addressFromSearch(`?wo-q=${'a'.repeat(150)}`).q.length, 100)
})
