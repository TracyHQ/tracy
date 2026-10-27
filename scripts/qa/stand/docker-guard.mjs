/**
 * The policy behind `scripts/qa/bin/docker` (tasks/todo-daily-qa.md §4.5).
 *
 *   decide(argv, ctx) -> { allow: boolean, reason: string }
 *   ctx = {
 *     siteProjects: Set<string>,          // QA sites: ledger + stand DB + the fixed three
 *     defaultWebImages: Set<string>,      // `<platform>=` lines of IMAGE_TAGS of the tree under test
 *     imageExists(ref) -> boolean,        // read-only lookups through the real docker
 *     labelsOf(kind, name) -> object|null // kind: 'container' | 'network' | 'volume'
 *   }
 *   loadContext({ qaHome, srcDir, realDocker }) -> ctx
 *   main(argv, { env }) -> exit code      // used by bin/docker: decide, log, exec the real docker
 *
 * Allowed: compose of project `tracy-qa` or of a QA site project (explicit `-p` required for
 * anything that writes); `build` tagging only tracy/{web,host,dsh}:qa*, or a default web image
 * that is still missing; `network`/`volume` create and `run`/`create` carrying a `qa.run` label;
 * acting on containers / networks / volumes that carry `qa.run` or belong to an allowed project;
 * `tag`/`rmi` of tracy/{web,host,dsh}:qa*; read commands. Everything else is refused and logged.
 * What tracy-host does through the socket (provision, EmDash image builds) never passes here.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { QA, qaHome as defaultQaHome } from './qa-stand.mjs'

const QA_IMAGE = /^tracy\/(web|host|dsh):qa[A-Za-z0-9._-]*$/
const LABEL_KEY = 'qa.run'
const PROJECT_LABEL = 'com.docker.compose.project'

// Global options of the docker CLI that take a value.
const GLOBAL_WITH_VALUE = new Set(['--config', '-l', '--log-level', '--tlscacert', '--tlscert', '--tlskey'])
const GLOBAL_FLAGS = new Set(['-D', '--debug', '--tls', '--tlsverify'])

const READ_TOP = new Set([
  'ps',
  'inspect',
  'images',
  'version',
  'info',
  'logs',
  'port',
  'top',
  'stats',
  'events',
  'history',
  'diff'
])
const READ_SUB = {
  container: new Set(['ls', 'list', 'ps', 'inspect', 'logs', 'port', 'top', 'stats', 'diff']),
  image: new Set(['ls', 'list', 'inspect', 'history']),
  network: new Set(['ls', 'list', 'inspect']),
  volume: new Set(['ls', 'list', 'inspect']),
  system: new Set(['df', 'info', 'events']),
  context: new Set(['ls', 'list', 'inspect', 'show']),
  buildx: new Set(['ls', 'version', 'inspect'])
}
const COMPOSE_READ = new Set(['config', 'ps', 'ls', 'images', 'logs', 'top', 'version', 'port'])
const CONTAINER_ACTIONS = new Set([
  'rm',
  'stop',
  'start',
  'restart',
  'kill',
  'exec',
  'cp',
  'wait',
  'pause',
  'unpause'
])

const deny = (reason) => ({ allow: false, reason })
const allow = (reason) => ({ allow: true, reason })

function splitGlobal(argv) {
  let i = 0
  while (i < argv.length && argv[i].startsWith('-')) {
    const a = argv[i]
    if (a === '-H' || a.startsWith('--host') || a === '-c' || a.startsWith('--context'))
      return { error: `global option ${a} points the CLI at another daemon` }
    if (GLOBAL_WITH_VALUE.has(a)) i += 2
    else if (GLOBAL_FLAGS.has(a) || a.includes('=')) i += 1
    else return { error: `unknown global option ${a}` }
  }
  return { rest: argv.slice(i) }
}

// Flags whose next word is a value, per command family, so positional arguments can be found.
// `-t` and `-d` take a value for `build` / `network create` and are booleans for `run` / `exec`.
const COMMON_VALUE = ['--label', '-l', '--format', '--filter', '--platform']
const VALUE_FLAGS = {
  build: new Set([
    ...COMMON_VALUE,
    '-t',
    '--tag',
    '-f',
    '--file',
    '--build-arg',
    '--build-context',
    '--target',
    '--network',
    '--progress',
    '--cache-from',
    '--cache-to',
    '--secret',
    '--ssh',
    '--output',
    '-o',
    '--iidfile',
    '--metadata-file',
    '--pull',
    '--add-host'
  ]),
  run: new Set([
    ...COMMON_VALUE,
    '--network',
    '-v',
    '--volume',
    '-e',
    '--env',
    '--env-file',
    '--name',
    '-p',
    '--publish',
    '--entrypoint',
    '-w',
    '--workdir',
    '-u',
    '--user',
    '--cap-add',
    '--cap-drop',
    '--mount',
    '--memory',
    '-m',
    '--cpus',
    '--add-host',
    '--dns',
    '--security-opt',
    '--tmpfs',
    '--log-driver',
    '--log-opt',
    '--restart',
    '--pid',
    '--ipc',
    '--hostname',
    '-h',
    '--detach-keys',
    '--pull',
    '--stop-timeout',
    '--ulimit',
    '--device',
    '--group-add',
    '--network-alias',
    '--ip'
  ]),
  exec: new Set(['-e', '--env', '--env-file', '-u', '--user', '-w', '--workdir', '--detach-keys']),
  object: new Set([
    ...COMMON_VALUE,
    '-d',
    '--driver',
    '--subnet',
    '--gateway',
    '--ip-range',
    '-o',
    '--opt',
    '--name',
    '--alias',
    '--ip'
  ]),
  container: new Set(['-t', '--time', '-s', '--signal'])
}

function parseFlags(args, valueFlags) {
  const flags = []
  const positional = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') {
      positional.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--') && a.includes('=')) {
      const j = a.indexOf('=')
      flags.push([a.slice(0, j), a.slice(j + 1)])
    } else if (a.startsWith('-') && a !== '-') {
      if (valueFlags.has(a)) flags.push([a, args[++i]])
      else flags.push([a, true])
    } else positional.push(a)
  }
  return { flags, positional }
}

const valuesOf = (flags, ...names) => flags.filter(([k]) => names.includes(k)).map(([, v]) => v)
const hasQaLabel = (flags) =>
  valuesOf(flags, '--label', '-l').some((v) => typeof v === 'string' && /^qa\.run=.+/.test(v))

function projectAllowed(project, ctx) {
  return project === QA.project || ctx.siteProjects.has(project)
}

function ownedBy(labels, ctx) {
  if (!labels) return false
  if (labels[LABEL_KEY]) return true
  return projectAllowed(labels[PROJECT_LABEL], ctx)
}

function decideCompose(args, ctx) {
  // compose-level options before the subcommand
  const COMPOSE_VALUE = new Set([
    '-p',
    '--project-name',
    '-f',
    '--file',
    '--env-file',
    '--project-directory',
    '--profile',
    '--ansi',
    '--progress',
    '--parallel'
  ])
  let i = 0
  let project = null
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i]
    if (a.includes('=')) {
      const [k, v] = [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]
      if (k === '-p' || k === '--project-name') project = v
      i += 1
    } else if (COMPOSE_VALUE.has(a)) {
      if (a === '-p' || a === '--project-name') project = args[i + 1]
      i += 2
    } else i += 1
  }
  const sub = args[i]
  if (!sub) return deny('compose without a subcommand')
  if (COMPOSE_READ.has(sub)) return allow(`compose ${sub} (read)`)
  if (!project) return deny(`compose ${sub} without an explicit -p: the project would come from a file`)
  if (!projectAllowed(project, ctx))
    return deny(`compose ${sub} on project ${project}, which is not the QA stand nor a QA site`)
  return allow(`compose ${sub} on ${project}`)
}

function decideBuild(args, ctx) {
  const { flags } = parseFlags(args, VALUE_FLAGS.build)
  const tags = valuesOf(flags, '-t', '--tag')
  if (tags.length === 0) return deny('build without -t: an untagged image')
  for (const t of tags) {
    if (QA_IMAGE.test(t)) continue
    if (ctx.defaultWebImages.has(t) && !ctx.imageExists(t)) continue
    if (ctx.defaultWebImages.has(t)) return deny(`build -t ${t}: a shared web image that already exists`)
    return deny(`build -t ${t}: not a QA image`)
  }
  return allow(`build ${tags.join(' ')}`)
}

function decideObject(kind, verb, args, ctx) {
  const { flags, positional } = parseFlags(args, VALUE_FLAGS.object)
  if (verb === 'create')
    return hasQaLabel(flags)
      ? allow(`${kind} create with ${LABEL_KEY}`)
      : deny(`${kind} create without a ${LABEL_KEY} label`)
  if (['rm', 'remove', 'connect', 'disconnect'].includes(verb)) {
    const names =
      kind === 'network' && verb !== 'rm' && verb !== 'remove' ? positional.slice(0, 1) : positional
    if (names.length === 0) return deny(`${kind} ${verb} without a name`)
    for (const n of names) {
      // A site network is created by provision.sh without labels; its name is `<label>_default`.
      const siteNet =
        kind === 'network' && n.endsWith('_default') && ctx.siteProjects.has(n.slice(0, -'_default'.length))
      if (!siteNet && !ownedBy(ctx.labelsOf(kind, n), ctx))
        return deny(`${kind} ${verb} ${n}: not labelled ${LABEL_KEY} nor owned by a QA project`)
    }
    return allow(`${kind} ${verb} ${names.join(' ')}`)
  }
  return deny(`${kind} ${verb} is not on the QA list`)
}

function decideContainerAction(verb, args, ctx) {
  const { positional } = parseFlags(args, verb === 'exec' ? VALUE_FLAGS.exec : VALUE_FLAGS.container)
  let targets = positional
  if (verb === 'exec') targets = positional.slice(0, 1)
  if (verb === 'cp')
    targets = positional.filter((p) => p.includes(':')).map((p) => p.slice(0, p.indexOf(':')))
  if (targets.length === 0) return deny(`${verb} without a container`)
  for (const t of targets) {
    if (!ownedBy(ctx.labelsOf('container', t), ctx))
      return deny(`${verb} ${t}: a container outside the QA stand and its sites`)
  }
  return allow(`${verb} ${targets.join(' ')}`)
}

export function decide(argv, ctx) {
  const g = splitGlobal(argv)
  if (g.error) return deny(g.error)
  const [cmd, ...args] = g.rest
  if (!cmd) return allow('no command (help)')
  if (cmd === '--version' || cmd === '-v' || cmd === 'help') return allow('help')
  if (READ_TOP.has(cmd)) return allow(`${cmd} (read)`)
  if (cmd === 'compose') return decideCompose(args, ctx)
  if (cmd === 'build') return decideBuild(args, ctx)
  if (cmd === 'buildx' && args[0] === 'build') return decideBuild(args.slice(1), ctx)
  if (cmd === 'image' && args[0] === 'build') return decideBuild(args.slice(1), ctx)
  if (cmd === 'run' || cmd === 'create') {
    const { flags } = parseFlags(args, VALUE_FLAGS.run)
    return hasQaLabel(flags) ? allow(`${cmd} with ${LABEL_KEY}`) : deny(`${cmd} without a ${LABEL_KEY} label`)
  }
  if (cmd === 'tag') {
    const { positional } = parseFlags(args, new Set())
    return positional.length === 2 && QA_IMAGE.test(positional[1])
      ? allow(`tag → ${positional[1]}`)
      : deny(`tag to ${positional[1] ?? '?'}: not a QA image`)
  }
  if (cmd === 'rmi' || (cmd === 'image' && ['rm', 'remove'].includes(args[0]))) {
    const { positional } = parseFlags(cmd === 'rmi' ? args : args.slice(1), new Set())
    const bad = positional.find((p) => !QA_IMAGE.test(p))
    return bad || positional.length === 0
      ? deny(`rmi ${bad ?? ''}: not a QA image`)
      : allow(`rmi ${positional.join(' ')}`)
  }
  if (CONTAINER_ACTIONS.has(cmd)) return decideContainerAction(cmd, args, ctx)
  if (cmd === 'container' && CONTAINER_ACTIONS.has(args[0]))
    return decideContainerAction(args[0], args.slice(1), ctx)
  if (cmd === 'container' && args[0] === 'run') return decide(['run', ...args.slice(1)], ctx)
  if (cmd === 'network' || cmd === 'volume') {
    if (READ_SUB[cmd].has(args[0])) return allow(`${cmd} ${args[0]} (read)`)
    return decideObject(cmd, args[0], args.slice(1), ctx)
  }
  if (READ_SUB[cmd]?.has(args[0])) return allow(`${cmd} ${args[0]} (read)`)
  return deny(`${cmd}${args[0] ? ` ${args[0]}` : ''} is not on the QA list`)
}

// ---- runtime -------------------------------------------------------------------------------

export function findRealDocker(env, selfDir) {
  if (env.QA_REAL_DOCKER) return env.QA_REAL_DOCKER
  for (const dir of (env.PATH ?? '').split(':')) {
    if (!dir || path.resolve(dir) === selfDir) continue
    const p = path.join(dir, 'docker')
    try {
      if (statSync(p).isFile()) return p
    } catch {}
  }
  return null
}

function readSiteProjects(home) {
  const set = new Set(QA.fixedSites)
  const ledger = path.join(home, 'state', 'sites.jsonl')
  if (existsSync(ledger)) {
    for (const line of readFileSync(ledger, 'utf8').split('\n')) {
      try {
        const row = JSON.parse(line)
        if (typeof row.label === 'string') set.add(row.label)
        // The ledger's `label` is what the lane typed; the server prefixes it (`qa-`), and the
        // compose project is named after the site key's first label.
        if (typeof row.siteKey === 'string') set.add(row.siteKey.split('.')[0])
      } catch {}
    }
  }
  // Written by the orchestrator from the QA stand's `site` table (a JSON array of labels).
  const fromDb = path.join(home, 'state', 'stand-sites.json')
  if (existsSync(fromDb)) {
    try {
      for (const l of JSON.parse(readFileSync(fromDb, 'utf8'))) if (typeof l === 'string') set.add(l)
    } catch {}
  }
  set.delete('tracy')
  set.delete('')
  return set
}

function readDefaultWebImages(srcDir) {
  const file = path.join(srcDir, 'packages', 'fleet', 'tracy-fleet-operation', 'web', 'IMAGE_TAGS')
  const set = new Set()
  if (!existsSync(file)) return set
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const l = line.trim()
    if (!l || l.startsWith('#')) continue
    const key = l.slice(0, l.indexOf('='))
    if (!key.includes(':')) set.add(l.slice(l.indexOf('=') + 1))
  }
  return set
}

export function loadContext({ qaHome, srcDir, realDocker }) {
  const read = (args) => spawnSync(realDocker, args, { encoding: 'utf8' })
  return {
    siteProjects: readSiteProjects(qaHome),
    defaultWebImages: readDefaultWebImages(srcDir),
    imageExists: (ref) => read(['image', 'inspect', '--format', '{{.Id}}', ref]).status === 0,
    labelsOf: (kind, name) => {
      // A container keeps its labels under .Config; networks and volumes keep them at the top.
      const field = kind === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}'
      const r = read([kind, 'inspect', '--format', field, name])
      if (r.status !== 0) return null
      try {
        return JSON.parse(r.stdout.trim()) ?? {}
      } catch {
        return null
      }
    }
  }
}

export function main(argv, { env = process.env, selfDir } = {}) {
  const home = defaultQaHome(env)
  const srcDir = env.QA_SRC_DIR || path.join(path.dirname(path.dirname(home)), 'TCH-worktrees', 'qa-src')
  const realDocker = findRealDocker(env, selfDir)
  const logDir = path.join(home, 'logs')
  const logLine = (row) => {
    try {
      mkdirSync(logDir, { recursive: true })
      appendFileSync(
        path.join(logDir, 'docker-guard.jsonl'),
        `${JSON.stringify({ at: new Date().toISOString(), runId: env.QA_RUN_ID ?? null, ...row })}\n`
      )
    } catch {}
  }
  if (!realDocker) {
    process.stderr.write('qa docker guard: no real docker on PATH\n')
    logLine({ argv, allow: false, reason: 'no real docker' })
    return 127
  }
  const verdict = decide(argv, loadContext({ qaHome: home, srcDir, realDocker }))
  logLine({ argv, ...verdict })
  if (!verdict.allow) {
    process.stderr.write(`qa docker guard: refused: ${verdict.reason}\n`)
    return 126
  }
  const r = spawnSync(realDocker, argv, { stdio: 'inherit', env })
  return r.status ?? 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2)
  const selfDir = a[0] === '--self-dir' ? path.resolve(a[1]) : null
  const argv = a.slice(a.indexOf('--') + 1)
  process.exit(main(argv, { selfDir }))
}
