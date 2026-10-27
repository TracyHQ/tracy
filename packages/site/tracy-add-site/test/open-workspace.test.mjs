#!/usr/bin/env node
/**
 * Where "Open workspace" takes a person once their site is ready.
 *
 * The site's own workspace, in the same tab: a workspace is a site (15/09/2026).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readyLanding, workspacePath } from '../src/client/open-workspace.mjs'

test('the path is the siteKey, with a trailing slash', () => {
  assert.equal(workspacePath({ siteKey: 'fijitrips.example' }), '/fijitrips.example/')
})

test('a fork carries the brand builder deep link', () => {
  assert.equal(
    workspacePath({ siteKey: 'lantern.tracy.test', forkUrl: 'https://example.com/' }),
    '/lantern.tracy.test/?fork=https%3A%2F%2Fexample.com%2F&tab=tracy%3Abrand-builder&site=lantern.tracy.test'
  )
})

test('a site that just came up is entered — unless this page already is its workspace', () => {
  // From the creation workspace (`/new/`, pageSite null) or another site's: go in, to prompt on.
  assert.equal(readyLanding({ siteKey: 'granite.tracy.test', pageSite: null }), '/granite.tracy.test/')
  assert.equal(
    readyLanding({ siteKey: 'granite.tracy.test', pageSite: 'other.tracy.test' }),
    '/granite.tracy.test/'
  )
  // A fork keeps its brand-builder deep link on the way in.
  assert.match(
    readyLanding({ siteKey: 'lantern.tracy.test', pageSite: null, forkUrl: 'https://example.com/' }),
    /^\/lantern\.tracy\.test\/\?fork=/
  )
  // Already there: no page load, the side card shows it.
  assert.equal(readyLanding({ siteKey: 'granite.tracy.test', pageSite: 'granite.tracy.test' }), null)
})
