import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runScript } from '../src/run.js'

/**
 * True once `pid` has stopped running. A process killed with its group is first a ZOMBIE until its
 * new parent (init, or the container's init) reaps it, and `kill(pid, 0)` still succeeds on a
 * zombie: that gap is what failed this suite on CI about once in a hundred runs ("Missing expected
 * exception" — reproduced 1–2 in 200 in a Linux container, never on macOS). Reaping is not
 * runScript's doing, so a zombie counts as dead here.
 */
function exited(pid) {
  try {
    process.kill(pid, 0)
  } catch (e) {
    if (e.code === 'ESRCH') return true
    throw e
  }
  let state = ''
  try {
    // /proc/<pid>/stat: "pid (comm) S …" — the state follows the LAST ')' (comm may hold one).
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    state = stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3)
  } catch {
    try {
      state = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim()
    } catch {
      return true // ps found no such process: reaped between the two looks.
    }
  }
  return state.startsWith('Z')
}

/** Polls `exited(pid)` every 20 ms, up to `ceilingMs`; the last answer. */
async function exitsWithin(pid, ceilingMs) {
  const deadline = Date.now() + ceilingMs
  while (!exited(pid)) {
    if (Date.now() >= deadline) return false
    await new Promise((r) => setTimeout(r, 20))
  }
  return true
}

async function tmpScript(contents) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tracy-host-run-'))
  const file = path.join(dir, 'script.sh')
  await writeFile(file, contents, { mode: 0o755 })
  return { dir, file }
}

test('runScript: runs a script through bash, streams lines to onLine in order, exit code 0', async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\necho one\necho two\necho three\n')
  const seen = []
  const { code, tail } = await runScript({ script: 'bash', args: [file], onLine: (line) => seen.push(line) })
  assert.equal(code, 0)
  assert.deepEqual(seen, ['one', 'two', 'three'])
  assert.deepEqual(tail, ['one', 'two', 'three'])
})

test('runScript: args reach the script — same shape /health uses (script + args, no shell string)', async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\necho "site=$1 label=$2"\n')
  const seen = []
  await runScript({ script: 'bash', args: [file, 'example.com', 'lantern'], onLine: (l) => seen.push(l) })
  assert.deepEqual(seen, ['site=example.com label=lantern'])
})

test('runScript: a non-zero exit propagates as `code`', async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\necho about to fail\nexit 7\n')
  const { code, tail } = await runScript({ script: 'bash', args: [file] })
  assert.equal(code, 7)
  assert.deepEqual(tail, ['about to fail'])
})

test("runScript: stdout and stderr are merged into one ordered stream, like Python's stderr=STDOUT", async () => {
  const { file } = await tmpScript(
    '#!/usr/bin/env bash\necho out-1\necho err-1 >&2\necho out-2\necho err-2 >&2\n'
  )
  const seen = []
  await runScript({ script: 'bash', args: [file], onLine: (l) => seen.push(l) })
  assert.deepEqual(seen, ['out-1', 'err-1', 'out-2', 'err-2'])
})

test('runScript: writes every line to logPath as it arrives', async () => {
  const { dir, file } = await tmpScript('#!/usr/bin/env bash\necho alpha\necho beta\n')
  const logPath = path.join(dir, 'nested', 'run.log')
  await runScript({ script: 'bash', args: [file], logPath })
  assert.equal(await readFile(logPath, 'utf8'), 'alpha\nbeta\n')
})

test('runScript: logPath is optional — omitting it never throws and writes nothing', async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\necho only-line\n')
  const { code } = await runScript({ script: 'bash', args: [file] })
  assert.equal(code, 0)
})

test('runScript: onLine is optional', async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\necho fine\n')
  const { code, tail } = await runScript({ script: 'bash', args: [file] })
  assert.equal(code, 0)
  assert.deepEqual(tail, ['fine'])
})

test('runScript: tail is capped at the last 200 lines, not the whole output — an unbounded tail is a memory leak', async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\nfor i in $(seq 1 250); do echo "line $i"; done\n')
  const { code, tail } = await runScript({ script: 'bash', args: [file] })
  assert.equal(code, 0)
  assert.equal(tail.length, 200)
  assert.equal(tail[0], 'line 51') // the FIRST 50 lines fell off the front of the ring buffer
  assert.equal(tail[tail.length - 1], 'line 250')
})

test("runScript: onLine is awaited before the next line is read, so a caller's per-line writes stay ordered", async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\necho a\necho b\necho c\n')
  const order = []
  await runScript({
    script: 'bash',
    args: [file],
    onLine: async (line) => {
      // A slow "job state write" on the first line only — if the loop did not await onLine, the
      // second and third lines' onLine calls could resolve before this one, out of order.
      if (line === 'a') await new Promise((r) => setTimeout(r, 20))
      order.push(line)
    }
  })
  assert.deepEqual(order, ['a', 'b', 'c'])
})

test('runScript: timeoutMs kills the whole process group — the script and what it started — and says so', async () => {
  // The script starts a child of its own (a stand-in for a hung `git push`) and waits on it.
  const { dir, file } = await tmpScript(
    '#!/usr/bin/env bash\nsleep 30 &\necho "child $!"\nwait\necho never\n'
  )
  const logPath = path.join(dir, 'run.log')
  const startedAt = Date.now()
  const result = await runScript({ script: 'bash', args: [file], logPath, timeoutMs: 300 })
  assert.ok(Date.now() - startedAt < 5000, 'returned soon after the limit, not after the sleep')
  assert.equal(result.timedOut, true)
  assert.notEqual(result.code, 0)
  assert.match(result.tail.at(-1), /killed after 300 ms/)
  assert.ok(!result.tail.includes('never'))
  assert.match(await readFile(logPath, 'utf8'), /killed after 300 ms/)

  const pid = Number(result.tail[0].replace('child ', ''))
  assert.ok(await exitsWithin(pid, 5000), 'the grandchild died with the group')
})

test('runScript: idleMs stops a run that went silent, and a run that keeps printing is not stopped by it', async () => {
  // 16/10/2026: a hung provision prints nothing; EmDash's first image build runs ~21 minutes but keeps printing.
  const silent = await tmpScript('#!/usr/bin/env bash\necho start\nsleep 30\necho never\n')
  const startedAt = Date.now()
  const stopped = await runScript({ script: 'bash', args: [silent.file], timeoutMs: 20_000, idleMs: 300 })
  assert.ok(Date.now() - startedAt < 5000, 'stopped by the silence, long before the total limit')
  assert.equal(stopped.timedOut, true)
  assert.equal(stopped.idle, true)
  assert.match(stopped.tail.at(-1), /killed after 300 ms with no output/)

  // A line every 100 ms for ~1 s: never 300 ms of silence, so it runs to its end.
  const busy = await tmpScript(
    '#!/usr/bin/env bash\nfor i in 1 2 3 4 5 6 7 8 9 10; do echo $i; sleep 0.1; done\necho done\n'
  )
  const ran = await runScript({ script: 'bash', args: [busy.file], timeoutMs: 20_000, idleMs: 300 })
  assert.equal(ran.code, 0)
  assert.equal(ran.tail.at(-1), 'done')
  assert.equal(ran.timedOut, undefined)
})

test('runScript: a run that ends inside its time limit is untouched', async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\necho done\n')
  const result = await runScript({ script: 'bash', args: [file], timeoutMs: 10_000 })
  assert.deepEqual(result, { code: 0, tail: ['done'] })
})

// ── A signal is not an exit code ─────────────────────────────────────────────────────────────────
// `close` used to be folded into a number (`code ?? 1`), so a script a signal ended read exactly like
// one that ran to its own `exit 1`. The go-live job then recorded "the script failed" for a run it
// never saw end by itself, and the web side freed the site's reservation on it.

test('runScript: a child ended by a signal has NO exit code — `code` is null and `signal` names it', async () => {
  for (const signal of ['TERM', 'KILL', 'HUP', 'INT']) {
    const { file } = await tmpScript(`#!/usr/bin/env bash\necho alive\nkill -${signal} $$\nsleep 30\n`)
    const result = await runScript({ script: 'bash', args: [file] })
    assert.equal(result.code, null, `SIG${signal} is not an exit code`)
    assert.equal(result.signal, `SIG${signal}`)
    assert.deepEqual(result.tail, ['alive'])
    assert.equal(result.timedOut, undefined)
  }
})

test('runScript: a script that exits 1 by itself still says so — a number, and no signal', async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\necho no\nexit 1\n')
  assert.deepEqual(await runScript({ script: 'bash', args: [file] }), { code: 1, tail: ['no'] })
  // 128+n is what a shell exits with after ITS child was signalled: the script's own ending.
  const { file: relayed } = await tmpScript('#!/usr/bin/env bash\nexit 143\n')
  assert.deepEqual(await runScript({ script: 'bash', args: [relayed] }), { code: 143, tail: [] })
})

test('runScript: over its time limit, the signal this function sent is not turned into an exit code either', async () => {
  const { file } = await tmpScript('#!/usr/bin/env bash\nsleep 30\n')
  const result = await runScript({ script: 'bash', args: [file], timeoutMs: 200 })
  assert.equal(result.timedOut, true)
  assert.equal(result.code, null)
  assert.match(String(result.signal), /^SIG(TERM|KILL)$/)
})

test('runScript: a script that traps the limit signal and exits 0 is still not a success', async () => {
  const { file } = await tmpScript("#!/usr/bin/env bash\ntrap 'exit 0' TERM\nsleep 30 &\nwait\n")
  const result = await runScript({ script: 'bash', args: [file], timeoutMs: 200 })
  assert.equal(result.timedOut, true)
  assert.equal(result.code, 1)
})

test('runScript: a command that does not exist is the shell saying so with an exit code of its own, not a signal', async () => {
  const result = await runScript({ script: '/nonexistent/tracy-host-run-test', args: [] })
  assert.ok(Number.isInteger(result.code) && result.code !== 0, `an exit code: ${result.code}`)
  assert.equal(result.signal, undefined)
})
