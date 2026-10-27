#!/usr/bin/env node
/**
 * A docker CLI stand-in for the migrate-web-dns-alias.sh lifecycle tests — enough of `inspect`,
 * `ps`, `exec` and `compose` to drive the migration end to end without a daemon. It is a TEST
 * DOUBLE, not a second implementation of anything the script relies on: the semantic-diff and patch
 * logic live in dns-alias.mjs and are tested against it directly.
 *
 * It reads a JSON state file (FAKE_STATE) describing the containers, `docker ps` results and the
 * behaviour of each `compose up`, appends every invocation to a log (FAKE_LOG) the test asserts on,
 * and mutates the state on `up` so a later `inspect` sees the recreated container.
 *
 * `compose config --format json` is served by parsing the on-disk compose with the repo's own
 * js-yaml (a dev dependency; nothing here ships), after resolving `${VAR}` from the site's .env the
 * way compose does — a real YAML parser rather than a bespoke partial one, so the structure the
 * semantic diff compares is the structure compose would actually produce.
 *
 * Drift hooks let a test simulate a concurrent editor deterministically: `state.driftCompose` /
 * `state.driftImage` fire once, on a named call (a full-JSON inspect, or a `compose up`), then clear
 * — so a test can move bytes or the image ID out from under the migration mid-run and assert it
 * refuses or restores rather than overwriting.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { renderInspectFormat } from './docker-inspect-format.mjs'

// Per-call context. `handle()` sets these and runs to completion synchronously, so one module can
// serve many invocations from one long-lived process (tool-server.mjs) or a single one (the CLI
// entry at the bottom) — the stub's behaviour is identical either way.
let argv = []
let STATE = ''
let LOG = ''
let ENV = process.env
let PPID = process.ppid
let stdoutBuf = ''
let stderrBuf = ''

const readState = () => JSON.parse(readFileSync(STATE, 'utf8'))
const writeState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2))

const out = (s) => {
  stdoutBuf += s
}
const err = (s) => {
  stderrBuf += s
}
class Exit extends Error {
  constructor(code) {
    super(`exit ${code}`)
    this.code = code
  }
}
const die = (code) => {
  throw new Exit(code)
}

// ── ${VAR} interpolation, then a real YAML parse ─────────────────────────────────────────────────

function interpolate(text, env) {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:-[^}]*|:\?[^}]*|:\+[^}]*)?\}/g, (_m, name, op) => {
    const v = env[name]
    const has = v !== undefined && v !== ''
    if (!op) return has ? v : ''
    if (op.startsWith(':-')) return has ? v : op.slice(2)
    if (op.startsWith(':+')) return has ? op.slice(2) : ''
    if (op.startsWith(':?')) {
      if (!has) throw new Error(`required variable ${name} is unset: ${op.slice(2)}`)
      return v
    }
    return has ? v : ''
  })
}

/** The site's .env layered over process.env, the way compose resolves ${VAR}. */
function fileEnv(file) {
  const env = { ...ENV }
  try {
    for (const line of readFileSync(path.join(path.dirname(file), '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (m) env[m[1]] = m[2]
    }
  } catch {}
  return env
}

function composeConfigJson(file) {
  const doc = load(interpolate(readFileSync(file, 'utf8'), fileEnv(file)))
  // Long-form the web service ports the way real `compose config` does, so dns-alias.mjs web-port
  // reads a `.target` field.
  const ports = doc?.services?.web?.ports
  if (Array.isArray(ports)) {
    doc.services.web.ports = ports.map((p) => {
      const seg = String(p).split(':')
      return {
        mode: 'ingress',
        protocol: 'tcp',
        published: seg[seg.length - 2],
        target: Number(seg[seg.length - 1])
      }
    })
  }
  return JSON.stringify(doc, null, 2)
}

/**
 * The compose config-hash of the web service, standing in for what `docker compose config --hash web`
 * and the container's `com.docker.compose.config-hash` label would carry. A stable sha256 over the
 * resolved web service — computed from the file on disk, so by default the "file hash" and the
 * "container was created from this file" hash AGREE. A test that wants a pre-existing #162 mismatch
 * sets an explicit stale label on the container instead.
 */
function webConfigHash(file) {
  const doc = load(interpolate(readFileSync(file, 'utf8'), fileEnv(file)))
  const web = doc?.services?.web ?? {}
  return createHash('sha256').update(JSON.stringify(web)).digest('hex')
}

/** The tracy alias the (possibly candidate) compose file gives the web service, or []. */
function fileAliases(file) {
  const m = readFileSync(file, 'utf8').match(/^ {8}aliases:\s*\[([^\]]*)\]/m)
  if (!m) return []
  return m[1]
    .split(',')
    .map((s) => s.replace(/^["']|["']$/g, '').trim())
    .filter(Boolean)
}

// ── deterministic mid-run drift ──────────────────────────────────────────────────────────────────

/** Fire any drift armed for this call kind ('inspect-json' | 'up'), once, then clear it. */
function applyDrift(kind, state) {
  let mutated = false
  if (state.driftCompose && state.driftCompose.on === kind) {
    appendFileSync(
      path.join(state.siteDir, 'docker-compose.yml'),
      state.driftCompose.append ?? '\n# concurrent edit\n'
    )
    delete state.driftCompose
    mutated = true
  }
  if (state.driftImage && state.driftImage.on === kind) {
    const web = `${path.basename(state.siteDir)}-web-1`
    if (state.containers[web]) state.containers[web].image = state.driftImage.to
    delete state.driftImage
    mutated = true
  }
  // A mutable IMAGE TAG that moves without the running container's own .Image moving: only the
  // tag→id resolution changes, so the fingerprint still matches but a --pull never recreate would
  // land on a different image. Distinct from driftImage (runtime-image drift).
  if (state.driftResolve && state.driftResolve.on === kind) {
    state.imageResolves = { ...state.imageResolves, [state.driftResolve.ref]: state.driftResolve.to }
    delete state.driftResolve
    mutated = true
  }
  if (mutated) writeState(state)
}

/**
 * The nearest ancestor process that is the migrate script itself (`bash …/migrate-web-dns-alias.sh …`),
 * walking up from this stub. A test uses it to deliver a catchable SIGTERM mid-run — after the swap —
 * to exercise the phase-aware cleanup restore deterministically, without racing a wall-clock timer.
 * Matches `.sh` specifically so the `node --test …migrate-web-dns-alias.test.mjs` runner never matches.
 */
function ancestorMigratePid() {
  let pid = PPID
  let target = null
  const seen = new Set()
  for (let hops = 0; pid > 1 && hops < 20 && !seen.has(pid); hops += 1) {
    seen.add(pid)
    let cmd = ''
    let ppid = 0
    try {
      // `-ww` disables the width truncation that would otherwise cut a long script path off before
      // `migrate-web-dns-alias.sh` in a non-tty (both GNU and BSD ps accept it).
      cmd = execSync(`ps -ww -o command= -p ${pid}`, { encoding: 'utf8' })
      ppid = Number(execSync(`ps -o ppid= -p ${pid}`, { encoding: 'utf8' }).trim())
    } catch {
      break
    }
    if (cmd.includes('migrate-web-dns-alias.sh')) target = pid
    pid = ppid
  }
  return target
}

// ── docker subcommands ───────────────────────────────────────────────────────────────────────────

function doInspect() {
  const state = readState()
  // Two argument orders: `inspect -f TMPL NAME` and `inspect NAME --format TMPL`.
  let fmt = null
  let name = null
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '-f' || argv[i] === '--format') {
      fmt = argv[i + 1]
      i += 1
    } else name = argv[i]
  }
  const c = state.containers?.[name]
  if (!fmt) {
    if (!c) die(1)
    out(
      JSON.stringify([
        {
          Id: c.id,
          Image: c.image,
          State: { Running: !!c.running, Health: c.health ? { Status: c.health } : null },
          Config: { Labels: c.labels || {} },
          NetworkSettings: { Networks: c.networks || {} }
        }
      ])
    )
    // A full-JSON inspect is the deterministic point a test uses to drift the file/image during
    // preflight, after the baseline is captured but before the apply revalidate.
    applyDrift('inspect-json', state)
    return
  }
  if (fmt.includes('.State.Running')) {
    if (!c) die(1)
    return out(String(!!c.running))
  }
  // Health goes through the shared renderer, so a template the Docker CLI 27.x in tracy-host refuses
  // (a field access to the Health key a container without a healthcheck lacks) fails here too.
  if (fmt.includes('Health')) {
    if (!c) die(1)
    const r = renderInspectFormat(fmt, {
      State: { Running: !!c.running, ...(c.health ? { Health: { Status: c.health } } : {}) }
    })
    if (r.code !== 0) {
      err(r.stderr)
      return die(r.code)
    }
    return out(r.stdout)
  }
  // The compose config-hash label: an explicit value on the container (a test simulating a
  // pre-existing #162 config the container predates) wins; otherwise it is derived from the compose
  // file on disk, so a container "created from this file" matches `compose config --hash web`.
  if (fmt.includes('config-hash')) {
    if (!c) die(1)
    const stored = c.labels?.['com.docker.compose.config-hash']
    if (stored !== undefined) return out(String(stored))
    return out(webConfigHash(path.join(state.siteDir, 'docker-compose.yml')))
  }
  // The migration's identity fingerprint: container id, image id, and the compose file it is
  // associated with — image included so a mutable-tag drift to a different id is caught.
  if (fmt.includes('.Image')) {
    if (!c) die(1)
    return out(`${c.id}|${c.image || ''}|${c.labels?.['com.docker.compose.project.config_files'] || ''}`)
  }
  if (fmt.includes('working_dir')) return out(c?.labels?.['com.docker.compose.project.working_dir'] || '')
  return out('')
}

function doImageInspect() {
  // `image inspect <ref> --format {{.Id}}` — resolve a compose image reference to a local image id.
  const state = readState()
  let ref = null
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '-f' || argv[i] === '--format') {
      i += 1
    } else if (!ref) ref = argv[i]
  }
  const web = `${path.basename(state.siteDir)}-web-1`
  // By default a tag resolves to exactly the image the running container was created from (no drift);
  // a test overrides state.imageResolves[ref] to simulate a mutable tag that moved.
  const id = (state.imageResolves && state.imageResolves[ref]) || state.containers?.[web]?.image
  if (!id) die(1)
  out(id)
}

function doPs() {
  const state = readState()
  let project = null
  let service = null
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--filter') {
      const f = argv[i + 1]
      if (f.startsWith('label=com.docker.compose.project=')) project = f.split('=').pop()
      if (f.startsWith('label=com.docker.compose.service=')) service = f.split('=').pop()
      i += 1
    }
  }
  const names = state.ps?.[`${project}/${service}`] || []
  out(names.join('\n'))
}

function doExec() {
  // `exec NAME true` (reachability) or `exec NAME node -e CODE MODE HOST PORT [IP]` (the probe).
  const state = readState()
  const ni = argv.indexOf('node')
  if (ni !== -1) {
    // The probe's first data arg is its MODE: `dns` (forward, resolve the alias) or `direct` (rollback,
    // connect straight to the endpoint IP). The exit code is the verdict.
    const mode = argv[ni + 3]
    if (mode === 'direct') {
      // The rollback endpoint probe succeeds unless a test explicitly breaks it — it is a different
      // question from the forward DNS probe (state.probe), which may well be what failed forward.
      switch (state.rollbackProbe) {
        case 'httpfail':
          err('http:ECONNREFUSED')
          return die(4)
        case 'timeout':
          err('http:timeout')
          return die(3)
        default:
          out('http:200')
          return die(0)
      }
    }
    // dns mode: the stub picks the outcome so a test can drive a DNS miss, an HTTP failure, or a
    // resolution that points at the WRONG endpoint.
    switch (state.probe) {
      case 'dnsfail':
        err('dns:ENOTFOUND')
        return die(2)
      case 'httpfail':
        err('http:ECONNREFUSED')
        return die(4)
      case 'wrongip':
        err('endpoint:mismatch')
        return die(5)
      default:
        out('http:200')
        return die(0)
    }
  }
  return die(0)
}

function doCompose() {
  const state = readState()
  let file = null
  let action = null
  let hashService = null
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '-f') {
      file = argv[i + 1]
      i += 1
    } else if (argv[i] === '--hash') {
      hashService = argv[i + 1]
      i += 1
    } else if (['config', 'up', 'down', 'stop'].includes(argv[i]) && !action) action = argv[i]
  }
  if (action === 'config' && hashService !== null) {
    // `compose config --hash web` → `web <hash>`; the same value a container created from this file
    // carries as com.docker.compose.config-hash (see doInspect).
    out(`${hashService} ${webConfigHash(file)}\n`)
    return
  }
  if (action === 'config') {
    try {
      let json = composeConfigJson(file)
      // A candidate that validates through compose yet differs semantically: mutate a field the
      // patch never touches, so the test can drive the "differs by more than the alias" refusal.
      if (state.tamperCandidate && path.basename(file).includes('candidate')) {
        const doc = JSON.parse(json)
        if (doc.services?.web) doc.services.web.mem_limit = '999m'
        json = JSON.stringify(doc, null, 2)
      }
      out(json)
    } catch (e) {
      err(String(e.message))
      die(1)
    }
    return
  }
  if (action === 'up') {
    // 🔒 A deterministic "unexpected exit after the swap": on the FIRST recreate up, signal the migrate
    // script with SIGTERM (a catchable signal, unlike SIGKILL) so it exits THROUGH cleanup. On the NEXT
    // up — the rollback recreate cleanup drives — record that the owned lock is STILL held (cleanup must
    // release it only after the restore, so it is held through the whole rollback and its probes).
    {
      const hook = readState()
      const lock = path.join(hook.siteDir, '.dns-alias.lock')
      if (hook.killOnRecreate) {
        delete hook.killOnRecreate
        hook.killed = true
        writeState(hook)
        const pid = ancestorMigratePid()
        if (pid) {
          try {
            process.kill(pid, 'SIGTERM')
          } catch {}
        }
      } else if (hook.killed && hook.lockDuringRollback === undefined) {
        hook.lockDuringRollback = existsSync(lock)
        writeState(hook)
      }
    }
    const s0 = readState()
    const behavior = (s0.up && s0.up.shift()) || 'ok-alias'
    writeState(s0)
    // A concurrent editor can move bytes during the recreate — a test uses this to prove rollback
    // refuses to overwrite a post-swap edit.
    applyDrift('up', readState())
    if (behavior === 'fail') die(1)
    // The recreated web container reflects the compose file now on disk.
    const compose = path.join(s0.siteDir, 'docker-compose.yml')
    const label = path.basename(s0.siteDir)
    const web = `${label}-web-1`
    const net = s0.network || 'tracy_tracy'
    const s2 = readState()
    const c = s2.containers[web] || {}
    c.running = true
    // `ok-healthy` / `ok-unhealthy` recreate a web container that declares a healthcheck; every other
    // behaviour recreates one without (no Health key under .State).
    c.health = behavior === 'ok-healthy' ? 'healthy' : behavior === 'ok-unhealthy' ? 'unhealthy' : ''
    const aliases = behavior === 'ok-noalias' ? [] : fileAliases(compose)
    c.networks = {
      default: { Aliases: [], IPAddress: '172.20.0.9' },
      [net]: { Aliases: aliases, IPAddress: '172.20.0.5' }
    }
    // The recreated container's config-hash reflects the compose on disk by default (clear any stale
    // label so `config-hash` inspect falls back to the file). `ok-badhash` stamps a WRONG one, so a
    // test can prove the post-recreate config-hash gate refuses a container built from a drifted config.
    c.labels = c.labels || {}
    if (behavior === 'ok-badhash') {
      c.labels['com.docker.compose.config-hash'] = s0.badHash || `sha256:${'ba'.repeat(32)}`
    } else {
      delete c.labels['com.docker.compose.config-hash']
    }
    s2.containers[web] = c
    writeState(s2)
    return die(0)
  }
  return die(0)
}

function dispatch() {
  switch (argv[0]) {
    case 'inspect':
      doInspect()
      break
    case 'image':
      doImageInspect()
      break
    case 'ps':
      doPs()
      break
    case 'exec':
      doExec()
      break
    case 'compose':
      doCompose()
      break
    default:
      err(`fake-docker: unhandled ${argv[0]}\n`)
      die(2)
  }
}

/**
 * Run one docker invocation to completion. `env` supplies FAKE_STATE / FAKE_LOG (and the process
 * environment compose interpolation layers the site's .env over); `ppid` is the caller's pid, the
 * starting point of the walk to the migrate script.
 */
export function handle({ args, env, ppid }) {
  argv = args
  ENV = env
  PPID = ppid
  STATE = env.FAKE_STATE
  LOG = env.FAKE_LOG
  stdoutBuf = ''
  stderrBuf = ''
  let code = 0
  try {
    if (LOG) appendFileSync(LOG, argv.join(' ') + '\n')
    dispatch()
  } catch (e) {
    if (!(e instanceof Exit)) throw e
    code = e.code
  }
  return { code, stdout: stdoutBuf, stderr: stderrBuf }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = handle({ args: process.argv.slice(2), env: process.env, ppid: process.ppid })
  process.stdout.write(r.stdout)
  process.stderr.write(r.stderr)
  process.exitCode = r.code
}
