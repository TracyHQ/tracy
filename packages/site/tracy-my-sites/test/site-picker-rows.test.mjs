/**
 * Which sites the chat's site picker lists beside the current one (Akemi, 29/09: the picker next
 * to the chat box showed only the site this window works on, so a person with two sites could
 * not find the second one).
 *
 * The picker offers exactly the sites the My Sites row would open: accepted, with an agent, not
 * the one this page is on. Anything else (an invitation, a site still starting) is answered in
 * My Sites, which the picker links to.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { otherOpenableSites } from '../src/client/site-picker-rows.ts'

const row = (siteKey, extra = {}) => ({
  siteKey,
  role: 'owner',
  status: 'accepted',
  agent: '/',
  copyUrl: null,
  ...extra
})

test('lists the other sites that can be opened, in the order the seat book gave them', () => {
  const sites = [row('jaresort.tracy.site'), row('tracy.ai', { role: 'admin' }), row('b.example.com')]
  assert.deepEqual(
    otherOpenableSites(sites, 'jaresort.tracy.site').map((s) => s.siteKey),
    ['tracy.ai', 'b.example.com']
  )
})

test('leaves out invitations, sites without an agent, and the current site', () => {
  const sites = [
    row('jaresort.tracy.site'),
    row('invited.example.com', { status: 'invited' }),
    row('starting.example.com', { agent: null }),
    row('tracy.ai')
  ]
  assert.deepEqual(
    otherOpenableSites(sites, 'jaresort.tracy.site').map((s) => s.siteKey),
    ['tracy.ai']
  )
})

test('with no current site known, every openable site is listed', () => {
  assert.equal(otherOpenableSites([row('a.example.com'), row('b.example.com')], null).length, 2)
})

test('a renamed current site is still the current one when the address names it by its new name (bug 03/10/2026)', () => {
  const sites = [
    row('scv2jo.scv2.tracy.test', {
      displayName: 'scv2jo-lee.scv2.tracy.test',
      aliases: ['scv2jo.scv2.tracy.test', 'scv2jo-lee.scv2.tracy.test']
    }),
    row('scv2wp.scv2.tracy.test')
  ]
  assert.deepEqual(
    otherOpenableSites(sites, 'scv2jo-lee.scv2.tracy.test').map((s) => s.siteKey),
    ['scv2wp.scv2.tracy.test']
  )
})
