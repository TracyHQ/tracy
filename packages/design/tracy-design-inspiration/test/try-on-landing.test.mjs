/**
 * Where a try lands (Akemi, 13/10/2026, option A): Try on your site applies, both popups close, the
 * customer is taken to the Browser panel — and a thin bar "<Name> is on your site now · Undo · Keep"
 * meets them there. The bar is the PLUGIN's, in a root of its own on the page (`try-bar-host.tsx`) over a
 * try the plugin module holds (`try-store.mjs`): on dsh's right column the Browser tab takes the pane and
 * the Design system tab unmounts (measured on dev 13/10/2026: the bar went with it), so the bar must not
 * be the tab's. The tab itself does not repeat the sentence; the way back ("Back to template default" /
 * "Back to <name>") is the Template default card's action.
 *
 *   node --test packages/design/tracy-design-inspiration/test/try-on-landing.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { doors, openTabDom } from './fixtures/design-system-tab-dom.mjs'

/** @type {Awaited<ReturnType<typeof openTabDom>>} */
let ui

/** A supported site that wears nothing yet: a try is the first apply. */
const BARE = {
  platform: 'wordpress',
  canApply: true,
  refused: [],
  worn: null,
  template: 'tracy-business',
  supported: true,
  last: null
}

before(async () => {
  ui = await openTabDom()
})
after(() => ui.restore())

/** Apply the plugin, open the first card's preview popup and press Try on your site. */
async function tryOn(state) {
  const plugin = await ui.mountPlugin({ state })
  await ui.fire(plugin.host.querySelector('[data-system="refero:one"]'))
  await ui.settle()
  const tryButton = ui.body().querySelector('[data-try-on="refero:one"]')
  assert.ok(tryButton, 'the preview popup offers Try on your site')
  await ui.fire(tryButton)
  await ui.settle(10)
  return plugin
}

test('after Try, a bar on the page says the system is on the site, with Undo and Keep', async () => {
  const state = doors(BARE)
  const tab = await tryOn(state)

  assert.deepEqual(state.applies, ['refero:one'], 'the apply door was pressed once')
  assert.equal(tab.opened.length, 1, 'the host was told to bring the Browser panel in sight')
  assert.equal(ui.body().querySelector('[role="dialog"]'), null, 'both popups are closed')

  const bar = ui.body().querySelector('[data-try-bar]')
  assert.ok(bar, 'the bar is on the page')
  assert.equal(
    bar.closest('[data-design-system-tab]'),
    null,
    'the bar is not inside the tab: it is the plugin’s own, on the page'
  )
  assert.match(bar.textContent, /Calm Paper is on your site now/)
  assert.equal(bar.querySelector('[data-try-bar-undo]')?.textContent, 'Undo')
  assert.equal(bar.querySelector('[data-try-bar-keep]')?.textContent, 'Keep')

  // No second copy of the sentence in the tab, and no second Undo there: the grid's badge says what is on.
  assert.equal(
    tab.host.querySelectorAll('[data-notice="ok"]').length,
    0,
    'the tab does not repeat the sentence'
  )
  assert.equal(
    tab.host.querySelectorAll('[data-undo-try]').length,
    0,
    'the tab has no Undo of its own for the try'
  )
  assert.equal(
    tab.host.querySelector('[data-system="refero:one"] [data-card-badge]')?.textContent,
    'Wearing now',
    'the worn card carries the badge'
  )
  assert.equal(
    tab.host.querySelectorAll('[data-undo-worn]').length,
    0,
    'the way back waits while the try is up'
  )
  await tab.unmount()
})

test('after Try, the plugin asks the side card for the Browser tab, once: the site is what the customer lands on', async () => {
  // The real `apply()` over a fake host: the Design system tab is mounted through the descriptor it registered,
  // and `opened` is every `openTab` it asked for. On dsh's native right column `openTab({type:'tracy:browser'})`
  // focuses the Browser page already in the pane, or seats a new one as the pane's active tab — either way the
  // Browser tab is the one in front and the Design system tab is no longer the active one (D1, 13/10/2026).
  const state = doors(BARE)
  const plugin = await ui.mountPlugin({ state })
  await ui.fire(plugin.host.querySelector('[data-system="refero:one"]'))
  await ui.settle()
  assert.deepEqual(plugin.opened, [], "opening a card's preview brings no tab in sight")
  await ui.fire(ui.body().querySelector('[data-try-on="refero:one"]'))
  await ui.settle(10)
  assert.deepEqual(state.applies, ['refero:one'])
  assert.deepEqual(
    plugin.opened,
    [{ seed: { type: 'tracy:browser', meta: { siteKey: 'acme.localhost' } }, scope: undefined }],
    'exactly one openTab, for the Browser tab of this site'
  )
  assert.ok(
    ui.body().querySelector('[data-try-bar]'),
    'the bar is on the page, over whichever tab is in front'
  )
  await plugin.unmount()
})

test('the bar outlives the tab: with the Design system tab unmounted after Try, Undo and Keep are still on the page, and Undo presses the door and reloads the Browser tab', async () => {
  // dsh's right column seats the Browser tab as the pane's active tab and UNMOUNTS this tab (measured on dev
  // 13/10/2026: `[data-try-bar]` gone right after Try, the apply through, the Browser tab in front).
  const state = doors(BARE)
  const plugin = await tryOn(state)
  await plugin.unmountTab()
  assert.equal(ui.body().querySelector('[data-design-system-tab]'), null, 'the tab is gone')
  const bar = ui.body().querySelector('[data-try-bar]')
  assert.ok(bar, 'the bar is still on the page without the tab')
  assert.match(bar.textContent, /Calm Paper is on your site now/)
  assert.ok(bar.querySelector('[data-try-bar-undo]'), 'with Undo')
  assert.ok(bar.querySelector('[data-try-bar-keep]'), 'and Keep')

  // The apply reloaded the Browser tab once already (the tab's `onChanged`); the Undo must do it again.
  const reloadedByApply = plugin.reloaded.length
  await ui.fire(bar.querySelector('[data-try-bar-undo]'))
  await ui.settle(10)
  assert.deepEqual(state.undos, ['apply-2'], 'the undo door was pressed for the try')
  assert.equal(ui.body().querySelector('[data-try-bar]'), null, 'the bar is gone')
  assert.equal(state.read.worn, null, 'the site is back to the template')
  assert.deepEqual(
    plugin.reloaded.slice(reloadedByApply),
    [{ id: 'browser-1', why: 'undo' }],
    'the Browser tab shows the site afresh'
  )
  await plugin.unmount()
})

test('Keep from the bar with the tab gone takes the bar down and presses no door', async () => {
  const state = doors(BARE)
  const plugin = await tryOn(state)
  await plugin.unmountTab()
  await ui.fire(ui.body().querySelector('[data-try-bar-keep]'))
  await ui.settle()
  assert.equal(ui.body().querySelector('[data-try-bar]'), null)
  assert.deepEqual(state.undos, [])
  assert.equal(state.read.worn?.name, 'Calm Paper')
  await plugin.unmount()
})

test('the plugin disposed takes its bar down', async () => {
  const state = doors(BARE)
  const plugin = await tryOn(state)
  assert.ok(ui.body().querySelector('[data-try-bar]'))
  await plugin.unmount()
  assert.equal(ui.dom.document.querySelectorAll('[data-try-bar]').length, 0)
})

test('Keep dismisses the bar and leaves the system on; the Template default card then offers the way back', async () => {
  const state = doors(BARE)
  const tab = await tryOn(state)
  await ui.fire(ui.body().querySelector('[data-try-bar-keep]'))
  await ui.settle()
  assert.equal(ui.body().querySelectorAll('[data-try-bar]').length, 0, 'the bar is gone')
  assert.deepEqual(state.undos, [], 'nothing was undone')
  assert.equal(state.read.worn?.name, 'Calm Paper', 'the site still wears it')
  await ui.fire(tab.host.querySelector('[data-system="template-default"]'))
  await ui.settle()
  assert.equal(
    ui.body().querySelector('[data-system-preview="template-default"] [data-undo-worn]')?.textContent,
    'Back to template default',
    "the Template default card's popup offers the way back"
  )
  await tab.unmount()
})

test('Undo on the bar presses the undo door for the try and takes the bar down', async () => {
  const state = doors(BARE)
  const tab = await tryOn(state)
  await ui.fire(ui.body().querySelector('[data-try-bar-undo]'))
  await ui.settle(10)
  assert.deepEqual(state.undos, ['apply-2'], 'the undo door was pressed for the try')
  assert.equal(ui.body().querySelector('[data-try-bar]'), null, 'the bar is gone')
  assert.equal(state.read.worn, null, 'the site is back to the template')
  await tab.unmount()
})

/** Press the Template default card and give back its popup's primary button. */
async function openDefault(tab) {
  await ui.fire(tab.host.querySelector('[data-system="template-default"]'))
  await ui.settle()
  return ui.body().querySelector('[data-system-preview="template-default"] [data-undo-worn]')
}

test('the way back is there whatever came before: one system, two, or the newest already undone', async () => {
  const worn = {
    ...BARE,
    worn: { id: null, slotId: 'refero:one', name: 'Calm Paper' },
    last: { applyId: 'apply-1', id: 'refero:one', name: 'Calm Paper', previous: null, undone: false }
  }
  for (const last of [
    worn.last,
    { ...worn.last, previous: { id: 'refero:two', name: 'Bold Ink' } },
    // Two applies, the newest undone: undoing can no longer go back (DS_NOT_LATEST); the way back still does.
    {
      applyId: 'apply-2',
      id: 'refero:two',
      name: 'Bold Ink',
      previous: { id: 'refero:one', name: 'Calm Paper' },
      undone: true
    }
  ]) {
    const tab = await ui.mountTab({ state: doors({ ...worn, last }) })
    const button = await openDefault(tab)
    assert.equal(button?.textContent, 'Back to template default')
    assert.equal(button?.disabled, false)
    await tab.unmount()
  }
})

test('a locked template still offers the way back', async () => {
  const locked = {
    ...BARE,
    supported: false,
    locked: true,
    reason: 'TEMPLATE_NOT_READY',
    worn: { id: null, slotId: 'refero:one', name: 'Calm Paper' },
    last: { applyId: 'apply-1', id: 'refero:one', name: 'Calm Paper', previous: null, undone: false }
  }
  const state = doors(locked)
  const plugin = await ui.mountPlugin({ state })
  const button = await openDefault(plugin)
  assert.equal(button?.disabled, false)
  await ui.fire(button)
  await ui.settle(10)
  assert.deepEqual(state.applies, ['template-default'])
  assert.equal(state.read.worn, null)
  await plugin.unmount()
})

test('a Try that is off does not wear the primary colour; its reason is a centred notice over the stage, not text beside the button', async () => {
  const reason = ui.t('ds.unsupported.TEMPLATE_HAS_NO_SLOT')
  const off = await ui.mountPreview({ props: { canTry: false, reason } })
  const button = ui.body().querySelector('[data-try-on="refero:one"]')
  assert.ok(button, 'the header still has the Try button')
  assert.equal(button.disabled, true)
  assert.match(button.className, /\bbg-secondary\b/, 'the secondary variant')
  assert.doesNotMatch(button.className, /\bbg-primary\b/, 'not the primary (terracotta) variant')
  // D3 (Akemi, 13/10/2026): the reason stands in the stage, over the preview, with an info icon; nothing beside the button.
  assert.equal(
    ui.body().querySelectorAll('[data-system-preview-reason]').length,
    0,
    'no reason text beside the button'
  )
  const notice = ui.body().querySelector('[data-system-preview-body] [data-stage-notice]')
  assert.ok(notice, 'the notice is rendered in the stage')
  assert.equal(notice.textContent, reason)
  assert.equal(notice.querySelectorAll('svg').length, 1, 'one info icon')
  await off.unmount()

  // A door that fails (not one that refuses: that refusal is its own notice, `preview-unavailable.test.mjs`).
  const failing = doors({})
  failing.preview = [502, { code: 'DS_PREVIEW_FAILED' }]
  const on = await ui.mountPreview({ state: failing, props: { canTry: true, reason: null } })
  const primary = ui.body().querySelector('[data-try-on="refero:one"]')
  assert.equal(primary.disabled, false)
  assert.match(primary.className, /\bbg-primary\b/, 'a Try that is on keeps the primary variant')
  assert.equal(ui.body().querySelectorAll('[data-stage-notice]').length, 0, 'no notice when Try is on')
  await on.unmount()
})

test('Back to template default takes the system off like a try: the bar says it, and its Undo brings the system back', async () => {
  // The rail's start-screen card re-reads on `tracy:design-system-changed` (dev 13/10/2026: it kept "Design system ·
  // Moxie" until a reload), so the way back says the change on the page.
  const worn = {
    ...BARE,
    worn: { id: null, slotId: 'refero:one', name: 'Calm Paper' },
    last: { applyId: 'apply-1', id: 'refero:one', name: 'Calm Paper', previous: null, undone: false }
  }
  const state = doors(worn)
  const said = []
  const hear = (e) => said.push(e.detail)
  ui.dom.window.addEventListener('tracy:design-system-changed', hear)
  const tab = await ui.mountPlugin({ state })
  await ui.fire(await openDefault(tab))
  await ui.settle(10)
  assert.deepEqual(
    state.applies,
    ['template-default'],
    'the apply door was pressed with the template default'
  )
  assert.deepEqual(state.undos, [], 'no undo: the way back is a write of its own')
  assert.equal(state.read.worn, null, 'the site wears the template look')
  assert.deepEqual(said, [{ siteKey: 'acme.localhost', applyId: 'apply-2', undone: false }])
  const bar = ui.body().querySelector('[data-try-bar]')
  assert.match(bar?.textContent ?? '', /Template default is on your site now/)
  await ui.fire(bar.querySelector('[data-try-bar-undo]'))
  await ui.settle(10)
  ui.dom.window.removeEventListener('tracy:design-system-changed', hear)
  assert.deepEqual(state.undos, ['apply-2'], 'Undo on the bar undoes the way back')
  assert.equal(state.read.worn?.name, 'Calm Paper', 'the system is back')
  await tab.unmount()
})
