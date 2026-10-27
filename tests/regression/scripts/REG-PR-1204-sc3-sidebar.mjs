/**
 * REG-PR-1204-sc3-sidebar:
 *   SC-3 a site set up from its brief shows no "Files changed; source unknown" row — the setup run holds
 *        the webroot like a chat turn (seal under `setup-<run>:1`, then its own moment), records the
 *        moment it heard back from, and Site changes puts those files on the run's "Tracy setup" row;
 *   SB-1 the side card's agent-opens socket keeps reconnecting on a page that was only idle (an opened
 *        socket resets the failure count), and still stops after three connections that never open;
 *   SEC-2 the Files tab fence is no existence oracle: a missing path in another site's webroot gets the
 *        same 403 as an existing one, directly or through a symlink planted in the seat's own site;
 *   DI-1 "Create with" in a site workspace records the pick only while the chat route is on, so it
 *        never calls the `choose` door the switch has closed (403 CHAT_DESIGN_SYSTEM_OFF).
 * Needs Postgres (`TEST_DATABASE_URL`) for S1/S2 and a built dsh fork (`pnpm dsh:build`) for S4.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cannotRun, checks, nodeTest, ROOT, run, testDatabaseUrl } from './lib.mjs'

const c = checks()
testDatabaseUrl()

const reader = nodeTest(['apps/tracy-web/test/site-activity-v2.test.mjs'], {
  extra: ['--test-concurrency=1'],
  pattern: 'SC-3|sweep 4'
})
c.tapClean('S1 Site changes V2 on Postgres', reader)
c.passes('S1', reader, 'SC-3: the files a Tracy setup run wrote ride on its row')
c.passes('S1', reader, 'SC-3: a setup moment the run did not hear back from is still its own')
c.passes('S1', reader, 'sweep 4: one Tracy setup run is ONE row')

const runner = nodeTest(['apps/tracy-web/test/brief-build.test.mjs'], { pattern: 'webroot|moment' })
c.tapClean('S2 the brief runner', runner)
c.passes('S2', runner, 'a setup run holds the webroot: opened before its first write')
c.passes('S2', runner, 'a failed apply still takes the moment')
c.passes('S2', runner, 'a webroot that cannot be held is no reason to fail the site')

const door = nodeTest(['apps/tracy-web/test/sites-route.test.mjs'], { pattern: 'setupWebroot' })
c.tapClean('S2 setupWebroot', door)
c.passes('S2', door, 'setupWebroot: the run seals under its own turn, then commits its moment')
c.passes('S2', door, 'setupWebroot: an EmDash site keeps no webroot history')

const script = nodeTest(['packages/fleet/tracy-fleet-operation/test/webroot-git.test.mjs'], {
  pattern: 'SC-3 setup run'
})
c.tapClean('S3 webroot-git.sh', script)
c.passes('S3', script, 'SC-3 setup run: its turn id holds the webroot like a chat turn')

const plugin = join(ROOT, 'vendor/tracy/dsh-better-sidebar')
const vitest = join(plugin, 'node_modules/.bin/vitest')
if (!existsSync(vitest)) cannotRun('vendor/tracy/dsh-better-sidebar has no node_modules (run pnpm install)')
const side = run(vitest, ['run', 'tests/agent-opens-reconnect.spec.tsx'], {
  cwd: plugin,
  env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
  timeoutS: 300
})
const sideOut = `${side.stdout}${side.stderr}`
if (/dsh fork is not built/.test(sideOut)) cannotRun('the dsh fork is not built (run pnpm dsh:build)')
c.eq('S4 vitest exit code', side.status, 0)
c.check('S4 both agent-opens tests pass', /Tests\s+2 passed \(2\)/.test(sideOut), sideOut.slice(-400))

const probe = run(vitest, ['run', 'tests/path-security-probe.spec.ts'], {
  cwd: plugin,
  env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
  timeoutS: 300
})
const probeOut = `${probe.stdout}${probe.stderr}`
c.eq('S5 vitest exit code', probe.status, 0)
c.check('S5 the five fence-oracle tests pass', /Tests\s+5 passed \(5\)/.test(probeOut), probeOut.slice(-400))

const seats = nodeTest(['scripts/test/seat-isolation-files-tab.test.ts'], { extra: ['--import', 'tsx'] })
c.tapClean('S5 seat isolation of the Files tab', seats)
c.passes('S5', seats, 'plugin: the fence is no existence oracle')
c.passes('S5', seats, 'plugin: reads and listings (fs.tree, fs.trees, fs.read, file door) stay in the site')

const dialog = nodeTest(['packages/design/tracy-design-inspiration/test/chat-route.test.mjs'])
c.tapClean('S6 design inspiration chat route', dialog)
c.passes('S6', dialog, 'Create with records the pick only while the chat route is on')
c.passes('S6', dialog, 'the dialog reads the switch through @tracy/core/ui-switches')

c.done()
