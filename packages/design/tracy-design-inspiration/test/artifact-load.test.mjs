/**
 * One artifact of an inspiration is TWO reads — its page, and the slot map that says where the
 * customer's words go. They used to travel in one `Promise.all`, so either failing threw both away
 * and the dialog said "This inspiration does not ship this page".
 *
 * 08/09, measured on production: `system/artifacts/poster.html` answered 200 at 210KB while
 * `artifact-slots/poster` answered 404 — the door's closed list had never named the slot map. The
 * page existed the whole time. The door is fixed, and so is the coupling that turned one hole into
 * a blank page: a page without its map is a page nobody can edit, not a page nobody can see.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadArtifact } from '../src/client/artifact-load.mjs'

const ok = (v) => () => Promise.resolve(v)
const boom = (why) => () => Promise.reject(new Error(why))

test('loadArtifact: both reads answer — the page and its slots travel together', async () => {
  assert.deepEqual(await loadArtifact(ok('<html>poster</html>'), ok([{ id: 'a' }])), {
    html: '<html>poster</html>',
    slots: [{ id: 'a' }]
  })
})

test('loadArtifact: the slot map failing costs the slots, never the page', async () => {
  assert.deepEqual(await loadArtifact(ok('<html>poster</html>'), boom('404')), {
    html: '<html>poster</html>',
    slots: []
  })
})

test('loadArtifact: the page failing is the only thing that means "no page"', async () => {
  assert.deepEqual(await loadArtifact(boom('404'), ok([{ id: 'a' }])), { html: '', slots: [] })
  assert.deepEqual(await loadArtifact(boom('404'), boom('404')), { html: '', slots: [] })
})

test('loadArtifact: a slot map that is not a list is no slot map', async () => {
  assert.deepEqual(await loadArtifact(ok('<html/>'), ok(null)), { html: '<html/>', slots: [] })
  assert.deepEqual(await loadArtifact(ok('<html/>'), ok('nope')), { html: '<html/>', slots: [] })
})
