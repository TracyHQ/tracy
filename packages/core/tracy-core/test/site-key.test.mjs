import assert from 'node:assert/strict'
import { test } from 'node:test'

import { inCreationWorkspace, siteKeyOfPage } from '../src/site-key/index.mjs'

const POINTER = 'tracy_seat=x; tracy_site=kineticakemi.tracy.site'

test('the creation workspace names no site, whatever pointer a previous page left (bug 01/10/2026)', () => {
  assert.equal(siteKeyOfPage({ pathname: '/new/', basePathname: '/new/', cookie: POINTER }), null)
  assert.equal(siteKeyOfPage({ pathname: '/new/s/session-1', basePathname: '/new/', cookie: POINTER }), null)
  // Before the base is read, the path alone says so.
  assert.equal(siteKeyOfPage({ pathname: '/new', cookie: POINTER }), null)
  assert.equal(inCreationWorkspace({ pathname: '/news.example/' }), false)
  assert.equal(siteKeyOfPage({ pathname: '/widget/native/s/session-widget-own', cookie: POINTER }), null)
  assert.equal(inCreationWorkspace({ pathname: '/widget/native-other/' }), false)
})

test("a site's mount names its site, ahead of the pointer", () => {
  assert.equal(
    siteKeyOfPage({ pathname: '/a.tracy.site/s/x', basePathname: '/a.tracy.site/', cookie: POINTER }),
    'a.tracy.site'
  )
})

test('a page at the bare root falls back to the pointer, decoded; none, empty or malformed is null', () => {
  assert.equal(
    siteKeyOfPage({ pathname: '/s/x', basePathname: '/', cookie: POINTER }),
    'kineticakemi.tracy.site'
  )
  assert.equal(siteKeyOfPage({ pathname: '/s/x', cookie: 'tracy_site=a%2Eb.tracy.site' }), 'a.b.tracy.site')
  assert.equal(siteKeyOfPage({ pathname: '/', cookie: '' }), null)
  assert.equal(siteKeyOfPage({ pathname: '/', cookie: 'tracy_site=%E0%A4%A' }), null)
})

test("dsh's own root files are not site keys", () => {
  assert.equal(siteKeyOfPage({ pathname: '/manifest.webmanifest', cookie: '' }), null)
})

// ── A renamed site (bug 03/10/2026, scv2jo → scv2jo-lee) ────────────────────────────────────────
// The key is immutable; the name people see is `displayName`, and every older name stays an alias.
const RENAMED = [
  {
    siteKey: 'scv2jo.scv2.tracy.test',
    displayName: 'scv2jo-lee.scv2.tracy.test',
    aliases: ['scv2jo.scv2.tracy.test', 'scv2jo-lee.scv2.tracy.test'],
    copyUrl: 'http://scv2jo-lee.scv2.tracy.test:34080/'
  },
  {
    siteKey: 'scv2wp.scv2.tracy.test',
    displayName: 'scv2wp.scv2.tracy.test',
    copyUrl: 'http://scv2wp.scv2.tracy.test:34080/'
  }
]

test('a renamed site is NAMED by its current address, whichever of its names asks', async () => {
  const { siteNameFor } = await import('../src/site-key/index.mjs')
  assert.equal(siteNameFor(RENAMED, 'scv2jo.scv2.tracy.test'), 'scv2jo-lee.scv2.tracy.test')
  assert.equal(siteNameFor(RENAMED, 'SCV2JO-LEE.scv2.tracy.test'), 'scv2jo-lee.scv2.tracy.test')
  assert.equal(siteNameFor(RENAMED, 'scv2wp.scv2.tracy.test'), 'scv2wp.scv2.tracy.test')
  // Not in the list (yet): the name asked is all there is to show.
  assert.equal(siteNameFor(RENAMED, 'other.scv2.tracy.test'), 'other.scv2.tracy.test')
  assert.equal(siteNameFor([], 'scv2jo.scv2.tracy.test'), 'scv2jo.scv2.tracy.test')
  assert.equal(siteNameFor(undefined, 'scv2jo.scv2.tracy.test'), 'scv2jo.scv2.tracy.test')
})

test('a renamed site is KEYED by its immutable key, whichever of its names asks', async () => {
  const { siteKeyFor } = await import('../src/site-key/index.mjs')
  assert.equal(siteKeyFor(RENAMED, 'scv2jo-lee.scv2.tracy.test'), 'scv2jo.scv2.tracy.test')
  assert.equal(siteKeyFor(RENAMED, 'scv2jo.scv2.tracy.test'), 'scv2jo.scv2.tracy.test')
  assert.equal(siteKeyFor(RENAMED, 'other.scv2.tracy.test'), null)
})

test("a Browser page on a site's old host moves to the same page on its current host", async () => {
  const { followedAddress } = await import('../src/site-key/index.mjs')
  assert.equal(
    followedAddress('http://scv2jo.scv2.tracy.test:34080/about/?x=1#top', RENAMED),
    'http://scv2jo-lee.scv2.tracy.test:34080/about/?x=1#top'
  )
  // Already on the current host, another site, a stranger, or no address at all: nothing to move.
  assert.equal(followedAddress('http://scv2jo-lee.scv2.tracy.test:34080/about/', RENAMED), null)
  assert.equal(followedAddress('http://scv2wp.scv2.tracy.test:34080/', RENAMED), null)
  assert.equal(followedAddress('https://example.com/', RENAMED), null)
  assert.equal(followedAddress('not a url', RENAMED), null)
})
