#!/usr/bin/env node
/**
 * The Mode · Platform pills drop their words, and only their words, when the Conversation is too
 * narrow to hold them. Measured 27/09 on the local stand (site capijl1644): labelled pills need
 * 230px, icons alone 66px; at the 250px Conversation floor only the icons fit beside the workspace
 * chip.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fitLabels } from '../src/client/fit.mjs'

test('labels stay while the room holds them whole', () => {
  assert.deepEqual(fitLabels({ compact: false, room: 300, content: 230, full: 0 }), {
    compact: false,
    full: 230
  })
  assert.deepEqual(fitLabels({ compact: false, room: 230, content: 230, full: 0 }), {
    compact: false,
    full: 230
  })
})

test('labels go when the room is narrower than they are', () => {
  assert.deepEqual(fitLabels({ compact: false, room: 229, content: 230, full: 0 }), {
    compact: true,
    full: 230
  })
})

test('a compact picker keeps the remembered labelled width, not its icon width', () => {
  assert.deepEqual(fitLabels({ compact: true, room: 120, content: 66, full: 230 }), {
    compact: true,
    full: 230
  })
})

test('labels come back once the room holds the remembered width again', () => {
  assert.deepEqual(fitLabels({ compact: true, room: 230, content: 66, full: 230 }), {
    compact: false,
    full: 230
  })
})

test('an unmeasured picker shows its labels so they can be measured', () => {
  assert.deepEqual(fitLabels({ compact: true, room: 100, content: 66, full: 0 }), { compact: false, full: 0 })
  assert.deepEqual(fitLabels({ compact: false, room: 0, content: 0, full: 0 }), { compact: false, full: 0 })
})
