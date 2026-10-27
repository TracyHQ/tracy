/**
 * ST-1 — first run draws the sign-in inside the Setup frame; an old user and the web do not.
 *
 * 1. The app from source in a FRESH profile (a real first run, no switch) lands on
 *    `/login?onboard=1`: the Setup frame (`.setup`), four rail steps, step 1 current, steps 2–4
 *    disabled, no Skip and no Continue, the email form going to `GET /signin/email`.
 * 2. The same app after the first-run screen was closed (`preferences.json` `onboarding.closedAt`,
 *    written while the app is shut) lands on `/login` WITHOUT `onboard` and without the frame.
 * 3. A plain browser on `/login` (no app): no frame, the classic `POST /login` form.
 */
import { browserContext, closeApp, launchApp, runCase, standalone } from './lib.mjs'

/** What the sign-in page shows, read from inside it. */
const loginShape = () => ({
  url: location.href,
  setup: !!document.querySelector('.setup'),
  steps: [...document.querySelectorAll('.setup-rail button.setup-step')].map((b) => ({
    current: b.getAttribute('aria-current') === 'step',
    disabled: b.disabled,
    text: b.textContent.trim()
  })),
  emailAction: document.querySelector('#email-form')?.getAttribute('action') ?? null,
  emailMethod: document.querySelector('#email-form')?.getAttribute('method') ?? null,
  google: !!document.querySelector('form[action^="/signin/google"]'),
  skipOrContinue: [...document.querySelectorAll('button, a')].some((el) =>
    /^(skip|continue)$/i.test(el.textContent.trim())
  ),
  postLogin: !!document.querySelector(
    'form[action="/login"][method="post" i], form[method="post" i][action="/login"]'
  )
})

export async function run(opts) {
  return runCase('ST-1', opts, async (c) => {
    const errors = []
    // 1. First run.
    const first = await launchApp(opts, { errors })
    let profileDir
    try {
      profileDir = first.profileDir
      await first.window.waitForURL((u) => u.pathname === '/login', { timeout: 45_000 })
      await first.window.waitForSelector('.setup, #email-form, form', { timeout: 30_000 })
      const shape = await first.window.evaluate(loginShape)
      c.save('first-run.json', shape)
      c.eq('first run: the URL carries onboard=1', new URL(shape.url).searchParams.get('onboard'), '1')
      c.eq('first run: the Setup frame is drawn', shape.setup, true)
      c.eq('first run: four steps in the rail', shape.steps.length, 4)
      c.check(
        'first run: step 1 is current and enabled',
        shape.steps[0]?.current && !shape.steps[0]?.disabled,
        shape.steps[0]
      )
      c.check(
        'first run: steps 2–4 are disabled',
        shape.steps.slice(1).every((s) => s.disabled && !s.current),
        shape.steps.slice(1)
      )
      c.eq('first run: no Skip / Continue', shape.skipOrContinue, false)
      c.eq('first run: the email form goes to /signin/email', shape.emailAction, '/signin/email')
      c.eq('first run: by GET', (shape.emailMethod ?? '').toLowerCase(), 'get')
      c.log(
        `first run: Google button ${shape.google ? 'present' : 'absent (no Google OAuth on this target)'}`
      )
      await c.shot(first.window, 'first-run.png')
    } finally {
      await closeApp(first)
    }

    // 2. The same profile, first-run screen closed.
    const prefs = first.readPrefs() ?? {}
    prefs.onboarding = { flowVersion: 1, closedAt: Date.now(), outcome: 'completed', picked: null }
    first.writePrefs(prefs)
    const again = await launchApp(opts, { errors, instance: first.instance })
    try {
      c.eq('old user: same profile reused', again.profileDir, profileDir)
      await again.window.waitForURL((u) => u.pathname === '/login', { timeout: 45_000 })
      await again.window.waitForSelector('form', { timeout: 30_000 })
      const shape = await again.window.evaluate(loginShape)
      c.save('old-user.json', shape)
      c.eq('old user: no onboard on the URL', new URL(shape.url).searchParams.has('onboard'), false)
      c.eq('old user: no Setup frame', shape.setup, false)
    } finally {
      await closeApp(again)
    }

    // 3. The web.
    const context = await browserContext(opts)
    const page = await context.newPage()
    await page.goto(`${opts.base}/login`, { waitUntil: 'domcontentloaded' })
    const web = await page.evaluate(loginShape)
    c.save('web.json', web)
    c.eq('web: no Setup frame', web.setup, false)
    c.eq('web: the classic email form (no /signin/email)', web.emailAction === '/signin/email', false)
    c.save('app-errors.json', errors)
  })
}

await standalone(import.meta.url, run)
