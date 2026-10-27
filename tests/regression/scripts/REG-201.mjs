/**
 * REG-201: the sidebar fork builds — no type error at mentionParts. S1 type-checks the fork's build
 * project from its folder and requires that src/client/comment-mentions.ts is compiled and that no
 * error line names it (other files' errors are not this case). S2 runs the fork's mention tests:
 * exit 0 with exactly 4 passed.
 */
import { join } from 'node:path'
import { ROOT, checks, run } from './lib.mjs'
import { vitestRun } from './vitest.mjs'

const c = checks()
const PKG = 'vendor/tracy/dsh-better-sidebar'
const FILE = 'src/client/comment-mentions.ts'

// S1
const tsc = run(
  join(ROOT, PKG, 'node_modules/.bin/tsc'),
  ['-p', 'tsconfig.build.json', '--noEmit', '--listFiles'],
  {
    cwd: join(ROOT, PKG)
  }
)
const out = `${tsc.stdout}\n${tsc.stderr}`
c.check(
  'S1: tsc ran the build project (exit 0, or 2 for errors elsewhere)',
  tsc.status === 0 || tsc.status === 2,
  {
    status: tsc.status,
    tail: out.slice(-600)
  }
)
c.check(
  `S1: ${FILE} is part of tsconfig.build.json`,
  out.split('\n').some((l) => l.trim().endsWith(`/${FILE}`))
)
c.check(
  `S1: no tsc config error (TS5xxx/TS6xxx)`,
  !/error TS[56]\d{3}/.test(out),
  /error TS[56]\d{3}.*/.exec(out)?.[0]
)
const lines = out.split('\n').filter((l) => l.includes(FILE) && /error TS\d+/.test(l))
c.eq(`S1: error lines naming ${FILE}`, lines.length, 0)
if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`)

// S2
const s2 = vitestRun(PKG, [
  'tests/thread-mention-parts.spec.ts',
  'tests/comment-people-layer.spec.tsx',
  '-t',
  'mention'
])
c.eq('S2: exit code', s2.status, 0)
c.eq('S2: passed', s2.counts.passed, 4)
c.eq('S2: failed', s2.counts.failed, 0)
c.done()
