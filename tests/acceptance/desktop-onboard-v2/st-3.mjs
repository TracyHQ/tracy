/**
 * ST-3 — the browser is signed in as X, the app typed Y: the browser asks, never approves silently.
 *
 * Branch "Use Y": the page names both addresses; pressing "Use Y" mails a code to Y while the
 * browser STAYS signed in as X (council (b): no sign-out before Y is proven); the code → the app is
 * signed in as Y and the browser's session becomes Y.
 * Branch "Use X": a second round typing another address Y2; pressing "Use X" leads to the ordinary
 * Approve page naming X (the form posts `email=X`), nothing is mailed to Y2, and the app is signed in
 * as X.
 */
import {
  address,
  appSignedIn,
  appViewer,
  browserContext,
  closeApp,
  launchApp,
  mailedCodes,
  readCode,
  roundPage,
  runCase,
  session,
  signedInSession,
  standalone,
  submitForm,
  targetKind,
  typeEmailInApp,
  verifyCode,
  viewerOf,
  waitOpened
} from './lib.mjs'

/** One app round typed with `typed`, the browser (signed in as `s`) on its link: [launched, page]. */
async function round(c, opts, typed, s, tag, errors) {
  const launched = await launchApp(opts, { errors })
  const { window } = launched
  await window.waitForURL((u) => u.pathname === '/login', { timeout: 45_000 })
  await typeEmailInApp(window, typed)
  const opened = await waitOpened(launched, (u) => u.includes('/signin?n='))
  if (!opened) throw new Error(`${tag}: the app opened no browser link`)
  const context = await browserContext(opts, s)
  const page = await context.newPage()
  await page.goto(opened, { waitUntil: 'domcontentloaded' })
  c.eq(`${tag}: the browser starts as X`, await viewerOf(page), s.email)
  return { launched, page }
}

export async function run(opts) {
  return runCase('ST-3', opts, async (c) => {
    const errors = []
    const stand = targetKind(opts.base) === 'stand'
    // Dev: X signs in for real (mailed code) on an address the run owns; a minted cookie has no
    // account row, and dev's beta gate refuses such an address at the app's session exchange.
    const s = stand
      ? await session(opts, { email: `ob2-${opts.runId}-st3x@example.test`, role: 'owner' })
      : await signedInSession(opts, address(opts, 'st3-x'))
    const x = s.email
    c.log(`browser account X ${x} (${s.via})`)

    // Branch "Use Y".
    const y = address(opts, 'st3-y')
    const a = await round(c, opts, y, s, 'use Y', errors)
    try {
      const ask = await roundPage(a.page)
      c.save('use-y-ask.json', ask)
      c.check('use Y: the page names X', ask.text.includes(x), ask.text.slice(0, 400))
      c.check('use Y: the page names Y', ask.text.includes(y), ask.text.slice(0, 400))
      c.check('use Y: offers both choices', ask.sendCode === 1 && ask.useSession, ask)
      await c.shot(a.page, 'use-y-ask.png')
      const before = Date.now()
      await submitForm(a.page, '/signin/code')
      const step = await roundPage(a.page)
      c.eq('use Y: the code step', step.verify, true)
      c.eq('use Y: the browser is STILL X before Y is proven', await viewerOf(a.page), x)
      const code = await readCode(opts, y, before)
      c.check('use Y: a code went to Y', !!code, code)
      if (code) {
        await verifyCode(a.page, code)
        c.check(
          'use Y: app signed in',
          !!(await appSignedIn(a.launched.window, opts.base)),
          a.launched.window.url()
        )
        c.eq('use Y: the app is Y', await appViewer(a.launched.window, opts.base), y)
        c.save(
          'use-y-browser-cookies.json',
          (await a.page.context().cookies()).map(({ name, domain, path }) => ({ name, domain, path }))
        )
        c.eq('use Y: the browser became Y', await viewerOf(a.page), y)
      }
    } finally {
      await closeApp(a.launched)
    }

    // Branch "Use X".
    const y2 = address(opts, 'st3-y2')
    const started = Date.now()
    const b = await round(c, opts, y2, s, 'use X', errors)
    try {
      await submitForm(b.page, '/signin')
      const confirm = await roundPage(b.page)
      c.save('use-x-confirm.json', confirm)
      c.eq('use X: the ordinary Approve page', confirm.approve, true)
      c.eq('use X: the Approve form names X', confirm.approveEmail, x)
      await c.shot(b.page, 'use-x-confirm.png')
      await submitForm(b.page, '/signin/approve')
      c.check(
        'use X: app signed in',
        !!(await appSignedIn(b.launched.window, opts.base)),
        b.launched.window.url()
      )
      c.eq('use X: the app is X', await appViewer(b.launched.window, opts.base), x)
      c.eq('use X: nothing mailed to Y2', mailedCodes(opts, y2, started).length, 0)
    } finally {
      await closeApp(b.launched)
    }
    c.save('app-errors.json', errors)
  })
}

await standalone(import.meta.url, run)
