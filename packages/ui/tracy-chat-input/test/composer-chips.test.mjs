/**
 * The composer's attachment chips (`ComposerChips.tsx`, rules in `composer-chips.mjs`): what a chip
 * says, and when the chips share the input line with the draft (Akemi, 01/10/2026).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chipsLayout, DRAFT_MIN_WIDTH, fileBadge, uploadState } from '../src/client/composer-chips.mjs'

/** A 712px card (the narrowest desktop chat column): 696px inside, 32px plus and send, 6px gaps. */
const line = (over = {}) => ({
  lineWidth: 696,
  plusWidth: 32,
  sendWidth: 32,
  gap: 6,
  chipsWidth: 0,
  draftTextWidth: 8,
  draftHasBreak: false,
  ...over
})

test('chips share the line while a 160px draft still fits beside them', () => {
  assert.equal(DRAFT_MIN_WIDTH, 160)
  // 696 - 32 - 32 - 18 = 614 for chips and draft together.
  assert.equal(chipsLayout(line({ chipsWidth: 614 - 160 })), 'inline')
  assert.equal(chipsLayout(line({ chipsWidth: 614 - 159 })), 'stacked')
})

test('a multi-line draft sends the chips to their own row', () => {
  assert.equal(chipsLayout(line({ chipsWidth: 120, draftHasBreak: true })), 'stacked')
})

test('a one-line draft too long for the room beside the chips stacks them, measured at one line', () => {
  // Room left beside a 300px chip row: 314px. The text width is the same in both modes, so the
  // decision cannot flip back once the chips move up.
  assert.equal(chipsLayout(line({ chipsWidth: 300, draftTextWidth: 314 })), 'inline')
  assert.equal(chipsLayout(line({ chipsWidth: 300, draftTextWidth: 315 })), 'stacked')
})

test('the draft floor comes from the card when it says one', () => {
  assert.equal(chipsLayout(line({ chipsWidth: 400, draftMin: 200 })), 'inline')
  assert.equal(chipsLayout(line({ chipsWidth: 400, draftMin: 215 })), 'stacked')
})

test('a 320px phone card stacks any chip', () => {
  assert.equal(chipsLayout(line({ lineWidth: 302, chipsWidth: 120 })), 'stacked')
})

test('fileBadge: the extension, short and upper case', () => {
  assert.equal(fileBadge('brand-guidelines.pdf'), 'PDF')
  assert.equal(fileBadge('notes.txt'), 'TXT')
  assert.equal(fileBadge('archive.tar.gz'), 'GZ')
  assert.equal(fileBadge('photo.jpeg-large'), 'JPEG')
  assert.equal(fileBadge('Makefile'), 'FILE')
  assert.equal(fileBadge('.env'), 'FILE')
  assert.equal(fileBadge('trailing.'), 'FILE')
})

test('uploadState: progress while uploading, then ready or error', () => {
  assert.deepEqual(uploadState(undefined), { state: 'uploading', progress: null })
  assert.deepEqual(uploadState({ status: 'uploading', loaded: 50, total: 200 }), {
    state: 'uploading',
    progress: 0.25
  })
  assert.deepEqual(uploadState({ status: 'uploading', loaded: 5, total: 0 }), {
    state: 'uploading',
    progress: null
  })
  assert.deepEqual(uploadState({ status: 'ready' }), { state: 'ready', progress: null })
  assert.deepEqual(uploadState({ status: 'error' }), { state: 'error', progress: null })
})

// J7.8 (e2e 04/10): on a 360px chat column the role chip beside + left the draft ~120px, so a
// sentence wrapped every two or three words. Below the draft floor the draft takes its own row.
test('the draft takes its own row when the controls beside it leave less than the draft floor', async () => {
  const { draftLayout } = await import('../src/client/composer-chips.mjs')
  // 320px card: 298px inside; + and the "Designer" chip 128px, send 32px, two 6px gaps → 126px.
  assert.equal(draftLayout({ lineWidth: 298, toolsWidth: 128, sendWidth: 32, gap: 6 }), 'own-row')
  // The narrowest desktop column keeps the one line.
  assert.equal(draftLayout({ lineWidth: 696, toolsWidth: 128, sendWidth: 32, gap: 6 }), 'line')
  // Exactly the floor still fits; the card's own floor wins over the default.
  assert.equal(
    draftLayout({ lineWidth: 160 + 128 + 32 + 12, toolsWidth: 128, sendWidth: 32, gap: 6 }),
    'line'
  )
  assert.equal(
    draftLayout({ lineWidth: 160 + 128 + 32 + 12, toolsWidth: 128, sendWidth: 32, gap: 6, draftMin: 161 }),
    'own-row'
  )
})
