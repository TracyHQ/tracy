/**
 * ST-2 — email sign-in from the first-run frame, one press in the browser.
 *
 * The app (fresh profile) types a new address on `/login?onboard=1`; the app opens a desktop round
 * and shows the waiting page (Setup frame, match code). The browser URL the app opens (captured, see
 * lib.mjs) is `/signin?n=…` with NO address in it. A browser with no session lands on the round's
 * code page for exactly that address, with the same match code, and nothing is mailed before the
 * person presses "Email me a code". The code from the mail, one press of "Verify and sign in to the
 * app" → the app leaves the waiting page signed in as that address, the first-run screen opens on
 * step 2 with step 1 marked done, and the browser holds a session for the same address.
 */
import {
  address,
  appSignedIn,
  appViewer,
  browserContext,
  chromeErrors,
  closeApp,
  launchApp,
  mailedCodes,
  overlayState,
  readCode,
  roundPage,
  runCase,
  sleep,
  standalone,
  submitForm,
  targetKind,
  typeEmailInApp,
  until,
  verifyCode,
  viewerOf,
  waitOpened
} from './lib.mjs'

export async function run(opts) {
  return runCase('ST-2', opts, async (c) => {
    const started = Date.now()
    const errors = []
    const typed = address(opts, 'st2')
    c.log(`typed address ${typed}`)
    const launched = await launchApp(opts, { errors })
    try {
      const { window } = launched
      await window.waitForURL((u) => u.pathname === '/login', { timeout: 45_000 })
      const waiting = await typeEmailInApp(window, typed)
      c.save('waiting.json', waiting)
      c.eq('app: the waiting page draws the Setup frame', waiting.setup, true)
      c.check('app: a match code shows', /\S/.test(waiting.code), waiting.code)
      await c.shot(window, 'app-waiting.png')

      const opened = await waitOpened(launched, (u) => u.includes('/signin?n='))
      c.check('app: opened the browser on /signin?n=', !!opened, await launched.opened())
      if (!opened) return
      const link = new URL(opened)
      c.eq('browser URL: no address on it', /@|email/i.test(decodeURIComponent(link.search)), false)

      const context = await browserContext(opts)
      const page = await context.newPage()
      await page.goto(opened, { waitUntil: 'domcontentloaded' })
      const send = await roundPage(page)
      c.save('browser-send.json', send)
      c.check('browser: the page names the typed address', send.text.includes(typed), send.text.slice(0, 400))
      c.check('browser: the same match code as the app', send.strong.includes(waiting.code), send.strong)
      c.check('browser: offers to email a code (one form)', send.sendCode === 1, send.sendCode)
      {
        await sleep(targetKind(opts.base) === 'stand' ? 1500 : 6000)
        c.eq('nothing mailed by the GET', mailedCodes(opts, typed, started).length, 0)
      }
      await c.shot(page, 'browser-send.png')

      const beforeSend = Date.now()
      await submitForm(page, '/signin/code')
      const step = await roundPage(page)
      c.save('browser-code.json', step)
      c.eq('browser: the code step (one field)', step.verify, true)
      const code = await readCode(opts, typed, beforeSend)
      c.check('a code was mailed to the typed address', !!code, code)
      if (!code) return
      await verifyCode(page, code)
      const done = await roundPage(page)
      c.save('browser-done.json', done)
      c.check('browser: one press approved (no separate Approve page)', !done.approve && !done.verify, done)
      await c.shot(page, 'browser-done.png')

      const landed = await appSignedIn(window, opts.base)
      c.check('app: left the waiting page for the product', !!landed, window.url())
      c.eq('app: signed in as the typed address', await appViewer(window, opts.base), typed)
      const overlay = await until(
        window,
        () => !!document.querySelector('[data-tracy-onboard]'),
        undefined,
        60_000
      )
      c.check('app: the first-run screen opens', !!overlay, window.url())
      const state = await overlayState(window)
      c.save('overlay.json', state)
      c.eq('first-run screen: opens on step 2', state?.step, 1)
      c.eq('first-run screen: step 1 marked done', state?.rail?.[0]?.done, true)
      await c.shot(window, 'app-overlay.png')

      c.eq('browser: holds a session for the same address', await viewerOf(page), typed)
      c.save(
        'chrome-errors.json',
        chromeErrors(`${Math.ceil((Date.now() - started) / 60000) + 1}m`, new URL(opts.base).host)
      )
    } finally {
      c.save('app-errors.json', errors)
      await closeApp(launched)
    }
  })
}

await standalone(import.meta.url, run)
