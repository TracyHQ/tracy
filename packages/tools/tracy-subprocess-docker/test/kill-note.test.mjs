/**
 * A command the kernel kills inside the site's container — its memory cap, since 28/09/2026 —
 * comes back from `docker exec` as a bare exit 137. These pin the line that makes it readable: what
 * the probe reads, what the agent is told for each answer, that the line sits after the command's
 * own stderr at every offset a reader may ask for, and that it is asked for ONLY after an exit 137
 * nothing on this side caused.
 *
 *   node --test packages/tools/tracy-subprocess-docker/test/kill-note.test.mjs
 */
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { MARKER } from '@tracy/dsh-sandbox-docker/stamp'

import { DockerSubprocessRuntime } from '../index.js'
import {
  KILLED_EXIT,
  KILL_PROBE_SCRIPT,
  killNote,
  killProbeArgv,
  parseKillProbe,
  withNote
} from '../src/kill-note.mjs'

/** What the probe prints on a cgroup-v2 container capped at 3 GiB that has had two kills. */
const V2_CAPPED = 'max 3221225472\nlow 0\nhigh 0\nmax 12\noom 2\noom_kill 2\noom_group_kill 0\n'

test('parseKillProbe reads the cap and the kill count, v2 and v1, and nothing else', () => {
  assert.deepEqual(parseKillProbe(V2_CAPPED), { memoryMax: 3221225472, oomKills: 2 })
  assert.deepEqual(parseKillProbe('max max\nlow 0\noom 0\noom_kill 0\n'), { memoryMax: null, oomKills: 0 })
  // cgroup v1: `memory.limit_in_bytes` of an uncapped container is a page-rounded 2^63.
  assert.deepEqual(parseKillProbe('max 9223372036854771712\noom_kill_disable 0\nunder_oom 0\noom_kill 1\n'), {
    memoryMax: null,
    oomKills: 1
  })
  assert.deepEqual(parseKillProbe('max 1073741824\noom_kill_disable 0\nunder_oom 0\noom_kill 4\n'), {
    memoryMax: 1073741824,
    oomKills: 4
  })
  for (const garbage of ['', 'sh: cat: not found', 'max 1g\noom_kill 1\n', 'max 100\noom 1\n', undefined])
    assert.equal(parseKillProbe(garbage), null, JSON.stringify(garbage))
})

test('killNote names the cap and the kills, says "most likely", and says nothing without an answer', () => {
  const capped = killNote({ memoryMax: 3221225472, oomKills: 2 })
  assert.match(capped, /^\[subprocess-docker: exit 137 is a SIGKILL: /)
  assert.match(capped, /capped at 3072 MiB of memory, and the kernel has killed 2 processes in it/)
  assert.match(capped, /most likely ran out of memory/)
  assert.match(capped, /Running it again the same way fails the same way/)
  assert.match(killNote({ memoryMax: 2147483648, oomKills: 1 }), /killed 1 process in it/)
  assert.match(killNote({ memoryMax: null, oomKills: 1 }), /the machine ran short of memory/)
  const clean = killNote({ memoryMax: 3221225472, oomKills: 0 })
  assert.match(clean, /records no process killed for memory — it was not the memory cap/)
  assert.doesNotMatch(clean, /ran out of memory/)
  assert.equal(killNote(null), '')
})

test('the probe execs as the command user into the command container, reading only cgroup files', () => {
  assert.deepEqual(killProbeArgv({ user: 'nobody', container: 'wpdemo-web-1', cfg: { docker: 'docker' } }), [
    'docker',
    'exec',
    '-u',
    'nobody',
    'wpdemo-web-1',
    'sh',
    '-c',
    KILL_PROBE_SCRIPT
  ])
  assert.doesNotMatch(
    KILL_PROBE_SCRIPT,
    /\b(kill|rm|echo [^"]*>|tee)\b/,
    'the probe reads; it changes nothing'
  )
})

/** A stand-in with the local collector's offset semantics: `total` bytes seen, a tail window kept. */
function collector(text, keep = Infinity) {
  const bytes = Buffer.from(text, 'utf8')
  const start = Math.max(0, bytes.length - keep)
  return {
    readFrom(fromByte) {
      const lossy = fromByte < start
      const slice = lossy ? bytes.subarray(start) : bytes.subarray(Math.min(fromByte, bytes.length))
      return { text: slice.toString('utf8'), nextOffset: bytes.length, lossy }
    }
  }
}

test('withNote puts the line after the stream at every offset, and is invisible until there is one', () => {
  let note = ''
  const reader = withNote(collector('Killed'), () => note)
  assert.deepEqual(reader.readFrom(0), { text: 'Killed', nextOffset: 6, lossy: false })
  note = '[subprocess-docker: note]'
  // A stream that does not end in a newline gets one before the line.
  const whole = reader.readFrom(0)
  assert.equal(whole.text, 'Killed\n[subprocess-docker: note]\n')
  assert.equal(whole.nextOffset, Buffer.byteLength(whole.text))
  // A reader that already had the stream gets the line alone, then nothing.
  assert.equal(reader.readFrom(6).text, '\n[subprocess-docker: note]\n')
  assert.equal(reader.readFrom(7).text, '[subprocess-docker: note]\n')
  assert.equal(reader.readFrom(whole.nextOffset).text, '')
  assert.equal(reader.readFrom(whole.nextOffset).nextOffset, whole.nextOffset)
  // An empty stream: the line alone, no blank line before it.
  assert.equal(withNote(collector(''), () => 'L').readFrom(0).text, 'L\n')
  // A stream ending in a newline: no second one.
  assert.equal(withNote(collector('out\n'), () => 'L').readFrom(0).text, 'out\nL\n')
  // A tail window that lost its head keeps saying so.
  const lossy = withNote(collector('0123456789\n', 4), () => 'L').readFrom(0)
  assert.equal(lossy.lossy, true)
  assert.equal(lossy.text, '789\nL\n')
})

// ── the provider: when the probe runs, and what reaches the shell tool ─────────────────────────

function provider(cfg) {
  const p = Object.create(DockerSubprocessRuntime.prototype)
  p.cfg = {
    docker: 'docker',
    sitesRoot: '/site',
    containerRoot: '/site',
    containerName: '{label}-web-1',
    ...cfg
  }
  p.reap = () => {}
  return p
}

/**
 * Replace the local runtime's spawn for one test; `next()` is asked for the handle on each call. One
 * stub per test: a second one would capture the first as its "original" and leak it past the test.
 */
function stubLocal(t, next) {
  const original = LocalSubprocessRuntime.prototype.spawn
  LocalSubprocessRuntime.prototype.spawn = () => next()
  t.after(() => {
    LocalSubprocessRuntime.prototype.spawn = original
  })
}

/** A docker CLI that answers the probe from a file and logs its argv. */
function fakeDocker(t, answer, exit = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'kill-note-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const log = join(dir, 'log')
  writeFileSync(join(dir, 'answer'), answer)
  writeFileSync(
    join(dir, 'docker'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\ncat '${join(dir, 'answer')}'\nexit ${exit}\n`
  )
  chmodSync(join(dir, 'docker'), 0o755)
  const calls = () => {
    try {
      return readFileSync(log, 'utf8').split('\n').filter(Boolean)
    } catch {
      return [] // never called: no log written
    }
  }
  return { docker: join(dir, 'docker'), calls }
}

const SPEC = {
  argv: [MARKER, '--mode', 'workspace-write', '--root', '/site/wpdemo', '--', 'bash', '-c', 'node build.js'],
  cwd: '/site/wpdemo',
  stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } },
  graceMs: 1000
}

function handleFor(outcome, stderr = '') {
  return {
    done: Promise.resolve(outcome),
    terminate() {},
    collected: { stdout: collector(''), stderr: collector(stderr) }
  }
}

test('an exit 137 nobody here caused: the container is asked, and the line reaches the stderr reader', async (t) => {
  const fake = fakeDocker(t, V2_CAPPED)
  const p = provider({ docker: fake.docker })
  const killed = handleFor(
    { exitCode: KILLED_EXIT, signal: null },
    'bash: line 1:    42 Killed    node build.js'
  )
  stubLocal(t, () => killed)
  const handle = p.spawn(SPEC)
  const outcome = await handle.done
  assert.deepEqual(outcome, { exitCode: KILLED_EXIT, signal: null }, 'the outcome itself is untouched')
  const text = handle.collected.stderr.readFrom(0).text
  assert.match(
    text,
    /^bash: line 1: {4}42 Killed {4}node build\.js\n\[subprocess-docker: exit 137 is a SIGKILL: /
  )
  assert.match(text, /capped at 3072 MiB/)
  const [call] = fake.calls()
  assert.match(call, /^exec -u www-data wpdemo-web-1 sh -c /, 'as the command user, in the command container')
  assert.equal(handle.collected.stdout.readFrom(0).text, '', 'stdout is left alone')
})

test('no probe, no line: another exit, a signal on the CLI, a timeout, or a probe that fails', async (t) => {
  const cases = [
    ['a clean exit', { exitCode: 0, signal: null }, undefined, V2_CAPPED, 0],
    ['an ordinary failure', { exitCode: 1, signal: null }, undefined, V2_CAPPED, 0],
    ['the docker CLI killed by us', { exitCode: null, signal: 'SIGKILL' }, undefined, V2_CAPPED, 0],
    [
      'a timeout (aborted signal)',
      { exitCode: KILLED_EXIT, signal: null },
      AbortSignal.abort(),
      V2_CAPPED,
      0
    ],
    ['a probe docker refused', { exitCode: KILLED_EXIT, signal: null }, undefined, V2_CAPPED, 1],
    ['a probe that printed nonsense', { exitCode: KILLED_EXIT, signal: null }, undefined, 'hello', 0]
  ]
  let current
  stubLocal(t, () => current)
  for (const [name, outcome, signal, answer, exit] of cases) {
    const fake = fakeDocker(t, answer, exit)
    const p = provider({ docker: fake.docker })
    current = handleFor(outcome, 'err')
    const handle = p.spawn({ ...SPEC, signal })
    await handle.done
    assert.equal(handle.collected.stderr.readFrom(0).text, 'err', name)
    const probed = fake.calls().length > 0
    assert.equal(
      probed,
      exit === 1 || answer === 'hello',
      `${name}: probed only when the exit was ours to explain`
    )
  }
})

test('a handle with no collected stderr is returned as it came: nowhere to put a line', async (t) => {
  const p = provider({})
  const done = Promise.resolve({ exitCode: KILLED_EXIT, signal: null })
  const bare = { done, terminate() {} }
  stubLocal(t, () => bare)
  const handle = p.spawn(SPEC)
  assert.equal(handle, bare)
  assert.equal(handle.done, done, 'done is not re-wrapped when there is nothing to add')
})
