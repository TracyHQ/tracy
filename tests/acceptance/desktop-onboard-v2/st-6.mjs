/**
 * ST-6 — "Connect now" on the AI-account step turns the step done without closing the screen.
 *
 * The vendor is FAKED at the seat-plan doors (no vendor account exists on a stand): the app window's
 * requests to `POST /api/seat-plan/connect/start` answer a GitHub-Copilot-shaped device attempt,
 * `POST …/connect/complete` answers "pending" once and then the real status (read from the server)
 * with one Copilot connection added, and `GET …/status` answers that status from then on. Everything
 * else (the plugin, `@tracy/dsh-model-plan/connect`, the device poll, the rail) runs as shipped.
 *
 * Checks: the step starts not done; picking Copilot shows the connect panel (idle) with "Connect
 * now"; pressing it shows the device code; then the panel says connected, the step's chip says Done
 * and the rail marks step 2 done — while the first-run screen is still open.
 */
import {
  address,
  closeApp,
  jumpTo,
  launchSignedIn,
  overlayState,
  runCase,
  standalone,
  targetKind,
  until
} from './lib.mjs'

const USER_CODE = 'E2E-6061'

/** Observation only (no verdict): the "isn't on this computer" notice and the vendor tiles. */
function notInstalledNotice(window) {
  return window.evaluate(() => {
    const dialog = document.querySelector('[data-tracy-onboard]')
    if (!dialog) return null
    const notice = [...dialog.querySelectorAll('div, p, section')].find(
      (el) => /isn.t on this computer/i.test(el.textContent) && el.children.length < 6
    )
    return {
      notice: notice
        ? { text: notice.textContent.replace(/\s+/g, ' ').trim(), html: notice.outerHTML.slice(0, 600) }
        : null,
      tiles: [...dialog.querySelectorAll('[data-agent]')].map((t) => ({
        agent: t.getAttribute('data-agent'),
        pressed: t.getAttribute('aria-pressed'),
        attrs: [...t.attributes]
          .map((a) => `${a.name}=${a.value}`)
          .join(' ')
          .slice(0, 300),
        text: t.textContent.replace(/\s+/g, ' ').trim()
      })),
      connect: dialog.querySelector('[data-connect]')?.getAttribute('data-connect') ?? null,
      connectText: dialog.querySelector('[data-connect]')?.textContent.replace(/\s+/g, ' ').trim() ?? null
    }
  })
}

export async function run(opts) {
  return runCase('ST-6', opts, async (c) => {
    const errors = []
    const stand = targetKind(opts.base) === 'stand'
    const launched = await launchSignedIn(opts, c, {
      email: stand ? `ob2-${opts.runId}-st6@example.test` : address(opts, 'st6'),
      errors
    })
    try {
      const { window } = launched
      let connected = false
      let completes = 0
      const withCopilot = (status) => ({
        ...status,
        connections: [
          ...(status.connections ?? []),
          {
            connectionId: 'e2e-st6',
            provider: 'copilot',
            name: 'GitHub Copilot',
            account: 'e2e-octocat',
            connected: true
          }
        ]
      })
      let real = null
      await window.route('**/api/seat-plan/connect/start', (route) =>
        route.fulfill({
          json: {
            signIn: 'device',
            attemptId: 'e2e-st6',
            state: 'e2e-st6',
            userCode: USER_CODE,
            authorizeUrl: 'https://github.com/login/device',
            intervalMs: 1000
          }
        })
      )
      await window.route('**/api/seat-plan/connect/complete', async (route) => {
        completes++
        if (completes < 2) return route.fulfill({ json: { pending: true, intervalMs: 1000 } })
        connected = true
        return route.fulfill({ json: withCopilot(real) })
      })
      await window.route('**/api/seat-plan/status', async (route) => {
        const response = await route.fetch()
        real = await response.json()
        return route.fulfill({ response, json: connected ? withCopilot(real) : real })
      })
      // The status the screen read before the routes were in place is the real one; reload so the
      // screen reads it through the route (`real` must be known before connect/complete answers).
      await window.reload()
      await until(window, () => !!document.querySelector('[data-tracy-onboard]'), undefined, 90_000)
      await jumpTo(window, 1)
      c.check(
        'control: the real seat-plan status answered for this account (no refusal)',
        !!real && Array.isArray(real.connections),
        real
      )
      const before = await overlayState(window)
      c.save('before.json', before)
      c.eq('before: AI-account step not done', before?.chipDone, false)

      const more = window.locator('[data-tracy-onboard] .tv-ob-disclosure')
      if (!(await window.locator('[data-agent="copilot"]').count()) && (await more.count()))
        await more.click()
      await window.click('[data-tracy-onboard] [data-agent="copilot"]')
      const idle = await until(
        window,
        () => !!document.querySelector('[data-connect="idle"] [data-action="connect"]'),
        undefined,
        10_000
      )
      c.check(
        'picked Copilot: "Connect now" in the panel',
        !!idle,
        await window.evaluate(
          () => document.querySelector('.tv-ob-connect, [data-connect]')?.outerHTML?.slice(0, 300) ?? null
        )
      )
      await c.shot(window, 'idle.png')
      c.save('notice-idle.json', await notInstalledNotice(window))
      await window.click('[data-connect="idle"] [data-action="connect"]')
      const code = await until(
        window,
        (u) => document.querySelector('[data-tracy-onboard]')?.textContent.includes(u),
        USER_CODE,
        10_000
      )
      c.check('device code shows', !!code, null)
      await c.shot(window, 'device.png')
      const done = await until(
        window,
        () => !!document.querySelector('[data-connect="connected"]'),
        undefined,
        20_000
      )
      c.check(
        'panel: connected',
        !!done,
        await window.evaluate(
          () => document.querySelector('[data-connect]')?.getAttribute('data-connect') ?? null
        )
      )
      const after = await overlayState(window)
      c.save('after.json', { after, completes })
      c.eq('after: still on the AI-account step (screen not closed)', after?.step, 1)
      c.eq('after: the chip says Done', after?.chipDone, true)
      c.eq('after: the rail marks step 2 done', after?.rail?.[1]?.done, true)
      await c.shot(window, 'connected.png')
      c.save('notice-connected.json', await notInstalledNotice(window))
      // The same vendor already connected when the screen opens (the status says so from the start).
      await window.reload()
      await until(window, () => !!document.querySelector('[data-tracy-onboard]'), undefined, 90_000)
      await jumpTo(window, 1)
      await window.waitForTimeout(3000)
      c.save('notice-reopened.json', {
        overlay: await overlayState(window),
        ...(await notInstalledNotice(window))
      })
      await c.shot(window, 'reopened.png')
    } finally {
      c.save('app-errors.json', errors)
      await closeApp(launched)
    }
  })
}

await standalone(import.meta.url, run)
