/**
 * A Build plugin offers its tabs only to sites running ITS CMS.
 *
 * 🔒 WHY THIS IS TESTED AT ALL. The image ships three Build plugins, each registering a Build tab
 * and a Live site tab with no idea what the session in front of it runs. Measured 19/09/2026 on
 * `demoemdasbh.tracy.test` (one EmDash site): the + menu showed **three** Build rows and **three** Live
 * site rows, told apart by a small icon, and two thirds of them belonged to CMSes that site does not run.
 *
 * The predicate is deliberately generous in one direction and never the other: it answers `true`
 * for a site it has not learned yet, so a slow lookup can never grey out the one tab the customer
 * came for. Being wrong by offering too much is the state this replaced; being wrong by hiding the
 * right tab would be new damage.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addressOfSite,
  labelOfCwd,
  listsTabsFor,
  offersTabsFor,
  rememberPlatforms
} from '../src/client/site-platform.mjs'

test('labelOfCwd reads the site folder, and refuses anything that is not one', () => {
  assert.equal(labelOfCwd('/site/demowp'), 'demowp')
  assert.equal(labelOfCwd('/site/demoemdasbh/'), 'demoemdasbh')
  // The creation workspace names no site — every platform stays offerable there.
  assert.equal(labelOfCwd('/desk-home'), null)
  assert.equal(labelOfCwd('/site/'), null)
  assert.equal(labelOfCwd('/site/../etc'), null)
  assert.equal(labelOfCwd(undefined), null)
})

test('a plugin offers its tabs to its own platform and greys out for the others', () => {
  // 🔒 THE SHAPE THE DOOR ACTUALLY SENDS. `GET /api/sites` answers rows keyed by `siteKey`, with
  // `copyUrl` for the address — there is no `label` field. The first draft of the module read
  // `row.label`, stored nothing, and every site stayed "unknown", so the filter passed everything
  // while looking like it worked. A fixture written from the door, not from memory, is the only
  // thing that catches that.
  rememberPlatforms([
    {
      siteKey: 'demoemdasbh.tracy.test',
      platform: 'emdash',
      copyUrl: 'http://demoemdasbh.tracy.test:51710/'
    },
    { siteKey: 'demowwwww.tracy.test', platform: 'wordpress', copyUrl: 'http://demowwwww.tracy.test:51710/' }
  ])
  // The measured shape: one EmDash site, three Build plugins asking at once.
  assert.equal(offersTabsFor('/site/demoemdasbh', 'emdash'), true)
  assert.equal(offersTabsFor('/site/demoemdasbh', 'wordpress'), false)
  assert.equal(offersTabsFor('/site/demoemdasbh', 'joomla'), false)
  assert.equal(offersTabsFor('/site/demowwwww', 'wordpress'), true)
  assert.equal(offersTabsFor('/site/demowwwww', 'emdash'), false)
})

test('a site it has not learned, and a session naming none, keep every platform offerable', () => {
  // 🔒 Never guess `false`: the cache loads asynchronously, and guessing wrong this way greys out the
  // very tab the customer needs for as long as the wait lasts.
  assert.equal(offersTabsFor('/site/never-heard-of-it', 'emdash'), true)
  assert.equal(offersTabsFor('/site/never-heard-of-it', 'wordpress'), true)
  assert.equal(offersTabsFor(undefined, 'joomla'), true)
  assert.equal(offersTabsFor('/desk-home', 'wordpress'), true)
})

test('rememberPlatforms ignores a shape the door did not promise', () => {
  rememberPlatforms(null)
  rememberPlatforms([{ siteKey: 'x.tracy.test' }, { platform: 'wordpress' }, 'nonsense', null])
  assert.equal(offersTabsFor('/site/x', 'joomla'), true, 'a row with no platform teaches nothing')
  assert.equal(addressOfSite('/site/x'), null, 'a row with no copyUrl teaches no address')
})

test('a row keyed the old way teaches nothing — the field it used does not exist', () => {
  // ⚠ This is the bug, pinned: `{ label, platform }` is what the module first read for, and the
  // door has never sent it. If someone reintroduces that key, this test fails instead of the
  // filter silently passing every platform on every site.
  rememberPlatforms([{ label: 'ghost', platform: 'joomla' }])
  assert.equal(offersTabsFor('/site/ghost', 'wordpress'), true, 'a `label` row must teach nothing')
})

test('the seat book address is what a tab with no build job falls back to', () => {
  rememberPlatforms([
    { siteKey: 'demoemdash1.tracy.test', platform: 'emdash', copyUrl: 'http://demoemdash1.tracy.test:51710/' }
  ])
  // The port is the whole reason this comes from the seat book rather than from the hostname.
  assert.equal(addressOfSite('/site/demoemdash1'), 'http://demoemdash1.tracy.test:51710/')
  assert.equal(addressOfSite('/site/never-heard-of-it'), null)
  assert.equal(addressOfSite(undefined), null, 'the creation workspace names no site')
})

test('the guide lists a Build plugin only inside a site of its own platform', () => {
  // 🔒 The native right-column guide (better-sidebar 0.21.1-tracy.1) leaves an unavailable kind OFF
  // the list. Measured 26/09/2026 on the native profile with no site open: the guide showed Build ×3
  // and Live site ×3. A session naming no site lists nothing: Live site has no site to show, and a new site starts
  // from Add site / Design inspirations, which pick the platform and open Build themselves.
  rememberPlatforms([{ siteKey: 'guidewp.tracy.test', platform: 'wordpress' }])
  assert.equal(listsTabsFor(undefined, 'wordpress'), false)
  assert.equal(listsTabsFor('/desk-home', 'emdash'), false)
  assert.equal(listsTabsFor('/site/guidewp', 'wordpress'), true)
  assert.equal(listsTabsFor('/site/guidewp', 'joomla'), false)
  // A site not learned yet still lists every platform — never hide the right tab while waiting.
  assert.equal(listsTabsFor('/site/not-yet-known', 'joomla'), true)
})
