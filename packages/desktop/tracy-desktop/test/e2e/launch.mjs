/**
 * Launch the desktop app FROM SOURCE under Playwright, in a profile of its own.
 *
 * Every launch gets a fresh TRACY_DESKTOP_INSTANCE, so it never shares a cookie jar or the
 * single-instance lock with a person's run or another agent's run (src/dev-profile.js). The instance
 * is explicit, so a collision fails loudly instead of quietly handing over to someone else's window.
 *
 *   import { launchFromSource } from './launch.mjs'
 *   const { app, window, profileDir } = await launchFromSource({ origin: 'http://tracy.test:8080' })
 *   ...
 *   await app.close()   // closes THIS app only
 *
 * Needs the window shell bundled once (`node build/build-shell.mjs`, which `pnpm dev` runs).
 */
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from '@playwright/test'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const REPO = path.resolve(PKG, '..', '..', '..')
const require = createRequire(path.join(PKG, 'package.json'))
const { sourceProfile } = require('./src/dev-profile.js')

/**
 * @param {object} options
 * @param {string} options.origin - the origin the window opens, e.g. `http://tracy.test:8080`.
 * @param {string} [options.instance] - defaults to a fresh `e2e-<random>`.
 * @param {Record<string, string>} [options.env] - extra environment for the app.
 * @param {number} [options.timeout] - how long to wait for the first window, in ms.
 * @param {string[]} [options.require] - TEST ONLY: modules preloaded into the main process (`-r`),
 *   e.g. a stand-in for a native addon. `NODE_OPTIONS` does not reach the app under Playwright.
 * @returns {Promise<{ app: import('@playwright/test').ElectronApplication,
 *   window: import('@playwright/test').Page, profileDir: string, instance: string }>}
 */
export async function launchFromSource({
  origin,
  instance,
  env = {},
  timeout = 60_000,
  require: preload = []
}) {
  if (!existsSync(path.join(PKG, 'src', 'generated', 'shell-main.cjs'))) {
    throw new Error(`the window shell is not built — run: node ${path.join(PKG, 'build', 'build-shell.mjs')}`)
  }
  const chosen = instance ?? `e2e-${randomBytes(4).toString('hex')}`
  const appEnv = { ...process.env, ...env, TRACY_DESKTOP_ORIGIN: origin, TRACY_DESKTOP_INSTANCE: chosen }
  // TEST ONLY: `TRACY_E2E_CHROMIUM_SWITCHES="--disable-quic"` hands Chromium switches to the app, for
  // a network where QUIC stalls (measured 11/10/2026: 20 s per page on the dev host until the fallback).
  const switches = (process.env.TRACY_E2E_CHROMIUM_SWITCHES || '').split(' ').filter(Boolean)
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [...preload.flatMap((file) => ['-r', file]), PKG, ...switches],
    cwd: PKG,
    env: appEnv,
    timeout
  })
  try {
    const [userData, appData] = await app.evaluate(({ app: electronApp }) => [
      electronApp.getPath('userData'),
      electronApp.getPath('appData')
    ])
    // The app must run where the same function the app uses says, or this launch shares someone's data.
    const profileDir = sourceProfile({ packaged: false, repo: REPO, origin, env: appEnv, appData }).dir
    if (userData !== profileDir) {
      throw new Error(`the app runs in ${userData}, not in the expected profile ${profileDir}`)
    }
    const window = await app.firstWindow({ timeout })
    return { app, window, profileDir, instance: chosen }
  } catch (error) {
    await app.close().catch(() => {})
    throw error
  }
}
