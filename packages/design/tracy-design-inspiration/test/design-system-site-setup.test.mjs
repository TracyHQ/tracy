import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doors, openTabDom, SITE } from './fixtures/design-system-tab-dom.mjs'

const SETUP = {
  platform: 'wordpress',
  canApply: false,
  refused: [],
  worn: null,
  template: null,
  supported: false,
  reason: 'SITE_NOT_READY',
  last: null
}

test('an unbuilt site explains setup and opens its existing Build tab without applying a system', async () => {
  const ui = await openTabDom()
  const state = doors(SETUP)
  const plugin = await ui.mountPlugin({ state })
  try {
    assert.ok(plugin.host.querySelector('[data-design-system-setup]'))
    assert.match(plugin.host.textContent, /Finish building your site/)
    assert.doesNotMatch(plugin.host.textContent, /Couldn’t read|Try again|Calm Paper/)
    const button = [...plugin.host.querySelectorAll('button')].find((b) => b.textContent === 'Open Build')
    assert.ok(button)
    await ui.fire(button)
    assert.deepEqual(plugin.opened.at(-1), {
      seed: { type: 'tracy:build:wordpress', meta: { siteKey: SITE } },
      scope: undefined
    })
    assert.deepEqual(state.applies, [])
    assert.deepEqual(state.undos, [])
  } finally {
    await plugin.unmount()
    ui.restore()
  }
})
