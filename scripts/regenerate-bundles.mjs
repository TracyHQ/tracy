#!/usr/bin/env node
/**
 * Regenerate the committed bundles after sources were merged — a local repair command, not a gate.
 *
 *   pnpm bundles:regen --artifacts <an existing directory outside this worktree>
 *
 * WHY A MACHINE. `lib/client.js` and `lib/index.js` are committed (RULE #3: the image copies plugin
 * folders as-is and runs no build), so two branches that each rebuilt the same bundle conflict in a
 * minified file nobody can merge by hand. The two obvious ways out are both wrong and both look
 * fine: taking "ours" or "theirs" ships a bundle that lacks the other branch's source change, and
 * rebuilding only the package one remembers leaves every other consumer of a shared source
 * (`@tracy/core` is embedded in several bundles) stale. Neither produces an error — the `bundles`
 * gate catches it a CI round later, or the customer gets old code. Deciding which bundles are stale
 * is a byte comparison over every generator; that is a machine's job.
 *
 * WHAT IT DOES, IN ORDER. (1) Refuses unless sources are settled: Git must report no unmerged path
 * other than a recognised generated output. (2) Runs EVERY generator's
 * own `--check`, including packages the merge never touched, because a shared source makes bundles
 * stale in packages nobody opened. (3) Runs `pnpm run build` — the package's own command — once for
 * each package with an output proven stale. (4) Checks every generator again, then compares the
 * tree with what it was: only outputs proven stale may have new bytes. (5) Runs the unchanged
 * `bundles` gate, which decides success. It never stages, never commits, never picks a side of a generated conflict, and
 * never restores a file: after a failure the tree is left as it is and the changed paths are named.
 *
 * WHAT IT REFUSES. A build command or generator it does not recognise (it runs three exact command
 * forms and reads no shell syntax), a `--check` that fails for any reason other than the builders'
 * own "stale"/"missing" lines, a failed or timed-out step, and a change outside the outputs proven
 * stale.
 *
 * WHAT IT IS NOT. A convenience for a person or an agent in their own checkout, not a security
 * boundary: it trusts the tree it runs in (no symlink or special-file screening, no guard against
 * another process editing the tree meanwhile). CI's `bundles` gate still judges what is committed.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The comparison this command ends with: the `bundles` gate, exactly as CI and `build:check` run it. */
export const FINAL_GATE_ARGV = Object.freeze([
  'pnpm',
  'exec',
  'tsx',
  'scripts/check-all.ts',
  '--only',
  'bundles'
])
/** A stale package is rebuilt with its own `build` script, never with a command composed here. */
export const BUILD_ARGV = Object.freeze(['pnpm', 'run', 'build'])

/**
 * The two committed builds a package can have, the file each writes, and the ONLY things a failed
 * `--check` may say on stderr that mean "the output is behind its source". Every builder exits 1 for
 * a missing `inject` name or an esbuild error too, so the exit status alone cannot authorise a
 * rebuild — and neither can a stale line found somewhere in a longer stderr, which may carry a fatal
 * error next to it. Each pattern therefore matches the WHOLE stderr of one of the forms the 28
 * builders print (read 04/10/2026); a new wording is refused until it is added here.
 */
const GENERATORS = Object.freeze({
  'build-client.mjs': {
    output: 'lib/client.js',
    stale: [
      /^build-client: lib\/client\.js is stale — run `node scripts\/build-client\.mjs` and commit it\.$/,
      /^build-client: lib\/client\.js is stale — run `pnpm build` here and commit it\.$/,
      /^build-client: lib\/client\.js is stale — a dictionary changed but the bundle was not rebuilt\.\n {2}Run `pnpm --filter [@\w./-]+ build`\.$/,
      /^build-client: lib\/client\.js is missing — run `node scripts\/build-client\.mjs`\.$/
    ]
  },
  'build-host.mjs': {
    output: 'lib/index.js',
    stale: [
      /^build-host: lib\/index\.js is stale — run `pnpm build` here and commit it\.$/,
      /^build-host: lib\/index\.js differs from src\/host — run `pnpm build` and commit it\.$/,
      /^build-host: lib\/index\.js is missing — run `pnpm build` and commit it\.$/
    ]
  }
})

/**
 * `@tracy/dsh-brand` generates `src/client/generated.ts` before its bundles, from three files outside
 * the package. The generator has no `--check`, so it is run on a copy of exactly these inputs in the
 * artifacts directory and its output compared. Paths are relative to the package directory, as
 * `gen-palette.mjs` resolves them.
 */
const PALETTE = Object.freeze({
  script: 'scripts/gen-palette.mjs',
  helper: 'scripts/palette.mjs',
  output: 'src/client/generated.ts',
  embeddedIn: 'lib/client.js',
  inputs: [
    '../../ui/tracy-ui/src/tokens.css',
    '../../ui/tracy-ui/src/dsh-bridge.css',
    '../../../docs/design/brand/favicon/tracy-favicon.svg'
  ]
})

/** The exact `build` scripts in use on 04/10/2026. Anything else is refused, not interpreted. */
const BUILD_FORMS = new Map([
  ['node scripts/build-client.mjs', { palette: false, generators: ['build-client.mjs'] }],
  [
    'node scripts/build-client.mjs && node scripts/build-host.mjs',
    { palette: false, generators: ['build-client.mjs', 'build-host.mjs'] }
  ],
  [
    'node scripts/gen-palette.mjs && node scripts/build-client.mjs && node scripts/build-host.mjs',
    { palette: true, generators: ['build-client.mjs', 'build-host.mjs'] }
  ]
])

const GENERATOR_PATH = /^(packages\/(?:[^/]+\/)*[^/]+)\/scripts\/(build-client\.mjs|build-host\.mjs)$/
/** A script in a bundled package that looks like a generator this command does not know. */
const GENERATOR_LIKE = /^scripts\/(?:build|gen)-[^/]*\.mjs$/
/**
 * Limits. The whole `bundles` gate measured 14.4 s and one package build is a few seconds, so each
 * is an order of magnitude of headroom, not a tuned value: 2 min per `--check`, 5 min per build,
 * 10 min for the gate, 30 min for the run. Output is capped so a looping child cannot fill memory.
 */
const DEFAULTS = Object.freeze({
  checkTimeoutMs: 120_000,
  buildTimeoutMs: 300_000,
  gateTimeoutMs: 600_000,
  gitTimeoutMs: 60_000,
  deadlineMs: 1_800_000,
  // `git ls-files -z` over this repository is a few MB; everything else prints far less.
  maxOutputBytes: 64 * 1024 * 1024,
  checkJobs: 4
})
const LOG_EXCERPT_BYTES = 256 * 1024

/** A reason to stop. Carries the sentences shown to the person; never a stack. */
class Refusal extends Error {
  constructor(problems) {
    const list = Array.isArray(problems) ? problems : [problems]
    super(list.join('\n'))
    this.problems = list
  }
}

export class UsageError extends Error {}

export const USAGE = 'usage: pnpm bundles:regen --artifacts <existing directory outside this worktree>'

/** `--artifacts <dir>` or `--artifacts=<dir>`, exactly once; nothing else is accepted. */
export function parseArgs(argv) {
  let artifacts
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    let value
    if (arg === '--artifacts') {
      value = argv[i + 1]
      i += 1
      if (value === undefined || value.startsWith('--')) throw new UsageError('--artifacts needs a directory')
    } else if (arg.startsWith('--artifacts=')) {
      value = arg.slice('--artifacts='.length)
    } else {
      throw new UsageError(`unknown argument ${JSON.stringify(arg)}`)
    }
    if (artifacts !== undefined) throw new UsageError('--artifacts given more than once')
    if (value === '') throw new UsageError('--artifacts needs a directory')
    artifacts = value
  }
  if (artifacts === undefined) throw new UsageError('--artifacts is required')
  return { artifacts }
}

/** The artifacts directory must already exist and sit outside the worktree: logs never land in it. */
function resolveArtifacts(repoReal, artifacts) {
  if (typeof artifacts !== 'string' || artifacts === '')
    throw new Refusal('an artifacts directory is required')
  const abs = path.resolve(artifacts)
  let stat
  try {
    stat = statSync(abs)
  } catch {
    throw new Refusal(`artifacts directory ${abs} does not exist — create it first, outside the worktree`)
  }
  if (!stat.isDirectory()) throw new Refusal(`artifacts path ${abs} is not a directory`)
  const real = realpathSync(abs)
  const back = path.relative(repoReal, real)
  if (back === '' || (!back.startsWith('..') && !path.isAbsolute(back)))
    throw new Refusal(
      `artifacts directory ${real} is inside the worktree ${repoReal} — logs must stay out of it`
    )
  return real
}

/**
 * Run one child with a timeout and an output cap. Never rejects: a spawn error, a signal, a timeout
 * and an overflow each come back as a field, so the caller decides in one place.
 * The child leads its own process group so a timeout also stops what `pnpm run` started.
 */
export function runProcess({ argv, cwd, timeoutMs, maxOutputBytes }) {
  return new Promise((done) => {
    const out = {
      status: null,
      signal: null,
      stdout: '',
      stderr: '',
      error: null,
      timedOut: false,
      overflow: false
    }
    let child
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    } catch (error) {
      done({ ...out, error: String(error?.message ?? error) })
      return
    }
    const chunks = { stdout: [], stderr: [] }
    let bytes = 0
    let settled = false
    const stop = () => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    }
    const timer = setTimeout(() => {
      out.timedOut = true
      stop()
    }, timeoutMs)
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      out.stdout = Buffer.concat(chunks.stdout).toString('utf8')
      out.stderr = Buffer.concat(chunks.stderr).toString('utf8')
      done(out)
    }
    for (const stream of ['stdout', 'stderr']) {
      child[stream].on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > maxOutputBytes) {
          if (!out.overflow) stop()
          out.overflow = true
          return
        }
        chunks[stream].push(chunk)
      })
    }
    child.on('error', (error) => {
      out.error = String(error?.message ?? error)
      finish()
    })
    child.on('close', (status, signal) => {
      out.status = status
      out.signal = signal
      finish()
    })
  })
}

/** Why a child did not end cleanly, or '' when it exited by itself with a status. */
function abnormal(result) {
  if (result.error) return `could not run (${result.error})`
  if (result.timedOut) return 'timed out and was stopped'
  if (result.overflow) return 'wrote more output than the limit and was stopped'
  if (result.signal) return `was ended by ${result.signal}`
  if (typeof result.status !== 'number') return 'ended without an exit status'
  return ''
}

const lastLines = (text, count = 12) => text.trim().split('\n').slice(-count).join('\n')

/**
 * fresh = exit 0; stale = exit 1 and a stderr that is, in full, one of the builder's own stale
 * reports; everything else failed. Stdout is not judged: the builders print progress there
 * (`inject contract: …`, `tailwind: …`) before they compare, and every error they raise is on stderr.
 */
export function classifyCheck(generator, result) {
  const known = GENERATORS[generator]
  if (!known) return { state: 'failed', reason: `unknown generator ${generator}` }
  const broken = abnormal(result)
  if (broken) return { state: 'failed', reason: broken }
  if (result.status === 0) return { state: 'fresh', reason: '' }
  const diagnostic = String(result.stderr ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (result.status === 1 && known.stale.some((form) => form.test(diagnostic)))
    return { state: 'stale', reason: '' }
  const said = lastLines(`${result.stderr}\n${result.stdout}`, 6)
  return { state: 'failed', reason: `exit ${result.status}, not a stale-output report:\n${said}` }
}

/** The file's bytes as a hash, or the error code (`ENOENT`, `EISDIR`, …) when it cannot be read. */
function fileHash(abs) {
  try {
    return createHash('sha256').update(readFileSync(abs)).digest('hex')
  } catch (error) {
    return String(error?.code ?? error)
  }
}

const nulList = (text) => text.split('\0').filter((entry) => entry !== '')

/**
 * The operation. `run` is the child-process adapter (tests replace it); every other option is a
 * limit. Resolves — never rejects — with what happened; `ok` is true only when every step passed.
 */
export async function regenerateBundles(options) {
  const { repo, artifacts, run = runProcess, now = Date.now } = options
  const limits = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS)) if (options[key] !== undefined) limits[key] = options[key]

  const report = {
    ok: false,
    problems: [],
    stale: [],
    built: [],
    rewritten: [],
    changed: [],
    gateRan: false,
    runDir: null,
    elapsedMs: 0
  }
  const started = now()
  const deadlineAt = started + limits.deadlineMs
  let repoReal = null
  let snapshot = null
  let before = null
  let sequence = 0

  const writeLog = (label, argv, cwd, result) => {
    sequence += 1
    const name = `${String(sequence).padStart(3, '0')}-${label.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80)}.log`
    const body =
      `argv: ${JSON.stringify(argv)}\ncwd: ${cwd}\n` +
      `status: ${result.status} signal: ${result.signal} error: ${result.error} timedOut: ${result.timedOut} overflow: ${result.overflow}\n` +
      `--- stdout ---\n${result.stdout.slice(-LOG_EXCERPT_BYTES)}\n--- stderr ---\n${result.stderr.slice(-LOG_EXCERPT_BYTES)}\n`
    try {
      writeFileSync(path.join(report.runDir, name), body)
    } catch {
      // A log that cannot be written must not change the verdict; the result is still returned.
    }
  }

  /** One child, given the smaller of its own timeout and what is left of the whole run. */
  const call = async (label, argv, cwd, timeoutMs, keepLog = true) => {
    const remaining = deadlineAt - now()
    if (remaining <= 0)
      throw new Refusal(
        `${label}: not started — the ${limits.deadlineMs} ms limit for the whole run is used up`
      )
    let result
    try {
      result = await run({
        argv: [...argv],
        cwd,
        timeoutMs: Math.min(timeoutMs, remaining),
        maxOutputBytes: limits.maxOutputBytes
      })
    } catch (error) {
      result = {
        status: null,
        signal: null,
        stdout: '',
        stderr: '',
        error: String(error?.message ?? error),
        timedOut: false,
        overflow: false
      }
    }
    if (keepLog || result.status !== 0) writeLog(label, argv, cwd, result)
    return result
  }

  /** A Git question that must succeed; returns its stdout. */
  const git = async (...args) => {
    const label = `git ${args.join(' ')}`
    const result = await call(
      label,
      ['git', '--no-optional-locks', ...args],
      repoReal,
      limits.gitTimeoutMs,
      false
    )
    const broken = abnormal(result)
    if (broken || result.status !== 0)
      throw new Refusal(`${label} ${broken || `exited ${result.status}`}: ${lastLines(result.stderr, 4)}`)
    return result.stdout
  }

  try {
    if (typeof repo !== 'string' || repo === '') throw new Refusal('a repository directory is required')
    try {
      repoReal = realpathSync(repo)
    } catch {
      throw new Refusal(`repository ${repo} does not exist`)
    }
    const artifactsReal = resolveArtifacts(repoReal, artifacts)
    try {
      report.runDir = mkdtempSync(path.join(artifactsReal, 'regenerate-bundles-'))
    } catch (error) {
      throw new Refusal(`cannot write into artifacts directory ${artifactsReal}: ${error?.message ?? error}`)
    }
    const top = (await git('rev-parse', '--show-toplevel')).replace(/\n$/, '')
    if (top === '' || realpathSync(top) !== repoReal)
      throw new Refusal(`${repoReal} is not the top of a Git worktree (Git says ${JSON.stringify(top)})`)

    // ── Discovery: every tracked generator under packages/, and what each package builds ──────────
    const tracked = new Set(nulList(await git('ls-files', '-z')))
    const packageDirs = new Map()
    for (const rel of tracked) {
      const match = GENERATOR_PATH.exec(rel)
      if (!match) continue
      packageDirs.set(match[1], [...(packageDirs.get(match[1]) ?? []), match[2]])
    }
    if (packageDirs.size === 0)
      throw new Refusal(
        'no tracked scripts/build-client.mjs or scripts/build-host.mjs under packages/ — nothing to check'
      )

    const describePackage = (dir) => {
      const manifestRel = `${dir}/package.json`
      if (!tracked.has(manifestRel)) throw new Refusal(`${dir}: has a generator but no tracked package.json`)
      let manifest
      try {
        manifest = JSON.parse(readFileSync(path.join(repoReal, manifestRel), 'utf8'))
      } catch (error) {
        throw new Refusal(`${manifestRel}: cannot be read as a package manifest (${error?.message ?? error})`)
      }
      const command = manifest?.scripts?.build
      if (typeof command !== 'string') throw new Refusal(`${manifestRel}: has no \`build\` script`)
      const form = BUILD_FORMS.get(command)
      if (!form)
        throw new Refusal(
          `${manifestRel}: \`build\` is ${JSON.stringify(command)} — not one of the known forms; teach scripts/regenerate-bundles.mjs this form before using it here`
        )
      const present = packageDirs.get(dir).slice().sort()
      if (present.join() !== form.generators.slice().sort().join())
        throw new Refusal(
          `${dir}: tracks ${present.join(' + ')} but \`build\` runs ${form.generators.join(' + ')}`
        )
      const known = new Set(form.generators.map((name) => `scripts/${name}`))
      if (form.palette) known.add(PALETTE.script)
      for (const rel of tracked) {
        if (!rel.startsWith(`${dir}/`)) continue
        const inside = rel.slice(dir.length + 1)
        if (GENERATOR_LIKE.test(inside) && !known.has(inside))
          throw new Refusal(`${rel}: a generator this command does not know — \`build\` does not run it`)
      }
      const generators = form.generators.map((name) => ({
        name,
        output: `${dir}/${GENERATORS[name].output}`
      }))
      const packageOutputs = generators.map((generator) => generator.output)
      let palette = null
      if (form.palette) {
        for (const needed of [PALETTE.script, PALETTE.helper])
          if (!tracked.has(`${dir}/${needed}`))
            throw new Refusal(`${dir}: \`build\` runs the palette but ${needed} is not tracked`)
        const inputs = PALETTE.inputs.map((input) => path.posix.normalize(`${dir}/${input}`))
        for (const input of inputs)
          if (!tracked.has(input)) throw new Refusal(`${dir}: palette input ${input} is not tracked`)
        palette = { output: `${dir}/${PALETTE.output}`, embeddedIn: `${dir}/${PALETTE.embeddedIn}`, inputs }
        packageOutputs.push(palette.output)
      }
      for (const output of packageOutputs)
        if (!tracked.has(output))
          throw new Refusal(
            `${output}: the output of a generator but not tracked — commit it first (RULE #3)`
          )
      return { dir, generators, palette, outputs: packageOutputs }
    }

    const problems = []
    const packages = []
    for (const dir of [...packageDirs.keys()].sort()) {
      try {
        packages.push(describePackage(dir))
      } catch (error) {
        if (!(error instanceof Refusal)) throw error
        problems.push(...error.problems)
      }
    }
    const outputs = new Set(packages.flatMap((pkg) => pkg.outputs))

    // ── Sources must be settled before anything is built from them. Git's index is the authority
    // on "unresolved": a conflicted recognised output is fine (it is rebuilt), anything else is not.
    for (const rel of new Set(nulList(await git('diff', '--name-only', '--diff-filter=U', '-z'))))
      if (!outputs.has(rel))
        problems.push(`${rel}: unresolved merge conflict — resolve and \`git add\` every source first`)
    if (problems.length > 0) throw new Refusal(problems)

    /**
     * What the working tree holds beyond the index — every modified, deleted and visible untracked
     * path — plus every output, each with its bytes. Two of these differ exactly where a file changed.
     */
    snapshot = async () => {
      const dirty = nulList(await git('ls-files', '-m', '-d', '-o', '--exclude-standard', '-z'))
      const state = new Map()
      for (const rel of new Set([...dirty, ...outputs])) state.set(rel, fileHash(path.join(repoReal, rel)))
      return state
    }
    before = await snapshot()

    // ── Which outputs are behind their sources ────────────────────────────────────────────────────
    const paletteState = async (pkg, round) => {
      const scratch = mkdtempSync(path.join(report.runDir, `palette-${round}-`))
      for (const rel of [
        `${pkg.dir}/${PALETTE.script}`,
        `${pkg.dir}/${PALETTE.helper}`,
        ...pkg.palette.inputs
      ]) {
        const target = path.join(scratch, rel)
        mkdirSync(path.dirname(target), { recursive: true })
        copyFileSync(path.join(repoReal, rel), target)
      }
      const result = await call(
        `palette ${pkg.dir}`,
        ['node', PALETTE.script],
        path.join(scratch, pkg.dir),
        limits.checkTimeoutMs
      )
      const broken = abnormal(result)
      if (broken || result.status !== 0)
        throw new Refusal(
          `${pkg.dir}/${PALETTE.script} ${broken || `exited ${result.status}`} on a copy of its known inputs — it may read a file this command does not know:\n${lastLines(result.stderr, 6)}`
        )
      const fresh = fileHash(path.join(scratch, pkg.palette.output))
      return fresh === fileHash(path.join(repoReal, pkg.palette.output)) ? 'fresh' : 'stale'
    }

    /** Every generator's `--check`, a few at a time; returns the set of stale output paths. */
    const staleOutputs = async (round) => {
      const queue = packages.flatMap((pkg) => pkg.generators.map((generator) => ({ pkg, generator })))
      const stale = new Set()
      const failures = []
      const guarded = async (work) => {
        try {
          await work()
        } catch (error) {
          if (!(error instanceof Refusal)) throw error
          failures.push(...error.problems)
          queue.length = 0
        }
      }
      const worker = async () => {
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
          const { pkg, generator } = next
          await guarded(async () => {
            const result = await call(
              `${round} check ${pkg.dir} ${generator.name}`,
              ['node', `scripts/${generator.name}`, '--check'],
              path.join(repoReal, pkg.dir),
              limits.checkTimeoutMs
            )
            const verdict = classifyCheck(generator.name, result)
            if (verdict.state === 'stale') stale.add(generator.output)
            else if (verdict.state === 'failed')
              failures.push(`${pkg.dir} (${generator.name} --check): ${verdict.reason}`)
          })
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, limits.checkJobs) }, worker))
      for (const pkg of packages) {
        if (!pkg.palette || failures.length > 0) continue
        await guarded(async () => {
          if ((await paletteState(pkg, round)) !== 'stale') return
          stale.add(pkg.palette.output)
          // The bundle embeds the generated palette, so it is behind too even though its own
          // `--check` (run against the OLD generated file) said it matched.
          stale.add(pkg.palette.embeddedIn)
        })
      }
      if (failures.length > 0) throw new Refusal(failures.sort())
      return stale
    }

    const stale = await staleOutputs('before')
    report.stale = [...stale].sort()

    // ── Rebuild each package that has a stale output, with its own command, once ─────────────────
    for (const pkg of packages) {
      if (!pkg.outputs.some((output) => stale.has(output))) continue
      report.built.push(pkg.dir)
      const result = await call(
        `build ${pkg.dir}`,
        BUILD_ARGV,
        path.join(repoReal, pkg.dir),
        limits.buildTimeoutMs
      )
      const broken = abnormal(result)
      if (broken || result.status !== 0)
        throw new Refusal(
          `${pkg.dir}: \`${BUILD_ARGV.join(' ')}\` ${broken || `exited ${result.status}`} — its outputs may be half written:\n${lastLines(`${result.stdout}\n${result.stderr}`)}`
        )
    }
    if (report.built.length > 0) {
      const left = await staleOutputs('after')
      if (left.size > 0)
        throw new Refusal(
          `still stale after rebuilding: ${[...left].sort().join(', ')} — the build did not bring it up to date`
        )
    }

    // Only outputs proven stale may have new bytes; a fresh companion a build rewrote must be identical.
    report.changed = changedBetween(before, await snapshot())
    report.rewritten = report.changed.filter((rel) => stale.has(rel))
    const foreign = report.changed.filter((rel) => !stale.has(rel))
    if (foreign.length > 0)
      throw new Refusal(
        `changed outside the stale outputs (left as they are, nothing restored): ${foreign.join(', ')}`
      )

    // ── The unchanged gate has the last word ─────────────────────────────────────────────────────
    report.gateRan = true
    const gate = await call('bundles gate', FINAL_GATE_ARGV, repoReal, limits.gateTimeoutMs)
    const gateBroken = abnormal(gate)
    if (gateBroken || gate.status !== 0)
      throw new Refusal(
        `the bundles gate (\`${FINAL_GATE_ARGV.join(' ')}\`) ${gateBroken || `exited ${gate.status}`}:\n${lastLines(`${gate.stdout}\n${gate.stderr}`)}`
      )
    report.ok = true
  } catch (error) {
    if (error instanceof Refusal) report.problems.push(...error.problems)
    else report.problems.push(`unexpected error: ${error?.stack ?? error}`)
    // Name what a failed run left behind; best effort, the refusal above already stands.
    if (before) {
      try {
        report.changed = changedBetween(before, await snapshot())
        report.rewritten = report.changed.filter((rel) => report.stale.includes(rel))
      } catch {
        // Git or the deadline may be what failed.
      }
    }
  }
  report.elapsedMs = now() - started
  if (report.runDir) {
    try {
      writeFileSync(path.join(report.runDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`)
    } catch {
      // The summary is a convenience for measuring runs; the returned report is the result.
    }
  }
  return report
}

/** Paths whose bytes differ between two snapshots. */
function changedBetween(a, b) {
  return [...new Set([...a.keys(), ...b.keys()])].filter((rel) => a.get(rel) !== b.get(rel)).sort()
}

function printReport(report) {
  const say = (line) => console.error(line)
  if (report.built.length > 0) say(`rebuilt ${report.built.length} package(s): ${report.built.join(', ')}`)
  else if (report.problems.length === 0) say('every bundle already matches its source; nothing was rebuilt')
  if (report.changed.length > 0)
    say(`changed on disk:\n${report.changed.map((rel) => `  ${rel}`).join('\n')}`)
  if (report.ok) {
    say('bundles gate: green')
    if (report.rewritten.length > 0)
      say(`nothing was staged — review, then:\n  git add -- ${report.rewritten.join(' ')}`)
  } else {
    say(`\nregenerate-bundles: REFUSED — ${report.problems.length} problem(s)\n`)
    for (const problem of report.problems) say(`  ${problem.replace(/\n/g, '\n    ')}`)
    if (report.changed.length > 0)
      say('\n  the files listed above were left as they are; nothing was restored or staged')
  }
  if (report.runDir) say(`logs: ${report.runDir} (${report.elapsedMs} ms)`)
}

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    console.error(`regenerate-bundles: ${error.message}\n${USAGE}`)
    process.exit(2)
  }
  const report = await regenerateBundles({ repo: ROOT, artifacts: args.artifacts })
  printReport(report)
  process.exit(report.ok ? 0 : 1)
}

let direct = false
try {
  direct = process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
} catch {
  direct = false
}
if (direct) await main()
