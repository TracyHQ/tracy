import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const TRACER = pathToFileURL(path.join(ROOT, 'scripts/ci/trace-reads.mjs')).href

/**
 * Runs a throwaway test file under the tracer with the real `node --test` (each file in its own
 * child process, as the suites run) and returns the lines the tracer wrote.
 */
function traced(source, { tracer = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-trace-test-'))
  try {
    const file = path.join(dir, 'reads.test.mjs')
    const out = path.join(dir, 'reads.txt')
    writeFileSync(file, source)
    // '' and not absent: this suite may itself run under the tracer, and the inner run must not inherit its file.
    const env = { ...process.env, TRACE_TEST_ROOT: ROOT, TRACY_TRACE_READS_OUT: '' }
    // Set by the `node --test` running THIS file; with it the inner runner reports to a parent that
    // is not listening and exits 0 whatever its tests did.
    delete env.NODE_TEST_CONTEXT
    // The suite this file belongs to may itself be traced: the inner run gets its own tracer only.
    env.NODE_OPTIONS = `--import=${TRACER}`
    if (tracer) env.TRACY_TRACE_READS_OUT = out
    const run = spawnSync(process.execPath, ['--test', file], { cwd: dir, env, encoding: 'utf8' })
    let lines = []
    try {
      lines = readFileSync(out, 'utf8').split('\n').filter(Boolean)
    } catch {}
    // When this suite is itself being measured, what the inner run read is what this suite depends
    // on (those files must exist): hand it to the outer trace, which cannot see into the inner one.
    if (process.env.TRACY_TRACE_READS_OUT && lines.length > 0)
      appendFileSync(process.env.TRACY_TRACE_READS_OUT, `${lines.join('\n')}\n`)
    return { status: run.status, output: `${run.stdout}${run.stderr}`, lines: new Set(lines) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const HEAD = `
import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
const at = (...p) => path.join(process.env.TRACE_TEST_ROOT, ...p)
`

test('reads through NAMED fs imports are recorded under node --test, not only fs.<name>', () => {
  // The regression: `import { readFileSync } from 'node:fs'` bound the unwrapped function, so a
  // suite that read the workflow and the env example recorded neither.
  const run = traced(`${HEAD}
import fs, { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
test('reads', async () => {
  readFileSync(at('.github/workflows/tracy-ci.yml'))
  await readFile(at('deploy/.env.example'))
  fs.readFileSync(at('.node-version'))
  statSync(at('pnpm-workspace.yaml'))
  assert.equal(existsSync(at('deploy/no-such-file.example')), false)
  readdirSync(at('.github/workflows'))
  readdirSync(at('scripts/ci'), { recursive: true })
  assert.equal(readFileSync.tracyTraced, true)
})`)
  assert.equal(run.status, 0, run.output)
  for (const want of [
    '.github/workflows/tracy-ci.yml',
    'deploy/.env.example',
    '.node-version',
    'pnpm-workspace.yaml',
    'deploy/no-such-file.example',
    '.github/workflows',
    'scripts/ci/**'
  ])
    assert.ok(run.lines.has(want), `the trace lacks ${want}: ${[...run.lines].join(' ')}`)
})

test('a child process is followed: a kill before it could exit; one the tracer cannot enter leaves its command line', () => {
  const run = traced(`${HEAD}
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
test('children', async () => {
  // A child given an env of its own drops NODE_OPTIONS and the tracer with it — and gets exactly the
  // env it was given: the path on its command line is what the trace keeps.
  const own = spawnSync(process.execPath, ['-e', "require('node:fs').readFileSync(process.argv[1]); console.log(JSON.stringify(Object.keys(process.env).filter((k) => /TRACY_TRACE|NODE_OPTIONS/.test(k))))", at('turbo.json')], { env: { PATH: process.env.PATH }, encoding: 'utf8' })
  assert.equal(own.status, 0, String(own.stderr))
  assert.equal(own.stdout.trim(), '[]', 'the tracer must not add to a child environment')
  // A server a test kills never reaches an exit handler; what it read must be on file already.
  const server = spawn(process.execPath, ['-e', "require('node:fs').readFileSync(process.argv[1]); console.log('up'); setInterval(() => {}, 1000)", at('pnpm-lock.yaml')], { stdio: ['ignore', 'pipe', 'inherit'] })
  await once(server.stdout, 'data')
  server.kill('SIGKILL')
  await once(server, 'exit')
  // What cat opens cannot be seen; the repository path on its command line can.
  assert.equal(spawnSync('cat', [at('.node-version')]).status, 0)
  assert.equal(spawnSync('ls', [], { cwd: at('deploy') }).status, 0)
})`)
  assert.equal(run.status, 0, run.output)
  for (const want of ['turbo.json', 'pnpm-lock.yaml', '.node-version', 'deploy'])
    assert.ok(run.lines.has(want), `the trace lacks ${want}: ${[...run.lines].join(' ')}`)
})

test('a read through a node_modules link is recorded where the link points; a third-party package is not', () => {
  const run = traced(`${HEAD}
import { readFileSync } from 'node:fs'
test('links', () => {
  readFileSync(at('node_modules/@deepseek-ai/dsh/package.json'))
  readFileSync(at('node_modules/typescript/package.json'))
})`)
  assert.equal(run.status, 0, run.output)
  const lines = [...run.lines]
  assert.ok(
    lines.some((l) => l.startsWith('vendor/tracy/deepseek-harness/') && l.endsWith('/package.json')),
    `the workspace link was not followed: ${lines.join(' ')}`
  )
  assert.ok(!lines.some((l) => l.includes('node_modules')), lines.join(' '))
})

test('modules a suite imports are recorded, and nothing outside the repository is', () => {
  const run = traced(`${HEAD}
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
test('imports', async () => {
  await import(pathToFileURL(at('scripts/ci/turbo-inputs.mjs')).href)
  try { readFileSync(path.join(tmpdir(), 'tracy-trace-test-absent')) } catch {}
})`)
  assert.equal(run.status, 0, run.output)
  assert.ok(run.lines.has('scripts/ci/turbo-inputs.mjs'), [...run.lines].join(' '))
  for (const line of run.lines) assert.ok(!path.isAbsolute(line) && !line.startsWith('..'), line)
})

test('without TRACY_TRACE_READS_OUT the preload changes nothing', () => {
  const run = traced(
    `${HEAD}
import { readFileSync } from 'node:fs'
test('untouched', () => {
  assert.equal(Object.hasOwn(readFileSync, 'tracyTraced'), false)
})`,
    { tracer: false }
  )
  assert.equal(run.status, 0, run.output)
  assert.equal(run.lines.size, 0)
})
