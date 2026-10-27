/**
 * Generate the static layer's inventory from the gate list itself.
 *
 *   node tests/qa/layers/static/generate.mjs           write cases/*.json and denominator.json
 *   node tests/qa/layers/static/generate.mjs --check   write nothing; exit 1 when the files differ
 *
 * The gate list is read from `scripts/check-all.ts` with the TypeScript AST (the file calls main()
 * on import, so it cannot be imported), so there is no second list of gates: a gate added to GATES
 * gets a case on the next generation, and `--check` goes red until someone generates it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { assertDenominator, DENOMINATOR_SCHEMA_ID, NaTable } from '../../lib/denominator.mjs'
import { parseArgs, readRegular, REPO, sha256, UsageError } from './lib/common.mjs'
import { firstCodeLine } from '../unit/lib/sources.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const CASES_DIR = join(HERE, 'cases')
export const DENOMINATOR = join(HERE, 'denominator.json')
const ORACLES = join(REPO, 'tests/qa/oracles/static')
export const COMMAND = 'node tests/qa/layers/static/generate.mjs'

/** Required tags (plan §3): every item, plus the infra/script group (static covers scripts). */
export const REQUIRED_TAGS = [
  'happy',
  'empty',
  'invalid',
  'boundary',
  'dependency-failure',
  'repeat',
  'cleanup',
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

const NA_ONE_SHOT = {
  reason:
    'a gate is one child process spawned by check-all.ts runGate (spawnSync, no daemon, no lock file, nothing kept between runs)',
  source: 'scripts/check-all.ts#runGate'
}
const NA_READ_ONLY = {
  reason:
    'the gate only reads the tree (a --check or check-* script; the GATES header says "run with the repository root as cwd"); a failed run leaves nothing to roll back',
  source: 'scripts/check-all.ts#GATES'
}

/**
 * Read the GATES literal.
 * @param {string} [source] - text of check-all.ts (tests pass their own).
 * @returns {{gates: {name: string, script: string, args: string[]}[], unresolved: object[], text: string}} what was read.
 */
export function readGates(source = readRegular(join(REPO, 'scripts/check-all.ts')).toString('utf8')) {
  const path = join(REPO, 'scripts/check-all.ts')
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let node = null
  sf.forEachChild((n) => {
    if (!ts.isVariableStatement(n)) return
    for (const d of n.declarationList.declarations)
      if (ts.isIdentifier(d.name) && d.name.text === 'GATES') node = d.initializer
  })
  if (node === null || !ts.isArrayLiteralExpression(node))
    throw new UsageError(
      'scripts/check-all.ts no longer declares GATES as an array literal; update generate.mjs'
    )
  const gates = []
  const unresolved = []
  const str = (e) => (e !== undefined && ts.isStringLiteralLike(e) ? e.text : null)
  node.elements.forEach((el, index) => {
    if (!ts.isObjectLiteralExpression(el)) {
      unresolved.push({ id: `GATES[${index}]`, reason: 'element is not an object literal' })
      return
    }
    const prop = (key) =>
      el.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === key)?.initializer
    const name = str(prop('name'))
    const script = str(prop('script'))
    const argsNode = prop('args')
    let args = []
    if (argsNode !== undefined) {
      if (!ts.isArrayLiteralExpression(argsNode) || !argsNode.elements.every((a) => str(a) !== null)) {
        unresolved.push({ id: `GATES[${index}]`, reason: 'args is not a literal string array' })
        return
      }
      args = argsNode.elements.map(str)
    }
    if (name === null || script === null)
      unresolved.push({ id: `GATES[${index}]`, reason: 'name or script is not a string literal' })
    else gates.push({ name, script, args, line: sf.getLineAndCharacterOfPosition(el.getStart(sf)).line + 1 })
  })
  if (gates.length === 0)
    throw new UsageError('GATES is empty or unreadable: refusing to generate an empty denominator')
  const names = gates.map((g) => g.name)
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  if (dup.length > 0) throw new UsageError(`duplicate gate names in GATES: ${[...new Set(dup)].join(', ')}`)
  return { gates, unresolved, text: node.getText(sf) }
}

/** @returns {object} parsed JSON of an oracle file. */
export function oracleJson(name) {
  return JSON.parse(readRegular(join(ORACLES, name)).toString('utf8'))
}

/**
 * Build the whole inventory in memory.
 * @returns {{files: Map<string, object>, denominator: object}} case files by file name and the denominator.
 */
export function build() {
  const { gates, unresolved, text } = readGates()
  const { rules } = oracleJson('rules.json')
  const policy = oracleJson('gate-policy.json')
  const { mutations } = oracleJson('mutations.json')
  for (const m of mutations)
    if (!gates.some((g) => g.name === m.gate))
      throw new UsageError(`mutation ${m.id} names unknown gate ${m.gate}`)
  const files = new Map()
  const items = []
  const reasons = new NaTable()
  const coverage = {}
  for (const gate of gates) {
    const scriptPath = join('scripts', gate.script)
    if (!existsSync(join(REPO, scriptPath)))
      unresolved.push({ id: `gate:${gate.name}`, reason: `${scriptPath} does not exist` })
    const rule = rules.find((r) => r.gates.includes(gate.name))
    const muts = mutations.filter((m) => m.gate === gate.name)
    const mode = policy.gates[gate.name]?.mode ?? 'run'
    const command = ['pnpm', 'exec', 'tsx', 'scripts/check-all.ts', '--only', gate.name]
    const id = `QA-STATIC-${gate.name}-happy`
    const tags = ['happy', ...(muts.length > 0 ? ['invalid'] : [])]
    const manifest = {
      id,
      itemIds: [`gate:${gate.name}`],
      requirement: `Gate ${gate.name} (${scriptPath}${gate.args.length > 0 ? ` ${gate.args.join(' ')}` : ''}) exits 0 on the current tree and goes red on a tree that breaks the rule it enforces.`,
      oracle: {
        source: rule?.source ?? scriptPath,
        ref: rule?.ref ?? 'header comment',
        invariant:
          rule?.invariant ??
          `The tree satisfies the rule stated in the header comment of ${scriptPath}; the gate exits 0 only then.`,
        // Where the product enforces the rule today: the gate's row in check-all.ts and the script behind it.
        productSources: [
          `scripts/check-all.ts:${gate.line}`,
          `${scriptPath}:${firstCodeLine(REPO, scriptPath)}`
        ]
      },
      edgeTags: tags,
      targets: ['local'],
      effects: {
        reads: ['repository tree'],
        writes: [],
        mail: false,
        model: false,
        containers: mode === 'heavy'
      },
      prerequisites: [
        'node',
        'tsx (node_modules)',
        mode === 'heavy' ? `heavy-gate:${gate.name}` : 'none'
      ].filter((p) => p !== 'none'),
      assertionIds: [`static.${gate.name}.exit-0`, ...muts.map((m) => m.assertionId)],
      redProof: null,
      legacyIds: [],
      gate: gate.name,
      command,
      successMarker: 'check-all: 1 gate(s) passed',
      gateScript: scriptPath,
      mode,
      mutations: muts.map((m) => m.id)
    }
    files.set(`${id}.json`, manifest)
    const na = {
      restart: reasons.add(NA_ONE_SHOT.reason, NA_ONE_SHOT.source),
      'stale-lock': reasons.add(NA_ONE_SHOT.reason, NA_ONE_SHOT.source),
      ...(mode === 'heavy' ? {} : { rollback: reasons.add(NA_READ_ONLY.reason, NA_READ_ONLY.source) })
    }
    // A tag is either owed or N-A, never both (contracts/denominator.schema.json).
    items.push({
      id: `gate:${gate.name}`,
      kind: 'gate',
      requiredTags: REQUIRED_TAGS.filter((tag) => !(tag in na)),
      na
    })
    const cov = {}
    for (const tag of REQUIRED_TAGS) {
      const na = items[items.length - 1].na[tag]
      if (tags.includes(tag)) cov[tag] = { status: 'covered', cases: [id] }
      else if (na !== undefined) cov[tag] = { status: 'na', reason: na }
      else cov[tag] = { status: 'open' }
    }
    coverage[`gate:${gate.name}`] = cov
  }
  // The focus-halo rule is stated by CLAUDE.md §8 and has no gate: an open obligation, not an invented gate.
  const haloId = 'QA-STATIC-rule-focus-halo-invalid'
  files.set(`${haloId}.json`, {
    id: haloId,
    itemIds: ['rule:focus-halo'],
    requirement:
      'No Tracy surface paints a focus halo (ring-2/ring-3/ring-ring/50, translucent 0 0 0 Npx box-shadow).',
    oracle: {
      source: 'CLAUDE.md',
      ref: '§8 UI, focus rule; DESIGN.md §5 grep command',
      invariant: 'Focus is one 1px stroke that changes colour, never a halo.',
      // CLAUDE.md and DESIGN.md state the rule; no product code enforces it, so there is no source to anchor on.
      productSourceGap:
        'no gate or product code enforces the rule: only CLAUDE.md §8 and DESIGN.md §5 state it'
    },
    edgeTags: ['invalid'],
    targets: ['local'],
    effects: { reads: ['repository tree'], writes: [], mail: false, model: false, containers: false },
    prerequisites: [],
    assertionIds: [],
    redProof: null,
    legacyIds: ['REG-PR-927-focus-no-halo'],
    gate: null,
    command: [],
    mode: 'no-gate',
    mutations: []
  })
  items.push({ id: 'rule:focus-halo', kind: 'rule-without-gate', requiredTags: ['invalid'], na: {} })
  coverage['rule:focus-halo'] = {
    invalid: {
      status: 'open',
      note: 'CLAUDE.md §8: "No gate catches this"; REG-PR-927-focus-no-halo is the unit layer\'s regression case'
    }
  }
  const denominator = assertDenominator(
    {
      schema: DENOMINATOR_SCHEMA_ID,
      layer: 'static',
      source: 'scripts/check-all.ts GATES (TypeScript AST)',
      revision: `gates-sha256:${sha256(text)}`,
      command: COMMAND,
      naReasons: reasons.table(),
      items,
      unresolved,
      details: { coverage }
    },
    'static'
  )
  return { files, denominator }
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
function main() {
  const args = parseArgs(process.argv.slice(2), { check: { type: 'boolean' } })
  const { files, denominator } = build()
  if (args.check === true) {
    const problems = compareOutputs(files, denominator, CASES_DIR, DENOMINATOR)
    if (problems.length > 0) {
      process.stderr.write(
        `static generate --check: out of date (run ${COMMAND}):\n  ${problems.join('\n  ')}\n`
      )
      process.exit(1)
    }
    process.stdout.write(`static generate --check: ${files.size} cases and denominator are current\n`)
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
  process.stdout.write(`static generate: wrote ${files.size} cases and denominator.json\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`static generate: ${error.message}\n`)
    process.exit(error instanceof UsageError ? 2 : 1)
  }
}
