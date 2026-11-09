/**
 * The Details tab kept in the page address (`wo-tab`, #517): a reload or a return from the Brief page lands on the same
 * tab; going back to the list forgets it, so the next place opens on Overview.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-detail-tab.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DETAIL_TABS, detailTabFromSearch, searchWithDetailTab } from '../src/client/detail-tab.ts'
import { addressFromSearch, searchWithAddress } from '../src/client/my-address.ts'

const ID = '0b6f5c2e-6a51-4c55-9a8e-3f1d2c4b5a69'
const REV = '7d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6'
const base = `?tab=tracy:website-opportunities&wo-view=mine&wo-opp=${ID}&wo-page=details`

test('the four tabs, Overview first', () => {
  assert.deepEqual(DETAIL_TABS, ['overview', 'brief', 'media', 'sources'])
})

test('a chosen tab is written beside the page and read back', () => {
  for (const tab of DETAIL_TABS) assert.equal(detailTabFromSearch(searchWithDetailTab(base, tab)), tab)
  assert.equal(searchWithDetailTab(base, 'sources'), `${base}&wo-tab=sources`)
})

test('Overview is the default and is not written; an unknown value reads as Overview', () => {
  assert.equal(searchWithDetailTab(`${base}&wo-tab=media`, 'overview'), base)
  assert.equal(detailTabFromSearch(base), 'overview')
  assert.equal(detailTabFromSearch(`${base}&wo-tab=settings`), 'overview')
})

test('the Brief page keeps the tab; the list forgets it', () => {
  const onDetails = `${base}&wo-tab=brief`
  const toBrief = searchWithAddress(onDetails, { ...addressFromSearch(onDetails), page: 'brief', brief: REV })
  assert.equal(detailTabFromSearch(toBrief), 'brief')
  const back = searchWithAddress(toBrief, { ...addressFromSearch(toBrief), page: 'details', brief: null })
  assert.equal(detailTabFromSearch(back), 'brief')
  const toList = searchWithAddress(onDetails, { ...addressFromSearch(onDetails), page: null })
  assert.equal(toList.includes('wo-tab'), false)
})
