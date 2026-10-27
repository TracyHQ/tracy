// Execution contract for running a sibling repository's suite: the source is a read-only copy of ONE commit, the suite
// writes only into its own work folder, can read file CONTENT only inside its copy and the declared system and runtime
// roots (every other path is denied by default: the person's home, the original clones, this repository), and has no
// network. Metadata (stat) stays readable so tools can resolve their working directory; content and listings do not. The contract is enforced by the OS (macOS sandbox-exec) and is trusted only after probes SAW it allow
// what it must allow and deny what it must deny. There is no unfenced fallback: no fence means the suite does not run.
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnBounded } from '../../cms/lib/kit.mjs'
import { readBytesAsync, readTextAsync } from '../../../lib/bounded-reader.mjs'

const SANDBOX = '/usr/bin/sandbox-exec'
const q = (v) => JSON.stringify(v)

/** System locations every runtime needs to load; these hold the operating system and tools, no person's data. */
export const SYSTEM_READ_ROOTS = Object.freeze([
  '/usr',
  '/bin',
  '/sbin',
  '/System',
  '/Library',
  '/private/etc',
  '/private/var/select',
  '/private/var/db',
  '/opt/homebrew',
  '/dev'
])

/** A probe ran to its own answer only when it was not killed, cut off or unstartable. */
const answered = (r) => !r.spawnError && !r.timedOut && !r.truncated && !r.signal && Number.isInteger(r.exit)

export async function realDir(p) {
  return fs.realpath(p)
}

/**
 * Where a tool lives: { root } (<prefix> of <prefix>/bin/<tool>), { absent: true } when `command -v` ran to the answer
 * "not found", or { unknown: true } when the lookup itself could not answer (never read as absence).
 */
export async function toolRoot(name, env) {
  const r = await spawnBounded({ argv: ['sh', '-c', 'command -v -- "$1"', '_', name], env, timeoutMs: 5000 })
  if (!answered(r)) return { unknown: true }
  // Only the shell's own "not found" (exit 1, nothing printed) is absence; 127 or anything else is a failed probe.
  if (r.exit === 1 && r.stdout.trim() === '') return { absent: true }
  if (r.exit !== 0) return { unknown: true }
  const exe = await fs.realpath(r.stdout.trim()).catch(() => null)
  if (!exe || !path.isAbsolute(exe)) return { unknown: true }
  const prefix = path.dirname(path.dirname(exe))
  return { exe, root: prefix === path.parse(prefix).root ? path.dirname(exe) : prefix }
}

/**
 * Build the fence. Returns { wrap, policy } or { gap: 'ENV' | 'PENDING', reason }.
 * ENV: the probes ran and showed the capability is missing. PENDING: a probe could not give an answer.
 */
export async function buildFence({ scratch, writeDir, denyRead, allowRead, env }) {
  const present = await fs.stat(SANDBOX).then(
    (st) => st.isFile(),
    () => false
  )
  if (!present) return { gap: 'ENV', reason: `${SANDBOX} is not present, so no OS fence can be built` }
  // The probe zone is a folder this call creates and removes; its name is unpredictable and nothing else lives in it.
  const zone = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'qa-fence-'))
  let server = null
  try {
    const sentinel = path.join(zone, 'sentinel.txt')
    await fs.writeFile(sentinel, 'untouched')
    const denied = [...new Set(denyRead)]
    // An allowed root that holds a place the suite must not see (the person's home, a clone, this repository, the
    // results folder) would open it: refuse to build the fence rather than run with it.
    const within = (a, b) => b === a || b.startsWith(a.endsWith('/') ? a : `${a}/`)
    for (const root of allowRead)
      for (const d of denied)
        if (within(root, d))
          return {
            gap: 'PENDING',
            reason: `runtime root ${root} contains ${d}, which the suite must not read; the read scope cannot be narrowed`
          }
    const reads = [...new Set([scratch, ...SYSTEM_READ_ROOTS, ...allowRead])]
    const profile = [
      // Read content is denied everywhere by default; stat stays readable; then exactly the declared roots are opened.
      '(version 1)(allow default)(deny file-write*)(deny network*)(deny file-read*)(allow file-read-metadata)',
      '(allow file-read* (literal "/"))', // the root directory entry itself: the dynamic loader cannot start without it
      ...reads.map((d) => `(allow file-read* (subpath ${q(d)}))`),
      `(allow file-write* (subpath ${q(writeDir)}) (literal "/dev/null") (literal "/dev/dtracehelper") (literal "/dev/tty"))`
    ].join('')
    const wrap = (argv) => [SANDBOX, '-p', profile, ...argv]
    const run = (argv, timeoutMs = 15_000) => spawnBounded({ argv, env, timeoutMs, maxBytes: 100_000 })
    const probeFile = path.join(writeDir, '.fence-probe')

    server = createServer((s) => s.end())
    await new Promise((res) => server.listen(0, '127.0.0.1', res))
    const port = server.address().port
    const dial = `const s=require('net').connect(+process.argv[1],'127.0.0.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(9))`
    const checks = [
      {
        name: 'write inside the work folder',
        argv: wrap(['/bin/sh', '-c', 'echo ok > "$1"', '_', probeFile]),
        want: (r) => r.exit === 0
      },
      {
        name: 'write outside the work folder',
        argv: wrap(['/bin/sh', '-c', 'echo no > "$1"', '_', path.join(zone, 'new.txt')]),
        want: (r) => r.exit !== 0
      },
      {
        name: 'overwrite of a file outside the work folder',
        argv: wrap(['/bin/sh', '-c', 'echo no > "$1"', '_', sentinel]),
        want: (r) => r.exit !== 0
      },
      {
        name: 'read of a denied folder',
        argv: wrap(['/bin/cat', sentinel]),
        want: (r) => r.exit !== 0 && r.stdout === ''
      },
      {
        name: 'read through a symlink that points outside every declared root',
        setup: () => fs.symlink(sentinel, path.join(writeDir, '.fence-link')),
        argv: wrap(['/bin/cat', path.join(writeDir, '.fence-link')]),
        want: (r) => r.exit !== 0 && r.stdout === ''
      },
      {
        name: 'read of a path outside the declared roots by absolute path',
        argv: wrap([
          process.execPath,
          '-e',
          `process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8'))`,
          sentinel
        ]),
        want: (r) => r.exit !== 0 && r.stdout === ''
      },
      {
        name: 'runtime starts inside the fence',
        argv: wrap([process.execPath, '-e', 'process.exit(0)']),
        want: (r) => r.exit === 0
      },
      {
        name: 'read of the source copy',
        argv: wrap(['/bin/cat', path.join(writeDir, '.fence-probe')]),
        want: (r) => r.exit === 0
      },
      {
        name: 'network connect',
        argv: wrap([process.execPath, '-e', dial, String(port)]),
        want: (r) => r.exit === 9 // the dial's own refusal code, so a runtime that failed to start is not read as a denial
      },
      {
        name: 'network control (unfenced)',
        argv: [process.execPath, '-e', dial, String(port)],
        want: (r) => r.exit === 0
      }
    ]
    const seen = []
    for (const c of checks) {
      await c.setup?.()
      const r = await run(c.argv)
      if (!answered(r))
        return {
          gap: 'PENDING',
          reason: `fence probe "${c.name}" could not run to an answer (${r.spawnError ?? (r.timedOut ? 'timeout' : (r.signal ?? 'cut off'))})`
        }
      if (!c.want(r))
        return {
          gap: 'ENV',
          reason: `fence probe "${c.name}" did not behave as required (exit ${r.exit}): this machine cannot enforce the execution contract`
        }
      seen.push(c.name)
    }
    if ((await readTextAsync(sentinel)) !== 'untouched')
      return { gap: 'ENV', reason: 'a fenced write changed the sentinel file: the fence does not hold' }
    await fs.rm(probeFile, { force: true })
    await fs.rm(path.join(writeDir, '.fence-link'), { force: true })
    return {
      wrap,
      policy: {
        backend: 'sandbox-exec',
        writeAllowed: [writeDir],
        readDefault: 'denied (content and listings); metadata readable',
        readAllowed: reads,
        readNamedDenied: denied,
        network: 'denied',
        probesPassed: seen
      }
    }
  } finally {
    if (server) await new Promise((res) => server.close(res))
    await fs.rm(zone, { recursive: true, force: true })
  }
}

/** Hash every entry of a tree by lstat: regular files by content, symlinks by target. Anything else invalidates it. */
export async function fingerprintTree(root) {
  const h = createHash('sha256')
  let entries = 0
  const walk = async (dir, rel) => {
    const names = (await fs.readdir(dir)).sort()
    for (const n of names) {
      const abs = path.join(dir, n)
      const r = path.posix.join(rel, n)
      const st = await fs.lstat(abs)
      entries++
      if (st.isDirectory()) {
        h.update(`d ${r}\0`)
        await walk(abs, r)
      } else if (st.isFile()) {
        h.update(
          `f ${r} ${st.mode & 0o111 ? 'x' : '-'} ${createHash('sha256')
            .update(await readBytesAsync(abs))
            .digest('hex')}\0`
        )
      } else if (st.isSymbolicLink()) {
        h.update(`l ${r} ${await fs.readlink(abs)}\0`)
      } else {
        throw new Error(`${r} is neither a regular file, a directory nor a symlink`)
      }
    }
  }
  try {
    await walk(root, '')
  } catch (error) {
    return { ok: false, reason: error.message }
  }
  return { ok: true, sha256: h.digest('hex'), entries }
}

/**
 * Put exactly commit `sha` of `cloneDir` into the empty folder `dest`, using separate commands whose exits are checked.
 * The path list comes from git's own tree listing and is vetted before anything is extracted.
 */
export async function extractCommit({ cloneDir, sha, dest, work }) {
  const step = async (name, argv, opts = {}) => {
    const r = await spawnBounded({ argv, timeoutMs: 120_000, maxBytes: 20_000_000, ...opts })
    if (!answered(r) || r.exit !== 0 || r.truncated)
      throw new Error(
        `${name} failed (${r.spawnError ?? (r.timedOut ? 'timeout' : r.truncated ? 'cut off' : `exit ${r.exit}${r.signal ? ` ${r.signal}` : ''}`)}): ${r.stderr.trim().slice(0, 200)}`
      )
    return r
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`not a full commit id: ${sha}`)
  const tree = await step('git ls-tree', ['git', '-C', cloneDir, 'ls-tree', '-r', '-z', '--full-tree', sha])
  let expected = 0
  for (const rec of tree.stdout.split('\0').filter(Boolean)) {
    const m = /^(\d{6}) (\w+) [0-9a-f]{40}\t([\s\S]+)$/.exec(rec)
    if (!m) throw new Error('unreadable git tree entry')
    const [, mode, type, name] = m
    if (name.startsWith('/') || name.split('/').some((p) => p === '..' || p === '' || p === '.'))
      throw new Error(`tree entry with an unsafe path: ${JSON.stringify(name)}`)
    if (type === 'commit') continue // a submodule is an empty folder: its code is not part of this commit
    if (!['100644', '100755', '120000'].includes(mode))
      throw new Error(`tree entry ${JSON.stringify(name)} has unsupported mode ${mode}`)
    expected++
  }
  const tarFile = path.join(work, 'commit.tar')
  await step('git archive', ['git', '-C', cloneDir, 'archive', '--format=tar', `--output=${tarFile}`, sha])
  await step('tar extract', ['tar', '-xf', tarFile, '-C', dest, '--no-same-owner'])
  await fs.rm(tarFile, { force: true })
  return { expectedFiles: expected }
}

/** Count files and symlinks under a tree (directories excluded), by lstat. */
export async function countLeaves(root) {
  let n = 0
  const walk = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(path.join(dir, e.name))
      else n++
    }
  }
  await walk(root)
  return n
}
