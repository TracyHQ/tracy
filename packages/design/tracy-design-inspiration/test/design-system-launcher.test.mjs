/**
 * The Design system tab in the right column's + menu (Akemi, 25/10/2026). The operator's switch
 * `launch-design-system` lists it (through the side card's tab policy, `@tracy/core/ui-switches`);
 * this plugin only has to register the tab as a listable type, and keep it off the menu while the
 * Design system feature itself (`toolbar-design-system`) is switched off.
 *
 *   node --test packages/design/tracy-design-inspiration/test/design-system-launcher.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { doors, openTabDom } from './fixtures/design-system-tab-dom.mjs'

const DS_TAB = 'tracy:design-system'
const BARE = { platform: 'wordpress', canApply: true, refused: [], worn: null, supported: true, last: null }

/** The doors, plus Tracy's `/api/ui` answering `hidden`. */
function doorsWithSwitches(hidden) {
  const state = doors(BARE)
  const site = state.fetch
  state.fetch = async (input, init) =>
    new URL(String(input), 'http://tracy.test').pathname === '/api/ui'
      ? new Response(JSON.stringify({ hidden }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      : site(input, init)
  return state
}

/** Mount the plugin on a fresh page whose switches answer `hidden`, and let the answer land. */
async function mounted(hidden) {
  const ui = await openTabDom()
  const plugin = await ui.mountPlugin({ state: doorsWithSwitches(hidden) })
  await ui.settle(10)
  return { ui, plugin, descriptor: plugin.descriptors.get(DS_TAB) }
}

test('the Design system tab is a listable type: not hidden from the + menu and the Start guide', async () => {
  const { ui, plugin, descriptor } = await mounted([])
  try {
    assert.ok(descriptor, 'the plugin registers the Design system tab')
    assert.notEqual(
      descriptor.hidden,
      true,
      'a hidden type never reaches the + menu, whatever the switch says'
    )
    assert.equal(typeof descriptor.available, 'function')
    assert.equal(descriptor.available({}, { sessionId: 's1' }, {}), true, 'offered while the feature is on')
  } finally {
    await plugin.unmount()
    ui.restore()
  }
})

test('with the Design system feature switched off, the + menu does not offer its tab', async () => {
  const { ui, plugin, descriptor } = await mounted(['toolbar-design-system'])
  try {
    assert.equal(descriptor.available({}, { sessionId: 's1' }, {}), false)
    assert.ok(plugin.refreshed() >= 1, 'the side card is asked again once the switches land')
  } finally {
    await plugin.unmount()
    ui.restore()
  }
})

test('opened from the + menu with no site in its meta, the tab shows the page’s open site', async () => {
  const { ui, plugin } = await mounted([])
  try {
    // The fixture page is not a site's page: the tab says to open one, as Site changes and Team do.
    await plugin.press({})
    assert.match(plugin.host.textContent, /Open a site to choose its design system\./)
  } finally {
    await plugin.unmount()
    ui.restore()
  }
})
