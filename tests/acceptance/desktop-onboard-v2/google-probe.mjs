#!/usr/bin/env node
/**
 * ACC-V2-9 (dev acceptance, partial): the Google choice on the first-run sign-in opens the BROWSER
 * (never a Google page inside the app), on a desktop round with no address on its URL, and the
 * browser goes on to Google's account chooser for Tracy's OAuth client. Stops at Google: finishing
 * needs a Google test account the team does not have.
 *   node tests/acceptance/desktop-onboard-v2/google-probe.mjs --base https://cowork.tracy.site --out <dir>
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { browserContext, closeApp, launchApp, parseArgs, sleep, waitOpened } from './lib.mjs'

const opts = parseArgs()
const out = { at: new Date().toISOString(), base: opts.base }
const errors = []
const launched = await launchApp(opts, { errors })
try {
  const { window } = launched
  await window.waitForURL((u) => u.pathname === '/login', { timeout: 60_000 })
  out.appUrlBefore = window.url()
  const google = window
    .locator('a, button')
    .filter({ hasText: /google/i })
    .first()
  out.googleControl = await google.evaluate((el) => el.outerHTML.slice(0, 300))
  await google.click()
  const opened = await waitOpened(launched, () => true, 30_000)
  await sleep(2000)
  out.appUrlAfter = window.url()
  out.appStayedOnTracy =
    new URL(window.url()).hostname === new URL(opts.base).hostname || window.url().startsWith('file:')
  out.opened = opened
  out.openedHasNoEmail = opened ? !/%40|@/.test(opened) : null
  if (opened) {
    const page = await (await browserContext(opts)).newPage()
    const hops = []
    page.on('framenavigated', (f) => f === page.mainFrame() && hops.push(f.url().slice(0, 160)))
    await page.goto(opened, { waitUntil: 'domcontentloaded' })
    await sleep(3000)
    out.browserText = (await page.evaluate(() => document.body.innerText)).slice(0, 600)
    const press = page
      .locator('a, button')
      .filter({ hasText: /google/i })
      .first()
    if (await press.count()) {
      out.pressed = await press.evaluate((el) => el.outerHTML.slice(0, 200))
      await press.click().catch(() => {})
      await sleep(5000)
    }
    out.hops = hops
    const final = new URL(page.url())
    out.finalHost = final.hostname
    out.finalRedirect = final.searchParams.get('redirect_uri') ?? final.searchParams.get('redirect_to')
    await page.screenshot({ path: join(opts.out, 'browser-final.png') })
  }
  out.appErrors = errors
} finally {
  writeFileSync(join(opts.out, 'google-probe.json'), `${JSON.stringify(out, null, 2)}\n`)
  await closeApp(launched)
}
console.log(JSON.stringify(out, null, 2).slice(0, 2500))
process.exit(0)
