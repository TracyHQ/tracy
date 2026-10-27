/**
 * ST-8 — the Notifications step follows the macOS permission (faked, see fake-notify-addon.cjs).
 *
 *   denied  → the yellow "macOS is blocking" card with the System Settings button, the sound picker
 *             and "Send a test" disabled with the reason under them, the step not done. Then the
 *             permission turns to allowed and the window gains focus (as when the person comes back
 *             from System Settings): the card goes, the step becomes done — no reload.
 *   allowed → "Send a test" works and the status line says "sent at …" (`data-status="sent"`).
 *   unknown → the switch is on and the card says Tracy can't read the permission (the prompt line).
 */
import {
  closeApp,
  jumpTo,
  launchSignedIn,
  overlayState,
  runCase,
  standalone,
  targetKind,
  until
} from './lib.mjs'

const notifyView = () => {
  const root = document.querySelector('[data-tracy-onboard] [data-step="notifications"]')
  return root
    ? {
        card: root.querySelector('[data-notify]')?.getAttribute('data-notify') ?? null,
        cardText: root.querySelector('[data-notify]')?.textContent.trim() ?? null,
        settingsButton: !!root.querySelector('[data-notify="blocked"] button'),
        soundDisabled: root.querySelector('[data-action="sound"]')?.disabled ?? null,
        testDisabled: root.querySelector('[data-action="send-test"]')?.disabled ?? null,
        lockedWhy: root.querySelector('.tv-ob-locked-why')?.textContent.trim() ?? null,
        switchOn: root.querySelector('[data-action="notify"]')?.getAttribute('aria-checked') === 'true',
        status: root.querySelector('[data-status]')?.getAttribute('data-status') ?? null,
        statusText: root.querySelector('[data-status]')?.textContent.trim() ?? null
      }
    : null
}

async function open(c, opts, tag, permission) {
  const stand = targetKind(opts.base) === 'stand'
  const errors = []
  const launched = await launchSignedIn(opts, c, {
    email: stand ? `ob2-${opts.runId}-st8${tag}@example.test` : null,
    permission,
    errors
  })
  await jumpTo(launched.window, 3)
  await until(
    launched.window,
    () => !!document.querySelector('[data-step="notifications"] [data-notify]'),
    undefined,
    15_000
  )
  return { launched, errors }
}

export async function run(opts) {
  return runCase('ST-8', opts, async (c) => {
    // denied, then allowed.
    const d = await open(c, opts, 'denied', 'denied')
    try {
      const { app, window } = d.launched
      const view = await window.evaluate(notifyView)
      const state = await overlayState(window)
      c.save('denied.json', { view, state })
      c.eq('denied: the blocked card', view?.card, 'blocked')
      c.eq('denied: it has the System Settings button', view?.settingsButton, true)
      c.eq('denied: the sound picker is disabled', view?.soundDisabled, true)
      c.eq('denied: "Send a test" is disabled', view?.testDisabled, true)
      c.check('denied: the reason is written', !!view?.lockedWhy, view?.lockedWhy)
      c.eq('denied: the step is not done', state?.chipDone, false)
      c.eq('denied: the rail does not mark it', state?.rail?.[3]?.done, false)
      await c.shot(window, 'denied.png')

      d.launched.setPermission('allowed')
      await app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.emit('focus')
      })
      const cleared = await until(
        window,
        () =>
          document.querySelector('[data-step="notifications"] [data-notify]')?.getAttribute('data-notify') ===
          'on',
        undefined,
        10_000
      )
      const after = await window.evaluate(notifyView)
      const afterState = await overlayState(window)
      c.save('denied-then-allowed.json', { view: after, state: afterState })
      c.check('back from Settings (allowed + focus): the card turns on without a reload', !!cleared, after)
      c.eq('back from Settings: "Send a test" enabled', after?.testDisabled, false)
      c.eq('back from Settings: the step is done', afterState?.chipDone, true)
    } finally {
      c.save('denied-errors.json', d.errors)
      await closeApp(d.launched)
    }

    // allowed: a test is sent.
    const a = await open(c, opts, 'allowed', 'allowed')
    try {
      const { window } = a.launched
      const before = await window.evaluate(notifyView)
      c.eq('allowed: the card is on', before?.card, 'on')
      await window.click('[data-step="notifications"] [data-action="send-test"]')
      const sent = await until(
        window,
        () =>
          document.querySelector('[data-step="notifications"] [data-status]')?.getAttribute('data-status') ===
          'sent',
        undefined,
        20_000
      )
      const view = await window.evaluate(notifyView)
      c.save('allowed.json', { before, view })
      c.check('allowed: the status says sent', !!sent, view)
      c.check('allowed: "sent at <time>"', /\d{1,2}[:.]\d{2}/.test(view?.statusText ?? ''), view?.statusText)
      await c.shot(window, 'allowed-sent.png')
    } finally {
      c.save('allowed-errors.json', a.errors)
      await closeApp(a.launched)
    }

    // unknown: the prompt line.
    const u = await open(c, opts, 'unknown', 'unknown')
    try {
      const { window } = u.launched
      const view = await window.evaluate(notifyView)
      const state = await overlayState(window)
      c.save('unknown.json', { view, state })
      c.eq('unknown: the switch is on', view?.switchOn, true)
      c.eq('unknown: the card is on (not blocked)', view?.card, 'on')
      c.check(
        "unknown: the card says Tracy can't read the permission",
        /can.t read/i.test(view?.cardText ?? ''),
        view?.cardText
      )
      await c.shot(window, 'unknown.png')
    } finally {
      c.save('unknown-errors.json', u.errors)
      await closeApp(u.launched)
    }
  })
}

await standalone(import.meta.url, run)
