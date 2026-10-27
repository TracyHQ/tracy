/**
 * REG-PR-964: the native tab body (where the Files tab is drawn when DSH hosts the tabs) resolves its
 * session's workspace root for a conversation made with New session, whose list summary has no cwd.
 * S1/S2 run the sidebar fork's vitest spec from its own folder; S3 reads the two call sites.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks } from './lib.mjs'
import { vitestRun } from './vitest.mjs'

const c = checks()
const PKG = 'vendor/tracy/dsh-better-sidebar'

// S1 + S2
const s1 = vitestRun(PKG, ['tests/native-body-session-cwd.spec.tsx'])
c.eq('S1: exit code', s1.status, 0)
c.eq('S1: failed', s1.counts.failed, 0)
if (s1.status !== 0) process.stdout.write(s1.output.slice(-2000))
for (const name of [
  'asks the host for the cwd of a session whose summary has none (a New session)',
  'uses the summary cwd without asking the host',
  'takes the summary cwd once it arrives',
  'keeps the cwd undefined while the host has not answered, and when it refuses'
])
  c.check(`S2: '${name}' passes`, s1.passed.includes(name) && !s1.failed.includes(name), {
    passed: s1.passed,
    failed: s1.failed
  })

// S3: one hook, read by both the shell Sidebar and the native tab body
const read = (file) => readFileSync(join(ROOT, PKG, file), 'utf8')
const hook = /import \{ useSessionCwd \} from '(?:\.\.?\/)+session-cwd\.ts'/
c.check(
  'S3: native/tab-adapter.tsx imports useSessionCwd from session-cwd.ts',
  hook.test(read('src/client/native/tab-adapter.tsx'))
)
c.check(
  'S3: Sidebar.tsx imports useSessionCwd from session-cwd.ts',
  hook.test(read('src/client/Sidebar.tsx'))
)
c.check(
  'S3: tab-adapter.tsx no longer defines its own summary-only useSessionCwd',
  !/function useSessionCwd\(/.test(read('src/client/native/tab-adapter.tsx'))
)
c.done()
