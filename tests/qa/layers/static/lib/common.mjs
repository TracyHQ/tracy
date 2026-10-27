/**
 * Shared plumbing of the `static` and `unit` QA layers: strict argument parsing, contained output
 * directories with a single-writer lock, a child runner that streams to a log and kills its whole
 * process group, a TAP reader, a symlink overlay used for scratch copies, manifest validation and
 * the report writers. Contract files are read through the shared bounded reader in `tests/qa/lib`;
 * both layers import this one file so the contract is written once.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BoundedReadError,
  MAX_LAYER_FILE_BYTES,
  readBoundedSync,
  readTextSync
} from '../../../lib/bounded-reader.mjs'

/** Repository root: this file lives at tests/qa/layers/static/lib. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')

export const VERDICTS = ['PASS', 'FAIL', 'ENV', 'PENDING']
export const TARGETS = ['local', 'dev', 'prod']

/** Wrong command line or contract: the CLI exits 2 before any side effect. */
export class UsageError extends Error {}

/**
 * @param {string | Buffer} data - bytes to hash.
 * @returns {string} lowercase hex sha256.
 */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Read a regular file; a symlink, directory, FIFO or device in its place is a contract error.
 * @param {string} path - absolute path.
 * @returns {Buffer} the bytes.
 */
export function readRegular(path) {
  try {
    return readBoundedSync(path, { maxBytes: MAX_LAYER_FILE_BYTES })
  } catch (error) {
    if (!(error instanceof BoundedReadError)) throw error
    if (error.code === 'SYMLINK' || error.code === 'NOT_REGULAR' || error.code === 'REPLACED')
      throw new UsageError(`${path} is not a regular file`)
    throw new UsageError(`cannot read ${path}: ${error.message}`)
  }
}

/**
 * @param {string[]} args - git arguments.
 * @param {string} [cwd] - repository.
 * @returns {string} trimmed stdout; throws when git fails.
 */
export function git(args, cwd = REPO) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return r.stdout.trim()
}

/** @returns {string} the checked-out commit. */
export function gitHead() {
  return git(['rev-parse', 'HEAD'])
}

/**
 * Strict flag parser: unknown flags, repeated single flags, missing values and positional words are
 * all usage errors.
 * @param {string[]} argv - arguments after the script name.
 * @param {Record<string, {type: 'string' | 'boolean', repeat?: boolean}>} spec - allowed flags.
 * @returns {Record<string, string | boolean | string[]>} parsed values.
 */
export function parseArgs(argv, spec) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) throw new UsageError(`unexpected argument: ${token}`)
    const eq = token.indexOf('=')
    const name = eq === -1 ? token.slice(2) : token.slice(2, eq)
    const def = spec[name]
    if (def === undefined) throw new UsageError(`unknown flag: --${name}`)
    let value = true
    if (def.type === 'string') {
      if (eq !== -1) value = token.slice(eq + 1)
      else {
        const next = argv[i + 1]
        if (next === undefined || next.startsWith('--')) throw new UsageError(`--${name} needs a value`)
        value = next
        i += 1
      }
      if (value === '') throw new UsageError(`--${name} needs a non-empty value`)
    } else if (eq !== -1) throw new UsageError(`--${name} takes no value`)
    if (def.repeat) out[name] = [...(out[name] ?? []), value]
    else if (name in out) throw new UsageError(`--${name} given twice`)
    else out[name] = value
  }
  return out
}

/** @returns {string} UTC timestamp usable in a directory name. */
export function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

/**
 * Roots an output directory may live under: the repository's `qa-results`, the artifact root named
 * by QA_ARTIFACT_ROOT and the OS temp dir.
 * @returns {string[]} real paths.
 */
function allowedRoots() {
  const roots = [join(REPO, 'qa-results')]
  if (process.env.QA_ARTIFACT_ROOT) roots.push(resolve(process.env.QA_ARTIFACT_ROOT))
  roots.push(tmpdir())
  return roots.map(realish)
}

/**
 * Resolve the longest existing prefix through symlinks and re-append the rest.
 * @param {string} p - path that may not exist yet.
 * @returns {string} absolute path with symlinks of the existing part resolved.
 */
export function realish(p) {
  let cur = resolve(p)
  const tail = []
  while (!existsSync(cur)) {
    tail.unshift(cur.slice(dirname(cur).length + 1))
    const up = dirname(cur)
    if (up === cur) break
    cur = up
  }
  return join(realpathSync(cur), ...tail)
}

/**
 * @param {string | undefined} out - `--out` value.
 * @param {string} layer - layer name for the default.
 * @returns {string} absolute output directory, guaranteed inside an allowed root.
 */
export function resolveOutDir(out, layer) {
  const dir = realish(out ?? join(REPO, 'qa-results', `${layer}-${stamp()}`))
  const ok = allowedRoots().some((r) => dir === r || dir.startsWith(r + sep))
  if (!ok) throw new UsageError(`--out ${out} is outside qa-results/, QA_ARTIFACT_ROOT and the temp dir`)
  return dir
}

/**
 * Take the single-writer lock of an output directory; a lock left by a dead process is replaced.
 * @param {string} dir - output directory (created).
 * @returns {() => void} release function.
 */
export function acquireLock(dir) {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, '.qa.lock')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(file, 'wx')
      writeFileSync(fd, String(process.pid))
      closeSync(fd)
      return () => rmSync(file, { force: true })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const pid = Number(readTextSync(file))
      let alive = false
      try {
        process.kill(pid, 0)
        alive = Number.isInteger(pid) && pid > 0
      } catch {
        alive = false
      }
      if (alive) throw new UsageError(`${dir} is in use by process ${pid}`)
      rmSync(file, { force: true })
    }
  }
  throw new UsageError(`cannot lock ${dir}`)
}

/**
 * Write a file in one rename so a reader never sees half of it.
 * @param {string} path - destination.
 * @param {string} data - contents.
 */
export function atomicWrite(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

/** Scratch overlays of this run; removed on cancellation as well as on normal exit. */
const scratchDirs = new Set()

/**
 * @param {string} dir - an overlay this run created.
 * @returns {string} the same path, now removed if the run is cancelled.
 */
export function registerScratch(dir) {
  scratchDirs.add(dir)
  return dir
}

/** @param {string} dir - an overlay to delete now. */
export function removeScratch(dir) {
  scratchDirs.delete(dir)
  rmSync(dir, { recursive: true, force: true })
}

/** Process groups this run started and has not seen exit; killed on cancellation. */
const live = new Set()

/** Kill every child group this process started. */
export function killAll() {
  for (const dir of scratchDirs) removeScratch(dir)
  for (const pid of live) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
  live.clear()
}

/**
 * @typedef {object} ChildResult
 * @property {number | null} status - exit code.
 * @property {string | null} signal - terminating signal.
 * @property {boolean} timedOut - killed for exceeding the time limit.
 * @property {boolean} spawnFailed - the program could not start.
 * @property {number} durationMs - wall time.
 * @property {string} log - absolute log path.
 * @property {string} tail - last bytes of the output.
 */

/**
 * Run an argv without a shell in its own process group; stream stdout+stderr to a log file.
 * @param {object} o - options.
 * @param {string[]} o.argv - program and arguments.
 * @param {string} o.cwd - working directory.
 * @param {string} o.log - log file to write.
 * @param {Record<string, string | undefined>} [o.env] - environment (default: the caller's).
 * @param {number} [o.timeoutMs] - kill after this long.
 * @returns {Promise<ChildResult>} what happened.
 */
export function runChild({ argv, cwd, log, env = process.env, timeoutMs = 600_000 }) {
  mkdirSync(dirname(log), { recursive: true })
  const started = Date.now()
  const out = createWriteStream(log)
  const clean = { ...env }
  delete clean.NODE_TEST_CONTEXT
  return new Promise((resolveChild) => {
    let tail = ''
    let timedOut = false
    let settled = false
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: clean,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const pid = child.pid
    if (pid !== undefined) live.add(pid)
    const take = (chunk) => {
      out.write(chunk)
      tail = (tail + chunk.toString('utf8')).slice(-65536)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    const timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        /* gone */
      }
      setTimeout(() => {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          /* gone */
        }
      }, 3000).unref()
    }, timeoutMs)
    const finish = (status, signal, spawnFailed) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (pid !== undefined) live.delete(pid)
      // The group may still hold grandchildren after the leader exits: clear them.
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        /* none left */
      }
      out.end(() =>
        resolveChild({ status, signal, timedOut, spawnFailed, durationMs: Date.now() - started, log, tail })
      )
    }
    child.on('error', (error) => {
      take(`spawn error: ${error.message}\n`)
      finish(null, null, true)
    })
    child.on('close', (status, signal) => finish(status, signal, false))
  })
}

/**
 * Read TAP produced by `node --test --test-reporter=tap`. The summary block is required: output
 * cut short (a crash, a kill) has none and is reported invalid.
 * @param {string} text - the run's output.
 * @returns {{valid: boolean, why: string, tests: number, pass: number, fail: number, skipped: number,
 *   todo: number, cancelled: number, ok: string[], notOk: string[], skipTitles: string[],
 *   emptyFiles: string[]}} the reading.
 */
export function parseTap(text) {
  const lines = text.split('\n')
  const num = (key) => {
    const hit = lines.filter((l) => new RegExp(`^# ${key} \\d+\\s*$`).test(l)).pop()
    return hit === undefined ? null : Number(hit.split(' ').pop())
  }
  const r = { ok: [], notOk: [], skipTitles: [], emptyFiles: [], nested: 0, nestedOk: 0, nestedSkipped: 0 }
  const ordinals = []
  for (const l of lines) {
    const m = /^(\s*)(not ok|ok) (\d+) - (.*)$/.exec(l)
    if (m === null) continue
    if (m[1].length === 0) ordinals.push(Number(m[3]))
    const title = m[4]
    // Subtests are indented points; they count in the summary but only top-level ones name the run's results.
    if (m[1].length > 0) {
      r.nested += 1
      if (/\s#\s*(?:SKIP|TODO)\b/i.test(title)) r.nestedSkipped += 1
      else if (m[2] === 'ok') r.nestedOk += 1
      continue
    }
    if (/\s#\s*(?:SKIP|TODO)\b/i.test(title)) r.skipTitles.push(title)
    else if (m[2] === 'ok') {
      r.ok.push(title)
      // node reports a test file that registered no test as one passing test named after the file.
      if (/\.test\.(?:mjs|cjs|js|ts|tsx|mts)$/.test(title)) r.emptyFiles.push(title)
    } else r.notOk.push(title)
  }
  const tests = num('tests')
  const pass = num('pass')
  const fail = num('fail')
  const skipped = num('skipped')
  const todo = num('todo')
  const cancelled = num('cancelled')
  const missing = [tests, pass, fail, skipped, todo, cancelled].some((v) => v === null)
  const sum = pass + fail + skipped + todo + cancelled
  const suites = num('suites') ?? 0
  const planned = lines.filter((l) => /^1\.\.\d+\s*$/.test(l)).map((l) => Number(l.slice(3)))
  const top = r.ok.length + r.notOk.length + r.skipTitles.length
  const points = top + r.nested
  const okPoints = r.ok.length + r.nestedOk
  const skipPoints = r.skipTitles.length + r.nestedSkipped
  // The plan, the test points and the summary must tell one story; a reader that trusts only one is fooled by the others.
  const summaryCopies = lines.filter((l) => /^# tests \d+\s*$/.test(l)).length
  const disagreement = missing
    ? ''
    : summaryCopies !== 1
      ? `TAP summary repeated (${summaryCopies} copies)`
      : suites > 0
        ? `TAP has ${suites} nested suites: only the flat form node:test prints for plain tests is supported`
        : ordinals.some((n, i) => n !== i + 1)
          ? `TAP test numbers are not 1..${ordinals.length} in order`
          : sum !== tests
            ? `TAP summary disagrees with itself: ${tests} tests but pass+fail+skipped+todo+cancelled = ${sum}`
            : planned.length !== 1
              ? `TAP plan line missing or repeated (${planned.length} found)`
              : planned[0] !== top
                ? `TAP plan says ${planned[0]} top-level tests but ${top} were printed`
                : points !== tests + suites
                  ? `TAP prints ${points} test points but its summary says ${tests} tests and ${suites} suites`
                  : suites === 0 && okPoints !== pass
                    ? `TAP prints ${okPoints} passing points but its summary says pass ${pass}`
                    : suites === 0 && points - okPoints - skipPoints !== fail + cancelled
                      ? `TAP prints ${points - okPoints - skipPoints} failing points but its summary says fail ${fail} + cancelled ${cancelled}`
                      : suites === 0 && skipPoints !== skipped + todo
                        ? `TAP prints ${skipPoints} skip/todo points but its summary says ${skipped + todo}`
                        : ''
  const valid = !missing && tests > 0 && disagreement === ''
  return {
    ...r,
    valid,
    why: missing
      ? 'TAP summary missing (output truncated or not TAP)'
      : tests === 0
        ? 'zero tests ran'
        : disagreement,
    tests: tests ?? 0,
    pass: pass ?? 0,
    fail: fail ?? 0,
    skipped: skipped ?? 0,
    todo: todo ?? 0,
    cancelled: cancelled ?? 0
  }
}

/** Output shapes that mean "the code under test could not even load", never a business failure. */
export const LOAD_FAILURE =
  /ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package|ERR_UNKNOWN_FILE_EXTENSION|SyntaxError|ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_IMPORT_ATTRIBUTE|ReferenceError: .* is not defined|does not provide an export named/

/**
 * Build or extend an overlay: a scratch tree whose entries are symlinks to the real tree. A path
 * that must be edited is first made real along its whole chain (`materialize`), so nothing written
 * to the overlay can reach the source. Run code in an overlay with NODE_OPTIONS from
 * `overlayNodeOptions` so relative imports resolve through the overlay path, not the real one.
 * @param {string} src - real tree root.
 * @param {string} dest - overlay root (created).
 * @param {string[]} heavy - repo-relative directories to link instead of copy.
 * @param {{gitPointer?: boolean}} [opts] - gitPointer: copy the `.git` pointer file.
 */
export function buildOverlay(src, dest, heavy = [], { gitPointer = false } = {}) {
  mkdirSync(dest, { recursive: true })
  const rsync = spawnSync(
    'rsync',
    [
      '-a',
      '--exclude=node_modules',
      '--exclude=/.git',
      ...heavy.map((h) => `--exclude=/${h}`),
      `${src}/`,
      `${dest}/`
    ],
    { encoding: 'utf8' }
  )
  if (rsync.status !== 0) throw new Error(`rsync failed: ${rsync.stderr}`)
  linkMissing(src, dest, '', heavy)
  // A `.git` pointer file (a worktree has one) lets git commands inside the overlay read the real
  // repository; they treat the overlay as the work tree. Only reads are expected of them.
  if (gitPointer && existsSync(join(src, '.git')) && lstatSync(join(src, '.git')).isFile())
    copyFileSync(join(src, '.git'), join(dest, '.git'))
  for (const dir of findNodeModules(src)) {
    // A dsh profile's node_modules is written by the gates themselves (`materialize-profile` links
    // and npm-installs into it), so a link would carry those writes into the real tree. It is small
    // (a few hundred links); the overlay gets its own copy, symlinks kept as symlinks.
    if (PROFILE_MODULES.test(dir)) {
      if (existsSyncNoFollow(join(dest, dir))) continue
      mkdirSync(dirname(join(dest, dir)), { recursive: true })
      const copy = spawnSync('rsync', ['-a', `${join(src, dir)}/`, `${join(dest, dir)}/`], {
        encoding: 'utf8'
      })
      if (copy.status !== 0) throw new Error(`rsync of ${dir} failed: ${copy.stderr}`)
    } else linkIfAbsent(join(src, dir), join(dest, dir))
  }
}

/** Profile install trees the gates write into; copied into an overlay, never linked. */
const PROFILE_MODULES = /^tch\/profiles\/[^/]+\/node_modules$/

/**
 * @param {string} src - tree root.
 * @returns {string[]} repo-relative node_modules directories (not nested in another).
 */
function findNodeModules(src) {
  const found = []
  const walk = (rel) => {
    for (const e of readdirSync(join(src, rel), { withFileTypes: true })) {
      if (e.name === '.git') continue
      const next = rel === '' ? e.name : `${rel}/${e.name}`
      if (e.name === 'node_modules') found.push(next)
      else if (e.isDirectory()) walk(next)
    }
  }
  walk('')
  return found
}

/**
 * Link the heavy directories (their parents exist after rsync, or are created here).
 * @param {string} src - real root.
 * @param {string} dest - overlay root.
 * @param {string} _rel - unused prefix, kept for symmetry.
 * @param {string[]} heavy - directories to link.
 */
function linkMissing(src, dest, _rel, heavy) {
  for (const h of heavy) {
    mkdirSync(dirname(join(dest, h)), { recursive: true })
    linkIfAbsent(join(src, h), join(dest, h))
  }
}

/**
 * @param {string} target - what the link points at.
 * @param {string} path - link to create.
 */
function linkIfAbsent(target, path) {
  if (existsSyncNoFollow(path)) return
  mkdirSync(dirname(path), { recursive: true })
  symlinkSync(target, path)
}

/**
 * @param {string} p - path.
 * @returns {boolean} true when something (even a dangling link) is there.
 */
function existsSyncNoFollow(p) {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

/** @returns {string} NODE_OPTIONS that make a scratch overlay resolve through its own path. */
export function overlayNodeOptions() {
  const keep = (process.env.NODE_OPTIONS ?? '').trim()
  return `${keep} --preserve-symlinks --preserve-symlinks-main`.trim()
}

/**
 * Make every directory on `rel` a real directory of the overlay (children stay links to the real
 * tree) and the final element's parent writable.
 * @param {string} overlay - overlay root.
 * @param {string} rel - repo-relative file path to be edited.
 */
export function materialize(overlay, rel) {
  const parts = rel.split('/')
  let cur = overlay
  for (const part of parts.slice(0, -1)) {
    const next = join(cur, part)
    let st = null
    try {
      st = lstatSync(next)
    } catch {
      st = null
    }
    if (st === null) mkdirSync(next)
    else if (st.isSymbolicLink()) {
      const target = readlinkSync(next)
      unlinkSync(next)
      mkdirSync(next)
      for (const child of readdirSync(target)) symlinkSync(join(target, child), join(next, child))
    }
    cur = next
  }
}

/**
 * Replace one overlay entry with real content (or remove it when `content` is null).
 * @param {string} overlay - overlay root.
 * @param {string} rel - repo-relative path.
 * @param {string | Buffer | null} content - new bytes; null deletes.
 */
export function overlayWrite(overlay, rel, content) {
  const path = resolve(overlay, rel)
  if (!path.startsWith(resolve(overlay) + sep)) throw new UsageError(`path escapes the overlay: ${rel}`)
  materialize(overlay, rel)
  if (existsSyncNoFollow(path)) unlinkSync(path)
  if (content !== null) writeFileSync(path, content)
}

/**
 * Put one overlay entry back to a link at the real file (or leave it absent when the real one is).
 * @param {string} overlay - overlay root.
 * @param {string} src - real root.
 * @param {string} rel - repo-relative path.
 */
export function overlayRestore(overlay, src, rel) {
  const path = resolve(overlay, rel)
  if (!path.startsWith(resolve(overlay) + sep)) throw new UsageError(`path escapes the overlay: ${rel}`)
  materialize(overlay, rel)
  if (existsSyncNoFollow(path)) unlinkSync(path)
  if (existsSyncNoFollow(join(src, rel))) symlinkSync(join(src, rel), path)
}

/** @returns {string} first line of text that matches, or ''. */
export function firstLine(text, re) {
  return text.split('\n').find((l) => re.test(l)) ?? ''
}

/**
 * Check a manifest against the layer module contract.
 * @param {unknown} m - parsed manifest.
 * @param {string} layer - expected layer (upper-cased in the id).
 * @returns {string[]} problems; empty when valid.
 */
export function validateManifest(m, layer) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return ['manifest is not an object']
  const p = []
  const strs = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x !== '')
  if (typeof m.id !== 'string' || !new RegExp(`^QA-${layer.toUpperCase()}-[A-Za-z0-9._/-]+$`).test(m.id))
    p.push(`id must start with QA-${layer.toUpperCase()}-`)
  if (!strs(m.itemIds) || m.itemIds.length === 0) p.push('itemIds must be a non-empty string list')
  if (typeof m.requirement !== 'string' || m.requirement === '') p.push('requirement missing')
  const o = m.oracle
  if (
    o === null ||
    typeof o !== 'object' ||
    ['source', 'ref', 'invariant'].some((k) => typeof o[k] !== 'string' || o[k] === '')
  )
    p.push('oracle needs source, ref, invariant')
  if (!strs(m.edgeTags) || m.edgeTags.length === 0) p.push('edgeTags must be a non-empty string list')
  if (!strs(m.targets) || m.targets.length === 0 || m.targets.some((t) => !TARGETS.includes(t)))
    p.push('targets must be a subset of local/dev/prod')
  const e = m.effects
  if (
    e === null ||
    typeof e !== 'object' ||
    !Array.isArray(e.reads) ||
    !Array.isArray(e.writes) ||
    typeof e.mail !== 'boolean' ||
    typeof e.model !== 'boolean' ||
    typeof e.containers !== 'boolean'
  )
    p.push('effects needs reads, writes, mail, model, containers')
  if (!strs(m.prerequisites)) p.push('prerequisites must be a string list')
  if (!strs(m.assertionIds)) p.push('assertionIds must be a string list')
  if (
    m.redProof !== null &&
    (typeof m.redProof !== 'object' || !['commit', 'mutation'].includes(m.redProof.kind))
  )
    p.push('redProof must be null or {kind: commit|mutation, ...}')
  if (!strs(m.legacyIds)) p.push('legacyIds must be a string list')
  return p
}

/**
 * Load and validate a layer's case manifests.
 * @param {string} casesDir - directory of `*.json` manifests.
 * @param {string} layer - layer name.
 * @returns {object[]} manifests, sorted by id; throws UsageError on a bad or duplicate manifest.
 */
export function loadManifests(casesDir, layer) {
  if (!existsSync(casesDir)) throw new UsageError(`${casesDir} does not exist: run generate.mjs`)
  const seen = new Map()
  const out = []
  for (const name of readdirSync(casesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const path = join(casesDir, name)
    let value
    try {
      value = JSON.parse(readRegular(path).toString('utf8'))
    } catch (error) {
      if (error instanceof UsageError) throw error
      throw new UsageError(`${name}: not valid JSON (${error.message})`)
    }
    const problems = validateManifest(value, layer)
    if (problems.length > 0) throw new UsageError(`${name}: ${problems.join('; ')}`)
    if (seen.has(value.id))
      throw new UsageError(`duplicate case id ${value.id} in ${name} and ${seen.get(value.id)}`)
    seen.set(value.id, name)
    out.push(value)
  }
  if (out.length === 0) throw new UsageError(`${casesDir} holds no case manifests: run generate.mjs`)
  return out.sort((a, b) => (a.id < b.id ? -1 : 1))
}

/**
 * Apply the target policy: a case runs against a target only if it lists it and declares no writes.
 * @param {object} manifest - the case.
 * @param {string} target - local/dev/prod.
 * @returns {string | null} the PENDING reason, or null when the case may run.
 */
export function targetPolicy(manifest, target) {
  if (target === 'local') return null
  if (!manifest.targets.includes(target)) return `target-policy: case does not declare target ${target}`
  const e = manifest.effects
  if (e.writes.length > 0 || e.mail || e.model || e.containers)
    return `target-policy: case has write effects, not allowed on ${target}`
  return null
}

/**
 * Build one result record.
 * @param {object} manifest - the case.
 * @param {'PASS'|'FAIL'|'ENV'|'PENDING'} verdict - verdict.
 * @param {string} reason - why.
 * @param {object} [extra] - evidence, durationMs, redProof, observed.
 * @returns {object} result record.
 */
export function result(manifest, verdict, reason, extra = {}) {
  return {
    id: manifest.id,
    verdict,
    reason,
    assertionIds: manifest.assertionIds ?? [],
    evidence: extra.evidence ?? [],
    durationMs: extra.durationMs ?? 0,
    redProof: extra.redProof ?? null,
    ...(extra.observed === undefined ? {} : { observed: extra.observed })
  }
}

/**
 * @param {object[]} results - result records.
 * @returns {0 | 1 | 3} exit code: 1 on any FAIL, 0 when every case passed, 3 otherwise.
 */
export function exitCodeFor(results) {
  if (results.some((r) => r.verdict === 'FAIL')) return 1
  return results.length > 0 && results.every((r) => r.verdict === 'PASS') ? 0 : 3
}

/**
 * Write results.json then report.md, each atomically, only after every result exists.
 * @param {string} outDir - output directory.
 * @param {string} layer - layer name.
 * @param {object[]} results - one record per requested case.
 * @param {number} requested - how many cases were requested (must equal results.length).
 * @param {object} meta - provenance lines for the report header.
 */
export function writeReports(outDir, layer, results, requested, meta = {}) {
  if (results.length !== requested)
    throw new Error(`refusing to report: ${results.length} results for ${requested} cases`)
  const count = (v) => results.filter((r) => r.verdict === v).length
  const red = results.filter((r) => r.redProof !== null).length
  const lines = [
    `# QA ${layer} report`,
    '',
    ...Object.entries(meta).map(([k, v]) => `- ${k}: ${v}`),
    `- cases: ${results.length}, PASS ${count('PASS')}, FAIL ${count('FAIL')}, ENV ${count('ENV')}, PENDING ${count('PENDING')}, RED-proven ${red}`,
    ''
  ]
  const rest = results.filter((r) => r.verdict !== 'PASS')
  if (rest.length > 0) lines.push('## Not PASS', '')
  for (const r of rest)
    lines.push(
      `- ${r.verdict} ${r.id}: ${r.reason}${(r.evidence ?? []).length > 0 ? ` [evidence: ${r.evidence.join(', ')}]` : ''}`
    )
  atomicWrite(join(outDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
  atomicWrite(join(outDir, 'report.md'), `${lines.join('\n')}\n`)
}

/**
 * Standalone entry shared by both layers' run.mjs.
 * @param {{layer: string, listCases: Function, run: Function}} mod - the layer module.
 * @param {string[]} argv - arguments after the script name.
 * @returns {Promise<number>} the exit code.
 */
export async function runCli(mod, argv) {
  let release = () => {}
  try {
    const args = parseArgs(argv, {
      area: { type: 'string', repeat: true },
      target: { type: 'string' },
      'prove-red': { type: 'boolean' },
      out: { type: 'string' }
    })
    const target = args.target ?? 'local'
    if (!TARGETS.includes(target)) throw new UsageError(`--target must be one of ${TARGETS.join(', ')}`)
    const areas = args.area ?? [undefined]
    const seen = new Map()
    for (const area of areas) for (const c of await mod.listCases({ area })) seen.set(c.id, c)
    const cases = [...seen.values()]
    if (cases.length === 0) throw new UsageError(`no case matches --area ${(args.area ?? []).join(', ')}`)
    const outDir = resolveOutDir(args.out, mod.layer)
    release = acquireLock(outDir)
    const onSignal = () => {
      killAll()
      release()
      process.exit(130)
    }
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
    const results = await mod.run({ cases, target, proveRed: args['prove-red'] === true, outDir })
    const missing = cases.filter((c) => !results.some((r) => r.id === c.id))
    if (missing.length > 0)
      throw new Error(`layer returned no result for ${missing.map((c) => c.id).join(', ')}`)
    writeReports(outDir, mod.layer, results, cases.length, {
      target,
      'prove-red': args['prove-red'] === true
    })
    process.stdout.write(`${mod.layer}: ${results.length} cases, report in ${outDir}\n`)
    return exitCodeFor(results)
  } catch (error) {
    killAll()
    if (error instanceof UsageError) {
      process.stderr.write(`${mod.layer}: ${error.message}\n`)
      return 2
    }
    process.stderr.write(`${mod.layer}: ${error.stack}\n`)
    return 1
  } finally {
    release()
  }
}

export { isAbsolute, relative }
