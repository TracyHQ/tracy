/**
 * A preview already on the site is kept, not reopened at the site's root (27/09: a
 * `?open=browser&page=/about/` link was sent back to `/` by `openSite`, which checked before its
 * credentials request and opened after it).
 *
 *   node --test packages/site/tracy-add-site/test/preview-tab.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { browserTabOn } from '../src/client/preview-tab.mjs'

const HOST = 'capiwl1643.tracy.test'

test('a preview on any page of the site is found', () => {
  const tabs = [
    { id: 'tab1', type: 'tracy:browser', meta: { url: 'https://example.com/' } },
    { id: 'tab2', type: 'tracy:browser', meta: { url: 'http://capiwl1643.tracy.test:8080/about/' } }
  ]
  assert.equal(browserTabOn(tabs, HOST), 'tab2')
})

test('another site, another kind of tab, an unparsable address or no tabs find nothing', () => {
  assert.equal(
    browserTabOn([{ id: 'a', type: 'tracy:browser', meta: { url: 'https://example.com/' } }], HOST),
    null
  )
  assert.equal(browserTabOn([{ id: 'a', type: 'tracy:team', meta: { url: `http://${HOST}/` } }], HOST), null)
  assert.equal(browserTabOn([{ id: 'a', type: 'tracy:browser', meta: { url: 'nope' } }], HOST), null)
  assert.equal(browserTabOn(undefined, HOST), null)
})
