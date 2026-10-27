/**
 * ACC-1 — the web has no onboarding screen. In chrome-watch's Chrome (a plain browser, no
 * `window.tracyDesktop`): `/new/` shows no `[data-tracy-onboard]`; Settings › Notifications has its
 * table but no "Desktop" row (`[data-row="desktop"]`); Settings › AI accounts lists vendor rows but no
 * "Found on this computer" line. Each absence is read only after a positive control proved the
 * surface it belongs to has rendered, so "absent" never means "not loaded yet".
 */
import {
  Blocked,
  browserPage,
  browserViewer,
  chromeErrors,
  runCase,
  session,
  standalone,
  sleep,
  until
} from './lib.mjs'

export async function run(opts) {
  return runCase('ACC-1', opts, async (c) => {
    const started = Date.now()
    // Sign in only if chrome-watch is not signed in on the target already.
    let page = await browserPage(opts, `${opts.base}/new/`)
    let viewer = await browserViewer(page)
    if (!viewer) {
      const s = await session(opts)
      c.note(`browser had no session; added one (${s.via}, ${s.email ?? 'from file'})`)
      page = await browserPage(opts, `${opts.base}/new/`, { s })
      viewer = await browserViewer(page)
    }
    if (!viewer) throw new Blocked('the browser is not signed in on the target and no session could be added')
    c.log(`signed in as ${viewer}`)

    // 1. /new/ — the dsh shell rendered (control), no overlay, no desktop bridge.
    const shell = await until(
      page,
      () => !!document.querySelector('[data-shell-overlay], [contenteditable="true"], .ts-surface, nav'),
      undefined,
      60_000
    )
    c.check('control: the workspace page rendered', shell === true, page.url())
    await sleep(4000) // the time the app needs to show its overlay after the shell renders
    const state = await page.evaluate(() => ({
      overlay: !!document.querySelector('[data-tracy-onboard]'),
      bridge: typeof window.tracyDesktop,
      onboardStyle: !!document.querySelector('style[data-tracy-onboard-style]')
    }))
    c.save('new-page.json', state)
    c.eq('/new/: no [data-tracy-onboard]', state.overlay, false)
    c.eq('/new/: no window.tracyDesktop (a plain browser)', state.bridge, 'undefined')
    await c.shot(page, 'new.png')

    // 2. Settings › Notifications — the table (control), no Desktop row.
    await page.goto(`${opts.base}/new/?settings=notifications`, { waitUntil: 'domcontentloaded' })
    const table = await until(
      page,
      () => !!document.querySelector('.ts-ntable, .ts-notifications'),
      undefined,
      45_000
    )
    c.check('control: Settings › Notifications table rendered', table === true, page.url())
    await sleep(1500)
    const desktopRow = await page.evaluate(
      () => !!document.querySelector('[data-row="desktop"], .ts-ndesktop')
    )
    c.eq('Settings › Notifications: no "Desktop" row', desktopRow, false)
    await c.shot(page, 'settings-notifications.png')

    // 3. Settings › AI accounts — vendor rows (control), no "Found on this computer".
    await page.goto(`${opts.base}/new/?settings=ai-accounts`, { waitUntil: 'domcontentloaded' })
    const rows = await until(
      page,
      () => {
        const r = [...document.querySelectorAll('[data-vendor]')].map((el) => el.getAttribute('data-vendor'))
        return r.length ? r : null
      },
      undefined,
      45_000
    )
    c.check('control: Settings › AI accounts lists vendor rows', Array.isArray(rows) && rows.length > 0, rows)
    await sleep(2500) // the app asks its bridge once the list is known; give a web page the same time
    const found = await page.evaluate(() => {
      const section = document.querySelector('.tracy-model-plan') ?? document.body
      // By its words (English) and by its place (the muted line under a vendor's name), so another
      // interface language cannot hide it.
      const words = /Found on this computer/i.test(section.innerText)
      const lines = [...document.querySelectorAll('[data-vendor] > div > p.text-xs')].map(
        (p) => p.textContent
      )
      return words || lines.length > 0 ? { words, lines } : false
    })
    c.eq('AI accounts: no "Found on this computer" line', found, false)
    c.save('ai-accounts.json', { rows, found })
    await c.shot(page, 'settings-ai-accounts.png')

    // Errors chrome-watch recorded for these pages, kept as evidence (judged by the reader).
    const host = new URL(opts.base).host
    const since = `${Math.ceil((Date.now() - started) / 60000) + 1}m`
    c.save('chrome-errors.json', chromeErrors(since, host))
  })
}

await standalone(import.meta.url, 'ACC-1', run)
