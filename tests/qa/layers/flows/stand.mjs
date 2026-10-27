#!/usr/bin/env node
// Lifecycle of the one local stand of the QA suite: compose project `tchqa`, built from this tree,
// isolated from every other compose project on the machine, taken down with `down -v` and proven
// gone by Docker queries (labels and recorded ids).
//
//   stand.mjs up    --out DIR [--deadline-ms N]   build if needed, start, write DIR/stand/stand.json
//   stand.mjs down  --out DIR                     tear down what DIR/stand/intent.json names, prove it
//   stand.mjs proof --out DIR                     only the Docker queries
//   stand.mjs check --project tchqa --deadline-ms N --out DIR -- <command…>
//                                                 lease → up → run the command → always down + proof
//
// What it will never do: touch a compose project outside pool.mjs (`tchqa`, `tchqa-*`), adopt
// resources of `tchqa` that already exist, run a third stand (two is the machine's limit), or write
// outside DIR (build output included: the tree is copied into DIR/stand/src first).
//
// Every side effect is written to DIR/stand/intent.json BEFORE it happens, so a killed run still
// leaves the names its cleanup needs.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { OWNED_PROJECTS, SITE_POOL, STAND_PROJECT } from './pool.mjs'
import { REPO, UsageError, exec, nowIso, readJson, sleep, writeAtomic, writeJsonAtomic } from './util.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

export const LEASE_FILE = path.join(os.tmpdir(), 'tchqa-stand.lease.json')
// Builds are slow when the machine is shared by several agents (load average 100+ measured on a
// 10-core Mac): the budget is an hour and a half, overridable.
const MAX_STANDS = 2
const SUBNET_CANDIDATES = Array.from({ length: 24 }, (_, i) => `172.31.${77 + i}`)

// ── Docker access, injectable so the selftests never need Docker ───────────────────────────────

/** @typedef {(args: string[], opts?: { input?: string, timeoutMs?: number }) => Promise<{ code: number|null, stdout: string, stderr: string, timedOut?: boolean, error?: string }>} DockerRun */

/** @type {DockerRun} */
export const realDocker = (args, opts = {}) => exec('docker', args, { timeoutMs: 120_000, ...opts })

const lines = (text) =>
  String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

// ── The lease: one stand at a time on this machine ─────────────────────────────────────────────

const pidAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/**
 * Take the machine-wide lease. A lease held by a live process, or not yet past its deadline, is
 * refused; a dead holder's lease is replaced only when `canReclaim()` says no owned resource exists.
 * @param {{ file?: string, deadlineMs: number, owner: string, canReclaim?: () => Promise<boolean>, pid?: number }} opts
 */
export async function acquireLease({
  file = LEASE_FILE,
  deadlineMs,
  owner,
  canReclaim = async () => false,
  pid = process.pid
}) {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0)
    throw new UsageError('--deadline-ms must be a positive number')
  const body = {
    pid,
    owner,
    startedAt: nowIso(),
    deadlineAt: new Date(Date.now() + deadlineMs).toISOString(),
    token: randomBytes(8).toString('hex')
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, `${JSON.stringify(body)}\n`, { flag: 'wx', mode: 0o600 })
      return { file, ...body }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    let held
    try {
      held = JSON.parse(readTextSync(file))
    } catch {
      throw new Error(
        `lease ${file} exists and is unreadable; refusing to take it (remove it by hand once nothing of tchqa runs)`
      )
    }
    const alive = Number.isInteger(held.pid) && pidAlive(held.pid)
    // A live holder keeps the lease even past its deadline: it may still be building or tearing down.
    if (alive)
      throw new Error(`the stand lease is held by pid ${held.pid} (${held.owner}) until ${held.deadlineAt}`)
    if (!(await canReclaim()))
      throw new Error(
        `a stale lease (pid ${held.pid}, ${held.owner}) names a stand whose resources may still exist; refusing to reclaim until they are gone`
      )
    unlinkSync(file)
  }
  throw new Error('could not take the stand lease')
}

/** The lease as written on disk, or null when absent or unreadable. */
export function readLease(file = LEASE_FILE) {
  try {
    return JSON.parse(readTextSync(file))
  } catch {
    return null
  }
}

export function releaseLease(lease) {
  try {
    const held = JSON.parse(readTextSync(lease.file))
    if (held.token === lease.token) unlinkSync(lease.file)
  } catch {
    // already gone
  }
}

// ── Looking at Docker: what of ours exists ─────────────────────────────────────────────────────

const labelFilter = (project) => `label=com.docker.compose.project=${project}`

/**
 * Everything the owned projects have in Docker, by label, plus anything named `tchqa*`.
 * A failing query is reported as a gap, never as "nothing there".
 * @param {DockerRun} docker
 * @param {{ projects?: readonly string[] }} [opts]
 * @returns {Promise<{ ok: boolean, gaps: string[], containers: string[], volumes: string[], networks: string[] }>}
 */
export async function ownedResources(docker, { projects = OWNED_PROJECTS } = {}) {
  const out = { ok: true, gaps: [], containers: [], volumes: [], networks: [] }
  const ask = async (kind, args) => {
    const res = await docker(args)
    if (res.code !== 0 || res.error) {
      out.ok = false
      out.gaps.push(
        `${kind}: ${(res.stderr || res.error || `exit ${res.code}`).toString().trim().slice(0, 200)}`
      )
      return []
    }
    return lines(res.stdout)
  }
  for (const p of projects) {
    out.containers.push(
      ...(await ask(`containers of ${p}`, [
        'ps',
        '-a',
        '--filter',
        labelFilter(p),
        '--format',
        '{{.ID}} {{.Names}}'
      ]))
    )
    out.volumes.push(
      ...(await ask(`volumes of ${p}`, ['volume', 'ls', '--filter', labelFilter(p), '--format', '{{.Name}}']))
    )
    out.networks.push(
      ...(await ask(`networks of ${p}`, [
        'network',
        'ls',
        '--filter',
        labelFilter(p),
        '--format',
        '{{.ID}} {{.Name}}'
      ]))
    )
  }
  // Names, for resources a failed run created without the compose label (a half-made network).
  for (const n of await ask('networks by name', ['network', 'ls', '--format', '{{.ID}} {{.Name}}']))
    if (/\btchqa(?:[_-]|$)/.test(n.split(' ')[1] ?? '')) out.networks.push(n)
  for (const v of await ask('volumes by name', ['volume', 'ls', '--format', '{{.Name}}']))
    if (/^tchqa(?:[_-]|$)/.test(v)) out.volumes.push(v)
  for (const c of await ask('containers by name', ['ps', '-a', '--format', '{{.ID}} {{.Names}}']))
    if (/\btchqa(?:[_-]|$)/.test(c.split(' ')[1] ?? '')) out.containers.push(c)
  for (const k of ['containers', 'volumes', 'networks']) out[k] = [...new Set(out[k])].sort()
  return out
}

/** Prove nothing of ours is left: labels + the exact ids recorded in the intent file. */
export async function proveClean(docker, { intent, projects = OWNED_PROJECTS } = {}) {
  const found = await ownedResources(docker, { projects })
  const leftIds = []
  for (const id of intent?.ids ?? []) {
    const res = await docker(['inspect', '--format', '{{.Id}}', id])
    if (res.error || (res.code !== 0 && !/no such|not found|no such object/i.test(res.stderr))) {
      found.ok = false
      found.gaps.push(`inspect ${id.slice(0, 12)}: ${(res.stderr || res.error || '').slice(0, 120)}`)
    } else if (res.code === 0) leftIds.push(id)
  }
  const leftImages = []
  for (const tag of intent?.images ?? []) {
    const res = await docker(['image', 'inspect', '--format', '{{.Id}}', tag])
    if (res.error || (res.code !== 0 && !/no such|not found/i.test(res.stderr))) {
      found.ok = false
      found.gaps.push(`inspect image ${tag}: ${(res.stderr || res.error || '').slice(0, 120)}`)
    } else if (res.code === 0) leftImages.push(`image ${tag}`)
  }
  const left = [
    ...found.containers,
    ...found.volumes,
    ...found.networks,
    ...leftIds.map((i) => `id ${i}`),
    ...leftImages
  ]
  return {
    clean: found.ok && left.length === 0,
    queryOk: found.ok,
    gaps: found.gaps,
    left,
    checkedProjects: [...projects]
  }
}

/** Number of stands (compose projects with a tracy-web service) currently up on this machine. */
export async function countStands(docker) {
  const res = await docker([
    'ps',
    '--filter',
    'label=com.docker.compose.service=tracy-web',
    '--format',
    '{{.Label "com.docker.compose.project"}}'
  ])
  if (res.code !== 0) return { ok: false, count: 0, projects: [] }
  const projects = [...new Set(lines(res.stdout))]
  return { ok: true, count: projects.length, projects }
}

// ── The intent journal ─────────────────────────────────────────────────────────────────────────

export class Intent {
  /**
   * @param {string} file
   * @param {{ fresh?: boolean }} [opts] - start a new journal for a new run (token, start time)
   */
  constructor(file, { fresh = false } = {}) {
    this.file = file
    this.data =
      existsSync(file) && !fresh
        ? readJson(file)
        : {
            project: STAND_PROJECT,
            token: randomBytes(8).toString('hex'),
            createdAt: nowIso(),
            startedAtMs: Date.now(),
            steps: [],
            sites: [],
            ids: [],
            paths: [],
            images: []
          }
  }
  save() {
    writeJsonAtomic(this.file, this.data)
  }
  step(what, extra = {}) {
    this.data.steps.push({ at: nowIso(), what, ...extra })
    this.save()
  }
  /** A site label about to be created through the product door; must be a pool slot. */
  site(label, siteKey) {
    if (!SITE_POOL.includes(label)) throw new Error(`site label ${label} is outside the owned pool`)
    if (!this.data.sites.some((s) => s.label === label)) this.data.sites.push({ label, siteKey })
    this.save()
  }
  id(id) {
    if (!this.data.ids.includes(id)) this.data.ids.push(id)
    this.save()
  }
  path(p) {
    if (!this.data.paths.includes(p)) this.data.paths.push(p)
    this.save()
  }
  /** An image this run is about to build under a tag that did not exist before it. */
  image(tag) {
    this.data.images ??= []
    if (!this.data.images.includes(tag)) this.data.images.push(tag)
    this.save()
  }
}

// ── Layout, ports, generated files ─────────────────────────────────────────────────────────────

export function layout(out) {
  const root = path.join(path.resolve(out), 'stand')
  return {
    root,
    src: path.join(root, 'src'),
    data: path.join(root, 'data'),
    gen: path.join(root, 'gen'),
    intent: path.join(root, 'intent.json'),
    info: path.join(root, 'stand.json'),
    creds: path.join(root, 'credentials.json'),
    log: path.join(root, 'stand.log')
  }
}

export const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const portBusy = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.setTimeout(1500, () => {
      socket.destroy()
      resolve(false)
    })
  })

/** Pick a /24 prefix whose network no other Docker network uses. */
export async function chooseSubnet(docker, candidates = SUBNET_CANDIDATES) {
  const list = await docker(['network', 'ls', '-q'])
  if (list.code !== 0) throw new Error(`docker network ls failed: ${list.stderr.trim()}`)
  const used = []
  for (const id of lines(list.stdout)) {
    const res = await docker([
      'network',
      'inspect',
      id,
      '--format',
      '{{range .IPAM.Config}}{{.Subnet}} {{end}}'
    ])
    if (res.code === 0) used.push(...res.stdout.split(/\s+/).filter(Boolean))
  }
  for (const prefix of candidates) if (!used.some((s) => s.startsWith(`${prefix}.`))) return prefix
  throw new Error('no free 172.31.x.0/24 subnet for the stand')
}

/** The .env of the stand: generated secrets, this stand's ports and names. Never reuse elsewhere. */
export function envText({ ports, prefix, dataDir, secrets }) {
  const p = STAND_PROJECT
  return `${[
    '# tchqa — isolated local stand. Generated secrets; never reuse elsewhere.',
    `TRACY_ORIGIN=http://localhost:${ports.web}`,
    // Required: the image carries the docs site, served only at the root of its own host.
    `DOCS_ORIGIN=http://docs.localhost:${ports.web}`,
    'SITE_DOMAIN=localhost',
    'SITE_DOMAIN_ALIASES=',
    'SESSION_DOMAIN=',
    `SESSION_SECRET=${secrets.session}`,
    `MCP_TRACY_ACTOR_SECRET=${secrets.actor}`,
    `API_KEY_PEPPER=${secrets.pepper}`,
    `HOST_local_SECRET=${secrets.host}`,
    `SEAT_local_SECRET=${secrets.seat}`,
    'HOST_NAME=local',
    'HOSTS=local',
    `HOST_local_ORIGIN=http://tracy-host:${ports.host}`,
    'HOST_local_DSH_ORIGIN=http://tracy-dsh:8080',
    `TRACY_SITES_ROOT=${dataDir}/sites`,
    `TRACY_PRIVATE_ROOT=${dataDir}/private`,
    `TRACY_DSH_HOME=${dataDir}/dsh-home`,
    'DATABASE_URL=postgres://tracy:tracy@postgres:5432/tracy',
    `POSTGRES_PORT=${ports.pg}`,
    `WEB_PORT=${ports.web}`,
    `TRACY_HOST_PORT=${ports.host}`,
    `HOST_DNS_PORT=${ports.dns}`,
    `WEB_IMAGE=${p}/web`,
    `HOST_IMAGE=${p}/host`,
    `DSH_IMAGE=${p}/dsh`,
    'APP_IMAGE_TAG=dev',
    'DSH_IMAGE_TAG=dev',
    `TRACY_NETWORK_PREFIX=${prefix}`,
    `TRACY_SITE_DNS=${prefix}.53`,
    `TRACY_SITE_NETWORK=${p}_tracy`,
    `HOST_DSH_CONTAINER=${p}-dsh`,
    'TRACY_EGRESS_FENCE=off',
    `MINIO_PORT=${ports.minio}`,
    `ARTIFACT_S3_ENDPOINT=http://host.docker.internal:${ports.minio}`,
    'ARTIFACT_S3_BUCKET=tracy-artifacts',
    'ARTIFACT_S3_ACCESS_KEY=tracy',
    'ARTIFACT_S3_SECRET_KEY=tracy-tracy',
    `TRACY_MIGRATE_S3_ENDPOINT=http://host.docker.internal:${ports.minio}`,
    'TRACY_MIGRATE_S3_BUCKET=tracy-artifacts',
    'TRACY_MIGRATE_S3_ACCESS_KEY=tracy',
    'TRACY_MIGRATE_S3_SECRET_KEY=tracy-tracy',
    'MAIL=console',
    'SITE_MAIL=off',
    'BETA_GATE=off',
    'MODEL_API_KEY=',
    'TRACY_RELEASES_GITHUB_TOKEN='
  ].join('\n')}\n`
}

/** The third compose file: names, ports, env file and data mounts of THIS stand. */
export function overrideText({ envFile, ports, prefix, dataDir, srcDir }) {
  const p = STAND_PROJECT
  return `# Override for the isolated \`${p}\` project. Generated; always the THIRD file.
services:
  tracy-web:
    env_file: !override ["${envFile}"]
    dns: ["${prefix}.53"]
  tracy-host:
    env_file: !override ["${envFile}"]
  docker-proxy:
    container_name: ${p}-docker-proxy
  tracy-dsh:
    container_name: ${p}-dsh
    ports: !override ["127.0.0.1:${ports.dsh}:8080"]
    environment:
      DSH_TRUSTED_HOSTS: "localhost:${ports.web},127.0.0.1:${ports.web},127.0.0.1:${ports.dsh},localhost:${ports.dsh},host.docker.internal:${ports.dsh}"
  dns:
    volumes:
      - ${dataDir}/dns.d:/etc/dnsmasq.d:ro
  dns-host: !reset null
# source tree of this stand: ${srcDir}
`
}

export function composeArgs(l, project = STAND_PROJECT) {
  return [
    'compose',
    '-p',
    project,
    '--env-file',
    path.join(l.gen, '.env'),
    '-f',
    path.join(l.src, 'deploy/compose.yml'),
    '-f',
    path.join(l.src, 'deploy/compose.macos.yml'),
    '-f',
    path.join(l.gen, 'compose.override.yml'),
    '--profile',
    'local'
  ]
}

// ── Building from a copy of the tree (never inside the worktree) ───────────────────────────────

const log = (l, line) => {
  const text = `${nowIso()} ${line}`
  console.log(text)
  try {
    mkdirSync(l.root, { recursive: true })
    writeFileSync(l.log, `${text}\n`, { flag: 'a' })
  } catch {
    // logging must not fail the run
  }
}

/** A command of the bootstrap or teardown failed; `logFile` holds its complete output. */
export class CommandError extends Error {
  /** @param {string} message @param {string | null} logFile @param {string} output */
  constructor(message, logFile, output) {
    super(message)
    this.name = 'CommandError'
    this.logFile = logFile
    this.output = output
  }
}

/** The total deadline ran out while the stand was still being built. */
export class DeadlineError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DeadlineError'
  }
}

let commandCounter = 0

/**
 * Run one command with its COMPLETE output kept in DIR/stand/logs/ (stand.log gets the command, the
 * exit code and a pointer). The timeout is capped by what is left of the total deadline.
 */
async function sh(l, cmd, args, opts = {}) {
  const left = (l.deadline ?? Number.POSITIVE_INFINITY) - Date.now()
  if (left <= 0) throw new DeadlineError(`the total deadline ran out before ${cmd} ${args[0] ?? ''}`)
  const res = await exec(cmd, args, {
    cwd: opts.cwd ?? REPO,
    env: opts.env,
    input: opts.input,
    timeoutMs: Math.min(opts.timeoutMs ?? 600_000, left)
  })
  let logFile = null
  try {
    commandCounter += 1
    mkdirSync(path.join(l.root, 'logs'), { recursive: true })
    logFile = path.join(
      l.root,
      'logs',
      `${String(commandCounter).padStart(3, '0')}-${path.basename(cmd)}.log`
    )
    writeFileSync(
      logFile,
      `$ ${cmd} ${args.join(' ')}\nexit ${res.code}${res.timedOut ? ' (timed out)' : ''}${res.error ? ` error: ${res.error}` : ''}\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}\n`,
      { mode: 0o600 }
    )
    writeFileSync(
      l.log,
      `$ ${cmd} ${args.join(' ').slice(0, 300)} → exit ${res.code}; full output: ${logFile}\n`,
      {
        flag: 'a'
      }
    )
  } catch {
    // logging must not fail the run
  }
  if (opts.check !== false && (res.code !== 0 || res.error))
    throw new CommandError(
      `${cmd} ${args.slice(0, 6).join(' ')} exited ${res.code}${res.timedOut ? ' (timed out)' : ''}: ${(res.stderr || res.error || res.stdout).slice(-600)}`,
      logFile,
      `${res.stdout}\n${res.stderr}`
    )
  return { ...res, logFile }
}

/** Copy what the images build from into DIR/stand/src (tracked files of HEAD + the harness submodule). */
export async function prepareSource(l, intent) {
  if (existsSync(l.src)) rmSync(l.src, { recursive: true, force: true })
  mkdirSync(l.src, { recursive: true })
  intent.path(l.src)
  const tar = (archive, cwd, dest) =>
    new Promise((resolve, reject) => {
      const a = spawn('git', archive, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      const t = spawn('tar', ['-x', '-C', dest], { stdio: ['pipe', 'pipe', 'pipe'] })
      a.stdout.pipe(t.stdin)
      let err = ''
      a.stderr.on('data', (d) => {
        err += d
      })
      t.stderr.on('data', (d) => {
        err += d
      })
      a.on('close', (c) => c !== 0 && reject(new Error(`git archive: ${err.slice(-300)}`)))
      t.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`tar: ${err.slice(-300)}`))))
    })
  await tar(
    [
      'archive',
      '--format=tar',
      'HEAD',
      '--',
      'apps',
      'packages',
      'deploy',
      'vendor',
      'scripts',
      'docs',
      'package.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      'tsconfig.base.json',
      'tsconfig.scripts.json',
      'biome.jsonc',
      '.dockerignore',
      '.npmrc',
      ':(exclude)vendor/emdash/emdash'
    ],
    REPO,
    l.src
  )
  const sub = path.join(REPO, 'vendor/tracy/deepseek-harness')
  if (existsSync(path.join(sub, '.git')) || existsSync(sub)) {
    mkdirSync(path.join(l.src, 'vendor/tracy/deepseek-harness'), { recursive: true })
    await tar(['archive', '--format=tar', 'HEAD'], sub, path.join(l.src, 'vendor/tracy/deepseek-harness'))
  }
  const head = (await sh(l, 'git', ['rev-parse', 'HEAD'])).stdout.trim()
  return { commit: head }
}

/** Link the worktree's installs into the copy so the page builds the images copy in can run there. */
function linkInstalls(l) {
  const link = (rel) => {
    const from = path.join(REPO, rel)
    const to = path.join(l.src, rel)
    if (existsSync(from) && existsSync(path.dirname(to)) && !existsSync(to)) symlinkSync(from, to, 'dir')
  }
  link('node_modules')
  // Every workspace member the worktree has installed (apps/*, packages/<group>/*, vendor/<group>/*).
  const members = []
  for (const top of ['apps']) for (const d of safeDirs(path.join(REPO, top))) members.push(`${top}/${d}`)
  for (const top of ['packages', 'vendor'])
    for (const g of safeDirs(path.join(REPO, top)))
      for (const d of safeDirs(path.join(REPO, top, g))) members.push(`${top}/${g}/${d}`)
  for (const m of members) link(`${m}/node_modules`)
}
const safeDirs = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }
}

async function buildImages(l, intent, docker) {
  const built = [
    'packages/web/tracy-harness/dist',
    'packages/web/tracy-design-page/dist',
    'packages/web/tracy-wo-find-page/dist',
    'apps/tracy-web/static/ops-cms'
  ]
  if (built.some((d) => !existsSync(path.join(l.src, d)))) {
    log(l, 'building the pages the web image copies (inside the copy)')
    linkInstalls(l)
    const run = (cmd, args) => sh(l, cmd, args, { cwd: l.src, timeoutMs: 1_200_000 })
    await run('pnpm', ['--filter', '@tracy/harness-web', 'build'])
    await run('pnpm', ['--filter', '@tracy/design-page', 'build'])
    await run('pnpm', ['--filter', '@tracy/wo-find-page', 'build'])
    await run('pnpm', ['--filter', '@tracy/docs', 'build'])
    await run('node', ['scripts/gen-ops-cms-snapshot.mjs', '--out', 'apps/tracy-web/static/ops-cms'])
    await run('packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh', [])
  }
  const commit = (await sh(l, 'git', ['ls-tree', 'HEAD', 'vendor/tracy/deepseek-harness'])).stdout.split(
    /\s+/
  )[2]
  for (const tag of STAND_IMAGES) intent.image(tag)
  intent.step('docker build dsh', { image: `${STAND_PROJECT}/dsh:dev` })
  log(l, `building the dsh image (dsh ${commit?.slice(0, 12)})`)
  await sh(
    l,
    'docker',
    [
      'build',
      '--build-arg',
      `DSH_COMMIT=${commit}`,
      '-f',
      'packages/fleet/tracy-fleet-operation/dsh/Dockerfile',
      '-t',
      `${STAND_PROJECT}/dsh:dev`,
      '.'
    ],
    { cwd: l.src, timeoutMs: 2_400_000 }
  )
  intent.step('compose build web+host')
  log(l, 'building the web and host images')
  await sh(l, 'docker', [...composeArgs(l), 'build', 'tracy-web', 'tracy-host'], {
    cwd: l.src,
    timeoutMs: 1_800_000
  })
  void docker
}

// ── up ─────────────────────────────────────────────────────────────────────────────────────────

/** Tags the bootstrap builds; a run removes them only when none existed before it started. */
export const STAND_IMAGES = Object.freeze([
  `${STAND_PROJECT}/dsh:dev`,
  `${STAND_PROJECT}/web:dev`,
  `${STAND_PROJECT}/host:dev`
])

const MISSING_DEPENDENCY =
  /(pull access denied|failed to resolve source metadata|no such host|dial tcp|TLS handshake timeout|toomanyrequests|manifest unknown|cannot connect to the docker daemon|permission denied while trying to connect|command not found|spawn \S+ ENOENT|executable file not found)/i

/**
 * A build that failed: ENV only when its own output names a missing dependency (an image or registry
 * that cannot be reached, a tool that is not installed); anything else — a Dockerfile check, a
 * compile error, a test inside the build — is a build failure of this tree and is reported as one.
 * @param {Error & { output?: string, logFile?: string | null }} error
 * @returns {{ env: boolean, probe: string, logFile: string | null }}
 */
export function classifyBuildFailure(error) {
  const text = `${error.output ?? ''}\n${error.message}`
  const hit = MISSING_DEPENDENCY.exec(text)
  if (hit) {
    const line = text.split('\n').find((x) => MISSING_DEPENDENCY.test(x)) ?? hit[0]
    return { env: true, probe: line.trim().slice(0, 300), logFile: error.logFile ?? null }
  }
  return { env: false, probe: '', logFile: error.logFile ?? null }
}

/** The bootstrap failed in the product's own build/boot, not for a missing dependency. */
export class StandBuildError extends Error {
  /** @param {string} message @param {string | null} logFile */
  constructor(message, logFile) {
    super(message)
    this.name = 'StandBuildError'
    this.logFile = logFile
  }
}

/** Exceptions the CLI maps to ENV: a prerequisite is missing, with the probe that proves it. */
export class StandEnvError extends Error {
  /** @param {string} message @param {string} probe @param {boolean} [preflight] - nothing was created yet */
  constructor(message, probe, preflight = false) {
    super(message)
    this.name = 'StandEnvError'
    this.probe = probe
    this.preflight = preflight
  }
}

/** A refusal before anything was created: existing tchqa resources, a third stand… Not ENV, not ours to clean. */
export class PreflightRefusal extends Error {
  constructor(message) {
    super(message)
    this.name = 'PreflightRefusal'
    this.preflight = true
  }
}

/** Refuse an output path Docker would read as more than a path (mount syntax, control characters). */
export function assertMountable(p) {
  if (/[,:\0\n\r]/.test(p)) throw new UsageError(`output path ${JSON.stringify(p)} cannot be used in a mount`)
  return p
}

/** `target` is a real directory strictly inside `root` — no symlink at or above it below root. */
export function underRoot(root, target) {
  const rootReal = realpathSync(root)
  let st
  try {
    st = lstatSync(target)
  } catch {
    return false
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return false
  const real = realpathSync(target)
  return real.startsWith(rootReal + path.sep)
}

/** Run `a | b` without a shell: both commands are argument vectors. */
function pipeDocker(a, b, timeoutMs, kill) {
  return new Promise((resolve) => {
    const first = spawn('docker', a, { stdio: ['ignore', 'pipe', 'pipe'] })
    const second = spawn('docker', b, { stdio: ['pipe', 'pipe', 'pipe'] })
    let err = ''
    const note = (d) => {
      err = (err + d).slice(-4000)
    }
    first.stderr.on('data', note)
    second.stderr.on('data', note)
    first.stdout.pipe(second.stdin)
    const timer = setTimeout(() => {
      first.kill('SIGKILL')
      second.kill('SIGKILL')
    }, timeoutMs)
    kill?.(() => {
      first.kill('SIGTERM')
      second.kill('SIGTERM')
    })
    const codes = {}
    const end = () => {
      if (codes.a === undefined || codes.b === undefined) return
      clearTimeout(timer)
      resolve({ code: codes.a === 0 && codes.b === 0 ? 0 : codes.a || codes.b || 1, stderr: err })
    }
    first.on('close', (c) => {
      codes.a = c ?? 1
      end()
    })
    second.on('close', (c) => {
      codes.b = c ?? 1
      end()
    })
    first.on('error', (e) => {
      err += e.message
      codes.a = 127
      end()
    })
    second.on('error', (e) => {
      err += e.message
      codes.b = 127
      end()
    })
  })
}

/**
 * @param {{ out: string, docker?: DockerRun, build?: boolean, waitMs?: number, deadline?: number }} opts
 *   `deadline` is an epoch ms: every build/boot step is capped by what is left of it.
 */
export async function up({
  out,
  docker = realDocker,
  build = true,
  waitMs = 900_000,
  deadline: totalDeadline
}) {
  const l = layout(out)
  l.deadline = totalDeadline
  mkdirSync(l.root, { recursive: true })
  assertMountable(l.root)
  const info = await docker(['info', '--format', '{{.ServerVersion}}'])
  if (info.code !== 0 || info.error)
    throw new StandEnvError(
      'Docker is not reachable',
      `docker info: ${(info.stderr || info.error || '').slice(0, 200)}`,
      true
    )
  const before = await ownedResources(docker)
  if (!before.ok)
    throw new StandEnvError('cannot query Docker for existing tchqa resources', before.gaps.join('; '), true)
  const existing = [...before.containers, ...before.volumes, ...before.networks]
  if (existing.length)
    throw new PreflightRefusal(
      `refusing to start: tchqa resources already exist and are not ours to adopt: ${existing.join(', ')}`
    )
  for (const tag of STAND_IMAGES) {
    const img = await docker(['image', 'inspect', '--format', '{{.Id}}', tag])
    if (img.code === 0)
      throw new PreflightRefusal(
        `refusing to start: image ${tag} already exists and is not ours to adopt or remove (remove it by hand if it is stale)`
      )
  }
  const stands = await countStands(docker)
  if (!stands.ok) throw new StandEnvError('cannot count the running stands', 'docker ps failed', true)
  if (stands.count >= MAX_STANDS)
    throw new PreflightRefusal(
      `already ${stands.count} stands up (${stands.projects.join(', ')}); the machine takes two`
    )
  // From here on this run owns what it creates: a fresh journal with its token and start time.
  const intent = new Intent(l.intent, { fresh: true })
  intent.step('preflight clean', { baseline: 'no tchqa container, volume, network or image existed' })

  const ports = {}
  const taken = new Set()
  for (const name of ['web', 'host', 'pg', 'minio', 'dsh', 'dns']) {
    let port
    do port = await freePort()
    while (taken.has(port))
    taken.add(port)
    ports[name] = port
  }
  for (const port of Object.values(ports))
    if (await portBusy(port)) throw new Error(`port ${port} was taken between choosing and using it`)
  const prefix = await chooseSubnet(docker)
  intent.step('chosen', { ports, prefix })

  mkdirSync(l.gen, { recursive: true, mode: 0o700 })
  for (const d of ['sites', 'private', 'dsh-home', 'dns.d'])
    mkdirSync(path.join(l.data, d), { recursive: true, mode: 0o755 })
  intent.path(l.data)
  const secrets = Object.fromEntries(
    ['session', 'actor', 'pepper', 'host', 'seat'].map((k) => [k, randomBytes(32).toString('hex')])
  )
  writeAtomic(path.join(l.gen, '.env'), envText({ ports, prefix, dataDir: l.data, secrets }), { mode: 0o600 })
  const src = await prepareSource(l, intent)
  writeAtomic(
    path.join(l.gen, 'compose.override.yml'),
    overrideText({ envFile: path.join(l.gen, '.env'), ports, prefix, dataDir: l.data, srcDir: l.src }),
    { mode: 0o600 }
  )

  if (build) {
    try {
      await buildImages(l, intent, docker)
    } catch (error) {
      if (error instanceof DeadlineError) throw error
      const kind = classifyBuildFailure(error)
      if (kind.env)
        throw new StandEnvError(
          `the images could not be built: a dependency is missing (${kind.probe})`,
          `${kind.probe} — full output: ${kind.logFile ?? 'DIR/stand/stand.log'}`
        )
      throw new StandBuildError(
        `the images did not build from this tree: ${error.message.slice(0, 400)} — full output: ${kind.logFile ?? 'DIR/stand/stand.log'}`,
        kind.logFile
      )
    }
  }
  const dc = (args, o) => sh(l, 'docker', [...composeArgs(l), ...args], { cwd: l.src, ...o })
  const record = async () => {
    const ids = await docker(['ps', '-aq', '--no-trunc', '--filter', labelFilter(STAND_PROJECT)])
    for (const id of lines(ids.stdout)) intent.id(id)
  }
  intent.step('compose up infrastructure')
  log(l, 'starting postgres, minio, dns, docker-proxy, tracy-web, tracy-host')
  try {
    await dc(
      ['up', '-d', 'postgres', 'minio', 'minio-init', 'dns', 'docker-proxy', 'tracy-web', 'tracy-host'],
      { timeoutMs: 600_000 }
    )
  } finally {
    await record()
  }
  // dsh home is a bind mount: seed it with the image's own profiles, byte for byte (no shell).
  assertMountable(l.data)
  const seed = await pipeDocker(
    [
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      `${STAND_PROJECT}/dsh:dev`,
      '-c',
      'tar -C /desk-home -cf - profiles'
    ],
    [
      'run',
      '-i',
      '--rm',
      '--mount',
      `type=bind,source=${path.join(l.data, 'dsh-home')},target=/out`,
      'alpine',
      'tar',
      '-C',
      '/out',
      '-xf',
      '-'
    ],
    Math.min(600_000, Math.max(1000, (totalDeadline ?? Number.POSITIVE_INFINITY) - Date.now()))
  )
  if (seed.code !== 0) throw new Error(`seeding the dsh home failed: ${seed.stderr.slice(-300)}`)
  intent.step('compose up dsh')
  log(l, 'starting tracy-dsh')
  try {
    await dc(['up', '-d'], { timeoutMs: 900_000 })
  } finally {
    await record()
  }
  const origin = `http://localhost:${ports.web}`
  const waitUntil = Math.min(Date.now() + waitMs, totalDeadline ?? Number.POSITIVE_INFINITY)
  const healthy = async () => {
    const r = await docker(['inspect', '-f', '{{.State.Health.Status}}', `${STAND_PROJECT}-dsh`])
    return r.stdout.trim() === 'healthy'
  }
  while (!(await healthy())) {
    if (Date.now() > waitUntil) throw new DeadlineError('tracy-dsh did not become healthy in time')
    await sleep(3000)
  }
  while (!((await fetch(`${origin}/login`).catch(() => null))?.status === 200)) {
    if (Date.now() > waitUntil) throw new DeadlineError('tracy-web did not answer /login in time')
    await sleep(2000)
  }
  await record()
  const standInfo = {
    project: STAND_PROJECT,
    origin,
    siteDomain: 'localhost',
    ports,
    prefix,
    commit: src.commit,
    runToken: intent.data.token,
    containers: {
      web: `${STAND_PROJECT}-tracy-web-1`,
      host: `${STAND_PROJECT}-tracy-host-1`,
      postgres: `${STAND_PROJECT}-postgres-1`,
      dsh: `${STAND_PROJECT}-dsh`
    },
    startedAt: nowIso()
  }
  writeJsonAtomic(l.info, standInfo)
  writeJsonAtomic(
    l.creds,
    {
      note: 'generated for this stand only; mode 0600',
      SESSION_SECRET: secrets.session,
      MCP_TRACY_ACTOR_SECRET: secrets.actor,
      API_KEY_PEPPER: secrets.pepper
    },
    { mode: 0o600 }
  )
  chmodSync(l.creds, 0o600)
  return standInfo
}

/** The QA_STAND_* variables other layers read. */
export function standEnv(info, l) {
  return {
    QA_STAND_URL: info.origin,
    QA_STAND_PROJECT: info.project,
    QA_STAND_SITE_DOMAIN: info.siteDomain,
    QA_STAND_WEB_CONTAINER: info.containers.web,
    QA_STAND_HOST_CONTAINER: info.containers.host,
    QA_STAND_DB_CONTAINER: info.containers.postgres,
    QA_STAND_DSH_CONTAINER: info.containers.dsh,
    QA_STAND_INFO: l.info,
    QA_STAND_CREDENTIALS_FILE: l.creds,
    QA_STAND_COMMIT: info.commit
  }
}

// ── down + proof ───────────────────────────────────────────────────────────────────────────────

/**
 * Every container, volume and network of the owned projects with its project and creation time.
 * @param {DockerRun} docker
 */
export async function describeResources(docker, projects = OWNED_PROJECTS) {
  const gaps = []
  const items = []
  const list = async (args) => {
    const res = await docker(args)
    if (res.code !== 0 || res.error) {
      gaps.push(
        `${args.slice(0, 3).join(' ')}: ${(res.stderr || res.error || `exit ${res.code}`).toString().trim().slice(0, 160)}`
      )
      return []
    }
    return lines(res.stdout)
  }
  const created = async (kind, id) => {
    const args =
      kind === 'volume'
        ? ['volume', 'inspect', '--format', '{{.CreatedAt}}', id]
        : [kind, 'inspect', '--format', '{{.Created}}', id]
    const res = await docker(args)
    const ms = res.code === 0 ? Date.parse(res.stdout.trim()) : Number.NaN
    return Number.isFinite(ms) ? ms : null
  }
  const seen = new Set()
  const add = async (kind, id, name, project) => {
    const key = `${kind}:${id}`
    if (seen.has(key)) return
    seen.add(key)
    items.push({ kind, id, name, project, createdMs: await created(kind, id) })
  }
  for (const p of projects) {
    for (const row of await list([
      'ps',
      '-a',
      '--no-trunc',
      '--filter',
      labelFilter(p),
      '--format',
      '{{.ID}} {{.Names}}'
    ])) {
      const [id, name] = row.split(' ')
      await add('container', id, name, p)
    }
    for (const name of await list(['volume', 'ls', '--filter', labelFilter(p), '--format', '{{.Name}}']))
      await add('volume', name, name, p)
    for (const row of await list([
      'network',
      'ls',
      '--no-trunc',
      '--filter',
      labelFilter(p),
      '--format',
      '{{.ID}} {{.Name}}'
    ])) {
      const [id, name] = row.split(' ')
      await add('network', id, name, p)
    }
  }
  // Unlabelled leftovers of a half-made stand: named like the stand's own, attributed to the stand project.
  for (const row of await list(['network', 'ls', '--no-trunc', '--format', '{{.ID}} {{.Name}}'])) {
    const [id, name] = row.split(' ')
    if (/^tchqa(?:[_-]|$)/.test(name ?? '')) await add('network', id, name, STAND_PROJECT)
  }
  for (const name of await list(['volume', 'ls', '--format', '{{.Name}}']))
    if (/^tchqa(?:[_-]|$)/.test(name)) await add('volume', name, name, STAND_PROJECT)
  for (const row of await list(['ps', '-a', '--no-trunc', '--format', '{{.ID}} {{.Names}}'])) {
    const [id, name] = row.split(' ')
    if (/^tchqa(?:[_-]|$)/.test(name ?? '')) await add('container', id, name, STAND_PROJECT)
  }
  return { items, gaps }
}

/**
 * Split resources into what THIS run created and what it must not touch. Owned means: its journal
 * recorded the id, or it belongs to the stand project / a site label the journal names, and Docker
 * says it was created after the run started (the preflight had proved none existed before).
 * @param {{ kind: string, id: string, project: string, createdMs: number|null }[]} items
 * @param {{ ids?: string[], sites?: { label: string }[], startedAtMs?: number } | null} intent
 */
export function splitOwnership(items, intent) {
  const owned = []
  const foreign = []
  const labels = new Set([STAND_PROJECT, ...(intent?.sites ?? []).map((s) => s.label)])
  for (const it of items) {
    const recorded = (intent?.ids ?? []).some(
      (id) => id === it.id || id.startsWith(it.id) || it.id.startsWith(id)
    )
    const since = intent?.startedAtMs
    const fresh = Number.isFinite(since) && it.createdMs !== null && it.createdMs >= since - 2000
    if (intent && (recorded || (labels.has(it.project) && fresh))) owned.push(it)
    else foreign.push(it)
  }
  return { owned, foreign }
}

/**
 * Tear down what THIS run created: sites through the product door, then `down -v` of the stand
 * project (both compose files) when every resource under it is ours, then the owned leftovers one
 * by one by id, then the images and data copy this run made; then prove. Without a journal that
 * proves ownership nothing is removed. Every step runs even when an earlier one failed, and every
 * command's exit code is kept: a failed removal is a problem, never "clean".
 * @param {{ out: string, docker?: DockerRun, deleteSite?: (site: { label: string, siteKey: string }) => Promise<void> }} opts
 */
export async function down({ out, docker = realDocker, deleteSite }) {
  const l = layout(out)
  const problems = []
  const commands = []
  const intent = existsSync(l.intent) ? new Intent(l.intent) : null
  const run = async (what, args, o) => {
    const res = await docker(args, o)
    commands.push({ what, code: res.code, error: res.error ?? null, stderr: (res.stderr ?? '').slice(-200) })
    if (res.code !== 0 || res.error)
      problems.push(
        `${what}: ${(res.stderr || res.error || `exit ${res.code}`).toString().trim().slice(0, 200)}`
      )
    return res
  }
  if (!intent?.data.token || !Number.isFinite(intent.data.startedAtMs)) {
    problems.push(
      `no ownership journal at ${l.intent}: nothing is removed (a stand cannot be torn down without proof that this run created it)`
    )
  } else {
    if (deleteSite)
      for (const site of intent.data.sites) {
        try {
          await deleteSite(site)
        } catch (error) {
          problems.push(`delete door for ${site.label}: ${error.message}`)
        }
      }
    const described = await describeResources(docker)
    for (const g of described.gaps) problems.push(`cannot list: ${g}`)
    const { owned, foreign } = splitOwnership(described.items, intent.data)
    for (const f of foreign)
      problems.push(`refused: ${f.kind} ${f.name} (${f.project}) is not proven to belong to this run`)
    const stand = owned.filter((o) => o.project === STAND_PROJECT)
    const canCompose =
      !foreign.some((f) => f.project === STAND_PROJECT) &&
      existsSync(path.join(l.gen, '.env')) &&
      existsSync(l.src) &&
      stand.length > 0
    if (canCompose) {
      const res = await exec('docker', [...composeArgs(l, STAND_PROJECT), 'down', '-v', '--remove-orphans'], {
        cwd: l.src,
        timeoutMs: 600_000
      })
      commands.push({
        what: 'compose down -v tchqa',
        code: res.code,
        error: res.error ?? null,
        stderr: (res.stderr ?? '').slice(-200)
      })
      if (res.code !== 0 || res.error)
        problems.push(
          `compose down -v tchqa: ${(res.stderr || res.error || `exit ${res.code}`).trim().slice(0, 200)}`
        )
    }
    // Owned leftovers, by exact id, containers before networks and volumes.
    const again = await describeResources(docker)
    const left = splitOwnership(again.items, intent.data).owned
    for (const c of left.filter((x) => x.kind === 'container')) await run(`rm ${c.name}`, ['rm', '-fv', c.id])
    for (const v of left.filter((x) => x.kind === 'volume'))
      await run(`volume rm ${v.name}`, ['volume', 'rm', '-f', v.id])
    for (const n of left.filter((x) => x.kind === 'network'))
      await run(`network rm ${n.name}`, ['network', 'rm', n.id])
    // Images this run built under tags that did not exist before it.
    for (const tag of intent.data.images ?? []) {
      const has = await docker(['image', 'inspect', '--format', '{{.Id}}', tag])
      if (has.code === 0) await run(`image rm ${tag}`, ['image', 'rm', '-f', tag])
    }
    // The data copy: containers wrote it as other users, so a container removes it — only a real
    // directory inside this run's output tree, never a symlink pointing elsewhere.
    if (existsSync(l.data)) {
      if (!underRoot(l.root, l.data)) problems.push(`refused: ${l.data} is a symlink or leaves ${l.root}`)
      else {
        assertMountable(l.data)
        await run('empty data copy', [
          'run',
          '--rm',
          '--mount',
          `type=bind,source=${realpathSync(l.data)},target=/run-data`,
          'alpine',
          'sh',
          '-c',
          'rm -rf /run-data/* /run-data/.[!.]* 2>/dev/null; true'
        ])
        try {
          rmSync(l.data, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 })
        } catch (error) {
          problems.push(`data not removed: ${error.message}`)
        }
      }
    }
    for (const p of [l.src, l.gen]) {
      try {
        if (existsSync(p) && lstatSync(p).isSymbolicLink()) rmSync(p, { force: true })
        else rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 })
      } catch (error) {
        problems.push(`${p} not removed: ${error.message}`)
      }
    }
    for (const p of [l.data, l.src, l.gen]) if (existsSync(p)) problems.push(`left on disk: ${p}`)
  }
  const proof = await proveClean(docker, { intent: intent?.data })
  const result = { at: nowIso(), problems, commands, proof, clean: problems.length === 0 && proof.clean }
  mkdirSync(l.root, { recursive: true })
  writeJsonAtomic(path.join(l.root, 'teardown-proof.json'), result)
  return result
}

// ── check: lease → up → command → down ─────────────────────────────────────────────────────────

/**
 * @param {{ out: string, project: string, deadlineMs: number, argv: string[], docker?: DockerRun, leaseFile?: string, deps?: { up?: typeof up, down?: typeof down } }} opts
 */
export async function check({ out, project, deadlineMs, argv, docker = realDocker, leaseFile, deps = {} }) {
  const upFn = deps.up ?? up
  const downFn = deps.down ?? down
  if (project !== STAND_PROJECT)
    throw new UsageError(`--project must be ${STAND_PROJECT} (this run owns exactly that stand)`)
  if (!argv.length) throw new UsageError('no command after --')
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0)
    throw new UsageError('--deadline-ms must be a positive number')
  const l = layout(out)
  mkdirSync(l.root, { recursive: true })
  const status = { project, startedAt: nowIso(), phases: [], rawExit: null, command: argv.join(' ') }
  const lease = await acquireLease({
    file: leaseFile,
    deadlineMs,
    owner: `check ${out}`,
    canReclaim: async () => {
      const r = await ownedResources(docker)
      return r.ok && r.containers.length + r.volumes.length + r.networks.length === 0
    }
  })
  // One total deadline; the last part of it is reserved for teardown so a slow build cannot eat it.
  const startedMs = Date.now()
  const reserveMs = Math.min(1_200_000, Math.floor(deadlineMs / 4))
  const workUntil = startedMs + deadlineMs - reserveMs
  status.deadline = { totalMs: deadlineMs, teardownReserveMs: reserveMs }
  const controller = new AbortController()
  let interrupted = null
  const onSignal = (sig) => {
    interrupted = sig ?? 'signal'
    controller.abort()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  let info = null
  let standError = null
  try {
    try {
      info = await upFn({ out, docker, deadline: workUntil })
      status.phases.push({ phase: 'up', ok: true, at: nowIso() })
    } catch (error) {
      standError = error
      status.phases.push({
        phase: 'up',
        ok: false,
        error: error.message,
        probe: error.probe ?? null,
        kind:
          error instanceof StandEnvError
            ? 'env'
            : error instanceof StandBuildError
              ? 'build'
              : error instanceof DeadlineError
                ? 'deadline'
                : error.preflight
                  ? 'preflight'
                  : 'error',
        logFile: error.logFile ?? null,
        at: nowIso()
      })
    }
    if (!interrupted) {
      // The command always runs: with a stand it gets QA_STAND_*; without one it gets the reason, so
      // every case is still reported (ENV with the probe, or PENDING for a build/deadline failure).
      const env = { ...process.env }
      if (info) Object.assign(env, standEnv(info, l))
      else {
        delete env.QA_STAND_URL
        env.QA_STAND_BOOTSTRAP = JSON.stringify({
          kind: status.phases.at(-1).kind,
          detail: standError?.message ?? 'unknown',
          probe: standError?.probe ?? null,
          logFile: standError?.logFile ?? null
        })
      }
      const cmdBudget = info ? Math.max(1000, workUntil - Date.now()) : Math.min(600_000, reserveMs)
      const res = await new Promise((resolve) => {
        const child = spawn(argv[0], argv.slice(1), { cwd: REPO, env, stdio: 'inherit' })
        let killTimer
        const stop = () => {
          child.kill('SIGTERM')
          killTimer = setTimeout(() => child.kill('SIGKILL'), 15_000)
        }
        const timer = setTimeout(stop, cmdBudget)
        controller.signal.addEventListener('abort', stop, { once: true })
        child.on('close', (code, sig) => {
          clearTimeout(timer)
          clearTimeout(killTimer)
          resolve({ code, sig })
        })
        child.on('error', () => resolve({ code: 127, sig: null }))
      })
      status.rawExit = res.code ?? (res.sig ? 128 : 1)
      status.phases.push({ phase: 'command', exit: status.rawExit, signal: res.sig ?? null, at: nowIso() })
    }
  } finally {
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    if (standError?.preflight) {
      // Nothing was created by this run, so nothing is torn down — resources that were already
      // there are not ours. The proof is still taken, and a failed query is a gap, not "clean".
      const proof = await proveClean(docker, { intent: null })
      status.phases.push({
        phase: 'down',
        skipped: 'preflight refused before creating anything',
        clean: proof.clean,
        left: proof.left,
        gaps: proof.gaps,
        at: nowIso()
      })
      status.teardownClean = proof.clean
      status.proofGap = !proof.queryOk
    } else {
      const teardown = await downFn({ out, docker })
      status.phases.push({
        phase: 'down',
        clean: teardown.clean,
        left: teardown.proof.left,
        gaps: teardown.proof.gaps,
        problems: teardown.problems,
        at: nowIso()
      })
      status.teardownClean = teardown.clean
      status.proofGap = !teardown.proof.queryOk
    }
    releaseLease(lease)
  }
  status.interrupted = interrupted
  status.finishedAt = nowIso()
  writeJsonAtomic(path.join(l.root, 'lifecycle.json'), status)
  // 0: lifecycle clean and the command ended 0 or 3 (3 = ENV/PENDING only: reported, not hidden).
  // The command's own FAIL/contract exit is passed through; an unclean teardown or a stand that did
  // not build is always 1 — only a PROVEN missing dependency (ENV) or a refusal before any side
  // effect with an unprovable proof is 3.
  let exit
  if (standError instanceof StandEnvError && standError.preflight && status.proofGap) exit = 3
  else if (!status.teardownClean || interrupted) exit = 1
  else if (standError)
    exit = standError instanceof UsageError ? 2 : standError instanceof StandEnvError ? 3 : 1
  else exit = status.rawExit === 3 ? 0 : (status.rawExit ?? 1)
  status.exit = exit
  writeJsonAtomic(path.join(l.root, 'lifecycle.json'), status)
  return status
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────

export async function main(argv) {
  const dd = argv.indexOf('--')
  const own = dd === -1 ? argv : argv.slice(0, dd)
  const rest = dd === -1 ? [] : argv.slice(dd + 1)
  const [cmd, ...flags] = own
  if (!['up', 'down', 'proof', 'check'].includes(cmd))
    throw new UsageError(
      'usage: stand.mjs up|down|proof|check --out DIR [--project tchqa --deadline-ms N] [-- command…]'
    )
  const { values } = parseArgs({
    args: flags,
    options: { out: { type: 'string' }, project: { type: 'string' }, 'deadline-ms': { type: 'string' } },
    strict: true,
    allowPositionals: false
  })
  if (!values.out) throw new UsageError('--out DIR is required')
  const out = path.resolve(values.out)
  if (cmd === 'up') {
    const info = await up({ out })
    console.log(JSON.stringify(standEnv(info, layout(out)), null, 2))
    return 0
  }
  if (cmd === 'down') {
    const held = readLease()
    if (held && Number.isInteger(held.pid) && pidAlive(held.pid) && held.pid !== process.pid)
      throw new Error(
        `refusing to tear down: the stand lease is held by live pid ${held.pid} (${held.owner})`
      )
    const r = await down({ out })
    console.log(JSON.stringify(r, null, 2))
    return r.clean ? 0 : 1
  }
  if (cmd === 'proof') {
    const l = layout(out)
    const intent = existsSync(l.intent) ? readJson(l.intent) : null
    const r = await proveClean(realDocker, { intent })
    console.log(JSON.stringify(r, null, 2))
    return r.clean ? 0 : 1
  }
  const deadlineMs = Number(values['deadline-ms'])
  const status = await check({ out, project: values.project ?? '', deadlineMs, argv: rest })
  console.log(
    `stand check: exit ${status.exit} (command exit ${status.rawExit}, teardown clean ${status.teardownClean})`
  )
  return status.exit
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`stand: ${error.message}`)
      process.exit(
        error instanceof UsageError || error.code?.startsWith?.('ERR_PARSE_ARGS')
          ? 2
          : error instanceof StandEnvError
            ? 3
            : 1
      )
    }
  )
}
