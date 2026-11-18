/**
 * REG-PR-571-ds-slot-turbo-fleet-input: the `turbo-config` input audit of `@tracy/ds-slot#test:ci`
 * finds the fleet's IMAGE_TAGS, which its stand-image tests read, inside the task's hash.
 * S1: the two ds-slot suites that read IMAGE_TAGS are green under `scripts/ci/trace-reads.mjs`, and
 * the trace holds packages/fleet/tracy-fleet-operation/web/IMAGE_TAGS. S2: Turbo's dry run hashes
 * that file for the task. S3: `coverageProblems` (the audit `turbo-setup.mjs --check` runs) reports
 * no read of those suites outside the task's inputs — before #571 it reported "its suite reads
 * packages/fleet/tracy-fleet-operation/web/IMAGE_TAGS, which is not among the task's inputs".
 *
 * Only the suites that read IMAGE_TAGS are traced, not the whole ds-slot suite: the full
 * `test:ci` also probes a browser for every EmDash theme, which says nothing about this input.
 * Run with `node --import tsx` (turbo-setup.mjs imports check-tests.ts).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, cannotRun, checks, run } from './lib.mjs'

const c = checks()
const OWNER = 'packages/design/tracy-ds-slot'
const TASK = '@tracy/ds-slot#test:ci'
const IMAGE_TAGS = 'packages/fleet/tracy-fleet-operation/web/IMAGE_TAGS'
const SUITES = ['test/stand-images.test.mjs', 'test/stand-version.test.mjs']

const turbo = path.join(ROOT, 'node_modules/.bin/turbo')
if (!existsSync(turbo)) cannotRun(`no ${turbo}: run pnpm install`)
const { coverageProblems } = await import(pathToFileURL(path.join(ROOT, 'scripts/ci/turbo-setup.mjs')).href)
const { rootGlobs } = await import(pathToFileURL(path.join(ROOT, 'scripts/ci/turbo-inputs.mjs')).href)

const dir = mkdtempSync(path.join(tmpdir(), 'reg-pr-571-'))
try {
  // S1: the suites that read IMAGE_TAGS, traced the way the audit traces a task.
  const out = path.join(dir, 'reads.txt')
  const tests = run(process.execPath, ['--test', '--test-reporter=tap', ...SUITES], {
    cwd: path.join(ROOT, OWNER),
    env: {
      ...process.env,
      TRACY_TRACE_READS_OUT: out,
      NODE_OPTIONS: `--import=${path.join(ROOT, 'scripts/ci/trace-reads.mjs')}`
    },
    timeoutS: 300
  })
  c.eq('S1: stand-images and stand-version suites exit code', tests.status, 0)
  const reads = existsSync(out) ? [...new Set(readFileSync(out, 'utf8').split('\n').filter(Boolean))] : []
  c.check(`S1: the traced reads include ${IMAGE_TAGS}`, reads.includes(IMAGE_TAGS), reads.length)

  // S2: the files Turbo hashes for the task (its dry run, as `turbo-setup.mjs` reads it).
  const env = { ...process.env, TURBO_TELEMETRY_DISABLED: '1' }
  for (const key of ['TURBO_API', 'TURBO_TOKEN', 'TURBO_TEAM']) delete env[key]
  const dry = run(turbo, ['run', 'test:ci', '--filter=@tracy/ds-slot', '--dry=json'], { env })
  c.eq('S2: turbo run --dry=json exit code', dry.status, 0)
  const at = dry.stdout.indexOf('\n{')
  const task =
    dry.status === 0
      ? JSON.parse(dry.stdout.slice(at === -1 ? dry.stdout.indexOf('{') : at + 1)).tasks.find(
          (t) => t.taskId === TASK
        )
      : undefined
  const hashed = new Set(
    Object.keys(task?.inputs ?? {}).map((k) =>
      path.posix.normalize(path.posix.join(task.directory || '.', k))
    )
  )
  c.check(
    `S2: Turbo hashes ${IMAGE_TAGS} for ${TASK}`,
    hashed.has(IMAGE_TAGS),
    task ? hashed.size : 'no task'
  )

  // S3: the audit itself, over these reads and this hash.
  const def = JSON.parse(readFileSync(path.join(ROOT, OWNER, 'turbo.json'), 'utf8')).tasks['test:ci']
  const bare = reads.map((r) => (r.endsWith('/**') ? r.slice(0, -3) : r))
  const ignored = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
    cwd: ROOT,
    input: `${bare.join('\0')}\0`,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (ignored.status !== 0 && ignored.status !== 1) cannotRun(`git check-ignore: ${ignored.stderr}`)
  const kind = (rel) => {
    try {
      return statSync(path.join(ROOT, rel)).isDirectory() ? 'dir' : 'file'
    } catch {
      return 'absent'
    }
  }
  const { problems } = coverageProblems({
    tasks: [{ id: TASK, globs: rootGlobs(def.inputs, OWNER), env: def.env ?? [] }],
    reads: new Map([[TASK, reads]]),
    hashed: new Map([[TASK, hashed]]),
    kind,
    ignored: new Set(ignored.stdout.split('\0').filter(Boolean))
  })
  c.check(
    `S3: the turbo-config audit finds every read of those suites among ${TASK}'s inputs`,
    problems.length === 0,
    problems
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
c.done()
