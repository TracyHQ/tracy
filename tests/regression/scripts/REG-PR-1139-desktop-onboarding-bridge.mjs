/**
 * REG-PR-1139 — the desktop app's preload bridge v2: AI tool detection answers only with ids and
 * statuses, the first-run state round-trips through preferences.json, and a sender that is not the
 * product page is refused.
 *
 * S1 runs the unit suites of the bridges (fake ipcMain, fake windows, fake stat/spawn). S2 launches
 * the app FROM SOURCE under Playwright against a running stand and asks the real bridge over the
 * page: `claude` must be found on this machine (the case needs it on PATH or in ~/.local/bin), an
 * unknown id is `unsupported`, nothing but ids and statuses comes back, `onboarding.close` writes
 * `closedAt` into the profile's preferences.json, and a bare string instead of an id list is a
 * TypeError. The stand only serves the page; nothing on it is changed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const STAND = process.env.REG_STAND_URL ?? 'http://tracy.test:8080'

// S1 — the bridges' own suites.
const unit = nodeTest(
  [
    'test/agent-manifest.test.mjs',
    'test/shell-path.test.mjs',
    'test/agent-detect.test.mjs',
    'test/agents-bridge.test.mjs',
    'test/onboarding-bridge.test.mjs',
    'test/notify-bridge.test.mjs',
    'test/bridge-guard.test.mjs',
    'test/preferences.test.mjs'
  ],
  { cwd: join(ROOT, 'packages/desktop/tracy-desktop') }
)
c.tapClean('S1', unit)

// S2 — the real bridge in the app from source.
const launcher = join(ROOT, 'packages/desktop/tracy-desktop/test/e2e/launch.mjs')
if (!existsSync(launcher)) cannotRun(`no launcher at ${launcher}`)
try {
  const r = await fetch(`${STAND}/login`, { redirect: 'manual' })
  if (r.status >= 500) cannotRun(`stand ${STAND} answers ${r.status}`)
} catch (error) {
  cannotRun(`stand ${STAND} is not reachable (${error.message})`)
}
const whichClaude = ['/opt/homebrew/bin', '/usr/local/bin', join(process.env.HOME ?? '', '.local/bin')]
  .concat((process.env.PATH ?? '').split(':'))
  .some((dir) => dir && existsSync(join(dir, 'claude')))
if (!whichClaude) cannotRun('this machine has no `claude` command to detect')

const { launchFromSource } = await import(pathToFileURL(launcher).href)
const { app, window, profileDir } = await launchFromSource({
  origin: STAND,
  env: { TRACY_DESKTOP_ONBOARDING: 'again' }
})
try {
  await window.waitForLoadState('domcontentloaded')
  const bridge = await window.evaluate(async () => {
    const api = window.tracyDesktop?.app
    if (!api) return { missing: true }
    const first = await api.agents.detect(['claude', 'grok', 'no-such-id'])
    let second = first
    for (let i = 0; i < 6 && !second.scanComplete; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      second = await api.agents.detect(['claude', 'grok', 'no-such-id'])
    }
    let badArg = null
    try {
      await api.agents.detect('claude')
    } catch (error) {
      badArg = String(error?.message ?? error)
    }
    const before = await api.onboarding.get()
    const closed = await api.onboarding.close({ outcome: 'dismissed', picked: 'claude' })
    const after = await api.onboarding.get()
    return { protocolVersion: api.protocolVersion, first, second, badArg, before, closed, after }
  })
  c.check('S2: the page sees the bridge', !bridge.missing, bridge)
  if (!bridge.missing) {
    c.eq('S2: protocolVersion', bridge.protocolVersion, 2)
    const status = (r, id) => r.results.find((x) => x.id === id)?.status
    c.eq('S2: claude is found once the scan is complete', status(bridge.second, 'claude'), 'found')
    c.eq('S2: scan completes', bridge.second.scanComplete, true)
    c.eq('S2: an unknown id is unsupported', status(bridge.second, 'no-such-id'), 'unsupported')
    c.check(
      'S2: grok is not-found or found, never a path',
      ['found', 'not-found'].includes(status(bridge.second, 'grok')),
      status(bridge.second, 'grok')
    )
    c.check(
      'S2: only ids and statuses come back',
      bridge.second.results.every((x) => Object.keys(x).sort().join(',') === 'id,status'),
      bridge.second.results
    )
    c.check(
      'S2: a bare string is refused with a TypeError',
      /TypeError|must be an array/.test(bridge.badArg ?? ''),
      bridge.badArg
    )
    c.eq('S2: before close, the run is not closed', bridge.before.closedAt, null)
    c.check('S2: close stamps closedAt', typeof bridge.closed.closedAt === 'number', bridge.closed)
    c.eq('S2: close keeps the pick', bridge.closed.picked, 'claude')
    c.eq('S2: after close, get reports closed', typeof bridge.after.closedAt, 'number')
    const prefs = JSON.parse(readFileSync(join(profileDir, 'preferences.json'), 'utf8'))
    c.eq('S2: preferences.json holds the outcome', prefs.onboarding?.outcome, 'dismissed')
    c.eq('S2: preferences.json keeps autoCheck', typeof prefs.autoCheck, 'boolean')
  }
} finally {
  await app.close()
}
c.done()
