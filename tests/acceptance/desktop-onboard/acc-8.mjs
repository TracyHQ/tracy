/**
 * ACC-8 — the device remembers the first-run screen. One profile, four launches of the app from
 * source:
 *   1. a fresh profile shows the screen; pick `copilot`, Continue, Continue, Done → preferences.json
 *      `onboarding` = { outcome: 'completed', picked: 'copilot', closedAt: <number> };
 *   2. relaunch with no variable → no screen (waited as long as launch 1 needed, plus 4 s);
 *   3. preferences.json deleted → relaunch → the screen again (a real first run, no variable);
 *   4. Skip, then Help › "Getting started" → the screen opens on the first step not done (the
 *      step whose rail row is not done; step 1 when all are), with the "Getting started" eyebrow.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  clickMenu,
  launchApp,
  overlayShown,
  readPrefs,
  runCase,
  session,
  sleep,
  standalone,
  until
} from './lib.mjs'

const PICK = 'copilot'

export async function run(opts) {
  return runCase('ACC-8', opts, async (c) => {
    const s = await session(opts)
    const errors = []
    let instance
    let profileDir

    // 1. First run → Done with copilot.
    {
      const t0 = Date.now()
      const launched = await launchApp(opts, { s, path: '/new/', errors })
      ;({ instance, profileDir } = launched)
      const { app, window } = launched
      try {
        const shown = await overlayShown(window)
        c.firstMs = Date.now() - t0
        c.check('1. a fresh profile shows the screen', shown === true, window.url())
        if (!shown) return
        // Cards move while the scan settles (found ones go first); pick once it has.
        await until(
          window,
          () => {
            const m = document
              .querySelector('[data-tracy-onboard] [data-step="account"]')
              ?.getAttribute('data-mode')
            return m && m !== 'looking' ? m : null
          },
          undefined,
          30_000
        )
        await sleep(500)
        const more = window.locator('[data-tracy-onboard] .tv-ob-disclosure[aria-expanded="false"]')
        if (
          !(await window.locator(`[data-tracy-onboard] [data-agent="${PICK}"]`).count()) &&
          (await more.count())
        )
          await more.first().click()
        await window.locator(`[data-tracy-onboard] [data-agent="${PICK}"]`).click()
        c.eq(
          `1. ${PICK} card pressed`,
          await window.locator(`[data-tracy-onboard] [data-agent="${PICK}"]`).getAttribute('aria-pressed'),
          'true'
        )
        for (let i = 0; i < 3; i++) {
          await window.locator('[data-tracy-onboard] [data-action="next"]').click()
          await sleep(400)
        }
        c.eq(
          '1. Done closes the screen',
          await until(window, () => !document.querySelector('[data-tracy-onboard]'), undefined, 10_000),
          true
        )
        let prefs = null
        for (let i = 0; i < 20 && prefs?.onboarding?.closedAt == null; i++) {
          prefs = readPrefs(profileDir)
          if (prefs?.onboarding?.closedAt == null) await sleep(250)
        }
        c.save('1-preferences.json', prefs)
        c.eq('1. preferences.json onboarding.outcome', prefs?.onboarding?.outcome, 'completed')
        c.eq('1. preferences.json onboarding.picked', prefs?.onboarding?.picked, PICK)
        c.eq(
          '1. preferences.json onboarding.closedAt is a number',
          typeof prefs?.onboarding?.closedAt,
          'number'
        )
      } finally {
        await app.close()
      }
    }

    // 2. Relaunch, no variable → nothing.
    {
      const { app, window } = await launchApp(opts, { s, instance, path: '/new/', errors })
      try {
        await sleep(Math.min(c.firstMs ?? 15_000, 45_000) + 4000)
        c.eq(
          '2. relaunch: no screen',
          await window.evaluate(() => !!document.querySelector('[data-tracy-onboard]')),
          false
        )
        await c.shot(window, '2-relaunch.png')
      } finally {
        await app.close()
      }
    }

    // 3. preferences.json gone → a real first run.
    rmSync(join(profileDir, 'preferences.json'), { force: true })
    c.log('3. deleted preferences.json')
    {
      const { app, window } = await launchApp(opts, { s, instance, path: '/new/', errors })
      try {
        const shown = await overlayShown(window)
        c.check('3. without preferences.json the screen shows again', shown === true, window.url())
        await c.shot(window, '3-first-run-again.png')

        // 4. Skip, then Help › Getting started → the first step not done.
        if (shown) {
          await window.locator('[data-tracy-onboard] [data-action="skip"]').click()
          await until(window, () => !document.querySelector('[data-tracy-onboard]'), undefined, 5000)
        }
        c.check(
          '4. Help › Getting started menu item clicked',
          await clickMenu(app, 'tracy-getting-started'),
          null
        )
        const back = await overlayShown(window, 15_000)
        c.check('4. Help › Getting started opens the screen', back === true, null)
        if (back) {
          await sleep(1500) // the panel waits for the data that says which steps are done
          const state = await window.evaluate(() => {
            const d = document.querySelector('[data-tracy-onboard]')
            const done = [...d.querySelectorAll('[data-rail-step]')].map(
              (e) => e.getAttribute('data-done') === 'true'
            )
            return {
              step: Number(d.getAttribute('data-step-index')),
              done,
              eyebrow: d.querySelector('.tv-ob-eyebrow')?.textContent.trim() ?? null
            }
          })
          // What "done" should be, from the sources the screen is defined on (flow.ts stepsDone):
          // an AI account connected (the status door), no look clicked in this opening, and
          // notifications supported and on (the bridge).
          const expected = await window.evaluate(async () => {
            const status = await fetch('/api/seat-plan/status')
              .then((r) => r.json())
              .catch(() => null)
            const n = await window.tracyDesktop.app.notifications.status()
            return [!!status?.connections?.some((x) => x.connected), false, n.supported && n.enabled]
          })
          c.save('4-reopened.json', { ...state, expected })
          c.eq(
            "4. the rail's done marks match the account, the look and the switch",
            JSON.stringify(state.done),
            JSON.stringify(expected)
          )
          const firstUndone = expected.indexOf(false) === -1 ? 0 : expected.indexOf(false)
          c.eq(
            `4. opens on the first step not done (done ${JSON.stringify(state.done)})`,
            state.step,
            firstUndone
          )
          c.eq('4. the eyebrow says Getting started', state.eyebrow, 'Getting started with Tracy Cowork')
          await c.shot(window, '4-help-reopened.png')
        }
      } finally {
        c.save('console-errors.json', errors)
        await app.close()
      }
    }
  })
}

await standalone(import.meta.url, 'ACC-8', run)
