/**
 * ST-5 — Cancel on the waiting page, and the waiting page with the network gone.
 *
 * 1. Cancel → the app is back on `/login?onboard=1` (still the first-run frame). The cancelled round
 *    no longer signs the app in: the browser approving its link afterwards leaves the app signed out.
 * 2. A new round; the network of the app's session is switched off (Chromium network emulation, from
 *    the main process) while it waits: the waiting page (a local file) still shows the match code
 *    and Cancel after several failed polls. Network back on, Cancel → `/login?onboard=1` again.
 */
import {
  address,
  appViewer,
  browserContext,
  closeApp,
  launchApp,
  runCase,
  session,
  sleep,
  standalone,
  submitForm,
  targetKind,
  typeEmailInApp,
  waitOpened
} from './lib.mjs'

const offline = (app, on) =>
  app.evaluate(({ webContents }, value) => {
    for (const w of webContents.getAllWebContents())
      if (value) w.session.enableNetworkEmulation({ offline: true })
      else w.session.disableNetworkEmulation()
  }, on)

export async function run(opts) {
  return runCase('ST-5', opts, async (c) => {
    const errors = []
    const stand = targetKind(opts.base) === 'stand'
    const typed = stand ? `ob2-${opts.runId}-st5@example.test` : address(opts, 'st5')
    const launched = await launchApp(opts, { errors })
    try {
      const { app, window } = launched
      await window.waitForURL((u) => u.pathname === '/login', { timeout: 45_000 })

      // 1. Cancel.
      await typeEmailInApp(window, typed)
      const opened = await waitOpened(launched, (u) => u.includes('/signin?n='))
      c.check('round 1: browser link opened', !!opened, await launched.opened())
      await Promise.all([
        window.waitForURL((u) => u.pathname === '/login', { timeout: 30_000 }),
        window.click('#cancel')
      ])
      c.eq('Cancel: back on /login?onboard=1', new URL(window.url()).searchParams.get('onboard'), '1')
      c.eq(
        'Cancel: the Setup frame again',
        await window.evaluate(() => !!document.querySelector('.setup')),
        true
      )
      if (opened && stand) {
        // The person approves the cancelled round in the browser anyway: the app must stay out.
        const s = await session(opts, { email: typed })
        const context = await browserContext(opts, s)
        const page = await context.newPage()
        await page.goto(opened, { waitUntil: 'domcontentloaded' })
        const canApprove = await page.locator('form[action="/signin/approve"]').count()
        if (canApprove) await submitForm(page, '/signin/approve')
        c.log(`browser approved the cancelled round: ${canApprove ? 'yes' : 'no approve form'}`)
        await sleep(8000)
        c.eq('cancelled round: the app stayed on the sign-in page', new URL(window.url()).pathname, '/login')
        c.eq('cancelled round: the app has no session', await appViewer(window, opts.base), null)
      }

      // 2. Network gone while waiting.
      const waiting = await typeEmailInApp(window, typed)
      await offline(app, true)
      await sleep(10_000)
      const shown = await window.evaluate(() => ({
        file: location.protocol === 'file:',
        code: document.getElementById('code')?.textContent.trim() ?? '',
        cancel: !!document.getElementById('cancel') && document.getElementById('cancel').offsetParent !== null
      }))
      c.save('offline.json', { before: waiting, offline: shown })
      c.eq('offline: still the waiting page', shown.file, true)
      c.eq('offline: the same match code shows', shown.code, waiting.code)
      c.eq('offline: Cancel shows', shown.cancel, true)
      await c.shot(window, 'offline-waiting.png')
      await offline(app, false)
      await Promise.all([
        window.waitForURL((u) => u.pathname === '/login', { timeout: 30_000 }),
        window.click('#cancel')
      ])
      c.eq('offline then Cancel: /login?onboard=1', new URL(window.url()).searchParams.get('onboard'), '1')
    } finally {
      c.save('app-errors.json', errors)
      await closeApp(launched)
    }
  })
}

await standalone(import.meta.url, run)
