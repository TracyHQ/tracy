/**
 * Smoke run of the app from source: it opens against an origin, reaches that origin's sign-in page,
 * and names itself as the Dev variant. Closes only the app it launched, and removes the profile
 * folder it created.
 *
 *   TRACY_E2E_ORIGIN=http://tracy.test:8080 node packages/desktop/tracy-desktop/test/e2e/smoke.mjs
 *
 * The default origin is the shared local stand (`http://tracy.test:8080`).
 */
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { launchFromSource } from './launch.mjs'

const origin = (process.env.TRACY_E2E_ORIGIN ?? 'http://tracy.test:8080').replace(/\/+$/, '')

let launched
let failed = false
try {
  launched = await launchFromSource({ origin })
  const { app, window, profileDir, instance } = launched
  const pid = await app.evaluate(() => process.pid)
  console.log(`smoke: launched pid ${pid}, instance ${instance}, profile ${profileDir}`)

  await window.waitForURL((url) => url.origin === origin && url.pathname === '/login', { timeout: 60_000 })
  console.log(`smoke: window reached ${window.url()}`)

  const name = await app.evaluate(({ app: electronApp }) => electronApp.getName())
  // A source run is always the Dev variant (src/dev-profile.js), whatever origin it opens. Asked of the
  // app, not the window: Electron replaces the window title with the page's <title>.
  assert.equal(name, 'Tracy Cowork Dev', 'the app names itself as the Dev variant')
  const titles = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.getTitle())
  )
  console.log(`smoke: variant ${name}; window title now ${JSON.stringify(titles)}`)
  console.log('smoke: PASS')
} catch (error) {
  failed = true
  console.error(`smoke: FAIL — ${error.message}`)
} finally {
  if (launched !== undefined) {
    await launched.app
      .close()
      .catch((error) => console.error(`smoke: could not close the app: ${error.message}`))
    rmSync(launched.profileDir, { recursive: true, force: true })
  }
}
process.exitCode = failed ? 1 : 0
