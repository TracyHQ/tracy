/**
 * REG-PR-1049: while an ordinary session runs and the person has typed a draft, a Stop button stays
 * on screen beside Queue Send (dsh fork 0.2.0-rc.2-tracy.26). Runs the fork's own InputBar tests and
 * requires the two cases that carry the expectation to report `✓`; then reads the fork source the
 * submodule pointer carries, so a pointer that moves back to a commit without the change is red.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cannotRun, checks, ROOT, run } from './lib.mjs'

const FORK = join(ROOT, 'vendor/tracy/deepseek-harness')
const SPEC = 'packages/client/ui-conversation/tests/input-bar.client.spec.tsx'
const SOURCE = join(FORK, 'packages/client/ui-conversation/src/client/skeleton/InputBar.tsx')
const VITEST = join(FORK, 'node_modules/.bin/vitest')

const c = checks()

if (!existsSync(SOURCE)) cannotRun('the dsh fork submodule is not checked out (git submodule update --init)')
const source = readFileSync(SOURCE, 'utf8')
c.check(
  'S1: InputBar draws the independent Stop for an ordinary running session once the primary is not Stop',
  /const interruptible = running && \(continuable \|\| \(subagent === null && !primaryStops\)\)/.test(source)
)
c.check(
  'S1: a one-shot subagent is still excluded (the condition names `subagent === null`)',
  source.includes('subagent === null && !primaryStops')
)

if (!existsSync(VITEST))
  cannotRun(
    'the fork has no node_modules (CI=true corepack pnpm install --ignore-scripts --frozen-lockfile inside it)'
  )
const r = run(VITEST, ['run', SPEC, '-t', 'Tracy:', '--reporter=verbose'], { cwd: FORK })
const out = `${r.stdout}\n${r.stderr}`
if (r.status !== 0 && /reading 'use[A-Za-z]+'\)/.test(out))
  cannotRun(
    'the fork has two Reacts: a root `pnpm install` relinked it. Run `CI=true corepack pnpm install --ignore-scripts --frozen-lockfile` inside vendor/tracy/deepseek-harness (TRACY-FORK.md §1 step 2)'
  )
c.check('S2: the fork vitest run exits 0', r.status === 0, r.status)
for (const name of [
  'Tracy: a running ordinary session keeps a Stop button beside Queue Send while a draft is typed',
  'Tracy: an idle session never draws Stop, with or without a draft'
]) {
  const hit = out.split('\n').some((line) => line.includes('✓') && line.includes(name))
  c.check(`S2: '${name}' passes`, hit)
}
c.check('S2: no test failed', !/ Tests .*\d+ failed/.test(out) && !/\b1 failed\b/.test(out))
c.done()
