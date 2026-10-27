#!/usr/bin/env node
/**
 * Every `tracy-mysites` dialog stays inside a 360px viewport, light and dark: the popup, its Close
 * and the gutter tracy-ui's DialogContent draws (`max-w-[calc(100%-2rem)]`).
 *
 * The same bug as the Backup dialogs (QA-I15, fixed in site-tabs by dba4b5960), suspected here in
 * the night handover of 03/10 and measured by this test before the fix: two causes, both mode B.
 *   - The plugin's border-box rule covered `.tracy-mysites *` but not the root, and a dialog popup
 *     carries `tracy-mysites` itself, so tracy-ui's `w-full p-4 border` was content-box.
 *   - `max-w-md` / `max-w-lg` on DialogContent replaced (tailwind-merge) tracy-ui's
 *     `max-w-[calc(100%-2rem)]`, so the 1rem gutter was gone too.
 *
 * Fixture: `../fixtures/dialogs-entry.tsx` (the real dialogs, the plugin's real stylesheet), on
 * dsh's React (18, `dshReact`).
 *
 * Export site as ZIP is no longer a dialog (23/10/2026): it is the ZIP step of the site's Publish
 * tab, and its stages are pinned by `packages/core/tracy-core/test/publish-sync-zip-dom.test.mjs`.
 * Harness rules as in `table-fits-panel.test.mjs`: a missing dependency or browser FAILS.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { openHarness } from '../fixtures/open-harness.mjs'

const DIALOGS = ['role', 'revoke', 'invite', 'leave', 'delete']

let h

before(async () => {
  h = await openHarness('tms-dialogs-360-', 'dialogs-entry.tsx', { dshReact: true })
})

after(async () => {
  await h?.close()
})

for (const dark of [false, true]) {
  test(`at 360px${dark ? ', dark' : ''}: every My Sites / Team dialog and its Close stay inside the viewport`, async () => {
    const page = await h.browser.newPage({ viewport: { width: 360, height: 800 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const failures = []
    for (const name of DIALOGS) {
      await page.goto(`${h.base}/?dialog=${name}${dark ? '&dark=1' : ''}`)
      await page.waitForSelector('[role=dialog] [data-slot="dialog-close"]', { timeout: 8000 })
      // The open animation scales from 95%: measure once it has settled.
      await page.waitForFunction(() => {
        const d = document.querySelector('[role=dialog]')
        return d && d.getAnimations().every((a) => a.playState !== 'running')
      })
      const geo = await page.evaluate(() => {
        const d = document.querySelector('[role=dialog]')
        const box = (el) => {
          const b = el.getBoundingClientRect()
          return { left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10 }
        }
        return {
          vw: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          dialog: box(d),
          close: box(d.querySelector('[data-slot="dialog-close"]'))
        }
      })
      if (geo.scroll !== geo.vw) failures.push(`${name}: page scrolls ${geo.scroll - geo.vw}px sideways`)
      for (const [part, b] of Object.entries({ dialog: geo.dialog, close: geo.close })) {
        if (b.left < 0 || b.right > geo.vw)
          failures.push(`${name}: ${part} outside the viewport ${JSON.stringify(b)}`)
      }
      // The 1rem gutter on each side survives the dialog's own width.
      if (geo.dialog.left < 15.5 || geo.vw - geo.dialog.right < 15.5)
        failures.push(`${name}: no 16px gutter ${JSON.stringify(geo.dialog)}`)
    }
    assert.deepEqual(failures, [])
    assert.deepEqual(errors, [], 'no uncaught errors in the page')
    await page.close()
  })
}

test('at 1280px the dialogs keep their own width (sm:max-w-*), not the narrow-screen one', async () => {
  const page = await h.browser.newPage({ viewport: { width: 1280, height: 800 } })
  const widths = {}
  for (const name of DIALOGS) {
    await page.goto(`${h.base}/?dialog=${name}`)
    await page.waitForSelector('[role=dialog]', { timeout: 8000 })
    await page.waitForFunction(() =>
      document
        .querySelector('[role=dialog]')
        .getAnimations()
        .every((a) => a.playState !== 'running')
    )
    widths[name] = await page.evaluate(() =>
      Math.round(document.querySelector('[role=dialog]').getBoundingClientRect().width)
    )
  }
  // sm:max-w-md is 28rem (448px). Before the fix `max-w-md` lost to tracy-ui's `sm:max-w-sm` above
  // 640px: every dialog was 384px plus a content-box 34. The invite wizard is layout D3's 560px
  // (Akemi 04/10), set by the site tabs' scoped rule, not by a Tailwind class; Change role shares
  // the wizard's role rows and its 560px since ADR 0028 (approved 08/10).
  assert.deepEqual(widths, { role: 560, revoke: 448, invite: 560, leave: 448, delete: 448 })
  await page.close()
})
