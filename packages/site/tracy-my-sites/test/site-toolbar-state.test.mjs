// The Browser toolbar's Publish and More buttons (Akemi 15/10/2026): what Tracy says for the page's
// site. Publish follows the row menu's own rule (`showsPublish`), More shows for any site of the
// viewer's, and the menu gets the facts the My Sites row gives it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moreSiteOf, toolbarSiteOf, toolbarStateOf } from '../src/client/site-toolbar-state.ts'

const t = (key) => ({ 'more.publish': 'Publish', 'action.more': 'More' })[key] ?? key
const row = (extra = {}) => ({
  siteKey: 'acme-1a2b',
  displayName: 'acme',
  aliases: ['acme', 'acme-1a2b'],
  platform: 'wordpress',
  role: 'owner',
  status: 'accepted',
  copyUrl: 'https://acme.tracy.test/',
  publish: 'draft',
  ...extra
})

test('the page names its site by key or by name', () => {
  assert.equal(toolbarSiteOf('acme', [row()])?.siteKey, 'acme-1a2b')
  assert.equal(toolbarSiteOf('acme-1a2b', [row()])?.siteKey, 'acme-1a2b')
  assert.equal(toolbarSiteOf('other', [row()]), null)
  assert.equal(toolbarSiteOf(null, [row()]), null)
})

test('a draft or a live site shows Publish and More, keyed by the page segment', () => {
  for (const publish of ['draft', 'published'])
    assert.deepEqual(toolbarStateOf('acme', row({ publish }), t), {
      siteKey: 'acme',
      publish: 'Publish',
      more: 'More'
    })
})

test('no Publish while the list has not said whether the site is published; no buttons off the list', () => {
  assert.deepEqual(toolbarStateOf('acme', row({ publish: undefined }), t), {
    siteKey: 'acme',
    publish: null,
    more: 'More'
  })
  assert.deepEqual(toolbarStateOf('acme', null, t), { siteKey: 'acme', publish: null, more: null })
})

test('the menu gets the row facts the My Sites list builds', () => {
  assert.deepEqual(moreSiteOf(row(), true), {
    siteKey: 'acme-1a2b',
    role: 'owner',
    status: 'accepted',
    liveUrl: 'https://acme.tracy.test/',
    adminUrl: 'https://acme.tracy.test/wp-admin',
    lastOwner: true,
    publish: 'draft',
    publishing: null,
    syncsFromLive: false
  })
  // Sync from live: an imported Joomla site only (`/api/sites` `imported`).
  assert.equal(moreSiteOf(row({ imported: true, platform: 'joomla' }), true).syncsFromLive, true)
  assert.equal(moreSiteOf(row({ imported: true, platform: 'wordpress' }), true).syncsFromLive, true)
  assert.equal(moreSiteOf(row({ imported: true, platform: 'emdash' }), true).syncsFromLive, false)
  assert.equal(moreSiteOf(row({ imported: false, platform: 'wordpress' }), true).syncsFromLive, false)
  // The last-Owner mark is an Owner's only; Shopify has no admin door here.
  const editor = moreSiteOf(row({ role: 'editor', platform: 'shopify' }), true)
  assert.equal(editor.lastOwner, false)
  assert.equal(editor.adminUrl, null)
})
