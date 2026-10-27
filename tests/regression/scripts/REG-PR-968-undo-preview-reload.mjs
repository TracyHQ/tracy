/**
 * REG-PR-968-undo-preview-reload: an undo pressed inside the minute after a turn still reloads the
 * site preview. The fork's reducer test runs under vitest (TAP reporter), so this script reads its
 * TAP lines and requires each test that carries one of the case's expectations.
 */
import { checks, readTap, run } from './lib.mjs'

const c = checks()
const r = run('pnpm', ['exec', 'vitest', 'run', '--reporter=tap', 'tests/refresh-progress.spec.ts'], {
  cwd: 'vendor/tracy/dsh-better-sidebar'
})
const tap = { status: r.status, ...readTap(r.stdout), output: `${r.stdout}\n${r.stderr}` }
c.eq('S1: exit code', tap.status, 0)
c.check('S1: no failing test', tap.failed.length === 0, tap.failed)
for (const name of [
  'an undo inside the absorb window reloads the page',
  'a plain request inside the same window is still absorbed',
  "the absorb slot survives an undo: the turn's own late request after it is still absorbed",
  'an undo while Tracy is at work waits for the turn end, as any request does',
  'an undo on a hidden tab holds "New version ready" for when it is shown',
  'an undo under an open comment box never reloads under it: "New version ready"'
])
  c.passes('S2', tap, name)
c.done()
