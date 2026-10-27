// C1: the Inbox on the creation workspace, and where an accepted invitation lands.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inCreationWorkspace, landingAfterAccept } from '../src/client/onboarding.ts'

test('the creation workspace is the page whose base is /new/', () => {
  assert.equal(inCreationWorkspace('https://cowork.tracy.site/new/'), true)
  assert.equal(inCreationWorkspace('https://cowork.tracy.site/new/s/session-1'), false)
  assert.equal(inCreationWorkspace('https://cowork.tracy.site/kinetic.vn/'), false)
  assert.equal(inCreationWorkspace('not a url'), false)
})

test('an accepted invitation lands in the site itself', () => {
  assert.equal(landingAfterAccept('wptest0929.tracy.site'), '/wptest0929.tracy.site/')
})
