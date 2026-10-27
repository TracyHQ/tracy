// `pnpm qa stand up|reuse|down`: an isolated copy of the local 7-service system under compose
// project `tchqa-<id>`. Only resources listed in the stand manifest are ever deleted.
//
// Unverified in W0: a live bring-up (images, Docker Desktop host networking, real probes). The
// logic is exercised through a fake Docker adapter and --dry-run; see tests/qa/README.md.
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { STAND_ID } from './args.mjs'
import {
  UnsafePathError,
  assertNoSymlinkPath,
  atomicWrite,
  lstatOrNull,
  readJsonFile,
  readRegularFile,
  sha256,
  writeJson
} from './fsafe.mjs'
import { validate } from './schema.mjs'

export const MAX_STANDS = 2
const COMPOSE_TIMEOUT_MS = 600_000
const STALE_LOCK_MS = 120_000
const SERVICES = [
  'postgres',
  'tracy-web',
  'minio',
  'minio-init',
  'tracy-host',
  'docker-proxy',
  'tracy-dsh',
  'dns'
]
const NETWORKS = ['default', 'docker-api', 'egress', 'tracy']
const VOLUMES = ['tracy-pg', 'tracy-minio', 'tracy-host-jobs']

export class StandError extends Error {
  constructor(message, exitCode = 2) {
    super(message)
    this.exitCode = exitCode
  }
}

export const projectFor = (id) => `tchqa-${id}`

export function assertOwnedProject(id, project) {
  if (!STAND_ID.test(id) || project !== projectFor(id)) {
    throw new StandError(
      `refusing project "${project}": only tchqa-<id> projects of this stand may be touched`
    )
  }
}

// A resource name belongs to the stand only if it starts with `tchqa-<id>` followed by `-` or `_`.
const ownsName = (project, name) =>
  typeof name === 'string' && (name.startsWith(`${project}-`) || name.startsWith(`${project}_`))

const MANIFEST_SCHEMA = {
  type: 'object',
  required: [
    'schema_version',
    'id',
    'project',
    'status',
    'created_at',
    'platform',
    'ports',
    'resources',
    'dirs',
    'fingerprints',
    'git'
  ],
  properties: {
    schema_version: { const: '1' },
    id: { type: 'string', pattern: STAND_ID.source },
    project: { type: 'string', pattern: '^tchqa-[a-z0-9-]+$' },
    status: { enum: ['reserved', 'starting', 'up', 'failed', 'stopped', 'leftover', 'tearing-down', 'down'] },
    created_at: { type: 'string', format: 'date-time' },
    platform: { type: 'string', minLength: 1 },
    ports: { type: 'object' },
    dirs: { type: 'array', items: { type: 'string', minLength: 1 } },
    git: {
      type: 'object',
      required: ['sha'],
      properties: { sha: { type: 'string' }, dirty: { type: ['boolean', 'null'] } }
    },
    fingerprints: {
      type: 'object',
      required: ['config', 'fixture', 'image'],
      properties: { config: { type: 'string' }, fixture: { type: 'string' }, image: { type: 'object' } }
    },
    resources: {
      type: 'object',
      required: ['containers', 'volumes', 'networks'],
      properties: Object.fromEntries(
        ['containers', 'volumes', 'networks'].map((k) => [
          k,
          {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'id'],
              properties: { name: { type: 'string', minLength: 1 }, id: { type: ['string', 'null'] } }
            }
          }
        ])
      )
    }
  }
}

export function standPaths(deps, id) {
  const standsDir = path.join(deps.resultsRoot, 'stands')
  const root = path.join(standsDir, id)
  return {
    standsDir,
    root,
    manifest: path.join(standsDir, `${id}.json`),
    override: path.join(root, 'compose.override.yml'),
    env: path.join(root, 'stand.env'),
    lock: path.join(standsDir, '.lease.lock')
  }
}

function hashNumber(id) {
  return Number.parseInt(sha256(id).slice(0, 8), 16)
}

export function planStand(deps, id) {
  const project = projectFor(id)
  const paths = standPaths(deps, id)
  const platform = deps.platform ?? process.platform
  const h = hashNumber(id)
  const base = 53100 + (h % 100) * 10
  const ports = {
    web: base,
    host: base + 1,
    dsh: base + 2,
    postgres: base + 3,
    minio: base + 4,
    dns: base + 5
  }
  const prefix = `10.${200 + (h % 50)}.${Math.floor(h / 256) % 250}`
  const darwin = platform === 'darwin'
  const files = [path.join(deps.repoRoot, 'deploy/compose.yml')]
  if (darwin) files.push(path.join(deps.repoRoot, 'deploy/compose.macos.yml'))
  files.push(paths.override)
  const webInner = darwin ? ports.web : 8080
  const hostOrigin = darwin ? `http://tracy-host:${ports.host}` : `http://host.docker.internal:${ports.host}`
  // Where tracy-host reaches tracy-web: on macOS it sits on the compose bridge and uses the service
  // name; on Linux it runs in the host network namespace and uses loopback.
  const webFromHost = darwin ? `http://tracy-web:${ports.web}` : `http://127.0.0.1:${ports.web}`
  const resources = {
    containers: [
      ...SERVICES.map((s) => `${project}-${s}-1`).filter(
        (n) => !n.endsWith('-docker-proxy-1') && !n.endsWith('-tracy-dsh-1')
      ),
      `${project}-docker-proxy`,
      `${project}-dsh`
    ],
    networks: NETWORKS.map((n) => `${project}_${n}`),
    volumes: VOLUMES.map((v) => `${project}_${v}`)
  }
  if (darwin) resources.containers.push(`${project}-dns-host-1`)
  return { id, project, platform, ports, prefix, files, webInner, hostOrigin, webFromHost, paths, resources }
}

export function renderOverride(plan) {
  const { project, ports, prefix, paths } = plan
  return `# Generated by tests/qa/lib/stand.mjs for ${project}. Do not edit; do not commit.
services:
  tracy-web:
    env_file: !override ["${paths.env}"]
    ports: !override ["127.0.0.1:${ports.web}:${plan.webInner}"]
  tracy-host:
    env_file: !override ["${paths.env}"]
  docker-proxy:
    container_name: ${project}-docker-proxy
  tracy-dsh:
    container_name: ${project}-dsh
    ports: !override ["127.0.0.1:${ports.dsh}:8080"]
    environment:
      DSH_TRUSTED_HOSTS: "local-agent.tracy.test,127.0.0.1:${ports.dsh},127.0.0.1:${ports.web},host.docker.internal:${ports.dsh}"
networks:
  tracy:
    ipam:
      config: !override [{ subnet: "${prefix}.0/24" }]
`
}

export function renderEnv(plan, secrets) {
  const { ports, prefix, paths, hostOrigin } = plan
  const root = paths.root
  const entries = {
    TRACY_ORIGIN: `http://tracy.test:${ports.web}`,
    // Required: the image carries the docs site, served only at the root of its own host.
    DOCS_ORIGIN: `http://docs.tracy.test:${ports.web}`,
    SITE_DOMAIN: 'tracy.test',
    SITE_DOMAIN_ALIASES: 'localhost',
    SESSION_DOMAIN: 'tracy.test',
    SESSION_SECRET: secrets.session,
    MCP_TRACY_ACTOR_SECRET: secrets.actor,
    API_KEY_PEPPER: secrets.pepper,
    HOST_local_SECRET: secrets.host,
    SEAT_local_SECRET: secrets.seat,
    HOST_NAME: 'local',
    HOSTS: 'local',
    HOST_local_ORIGIN: hostOrigin,
    HOST_local_DSH_ORIGIN: 'http://tracy-dsh:8080',
    TRACY_SITES_ROOT: path.join(root, 'sites'),
    TRACY_PRIVATE_ROOT: path.join(root, 'private'),
    TRACY_DSH_HOME: path.join(root, 'dsh-home'),
    POSTGRES_PASSWORD: secrets.pg,
    DATABASE_URL: `postgres://tracy:${secrets.pg}@postgres:5432/tracy`,
    POSTGRES_PORT: ports.postgres,
    WEB_PORT: ports.web,
    TRACY_HOST_PORT: ports.host,
    DSH_IMAGE_TAG: 'dev',
    TRACY_NETWORK_PREFIX: prefix,
    TRACY_SITE_DNS: `${prefix}.53`,
    TRACY_EGRESS_FENCE: 'off',
    MINIO_PORT: ports.minio,
    MINIO_PASSWORD: secrets.minio,
    ARTIFACT_S3_ENDPOINT: `http://host.docker.internal:${ports.minio}`,
    ARTIFACT_S3_BUCKET: 'tracy-artifacts',
    ARTIFACT_S3_ACCESS_KEY: 'tracy',
    ARTIFACT_S3_SECRET_KEY: secrets.minio,
    HOST_DNS_PORT: ports.dns,
    MAIL: 'console'
  }
  return `${Object.entries(entries)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')}\n`
}

export function composeCommand(plan) {
  return [
    'docker',
    'compose',
    '-p',
    plan.project,
    ...plan.files.flatMap((f) => ['-f', f]),
    '--env-file',
    plan.paths.env,
    '--profile',
    'local',
    'up',
    '-d',
    '--wait'
  ]
}

// Probes run INSIDE the stand's containers, so they prove the services reach each other.
export function probeSpecs(plan) {
  const fetchScript = (url) =>
    `fetch(${JSON.stringify(url)},{signal:AbortSignal.timeout(8000)}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))`
  const tcpScript = (host, port) =>
    `const s=require('net').connect(${port},${JSON.stringify(host)});s.setTimeout(8000);s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1));s.on('timeout',()=>process.exit(1))`
  const { project, prefix, webInner } = plan
  const exec = (container, script) => ({ container, argv: ['node', '-e', script] })
  return [
    { name: 'web→host', ...exec(`${project}-tracy-web-1`, fetchScript(`${plan.hostOrigin}/health`)) },
    { name: 'host→web', ...exec(`${project}-tracy-host-1`, fetchScript(`${plan.webFromHost}/`)) },
    { name: 'dsh→web', ...exec(`${project}-dsh`, fetchScript(`http://${prefix}.10:${webInner}/`)) },
    { name: 'dsh→docker-proxy', ...exec(`${project}-dsh`, fetchScript('http://docker-proxy:2375/_ping')) },
    { name: 'web→postgres', ...exec(`${project}-tracy-web-1`, tcpScript('postgres', 5432)) },
    {
      name: 'web→minio',
      ...exec(`${project}-tracy-web-1`, fetchScript('http://minio:9000/minio/health/live'))
    }
  ]
}

export async function runProbes(deps, plan) {
  const results = []
  for (const spec of probeSpecs(plan)) {
    const r = await deps.docker.exec(spec.container, spec.argv, { timeoutMs: 15_000 })
    results.push({ name: spec.name, ok: r.ok, detail: r.ok ? '' : r.timedOut ? 'timed out' : r.detail })
  }
  return results
}

// ---------- manifest + lease ----------

export async function readManifest(deps, id) {
  const { manifest: file } = standPaths(deps, id)
  const doc = await readJsonFile(file)
  if (doc === null) return null
  const errors = validate(MANIFEST_SCHEMA, doc)
  if (errors.length > 0) throw new StandError(`stand manifest ${file} is invalid: ${errors[0]}`)
  assertOwnedProject(id, doc.project)
  if (doc.id !== id) throw new StandError(`stand manifest ${file} names id "${doc.id}", expected "${id}"`)
  // The manifest may only list resources the plan for this id and platform would create; a name
  // that merely shares the project prefix is not evidence of ownership.
  const expected = planStand({ ...deps, platform: doc.platform }, id).resources
  for (const kind of ['containers', 'volumes', 'networks']) {
    for (const r of doc.resources[kind]) {
      if (!ownsName(doc.project, r.name))
        throw new StandError(`stand manifest lists foreign ${kind.slice(0, -1)} "${r.name}"; refusing`)
      if (!expected[kind].includes(r.name))
        throw new StandError(
          `stand manifest lists ${kind.slice(0, -1)} "${r.name}", which the stand never plans to create; refusing`
        )
    }
  }
  return doc
}

// Refuses a results root, stands directory or stand directory whose path crosses a symlink,
// before anything is written, locked or removed under it.
async function assertStandRoots(deps, id) {
  const { standsDir, root } = standPaths(deps, id)
  for (const dir of [deps.resultsRoot, standsDir, root]) {
    try {
      await assertNoSymlinkPath(dir)
    } catch (error) {
      throw new StandError(`${error.message}; stand files stay inside the real results root`)
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

// Directory lock with stale-owner reclaim. `waitMs` 0 fails at once when a live owner holds it.
async function withDirLock(lock, { waitMs, busy }, fn) {
  await fs.mkdir(path.dirname(lock), { recursive: true })
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      await fs.mkdir(lock)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let owner = null
      try {
        owner = await readJsonFile(path.join(lock, 'owner.json'))
      } catch {}
      // A lock whose owner process is alive is never reclaimed, however long the holder takes
      // (compose startup alone may run for minutes); only a dead owner's lock is stale.
      if (owner && !pidAlive(owner.pid)) {
        await fs.rm(lock, { recursive: true, force: true })
        continue
      }
      if (
        !owner &&
        (await fs.stat(lock).then(
          (s) => Date.now() - s.mtimeMs > STALE_LOCK_MS,
          () => false
        ))
      ) {
        await fs.rm(lock, { recursive: true, force: true })
        continue
      }
      if (Date.now() >= deadline) throw new StandError(busy, 3)
      await sleep(40)
    }
  }
  const token = randomBytes(8).toString('hex')
  try {
    await writeJson(path.join(lock, 'owner.json'), { pid: process.pid, at: new Date().toISOString(), token })
    return await fn()
  } finally {
    // Release only a lock that is still ours: a stale-reclaim by another process must not be undone.
    const owner = await readJsonFile(path.join(lock, 'owner.json')).catch(() => null)
    if (owner?.token === token) await fs.rm(lock, { recursive: true, force: true })
  }
}

// Short global lease: serialises acquisition (stand count, port reservation, manifest write).
const withLease = (deps, fn) =>
  withDirLock(
    standPaths(deps, 'x').lock,
    { waitMs: 10_000, busy: 'could not take the stand lease (another qa stand command holds it)' },
    fn
  )

// Per-stand lock, held for the whole of up / reuse / down so no command can tear down or adopt
// a stand another command is still starting.
const withStandLock = (deps, id, fn) =>
  withDirLock(
    path.join(standPaths(deps, id).standsDir, `${id}.lock`),
    {
      waitMs: 0,
      busy: `stand ${id} is being operated on by another qa stand command; try again when it ends`
    },
    fn
  )

async function activeStands(deps, reserved = null) {
  const { standsDir } = standPaths(deps, 'x')
  const info = await lstatOrNull(standsDir)
  if (!info?.isDirectory()) return []
  const out = []
  for (const entry of await fs.readdir(standsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const id = entry.name.slice(0, -5)
    if (!STAND_ID.test(id)) continue
    try {
      const doc = await readJsonFile(path.join(standsDir, entry.name))
      if (doc && doc.status !== 'down') {
        out.push(id)
        if (reserved)
          reserved.set(id, { ports: Object.values(doc.ports ?? {}), prefix: doc.subnet_prefix ?? null })
      }
    } catch {
      out.push(id)
    }
  }
  return out
}

// `deps.fault` is a selftest seam: it may throw at a named boundary to prove recovery order.
async function saveManifest(deps, doc) {
  await deps.fault?.(`manifest:${doc.status}`)
  await writeJson(standPaths(deps, doc.id).manifest, doc)
}

function newManifest(plan, git, fingerprints) {
  return {
    schema_version: '1',
    id: plan.id,
    project: plan.project,
    status: 'reserved',
    created_at: new Date().toISOString(),
    pid: process.pid,
    platform: plan.platform,
    ports: plan.ports,
    subnet_prefix: plan.prefix,
    compose_files: plan.files,
    dirs: [plan.paths.root],
    git: { sha: git.sha, dirty: git.dirty },
    fingerprints,
    resources: {
      containers: plan.resources.containers.map((name) => ({ name, id: null })),
      networks: plan.resources.networks.map((name) => ({ name, id: null })),
      volumes: plan.resources.volumes.map((name) => ({ name, id: null }))
    }
  }
}

const KINDS = [
  ['containers', 'container'],
  ['networks', 'network'],
  ['volumes', 'volume']
]

// Fill ids of resources that now exist and record any further resource carrying our project
// label. A recorded id that no longer matches means the resource was replaced: report, never adopt.
async function reconcileManifest(deps, doc) {
  const conflicts = []
  for (const [plural, kind] of KINDS) {
    const listed = await deps.docker.list(kind, doc.project)
    for (const name of listed) {
      if (!ownsName(doc.project, name)) {
        conflicts.push(
          `${kind} ${name} carries label project=${doc.project} but does not follow the stand's naming; not adopted, not deleted`
        )
        continue
      }
      const entry = doc.resources[plural].find((r) => r.name === name)
      if (!entry) {
        // Only the planned resource set is ever recorded; anything else is reported, never adopted.
        conflicts.push(
          `${kind} ${name} is not a resource this stand plans to create; not adopted, not deleted`
        )
        continue
      }
      const found = await deps.docker.inspect(kind, name)
      if (!found || found.project !== doc.project) continue
      if (entry.id === null) entry.id = found.id
      else if (entry.id !== found.id) conflicts.push(`${kind} ${name}: recorded id differs from the live one`)
    }
  }
  return conflicts
}

async function fingerprints(deps, plan, imageIds = {}, texts = null) {
  const hashFile = async (f) => sha256((await readRegularFile(f)) ?? '')
  const compose = []
  for (const f of plan.files)
    compose.push(texts && f === plan.paths.override ? sha256(texts.override) : await hashFile(f))
  return {
    config: sha256(compose.join('\n')),
    fixture: texts ? sha256(texts.env) : await hashFile(plan.paths.env),
    image: imageIds
  }
}

async function imageIdsOf(deps, plan) {
  const out = {}
  for (const name of [`${plan.project}-tracy-web-1`, `${plan.project}-tracy-host-1`, `${plan.project}-dsh`]) {
    const found = await deps.docker.inspect('container', name)
    if (found?.image) out[name] = found.image
  }
  return out
}

const fmtProbes = (results) =>
  results.map((r) => `  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)

// ---------- actions ----------

async function writeFixtureFiles(deps, plan, secrets) {
  await deps.fault?.('fixture:dirs')
  for (const dir of [
    plan.paths.root,
    path.join(plan.paths.root, 'sites'),
    path.join(plan.paths.root, 'private'),
    path.join(plan.paths.root, 'dsh-home')
  ]) {
    await fs.mkdir(dir, { recursive: true })
  }
  await deps.fault?.('fixture:override')
  await atomicWrite(plan.paths.override, renderOverride(plan))
  await deps.fault?.('fixture:env')
  await atomicWrite(plan.paths.env, renderEnv(plan, secrets))
  await fs.chmod(plan.paths.env, 0o600)
}

const portBusy = (port) =>
  new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(true))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(false)))
  })

async function standUpLocked(deps, { id, dryRun }) {
  const plan = planStand(deps, id)
  const lines = []
  if (dryRun) {
    lines.push(
      `DRY RUN stand up ${id} — nothing is written and Docker is not touched`,
      `project: ${plan.project}`,
      `ports: ${JSON.stringify(plan.ports)}  subnet: ${plan.prefix}.0/24`
    )
    lines.push(
      `would write: ${path.relative(deps.repoRoot, plan.paths.override)}, ${path.relative(deps.repoRoot, plan.paths.env)}, ${path.relative(deps.repoRoot, plan.paths.manifest)}`
    )
    lines.push(`would run: ${composeCommand(plan).join(' ')}`, 'would probe (docker exec inside the stand):')
    for (const spec of probeSpecs(plan)) lines.push(`  ${spec.name} via ${spec.container}`)
    lines.push(
      `down would remove only: ${[...plan.resources.containers, ...plan.resources.networks, ...plan.resources.volumes].join(', ')}`
    )
    return { exitCode: 0, lines }
  }
  const secrets = Object.fromEntries(
    ['session', 'actor', 'pepper', 'host', 'seat', 'pg', 'minio'].map((k) => [
      k,
      randomBytes(24).toString('hex')
    ])
  )
  const git = await deps.gitInfo()
  const acquired = await withLease(deps, async () => {
    const existing = await readManifest(deps, id)
    if (existing && existing.status !== 'down') {
      const hint =
        existing.status === 'up'
          ? `use "stand reuse --id ${id}" or "stand down --id ${id} -v"`
          : `run "stand down --id ${id} -v" first: a ${existing.status} stand keeps its volumes and fixture secrets, and a fresh up must not pair them with new ones`
      return {
        early: { exitCode: 2, lines: [`stand ${id} already exists (status ${existing.status}); ${hint}`] }
      }
    }
    // Resources or a fixture directory with no manifest (or after a clean down) are not ours to adopt.
    const stale = []
    for (const [, kind] of KINDS) {
      const names = new Set([
        ...(await deps.docker.list(kind, plan.project)),
        ...(await deps.docker.listByPrefix(kind, plan.project))
      ])
      for (const name of names) stale.push(`${kind} ${name}`)
    }
    if (await lstatOrNull(plan.paths.root))
      stale.push(`directory ${path.relative(deps.repoRoot, plan.paths.root)}`)
    if (stale.length > 0)
      return {
        early: {
          exitCode: 3,
          lines: [
            `ENV: ${plan.project} already has resources that no manifest records; refusing to adopt them (clear them deliberately, then retry):`,
            ...stale.map((x) => `  - ${x}`)
          ]
        }
      }
    const reserved = new Map()
    const others = (await activeStands(deps, reserved)).filter((x) => x !== id)
    if (others.length >= MAX_STANDS)
      throw new StandError(
        `at most ${MAX_STANDS} stands may exist at once (active: ${others.join(', ')}); take one down first`,
        3
      )
    // Ports and the subnet are reserved by the manifests of every active stand, checked under the lease.
    const mine = new Set(Object.values(plan.ports))
    for (const other of others) {
      const theirs = reserved.get(other)
      const clash = (theirs?.ports ?? []).filter((p) => mine.has(p))
      if (clash.length > 0)
        return {
          early: {
            exitCode: 3,
            lines: [`ENV: port(s) ${clash.join(', ')} are reserved by stand ${other}; nothing was started`]
          }
        }
      if (theirs?.prefix === plan.prefix)
        return {
          early: {
            exitCode: 3,
            lines: [`ENV: subnet ${plan.prefix}.0/24 is reserved by stand ${other}; nothing was started`]
          }
        }
    }
    const busy = []
    for (const port of mine) if (await (deps.portBusy ?? portBusy)(port)) busy.push(port)
    if (busy.length > 0)
      return {
        early: {
          exitCode: 3,
          lines: [`ENV: port(s) ${busy.join(', ')} already in use on 127.0.0.1; nothing was started`]
        }
      }
    // The ledger goes to disk BEFORE the fixture files: an interrupt in between leaves a manifest
    // that `down` can adopt, never an orphan directory no manifest records.
    const manifest = newManifest(
      plan,
      git,
      await fingerprints(
        deps,
        plan,
        {},
        {
          env: renderEnv(plan, secrets),
          override: renderOverride(plan)
        }
      )
    )
    await saveManifest(deps, manifest)
    await writeFixtureFiles(deps, plan, secrets)
    return { doc: manifest }
  })
  if (acquired.early) return acquired.early
  const doc = acquired.doc
  doc.status = 'starting'
  await saveManifest(deps, doc)
  lines.push(`stand ${id}: starting project ${plan.project}`)
  const up = await deps.docker.composeUp({
    project: plan.project,
    files: plan.files,
    envFile: plan.paths.env,
    timeoutMs: COMPOSE_TIMEOUT_MS
  })
  const conflicts = await reconcileManifest(deps, doc).catch((error) => [
    `reconcile failed: ${error.message}`
  ])
  if (!up.ok) {
    doc.status = 'failed'
    doc.failure = up.detail
    await saveManifest(deps, doc)
    lines.push(
      `ENV: docker compose up failed (images missing or Docker error); resources recorded, clean up with "stand down --id ${id} -v"`,
      up.detail
    )
    return { exitCode: 3, lines }
  }
  if (conflicts.length > 0) {
    doc.status = 'failed'
    await saveManifest(deps, doc)
    return { exitCode: 2, lines: [...lines, ...conflicts.map((c) => `CONFLICT: ${c}`)] }
  }
  const probes = await runProbes(deps, plan)
  lines.push('cross-service probes:', ...fmtProbes(probes))
  doc.fingerprints.image = await imageIdsOf(deps, plan)
  doc.probes = probes
  if (probes.some((p) => !p.ok)) {
    doc.status = 'failed'
    await saveManifest(deps, doc)
    lines.push('FAIL: services are up but cannot all reach each other')
    return { exitCode: 1, lines }
  }
  doc.status = 'up'
  await saveManifest(deps, doc)
  lines.push(`stand ${id} is up: web http://127.0.0.1:${plan.ports.web}`)
  return { exitCode: 0, lines }
}

async function standReuseLocked(deps, { id, dryRun }) {
  const plan = planStand(deps, id)
  if (dryRun) {
    return {
      exitCode: 0,
      lines: [
        `DRY RUN stand reuse ${id}`,
        'would check: manifest, git sha, compose config hash, fixture hash, image ids, resource labels, then probes:',
        ...probeSpecs(plan).map((s) => `  ${s.name}`)
      ]
    }
  }
  const doc = await readManifest(deps, id)
  if (!doc) throw new StandError(`no stand manifest for ${id}`)
  if (doc.status !== 'up') throw new StandError(`stand ${id} is "${doc.status}", not up; refusing to reuse`)
  const problems = []
  const git = await deps.gitInfo()
  if (doc.git.sha !== git.sha)
    problems.push(`git sha differs (stand ${doc.git.sha.slice(0, 12)}, tree ${git.sha.slice(0, 12)})`)
  const now = await fingerprints(deps, plan)
  if (now.config !== doc.fingerprints.config) problems.push('compose config fingerprint differs')
  if (now.fixture !== doc.fingerprints.fixture) problems.push('fixture fingerprint differs')
  const images = await imageIdsOf(deps, plan)
  for (const [name, image] of Object.entries(doc.fingerprints.image))
    if (images[name] !== image) problems.push(`image of ${name} differs`)
  for (const [plural, kind] of KINDS) {
    const live = await deps.docker.list(kind, doc.project)
    for (const r of doc.resources[plural]) {
      if (kind === 'volume' && r.id === null) continue
      const found = await deps.docker.inspect(kind, r.name)
      if (kind === 'container' && !found) problems.push(`container ${r.name} is missing`)
      else if (found && (found.project !== doc.project || (r.id !== null && found.id !== r.id)))
        problems.push(`${kind} ${r.name} carries a different label or id than recorded`)
    }
    for (const name of live)
      if (!doc.resources[plural].some((r) => r.name === name))
        problems.push(`unrecorded ${kind} ${name} carries the project label`)
  }
  if (problems.length > 0)
    return { exitCode: 2, lines: [`refusing to reuse stand ${id}:`, ...problems.map((p) => `  - ${p}`)] }
  const probes = await runProbes(deps, plan)
  if (probes.some((p) => !p.ok))
    return { exitCode: 1, lines: ['cross-service probes failed; not reusing:', ...fmtProbes(probes)] }
  doc.last_reused_at = new Date().toISOString()
  await saveManifest(deps, doc)
  return { exitCode: 0, lines: [`stand ${id} accepted for reuse`, ...fmtProbes(probes)] }
}

async function removeStandDir(deps, id) {
  const { root, standsDir } = standPaths(deps, id)
  const info = await lstatOrNull(root)
  if (!info) return
  if (!info.isDirectory()) throw new UnsafePathError(`${root} is not a plain directory; not removing`)
  const real = await fs.realpath(root)
  const realStands = await fs.realpath(standsDir)
  const approved = path.join(await fs.realpath(deps.resultsRoot), 'stands')
  if (realStands !== approved || path.dirname(real) !== approved)
    throw new UnsafePathError(`${root} resolves outside the approved stands directory; not removing`)
  await fs.rm(root, { recursive: true, force: true })
}

async function standDownLocked(deps, { id, volumes, dryRun }) {
  const project = projectFor(id)
  const doc = await readManifest(deps, id)
  if (!doc) throw new StandError(`no stand manifest for ${id}; nothing recorded, so nothing will be deleted`)
  assertOwnedProject(id, doc.project)
  const lines = []
  if (dryRun) {
    lines.push(
      `DRY RUN stand down ${id}${volumes ? ' -v' : ''} — would remove only recorded resources that still carry label project=${project}:`
    )
    for (const [plural] of KINDS) {
      if (plural === 'volumes' && !volumes) continue
      for (const r of doc.resources[plural]) lines.push(`  ${plural.slice(0, -1)} ${r.name}`)
    }
    return { exitCode: 0, lines }
  }
  const refused = []
  const removed = []
  // 1. adopt ids of recorded resources that exist but were never reconciled (crash after start)
  for (const [plural, kind] of KINDS) {
    for (const r of doc.resources[plural]) {
      if (r.id !== null) continue
      const found = await deps.docker.inspect(kind, r.name)
      if (found && found.project === project) r.id = found.id
    }
  }
  for (const [plural, kind] of KINDS) {
    if (plural === 'volumes' && !volumes) continue
    for (const r of doc.resources[plural]) {
      const found = await deps.docker.inspect(kind, r.name)
      if (!found) continue
      if (found.project !== project) {
        refused.push(
          `${kind} ${r.name}: label project=${found.project ?? 'none'}, not ${project}; foreign, not deleted`
        )
        continue
      }
      if (r.id === null || found.id !== r.id) {
        refused.push(`${kind} ${r.name}: identity differs from the manifest (replaced); not deleted`)
        continue
      }
      // Re-check identity immediately before deleting, closing the inspect→delete window.
      const again = await deps.docker.inspect(kind, r.name)
      if (!again || again.id !== r.id || again.project !== project) {
        refused.push(`${kind} ${r.name}: changed between inspect and delete; not deleted`)
        continue
      }
      const res = await deps.docker.remove(kind, kind === 'volume' ? r.name : r.id)
      if (res.ok) removed.push(`${kind} ${r.name}`)
      else refused.push(`${kind} ${r.name}: docker refused removal (${res.detail})`)
    }
  }
  lines.push(`removed ${removed.length} recorded resource(s)`, ...removed.map((x) => `  - ${x}`))
  // 2. list whatever of this project is still there
  const leftover = []
  for (const [plural, kind] of KINDS) {
    const byLabel = await deps.docker.list(kind, project)
    const byName = await deps.docker.listByPrefix(kind, project)
    for (const name of new Set([...byLabel, ...byName])) {
      const labelled = byLabel.includes(name)
      if (!ownsName(project, name) && !labelled) continue
      const recorded = doc.resources[plural].some((r) => r.name === name)
      if (plural === 'volumes' && !volumes && recorded) continue
      leftover.push(`${kind} ${name}${recorded ? '' : ' (UNRECORDED — not deleted)'}`)
    }
  }
  // The fixture directory is the recovery material for a failed teardown: remove it only once
  // every recorded resource is confirmed gone, and only after the ledger durably says so. If the
  // ledger cannot be written the fixture stays; if the final `down` write fails afterwards, the
  // `tearing-down` record lets a retry finish without any recovery material being needed.
  if (volumes && refused.length === 0 && leftover.length === 0) {
    try {
      doc.status = 'tearing-down'
      await saveManifest(deps, doc)
      await removeStandDir(deps, id)
    } catch (error) {
      refused.push(error.message)
    }
  }
  lines.push(...refused.map((r) => `refused: ${r}`))
  if (leftover.length > 0) {
    doc.status = 'leftover'
    await saveManifest(deps, doc).catch(() => {})
    lines.push(`LEFTOVER ${leftover.length} resource(s) of ${project}:`, ...leftover.map((x) => `  - ${x}`))
    return { exitCode: 3, lines }
  }
  if (refused.length > 0) {
    doc.status = 'leftover'
    await saveManifest(deps, doc).catch(() => {})
    return { exitCode: 3, lines }
  }
  doc.status = volumes ? 'down' : 'stopped'
  doc.down_at = new Date().toISOString()
  await saveManifest(deps, doc)
  lines.push(
    `no ${project} container, volume or network is left${volumes ? '' : ' (volumes kept: pass -v to remove them)'}`
  )
  return { exitCode: 0, lines }
}

export async function standUp(deps, args) {
  if (args.dryRun) return standUpLocked(deps, args)
  // Proven before anything is written, so an unavailable Docker leaves no files behind.
  const avail = await deps.docker.available()
  if (!avail.ok)
    return {
      exitCode: 3,
      lines: [`ENV: Docker is not available (${avail.detail ?? 'no detail'}); no stand was created`]
    }
  await assertStandRoots(deps, args.id)
  return withStandLock(deps, args.id, () => standUpLocked(deps, args))
}
export async function standReuse(deps, args) {
  if (args.dryRun) return standReuseLocked(deps, args)
  await assertStandRoots(deps, args.id)
  return withStandLock(deps, args.id, () => standReuseLocked(deps, args))
}
export async function standDown(deps, args) {
  if (args.dryRun) return standDownLocked(deps, args)
  await assertStandRoots(deps, args.id)
  return withStandLock(deps, args.id, () => standDownLocked(deps, args))
}
