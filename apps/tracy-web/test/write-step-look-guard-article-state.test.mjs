// The look guard opens exactly one value of a template article's `state` to the write step: unpublished (0), which is
// how a page the plan drops is hidden (hide-writes.js, #569). Before, every dropped page's article gave a blocking
// look guard finding (25 per Central Padel build, 15/11/2026) although the write was the intended one.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lookGuard } from '../src/write-step/look-guard.js'
import { pagesKit } from './_write-step-pages.mjs'

/** A site door holding one template article, published. */
function door() {
  const calls = []
  return {
    calls,
    apply: async ({ action, params }) => {
      calls.push({ action, params })
      if (action === 'content.get')
        return { ok: true, item: { id: params.id, state: 1, title: 'Boxing classes' } }
      return { ok: true }
    }
  }
}

async function writeState(state) {
  const guard = lookGuard({ kit: pagesKit(), contentMap: null })
  const site = guard.door(door())
  await site.apply({ siteKey: 's', action: 'content.get', params: { kind: 'article', id: 6 } })
  await site.apply({
    siteKey: 's',
    action: 'content.update',
    params: { kind: 'article', id: 6, fields: { state } }
  })
  return [...guard.findings(), ...guard.refused()]
}

test('unpublishing a template article (state 0) is open to the write step and leaves no look guard finding', async () => {
  assert.deepEqual(await writeState(0), [])
})

test('publishing or trashing a template article is still a look guard finding', async () => {
  for (const state of [1, -2, 2]) {
    const found = await writeState(state)
    assert.equal(found.length, 1, String(state))
    assert.match(JSON.stringify(found[0]), /only unpublishing \(state 0\) is open on article 6/)
  }
})
