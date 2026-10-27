/**
 * Words taken out by `content.replace` leave a space where they stood, and the answers say it is harmless
 * (round 7, 30/09/2026). Neutral fixtures.
 *
 *   node --test packages/tools/tracy-site-tools/test/replace-space.test.mjs
 *
 * Measured, before: an EmDash removal of a closing sentence answered `after: "… dock equipment. "` (a
 * space at the end, invisible in the page). The model tried to tidy it — a second `content.replace` whose
 * find and replace differ only in that space — and was refused `replace equals find in replace`, which read
 * as if it had sent the same words twice. One wasted call; it then reasoned that the trailing space
 * probably did not matter and answered. The words are compared trimmed and the space is not stored tidier
 * on purpose: the join is bytes the customer did not name, and the engines' undo gives the value back as
 * it was read. So the receipt says the space is harmless, and the refusal says why it saw no change.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planReplace, receipt, REPLACE_NEXT, replaceText } from '../src/host/replace.mjs'

const undo = { action: 'apply.revert', params: { apply_id: 'replace-1' } }
const changed = [{ at: 'post:1#blocks[0]', where: 'main', before: 'A. B.', after: 'A. ' }]

test('find and replace that differ only in spaces at their ends are refused as such, not as "replace equals find"', () => {
  const r = /** @type {any} */ (
    planReplace({ find: 'rooflights, dock equipment. ', replace: 'rooflights, dock equipment.' })
  )
  assert.equal(r.ok, false)
  assert.equal(r.code, 'BAD_PARAMS')
  assert.equal(r.param, 'replace')
  assert.equal(r.error, replaceText('badSpacesError'))
  assert.equal(r.next, replaceText('badSpacesNext'))
  assert.match(r.error, /differ only in spaces at their ends, which are not compared/)
  assert.match(r.next, /a space left where words were removed is harmless: leave it/)
  assert.match(r.next, /tell the customer what changed/)
  assert.ok(r.error.length <= 160 && r.next.length <= 200, `${r.error.length} / ${r.next.length}`)
  // Either side may carry the space, and so may a pair inside `changes`.
  for (const pair of [
    { find: 'dock equipment.', replace: 'dock equipment. ' },
    { find: ' dock equipment. ', replace: 'dock equipment.\n' }
  ])
    assert.equal(
      /** @type {any} */ (planReplace(pair)).next,
      replaceText('badSpacesNext'),
      JSON.stringify(pair)
    )
  const inChanges = /** @type {any} */ (
    planReplace({
      changes: [
        { find: 'A', replace: 'B' },
        { find: 'dock equipment. ', replace: 'dock equipment.' }
      ]
    })
  )
  assert.equal(inChanges.param, 'changes[1].replace')
  assert.equal(inChanges.next, replaceText('badSpacesNext'))
})

test('the same words twice stay "replace equals find"; a real change with the same ends passes', () => {
  const same = /** @type {any} */ (planReplace({ find: 'dock equipment.', replace: 'dock equipment.' }))
  assert.equal(same.error, replaceText('badSameError', { param: 'replace' }))
  assert.equal(same.next, replaceText('badSameNext'))
  assert.equal(/** @type {any} */ (planReplace({ find: 'dock equipment. ', replace: '' })).ok, true)
  assert.equal(
    /** @type {any} */ (planReplace({ find: 'dock equipment.', replace: ' loading docks. ' })).ok,
    true
  )
})

test('a receipt for words taken out says the space left is harmless; every other receipt is as it was', () => {
  const removed = receipt({ platform: 'emdash', path: '/', changed, undo, removal: true })
  assert.equal(removed.next, REPLACE_NEXT.receiptRemoved)
  assert.match(REPLACE_NEXT.receiptRemoved, /A space left where words were removed is harmless: leave it\./)
  // what the plain receipt says stays: in plain words what changed, the undo kept back, nothing read back
  assert.match(REPLACE_NEXT.receiptRemoved, /in plain words what changed and where/)
  assert.match(REPLACE_NEXT.receiptRemoved, /Keep the undo for yourself until they ask\. Read nothing back\./)
  assert.ok(REPLACE_NEXT.receiptRemoved.length <= 200, String(REPLACE_NEXT.receiptRemoved.length))
  assert.equal(receipt({ platform: 'emdash', path: '/', changed, undo }).next, REPLACE_NEXT.receipt)
  assert.equal(
    receipt({ platform: 'emdash', path: '/', changed, undo, removal: false }).next,
    REPLACE_NEXT.receipt
  )
  // a decision the receipt carries beats the reassurance: a place left out, and places that still open alike
  const alsoIn = [{ at: 'site#footer', where: 'footer', text: 'B.' }]
  assert.equal(
    receipt({ platform: 'emdash', path: '/', changed, undo, removal: true, alsoIn }).next,
    REPLACE_NEXT.receiptAlsoIn
  )
  assert.equal(
    receipt({
      platform: 'emdash',
      path: '/',
      changed,
      undo,
      removal: true,
      stillHolds: { opening: 'A. ', places: [{ at: 'site#x', text: 'A. C.' }] }
    }).next,
    REPLACE_NEXT.receiptStillHolds
  )
})
