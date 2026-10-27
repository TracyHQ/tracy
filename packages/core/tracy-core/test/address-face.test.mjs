#!/usr/bin/env node
/**
 * `addressFace` — the one face a client draws for someone the server sent no face for: an address
 * typed into the invite wizard, a person a record names but no Tracy account backs. The first
 * character upper case, on the neutral grey; never a colour guessed in the browser.
 *
 *   node --test packages/core/tracy-core/test/address-face.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addressFace, NEUTRAL_FACE_COLOUR } from '../src/team/address-face.mjs'

test('an address with no account: its first character, upper case, on the neutral grey, no photo', () => {
  assert.deepEqual(addressFace('mai@example.test'), {
    initial: 'M',
    color: 'var(--muted-foreground, #94a3b8)',
    avatarUrl: null
  })
  assert.equal(NEUTRAL_FACE_COLOUR, 'var(--muted-foreground, #94a3b8)')
})

test('the first character is a whole code point, after the spaces around the address', () => {
  assert.equal(addressFace('  zoe@example.test ').initial, 'Z')
  assert.equal(addressFace('😀@example.test').initial, '😀')
  assert.equal(addressFace('ébé@example.test').initial, 'É')
})

test('nothing to read: a question mark, as the server says of an account with no name and no email', () => {
  assert.equal(addressFace('').initial, '?')
  assert.equal(addressFace('   ').initial, '?')
  assert.equal(addressFace(/** @type {any} */ (undefined)).initial, '?')
})
