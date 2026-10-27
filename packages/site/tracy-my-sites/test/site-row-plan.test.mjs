/**
 * What the dsh sidebar's workspace row menu shows on a site page (`site-row-menu.tsx`).
 *
 * On a site page the row whose folder is this page's site folder (`/site/<label>`, sent by
 * `/api/sites` as `folder`) is the site, not a "workspace": dsh's Rename and Delete workspace leave
 * it, and it offers My Sites' Leave site (every role; the last Owner sees it greyed with the
 * reason) and Delete site… (an accepted Owner only). Every other row — the creation workspace on
 * `/new/`, another site's row an admin seat sees — keeps dsh's own menu (`null`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isLastOwner, siteRowPlan } from '../src/client/site-row-plan.ts'

const row = (over = {}) => ({
  siteKey: 'shop.tracy.test',
  displayName: 'shop.example.com',
  aliases: ['shop.tracy.test', 'shop.example.com'],
  role: 'owner',
  status: 'accepted',
  folder: '/site/shop',
  ...over
})

const plan = (over = {}) =>
  siteRowPlan({ path: '/site/shop', here: 'shop.example.com', sites: [row()], lastOwner: false, ...over })

test('the site row on its own page, for an Owner: Leave site and Delete site', () => {
  assert.deepEqual(plan(), {
    siteKey: 'shop.tracy.test',
    siteName: 'shop.example.com',
    leave: { lastOwner: false },
    delete: true
  })
})

test('the last Owner: Leave site greyed with the reason, Delete site still there', () => {
  assert.deepEqual(plan({ lastOwner: true }).leave, { lastOwner: true })
  assert.equal(plan({ lastOwner: true }).delete, true)
})

test('an Editor (or Viewer) sees Leave site only', () => {
  for (const role of ['editor', 'viewer']) {
    const p = plan({ sites: [row({ role })] })
    assert.equal(p.delete, false, role)
    assert.deepEqual(p.leave, { lastOwner: false }, role)
  }
})

test('an Owner seat not accepted yet is not offered Delete site', () => {
  assert.equal(plan({ sites: [row({ status: 'pending' })] }), null)
})

test('the creation workspace (/new/) names no site: dsh keeps its menu', () => {
  assert.equal(plan({ here: null, path: '/new/alice' }), null)
})

test('an admin seat on a site page: another site row keeps dsh’s menu', () => {
  const sites = [
    row(),
    row({ siteKey: 'other.tracy.test', displayName: 'other.tracy.test', aliases: [], folder: '/site/other' })
  ]
  assert.equal(plan({ sites, path: '/site/other' }), null)
  assert.notEqual(plan({ sites, path: '/site/shop' }), null)
})

test('a page on a site the viewer holds no seat on keeps dsh’s menu', () => {
  assert.equal(plan({ sites: [] }), null)
})

test('a row is matched by the stored folder, never guessed from the key', () => {
  // An imported site: its label is not the first part of its key.
  const sites = [
    row({
      siteKey: 'shop.customer.example',
      aliases: [],
      displayName: 'shop.customer.example',
      folder: '/site/shop-customer-example-1a2b3c'
    })
  ]
  assert.equal(
    plan({ sites, here: 'shop.customer.example', path: '/site/shop-customer-example-1a2b3c' }).siteKey,
    'shop.customer.example'
  )
  assert.equal(plan({ sites, here: 'shop.customer.example', path: '/site/shop' }), null)
  // A trailing slash on dsh's side is the same folder.
  assert.notEqual(
    plan({ sites, here: 'shop.customer.example', path: '/site/shop-customer-example-1a2b3c/' }),
    null
  )
})

test('a seat book without folders (an older server) matches nothing', () => {
  assert.equal(plan({ sites: [row({ folder: undefined })] }), null)
})

test('isLastOwner: the only active Owner, by address', () => {
  const seats = [
    { role: 'owner', status: 'active', email: 'me@x.y' },
    { role: 'editor', status: 'active', email: 'ed@x.y' }
  ]
  assert.equal(isLastOwner(seats, 'me@x.y'), true)
  assert.equal(
    isLastOwner([...seats, { role: 'owner', status: 'active', email: 'two@x.y' }], 'me@x.y'),
    false
  )
  assert.equal(
    isLastOwner([...seats, { role: 'owner', status: 'invited', email: 'two@x.y' }], 'me@x.y'),
    true
  )
  assert.equal(isLastOwner(seats, 'ed@x.y'), false)
  assert.equal(isLastOwner(seats, null), false)
  assert.equal(isLastOwner(undefined, 'me@x.y'), false)
})
