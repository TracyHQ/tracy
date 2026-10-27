/**
 * A preview the door cannot make (`409 DS_PREVIEW_UNAVAILABLE`): the popup says WHY, as the centred notice over
 * the stage with the info icon (Akemi, 13/10/2026, D3), with the reason's own words — not a bare line in the frame
 * (measured 13/10/2026 on tracy.ai, a template without a slot: "A preview is not available for your site yet.",
 * no icon, no reason).
 *
 *   node --test packages/design/tracy-design-inspiration/test/preview-unavailable.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { doors, openTabDom } from './fixtures/design-system-tab-dom.mjs'

/** @type {Awaited<ReturnType<typeof openTabDom>>} */
let ui

before(async () => {
  ui = await openTabDom()
})
after(() => ui.restore())

/** The popup over a door that refuses the preview with `reason`, Try on itself still on. */
async function refused(reason) {
  const state = doors({})
  state.preview = [
    409,
    reason ? { code: 'DS_PREVIEW_UNAVAILABLE', reason } : { code: 'DS_PREVIEW_UNAVAILABLE' }
  ]
  const popup = await ui.mountPreview({ state, props: { canTry: true, reason: null } })
  await ui.settle()
  return popup
}

test('NO_SLOT: the stage notice says the template cannot wear a design system, with the icon; no bare paragraph', async () => {
  const popup = await refused('NO_SLOT')
  const dialog = ui.body().querySelector('[data-system-preview]')
  assert.equal(dialog?.getAttribute('data-preview-state'), 'unavailable')
  const notice = ui.body().querySelector('[data-system-preview-body] [data-stage-notice]')
  assert.ok(notice, 'the reason is the notice over the stage')
  assert.equal(notice.textContent, ui.t('ds.unsupported.TEMPLATE_HAS_NO_SLOT'))
  assert.equal(notice.querySelectorAll('svg').length, 1, 'one info icon')
  assert.equal(
    ui.body().querySelectorAll('[data-preview-unavailable]').length,
    0,
    'no bare line in the frame'
  )
  assert.equal(
    ui.body().querySelectorAll('[data-frame-loading][role="status"]').length,
    0,
    'the loader is down'
  )
  await popup.unmount()
})

test('PLATFORM, and a reason the popup does not know: the platform line, else the general one', async () => {
  const platform = await refused('PLATFORM')
  assert.equal(
    ui.body().querySelector('[data-stage-notice]')?.textContent,
    ui.t('ds.unsupported.PLATFORM_HAS_NO_SLOT')
  )
  await platform.unmount()
  const unknown = await refused('SOMETHING_NEW')
  assert.equal(ui.body().querySelector('[data-stage-notice]')?.textContent, ui.t('ds.preview.unavailable'))
  await unknown.unmount()
  const none = await refused(null)
  assert.equal(ui.body().querySelector('[data-stage-notice]')?.textContent, ui.t('ds.preview.unavailable'))
  await none.unmount()
})

test("Try on's own reason wins over the door's when both are there: one notice, never two", async () => {
  const state = doors({})
  state.preview = [409, { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'NO_SLOT' }]
  const viewer = ui.t('ds.viewer')
  const popup = await ui.mountPreview({ state, props: { canTry: false, reason: viewer } })
  await ui.settle()
  const notices = ui.body().querySelectorAll('[data-stage-notice]')
  assert.equal(notices.length, 1)
  assert.equal(notices[0].textContent, viewer)
  await popup.unmount()
})
