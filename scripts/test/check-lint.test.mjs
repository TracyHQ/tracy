#!/usr/bin/env node
/**
 * The `lint` gate's timing and cache report, and the verdicts it must keep.
 *
 *   node --test scripts/test/check-lint.test.mjs
 *
 * WHY THIS IS A TEST. `check-lint.ts` gained a report (wall time per component, what the build-info
 * cache looked like) so the next split or cache decision is made on numbers. A report bolted onto a
 * gate is the easiest way to change the gate by accident: a reordered step, a swallowed exit code, a
 * "cache hit" that skips a project. So every case here asserts the report AND the verdict, on the
 * real script, with only `pnpm` replaced.
 *
 * HOW. The script is copied into a throwaway directory (it derives the repository root from its own
 * path), a fake `pnpm` on PATH records each call with start/end times and obeys a per-command plan
 * (exit code, delay, signal, output, "write the build-info file"). Nothing is linted and no compiler
 * runs: these cases prove commands, order, concurrency, verdicts and log lines — not durations of
 * the real tools, and not what `actions/cache` really returns.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { availableParallelism, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)
const TSX = require.resolve('tsx/cli')
const { load } = require('js-yaml')

const PROJECTS = ['packages/a', 'packages/b', 'packages/c', 'packages/d', 'tsconfig.scripts.json']
const CHAIN = PROJECTS.map((p) => `tsc --noEmit -p ${p}`).join(' && ')
const OXLINT = ['exec', 'oxlint', '--deny-warnings', '--disable-nested-config']
const GREEN = 'check-lint: 3 steps green.'

const FAKE_PNPM = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
const key =
  args[0] === 'exec' && args[1] === 'tsc'
    ? 'tsc:' + args[args.indexOf('-p') + 1]
    : args[0] === 'exec'
      ? args[1]
      : args[0]
const rule = JSON.parse(process.env.FAKE_PNPM_PLAN || '{}')[key] || {}
const log = (event) =>
  fs.appendFileSync(process.env.FAKE_PNPM_LOG, JSON.stringify({ event, key, args }) + '\\n')
log('start')
// Hold until \`holdUntilStarted\` tsc calls have started (or 10 s): peak concurrency then depends on
// what the gate started together, never on how fast this machine spawns a process.
const tscStarted = () =>
  fs
    .readFileSync(process.env.FAKE_PNPM_LOG, 'utf8')
    .split('\\n')
    .filter((l) => l.includes('"event":"start","key":"tsc:')).length
const deadline = Date.now() + 10000
const proceed = () => {
  if (rule.holdUntilStarted && tscStarted() < rule.holdUntilStarted && Date.now() < deadline)
    return setTimeout(proceed, 10)
  setTimeout(finish, rule.delayMs || 0)
}
const finish = () => {
  if (rule.output) process.stdout.write(rule.output)
  const at = args.indexOf('--tsBuildInfoFile')
  if (rule.writeBuildInfo && at !== -1) {
    fs.mkdirSync(path.dirname(args[at + 1]), { recursive: true })
    fs.writeFileSync(args[at + 1], '{"fake":true}')
  }
  log('end')
  // The next command the gate starts through \`pnpm\` then fails to start at all.
  if (rule.removePnpm) fs.unlinkSync(__filename)
  // Break package.json AFTER the script was loaded, so it is the gate's own read that meets it.
  const pkg = path.join(process.cwd(), 'package.json')
  const brk = rule.breakPackageJson
  if (brk) fs.rmSync(pkg, { recursive: true, force: true })
  if (brk && brk.text !== undefined) fs.writeFileSync(pkg, brk.text)
  if (brk && brk.directory) fs.mkdirSync(pkg)
  if (brk && brk.mode !== undefined) fs.chmodSync(pkg, brk.mode)
  if (rule.signal) process.kill(process.pid, rule.signal)
  else process.exit(rule.exit || 0)
}
proceed()
`

// Resolved: the gate builds paths from its own real location, and a temp directory is often a symlink.
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'check-lint-test-')))
after(() => rmSync(scratch, { recursive: true, force: true }))

/** A throwaway root holding the real script, a fake `pnpm`, and the given `package.json` text. */
function fixture(packageJson = JSON.stringify({ scripts: { typecheck: CHAIN } })) {
  const dir = mkdtempSync(join(scratch, 'f-'))
  mkdirSync(join(dir, 'scripts'))
  mkdirSync(join(dir, 'bin'))
  copyFileSync(join(ROOT, 'scripts/check-lint.ts'), join(dir, 'scripts/check-lint.ts'))
  writeFileSync(join(dir, 'bin/pnpm'), FAKE_PNPM)
  chmodSync(join(dir, 'bin/pnpm'), 0o755)
  // `bin` is the whole PATH: the directory node really lives in often holds a real pnpm as well, and
  // a case that removes the fake one must not fall through to it.
  symlinkSync(process.execPath, join(dir, 'bin/node'))
  if (packageJson !== null) writeFileSync(join(dir, 'package.json'), packageJson)
  return dir
}

/**
 * Run the gate in `dir`. Async on purpose: a blocked event loop here would also block the other
 * cases' children from being reaped. A run that outlives `timeoutMs` is killed and reported as
 * `timedOut`, so a hang (a FIFO opened for reading, say) is a failed assertion, not a stuck suite.
 */
function run(dir, { plan = {}, env = {}, path, timeoutMs = 30_000 } = {}) {
  const logFile = join(dir, `calls-${String(Date.now())}-${String(Math.random()).slice(2)}.jsonl`)
  appendFileSync(logFile, '')
  const childEnv = {
    HOME: process.env.HOME ?? '',
    TMPDIR: process.env.TMPDIR ?? '',
    PATH: path ?? join(dir, 'bin'),
    FAKE_PNPM_PLAN: JSON.stringify(plan),
    FAKE_PNPM_LOG: logFile,
    ...env
  }
  return new Promise((done) => {
    const child = spawn(process.execPath, [TSX, join(dir, 'scripts/check-lint.ts')], {
      cwd: dir,
      env: childEnv
    })
    let out = ''
    child.stdout.on('data', (c) => (out += c.toString()))
    child.stderr.on('data', (c) => (out += c.toString()))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      const events = readFileSync(logFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      done({ code, out, timedOut, events, calls: events.filter((e) => e.event === 'start') })
    })
  })
}

/** The highest number of `tsc` calls that were running at the same moment. */
function peakTsc(events) {
  let now = 0
  let peak = 0
  for (const e of events.filter((x) => x.key.startsWith('tsc:'))) {
    now += e.event === 'start' ? 1 : -1
    peak = Math.max(peak, now)
  }
  return peak
}

/** `{ ms, result }` of the timing line for one stage, or null when the line is absent. */
function timing(out, stage) {
  const line = out.split('\n').find((l) => l.startsWith(`check-lint: time — ${stage}`))
  const match = line && / (\d+) ms \((ok|FAILED)\)$/.exec(line)
  return match ? { ms: Number(match[1]), result: match[2] } : null
}

function assertTiming(out, stage, result) {
  const found = timing(out, stage)
  assert.ok(found, `no timing line for "${stage}" in:\n${out}`)
  assert.equal(found.result, result, `timing result for "${stage}"`)
  assert.ok(Number.isInteger(found.ms) && found.ms >= 0, `elapsed for "${stage}" is a count of ms`)
}

/** A plan in which every tsc call waits until `n` of them have started. */
const holdTsc = (n) => Object.fromEntries(PROJECTS.map((p) => [`tsc:${p}`, { holdUntilStarted: n }]))
const tscArgs = (project, extra = []) => ['exec', 'tsc', '--noEmit', '-p', project, ...extra]
const buildInfoPath = (dir, cache, project) =>
  join(dir, cache, `${project.replace(/[^\w.-]+/g, '_')}.tsbuildinfo`)
const projectLine = (out, project) =>
  out.split('\n').find((l) => l.startsWith(`check-lint: tsc -p ${project} `))

// ── commands, order and component timings ────────────────────────────────────────────────────────

test('green run: same commands in the same order, and a wall time for each of the three components', async () => {
  const r = await run(fixture())
  assert.equal(r.code, 0, r.out)
  assert.deepEqual(r.calls[0].args, OXLINT)
  assert.deepEqual(r.calls.at(-1).args, ['format:check'])
  const tsc = r.calls.slice(1, -1)
  assert.deepEqual(tsc.map((c) => c.args).sort(), PROJECTS.map((p) => tscArgs(p)).sort())

  // Stages never overlap: oxlint ends before the first tsc starts, format starts after the last ends.
  const keys = r.events.map((e) => `${e.event} ${e.key}`)
  assert.equal(keys[0], 'start oxlint')
  assert.equal(keys[1], 'end oxlint')
  assert.equal(keys.at(-2), 'start format:check')
  assert.equal(keys.at(-1), 'end format:check')

  assertTiming(r.out, 'oxlint', 'ok')
  assertTiming(r.out, 'typecheck', 'ok')
  assertTiming(r.out, 'format:check', 'ok')
  // The format figure covers two biome commands; the line must say so rather than look like one.
  assert.match(r.out, /check-lint: time — format:check \(biome format \+ biome lint[^)]*\): \d+ ms/)
  assertTiming(r.out, 'total', 'ok')
  for (const p of PROJECTS)
    assert.match(projectLine(r.out, p) ?? '', new RegExp(`^check-lint: tsc -p \\S+ ok \\(\\d+ ms\\)`))
  assert.ok(r.out.includes(GREEN))
})

test('a component time covers the component: a 300 ms oxlint reports at least 300 ms', async () => {
  const r = await run(fixture(), { plan: { oxlint: { delayMs: 300 } } })
  assert.equal(r.code, 0, r.out)
  assert.ok(timing(r.out, 'oxlint').ms >= 300, r.out)
  assert.ok(timing(r.out, 'total').ms >= timing(r.out, 'oxlint').ms, r.out)
})

// ── failures keep their verdict and their short-circuit, and still report the attempted stage ────

for (const [label, rule] of [
  ['exits non-zero', { exit: 3 }],
  ['is terminated by a signal', { signal: 'SIGTERM' }]
]) {
  test(`oxlint ${label}: red, nothing after it runs, and its time is reported`, async () => {
    const r = await run(fixture(), { plan: { oxlint: rule } })
    assert.equal(r.code, 1, r.out)
    assert.deepEqual(
      r.calls.map((c) => c.key),
      ['oxlint']
    )
    assertTiming(r.out, 'oxlint', 'FAILED')
    assert.equal(timing(r.out, 'typecheck'), null)
    assert.ok(r.out.includes('check-lint: step "oxlint" is red.'))
    assert.ok(!r.out.includes(GREEN))
  })

  test(`format:check ${label}: red after both earlier stages ran, and its time is reported`, async () => {
    const r = await run(fixture(), { plan: { 'format:check': rule } })
    assert.equal(r.code, 1, r.out)
    assert.equal(r.calls.length, PROJECTS.length + 2)
    assertTiming(r.out, 'oxlint', 'ok')
    assertTiming(r.out, 'typecheck', 'ok')
    assertTiming(r.out, 'format:check', 'FAILED')
    assert.ok(r.out.includes('check-lint: step "format" is red.'))
    assert.ok(!r.out.includes(GREEN))
  })

  test(`sequential typecheck ${label}: red, format never runs, and its time is reported`, async () => {
    const dir = fixture(JSON.stringify({ scripts: { typecheck: 'tsc -b' } }))
    const r = await run(dir, { plan: { typecheck: rule } })
    assert.equal(r.code, 1, r.out)
    assert.deepEqual(
      r.calls.map((c) => c.args),
      [OXLINT, ['typecheck']]
    )
    assertTiming(r.out, 'typecheck', 'FAILED')
    assert.ok(r.out.includes('check-lint: step "typecheck" is red.'))
    assert.ok(!r.out.includes(GREEN))
  })

  test(`a parallel tsc project ${label}: every project is still attempted, then red`, async () => {
    const r = await run(fixture(), {
      env: { TRACY_TYPECHECK_JOBS: '2' },
      plan: {
        ...holdTsc(2),
        'tsc:packages/a': { ...rule, holdUntilStarted: 2, output: 'a.ts(1,1): error TS0000: planted\n' },
        'tsc:tsconfig.scripts.json': { holdUntilStarted: 2, delayMs: 400, output: 'late but kept\n' }
      }
    })
    assert.equal(r.code, 1, r.out)
    const tsc = r.calls.filter((c) => c.key.startsWith('tsc:')).map((c) => c.key)
    assert.deepEqual(tsc.sort(), PROJECTS.map((p) => `tsc:${p}`).sort())
    assert.equal(peakTsc(r.events), 2)
    assert.ok(!r.calls.some((c) => c.key === 'format:check'), 'format must not run after a red typecheck')
    assert.match(projectLine(r.out, 'packages/a'), /^check-lint: tsc -p packages\/a FAILED \(\d+ ms\)/)
    assert.match(projectLine(r.out, 'tsconfig.scripts.json'), / ok \(\d+ ms\)/)
    // Buffered output of both the failed and the late project is printed whole.
    assert.ok(r.out.includes('a.ts(1,1): error TS0000: planted\n'))
    assert.ok(r.out.includes('late but kept\n'))
    assertTiming(r.out, 'typecheck', 'FAILED')
    assert.ok(timing(r.out, 'typecheck').ms >= 400, 'the stage time includes the project that ended last')
    assert.ok(r.out.includes('check-lint: step "typecheck" is red.'))
    assert.ok(!r.out.includes(GREEN))
  })
}

test('pnpm cannot be started: red with the attempted stage timed, never green', async () => {
  const dir = fixture()
  const empty = join(dir, 'empty-path')
  mkdirSync(empty)
  const r = await run(dir, { path: empty })
  assert.notEqual(r.code, 0, r.out)
  assert.equal(r.calls.length, 0)
  assertTiming(r.out, 'oxlint', 'FAILED')
  assert.ok(!r.out.includes(GREEN))
})

test('tsc cannot be started (pnpm disappears after oxlint): every project fails, the stage is timed, red', async () => {
  const r = await run(fixture(), { plan: { oxlint: { removePnpm: true } } })
  assert.equal(r.timedOut, false)
  assert.equal(r.code, 1, r.out)
  assert.deepEqual(
    r.calls.map((c) => c.key),
    ['oxlint']
  )
  assertTiming(r.out, 'oxlint', 'ok')
  for (const p of PROJECTS) {
    assert.match(projectLine(r.out, p) ?? '', /^check-lint: tsc -p \S+ FAILED \(\d+ ms\)/, r.out)
    assert.ok(r.out.includes(`check-lint: could not start tsc for ${p}: `), r.out)
  }
  assertTiming(r.out, 'typecheck', 'FAILED')
  assert.equal(timing(r.out, 'format:check'), null)
  assert.ok(r.out.includes('check-lint: step "typecheck" is red.'))
  assert.ok(!r.out.includes(GREEN))
})

test('the sequential typecheck cannot be started: red, timed, format never runs', async () => {
  const dir = fixture(JSON.stringify({ scripts: { typecheck: 'tsc -b' } }))
  const r = await run(dir, { plan: { oxlint: { removePnpm: true } } })
  assert.equal(r.code, 1, r.out)
  assert.deepEqual(
    r.calls.map((c) => c.key),
    ['oxlint']
  )
  assertTiming(r.out, 'typecheck', 'FAILED')
  assert.equal(timing(r.out, 'format:check'), null)
  assert.ok(!r.out.includes(GREEN))
})

test('format:check cannot be started: red and timed after both earlier stages ran', async () => {
  const r = await run(fixture(), {
    env: { TRACY_TYPECHECK_JOBS: '1' },
    plan: { [`tsc:${PROJECTS.at(-1)}`]: { removePnpm: true } }
  })
  assert.equal(r.code, 1, r.out)
  assert.equal(r.calls.length, PROJECTS.length + 1)
  assertTiming(r.out, 'typecheck', 'ok')
  assertTiming(r.out, 'format:check', 'FAILED')
  assert.ok(!r.out.includes(GREEN))
})

// ── project discovery and the sequential fallback ────────────────────────────────────────────────

for (const [label, scripts] of [
  ['is not a plain tsc chain', { typecheck: `${CHAIN} && echo done` }],
  ['is missing', {}],
  ['is empty', { typecheck: '' }]
]) {
  test(`typecheck script ${label}: falls back to one sequential \`pnpm typecheck\`, timed as a whole`, async () => {
    const r = await run(fixture(JSON.stringify({ scripts })), {
      env: { TRACY_TSC_CACHE_DIR: '.cache/tsc' }
    })
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(
      r.calls.map((c) => c.args),
      [OXLINT, ['typecheck'], ['format:check']]
    )
    assert.ok(r.out.includes('running it sequentially'))
    assertTiming(r.out, 'typecheck', 'ok')
    // No `--incremental` is passed on this path, so no build-info claim may be made for it.
    assert.match(r.out, /check-lint: cache — build-info: disabled/)
    assert.ok(r.out.includes(GREEN))
  })
}

// Broken before the gate starts: the script loader reads the nearest package.json too, so some of
// these never reach the gate's own code. Whatever stops first, the run is red.
for (const [label, text, prepare] of [
  ['absent', null],
  ['empty', ''],
  ['malformed', '{ "scripts": '],
  ['not an object', 'null'],
  ['a directory', null, (dir) => mkdirSync(join(dir, 'package.json'))]
]) {
  test(`package.json ${label} from the start: the gate stays red`, async () => {
    const dir = fixture(text)
    prepare?.(dir)
    const r = await run(dir)
    assert.notEqual(r.code, 0, r.out)
    assert.ok(!r.calls.some((c) => c.key === 'format:check'))
    assert.ok(!r.out.includes(GREEN))
  })
}

// Broken by the time the typecheck stage reads it: the gate's own discovery throws.
for (const [label, breakPackageJson] of [
  ['absent', {}],
  ['empty', { text: '' }],
  ['malformed', { text: '{ "scripts": ' }],
  ['not an object', { text: 'null' }],
  ['with a typecheck script that is not a string', { text: JSON.stringify({ scripts: { typecheck: 5 } }) }],
  ['a directory', { directory: true }],
  // Not as root, which reads a mode-000 file anyway: the case would then test a different path.
  ...(process.getuid?.() === 0 ? [] : [['unreadable', { text: '{}', mode: 0o000 }]])
]) {
  test(`package.json ${label} when typecheck reads it: red, and the attempted stage is timed`, async () => {
    const r = await run(fixture(), { plan: { oxlint: { breakPackageJson } } })
    assert.equal(r.code, 1, r.out)
    // oxlint ran and passed; the failure is in project discovery, before any compiler is started.
    assert.deepEqual(
      r.calls.map((c) => c.key),
      ['oxlint']
    )
    assertTiming(r.out, 'oxlint', 'ok')
    assertTiming(r.out, 'typecheck', 'FAILED')
    assert.equal(timing(r.out, 'format:check'), null)
    assert.equal(timing(r.out, 'total'), null)
    assert.ok(!r.out.includes(GREEN))
  })
}

// ── concurrency is what it was ───────────────────────────────────────────────────────────────────

const defaultJobs = Math.min(4, availableParallelism())

for (const [label, value, expected] of [
  ['unset', undefined, defaultJobs],
  ['not a number', 'many', defaultJobs],
  ['zero', '0', defaultJobs],
  ['negative', '-2', defaultJobs],
  ['fractional', '1.5', defaultJobs],
  ['empty', '', defaultJobs],
  ['1', '1', 1],
  ['3', '3', 3],
  ['more than there are projects', '64', 64]
]) {
  test(`TRACY_TYPECHECK_JOBS ${label}: ${String(expected)} at a time`, async () => {
    const env = value === undefined ? {} : { TRACY_TYPECHECK_JOBS: value }
    const r = await run(fixture(), { env, plan: holdTsc(Math.min(expected, PROJECTS.length)) })
    assert.equal(r.code, 0, r.out)
    assert.ok(
      r.out.includes(
        `check-lint: typecheck — ${String(PROJECTS.length)} project(s), ${String(expected)} at a time\n`
      ),
      r.out
    )
    assert.equal(peakTsc(r.events), Math.min(expected, PROJECTS.length))
  })
}

// ── what the cache restore step said ─────────────────────────────────────────────────────────────

const KEY = 'tsc-0123456789abcdef0123456789abcdef01234567'
const OLDER = 'tsc-fedcba9876543210fedcba9876543210fedcba98'
const restoreEnv = (hit, matched, primary) => ({
  ...(hit === undefined ? {} : { TRACY_TSC_CACHE_HIT: hit }),
  ...(matched === undefined ? {} : { TRACY_TSC_CACHE_MATCHED_KEY: matched }),
  ...(primary === undefined ? {} : { TRACY_TSC_CACHE_PRIMARY_KEY: primary })
})

const UNRELATED = 'pnpm-0123456789abcdef0123456789abcdef01234567'

for (const [label, env, expected] of [
  ['exact key restored', restoreEnv('true', KEY, KEY), 'exact'],
  ['an older key restored by prefix', restoreEnv('false', OLDER, KEY), 'prefix'],
  ['nothing restored (only the primary key, as actions/cache v6 writes it)', restoreEnv('', '', KEY), 'miss'],
  ['nothing restored (hit and matched key not set at all)', restoreEnv(undefined, undefined, KEY), 'miss'],
  ['no outputs at all', restoreEnv(), 'unknown'],
  ['all outputs empty (the restore step was skipped)', restoreEnv('', '', ''), 'unknown'],
  // Combinations the action cannot produce.
  ['hit says false but nothing matched', restoreEnv('false', '', KEY), 'unknown'],
  ['hit says true but nothing matched', restoreEnv('true', '', KEY), 'unknown'],
  ['hit says true but another key matched', restoreEnv('true', OLDER, KEY), 'unknown'],
  ['hit says false but the exact key matched', restoreEnv('false', KEY, KEY), 'unknown'],
  ['hit empty but an older key matched', restoreEnv('', OLDER, KEY), 'unknown'],
  ['hit empty but the exact key matched', restoreEnv('', KEY, KEY), 'unknown'],
  ['hit is not a boolean word', restoreEnv('yes', KEY, KEY), 'unknown'],
  ['hit is TRUE in capitals', restoreEnv('TRUE', KEY, KEY), 'unknown'],
  ['hit has a trailing newline', restoreEnv('true\n', KEY, KEY), 'unknown'],
  ['a matched key but no primary key', restoreEnv('false', OLDER, ''), 'unknown'],
  ['hit true with no primary key', restoreEnv('true', KEY), 'unknown'],
  // Keys this workflow never writes: not `tsc-<40 hex>`.
  ['a matched key outside the restore prefix', restoreEnv('false', UNRELATED, KEY), 'unknown'],
  ['an arbitrary key reported as exact', restoreEnv('true', 'anything', 'anything'), 'unknown'],
  ['an unrelated key reported as exact', restoreEnv('true', UNRELATED, UNRELATED), 'unknown'],
  ['an arbitrary primary key on a miss', restoreEnv('', '', 'anything'), 'unknown'],
  ['a primary key that is only the prefix', restoreEnv('', '', 'tsc-'), 'unknown'],
  ['a matched key that is only the prefix', restoreEnv('false', 'tsc-', KEY), 'unknown'],
  ['a matched key with a short hash', restoreEnv('false', 'tsc-0123abc', KEY), 'unknown'],
  ['a key in capitals', restoreEnv('true', KEY.toUpperCase(), KEY.toUpperCase()), 'unknown'],
  ['a key with leading whitespace', restoreEnv('true', ` ${KEY}`, ` ${KEY}`), 'unknown'],
  // Line terminators, in every position and of every kind.
  ['a matched key with a trailing newline', restoreEnv('false', `${OLDER}\n`, KEY), 'unknown'],
  ['a primary key with a trailing newline', restoreEnv('', '', `${KEY}\n`), 'unknown'],
  ['both keys with the same trailing newline', restoreEnv('true', `${KEY}\n`, `${KEY}\n`), 'unknown'],
  ['a key with a trailing carriage return', restoreEnv('true', `${KEY}\r`, `${KEY}\r`), 'unknown'],
  ['a key with a trailing CRLF', restoreEnv('false', `${OLDER}\r\n`, KEY), 'unknown'],
  ['a key with a trailing U+2028', restoreEnv('true', `${KEY}\u2028`, `${KEY}\u2028`), 'unknown'],
  ['a key with a leading newline', restoreEnv('false', `\n${OLDER}`, KEY), 'unknown'],
  ['a key with a newline in it', restoreEnv('false', `${OLDER}\ncheck-lint: 3 steps green.`, KEY), 'unknown'],
  ['a key with shell text in it', restoreEnv('false', 'tsc-$(rm -rf .)', KEY), 'unknown'],
  ['an overlong key', restoreEnv('false', `tsc-${'a'.repeat(600)}`, KEY), 'unknown']
]) {
  test(`cache restore — ${label}: reported as ${expected}, same compiler calls, same verdict`, async () => {
    const dir = fixture()
    const cacheEnv = { TRACY_TSC_CACHE_DIR: '.cache/tsc', ...env }
    const green = await run(dir, { env: cacheEnv })
    assert.equal(green.code, 0, green.out)
    const lines = green.out.split('\n').filter((l) => l.startsWith('check-lint: cache — restore: '))
    assert.equal(lines.length, 1, green.out)
    assert.ok(lines[0].startsWith(`check-lint: cache — restore: ${expected}`), lines[0])
    // A value the gate did not recognise is never echoed; a recognised one is one line of key text.
    if (expected === 'unknown') assert.doesNotMatch(lines[0], /tsc-|pnpm-|anything|rm -rf/i)
    assert.ok(!green.out.includes('\r') && !green.out.includes('\u2028'), 'no stray line terminator')
    // Exactly one green line: telemetry text can never smuggle a second one in.
    assert.equal(green.out.split(GREEN).length, 2, green.out)
    const calls = green.calls.map((c) => c.args)
    assert.deepEqual(calls[0], OXLINT)
    assert.deepEqual(
      calls.slice(1, -1).sort(),
      PROJECTS.map((p) =>
        tscArgs(p, ['--incremental', '--tsBuildInfoFile', buildInfoPath(dir, '.cache/tsc', p)])
      ).sort()
    )

    // The same telemetry over a failing project: every project still runs, and the gate is red.
    const red = await run(dir, { env: cacheEnv, plan: { 'tsc:packages/c': { exit: 2 } } })
    assert.equal(red.code, 1, red.out)
    assert.equal(red.calls.filter((c) => c.key.startsWith('tsc:')).length, PROJECTS.length)
    assert.ok(!red.out.includes(GREEN))
  })
}

// ── what the build-info files looked like before each project started ────────────────────────────

test('build-info is disabled when no cache directory is set, and tsc gets no incremental flags', async () => {
  for (const env of [{}, { TRACY_TSC_CACHE_DIR: '' }]) {
    const r = await run(fixture(), { env })
    assert.equal(r.code, 0, r.out)
    assert.match(r.out, /check-lint: cache — build-info: disabled/)
    for (const p of PROJECTS) {
      assert.match(projectLine(r.out, p), /\[build-info before start: disabled\]$/)
      assert.ok(r.calls.some((c) => JSON.stringify(c.args) === JSON.stringify(tscArgs(p))))
    }
  }
})

test('build-info states come from file metadata only: present, missing, unknown — and never block', async () => {
  const dir = fixture()
  const cache = '.cache/tsc'
  mkdirSync(join(dir, cache), { recursive: true })
  const at = (project) => buildInfoPath(dir, cache, project)
  writeFileSync(at('packages/a'), '{"program":{}}') // a regular file with content
  writeFileSync(at('packages/b'), '') // empty: there, but nothing tsc could reuse
  symlinkSync(at('packages/a'), at('packages/c')) // a symlink is not followed
  const fifo = spawnSync('mkfifo', [at('packages/d')]) // opening this for reading would hang
  assert.equal(fifo.status, 0, 'mkfifo is needed for this case')
  // tsconfig.scripts.json: nothing there.

  const r = await run(dir, { env: { TRACY_TSC_CACHE_DIR: cache }, timeoutMs: 15_000 })
  assert.equal(r.timedOut, false, 'the gate must not read a FIFO')
  assert.equal(r.code, 0, r.out)
  const state = (p) => /\[build-info before start: ([^\]]+)\]$/.exec(projectLine(r.out, p) ?? '')?.[1]
  assert.equal(state('packages/a'), 'present, unvalidated')
  assert.match(state('packages/b'), /^unknown/)
  assert.match(state('packages/c'), /^unknown/)
  assert.match(state('packages/d'), /^unknown/)
  assert.equal(state('tsconfig.scripts.json'), 'missing')
  assert.match(
    r.out,
    /check-lint: cache — build-info before start: 1 present \(unvalidated\), 1 missing, 3 unknown\n/
  )
  // Whatever the file looked like, tsc was started for the project with the same flags.
  for (const p of PROJECTS)
    assert.ok(
      r.calls.some(
        (c) =>
          JSON.stringify(c.args) === JSON.stringify(tscArgs(p, ['--incremental', '--tsBuildInfoFile', at(p)]))
      ),
      `tsc was not started as before for ${p}`
    )
  assert.ok(r.out.includes(GREEN))
})

test('build-info that is a directory, or malformed JSON, or under a path that is not a directory', async () => {
  const dir = fixture()
  const cache = '.cache/tsc'
  mkdirSync(buildInfoPath(dir, cache, 'packages/a'), { recursive: true })
  writeFileSync(buildInfoPath(dir, cache, 'packages/b'), '{ not json')
  const r = await run(dir, { env: { TRACY_TSC_CACHE_DIR: cache } })
  assert.equal(r.code, 0, r.out)
  assert.match(projectLine(r.out, 'packages/a'), /\[build-info before start: unknown[^\]]*\]$/)
  // Content is never opened, so a malformed file is "present" — and the word next to it says why
  // that is not a claim about validity.
  assert.match(projectLine(r.out, 'packages/b'), /\[build-info before start: present, unvalidated\]$/)

  const blocked = fixture()
  writeFileSync(join(blocked, 'not-a-dir'), 'x')
  const r2 = await run(blocked, { env: { TRACY_TSC_CACHE_DIR: 'not-a-dir' } })
  assert.equal(r2.code, 0, r2.out)
  for (const p of PROJECTS)
    assert.match(projectLine(r2.out, p), /\[build-info before start: unknown[^\]]*\]$/)
  assert.match(r2.out, /build-info before start: 0 present \(unvalidated\), 0 missing, 5 unknown\n/)
})

test('cold then warm: the report is a snapshot taken BEFORE each project, not the state afterwards', async () => {
  const dir = fixture()
  const env = { TRACY_TSC_CACHE_DIR: '.cache/tsc' }
  const plan = Object.fromEntries(PROJECTS.map((p) => [`tsc:${p}`, { writeBuildInfo: true, delayMs: 50 }]))

  const cold = await run(dir, { env, plan })
  assert.equal(cold.code, 0, cold.out)
  // Every file exists by the time the run ends — and the cold run still reports none of them.
  for (const p of PROJECTS) assert.ok(existsSync(buildInfoPath(dir, '.cache/tsc', p)))
  assert.match(cold.out, /build-info before start: 0 present \(unvalidated\), 5 missing, 0 unknown\n/)

  const warm = await run(dir, { env, plan })
  assert.equal(warm.code, 0, warm.out)
  assert.match(warm.out, /build-info before start: 5 present \(unvalidated\), 0 missing, 0 unknown\n/)
  // Same commands both times: a present build-info changes the report, never the invocation.
  assert.deepEqual(warm.calls.map((c) => c.args).sort(), cold.calls.map((c) => c.args).sort())
})

test('a present build-info and an exact restore cannot turn a failing project green', async () => {
  const dir = fixture()
  const cache = '.cache/tsc'
  mkdirSync(join(dir, cache), { recursive: true })
  for (const p of PROJECTS) writeFileSync(buildInfoPath(dir, cache, p), '{"program":{}}')
  const r = await run(dir, {
    env: { TRACY_TSC_CACHE_DIR: cache, ...restoreEnv('true', KEY, KEY) },
    plan: { 'tsc:packages/d': { exit: 2, output: 'd.ts(1,1): error TS0000: planted\n' } }
  })
  assert.equal(r.code, 1, r.out)
  assert.equal(r.calls.filter((c) => c.key.startsWith('tsc:')).length, PROJECTS.length)
  assert.match(
    projectLine(r.out, 'packages/d'),
    /FAILED \(\d+ ms\) \[build-info before start: present, unvalidated\]$/
  )
  assert.ok(!r.out.includes(GREEN))
})

// ── the workflow hands the restore step's own outputs to the gate, and nothing else moved ────────

test('tracy-ci.yml passes the outputs of the step that restores .cache/tsc under the names the gate reads', () => {
  const workflow = load(readFileSync(join(ROOT, '.github/workflows/tracy-ci.yml'), 'utf8'))
  const source = readFileSync(join(ROOT, 'scripts/check-lint.ts'), 'utf8')
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? [])
  const restores = steps.filter(
    (s) => String(s.uses ?? '').startsWith('actions/cache/restore@') && s.with?.path === '.cache/tsc'
  )
  assert.equal(restores.length, 1, 'exactly one step restores the typecheck build-info')
  const [restore] = restores
  assert.ok(restore.id, 'the restore step needs an id for its outputs to be readable')
  // The gate recognises exactly this key shape; a workflow that keys differently must change both.
  assert.equal(restore.with.key, 'tsc-${{ github.sha }}')
  assert.equal(String(restore.with['restore-keys']).trim(), 'tsc-')
  assert.ok(source.includes('const CACHE_KEY = /^tsc-[0-9a-f]{40}$/'), 'check-lint.ts key pattern moved')

  const gate = steps.filter((s) => s.env && 'TRACY_TSC_CACHE_DIR' in s.env)
  assert.equal(gate.length, 1, 'exactly one step runs the gate with the cache directory')
  const out = (name) => `\${{ steps.${restore.id}.outputs.${name} }}`
  const wanted = {
    TRACY_TSC_CACHE_HIT: out('cache-hit'),
    TRACY_TSC_CACHE_MATCHED_KEY: out('cache-matched-key'),
    TRACY_TSC_CACHE_PRIMARY_KEY: out('cache-primary-key')
  }
  for (const [name, value] of Object.entries(wanted)) {
    assert.equal(gate[0].env[name], value)
    assert.ok(source.includes(name), `check-lint.ts does not read ${name}`)
  }
  // Every TRACY_TSC_CACHE_* name the gate reads is one the workflow sets — no report fed by nothing.
  const read = new Set(source.match(/TRACY_TSC_CACHE_[A-Z_]+/g))
  assert.deepEqual([...read].sort(), ['TRACY_TSC_CACHE_DIR', ...Object.keys(wanted)].sort())
})
