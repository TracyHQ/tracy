#!/usr/bin/env node
/**
 * The admin door of a freshly built site — the second half of the handover screen (ADR 0088 §5.1).
 *
 * ⚠ THIS ITEM WAS ONCE DOWNGRADED TO "SHOW NO BUTTON". The first version read `adminUrl` from the job row, saw
 * the fleet did not return it, and concluded the data was missing. Wrong: the admin path is NOT a fact of
 * a build, it is **a property of the platform** — `tracy-desk` keeps exactly that table in
 * `src/shared/types/platformAdmin.ts` and reads it through `platformProfile.adminPath`.
 *
 * 🔒 WHAT THE ADR BANS IS A SHARED PATH, NOT A TABLE. `/administrator/` hard-coded for every
 * platform is Joomla's path handed to a WordPress site — §7.4 names that trap. A
 * platform → path table is the opposite: it states that the answer differs by platform.
 *
 * `null` is a valid answer and must hold: Shopify is administered at `admin.shopify.com`, a
 * host this pane never shows. A guessed path is a 404 that wastes someone's press.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { adminUrlFor } from '../src/client/admin-path.mjs'

test('joins the path onto the site address', () => {
  assert.equal(adminUrlFor('https://a.tracy.ai', 'joomla'), 'https://a.tracy.ai/administrator')
  assert.equal(adminUrlFor('https://a.tracy.ai/', 'wordpress'), 'https://a.tracy.ai/wp-admin')
  assert.equal(adminUrlFor('https://a.tracy.ai', 'emdash'), 'https://a.tracy.ai/_emdash/admin')
})

test('makes NO double slash when liveUrl already ends in one', () => {
  // `https://a.tracy.ai//wp-admin` still loads on many servers and breaks on a few — exactly the
  // kind of bug that only shows on some customer's site.
  assert.equal(adminUrlFor('https://a.tracy.ai/', 'joomla'), 'https://a.tracy.ai/administrator')
})

test('a platform without an admin door returns null, not a guessed path', () => {
  assert.equal(adminUrlFor('https://a.tracy.ai', 'shopify'), null)
  assert.equal(adminUrlFor('https://a.tracy.ai', 'unknown'), null)
  assert.equal(adminUrlFor('https://a.tracy.ai', 'drupal'), null)
})

test('no liveUrl means no admin path', () => {
  assert.equal(adminUrlFor('', 'joomla'), null)
  assert.equal(adminUrlFor(null, 'joomla'), null)
})

test('a liveUrl carrying a path still computes the admin path from the site ROOT', () => {
  // The fleet returns the site root, but if one day it returns a deeper path the admin door is still at the
  // root — appending would give `/posts/x/administrator`.
  assert.equal(adminUrlFor('https://a.tracy.ai/posts/x', 'joomla'), 'https://a.tracy.ai/administrator')
})

test('a broken address returns null rather than throwing', () => {
  assert.equal(adminUrlFor('not a url', 'joomla'), null)
})
