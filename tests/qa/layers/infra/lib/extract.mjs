// Denominator extraction for the infra layer. Everything is read from the code: TypeScript's AST
// for JavaScript sources, js-yaml for compose, a small parser for Dockerfiles. Anything that is not
// a plain literal goes to `unresolved` instead of being guessed.
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import * as jsYaml from 'js-yaml'
import ts from 'typescript'
import { assertDenominator, citedFile, DENOMINATOR_SCHEMA_ID, NaTable } from '../../../lib/denominator.mjs'
import { def as migrationSource } from '../../../inventory/extractors/migrations.mjs'
import { DOCKERFILES, contextSources } from './cases-docker.mjs'
import { dockerInputItemId, readDockerfile } from './dockerfile.mjs'
import { REPO, readRegular } from './harness.mjs'
import { LEGACY_SUITES } from './legacy.mjs'

export const COMMON = ['happy', 'empty', 'invalid', 'boundary', 'dependency-failure', 'repeat', 'cleanup']
export const INFRA = [
  'cold-warm',
  'idempotent',
  'restart',
  'stale-lock',
  'disk-permission',
  'partial-failure',
  'retry',
  'rollback',
  'resource-leak',
  'version-mismatch'
]
export const API_HOST = [
  'anonymous',
  'expired-auth',
  'wrong-role',
  'other-tenant',
  'wrong-method',
  'malformed-body',
  'encoding-injection',
  'csrf-origin',
  'pagination',
  'rate-limit',
  'concurrent',
  'partial-write',
  'cancel-timeout',
  'no-secret-leak'
]
/** A COPY input carries the common + infra/script tags like every other infra item (plan §3). */
export const COPY_INPUT_TAGS = [...COMMON, ...INFRA]

const FLEET = 'packages/fleet/tracy-fleet-operation'
const SCRIPTS = `${FLEET}/scripts`

const sha = (text) => createHash('sha256').update(text).digest('hex')
const read = (rel) => readRegular(path.join(REPO, rel))

export class Extraction {
  constructor() {
    this.items = new Map()
    this.sources = new Map()
    this.unresolved = []
    this.reasons = new NaTable()
  }
  source(rel, kind) {
    if (!this.sources.has(rel)) this.sources.set(rel, { path: rel, sha256: sha(read(rel)), kind })
  }
  /** `extra.na` is tag -> sentence naming its source file; every other key of `extra` is a fact of the item (`meta`). */
  add(id, kind, requiredTags, { na = {}, ...meta } = {}) {
    if (this.items.has(id)) return
    // A tag is either owed or N-A, never both (contracts/denominator.schema.json).
    const keys = Object.fromEntries(
      Object.entries(na).map(([tag, text]) => [tag, this.reasons.add(text, citedFile(text), id)])
    )
    this.items.set(id, {
      id,
      kind,
      requiredTags: [...new Set(requiredTags)].filter((tag) => !(tag in keys)),
      na: keys,
      ...(Object.keys(meta).length > 0 ? { meta } : {})
    })
  }
  gap(source, reason) {
    this.unresolved.push({ source, reason })
  }
}

const parse = (rel) => ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const text = (node) => node.getText()
const isString = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

// ── host routes ─────────────────────────────────────────────────────────────────────────────
export const HOST_ROUTE_NA = {
  'csrf-origin':
    'no browser, cookie or Origin on this door: server-to-server HMAC channel (apps/tracy-host/src/auth.js header: "admits NO cookie")',
  'wrong-role':
    'tracy-host has no roles: one HMAC secret per host, held only by tracy-web (apps/tracy-host/src/auth.js header: "holds NO seat secret")',
  pagination:
    'the door returns one object or one job record, never a list (apps/tracy-host/src/app.js route handlers)'
}
export const HOST_HEALTH_NA = {
  anonymous: 'GET /health is unsigned by design (apps/tracy-host/src/app.js healthRoute comment)',
  'expired-auth': 'GET /health carries no credential (apps/tracy-host/src/app.js healthRoute comment)',
  'csrf-origin': HOST_ROUTE_NA['csrf-origin'],
  'wrong-role': HOST_ROUTE_NA['wrong-role'],
  pagination: HOST_ROUTE_NA.pagination,
  'malformed-body': 'GET /health reads no body (apps/tracy-host/src/app.js healthRoute)',
  'encoding-injection': 'GET /health reads no input (apps/tracy-host/src/app.js healthRoute)',
  'other-tenant':
    'GET /health answers machine-level facts only, no tenant data (apps/tracy-host/src/app.js healthRoute)'
}

/** Routes registered on `app` in JavaScript source `code`; a non-literal path goes to `ex.gap`. */
export function routesFromSource(ex, rel, code) {
  const sf = ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  walk(sf, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return
    const target = node.expression.expression
    const verb = node.expression.name.text
    if (!ts.isIdentifier(target) || target.text !== 'app') return
    if (!['get', 'post', 'put', 'delete', 'patch', 'all', 'use'].includes(verb)) return
    const first = node.arguments[0]
    if (!isString(first))
      return ex.gap(rel, `app.${verb}(…) with a non-literal path at offset ${node.getStart()}`)
    if (verb === 'use') return
    const key = `${verb.toUpperCase()} ${first.text}`
    const signed = first.text.startsWith('/_host/')
    const tags = [...COMMON, ...INFRA, ...API_HOST]
    ex.add(`host-route:${key}`, 'host-route', tags, {
      na: signed ? { ...HOST_ROUTE_NA } : { ...HOST_HEALTH_NA }
    })
  })
}

function hostRoutes(ex) {
  const rel = 'apps/tracy-host/src/app.js'
  ex.source(rel, 'host-routes')
  routesFromSource(ex, rel, read(rel))
}

// ── site job kinds (WEBROOT_JOBS dispatch) and the scripts the host runs ─────────────────────
function hostScripts(ex) {
  const called = new Set()
  const files = readdirSync(path.join(REPO, 'apps/tracy-host/src'))
    .filter((f) => f.endsWith('.js'))
    .sort()
  for (const file of files) {
    const rel = `apps/tracy-host/src/${file}`
    ex.source(rel, 'host-source')
    const sf = parse(rel)
    const consts = new Map()
    walk(sf, (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
        consts.set(node.name.text, node.initializer)
    })
    const literalPath = (node, depth = 0) => {
      if (isString(node)) return node.text
      if (ts.isIdentifier(node) && consts.has(node.text) && depth < 3)
        return literalPath(consts.get(node.text), depth + 1)
      if (ts.isCallExpression(node) && text(node.expression) === 'path.join') {
        const parts = node.arguments.map((a) => literalPath(a, depth + 1))
        return parts.every((p) => typeof p === 'string') ? path.posix.join(...parts) : null
      }
      return null
    }
    walk(sf, (node) => {
      if (!ts.isCallExpression(node) || text(node.expression) !== 'path.join') return
      const [first, ...rest] = node.arguments
      if (!first || !/scriptsDir/.test(text(first))) return
      const parts = rest.map((a) => literalPath(a))
      // The one dispatch through WEBROOT_JOBS: its scripts are enumerated from the table below.
      if (/^path\.join\(config\.scriptsDir, 'webroot', script\)$/.test(text(node))) return
      if (parts.some((p) => typeof p !== 'string'))
        return ex.gap(rel, `path.join(scriptsDir, …) built from a non-literal: ${text(node).slice(0, 90)}`)
      const joined = path.posix.join(...parts)
      called.add(joined)
    })
  }
  // WEBROOT_JOBS: `path.join(config.scriptsDir, 'webroot', script)` in runWebrootJob.
  const webroot = parse('apps/tracy-host/src/webroot.js')
  const kinds = []
  walk(webroot, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'WEBROOT_JOBS' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        const name =
          prop.name &&
          (ts.isStringLiteral(prop.name)
            ? prop.name.text
            : ts.isIdentifier(prop.name)
              ? prop.name.text
              : null)
        const value =
          ts.isPropertyAssignment(prop) && ts.isArrayLiteralExpression(prop.initializer)
            ? prop.initializer.elements
            : null
        if (name && value && value.length === 2 && isString(value[0]) && isString(value[1]))
          kinds.push({ kind: name, script: value[0].text, op: value[1].text })
        else
          ex.gap(
            'apps/tracy-host/src/webroot.js',
            `WEBROOT_JOBS entry ${name ?? '?'} is not a [script, op] literal pair`
          )
      }
    }
  })
  if (kinds.length === 0) ex.gap('apps/tracy-host/src/webroot.js', 'no WEBROOT_JOBS table found')
  for (const { kind, script } of kinds) {
    ex.add(`host-job-kind:${kind}`, 'host-job-kind', [...COMMON, ...INFRA, ...API_HOST], {
      na: { ...HOST_ROUTE_NA }
    })
    called.add(`webroot/${script}`)
  }
  // The branches outside the table: core-manifest-write (a literal compared in app.js) and the CMS log kind.
  const app = read('apps/tracy-host/src/app.js')
  if (app.includes("'core-manifest-write'"))
    ex.add('host-job-kind:core-manifest-write', 'host-job-kind', [...COMMON, ...INFRA, ...API_HOST], {
      na: { ...HOST_ROUTE_NA }
    })
  else ex.gap('apps/tracy-host/src/app.js', 'core-manifest-write branch not found')
  const cmsKind = /CMS_LOG_KIND\s*=\s*'([^']+)'/.exec(read('apps/tracy-host/src/cms-log.js'))
  if (cmsKind)
    ex.add(`host-job-kind:${cmsKind[1]}`, 'host-job-kind', [...COMMON, ...INFRA, ...API_HOST], {
      na: { ...HOST_ROUTE_NA }
    })
  else ex.gap('apps/tracy-host/src/cms-log.js', 'CMS_LOG_KIND is not a string literal')
  return called
}

// ── scripts ─────────────────────────────────────────────────────────────────────────────────
const SCRIPT_EXT = /\.(sh|py|mjs|cjs)$/
const isTest = (name) => /(^|[._-])test[._-]|\.test\./.test(name)

export function listScripts(dirRel, base = REPO) {
  const dir = path.join(base, dirRel)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => SCRIPT_EXT.test(f) && !isTest(f))
    .filter((f) => lstatSync(path.join(dir, f)).isFile())
    .sort()
    .map((f) => `${dirRel}/${f}`)
}

/** Every script under `dirRel`, recursively; a symlink, FIFO or other special entry is returned as `special`. */
export function listScriptsDeep(dirRel, base = REPO) {
  const found = []
  const special = []
  const errors = []
  const visit = (rel) => {
    const full = path.join(base, rel)
    let names
    try {
      names = readdirSync(full).sort()
    } catch (error) {
      errors.push(`${rel}: ${error.code ?? error.message}`)
      return
    }
    for (const name of names) {
      if (name === 'node_modules' || name === '__pycache__') continue
      const child = `${rel}/${name}`
      let info
      try {
        info = lstatSync(path.join(base, child))
      } catch (error) {
        errors.push(`${child}: ${error.code ?? error.message}`)
        continue
      }
      if (info.isDirectory()) visit(child)
      else if (SCRIPT_EXT.test(name) && !isTest(name)) {
        if (info.isFile()) found.push(child)
        else special.push(child)
      }
    }
  }
  if (existsSync(path.join(base, dirRel))) visit(dirRel)
  return { found, special, errors }
}

function scripts(ex, hostCalled) {
  const calledRel = new Set()
  for (const rel of hostCalled) {
    const full = `${SCRIPTS}/${rel}`
    if (existsSync(path.join(REPO, full))) calledRel.add(full)
    else ex.gap('apps/tracy-host/src', `the host runs ${rel}, which is not under ${SCRIPTS}`)
  }
  // Everything under the scripts tree, recursively: provision/emdash/build-image.sh and
  // provision/platform/*.sh are entrypoints too. Test directories are the suites, not scripts.
  const deep = listScriptsDeep(SCRIPTS)
  for (const e of deep.errors)
    ex.gap(SCRIPTS, `directory or entry unreadable, its scripts are not listed: ${e}`)
  for (const rel of deep.special)
    ex.gap(rel, 'a script entry that is not a regular file (symlink/FIFO): not read, not counted')
  for (const rel of deep.found) {
    if (/\/test\//.test(rel)) continue
    ex.source(rel, 'script')
    ex.add(`script:${rel}`, calledRel.has(rel) ? 'script-host-entry' : 'script-helper', [...COMMON, ...INFRA])
  }
  for (const rel of calledRel) {
    if (!ex.items.has(`script:${rel}`)) {
      ex.source(rel, 'script')
      ex.add(`script:${rel}`, 'script-host-entry', [...COMMON, ...INFRA])
    }
  }
  for (const dir of ['deploy/scripts', `${FLEET}/dsh`, 'scripts/webroot']) {
    const deepDir = listScriptsDeep(dir)
    if (!existsSync(path.join(REPO, dir)))
      ex.gap(dir, 'the directory does not exist: its scripts are not listed')
    for (const e of deepDir.errors)
      ex.gap(dir, `directory or entry unreadable, its scripts are not listed: ${e}`)
    for (const rel of deepDir.special)
      ex.gap(rel, 'a script entry that is not a regular file (symlink/FIFO): not read, not counted')
    for (const rel of deepDir.found) {
      if (ex.items.has(`script:${rel}`)) continue
      ex.source(rel, 'script')
      ex.add(`script:${rel}`, 'script-deploy', [...COMMON, ...INFRA])
    }
  }
}

const CHAIN_NOISE = new Set(['catch', 'then', 'finally', 'unref', 'info', 'warn', 'error', 'log', 'debug'])

/** The callbacks a timer fires: each named call inside its function body (or the named function itself). */
function cronCallbacks(ex, rel, timerCall, tags, graph) {
  const parent = timerCall.parent
  const timer = ts.isVariableDeclaration(parent)
    ? parent.name.getText()
    : ts.isBinaryExpression(parent)
      ? parent.left.getText()
      : `at-${timerCall.getStart()}`
  const [fn] = timerCall.arguments
  if (!fn) return ex.gap(rel, `timer ${timer} has no callback argument`)
  if (ts.isIdentifier(fn)) {
    ex.add(`cron-callback:${timer}/${fn.text}`, 'cron-callback', tags, { timer })
    return
  }
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))
    return ex.gap(
      rel,
      `timer ${timer}: callback ${text(fn).slice(0, 60)} is neither a name nor a function literal`
    )
  let found = 0
  const visited = new Set()
  // The callback graph: calls in the timer's function, then calls inside every local function it
  // reaches. A callee imported from another module is an edge this extractor cannot follow: reported.
  const visit = (body, depth) => {
    walk(body, (call) => {
      if (!ts.isCallExpression(call)) return
      const callee = call.expression
      const name = text(callee).replace(/\?\./g, '.')
      const last = name.split('.').at(-1)
      if (CHAIN_NOISE.has(last) || name.startsWith('log.')) return
      if (!ts.isIdentifier(callee) && !ts.isPropertyAccessExpression(callee))
        return ex.gap(rel, `timer ${timer}: a call with a computed callee: ${text(call).slice(0, 60)}`)
      const head = name.split('.')[0]
      const local = ts.isIdentifier(callee) ? graph.locals.get(name) : undefined
      const from = graph.imports.get(head)
      if (depth === 0 || local || from) {
        ex.add(`cron-callback:${timer}/${name}`, 'cron-callback', tags, { timer })
        found += 1
      }
      if (from && !graph.reported.has(head)) {
        graph.reported.add(head)
        ex.gap(rel, `callee ${head} is imported from ${from}: the callbacks inside it are not traced`)
      }
      if (local && !visited.has(name)) {
        visited.add(name)
        visit(local, depth + 1)
      }
    })
  }
  visit(fn.body, 0)
  if (found === 0) ex.gap(rel, `timer ${timer}: no callable found in its callback`)
}

// ── cron ────────────────────────────────────────────────────────────────────────────────────
function cron(ex) {
  const rel = 'apps/tracy-web/src/cron.js'
  ex.source(rel, 'cron')
  const sf = parse(rel)
  const tags = [...COMMON, ...INFRA]
  const graph = { locals: new Map(), imports: new Map(), reported: new Set() }
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) graph.locals.set(stmt.name.text, stmt.body)
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const from = stmt.moduleSpecifier.text
      const clause = stmt.importClause
      if (clause.name) graph.imports.set(clause.name.text, from)
      const nb = clause.namedBindings
      if (nb && ts.isNamespaceImport(nb)) graph.imports.set(nb.name.text, from)
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) graph.imports.set(el.name.text, from)
    }
  }
  let inStart = false
  walk(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'start') {
      inStart = true
      ex.add('cron-start:start', 'cron-start', tags)
      walk(node, (inner) => {
        let name = null
        let call = null
        if (
          ts.isVariableDeclaration(inner) &&
          ts.isIdentifier(inner.name) &&
          inner.initializer &&
          ts.isCallExpression(inner.initializer)
        ) {
          name = inner.name.text
          call = inner.initializer
        } else if (
          ts.isBinaryExpression(inner) &&
          inner.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(inner.left) &&
          ts.isCallExpression(inner.right)
        ) {
          name = inner.left.text
          call = inner.right
        }
        if (!call) return
        const callee = text(call.expression)
        if (callee === 'setInterval' || callee === 'setTimeout')
          ex.add(`cron-timer:${name}`, 'cron-timer', tags, { timer: callee })
      })
      walk(node, (inner) => {
        if (ts.isCallExpression(inner) && ['setInterval', 'setTimeout'].includes(text(inner.expression))) {
          cronCallbacks(ex, rel, inner, tags, graph)
          const parent = inner.parent
          const named =
            (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) ||
            (ts.isBinaryExpression(parent) && ts.isIdentifier(parent.left))
          if (!named)
            ex.gap(
              rel,
              `a ${text(inner.expression)} inside start() at offset ${inner.getStart()} is not assigned to a name`
            )
        }
      })
    }
  })
  if (!inStart) ex.gap(rel, 'no `function start` found')
  const timers = [...ex.items.keys()].filter((k) => k.startsWith('cron-timer:'))
  if (timers.length === 0) ex.gap(rel, 'no setInterval/setTimeout assigned to a name inside start()')
}

// ── Dockerfiles, COPY inputs, compose ───────────────────────────────────────────────────────
function referencedBy(rel) {
  const run = spawnSync(
    'git',
    ['-C', REPO, 'grep', '-l', '-F', rel, '--', 'deploy', '.github', 'scripts', `${FLEET}`, 'package.json'],
    { encoding: 'utf8' }
  )
  return run.stdout
    .split('\n')
    .filter((f) => f && f !== rel)
    .sort()
}

/** The stage a `--from=` value names: by name, or by zero-based index (which must precede the use). */
function stageOfFrom(stages, from) {
  if (from === undefined) return undefined
  if (/^\d+$/.test(from)) return stages[Number(from)]
  return stages.find((s) => s.name === from)
}
const stageKey = (stages, stage) => stage.name ?? `index${stages.indexOf(stage)}`

function dockerfiles(ex) {
  const listed = spawnSync(
    'git',
    ['-C', REPO, 'ls-files', '*Dockerfile', '**/Dockerfile', 'Dockerfile*', '**/Dockerfile.*'],
    { encoding: 'utf8' }
  )
    .stdout.split('\n')
    .filter((f) => f && !f.startsWith('vendor/'))
  const known = new Set(DOCKERFILES.map((d) => d.file))
  for (const rel of [...new Set(listed)].sort()) {
    ex.source(rel, 'dockerfile')
    const refs = referencedBy(rel)
    if (!known.has(rel))
      ex.gap(
        rel,
        'a Dockerfile this layer has no build-context entry for (see DOCKERFILES in lib/cases-docker.mjs)'
      )
    if (refs.length === 0)
      ex.gap(
        rel,
        'a Dockerfile no compose file, workflow or script references: it may not be used by the system'
      )
    ex.add(`dockerfile:${rel}`, 'dockerfile', [...COMMON, ...INFRA], { referencedBy: refs })
    const parsed = readDockerfile(path.join(REPO, rel))
    for (const u of parsed.unresolved) ex.gap(rel, `line ${u.line}: ${u.why}`)
    const stageNames = new Set(parsed.stages.map((s) => s.name).filter(Boolean))
    for (const stage of parsed.stages) {
      if (stage.from && !stageNames.has(stage.from) && /\$\{?[A-Z_]+/.test(stage.from))
        ex.gap(rel, `FROM ${stage.from} uses a build argument`)
      for (const i of stage.instructions) {
        if (
          (i.op === 'COPY' || i.op === 'ADD') &&
          i.flags.from &&
          !stageOfFrom(parsed.stages, i.flags?.from)
        ) {
          // An external image as a COPY source (`COPY --from=ghcr.io/…`): not a local stage.
          ex.gap(rel, `line ${i.line}: COPY --from=${i.flags.from} names an image, not a stage in this file`)
        }
      }
    }
    for (const stage of parsed.stages) {
      ex.add(
        `dockerfile-stage:${rel}#${stage.name ?? `index${parsed.stages.indexOf(stage)}`}`,
        'dockerfile-stage',
        [...COMMON, ...INFRA],
        {
          dockerfile: rel
        }
      )
      for (const i of stage.instructions) {
        const fromStage = stageOfFrom(parsed.stages, i.flags?.from)
        if ((i.op === 'COPY' || i.op === 'ADD') && fromStage) {
          for (const source of i.sources ?? [])
            ex.add(
              `dockerfile-stage-copy:${rel}#${stageKey(parsed.stages, fromStage)}::${source}`,
              'dockerfile-stage-copy',
              COPY_INPUT_TAGS,
              {
                dockerfile: rel
              }
            )
        }
        if (i.op === 'RUN' && /seed/i.test(i.run ?? ''))
          ex.gap(rel, `line ${i.line}: a RUN that appears to run a seeder; its input producer is not traced`)
      }
    }
    for (const { line, source } of contextSources(parsed)) {
      if (/[*?[]/.test(source))
        ex.gap(rel, `line ${line}: COPY source ${source} is a glob; its members are not enumerated`)
      ex.add(dockerInputItemId(rel, source), 'dockerfile-input', COPY_INPUT_TAGS, { dockerfile: rel })
    }
  }
}

function compose(ex) {
  for (const rel of ['deploy/compose.yml']) {
    ex.source(rel, 'compose')
    let doc
    try {
      doc = jsYaml.load(read(rel))
    } catch (error) {
      ex.gap(rel, `compose file does not parse: ${error.message}`)
      continue
    }
    if (!doc?.services || typeof doc.services !== 'object') {
      ex.gap(rel, 'no `services` mapping')
      continue
    }
    if (doc.include) ex.gap(rel, '`include:` pulls in files this extractor does not read')
    for (const [name, svc] of Object.entries(doc.services)) {
      if (svc?.extends) ex.gap(rel, `service ${name} uses extends`)
      ex.add(`compose-service:${name}`, 'compose-service', [...COMMON, ...INFRA], {
        profiles: svc?.profiles ?? []
      })
    }
  }
}

/** The existing suites, listed for traceability. They carry no obligations: their expectations are not bound to an oracle. */
function legacySuites(ex) {
  for (const suite of LEGACY_SUITES)
    ex.add(`legacy-suite:${suite.key}`, 'legacy-suite', [], { label: suite.label })
  ex.add('legacy-suite:python', 'legacy-suite', [], {
    label: 'two Python suites under packages/fleet/tracy-fleet-operation/test'
  })
}

/**
 * The database migrations tracy-web applies at boot, one item per file. The listing is the inventory's
 * own extractor (one reading of the folder, not two); what it could not read becomes a gap here too.
 */
function migrations(ex) {
  let found
  try {
    found = migrationSource.extract(REPO)
  } catch (error) {
    ex.gap(migrationSource.sourcePath, `migrations could not be listed: ${error.message}`)
    return
  }
  for (const gap of found.unresolved ?? []) ex.gap(gap.detail, gap.kind)
  for (const item of found.items) {
    ex.source(item.file, 'migration')
    ex.add(item.id, 'migration', [...COMMON, ...INFRA], { number: item.number })
  }
}

function npmScripts(ex) {
  const rel = 'package.json'
  ex.source(rel, 'npm')
  const pkg = JSON.parse(read(rel))
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (/deploy\/|compose|docker|dev\.sh|run\.sh|fleet|tracy-host|bootstrap/.test(command)) {
      ex.add(`npm-script:${name}`, 'npm-script', [...COMMON, ...INFRA])
    }
  }
}

export function extract() {
  const ex = new Extraction()
  hostRoutes(ex)
  const called = hostScripts(ex)
  scripts(ex, called)
  cron(ex)
  dockerfiles(ex)
  compose(ex)
  npmScripts(ex)
  migrations(ex)
  legacySuites(ex)
  const items = [...ex.items.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
  const sources = [...ex.sources.values()].sort((a, b) => (a.path < b.path ? -1 : 1))
  const unresolved = [...ex.unresolved].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
  return assertDenominator(
    {
      schema: DENOMINATOR_SCHEMA_ID,
      layer: 'infra',
      source: 'tests/qa/layers/infra/generate-denominator.mjs',
      revision: `sha256:${sha(JSON.stringify(sources))}`,
      command: 'node tests/qa/layers/infra/generate-denominator.mjs --write',
      naReasons: ex.reasons.table(),
      items,
      unresolved,
      details: {
        extraction: unresolved.length === 0 ? 'complete' : 'incomplete',
        tagPolicy: {
          common: COMMON,
          infraScript: INFRA,
          apiHost: API_HOST,
          copyInput: COPY_INPUT_TAGS,
          note: 'host-route and host-job-kind items carry common + infra + api/host tags; scripts, cron timers, Dockerfiles, compose services, npm scripts and database migrations carry common + infra; a COPY input carries common + infra like the other infra items'
        },
        sources
      }
    },
    'infra'
  )
}
