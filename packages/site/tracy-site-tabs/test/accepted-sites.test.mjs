/**
 * The site tabs' list of sites, read from the page's shared `/api/sites` answer (#340).
 *
 *   node --test packages/site/tracy-site-tabs/test/accepted-sites.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  acceptedSites,
  canonicalSiteKey,
  forgetOnSitesChanged,
  resetAcceptedSites
} from '../src/client/accepted-sites.mjs'

const row = (siteKey, status = 'accepted') => ({ siteKey, role: 'owner', status })

test('an empty list is taken as it comes: one read, no second ask on the spot', async () => {
  resetAcceptedSites()
  let reads = 0
  const read = async () => {
    reads += 1
    return { status: 200, body: { sites: [] } }
  }
  assert.deepEqual(await acceptedSites(read), [])
  assert.equal(reads, 1)
})

test('only accepted seats are listed', async () => {
  resetAcceptedSites()
  const rows = await acceptedSites(async () => ({
    status: 200,
    body: { sites: [row('a.tracy.test'), row('b.tracy.test', 'pending')] }
  }))
  assert.deepEqual(
    rows.map((r) => r.siteKey),
    ['a.tracy.test']
  )
})

test('an active public name resolves to the immutable workspace key', () => {
  const rows = [{ siteKey: 'internal.tracy.test', aliases: ['internal.tracy.test', 'shop.example.com'] }]
  assert.equal(canonicalSiteKey('SHOP.EXAMPLE.COM', rows), 'internal.tracy.test')
  assert.equal(canonicalSiteKey('internal.tracy.test', rows), 'internal.tracy.test')
  assert.equal(canonicalSiteKey('pending.example.com', rows), null)
})

test('a failed read keeps the last list; an empty answer clears it, so a failure cannot revive a removed site', async () => {
  resetAcceptedSites()
  await acceptedSites(async () => ({ status: 200, body: { sites: [row('gone.tracy.test')] } }))
  assert.deepEqual(
    (await acceptedSites(async () => ({ status: 0, body: null }))).map((r) => r.siteKey),
    ['gone.tracy.test'],
    'a network failure is not an empty list'
  )
  assert.deepEqual(await acceptedSites(async () => ({ status: 200, body: { sites: [] } })), [])
  assert.deepEqual(await acceptedSites(async () => ({ status: 503, body: null })), [])
})

test('a site deleted, then a failed read: the list kept from before the delete is not handed back', async () => {
  resetAcceptedSites()
  const page = new EventTarget()
  forgetOnSitesChanged(page)
  forgetOnSitesChanged(page)
  await acceptedSites(async () => ({ status: 200, body: { sites: [row('gone.tracy.test')] } }))
  page.dispatchEvent(new Event('tracy:sites-changed'))
  assert.deepEqual(await acceptedSites(async () => ({ status: 0, body: null })), [], 'a network failure')
  assert.deepEqual(await acceptedSites(async () => ({ status: 401, body: null })), [], 'a 401')
  const kept = await acceptedSites(async () => ({ status: 200, body: { sites: [row('kept.tracy.test')] } }))
  assert.deepEqual(
    kept.map((r) => r.siteKey),
    ['kept.tracy.test'],
    'the next answer the door gives is taken as it comes'
  )
})
