/**
 * ACC-9 — the look survives a reload. In the app from source, step 2 "Appearance": Dark →
 * `body[data-ds-dark-theme]`; reload the page → still dark (dsh stored it); System → the attribute
 * follows `prefers-color-scheme`: emulated dark → present, emulated light → absent, and after a reload
 * it still follows the system (not a stored Dark or Light). The look is put back to System.
 */
import { launchApp, overlayShown, runCase, session, sleep, standalone, until } from './lib.mjs'

const dark = (w) => w.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))
const toStep2 = async (c, window) => {
  const shown = await overlayShown(window)
  if (!shown) return false
  await window.locator('[data-tracy-onboard] [data-rail-step="1"]').click()
  return !!(await until(
    window,
    () => document.querySelector('[data-tracy-onboard]')?.getAttribute('data-step-index') === '1',
    undefined,
    5000
  ))
}
/** Wait up to 8 s for the attribute to become `want`; answers the attribute as it then is. */
const settle = async (window, want) => {
  await until(window, (w) => document.body.hasAttribute('data-ds-dark-theme') === w || null, want, 8000)
  return dark(window)
}

export async function run(opts) {
  return runCase('ACC-9', opts, async (c) => {
    const s = await session(opts)
    const errors = []
    const { app, window } = await launchApp(opts, {
      s,
      path: '/new/',
      env: { TRACY_DESKTOP_ONBOARDING: 'again' },
      errors
    })
    try {
      c.check('the screen is on step 2', await toStep2(c, window), window.url())
      await window.emulateMedia({ colorScheme: 'light' })
      await window.locator('[data-tracy-onboard] [data-theme-pick="dark"]').click()
      c.eq('Dark sets body[data-ds-dark-theme]', await settle(window, true), true)
      await c.shot(window, 'dark.png')
      await window.reload({ waitUntil: 'domcontentloaded' })
      await until(window, () => !!document.body, undefined, 10_000)
      await sleep(3000)
      c.eq('after a reload (system light): still dark', await dark(window), true)
      await c.shot(window, 'dark-after-reload.png')

      c.check('back on step 2 after the reload', await toStep2(c, window), null)
      await window.locator('[data-tracy-onboard] [data-theme-pick="system"]').click()
      await sleep(600)
      const systemDark = await window.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)
      c.eq('System, system light → attribute matches prefers-color-scheme', await dark(window), systemDark)
      await window.emulateMedia({ colorScheme: 'dark' })
      c.eq('System, system turns dark → attribute present', await settle(window, true), true)
      await window.emulateMedia({ colorScheme: 'light' })
      c.eq('System, system turns light → attribute absent', await settle(window, false), false)
      await window.reload({ waitUntil: 'domcontentloaded' })
      await sleep(3000)
      await window.emulateMedia({ colorScheme: 'dark' })
      c.eq('System after a reload still follows the system (dark)', await settle(window, true), true)
      await window.emulateMedia({ colorScheme: 'light' })
      c.eq('System after a reload still follows the system (light)', await settle(window, false), false)
      await c.shot(window, 'system-light.png')
    } finally {
      c.save('console-errors.json', errors)
      await app.close()
    }
  })
}

await standalone(import.meta.url, 'ACC-9', run)
