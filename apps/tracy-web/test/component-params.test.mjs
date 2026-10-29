// componentParams reads com_content's options through a door that refuses `search` on the extensionParams kind
// (spec TracyHQ/tracy#189, round 4: "search does not cover kind extensionParams").
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { componentParams } from '../src/sites/brief-engines/joomla-article-order.js'

test('the extensions are listed without a search, and the component is read whole', async () => {
  const calls = []
  const apply = async ({ action, params }) => {
    calls.push({ action, params })
    if (params.search !== undefined)
      return { ok: false, message: 'search does not cover kind "extensionParams"' }
    if (action === 'content.list')
      return {
        ok: true,
        items: [
          { id: 5, element: 'mod_menu', type: 'module' },
          { id: 19, element: 'com_content', type: 'component' }
        ]
      }
    return { ok: true, item: { id: 19, params: JSON.stringify({ orderby_sec: 'alpha' }) } }
  }
  assert.deepEqual(await componentParams(apply, 's'), { orderby_sec: 'alpha' })
  assert.ok(calls.every((c) => c.params.search === undefined))
  assert.equal(await componentParams(async () => ({ ok: false, message: 'no' }), 's'), null)
})
