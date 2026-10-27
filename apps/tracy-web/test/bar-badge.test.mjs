import { test } from 'node:test'
import assert from 'node:assert/strict'
import { badgeTagFor, badgeVariantFor } from '../src/bar/badge.js'
import { templateOfTag } from '../src/lib/quickstart-releases.js'

const badgeUrl = 'https://cowork.tracy.ai/badge.js'

test('badgeVariantFor: a demo advertises, unless it was installed without a badge', () => {
  assert.equal(badgeVariantFor({ demo: true, publish: 'published' }), 'advert')
  assert.equal(badgeVariantFor({ demo: true, publish: 'draft' }), 'advert')
  // The press that said "without tracy-badge" (Lee, 16/09) — the page is proxied untouched.
  assert.equal(badgeVariantFor({ demo: true, publish: 'published', badge: false }), 'none')
  // `badge` says nothing about a customer's copy: only a demo carries the advertisement.
  assert.equal(badgeVariantFor({ demo: false, publish: 'published', badge: false }), 'managed')
  assert.equal(badgeVariantFor({ demo: false, publish: 'published' }), 'managed')
  assert.equal(badgeVariantFor({ demo: false, publish: 'draft' }), 'draft')
})

test("badgeTagFor: the team link leaves the site for Tracy's own hostname (ADR 0018)", () => {
  // `/__tracy/team` on the customer's own hostname is a 404 now — the bar serves no door that
  // needs a session, so the roster is reached where it lives.
  const tag = badgeTagFor({
    variant: 'draft',
    hostname: 'lantern.tracy.ai',
    origin: 'https://cowork.tracy.ai',
    label: 'lantern',
    badgeUrl
  })
  assert.match(tag, /data-team-href="https:\/\/cowork\.tracy\.ai\/lantern\/team"/)
  assert.doesNotMatch(tag, /__tracy/)
})

test('templateOfTag: the card template of an installable release, null for anything else', () => {
  const releases = [
    { tag: 'tracy-business/j6', choosable: true, inspiration: { template: 'tracy-business' } },
    { tag: 'tracy-saas/emdash-0.x', choosable: true, setting: { card: { template: 'tracy-saas' } } },
    { tag: 'tracy-draft/j6', choosable: false, inspiration: { template: 'tracy-draft' } },
    { tag: 'quickstart/ja-kinetic/j6', choosable: true, setting: {} }
  ]
  assert.equal(templateOfTag(releases, 'tracy-business/j6'), 'tracy-business')
  assert.equal(templateOfTag(releases, 'tracy-saas/emdash-0.x'), 'tracy-saas')
  assert.equal(templateOfTag(releases, 'tracy-draft/j6'), null)
  assert.equal(templateOfTag(releases, 'quickstart/ja-kinetic/j6'), null)
  assert.equal(templateOfTag(releases, 'nope'), null)
})
