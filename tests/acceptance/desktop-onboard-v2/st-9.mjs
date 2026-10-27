/**
 * ST-9 — this app against a server WITHOUT this line's tracy-web (`--old-base`, e.g. the `oa` stand
 * built before it): the app still signs in as 0.5.1 did.
 *
 * A fresh profile (first run, so the app asks for `/login?onboard=1`): the old server ignores the
 * parameter and draws its plain page (no Setup frame, the email form posting `/login`); the email
 * code is typed in the app window itself, as before this line; the app lands on the product signed
 * in. Dev cannot run this case (dev already runs the new server): BLOCKED there.
 */
import { appViewer, Blocked, closeApp, launchApp, readCode, runCase, standalone, targetKind } from './lib.mjs'

export async function run(opts) {
  return runCase('ST-9', opts, async (c) => {
    if (targetKind(opts.base) === 'dev')
      throw new Blocked('dev runs the new server; ST-9 needs --old-base on a stand')
    if (!opts.oldBase) throw new Blocked('pass --old-base <a stand built before this line>')
    const old = opts.oldBase
    const typed = `ob2-${opts.runId}-st9@example.test`
    const errors = []
    const launched = await launchApp(opts, { base: old, errors })
    try {
      const { window } = launched
      await window.waitForURL((u) => u.pathname === '/login', { timeout: 45_000 })
      await window.waitForSelector('#email-form', { timeout: 30_000 })
      const shape = await window.evaluate(() => ({
        url: location.href,
        setup: !!document.querySelector('.setup'),
        action: document.querySelector('#email-form')?.getAttribute('action') ?? null,
        method: document.querySelector('#email-form')?.getAttribute('method') ?? null
      }))
      c.save('old-login.json', shape)
      c.log(`app asked for ${shape.url}`)
      c.eq('old server: no Setup frame', shape.setup, false)
      c.check(
        'old server: the plain email form (POST /login)',
        (shape.action ?? '').startsWith('/login') && shape.method === 'post',
        shape
      )

      const before = Date.now()
      await window.fill('#login-email', typed)
      await window.click('#email-form button[type="submit"]')
      await window.waitForSelector('#code-step:not([hidden])', { timeout: 30_000 })
      const code = await readCode(opts, typed, before, 30_000, old)
      c.check('old server: a code was mailed', !!code, code)
      if (!code) return
      // One digit per box (maxlength 1); the old page submits itself on the sixth.
      const slots = window.locator('#code-form .otp-slot')
      for (let i = 0; i < 6; i++) await slots.nth(i).fill(code[i])
      await window.waitForURL((u) => u.pathname !== '/login', { timeout: 60_000, waitUntil: 'commit' })
      c.eq('old server: the app is signed in as the typed address', await appViewer(window, old), typed)
      await c.shot(window, 'old-signed-in.png')
    } finally {
      c.save('app-errors.json', errors)
      await closeApp(launched)
    }
  })
}

await standalone(import.meta.url, run)
