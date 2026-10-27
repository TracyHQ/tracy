/**
 * REG-PR-1100-p8-dsh-stale-own-pid-lock: dsh starts again after it died holding a writer lock.
 * dsh runs as PID 1 of its container; one that ended mid-write left `/desk-home/.credentials.yaml.lock`
 * holding `1\n`, its next run was PID 1 again, and `withFileLock` never takes over its own PID, so every
 * start timed out and the container restart-looped (local stand, 10/10/2026). Runs the fork's own vitest
 * over `packages/util/atomic-write/tests/atomic-write.spec.ts` in the pinned submodule and checks each
 * test the case's `expect` names.
 */
import { checks } from './lib.mjs'
import { vitestRun } from './vitest.mjs'

const c = checks()
const r = vitestRun('vendor/tracy/deepseek-harness', [
  'packages/util/atomic-write/tests/atomic-write.spec.ts'
])

c.eq('S1: exit code', r.status, 0)
c.eq('S1: failed', r.counts.failed, 0)
c.eq('S1: skipped', r.counts.pending, 0)
c.check('S1: the spec reported its tests', r.counts.passed > 0, r.output.slice(-600))

const expect = {
  'E2: a lock its own PID left before this process started is taken over': [
    'takes over a lock its own PID left before this process started',
    'admits one contender at a time when several take over a lock its own PID left earlier'
  ],
  'E3: a lock this module instance is creating or holds is kept, whatever its file time says': [
    'keeps a lock this process holds even when its file looks older than the process',
    'keeps a lock this process holds under another spelling of its path',
    'keeps a lock another call of this process is still creating',
    'still times out a nested acquisition of the lock its caller holds'
  ],
  'E4: an own-PID lock written since this process started is kept': [
    'waits for a lock another copy of this package took since this process started',
    'waits for the lock of this process',
    'keeps a lock rewritten under its own PID while this contender claimed the earlier one',
    "waits for its own PID's earlier lock when the runtime cannot tell when it started"
  ],
  'E5: locks of other PIDs are judged as before': [
    'takes over a lock whose holder exited',
    'takes over the lock of a process that really exited',
    'waits for the lock of a live holder',
    'waits for a holder whose process exists under another user',
    'keeps its own lock when the runtime cannot probe itself'
  ]
}
for (const [label, titles] of Object.entries(expect))
  for (const title of titles) c.passes(label, r, title, 1, true)

c.done()
