// wp-cli.mjs — one way to run wp-cli, whether it lives in a compose service or on this machine.
//
// The seeder never touches the database directly: every write is a wp-cli command, so the same
// script seeds a docker stand (`--wp "docker compose -p tracy-base-wp7 run --rm -T cli"`) and a
// plain install (`--wp "wp --path=/var/www/html"`). Arguments are passed as an argv array, never
// through a shell, so a title with a quote or a JSON blob with spaces survives the trip; long post
// content goes through stdin (`wp post create -`), which every runner forwards.
//
// A command that exits non-zero throws with its stderr, unless `allowFail` is set — a lookup that
// legitimately finds nothing (`wp post get 999`) is not an error for the caller to guess about.
//
// One container, not one per call. A `docker compose … run --rm <service>` runner creates a
// container for every command — 2.1–2.9 s each on the stand (measured 14/09), against 0.3–0.5 s
// for a `docker exec` into a container that is already up. So the first call starts ONE detached
// container (`<project>-<service>-keep`, `sh -c 'sleep 7200'`, same service, same mounts, same
// user) and every call is a `docker exec -i` into it; it is removed when the process exits, on
// SIGINT/SIGTERM too. A container of that name already running is reused (a previous run that
// died without cleaning up), and left to that run. `docker run --rm … wordpress:cli wp` (the
// clean-stand shape) is converted the same way. `keep: false` / `TRACY_WP_KEEP=0` / seed.mjs
// `--wp-keep off` turns it off; any other runner is spawned exactly as written.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/**
 * The environment for the runner: DOCKER_HOST is dropped (this machine keeps one pointing at
 * another host — the stand runs on the local daemon), unless WP_DOCKER_HOST names one on purpose.
 */
function dockerEnv() {
  const env = { ...process.env }
  delete env.DOCKER_HOST
  if (process.env.WP_DOCKER_HOST) env.DOCKER_HOST = process.env.WP_DOCKER_HOST
  return env
}

/** Split a runner string into argv: whitespace-separated, with single or double quotes honoured. */
export function splitCommand(spec) {
  const out = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const m of String(spec).matchAll(re)) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

// ---------------------------------------------------------------- the kept container

const KEEP_SECONDS = 7200
const COMPOSE_RUN_FLAGS = new Set(['--rm', '-T', '--no-TTY', '-i', '--interactive', '--no-deps', '--quiet-pull', '--remove-orphans'])
const COMPOSE_RUN_DROP = new Set(['--rm', '-T', '--no-TTY', '-i', '--interactive'])
const DOCKER_RUN_DROP = new Set(['--rm', '-i', '-t', '-it', '--interactive', '--tty'])
const COMPOSE_FILES = ['compose.yml', 'compose.yaml', 'docker-compose.yml', 'docker-compose.yaml']

const readOrNull = (f) => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return null
  }
}
/** Compose's own normalisation of a project name: lower case, [a-z0-9_-] only. */
const projectName = (s) => String(s).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'wp'

/** The value of `-x V` / `--long V` / `--long=V` in `flags`, or null. */
function flagValue(flags, names) {
  for (let i = 0; i < flags.length; i++) {
    for (const n of names) {
      if (flags[i] === n && i + 1 < flags.length) return flags[i + 1]
      if (n.startsWith('--') && flags[i].startsWith(`${n}=`)) return flags[i].slice(n.length + 1)
    }
  }
  return null
}

/**
 * How to keep a container for a runner argv, or null when the runner is not a per-call docker
 * container (a bare `wp`, a `compose exec`, a run flag this does not understand). The plan is
 * pure: `create` starts the container, `exec(args)` is one wp call inside it, `inspect` says
 * whether it is running, `remove` takes it down.
 */
export function keepAlivePlan(base, { readText = readOrNull, cwd = process.cwd() } = {}) {
  if (base.length < 3 || basename(base[0]) !== 'docker') return null
  const plan = (name, create) => ({
    name,
    create,
    exec: (args) => ['docker', 'exec', '-i', name, 'wp', ...args.map(String)],
    inspect: ['docker', 'inspect', '-f', '{{.State.Running}}', name],
    remove: ['docker', 'rm', '-f', name]
  })
  if (base[1] === 'compose') {
    const runIdx = base.indexOf('run', 2)
    if (runIdx < 0 || runIdx === base.length - 1) return null
    const global = base.slice(2, runIdx)
    const runFlags = base.slice(runIdx + 1, -1)
    const service = base.at(-1)
    if (service.startsWith('-') || runFlags.some((f) => !COMPOSE_RUN_FLAGS.has(f))) return null
    let project = flagValue(global, ['-p', '--project-name'])
    if (!project) {
      const dir = flagValue(global, ['--project-directory']) ?? cwd
      const file = flagValue(global, ['-f', '--file']) ?? COMPOSE_FILES.map((f) => join(dir, f)).find((f) => readText(f) !== null)
      const named = file ? /^name:\s*["']?([^"'\s#]+)/m.exec(readText(file) ?? '') : null
      project = named?.[1] ?? basename(file ? dirname(file) : dir)
    }
    const name = `${projectName(project)}-${service}-keep`
    return plan(name, [
      'docker', 'compose', ...global, 'run', '-d', '--name', name, '--entrypoint', 'sh',
      ...runFlags.filter((f) => !COMPOSE_RUN_DROP.has(f)), service, '-c', `sleep ${KEEP_SECONDS}`
    ])
  }
  if (base[1] === 'run' && base.at(-1) === 'wp' && base.length >= 4) {
    const flags = base.slice(2, -2).filter((f) => !DOCKER_RUN_DROP.has(f))
    const image = base.at(-2)
    if (image.startsWith('-')) return null
    const name = `${projectName(flagValue(flags, ['--network', '--net']) ?? 'wp')}-wp-keep`
    return plan(name, ['docker', 'run', '-d', '--name', name, '--entrypoint', 'sh', ...flags, image, '-c', `sleep ${KEEP_SECONDS}`])
  }
  return null
}

const exitHooks = new Set()
let hooksInstalled = false
/** Run `fn` when the process ends — normal exit, SIGINT, SIGTERM, SIGHUP. */
function onProcessExit(fn) {
  exitHooks.add(fn)
  if (hooksInstalled) return
  hooksInstalled = true
  process.on('exit', () => {
    for (const f of exitHooks) f()
  })
  for (const [sig, no] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]])
    process.once(sig, () => {
      for (const f of exitHooks) f()
      process.exit(128 + no)
    })
}

/**
 * The kept container for a plan: `argv(args)` starts it on first use (or adopts one already
 * running under that name) and returns the `docker exec` argv for one wp call; `dispose()`
 * removes it if this process created it. Removal is also hooked to process exit.
 */
export function createKeepAlive(plan, { spawn = spawnSync, env = dockerEnv(), log = null, onExit = onProcessExit } = {}) {
  let state = null // { created }
  const docker = (argv, opts = {}) => spawn(argv[0], argv.slice(1), { encoding: 'utf8', env, timeout: 120_000, ...opts })
  let removed = false
  const remove = () => {
    if (removed || !state?.created) return
    removed = true
    docker(plan.remove)
  }
  const ensure = () => {
    if (state) return
    const probe = docker(plan.inspect)
    if (probe.status === 0 && String(probe.stdout).trim() === 'true') {
      log?.(`wp-cli runner: reusing container ${plan.name}`)
      state = { created: false }
      return
    }
    docker(plan.remove) // a stopped leftover of that name would block the create
    const c = docker(plan.create)
    if (c.status !== 0 || c.error)
      throw new Error(`wp-cli runner: cannot start ${plan.name}: ${(c.error?.message ?? c.stderr ?? '').trim()}`.slice(0, 2000))
    state = { created: true }
    onExit(remove)
    log?.(`wp-cli runner: container ${plan.name} up; every call is a docker exec into it`)
  }
  return {
    name: plan.name,
    argv: (args) => {
      ensure()
      return plan.exec(args)
    },
    /** Forget the container (it vanished under us — another process that adopted it, or that we adopted, removed it); the next call starts one. */
    reset: () => {
      state = null
      removed = false
    },
    dispose: remove
  }
}

/** docker's own words for "that container is not there any more". */
export const CONTAINER_GONE = /No such container|is not running|is restarting/


/** The default for `keep`: on, unless TRACY_WP_KEEP=0. */
export const keepDefault = () => process.env.TRACY_WP_KEEP !== '0'

/** The run's clock ran out (`deadline`), or one call sat past its own cap. */
export class TimeoutError extends Error {}

/** Per-call cap in ms: TRACY_WP_TIMEOUT seconds, default 600. */
const perCallTimeoutMs = () => Number(process.env.TRACY_WP_TIMEOUT ?? 600) * 1000

/**
 * Build a runner. `wp` is the runner string (see above). Returns:
 *   run(args, { stdin, allowFail })  → { code, stdout, stderr }
 *   out(args, opts)                  → trimmed stdout
 *   json(args, opts)                 → parsed stdout (`--format=json` is added when absent)
 *   ids(args, opts)                  → number[] from `--format=ids`
 *   phpEval(code)                    → stdout of `wp eval <code>`
 *   dispose()                        → remove the kept container now (else at process exit)
 * `deadline` (ms since the epoch) is the run's clock: a call past it throws TimeoutError.
 */
export function createRunner(wp, { log = null, dryRun = false, keep = keepDefault(), spawn = spawnSync, deadline = null } = {}) {
  const base = splitCommand(wp)
  if (!base.length) throw new Error('wp-cli runner: empty command')
  const env = dockerEnv()
  const plan = keep ? keepAlivePlan(base) : null
  const kept = plan ? createKeepAlive(plan, { spawn, env, log }) : null
  const startedAt = Date.now()
  const calls = []
  const run = (args, { stdin, allowFail = false, mutate = true } = {}) => {
    calls.push(args[0] + ' ' + (args[1] ?? ''))
    if (dryRun && mutate) {
      log?.(`[dry-run] wp ${args.join(' ')}`)
      return { code: 0, stdout: '', stderr: '' }
    }
    // The run's own clock: checked before every call, and no call may outlive it. A call that
    // never returns must fail the seed, not hang it (TRACY_WP_TIMEOUT s per call, default 600).
    const remaining = deadline === null ? Infinity : deadline - Date.now()
    if (remaining <= 0)
      throw new TimeoutError(`seed: timed out after ${Math.round((deadline - startedAt) / 100) / 10} s (at wp ${args.slice(0, 3).join(' ')})`)
    const exec = () => {
      const argv = kept ? kept.argv(args) : [...base, ...args.map(String)]
      return spawn(argv[0], argv.slice(1), {
        input: stdin,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env,
        timeout: Math.max(1, Math.min(perCallTimeoutMs(), remaining))
      })
    }
    let res = exec()
    // The kept container vanished (a second process on the same stand adopted it and cleaned up
    // first): start another and run the call again, once.
    if (kept && res.status !== 0 && CONTAINER_GONE.test(res.stderr ?? '')) {
      log?.(`wp-cli runner: container ${kept.name} is gone; starting another`)
      kept.reset()
      res = exec()
    }
    if (res.error?.code === 'ETIMEDOUT') throw new TimeoutError(`wp-cli runner: wp ${args.slice(0, 3).join(' ')} timed out`)
    if (res.error) throw new Error(`wp-cli runner: ${res.error.message}`)
    const stdout = res.stdout ?? ''
    const stderr = (res.stderr ?? '').replace(/^\s*Container .*$/gm, '').trim()
    if (res.status !== 0 && !allowFail) {
      throw new Error(
        `wp ${args.slice(0, 4).join(' ')} failed (${res.status}): ${stderr || stdout}`.slice(0, 2000)
      )
    }
    return { code: res.status, stdout, stderr }
  }
  const out = (args, opts) => run(args, opts).stdout.trim()
  const json = (args, opts) => {
    const list = args.some((a) => String(a).startsWith('--format=')) ? args : [...args, '--format=json']
    const text = out(list, { mutate: false, ...opts })
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error(`wp ${args.slice(0, 3).join(' ')}: not JSON: ${text.slice(0, 200)} (${e.message})`)
    }
  }
  const ids = (args, opts) => {
    const text = out([...args, '--format=ids'], { mutate: false, ...opts })
    return text ? text.split(/\s+/).map(Number) : []
  }
  const phpEval = (code, opts) => out(['eval', code], { mutate: false, ...opts })
  const dispose = () => kept?.dispose()
  return { run, out, json, ids, phpEval, calls, dryRun, dispose, container: kept?.name ?? null }
}

/** The list of `wp post list` rows for a post type, all statuses, with the fields the seeder compares. */
export function listPosts(
  wp,
  postType,
  fields = ['ID', 'post_name', 'post_title', 'post_status', 'post_parent']
) {
  return (
    wp.json([
      'post',
      'list',
      `--post_type=${postType}`,
      '--post_status=any',
      '--posts_per_page=-1',
      `--fields=${fields.join(',')}`
    ]) ?? []
  )
}
