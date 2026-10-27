/** When the Help strip draws the rows and when the transcript does (`src/client/dock-phase.ts`). */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transcriptHidden } from '../src/client/dock-phase.ts'

test('a blank session with nothing started: no transcript, so the strip draws the rows', () => {
  assert.equal(transcriptHidden({ blank: true }, 0), true)
  assert.equal(transcriptHidden({ blank: true, running: false, promptAttempted: false }, 0), true)
})

test('a host command opened the transcript (an active target) while the session is still blank: the strip steps aside', () => {
  // `/compact`: session.blank stays true, the Chat target turns active. Both used to draw the rows.
  assert.equal(transcriptHidden({ blank: true }, 1), false)
  assert.equal(transcriptHidden({ blank: true }, 3), false)
})

test('a message was sent or is running: the transcript has the rows', () => {
  assert.equal(transcriptHidden({ blank: true, promptAttempted: true }, 0), false)
  assert.equal(transcriptHidden({ blank: true, running: true }, 0), false)
})

test('a session that is no longer blank never uses the strip', () => {
  assert.equal(transcriptHidden({ blank: false }, 0), false)
  assert.equal(transcriptHidden({}, 0), false)
  assert.equal(transcriptHidden(undefined, 0), false)
})
