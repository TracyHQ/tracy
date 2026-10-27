/**
 * ACC-7 — a notification when the agent's turn ends. The main process decides; the case reads its
 * decisions. Two parts:
 *
 *   A. The bridge (always): with the app hidden behind other apps, `turnFinished` for a new turn →
 *      `shown` (and `lastShownAt` moves); the same turn reported from a SECOND window (File › New
 *      Window, the real menu item) → `duplicate`; with a window focused, a new turn →
 *      `suppressed-focus`; with the Desktop switch off → `off`. The switch is put back.
 *   B. A real turn (`--chat --site <siteKey>`): one short prompt typed in window 1, window 2 opens the
 *      same chat, the app is hidden; the decisions the main process took for that turn (recorded by
 *      wrapping the bridge's IPC handler from the main process) must hold exactly one `shown`, any
 *      other window's report being `duplicate`.
 *
 * Focusing a window takes the keyboard from whatever app is in front for a moment (part A, one call).
 */
import { randomBytes } from 'node:crypto'
import {
  Blocked,
  launchApp,
  overlayShown,
  runCase,
  session,
  sleep,
  standalone,
  until,
  watchErrors
} from './lib.mjs'

const CHANNEL = 'tracy-desktop:notify-turn-finished'
const GAP = 3500 // the bridge shows at most one notification per 3 s

const anyFocused = (app) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isFocused()))
const hideApp = (app) =>
  app.evaluate(({ app: a, BrowserWindow }) => {
    if (process.platform === 'darwin') a.hide()
    else for (const w of BrowserWindow.getAllWindows()) w.minimize()
  })
const focusApp = (app) =>
  app.evaluate(({ app: a, BrowserWindow }) => {
    if (process.platform === 'darwin') a.focus({ steal: true })
    const w = BrowserWindow.getAllWindows().find((x) => x.isVisible()) ?? BrowserWindow.getAllWindows()[0]
    w.show()
    w.focus()
  })
const report = (page, input) =>
  page.evaluate((i) => window.tracyDesktop.app.notifications.turnFinished(i), input)

/** Wrap the bridge's handler in the main process so every decision is recorded. */
const recordDecisions = (app) =>
  app.evaluate(({ ipcMain }, channel) => {
    const map = ipcMain._invokeHandlers
    const handler = map?.get?.(channel)
    if (!handler) return false
    globalThis.__accDecisions = []
    map.set(channel, async (event, ...args) => {
      const out = await handler(event, ...args)
      const i = args[0] ?? {}
      globalThis.__accDecisions.push({
        at: Date.now(),
        sender: event.sender.id,
        sessionId: i.sessionId,
        turnId: i.turnId,
        outcome: i.outcome,
        decision: out?.decision
      })
      return out
    })
    return true
  }, CHANNEL)
const decisions = (app) => app.evaluate(() => globalThis.__accDecisions ?? [])

/** Open a second product window through File › New Window and wait until its bridge answers. */
async function secondWindow(app, first) {
  const clicked = await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('tracy-new-window')
    if (!item) return false
    item.click()
    return true
  })
  if (!clicked) return null
  // The window may be a new one or the pre-painted spare (src/window-pool.js), which already exists:
  // look for a visible product page other than the first.
  const end = Date.now() + 45_000
  while (Date.now() < end) {
    for (const page of app.windows()) {
      if (page === first) continue
      const ok = await page
        .evaluate(
          () => document.visibilityState === 'visible' && window.tracyDesktop?.app?.protocolVersion >= 2
        )
        .catch(() => false)
      if (ok) return page
    }
    await sleep(500)
  }
  return null
}

export async function run(opts) {
  return runCase('ACC-7', opts, async (c) => {
    const s = await session(opts)
    const errors = []
    const { app, window } = await launchApp(opts, { s, path: '/new/', errors })
    try {
      if (await overlayShown(window, 30_000))
        await window.locator('[data-tracy-onboard] [data-action="skip"]').click()
      const n = window.evaluate.bind(window)
      const original = await n(() => window.tracyDesktop.app.notifications.status())
      c.save('status-initial.json', original)
      c.check('notifications are supported on this computer', original.supported === true, original)
      if (!original.enabled) await n(() => window.tracyDesktop.app.notifications.setEnabled(true))
      const recording = await recordDecisions(app)
      c.log(`decision recorder installed: ${recording}`)

      // A. The bridge.
      const w2 = await secondWindow(app, window)
      c.check('A. File › New Window opened a second product window', !!w2, null)
      if (w2) watchErrors(w2, errors, 'window-2')
      const sessionId = `acc7-${randomBytes(4).toString('hex')}`
      const turn = (k) => ({
        sessionId,
        turnId: `${k}@${Date.now()}`,
        outcome: 'completed',
        title: 'ACC-7',
        body: `turn ${k}`
      })

      await hideApp(app)
      await sleep(800)
      c.eq('A. no window is focused after hiding the app', await anyFocused(app), false)
      const t1 = turn('t1')
      const before = (await n(() => window.tracyDesktop.app.notifications.status())).lastShownAt
      const r1 = await report(window, t1)
      c.eq('A. a new turn, app behind → decision', r1?.decision, 'shown')
      const after = (await n(() => window.tracyDesktop.app.notifications.status())).lastShownAt
      c.check('A. lastShownAt moved', typeof after === 'number' && after !== before, { before, after })
      if (w2)
        c.eq(
          'A. the same turn from the second window → decision',
          (await report(w2, t1))?.decision,
          'duplicate'
        )
      c.eq(
        'A. the same turn again from window 1 → decision',
        (await report(window, t1))?.decision,
        'duplicate'
      )

      await sleep(GAP)
      await focusApp(app)
      await sleep(500)
      const focused = await anyFocused(app)
      c.log(`A. focused after focusApp: ${focused}`)
      if (focused)
        c.eq(
          'A. a new turn while a Tracy window is focused → decision',
          (await report(window, turn('t2')))?.decision,
          'suppressed-focus'
        )
      else c.block('A. this session could not bring a Tracy window to the front; suppressed-focus NOT RUN')
      await hideApp(app)

      await sleep(GAP)
      await n(() => window.tracyDesktop.app.notifications.setEnabled(false))
      c.eq(
        'A. a new turn with the Desktop switch off → decision',
        (await report(window, turn('t3')))?.decision,
        'off'
      )
      await n((on) => window.tracyDesktop.app.notifications.setEnabled(on), true)
      c.save('A-decisions.json', await decisions(app))

      // B. A real turn.
      if (!opts.chat || !opts.site) {
        c.needsPerson(
          'a real turn: rerun with --chat --site <siteKey> (one short prompt) to see one `shown` for a real agent turn'
        )
      } else if (!recording) {
        c.block(
          'B. the bridge handler could not be wrapped in this Electron (ipcMain._invokeHandlers); the real-turn decisions cannot be read'
        )
      } else {
        await sleep(GAP)
        await focusApp(app)
        await window.goto(`${opts.base}/${opts.site}/`, { waitUntil: 'domcontentloaded' })
        const chatReady = () =>
          until(
            window,
            () => {
              const box = document.querySelector('[contenteditable="true"]')
              const cover = document.querySelector('.tracy-boot-cover')
              return !!box && (!cover || getComputedStyle(cover).pointerEvents === 'none')
            },
            undefined,
            90_000
          )
        let ready = await chatReady()
        if (!ready) {
          await window.reload({ waitUntil: 'domcontentloaded' })
          ready = await chatReady()
        }
        if (!ready) {
          await c.shot(window, 'B-not-ready.png')
          throw new Blocked(
            `B. the chat box of ${opts.site} never took input (the site's workspace was not ready; see B-not-ready.png)`
          )
        }
        const mark = Date.now()
        await window.locator('[contenteditable="true"]').first().click()
        await window.keyboard.type('Count from 1 to 40, one number per line, nothing else.')
        await window.keyboard.press('Enter')
        const chatUrl = await until(
          window,
          () => (/\/s\/session-/.test(location.pathname) ? location.href : null),
          undefined,
          30_000
        )
        c.log(`B. chat ${chatUrl}`)
        if (w2 && chatUrl) await w2.goto(chatUrl, { waitUntil: 'domcontentloaded' })
        await hideApp(app)
        const real = await (async () => {
          const end = Date.now() + 4 * 60_000
          while (Date.now() < end) {
            const got = (await decisions(app)).filter(
              (d) => d.at >= mark && !String(d.sessionId).startsWith('acc7-')
            )
            if (got.length && Date.now() - got[0].at > 8000) return got
            await sleep(2000)
          }
          return (await decisions(app)).filter(
            (d) => d.at >= mark && !String(d.sessionId).startsWith('acc7-')
          )
        })()
        c.save('B-decisions.json', real)
        const turns = new Map()
        for (const d of real)
          turns.set(`${d.sessionId}/${d.turnId}`, [
            ...(turns.get(`${d.sessionId}/${d.turnId}`) ?? []),
            d.decision
          ])
        c.log(`B. decisions per turn ${JSON.stringify([...turns])}`)
        c.check('B. the real turn was reported to the main process', real.length > 0, real)
        const first = [...turns.values()][0] ?? []
        c.eq('B. exactly one `shown` for the turn', first.filter((d) => d === 'shown').length, 1)
        c.check(
          'B. every other report of that turn is `duplicate`',
          first.filter((d) => d !== 'shown').every((d) => d === 'duplicate'),
          first
        )
        if (first.length < 2)
          c.note(
            'B. the second window did not report the turn (it opened the chat after the turn began); duplicate covered by part A'
          )
      }
    } finally {
      c.save('console-errors.json', errors)
      await app.close()
    }
  })
}

await standalone(import.meta.url, 'ACC-7', run)
