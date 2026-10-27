/**
 * Generate the unit layer's inventory from the repository's own test declarations.
 *
 *   node tests/qa/layers/unit/generate.mjs           write cases/*.json and denominator.json
 *   node tests/qa/layers/unit/generate.mjs --check   write nothing; exit 1 when the files differ
 *
 * Sources, all read from the code and never typed here:
 *  - `workersFiles({strict:true})` of `scripts/check-tests.ts` (the files `test:workers` runs), grouped
 *    into areas; the flags come from the root `test:workers` / `test:interop` script text;
 *  - GROUPS / STANDALONE / PARTS of `scripts/check-tests.ts` through the TypeScript AST;
 *  - every case of `tests/regression/cases/*.json` through `tests/regression/catalogue.mjs`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, globSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { assertDenominator, DENOMINATOR_SCHEMA_ID } from '../../lib/denominator.mjs'
import { parseArgs, readRegular, REPO, sha256, UsageError } from '../static/lib/common.mjs'
import { CASES_DIR as REG_CASES, parseCase } from '../../../regression/catalogue.mjs'
import { productSourcesOf } from './lib/sources.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const CASES_DIR = join(HERE, 'cases')
export const DENOMINATOR = join(HERE, 'denominator.json')
export const COMMAND = 'node tests/qa/layers/unit/generate.mjs'
const ORACLES = join(REPO, 'tests/qa/oracles/unit')

export { productSourcesOf }

export const COMMON_TAGS = [
  'happy',
  'empty',
  'invalid',
  'boundary',
  'dependency-failure',
  'repeat',
  'cleanup'
]
export const UNIT_TAGS = [
  'null-missing',
  'min-max',
  'unicode',
  'time-boundary',
  'ordering',
  'duplicate',
  'exception',
  'state-transition'
]

/** @returns {object} parsed JSON of an oracle file of this layer. */
export function oracleJson(name) {
  return JSON.parse(readRegular(join(ORACLES, name)).toString('utf8'))
}

/**
 * Read the declarations of check-tests.ts that are not exported.
 * @param {string} [source] - text of check-tests.ts (tests pass their own).
 * @returns {{groups: {run: string, files: string}[], standalone: string[], parts: string[]}} what was found.
 */
export function readCheckTests(source = readRegular(join(REPO, 'scripts/check-tests.ts')).toString('utf8')) {
  const path = join(REPO, 'scripts/check-tests.ts')
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const top = new Map()
  sf.forEachChild((n) => {
    if (!ts.isVariableStatement(n)) return
    for (const d of n.declarationList.declarations)
      if (ts.isIdentifier(d.name) && d.initializer) top.set(d.name.text, d.initializer)
  })
  const unwrap = (e) =>
    e && (ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) ? unwrap(e.expression) : e
  const arr = (name) => {
    const e = unwrap(top.get(name))
    if (!e || !ts.isArrayLiteralExpression(e))
      throw new UsageError(`scripts/check-tests.ts no longer declares ${name} as an array literal`)
    return e.elements
  }
  const strings = (name) =>
    arr(name).map((e) => {
      if (!ts.isStringLiteralLike(e)) throw new UsageError(`${name} holds a non-literal element`)
      return e.text
    })
  const groups = arr('GROUPS').map((e) => {
    if (!ts.isObjectLiteralExpression(e)) throw new UsageError('GROUPS holds a non-object element')
    const get = (k) =>
      e.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === k)?.initializer
    const run = get('run')
    const files = get('files')
    if (!run || !ts.isStringLiteralLike(run) || !files || !ts.isRegularExpressionLiteral(files))
      throw new UsageError('a GROUPS entry changed shape')
    const lit = /^\/(.*)\/([a-z]*)$/s.exec(files.text)
    if (lit === null) throw new UsageError('a GROUPS regex literal could not be read')
    return { run: run.text, files: lit[1], flags: lit[2] }
  })
  return { groups, standalone: strings('STANDALONE'), parts: strings('PARTS') }
}

/**
 * Parse the flags of a root script the layer reuses.
 * @param {string} name - script name.
 * @param {RegExp} shape - the verified shape; group 1 = node options before --test, group 2 = test flags, group 3 = globs.
 * @returns {{pre: string[], flags: string[], globs: string[]}} the pieces.
 */
function rootScript(name, shape) {
  const pkg = JSON.parse(readRegular(join(REPO, 'package.json')).toString('utf8'))
  const text = pkg.scripts?.[name]
  const m = typeof text === 'string' ? shape.exec(text.trim()) : null
  if (m === null)
    throw new UsageError(
      `package.json script "${name}" is ${JSON.stringify(text ?? null)}; update generate.mjs to read this shape`
    )
  return {
    pre: (m[1] ?? '').trim() === '' ? [] : m[1].trim().split(/\s+/),
    flags: (m[2] ?? '').trim() === '' ? [] : m[2].trim().split(/\s+/),
    globs: m[3].trim().split(/\s+/)
  }
}

/**
 * @param {string} file - repo-relative test file.
 * @returns {string} the owning area (`apps/x`, `packages/g/n`, `scripts`, `vendor/tracy/dsh-passwords`) or ''.
 */
export function areaOf(file) {
  const p = file.split('/')
  if (p[0] === 'apps' && p.length > 2) return p.slice(0, 2).join('/')
  if (p[0] === 'scripts') return 'scripts'
  if (p[0] === 'packages' && p.length > 3) return p.slice(0, 3).join('/')
  if (file.startsWith('vendor/tracy/dsh-passwords/')) return 'vendor/tracy/dsh-passwords'
  return ''
}

/**
 * Whether the case's own command files mention docker or the php container helper. Only the files named
 * on its command line are read: a container started by a test those files run is not seen here.
 * @param {{cmd: string[], cwd?: string}} run - the case's run.
 * @returns {boolean} true when a mention was found.
 */
function usesContainers(run) {
  return run.cmd
    .filter((a) => /\.(?:mjs|ts)$/.test(a))
    .some((a) => {
      try {
        return /\bdocker\b|php\.mjs/.test(readRegular(join(REPO, run.cwd ?? '.', a)).toString('utf8'))
      } catch {
        return false
      }
    })
}

/** @returns {string} stable slug for ids. */
export const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** @returns {string | null} the owner layer for a regression with no deterministic run. */
function ownerFromRules(c, rules, legacyMap) {
  if (legacyMap?.has(c.id))
    return { layer: legacyMap.get(c.id), source: 'tests/qa/inventory/legacy-map.json' }
  if (c.flaky_model)
    return { layer: 'harness', source: 'task W2: flaky_model cases go to the harness live set' }
  for (const r of rules)
    if (new RegExp(r.area).test(c.area))
      return { layer: r.layer, source: `oracles/unit/legacy-owner-rules.json: ${r.why}` }
  return null
}

/** Read W1's legacy map when it exists; any shape other than the two known ones is reported, never guessed. */
function readLegacyMap(unresolved) {
  const path = join(REPO, 'tests/qa/inventory/legacy-map.json')
  if (!existsSync(path)) return null
  try {
    const v = JSON.parse(readRegular(path).toString('utf8'))
    const map = new Map()
    const rows = Array.isArray(v) ? v : Array.isArray(v?.map) ? v.map : null
    if (rows !== null) {
      for (const r of rows) {
        const id = r.legacyId ?? r.id
        const layer = r.layer ?? r.owner
        if (typeof id === 'string' && typeof layer === 'string') map.set(id, layer)
      }
    } else if (v && typeof v === 'object' && typeof v.map === 'object')
      for (const [k, l] of Object.entries(v.map)) if (typeof l === 'string') map.set(k, l)
    if (map.size === 0) throw new Error('no (id, layer) pairs found')
    return map
  } catch (error) {
    unresolved.push({
      id: 'legacy-map',
      reason: `tests/qa/inventory/legacy-map.json exists but is unreadable (${error.message}); own mapping used`
    })
    return null
  }
}

/**
 * Build the whole inventory in memory.
 * @returns {Promise<{files: Map<string, object>, denominator: object}>} case files and denominator.
 */
export async function build() {
  const unresolved = []
  // Importing a .ts file under plain node prints a typeless-package warning; keep this tool's output clean.
  const emit = process.emitWarning
  process.emitWarning = () => {}
  const checkTests = await import(join(REPO, 'scripts/check-tests.ts')).finally(() => {
    process.emitWarning = emit
  })
  const decl = readCheckTests()
  const workersGroup = decl.groups.find((g) => g.run === 'test:workers')
  if (workersGroup === undefined) throw new UsageError('GROUPS no longer declares test:workers')
  const workers = rootScript(
    'test:workers',
    /^node((?: --import \S+)*) --test((?: --test-[\w-]+(?:=\S+)?)*) ((?:\S+\.test\.mjs ?)+)$/
  )
  const interop = rootScript('test:interop', /^node((?: --import \S+)+) --test()\s+(\S+\.test\.ts)$/)
  const files = checkTests.workersFiles({ strict: true })
  const globbed = new Set(workers.globs.flatMap((g) => globSync(g, { cwd: REPO })))
  for (const f of files)
    if (!globbed.has(f))
      unresolved.push({
        id: `file:${f}`,
        reason: 'in workersFiles() but not matched by the test:workers globs'
      })
  for (const f of globbed)
    if (!files.includes(f))
      unresolved.push({
        id: `file:${f}`,
        reason: 'matched by the test:workers globs but not in workersFiles()'
      })
  const byArea = new Map()
  for (const f of files) {
    const a = areaOf(f)
    if (a === '') unresolved.push({ id: `file:${f}`, reason: 'no area for this test file' })
    else byArea.set(a, [...(byArea.get(a) ?? []), f])
  }
  const interopGroup = decl.groups.find((g) => g.run === 'test:interop')
  if (interopGroup === undefined) throw new UsageError('GROUPS no longer declares test:interop')
  const interopGroupRe = new RegExp(interopGroup.files, interopGroup.flags)
  const interopFiles = checkTests
    .walk(join(REPO, 'scripts'), [], true)
    .map((f) => f.slice(REPO.length + 1))
    .filter((f) => interopGroupRe.test(f))
    .sort()
  const out = new Map()
  const items = []
  const coverage = {}
  const suiteTags = [...COMMON_TAGS, ...UNIT_TAGS]
  const addSuite = (area, manifest, itemKind = 'test-area') => {
    out.set(`${manifest.id}.json`, manifest)
    items.push({ id: manifest.itemIds[0], kind: itemKind, requiredTags: suiteTags, na: {} })
    const cov = {}
    for (const t of suiteTags)
      cov[t] = t === 'happy' ? { status: 'covered', cases: [manifest.id] } : { status: 'open' }
    coverage[manifest.itemIds[0]] = cov
  }
  const baseEffects = {
    reads: ['repository tree'],
    writes: ['run dir under QA_ARTIFACT_ROOT: logs/, tmp/<case> (the child TMPDIR, removed after the run)'],
    mail: false,
    model: false,
    containers: false
  }
  for (const [area, list] of [...byArea].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const id = `QA-UNIT-area-${slug(area)}-happy`
    addSuite(area, {
      id,
      itemIds: [`test-area:${area}`],
      requirement: `Every existing node:test file of ${area} (${list.length} files, via test:workers) passes with none skipped.`,
      oracle: {
        source: 'existing node:test suites of the area',
        ref: `scripts/check-tests.ts GROUPS test:workers; ${area}`,
        invariant:
          'The suite is green with no skipped, todo or missing test; its pass says nothing about RED until a regression case proves one.'
      },
      edgeTags: ['happy'],
      targets: ['local'],
      effects: baseEffects,
      prerequisites: ['node'],
      assertionIds: [`unit.${slug(area)}.suite-green`],
      redProof: null,
      legacyIds: [],
      kind: 'suite',
      area,
      areas: [area, area.split('/').pop(), 'suites'],
      command: ['node', ...workers.pre, '--test', '--test-reporter=tap', ...workers.flags, ...list],
      files: list,
      timeoutS: 3600
    })
  }
  addSuite('interop', {
    id: 'QA-UNIT-area-interop-happy',
    itemIds: ['test-area:interop'],
    requirement: `Every scripts/test/*.test.ts file (${interopFiles.length}, via test:interop under tsx) passes with none skipped.`,
    oracle: {
      source: 'existing node:test suites of the area',
      ref: 'scripts/check-tests.ts GROUPS test:interop',
      invariant: 'The suite is green with no skipped, todo or missing test.'
    },
    edgeTags: ['happy'],
    targets: ['local'],
    effects: baseEffects,
    prerequisites: ['node', 'tsx'],
    assertionIds: ['unit.interop.suite-green'],
    redProof: null,
    legacyIds: [],
    kind: 'suite',
    area: 'interop',
    areas: ['interop', 'suites'],
    command: ['node', ...interop.pre, '--test', '--test-reporter=tap', ...interop.flags, ...interopFiles],
    files: interopFiles,
    timeoutS: 1800
  })
  // Groups this adapter lists but does not execute: each becomes an explicit PENDING/ENV case with its probe.
  const heavy = [
    {
      key: 'e2e',
      run: 'e2e',
      why: 'real-browser smoke tests (test/e2e): need a browser; belong to the ui layer',
      probe: 'chrome'
    },
    {
      key: 'dsh-passwords',
      run: 'dsh-passwords',
      why: 'vendor/tracy/dsh-passwords suite: needs `npm run build` to write dist/ into vendor/ first, which the adapter must not do in the real tree',
      probe: 'none'
    },
    ...decl.standalone.map((s) => ({
      key: `standalone-${s.split('/').pop()}`,
      run: 'standalone',
      why: `${s}: own lockfile and own pnpm test (about 8 minutes)`,
      probe: `node_modules:${s}`
    }))
  ]
  const groupFiles = (run) => {
    const g = decl.groups.find((x) => x.run === run)
    if (g === undefined) throw new UsageError(`GROUPS no longer declares ${run}`)
    return g
  }
  for (const h of heavy) {
    groupFiles(h.run)
    const id = `QA-UNIT-group-${slug(h.key)}-happy`
    addSuite(
      h.key,
      {
        id,
        itemIds: [`test-group:${h.key}`],
        requirement: `The ${h.key} run group of scripts/check-tests.ts is executed and green.`,
        oracle: {
          source: 'existing test group',
          ref: 'scripts/check-tests.ts GROUPS',
          invariant: 'The group is green with no skipped, todo or missing test.'
        },
        edgeTags: ['happy'],
        targets: ['local'],
        effects: baseEffects,
        prerequisites: [],
        assertionIds: [`unit.${slug(h.key)}.group-green`],
        redProof: null,
        legacyIds: [],
        kind: 'group',
        area: h.key,
        areas: [h.key, 'suites'],
        command: [],
        groupRun: h.run,
        probe: h.probe,
        notRun: h.why,
        files: []
      },
      'test-group'
    )
  }
  // Regression cases.
  const legacyMap = readLegacyMap(unresolved)
  const { rules } = oracleJson('legacy-owner-rules.json')
  const dir = join(REPO, REG_CASES)
  const regs = []
  const fileOf = new Map()
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const parsed = parseCase(readRegular(join(dir, name)).toString('utf8'), `${REG_CASES}${name}`)
    if (parsed.ok) {
      regs.push(parsed.value)
      fileOf.set(parsed.value.id, `${REG_CASES}${name}`)
    } else unresolved.push({ id: `regression:${name}`, reason: parsed.problems.join('; ') })
  }
  const seen = new Set()
  for (const c of regs) {
    if (seen.has(c.id)) throw new UsageError(`duplicate regression id ${c.id}`)
    seen.add(c.id)
    const itemId = `regression:${c.id}`
    const caseFile = fileOf.get(c.id)
    const oracle = {
      source: caseFile,
      ref: `PR #${c.pr} (${c.kind}); fix evidence: ${c.evidence ?? 'none recorded'}`,
      invariant: c.expect.join(' ')
    }
    if (c.run !== undefined) {
      const first = c.run.cmd.find((a) => /\.(?:test\.)?(?:mjs|ts)$/.test(a)) ?? ''
      const pkgArea = areaOf(c.run.cwd ? `${c.run.cwd}/x` : first)
      // A node test runner command is judged from TAP: the QA command adds the reporter when the regression
      // case left it out (the regression file itself is not edited).
      const isNodeTest = c.run.cmd.includes('--test')
      const cmd =
        isNodeTest && !c.run.cmd.some((a) => a.startsWith('--test-reporter'))
          ? c.run.cmd.flatMap((a) => (a === '--test' ? [a, '--test-reporter=tap'] : [a]))
          : c.run.cmd
      const style = c.run.cmd[0].endsWith('playwright')
        ? 'playwright'
        : isNodeTest && cmd.includes('--test-reporter=tap')
          ? 'node-tap'
          : 'script'
      const manifest = {
        id: `QA-UNIT-${c.id}-happy`,
        itemIds: [itemId],
        requirement: c.title,
        oracle,
        edgeTags: ['happy'],
        targets: ['local'],
        effects: { ...baseEffects, containers: usesContainers(c.run) },
        prerequisites: (c.run.needs ?? []).map((n) => `need:${n}`),
        assertionIds: (c.run.tests ?? [`${c.id}.exit-0`]).map((t) => (c.run.tests ? t : t)),
        redProof: null,
        legacyIds: [c.id],
        kind: 'regression',
        area: 'regression',
        areas: ['regression', ...(pkgArea === '' ? [] : [pkgArea, pkgArea.split('/').pop()])],
        style,
        regression: { id: c.id, pr: c.pr, kind: c.kind, area: c.area, file: caseFile },
        command: cmd,
        cwd: c.run.cwd ?? '.',
        needs: c.run.needs ?? [],
        tests: c.run.tests ?? [],
        timeoutS: c.run.timeout_s ?? 600
      }
      out.set(`${manifest.id}.json`, manifest)
      items.push({ id: itemId, kind: 'regression', requiredTags: ['happy'], na: {} })
      coverage[itemId] = { happy: { status: 'covered', cases: [manifest.id] } }
    } else {
      const owner = ownerFromRules(c, rules, legacyMap)
      if (owner === null)
        unresolved.push({ id: itemId, reason: `no owner layer rule matches area ${c.area}` })
      const layer = owner?.layer ?? 'unassigned'
      const manifest = {
        id: `QA-UNIT-${c.id}-pending`,
        itemIds: [itemId],
        requirement: c.title,
        oracle,
        edgeTags: ['happy'],
        targets: ['local'],
        effects: baseEffects,
        prerequisites: c.needs.map((n) => `need:${n}`),
        assertionIds: [],
        redProof: null,
        legacyIds: [c.id],
        kind: 'no-run',
        area: 'regression-no-run',
        areas: ['regression-no-run', ...(c.flaky_model ? ['flaky-model'] : []), `owner:${layer}`],
        regression: { id: c.id, pr: c.pr, kind: c.kind, area: c.area, file: caseFile },
        ownerLayer: layer,
        ownerSource: owner?.source ?? 'none',
        flakyModel: c.flaky_model,
        command: [],
        needs: c.needs
      }
      out.set(`${manifest.id}.json`, manifest)
      items.push({
        id: itemId,
        kind: 'regression-no-run',
        requiredTags: ['happy'],
        na: {},
        meta: { ownerLayer: layer, ownerSource: owner?.source ?? 'none', flakyModel: c.flaky_model }
      })
      coverage[itemId] = { happy: { status: 'open', note: `no deterministic run; owner layer ${layer}` } }
    }
  }
  // Oracle anchor in the current product: the code each case exercises, or an explicit gap (condition 1).
  for (const m of out.values()) {
    let found = { sources: [], unresolved: [] }
    let why = ''
    if (m.kind === 'regression' || m.kind === 'suite') {
      const tsx = m.command.includes('tsx')
      found =
        m.kind === 'suite'
          ? productSourcesOf(m.files, { tsx })
          : productSourcesOf(m.command, { cwd: m.cwd ?? '.', tsx })
      why =
        "no product file is imported, read or run through a supported form in the command's test files (see tests/qa/layers/unit/lib/sources.mjs)"
    } else if (m.kind === 'no-run') {
      // A case with no run has no code to read: its text is never a source.
      why = `no deterministic run, so no code to follow; owner layer ${m.ownerLayer}, needs ${m.needs.join(', ') || 'a stand'}`
    } else why = `not executed by this layer: ${m.notRun}`
    if (found.sources.length > 0) {
      m.oracle.productSources = found.sources
      m.oracle.productSourcesScope =
        'file-level: the files the case imports, reads or runs (declaration line, or the first code line); the invariant is exercised through them, the executed assertion is the case command'
    } else m.oracle.productSourceGap = why
    if (found.unresolved.length > 0) m.oracle.productSourcesUnresolved = found.unresolved
  }
  if (items.length === 0) throw new UsageError('empty denominator')
  const denominator = assertDenominator(
    {
      schema: DENOMINATOR_SCHEMA_ID,
      layer: 'unit',
      source:
        'scripts/check-tests.ts (workersFiles, GROUPS, STANDALONE) + package.json test scripts + tests/regression/cases/*.json',
      revision: `sha256:${sha256(JSON.stringify([files, interopFiles, decl, regs.map((r) => [r.id, r.run ?? null, r.area, r.flaky_model, r.needs])]))}`,
      command: COMMAND,
      naReasons: {},
      items,
      unresolved,
      details: {
        coverage,
        counts: {
          areas: byArea.size,
          workersFiles: files.length,
          interopFiles: interopFiles.length,
          regressions: regs.length,
          withRun: regs.filter((r) => r.run !== undefined).length,
          withoutRun: regs.filter((r) => r.run === undefined).length,
          flakyModel: regs.filter((r) => r.flaky_model).length
        }
      }
    },
    'unit'
  )
  return { files: out, denominator }
}

/**
 * Compare an in-memory inventory with files on disk, ignoring whitespace.
 * @param {Map<string, object>} files - expected case files.
 * @param {object} denominator - expected denominator.
 * @param {string} casesDir - directory of case files.
 * @param {string} denominatorPath - denominator.json path.
 * @returns {string[]} differences; empty when current.
 */
export function compareOutputs(files, denominator, casesDir, denominatorPath) {
  const problems = []
  const want = new Set(files.keys())
  if (!existsSync(casesDir)) problems.push('cases/ is missing')
  else
    for (const name of readdirSync(casesDir))
      if (name.endsWith('.json') && !want.has(name)) problems.push(`stale case file ${name}`)
  const same = (path, value) => {
    try {
      return JSON.stringify(JSON.parse(readRegular(path).toString('utf8'))) === JSON.stringify(value)
    } catch {
      return false
    }
  }
  for (const [name, value] of files) {
    const path = join(casesDir, name)
    if (!existsSync(path)) problems.push(`missing ${name}`)
    else if (!same(path, value)) problems.push(`differs ${name}`)
  }
  if (!existsSync(denominatorPath)) problems.push('denominator.json is missing')
  else if (!same(denominatorPath, denominator)) problems.push('denominator.json differs')
  return problems
}

/** Write or compare. */
async function main() {
  const args = parseArgs(process.argv.slice(2), { check: { type: 'boolean' } })
  const { files, denominator } = await build()
  if (args.check === true) {
    const problems = compareOutputs(files, denominator, CASES_DIR, DENOMINATOR)
    if (problems.length > 0) {
      process.stderr.write(
        `unit generate --check: out of date (run ${COMMAND}):\n  ${problems.slice(0, 30).join('\n  ')}\n`
      )
      process.exit(1)
    }
    process.stdout.write(`unit generate --check: ${files.size} cases and denominator are current\n`)
    return
  }
  mkdirSync(CASES_DIR, { recursive: true })
  for (const name of readdirSync(CASES_DIR)) if (name.endsWith('.json')) rmSync(join(CASES_DIR, name))
  for (const [name, value] of files)
    writeFileSync(join(CASES_DIR, name), `${JSON.stringify(value, null, 2)}\n`)
  writeFileSync(DENOMINATOR, `${JSON.stringify(denominator, null, 2)}\n`)
  const fmt = spawnSync(
    join(REPO, 'node_modules/.bin/biome'),
    ['format', '--write', CASES_DIR, DENOMINATOR],
    { encoding: 'utf8' }
  )
  if (fmt.status !== 0) throw new Error(`biome format failed: ${fmt.stderr}`)
  process.stdout.write(`unit generate: wrote ${files.size} cases and denominator.json\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`unit generate: ${error.message}\n`)
    process.exit(error instanceof UsageError ? 2 : 1)
  }
}
