/**
 * ST-4 — the browser is already signed in as the address typed in the app: only Approve, no code.
 *
 * The browser (signed in as Y) opens the round's link: the ordinary Approve page naming Y, no
 * "Email me a code" form, no code field, nothing mailed to Y; pressing Approve signs the app in as Y.
 */
import {
  address,
  signedInSession,
  appSignedIn,
  appViewer,
  browserContext,
  closeApp,
  launchApp,
  mailedCodes,
  roundPage,
  runCase,
  session,
  standalone,
  submitForm,
  targetKind,
  typeEmailInApp,
  viewerOf,
  waitOpened
} from './lib.mjs'

export async function run(opts) {
  return runCase('ST-4', opts, async (c) => {
    const errors = []
    const stand = targetKind(opts.base) === 'stand'
    // Dev: Y signs in for real (mailed code) first, see ST-3.
    const s = stand
      ? await session(opts, { email: `ob2-${opts.runId}-st4@example.test`, role: 'owner' })
      : await signedInSession(opts, address(opts, 'st4'))
    const y = s.email
    c.log(`browser and typed account ${y} (${s.via})`)
    const started = Date.now()
    const launched = await launchApp(opts, { errors })
    try {
      const { window } = launched
      await window.waitForURL((u) => u.pathname === '/login', { timeout: 45_000 })
      await typeEmailInApp(window, y)
      const opened = await waitOpened(launched, (u) => u.includes('/signin?n='))
      c.check('app: opened the browser on /signin?n=', !!opened, await launched.opened())
      if (!opened) return
      const context = await browserContext(opts, s)
      const page = await context.newPage()
      await page.goto(opened, { waitUntil: 'domcontentloaded' })
      c.eq('browser: starts as Y', await viewerOf(page), y)
      const shown = await roundPage(page)
      c.save('browser.json', shown)
      c.eq('browser: the Approve page', shown.approve, true)
      c.eq('browser: it names Y', shown.approveEmail, y)
      c.eq('browser: no "Email me a code"', shown.sendCode, 0)
      c.eq('browser: no code field', shown.verify, false)
      await c.shot(page, 'browser-approve.png')
      await submitForm(page, '/signin/approve')
      c.save('browser-after-approve.json', await roundPage(page))
      await c.shot(page, 'browser-after-approve.png')
      c.check('app: signed in', !!(await appSignedIn(window, opts.base)), window.url())
      c.eq('app: as Y', await appViewer(window, opts.base), y)
      c.eq('nothing mailed to Y', mailedCodes(opts, y, started).length, 0)
    } finally {
      c.save('app-errors.json', errors)
      await closeApp(launched)
    }
  })
}

await standalone(import.meta.url, run)
