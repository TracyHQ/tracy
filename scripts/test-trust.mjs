#!/usr/bin/env node
/**
 * Test trust: measure which test files go red when the product code they guard is broken.
 *
 *   node scripts/test-trust.mjs --cohort <name> [--verify] --out <dir>
 *   node scripts/test-trust.mjs --cohort <name> --check-receipt <run dir>
 *
 * A cohort (`scripts/test-trust-<name>.json`) names test files and mutants. A mutant is one recorded,
 * exact text replacement in one product file (the convention of `tests/qa/layers/api/red.mjs`).
 * Everything a test run may load is copied into a scratch tree under `--out`, at its repo-relative
 * place; the worktree is only read. What is copied, and nothing else:
 *   - each test file and what it reaches through literal relative imports;
 *   - the targets a cohort declares for a file with a computed import (`computedImports`); a
 *     computed import with no declared targets is refused;
 *   - the packages those files import: the folder node resolves each to, and the folders of its
 *     dependencies, with the links between them rebuilt inside the scratch tree;
 *   - the files a cohort declares as read through the filesystem (`assets`: SQL migrations, locale
 *     tables), a folder being its whole content;
 *   - the `package.json` of every folder above any of them.
 * A file a run needs and none of these names is absent from the scratch tree, so the control run
 * fails instead of reading something unrecorded. Every test file runs on its own: on the untouched
 * copy (control), on each mutant, and on the copy after the last mutant is taken out (restored).
 * The environment of a run is an explicit list; `TEST_DATABASE_URL` is on it only for a cohort that
 * declares `"database": "postgres"`, and then it names a database created empty for that one run on
 * the caller's server and dropped after it, never the caller's own database.
 *
 * A cell of the table (test file x mutant) is one of:
 *   killed               a test that passed in control fails on the mutant with an assertion error
 *   covered-survived     the file stays green and V8 coverage of that run shows the mutated text ran
 *   not-covered          the file stays green and coverage shows the mutated text did not run
 *   unknown              the file stays green and coverage of the run could not be read
 *   equivalent-reviewed  covered-survived, and the cohort carries a written argument that the mutant
 *                        cannot change behaviour
 *   inconclusive         anything else: a load failure, a timeout, a signal, incomplete TAP, a
 *                        changed test set, a new skip/todo, a failure that is not an assertion, a
 *                        any run of a file whose control skipped tests. Never counted as a kill.
 *   not-measured         the run did not happen: the mutant did not apply, the budget was used up,
 *                        or the measurement was invalid before it
 *
 * `--verify` additionally fails unless: control and restored are green with the same tests and the
 * same pass/skip/todo counts, every mutant applied, no cell is inconclusive or not measured, every
 * `expect.killedBy` of the cohort holds and names a file the unit-layer oracle maps to the mutated
 * source, the recorded inputs are the same when the run ends, and the runner time (everything
 * the tool did, not only the test processes) is within the cohort's budget. The budget also bounds the run itself: no run (control, mutant or restored)
 * starts once it is spent, a run is cut at what is left of it, and a mutant run that would eat
 * into what the restored pass needs is not started.
 *
 * `result.json` is a receipt bound to its inputs, all listed by one function (`measuredInputs`): the
 * cohort file, the runtime (node version, platform, arch), this tool's own modules, the test and
 * source files, the assets, the copied manifests, the packages (what each import resolves to, the
 * links, every byte copied, the files that configure the install), the environment passed to a run
 * (as hashes), the database server and what a run's database is created with (an empty copy of template0, checked), each mutant, and the oracle (its modules, the parser files
 * node loaded, the mapping it gave). The run records them, is invalid when they differ at its end,
 * and `--check-receipt` recomputes them and refuses the receipt (exit 1) when any differs.
 *
 * Exit: 0 measured (and verified, with `--verify`); 1 the measurement is invalid or verification
 * failed; 2 usage or cohort error. Nothing here runs on a pull request: it is run on demand.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import Module, { createRequire, isBuiltin } from 'node:module'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { LOAD_FAILURE, parseTap } from '../tests/qa/layers/static/lib/common.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const COHORT_SCHEMA = 'tracy-test-trust-cohort/v1'
export const RESULT_SCHEMA = 'tracy-test-trust-result/v1'
export const COHORT_NAME = /^[a-z0-9][a-z0-9-]{0,40}$/
const MUTANT_ID = /^[a-z0-9][a-z0-9-]{0,60}$/
const TEST_FILE = /\.test\.(?:mjs|cjs|js)$/
const SCRIPT_FILE = /\.(?:mjs|cjs|js)$/
const PACKAGE_SPEC = /^((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)(?:\/.*)?$/i
/** Files that decide what an install puts in `node_modules`; recorded when a cohort imports a package. */
const INSTALL_CONFIG = ['pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc']
const MAX_FILE_BYTES = 4 * 1024 * 1024
/** Data a test reads (a recorded presentation, a catalogue) is larger than any source file. */
const MAX_ASSET_BYTES = 64 * 1024 * 1024
const DEFAULT_TIMEOUT_S = 60
const DEFAULT_BUDGET_S = 120
/** What a child sees of the caller's environment: enough to run node, nothing that steers a test. */
const ENV_PASSED = ['PATH', 'HOME', 'TMPDIR', 'SystemRoot']
const DATABASE_ENV = 'TEST_DATABASE_URL'
const DATABASES = ['postgres']
/** The variables a run of this cohort is given: the fixed list, and the database url if it declares one. */
const envPassed = (cohort) => (cohort.database ? [...ENV_PASSED, DATABASE_ENV] : ENV_PASSED)

/** A cohort, path or argument this tool refuses; the CLI exits 2 on it. */
export class TrustInputError extends Error {}

const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const hashAll = (base, files) =>
  Object.fromEntries(files.map((f) => [f, sha256(readFileSync(join(base, f)))]))

/**
 * Apply a mutant: the text to replace must occur exactly once. Same rule and same hash as
 * `applyMutation`/`mutationHash` of `tests/qa/layers/api/red.mjs`, kept here because that module
 * loads the API layer's harness, whose computed imports this tool could not bind a receipt to.
 */
export function applyMutation(source, mutant) {
  const first = source.indexOf(mutant.find)
  if (first === -1) return { ok: false, why: 'the text to replace is not in the file' }
  if (source.indexOf(mutant.find, first + 1) !== -1)
    return { ok: false, why: 'the text to replace occurs more than once' }
  return {
    ok: true,
    source: source.slice(0, first) + mutant.replace + source.slice(first + mutant.find.length)
  }
}
export const mutationHash = (mutant) => sha256(`${mutant.find}\n=>\n${mutant.replace}`)

/**
 * A repo-relative path of a regular file reached through no symlink, or a `TrustInputError`.
 * @param {string} root - real path of the repository.
 * @param {unknown} rel - the path as a cohort or an import names it.
 * @param {number} [maxBytes] - the largest file accepted.
 * @returns {string} the absolute path.
 */
export function repoFile(root, rel, maxBytes = MAX_FILE_BYTES) {
  if (typeof rel !== 'string' || rel === '' || rel.includes('\0') || rel.includes('\\'))
    throw new TrustInputError(`not a repo-relative path: ${JSON.stringify(rel)}`)
  if (isAbsolute(rel) || posix.normalize(rel) !== rel || rel.split('/').includes('..'))
    throw new TrustInputError(`path must be repo-relative and normalized: ${rel}`)
  const abs = join(root, rel)
  let stat
  try {
    stat = lstatSync(abs)
  } catch {
    throw new TrustInputError(`no such file: ${rel}`)
  }
  if (!stat.isFile()) throw new TrustInputError(`not a regular file: ${rel}`)
  if (stat.size > maxBytes) throw new TrustInputError(`file too large: ${rel}`)
  if (realpathSync(abs) !== abs) throw new TrustInputError(`path goes through a symlink: ${rel}`)
  return abs
}

/**
 * Validate a parsed cohort. Content is trusted (the repository owns it); shape and paths are not.
 * @param {string} root - real path of the repository.
 * @param {unknown} raw - the parsed JSON.
 * @param {string} name - the cohort name the caller asked for.
 * @returns {object} the cohort with defaults filled in.
 */
export function validateCohort(root, raw, name) {
  const bad = (why) => new TrustInputError(`cohort ${name}: ${why}`)
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw bad('not an object')
  if (raw.schema !== COHORT_SCHEMA) throw bad(`schema must be ${COHORT_SCHEMA}`)
  if (raw.cohort !== name) throw bad(`names itself ${JSON.stringify(raw.cohort)}`)
  const seconds = (key, fallback) => {
    const v = raw[key] ?? fallback
    if (!Number.isInteger(v) || v < 1 || v > 3600) throw bad(`${key} must be 1..3600 seconds`)
    return v
  }
  const budgetSeconds = seconds('budgetSeconds', DEFAULT_BUDGET_S)
  const timeoutSeconds = seconds('timeoutSeconds', DEFAULT_TIMEOUT_S)
  if (!Array.isArray(raw.tests) || raw.tests.length === 0) throw bad('tests must be a non-empty list')
  if (new Set(raw.tests).size !== raw.tests.length) throw bad('a test file is listed twice')
  for (const test of raw.tests) {
    repoFile(root, test)
    if (!TEST_FILE.test(test)) throw bad(`${test} is not a node:test file (.test.mjs/.cjs/.js)`)
  }
  if (!Array.isArray(raw.mutants) || raw.mutants.length === 0) throw bad('mutants must be a non-empty list')
  const ids = new Set()
  const mutants = raw.mutants.map((m) => {
    if (m === null || typeof m !== 'object') throw bad('a mutant is not an object')
    if (typeof m.id !== 'string' || !MUTANT_ID.test(m.id) || ids.has(m.id))
      throw bad(`mutant id ${JSON.stringify(m.id)} is invalid or repeated`)
    ids.add(m.id)
    if (typeof m.description !== 'string' || m.description.trim() === '')
      throw bad(`mutant ${m.id} has no description`)
    repoFile(root, m.file)
    if (raw.tests.includes(m.file) || TEST_FILE.test(m.file))
      throw bad(`mutant ${m.id} edits a test file: only product code is mutated`)
    if (typeof m.find !== 'string' || m.find === '' || typeof m.replace !== 'string' || m.find === m.replace)
      throw bad(`mutant ${m.id} needs a non-empty find and a different replace`)
    const killedBy = m.expect?.killedBy ?? []
    if (!Array.isArray(killedBy) || killedBy.some((t) => !raw.tests.includes(t)))
      throw bad(`mutant ${m.id} expects a kill by a file outside the cohort's tests`)
    const text = (value, what) => {
      if (value === undefined) return null
      if (typeof value !== 'string' || value.trim() === '') throw bad(`mutant ${m.id}: ${what} must be text`)
      return value
    }
    if (m.equivalent !== undefined && (m.equivalent === null || typeof m.equivalent !== 'object'))
      throw bad(`mutant ${m.id}: equivalent must be { argument }`)
    return {
      id: m.id,
      description: m.description,
      // What a user or an attacker could do if this defect shipped.
      behaviour: text(m.behaviour, 'behaviour'),
      file: m.file,
      find: m.find,
      replace: m.replace,
      killedBy,
      // A survivor is called equivalent only with a written argument, never by default.
      equivalentArgument: m.equivalent ? text(m.equivalent.argument, 'equivalent.argument') : null
    }
  })
  if (raw.database !== undefined && !DATABASES.includes(raw.database))
    throw bad(`database must be one of: ${DATABASES.join(', ')}`)
  const assets = raw.assets ?? []
  if (
    !Array.isArray(assets) ||
    assets.some((a) => typeof a !== 'string') ||
    new Set(assets).size !== assets.length
  )
    throw bad('assets must be a list of distinct files, or folders written with a trailing "/"')
  expandAssets(root, assets)
  const computedImports = raw.computedImports ?? {}
  if (computedImports === null || typeof computedImports !== 'object' || Array.isArray(computedImports))
    throw bad('computedImports must map a file to the files its computed imports can load')
  for (const [file, targets] of Object.entries(computedImports)) {
    repoFile(root, file)
    if (!Array.isArray(targets) || targets.length === 0)
      throw bad(`computedImports of ${file} must be a non-empty list`)
    for (const target of targets) repoFile(root, target)
  }
  return {
    cohort: name,
    budgetSeconds,
    timeoutSeconds,
    database: raw.database ?? null,
    tests: [...raw.tests],
    assets: [...assets],
    computedImports: Object.fromEntries(Object.entries(computedImports).map(([f, t]) => [f, [...t]])),
    mutants
  }
}

/**
 * The files a cohort declares as read through the filesystem rather than imported. A folder (a
 * path with a trailing "/") stands for every file below it, so a file added to or removed from it
 * changes the list.
 * @param {string} root - real path of the repository.
 * @param {string[]} assets - files, and folders with a trailing "/".
 * @returns {string[]} repo-relative files, sorted.
 */
export function expandAssets(root, assets) {
  const files = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = posix.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else
        files.add(
          relative(root, repoFile(root, rel, MAX_ASSET_BYTES))
            .split(sep)
            .join('/')
        )
    }
  }
  for (const asset of assets) {
    if (!asset.endsWith('/')) {
      repoFile(root, asset, MAX_ASSET_BYTES)
      files.add(asset)
      continue
    }
    const dir = asset.slice(0, -1)
    if (dir === '' || isAbsolute(dir) || posix.normalize(dir) !== dir || dir.split('/').includes('..'))
      throw new TrustInputError(`folder must be repo-relative and normalized: ${asset}`)
    const abs = join(root, dir)
    if (!existsSync(abs) || !lstatSync(abs).isDirectory() || realpathSync(abs) !== abs)
      throw new TrustInputError(`not a folder reached through no symlink: ${asset}`)
    const before = files.size
    walk(dir)
    if (files.size === before) throw new TrustInputError(`folder holds no file: ${asset}`)
  }
  return [...files].sort()
}

/**
 * Read `scripts/test-trust-<name>.json`.
 * @param {string} root - real path of the repository.
 * @param {string} name - cohort name.
 * @returns {{cohort: object, sha256: string}} the validated cohort and the hash of its bytes.
 */
export function loadCohort(root, name) {
  if (typeof name !== 'string' || !COHORT_NAME.test(name))
    throw new TrustInputError(`cohort name must match ${COHORT_NAME}`)
  const bytes = readFileSync(repoFile(root, `scripts/test-trust-${name}.json`))
  let raw
  try {
    raw = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new TrustInputError(`cohort ${name}: not JSON (${error.message})`)
  }
  return { cohort: validateCohort(root, raw, name), sha256: sha256(bytes) }
}

/**
 * What a module's syntax tree imports: literal specifiers, and the lines of imports whose target is
 * computed. Read from the tree, not from text, so a string or a comment is never an import.
 * @param {string} file - name for the parser.
 * @param {string} text - source.
 * @returns {{specs: string[], computed: number[], required: string[]}} what it imports; `required`
 *   are the specifiers reached through `require()`, which node resolves under other conditions.
 */
export function importsOf(file, text) {
  const key = `${file}\0${sha256(text)}`
  if (!parsedImports.has(key)) parsedImports.set(key, parseImports(file, text))
  const { specs, computed, required } = parsedImports.get(key)
  return { specs: [...specs], computed: [...computed], required: [...required] }
}
/** One parse per file content: a cohort's graph is walked once per test file and again per receipt. */
const parsedImports = new Map()
function parseImports(file, text) {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const specs = []
  const computed = []
  const required = []
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      specs.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const arg = node.arguments[0]
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
        specs.push(arg.text)
        if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) required.push(arg.text)
      } else computed.push(tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return { specs, computed, required }
}

/**
 * Every file a file loads, itself included, in the one form this tool can account for: literal
 * relative imports of regular files inside the repository, node builtins, and the packages named
 * in `packages`. Anything else is refused: a computed import, a package not named, a relative
 * import that names no file, one that leaves the repository or crosses a symlink.
 * @param {string} root - real path of the repository.
 * @param {string} entry - repo-relative file.
 * @param {{packages?: string[]}} [o] - packages the caller accounts for itself.
 * @returns {string[]} repo-relative paths, sorted.
 */
export function importClosure(root, entry, { packages = [] } = {}) {
  const seen = new Set([entry])
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()
    const { specs, computed } = importsOf(file, readFileSync(repoFile(root, file), 'utf8'))
    if (computed.length > 0)
      throw new TrustInputError(
        `${file}:${computed[0]} has a computed import: what it loads cannot be recorded`
      )
    for (const spec of specs) {
      if (!spec.startsWith('./') && !spec.startsWith('../')) {
        if (isBuiltin(spec) || packages.includes(spec)) continue
        throw new TrustInputError(
          `${file} imports the package ${JSON.stringify(spec)}: only relative imports and node builtins are measured`
        )
      }
      const target = posix.join(posix.dirname(file), spec)
      if (target.startsWith('../')) throw new TrustInputError(`${file} imports outside the repository`)
      if (seen.has(target)) continue
      repoFile(root, target)
      seen.add(target)
      queue.push(target)
    }
  }
  return [...seen].sort()
}

/**
 * What a cohort's test file loads: the files reached through literal relative imports, the declared
 * targets of a file with a computed import, and the package imports met on the way. A file that is
 * not a script (JSON) is a leaf.
 * @param {string} root - real path of the repository.
 * @param {string} entry - repo-relative file.
 * @param {Record<string, string[]>} [computedImports] - file to the files its computed imports can load.
 * @returns {{files: string[], bare: {file: string, kind: 'import' | 'require', spec: string}[]}} the graph.
 */
export function sourceGraph(root, entry, computedImports = {}) {
  const seen = new Set([entry])
  const queue = [entry]
  const bare = new Map()
  const reach = (target) => {
    if (seen.has(target)) return
    repoFile(root, target)
    seen.add(target)
    queue.push(target)
  }
  while (queue.length > 0) {
    const file = queue.pop()
    if (!SCRIPT_FILE.test(file)) continue
    const { specs, computed, required } = importsOf(file, readFileSync(repoFile(root, file), 'utf8'))
    if (computed.length > 0) {
      const targets = computedImports[file]
      if (targets === undefined)
        throw new TrustInputError(
          `${file}:${computed[0]} has a computed import: what it loads cannot be recorded`
        )
      for (const target of targets) reach(target)
    }
    const count = (list, spec) => list.filter((s) => s === spec).length
    for (const spec of new Set(specs)) {
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const target = posix.join(posix.dirname(file), spec)
        if (target.startsWith('../')) throw new TrustInputError(`${file} imports outside the repository`)
        reach(target)
        continue
      }
      if (isBuiltin(spec)) continue
      if (!PACKAGE_SPEC.test(spec))
        throw new TrustInputError(
          `${file} imports ${JSON.stringify(spec)}: not a relative path, a builtin or a package`
        )
      const kinds = [
        ...(count(required, spec) > 0 ? ['require'] : []),
        ...(count(specs, spec) > count(required, spec) ? ['import'] : [])
      ]
      for (const kind of kinds) bare.set(`${file} ${kind} ${spec}`, { file, kind, spec })
    }
  }
  return { files: [...seen].sort(), bare: [...bare.keys()].sort().map((key) => bare.get(key)) }
}

const toPosix = (path) => path.split(sep).join('/')

/**
 * Where node finds a package from a folder: the first `node_modules/<name>` going up, inside the
 * repository. pnpm puts a symlink there; the folder it points to is the package.
 * @returns {{link: string, real: string, symlink: boolean} | null} repo-relative paths, or null.
 */
function locatePackage(repo, fromDir, name) {
  for (const dir of ancestors(posix.join(fromDir, 'x'))) {
    if (posix.basename(dir) === 'node_modules') continue
    const link = posix.join(dir, 'node_modules', name)
    let stat
    try {
      stat = lstatSync(join(repo, link))
    } catch {
      continue
    }
    const real = realpathSync(join(repo, link))
    if (!real.startsWith(repo + sep))
      throw new TrustInputError(`${link} resolves outside the repository: it cannot be copied`)
    return { link, real: toPosix(relative(repo, real)), symlink: stat.isSymbolicLink() }
  }
  return null
}

/** Regular files of a package folder, without what is installed below it. */
function packageFiles(repo, dir) {
  const files = []
  const walk = (rel) => {
    for (const entry of readdirSync(join(repo, rel), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const child = posix.join(rel, entry.name)
      if (entry.isDirectory()) walk(child)
      else if (entry.isFile()) files.push(child)
    }
  }
  walk(dir)
  return files
}

/**
 * Run in a child node: resolve each specifier from its importer exactly as node does for an
 * `import` or a `require()` (the two read different `exports` conditions).
 */
const RESOLVER = `
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
let text = ''
for await (const chunk of process.stdin) text += chunk
const out = JSON.parse(text).map(({ importer, kind, spec }) => {
  try {
    return realpathSync(
      kind === 'require'
        ? createRequire(importer).resolve(spec)
        : fileURLToPath(import.meta.resolve(spec, pathToFileURL(importer)))
    )
  } catch (error) {
    return null
  }
})
process.stdout.write(JSON.stringify(out))
`

/**
 * The packages a set of source files imports, as node resolves them in the worktree: the file each
 * import lands on, every package folder reachable through declared dependencies, the links between
 * them, and each file of those folders. Dependencies are followed from the manifests; a dependency
 * that is declared and not installed (an optional one for another platform) is recorded as absent.
 * @param {string} repo - real path of the repository.
 * @param {{file: string, kind: string, spec: string}[]} bare - package imports of the source files.
 * @returns {{resolved: Record<string, string>, links: Record<string, string>, symlinks: [string, string][], files: string[]}} the packages.
 */
export function packageGraph(repo, bare) {
  const links = {}
  const symlinks = new Map()
  const dirs = new Set()
  const queue = []
  const follow = (fromDir, name, why) => {
    const found = locatePackage(repo, fromDir, name)
    if (found === null) return null
    links[found.link] = found.real
    if (found.symlink) symlinks.set(found.link, found.real)
    if (!dirs.has(found.real)) {
      if (!existsSync(join(repo, found.real, 'package.json')))
        throw new TrustInputError(`${found.real} (${why}) has no package.json`)
      dirs.add(found.real)
      queue.push(found.real)
    }
    return found
  }
  for (const { file, spec } of bare) {
    const name = PACKAGE_SPEC.exec(spec)[1]
    if (follow(posix.dirname(file), name, `imported by ${file}`) === null)
      throw new TrustInputError(`${file} imports the package ${JSON.stringify(spec)}, which is not installed`)
  }
  while (queue.length > 0) {
    const dir = queue.pop()
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(repo, dir, 'package.json'), 'utf8'))
    } catch (error) {
      throw new TrustInputError(`${dir}/package.json is not JSON (${error.message})`)
    }
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'])
      for (const name of Object.keys(manifest?.[field] ?? {}))
        if (follow(dir, name, `dependency of ${dir}`) === null)
          links[posix.join(dir, 'node_modules', name)] ??= 'absent'
  }
  const files = [...dirs].flatMap((dir) => packageFiles(repo, dir)).sort()
  const resolved = {}
  if (bare.length > 0) {
    const child = spawnSync(
      process.execPath,
      ['--no-warnings', '--experimental-import-meta-resolve', '--input-type=module', '-e', RESOLVER],
      {
        input: JSON.stringify(bare.map((b) => ({ ...b, importer: join(repo, b.file) }))),
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 60_000,
        env: Object.fromEntries(
          ENV_PASSED.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]])
        )
      }
    )
    let answers
    try {
      answers = JSON.parse(child.stdout)
    } catch {
      throw new Error(`the resolver did not answer (exit ${child.status}): ${child.stderr}`)
    }
    const known = new Set(files)
    bare.forEach(({ file, kind, spec }, i) => {
      const target = typeof answers[i] === 'string' ? toPosix(relative(repo, answers[i])) : null
      if (target === null)
        throw new TrustInputError(`${file}: ${kind} of ${JSON.stringify(spec)} does not resolve`)
      if (!known.has(target))
        throw new TrustInputError(
          `${file}: ${kind} of ${JSON.stringify(spec)} resolves to ${target}, outside the recorded packages`
        )
      resolved[`${file} ${kind} ${spec}`] = target
    })
  }
  return { resolved, links, symlinks: [...symlinks.entries()].sort(), files }
}

const TOOL_ENTRY = 'scripts/test-trust.mjs'
const ORACLE_ENTRY = 'tests/qa/layers/unit/lib/sources.mjs'
const PARSER = 'typescript'

/**
 * The parser files node loaded for this process, by content: the package's entry module and every
 * module it required, read from node's own module cache rather than guessed from a version, plus
 * the manifest that chose the entry. Keys are paths below `node_modules`.
 * @param {string} from - a file of the repository the parser is resolved from.
 * @returns {Record<string, string>} path to sha256.
 */
function loadedParser(from) {
  const require = createRequire(from)
  const entry = Module._cache[require.resolve(PARSER)]
  if (entry === undefined)
    throw new Error(`${PARSER} is not in the module cache: its bytes cannot be recorded`)
  const key = (path) =>
    `node_modules/${path
      .split(/[\\/]node_modules[\\/]/)
      .pop()
      .replaceAll('\\', '/')}`
  const files = {
    [key(require.resolve(`${PARSER}/package.json`))]: sha256(
      readFileSync(require.resolve(`${PARSER}/package.json`))
    )
  }
  const walk = (module) => {
    if (files[key(module.filename)] !== undefined) return
    files[key(module.filename)] = sha256(readFileSync(module.filename))
    for (const child of module.children) walk(child)
  }
  walk(entry)
  return files
}

/** This tool's own modules and the parser it reads imports with: they decide every verdict. */
function toolFiles() {
  const home = realpathSync(REPO)
  return {
    ...hashAll(home, importClosure(home, TOOL_ENTRY, { packages: [PARSER] })),
    ...loadedParser(join(home, TOOL_ENTRY))
  }
}

/**
 * The unit-layer inventory oracle (`productSourcesOf`): the one place the mapping from a test file
 * to the product files it guards lives. `fingerprint` names, by content, everything that decides a
 * mapping besides the test's own files: the oracle module with all it imports, and the parser files
 * node loaded for it.
 */
export const inventoryOracle = Object.freeze({
  id: `${ORACLE_ENTRY}#productSourcesOf`,
  fingerprint() {
    const home = realpathSync(REPO)
    return {
      ...hashAll(home, importClosure(home, ORACLE_ENTRY, { packages: [PARSER] })),
      ...loadedParser(join(home, ORACLE_ENTRY))
    }
  },
  async guards(root, test) {
    const { productSourcesOf } = await import('../tests/qa/layers/unit/lib/sources.mjs')
    const { sources } = productSourcesOf([test], { root })
    return [...new Set(sources.map((s) => s.replace(/:\d+$/, '')))].sort()
  }
})

/** Every ancestor directory of a repo-relative file, nearest first, ending with '.'. */
function ancestors(file) {
  const dirs = []
  for (let dir = posix.dirname(file); ; dir = posix.dirname(dir)) {
    dirs.push(dir)
    if (dir === '.') return dirs
  }
}

/**
 * The files of a cohort, which are exactly the files of its scratch tree: each test's source graph,
 * the declared assets, the packages those sources import, and the `package.json` of every folder
 * above a source or an asset (node reads those to decide how a file loads).
 */
function cohortFiles(repo, cohort) {
  const graphs = cohort.tests.map((t) => sourceGraph(repo, t, cohort.computedImports))
  const closures = new Map(cohort.tests.map((t, i) => [t, graphs[i].files]))
  const files = [...new Set(graphs.flatMap((g) => g.files))].sort()
  const bare = new Map(graphs.flatMap((g) => g.bare).map((b) => [`${b.file} ${b.kind} ${b.spec}`, b]))
  const packages = packageGraph(
    repo,
    [...bare.keys()].sort().map((key) => bare.get(key))
  )
  const assets = expandAssets(repo, cohort.assets).filter((a) => !files.includes(a))
  const manifests = [...new Set([...files, ...assets].flatMap(ancestors))]
    .map((dir) => posix.join(dir, 'package.json'))
    .filter(
      (manifest) =>
        existsSync(join(repo, manifest)) && !files.includes(manifest) && !assets.includes(manifest)
    )
    .sort()
  for (const manifest of manifests) repoFile(repo, manifest)
  const overlap = packages.files.filter(
    (f) => files.includes(f) || assets.includes(f) || manifests.includes(f)
  )
  // A workspace package whose files are also reached by a relative import: one copy, recorded once.
  packages.files = packages.files.filter((f) => !overlap.includes(f))
  return {
    closures,
    files,
    sources: files.filter((f) => !cohort.tests.includes(f)),
    assets,
    manifests,
    packages
  }
}

const fileBytesHash = (file) => sha256(readFileSync(file))

/**
 * What a run is given of the caller's environment, as hashes: a value that changes, appears or goes
 * is a difference, and no value (a database password) is written into a receipt.
 */
function environmentOf(cohort, env) {
  return Object.fromEntries(
    envPassed(cohort).map((key) => [key, env[key] === undefined ? 'unset' : `sha256:${sha256(env[key])}`])
  )
}

/** The `pg` a cohort's own tests resolve, so the tool carries no second driver. */
function pgOf(repo, cohort) {
  const found = cohort.tests.map((t) => locatePackage(repo, posix.dirname(t), 'pg')).find(Boolean)
  if (!found) throw new TrustInputError('the cohort declares a database but no test file can resolve "pg"')
  return createRequire(join(repo, found.real, 'package.json'))(join(repo, found.real))
}

async function withClient(pg, url, fn) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 })
  client.on('error', () => {})
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => {})
  }
}

/**
 * PostgreSQL gives every object created after `initdb` an oid from 16384 up; what ships with the
 * server sits below. Counting those oids across the catalogs is how "this database holds nothing
 * but PostgreSQL's own" is decided, whatever kind of object it is.
 */
const FIRST_USER_OID = 16384
const CATALOGS = [
  'pg_class',
  'pg_type',
  'pg_proc',
  'pg_namespace',
  'pg_extension',
  'pg_policy',
  'pg_trigger',
  'pg_rewrite',
  'pg_constraint',
  'pg_attrdef',
  'pg_operator',
  'pg_opclass',
  'pg_opfamily',
  'pg_am',
  'pg_cast',
  'pg_collation',
  'pg_conversion',
  'pg_language',
  'pg_transform',
  'pg_event_trigger',
  'pg_ts_config',
  'pg_ts_dict',
  'pg_foreign_data_wrapper',
  'pg_foreign_server',
  'pg_publication',
  'pg_statistic_ext',
  'pg_default_acl',
  'pg_largeobject_metadata'
]
const USER_OBJECTS_SQL = `select (${CATALOGS.map(
  (catalog) => `(select count(*) from ${catalog} where oid >= ${FIRST_USER_OID})`
).join(' + ')})::int as objects`

/** What a database is created with, read inside it: these decide how SQL and comparisons behave. */
const SETTINGS_SQL = `
  select pg_encoding_to_char(d.encoding) as encoding,
         d.datcollate as collate,
         d.datctype as ctype,
         coalesce(to_jsonb(d) ->> 'datlocprovider', '') as "localeProvider",
         current_setting('TimeZone') as "timeZone",
         current_setting('DateStyle') as "dateStyle",
         current_setting('IntervalStyle') as "intervalStyle",
         current_setting('search_path') as "searchPath",
         current_setting('standard_conforming_strings') as "standardConformingStrings",
         current_setting('default_transaction_isolation') as "transactionIsolation"
    from pg_database d where d.datname = current_database()`

/**
 * The whole `pg_database` row of the connected database, whatever columns this server version has
 * (encoding, collation, locale provider and rules, collation version, tablespace, connection
 * limit…), without the four that name the database or count transactions.
 */
const DATABASE_ROW_SQL = `
  select to_jsonb(d) - 'oid' - 'datname' - 'datfrozenxid' - 'datminmxid' as attributes
    from pg_database d where d.datname = current_database()`

/** Every setting a session may change, as this database starts a session with them. */
const SESSION_SQL = `
  select count(*)::int as settings,
         md5(string_agg(name || '=' || coalesce(setting, ''), E'\\n' order by name)) as digest
    from pg_settings where context in ('user', 'superuser') and name <> 'application_name'`

/** What a database starts as, read inside it: its objects, its attributes, its sessions' settings. */
async function startingState(client) {
  const session = (await client.query(SESSION_SQL)).rows[0]
  return {
    objects: await userObjects(client),
    attributes: { ...(await client.query(DATABASE_ROW_SQL)).rows[0].attributes },
    settings: { ...(await client.query(SETTINGS_SQL)).rows[0] },
    session: `${session.settings} md5:${session.digest}`
  }
}

/**
 * The definition of every object a run created, one per line: relations with their row security,
 * columns with defaults, views, indexes, constraints, triggers, rules, policies, routines, types,
 * extensions, schemas, sequences. TOAST relations are left out: their names carry an oid, which
 * differs between two identical databases. A kind this list does not describe still changes the
 * object count read beside it.
 */
const SCHEMA_SQL = `
  with rel as (
    select c.* from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.oid >= ${FIRST_USER_OID} and n.nspname !~ '^pg_(toast|temp)'
  )
  select coalesce(string_agg(line, E'\\n' order by line), '') as text from (
    select 'relation ' || c.oid::regclass::text || ' ' || c.relkind::text || ' ' || c.relpersistence::text ||
           ' rls=' || c.relrowsecurity::text || ' force=' || c.relforcerowsecurity::text || ' ' ||
           coalesce(array_to_string(c.reloptions, ','), '') as line
      from rel c
    union all
    select 'column ' || a.attrelid::regclass::text || '.' || a.attname || ' ' ||
           format_type(a.atttypid, a.atttypmod) || ' notnull=' || a.attnotnull::text || ' identity=' ||
           a.attidentity::text || ' generated=' || a.attgenerated::text || ' default=' ||
           coalesce(pg_get_expr(d.adbin, d.adrelid), '')
      from pg_attribute a join rel c on c.oid = a.attrelid
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attnum > 0 and not a.attisdropped
    union all
    select 'view ' || c.oid::regclass::text || ' ' || pg_get_viewdef(c.oid) from rel c where c.relkind in ('v', 'm')
    union all
    select 'index ' || pg_get_indexdef(i.indexrelid) from pg_index i join rel c on c.oid = i.indexrelid
    union all
    select 'constraint ' || coalesce(nullif(conrelid, 0)::regclass::text, contypid::regtype::text) || ' ' ||
           conname || ' ' || pg_get_constraintdef(oid)
      from pg_constraint where oid >= ${FIRST_USER_OID}
    union all
    select 'trigger ' || pg_get_triggerdef(oid) from pg_trigger where oid >= ${FIRST_USER_OID} and not tgisinternal
    union all
    select 'rule ' || pg_get_ruledef(oid) from pg_rewrite where oid >= ${FIRST_USER_OID} and rulename <> '_RETURN'
    union all
    select 'policy ' || polrelid::regclass::text || ' ' || polname || ' ' || polcmd::text || ' permissive=' ||
           polpermissive::text || ' roles=' || polroles::text || ' using=' ||
           coalesce(pg_get_expr(polqual, polrelid), '') || ' check=' ||
           coalesce(pg_get_expr(polwithcheck, polrelid), '')
      from pg_policy
    union all
    select 'routine ' || p.oid::regprocedure::text || ' ' || p.prokind::text || ' ' ||
           case when p.prokind in ('f', 'p') then md5(pg_get_functiondef(p.oid)) else md5(p.prosrc) end
      from pg_proc p where p.oid >= ${FIRST_USER_OID}
    union all
    select 'type ' || t.oid::regtype::text || ' ' || t.typtype::text
      from pg_type t where t.oid >= ${FIRST_USER_OID} and t.typtype in ('e', 'd', 'r', 'm')
    union all
    select 'enum ' || enumtypid::regtype::text || ' ' || enumsortorder::text || ' ' || enumlabel from pg_enum
    union all
    select 'extension ' || extname || ' ' || extversion from pg_extension
    union all
    select 'schema ' || nspname from pg_namespace where oid >= ${FIRST_USER_OID}
    union all
    select 'sequence ' || schemaname || '.' || sequencename || ' ' || data_type::text || ' ' ||
           start_value::text || ' ' || increment_by::text
      from pg_sequences
  ) definitions(line)`

const userObjects = async (client) => (await client.query(USER_OBJECTS_SQL)).rows[0].objects

/**
 * What a run left in its database: how many objects it created, their definitions, and which
 * migrations the ledger says were applied (the names in `schema_migration`, the table `migrate()`
 * of `apps/tracy-web/src/db/index.js` skips SQL by).
 */
async function databaseState(client) {
  const objects = await userObjects(client)
  const { rows } = await client.query(SCHEMA_SQL)
  const ledger = (await client.query(`select to_regclass('public.schema_migration') as found`)).rows[0].found
  const names = ledger
    ? (await client.query('select name from public.schema_migration order by name')).rows.map((r) => r.name)
    : null
  return {
    objects,
    schema: `sha256:${sha256(rows[0].text)}`,
    migrations: names === null ? 'none' : `${names.length} sha256:${sha256(names.join('\n'))}`
  }
}

/** A database that is not the one supported starting point; never measured on. */
export class DatabaseNotClean extends Error {}

/**
 * The PostgreSQL a database cohort is measured on. No run is given the caller's database: each run
 * gets one created for it and dropped after it (`fresh`).
 *
 * 🔒 ONE STARTING POINT IS SUPPORTED, AND IT IS CHECKED, NOT RECORDED: a database created from
 * `template0` that holds no object besides PostgreSQL's own. A starting point that is merely hashed
 * into the receipt can be a wrong one consistently: a `schema_migration` ledger copied from a
 * template makes a migrator skip its SQL in control, on every mutant and in restored alike, and the
 * run verifies. So a database with anything in it is refused, whatever the thing is.
 *
 * 🔒 THE TESTS CREATE DATABASES TOO, AND NOT FROM `template0`: `apps/tracy-web/test/_db.mjs` runs a
 * bare `create database`, which copies `template1`. Those are not a second starting point to
 * describe beside the first: `probe` creates one the same bare way and refuses the server unless it
 * starts EXACTLY as the `template0` one does — objects, every attribute of its `pg_database` row,
 * every session setting. One recorded state (`fresh`) then stands for every database a run can
 * meet, and a `template1` that differs in anything, an encoding or a collation included, is a
 * server nothing is measured on.
 */
export const postgresDriver = Object.freeze({
  /**
   * @param {{repo: string, cohort: object, url: string | undefined}} o - the server the caller named.
   * @returns {Promise<object>} `{ reachable: true, server, fresh }` or `{ reachable: false, why }`.
   */
  async probe({ repo, cohort, url }) {
    if (typeof url !== 'string' || url === '') return { reachable: false, why: `${DATABASE_ENV} is not set` }
    const pg = pgOf(repo, cohort)
    let server
    try {
      server = await withClient(pg, url, async (client) => {
        const { rows } = await client.query(
          `select version() as version,
                  (select rolcreatedb from pg_roles where rolname = current_user) as "createDatabase",
                  (select rolsuper from pg_roles where rolname = current_user) as superuser`
        )
        return { ...rows[0] }
      })
    } catch (error) {
      return { reachable: false, why: `the server did not answer (${error?.code ?? 'no error code'})` }
    }
    try {
      const database = await this.fresh({ repo, cohort, url })
      await database.drop()
      // The way the tests' own helper creates a database: no template named.
      const helpers = await this.fresh({ repo, cohort, url, template: null })
      await helpers.drop()
      const differs = inputDrift(helpers.initial, database.initial).filter((key) => key !== 'template')
      if (differs.length > 0)
        return {
          reachable: false,
          why: `a database created with no template named (from template1, as the tests create theirs) does not start as one created from template0: ${differs.join(', ')}`
        }
      return { reachable: true, server, fresh: database.initial }
    } catch (error) {
      return {
        reachable: false,
        why:
          error instanceof DatabaseNotClean
            ? error.message
            : `a clean database cannot be created (${error?.code ?? 'no error code'})`
      }
    }
  },
  /**
   * Create a database and refuse it unless it is empty: from `template0` for a run, with no
   * template named (`template: null`) only for the probe's comparison.
   * @param {{repo: string, cohort: object, url: string, template?: string | null}} o - the server
   *   the caller named, and the template.
   * @returns {Promise<{url: string, initial: object, state: () => Promise<object>, drop: () => Promise<void>}>}
   *   its url, what it was created with, a reader of its state, and its removal.
   */
  async fresh({ repo, cohort, url, template = 'template0' }) {
    const pg = pgOf(repo, cohort)
    const name = `trust_${process.pid}_${randomBytes(6).toString('hex')}`
    await withClient(pg, url, (client) =>
      client.query(
        template === null ? `create database ${name}` : `create database ${name} template ${template}`
      )
    )
    const own = new URL(url)
    own.pathname = `/${name}`
    // Only the database created here, by its generated name.
    const drop = () =>
      withClient(pg, url, (client) => client.query(`drop database if exists ${name} with (force)`)).then(
        () => {},
        () => {}
      )
    try {
      // Read inside THIS database, the one tests use, not the one the caller's url names.
      const initial = {
        template: template ?? 'none named',
        ...(await withClient(pg, own.toString(), startingState))
      }
      if (initial.objects !== 0)
        throw new DatabaseNotClean(
          `a database created ${template === null ? 'with no template named (from template1, as the tests create theirs)' : `from ${template}`} holds ${initial.objects} object(s) that are not PostgreSQL's own`
        )
      return {
        url: own.toString(),
        initial,
        state: () => withClient(pg, own.toString(), databaseState),
        drop
      }
    } catch (error) {
      await drop()
      throw error
    }
  }
})

/**
 * Everything a measurement depends on, in one place. A run writes this into its receipt and is
 * invalid if it differs when the run ends; `checkReceipt` recomputes it and compares all of it.
 * Whatever decides a result must be added HERE, so it cannot be used without being recorded or
 * recorded without being checked.
 * @param {object} o - inputs.
 * @param {string} o.root - repository.
 * @param {object} o.cohort - a validated cohort.
 * @param {string | null} o.cohortSha256 - hash of the cohort file's bytes.
 * @param {object} o.oracle - `{ id, fingerprint(), guards(root, test) }`.
 * @param {Record<string, string | undefined>} [o.env] - the caller's environment.
 * @param {object} [o.databaseDriver] - `{ probe, fresh }` of the database (`postgresDriver`).
 * @returns {Promise<object>} the inputs.
 */
export async function measuredInputs({
  root,
  cohort,
  cohortSha256,
  oracle,
  env = process.env,
  databaseDriver = postgresDriver
}) {
  const repo = realpathSync(root)
  const { sources, assets, manifests, packages } = cohortFiles(repo, cohort)
  const mapping = {}
  for (const test of cohort.tests) mapping[test] = [...(await oracle.guards(repo, test))].sort()
  const imports = Object.keys(packages.resolved).length > 0
  return {
    cohort: { name: cohort.cohort, sha256: cohortSha256 },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    tool: toolFiles(),
    tests: hashAll(repo, cohort.tests),
    sources: hashAll(repo, sources),
    assets: hashAll(repo, assets),
    manifests: hashAll(repo, manifests),
    packages: {
      // What each import of a source file lands on, per kind: `import` and `require()` read
      // different conditions of a package's `exports`.
      resolved: packages.resolved,
      // Where node finds each package and each of its dependencies; 'absent' = declared, not installed.
      links: packages.links,
      // Every byte the scratch tree gets of them: a version number stands for none of it.
      files: hashAll(repo, packages.files),
      config: Object.fromEntries(
        (imports ? INSTALL_CONFIG : []).map((file) => [
          file,
          existsSync(join(repo, file)) ? fileBytesHash(join(repo, file)) : 'absent'
        ])
      )
    },
    environment: environmentOf(cohort, env),
    database: cohort.database
      ? // The server, and the state of a database freshly created on it: every run starts from one.
        { kind: cohort.database, ...(await databaseDriver.probe({ repo, cohort, url: env[DATABASE_ENV] })) }
      : null,
    mutants: Object.fromEntries(cohort.mutants.map((m) => [m.id, `${m.file} ${mutationHash(m)}`])),
    oracle: { id: oracle.id, files: oracle.fingerprint(), mapping }
  }
}

/** Leaves of a nested value as `a/b/c` to JSON text; a value that is no object is one leaf. */
function leaves(value, prefix = '', out = new Map()) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0 && prefix !== '') out.set(prefix, '{}')
    for (const key of keys) leaves(value[key], prefix === '' ? key : `${prefix}/${key}`, out)
  } else out.set(prefix, JSON.stringify(value) ?? 'undefined')
  return out
}

/**
 * Where two sets of inputs differ.
 * @param {unknown} recorded - inputs as a receipt holds them (not trusted).
 * @param {object} now - inputs computed today.
 * @returns {string[]} the differing entries, sorted; empty when they are the same.
 */
export function inputDrift(recorded, now) {
  const a = leaves(recorded)
  const b = leaves(now)
  return [...new Set([...a.keys(), ...b.keys()])].filter((key) => a.get(key) !== b.get(key)).sort()
}

/**
 * Top-level test points of flat `node --test` TAP, in order, with the error code of a failure.
 * @param {string} text - stdout of the run.
 * @returns {{title: string, state: 'ok' | 'not ok' | 'skip' | 'todo', code: string | null}[]} points.
 */
export function tapPoints(text) {
  const points = []
  let open = null
  for (const line of text.split('\n')) {
    const m = /^(not ok|ok) \d+ - (.*)$/.exec(line)
    if (m !== null) {
      const directive = /\s#\s*(SKIP|TODO)\b.*$/i.exec(m[2])
      const state = directive ? directive[1].toLowerCase() : m[1]
      open = { title: directive ? m[2].slice(0, directive.index) : m[2], state, code: null }
      points.push(open)
      continue
    }
    if (open === null) continue
    if (/^ {2}\.\.\.\s*$/.test(line) || /^\S/.test(line)) {
      open = null
      continue
    }
    const code = /^ {2}code: '?([A-Z_0-9]+)'?\s*$/.exec(line)
    if (code !== null && open.code === null) open.code = code[1]
  }
  return points
}

/**
 * Run one test file in the scratch tree, in its own process group, with a bounded time.
 * @param {{cwd: string, test: string, timeoutMs: number, logBase: string, passed: string[], from: object, coverageDir: string}} o -
 *   the run, on this node; `passed` names the variables taken from `from`.
 * @returns {Promise<object>} how it ended and what it printed.
 */
function runTestFile({ cwd, test, timeoutMs, logBase, passed, from, coverageDir }) {
  const env = { FORCE_COLOR: '0', NODE_DISABLE_COLORS: '1', NO_COLOR: '1', NODE_V8_COVERAGE: coverageDir }
  for (const key of passed) if (from[key] !== undefined) env[key] = from[key]
  const started = Date.now()
  return new Promise((done) => {
    const out = []
    const err = []
    let timedOut = false
    let settled = false
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', test], {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal)
      } catch {
        /* already gone */
      }
    }
    child.stdout.on('data', (chunk) => out.push(chunk))
    child.stderr.on('data', (chunk) => err.push(chunk))
    const timer = setTimeout(() => {
      timedOut = true
      killGroup('SIGTERM')
      setTimeout(() => killGroup('SIGKILL'), 2000).unref()
    }, timeoutMs)
    const finish = (status, signal, spawnError) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // The leader can exit while a test's own child still runs: nothing may outlive the run.
      if (child.pid !== undefined) killGroup('SIGKILL')
      const stdout = Buffer.concat(out).toString('utf8')
      const stderr = Buffer.concat(err).toString('utf8') + (spawnError ? `spawn error: ${spawnError}\n` : '')
      mkdirSync(dirname(logBase), { recursive: true })
      writeFileSync(`${logBase}.tap`, stdout)
      writeFileSync(`${logBase}.stderr`, stderr)
      done({
        status,
        signal,
        timedOut,
        spawnFailed: Boolean(spawnError),
        ms: Date.now() - started,
        stdout,
        stderr
      })
    }
    child.on('error', (error) => finish(null, null, error.message))
    child.on('close', (status, signal) => finish(status, signal, null))
  })
}

/** Why a run did not end as a complete, readable test run; '' when it did. */
function incomplete(run, tap) {
  if (run.spawnFailed) return 'the test process could not start'
  if (run.timedOut) return 'the run timed out'
  if (run.signal || !Number.isInteger(run.status))
    return `the run ended on a signal (${run.signal ?? 'no exit status'})`
  if (!tap.valid) return `the TAP output is not a complete run: ${tap.why}`
  return ''
}

/**
 * Whether the text at `offset` of a file ran, read from the V8 coverage every process of one run
 * wrote. The innermost block that holds the offset decides. 'unknown' when no report can be read:
 * a static import is not evidence that code ran, and neither is a missing report.
 * @param {string} coverageDir - the run's `NODE_V8_COVERAGE` folder.
 * @param {string} url - `file:` url of the mutated file as the run loaded it.
 * @param {number} offset - UTF-16 offset of the first changed character.
 * @returns {'covered' | 'not-covered' | 'unknown'} what the reports say.
 */
export function reachability(coverageDir, url, offset) {
  let names
  try {
    names = readdirSync(coverageDir).filter((name) => name.endsWith('.json'))
  } catch {
    return 'unknown'
  }
  if (names.length === 0) return 'unknown'
  let hit = false
  for (const name of names) {
    let report
    try {
      report = JSON.parse(readFileSync(join(coverageDir, name), 'utf8'))
    } catch {
      return 'unknown'
    }
    if (!Array.isArray(report?.result)) return 'unknown'
    for (const script of report.result) {
      if (script?.url !== url) continue
      let inner = null
      for (const fn of script.functions ?? [])
        for (const range of fn.ranges ?? [])
          if (
            range.startOffset <= offset &&
            offset < range.endOffset &&
            (inner === null || range.endOffset - range.startOffset < inner.endOffset - inner.startOffset)
          )
            inner = range
      if (inner !== null && inner.count > 0) hit = true
    }
  }
  return hit ? 'covered' : 'not-covered'
}

/** Offset of the first character a mutant changes in the mutated text. */
function changedOffset(source, mutant) {
  let same = 0
  while (
    same < mutant.find.length &&
    same < mutant.replace.length &&
    mutant.find[same] === mutant.replace[same]
  )
    same++
  return source.indexOf(mutant.find) + Math.min(same, Math.max(mutant.replace.length - 1, 0))
}

const titlesOf = (points) => points.map((p) => p.title)
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * Read a run on the untouched (or restored) copy. Green means: a complete run, exit 0, no failure.
 * @param {object} run - result of `runTestFile`.
 * @returns {object} the reading.
 */
export function readGreen(run) {
  const tap = parseTap(run.stdout)
  const points = tapPoints(run.stdout)
  const why =
    incomplete(run, tap) ||
    (run.status !== 0 || tap.fail > 0 || tap.cancelled > 0
      ? `not green: exit ${run.status}, ${tap.fail} failed, ${tap.cancelled} cancelled`
      : tap.emptyFiles.length > 0
        ? 'the file registered no test'
        : '')
  return {
    green: why === '',
    why,
    points,
    counts: { tests: tap.tests, pass: tap.pass, fail: tap.fail, skipped: tap.skipped, todo: tap.todo }
  }
}

/**
 * Judge one test file's run on one mutant against its control run.
 * @param {object} control - `readGreen` of the control run.
 * @param {object} run - result of `runTestFile` on the mutant.
 * @param {'covered' | 'not-covered' | 'unknown'} reach - whether the mutated text ran (`reachability`).
 * @returns {{status: string, assertions: string[], reason: string}} the cell.
 */
export function judge(control, run, reach) {
  const cell = (status, reason = '', assertions = []) => ({ status, assertions, reason })
  const tap = parseTap(run.stdout)
  const broken = incomplete(run, tap)
  if (broken) return cell('inconclusive', broken)
  if (run.status !== 0 && LOAD_FAILURE.test(`${run.stdout}\n${run.stderr}`))
    return cell('inconclusive', 'the run failed to load code, which is not an assertion')
  const points = tapPoints(run.stdout)
  if (!sameList(titlesOf(points), titlesOf(control.points)))
    return cell('inconclusive', 'the tests that ran are not the tests of the control run')
  const before = new Map(control.points.map((p, i) => [i, p.state]))
  const newlySkipped = points.filter(
    (p, i) => (p.state === 'skip' || p.state === 'todo') && before.get(i) !== p.state
  )
  if (newlySkipped.length > 0)
    return cell('inconclusive', `a test that ran in control did not run: ${newlySkipped[0].title}`)
  // A file whose control skipped tests (no database, a missing tool) was not measured as a file:
  // what the skipped tests guard never ran. Decided before any verdict, so neither a green run nor
  // a kill by another test of the file lets the file pass with its database tests unmeasured.
  const skipped = control.points.filter((p) => p.state === 'skip' || p.state === 'todo')
  if (skipped.length > 0)
    return cell(
      'inconclusive',
      `${skipped.length} test(s) did not run in control, so this file's run proves nothing: ${skipped[0].title}`
    )
  const failed = points.filter((p, i) => p.state === 'not ok' && before.get(i) === 'ok')
  if (run.status === 0 || failed.length === 0) {
    if (run.status !== 0 || tap.fail > 0)
      return cell('inconclusive', `exit ${run.status} with no failing test that passed in control`)
    return cell(
      reach === 'covered' ? 'covered-survived' : reach === 'not-covered' ? 'not-covered' : 'unknown',
      reach === 'unknown' ? 'coverage of the run could not be read: reachability was not measured' : ''
    )
  }
  const asserted = failed.filter((p) => p.code === 'ERR_ASSERTION')
  if (asserted.length === 0)
    return cell(
      'inconclusive',
      `failed without an assertion error (${failed[0].code ?? 'no error code'}): ${failed[0].title}`
    )
  return cell('killed', '', titlesOf(asserted))
}

/**
 * Copy the cohort's files into a scratch tree at their repo-relative places and rebuild the package
 * links between them. Refused when the scratch tree could reach code that is not in it: a
 * `node_modules` above it, or a link that leaves it.
 */
function buildScratch(root, scratch, files, symlinks) {
  for (let dir = dirname(scratch); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules')))
      throw new TrustInputError(
        `--out is below a folder that has node_modules (${dir}): a run there could load packages that are not recorded`
      )
    if (dirname(dir) === dir) break
  }
  mkdirSync(scratch, { recursive: true })
  for (const file of files) {
    mkdirSync(dirname(join(scratch, file)), { recursive: true })
    copyFileSync(join(root, file), join(scratch, file))
  }
  const home = realpathSync(scratch)
  for (const [link, real] of symlinks) {
    mkdirSync(dirname(join(scratch, link)), { recursive: true })
    symlinkSync(relative(dirname(join(scratch, link)), join(scratch, real)), join(scratch, link))
    if (!existsSync(join(scratch, link)) || !realpathSync(join(scratch, link)).startsWith(home + sep))
      throw new Error(`the scratch link ${link} does not stay inside the scratch tree`)
  }
}

const changedKeys = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k])

/** A directory for one run, created new under `out`; an existing name is never reused. */
function newRunDir(out, cohort) {
  if (typeof out !== 'string' || out === '') throw new TrustInputError('--out needs a directory')
  mkdirSync(out, { recursive: true })
  const base = realpathSync(out)
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
  const dir = join(base, `test-trust-${cohort}-${stamp}-${randomBytes(3).toString('hex')}`)
  mkdirSync(dir)
  return dir
}

const SURVIVED = ['covered-survived', 'unknown']

/** Test files killed by exactly the same non-empty set of mutants: candidates to compare, no more. */
function sameKillSets(result) {
  const groups = new Map()
  for (const test of result.tests) {
    const kills = result.matrix
      .filter((c) => c.test === test && c.status === 'killed')
      .map((c) => c.mutant)
      .sort()
    if (kills.length === 0) continue
    const key = kills.join(' ')
    groups.set(key, [...(groups.get(key) ?? []), test])
  }
  return [...groups.entries()]
    .filter(([, tests]) => tests.length > 1)
    .map(([kills, tests]) => ({ kills: kills.split(' '), tests }))
}

function matrixMarkdown(result) {
  const head = ['mutant', 'file', ...result.tests]
  const rows = result.mutants.map((m) => [
    m.id,
    m.file,
    ...result.tests.map((t) => {
      const c = result.matrix.find((x) => x.mutant === m.id && x.test === t)
      if (!c) return '-'
      return c.status === 'killed' ? `killed (${c.assertions.length})` : c.status
    })
  ])
  const lines = [
    `# Test trust: cohort ${result.cohort}`,
    '',
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
    ...result.mutants
      .filter((m) => m.behaviour)
      .map((m) => `- ${m.id}: ${m.description}. If it shipped: ${m.behaviour}`),
    '',
    '| run | test | exit | tests | pass | fail | skipped | todo | ms |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...result.runs.map(
      (r) =>
        `| ${r.variant} | ${r.test} | ${r.signal ?? r.status} | ${r.counts.tests} | ${r.counts.pass} | ${r.counts.fail} | ${r.counts.skipped} | ${r.counts.todo} | ${r.ms} |`
    ),
    '',
    ...result.matrix
      .filter((c) => c.status === 'killed')
      .flatMap((c) => c.assertions.map((a) => `- ${c.mutant} killed by ${c.test}: ${a}`)),
    ...result.matrix
      .filter((c) => SURVIVED.includes(c.status))
      .map((c) => `- SURVIVOR ${c.mutant} on ${c.test}: ${c.status}`),
    ...result.matrix
      .filter((c) => c.status === 'equivalent-reviewed')
      .map((c) => `- ${c.mutant} on ${c.test}: equivalent-reviewed: ${c.reason}`),
    ...result.matrix
      .filter((c) => c.status === 'inconclusive')
      .map((c) => `- ${c.mutant} inconclusive on ${c.test}: ${c.reason}`),
    ...[...new Set(result.matrix.filter((c) => c.status === 'not-measured').map((c) => c.reason))].map(
      (reason) =>
        `- not measured (${result.matrix.filter((c) => c.status === 'not-measured' && c.reason === reason).length} cells): ${reason}`
    ),
    ...result.mutants
      .filter(
        (m) =>
          m.applied &&
          result.matrix
            .filter((c) => c.mutant === m.id)
            .every((c) => !['killed', 'inconclusive', 'not-measured'].includes(c.status))
      )
      .map((m) => `- NO KILL ${m.id}: every test file of the cohort stayed green`),
    ...sameKillSets(result).map(
      (g) => `- same kill set (duplicate candidates only): ${g.tests.join(', ')} on ${g.kills.join(', ')}`
    ),
    '',
    `runner time ${result.totals.wallMs} ms of a ${result.budgetSeconds} s budget (everything the tool did), of which test processes ${result.totals.processMs} ms`,
    result.valid ? 'measurement: valid' : `measurement: INVALID (${result.invalidReason})`,
    result.verify
      ? `verify: ${result.verify.ok ? 'PASS' : `FAIL\n${result.verify.failures.map((f) => `- ${f}`).join('\n')}`}`
      : 'verify: not requested',
    ''
  ]
  return lines.join('\n')
}

/**
 * Measure one cohort. Writes `result.json`, `matrix.md` and `logs/` into a new directory under
 * `out`; the scratch tree is removed whatever happens.
 * @param {object} o - inputs.
 * @param {string} o.root - repository to read.
 * @param {object} o.cohort - a validated cohort.
 * @param {string} [o.cohortSha256] - hash of the cohort file's bytes.
 * @param {string} o.out - directory that receives the run directory.
 * @param {boolean} [o.verify] - also check the acceptance rules.
 * @param {object} [o.oracle] - maps a test file to product files and names its own bytes (`inventoryOracle`).
 * @param {Record<string, string | undefined>} [o.env] - the caller's environment.
 * @param {object} [o.databaseDriver] - `{ probe, fresh }` of the database (`postgresDriver`).
 * @returns {Promise<{dir: string, result: object}>} where the run is and what it found.
 */
export async function runCohort({
  root,
  cohort,
  cohortSha256 = null,
  out,
  verify = false,
  oracle = inventoryOracle,
  env = process.env,
  databaseDriver = postgresDriver
}) {
  const wallStart = Date.now()
  const repo = realpathSync(root)
  const { closures, files, sources, assets, manifests, packages } = cohortFiles(repo, cohort)
  const inputsNow = () => measuredInputs({ root: repo, cohort, cohortSha256, oracle, env, databaseDriver })
  // Recorded before anything is judged, compared again when the run ends.
  const inputs = await inputsNow()
  // Reading the inputs again when the run ends costs what it cost now: kept back from the budget.
  const closingMs = Date.now() - wallStart
  const dir = newRunDir(out, cohort.cohort)
  const scratch = join(dir, 'scratch')
  const coverage = join(dir, 'coverage')
  const timeoutMs = cohort.timeoutSeconds * 1000
  const budgetMs = cohort.budgetSeconds * 1000
  const result = {
    schema: RESULT_SCHEMA,
    cohort: cohort.cohort,
    startedAt: new Date(wallStart).toISOString(),
    budgetSeconds: cohort.budgetSeconds,
    tests: cohort.tests,
    inputs,
    valid: false,
    invalidReason: '',
    runs: [],
    mutants: [],
    matrix: [],
    totals: { processMs: 0, wallMs: 0 },
    verify: null
  }
  const failures = []
  const greens = { control: new Map(), restored: new Map() }
  let seq = 0
  // What the restored pass will cost, kept back from the mutants: the control pass measured it.
  let reserveMs = 0
  /**
   * Runner time left of the budget: everything since the tool started counts (hashing inputs,
   * asking the oracle, creating, reading and dropping databases, the test processes), less what the
   * closing read of the inputs will take and what is kept back for the restored pass.
   */
  const left = (reserve = 0) => budgetMs - (Date.now() - wallStart) - closingMs - reserve
  const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const execute = async (variant, test, reserve = 0) => {
    const name = `${String(++seq).padStart(3, '0')}-${variant}`
    const log = `logs/${name}`
    // A database of this run's own, created empty and dropped after: what a run finds never
    // depends on the runs before it.
    const database =
      inputs.database === null ? null : await databaseDriver.fresh({ repo, cohort, url: env[DATABASE_ENV] })
    let run
    let databaseAfter = null
    let databaseError = ''
    try {
      if (database !== null && !sameState(database.initial, inputs.database.fresh))
        throw new Error(
          `the database created for the ${variant} run of ${test} is not the recorded clean database`
        )
      run = await runTestFile({
        cwd: scratch,
        test,
        // Never longer than what is left of the budget: a hanging run cannot spend more than that.
        timeoutMs: Math.min(timeoutMs, left(reserve)),
        logBase: join(dir, log),
        passed: envPassed(cohort),
        from: database === null ? env : { ...env, [DATABASE_ENV]: database.url },
        coverageDir: join(coverage, name)
      })
      // A state that cannot be read is an error of this run, never a value to compare.
      if (database !== null)
        try {
          databaseAfter = await database.state()
        } catch (error) {
          databaseError = `the state of its database could not be read (${error?.code ?? 'no error code'})`
        }
    } finally {
      await database?.drop()
    }
    result.totals.processMs += run.ms
    // The test that ran must be the worktree's bytes: a test edited between runs proves nothing.
    const testSha256 = sha256(readFileSync(join(scratch, test)))
    if (testSha256 !== inputs.tests[test])
      throw new Error(`the scratch copy of ${test} changed during the ${variant} run`)
    return { run, log, testSha256, databaseAfter, databaseError, coverageDir: join(coverage, name) }
  }
  const record = (variant, test, { run, log, testSha256, databaseAfter, databaseError }) => {
    const tap = parseTap(run.stdout)
    result.runs.push({
      variant,
      test,
      status: run.status,
      signal: run.signal,
      timedOut: run.timedOut,
      ms: run.ms,
      counts: { tests: tap.tests, pass: tap.pass, fail: tap.fail, skipped: tap.skipped, todo: tap.todo },
      testSha256,
      // The schema and the applied migrations the run left in its database; null without one.
      databaseAfter,
      ...(databaseError ? { databaseError } : {}),
      log: `${log}.tap`
    })
  }
  const greenPass = async (variant) => {
    for (const test of cohort.tests) {
      // Control and restored are bounded like any run: none starts once the budget is spent.
      if (left() <= 0)
        return `the budget of ${cohort.budgetSeconds} s was used up before the ${variant} run of ${test}`
      const done = await execute(variant, test)
      rmSync(done.coverageDir, { recursive: true, force: true })
      record(variant, test, done)
      const reading = readGreen(done.run)
      greens[variant].set(test, reading)
      if (!reading.green) return `${variant} run of ${test}: ${reading.why}`
      if (done.databaseError) return `${variant} run of ${test}: ${done.databaseError}`
    }
    return ''
  }
  const scratchDrift = (section, list) => changedKeys(section, hashAll(scratch, list))
  try {
    if (inputs.database !== null && !inputs.database.reachable)
      // No database, no measurement: the tests would skip or fail for a reason that is not the code.
      result.invalidReason = `inconclusive: the test database is not reachable (${inputs.database.why})`
    else {
      buildScratch(repo, scratch, [...files, ...assets, ...manifests, ...packages.files], packages.symlinks)
      const before = Date.now()
      result.invalidReason = await greenPass('control')
      reserveMs = Date.now() - before
    }
    if (result.invalidReason === '') {
      for (const mutant of cohort.mutants) {
        const row = {
          id: mutant.id,
          description: mutant.description,
          behaviour: mutant.behaviour,
          file: mutant.file,
          mutationSha256: mutationHash(mutant),
          mutatedFileSha256: null,
          applied: false,
          reason: '',
          guardedBy: [],
          expectKilledBy: mutant.killedBy
        }
        result.mutants.push(row)
        for (const test of cohort.tests)
          if (inputs.oracle.mapping[test].includes(mutant.file)) row.guardedBy.push(test)
        if (!sources.includes(mutant.file)) {
          row.reason = 'no test file of the cohort imports this file'
          continue
        }
        const target = join(scratch, mutant.file)
        const original = readFileSync(target)
        const applied = applyMutation(original.toString('utf8'), mutant)
        if (!applied.ok) {
          row.reason = applied.why
          continue
        }
        row.applied = true
        row.mutatedFileSha256 = sha256(applied.source)
        const url = pathToFileURL(realpathSync(target)).href
        const offset = changedOffset(original.toString('utf8'), mutant)
        writeFileSync(target, applied.source)
        try {
          for (const test of cohort.tests) {
            if (left(reserveMs) <= 0) {
              result.matrix.push({
                mutant: mutant.id,
                test,
                status: 'not-measured',
                assertions: [],
                reason: `the budget of ${cohort.budgetSeconds} s was used up before this run`,
                imported: closures.get(test).includes(mutant.file),
                reachability: 'unknown',
                log: null
              })
              continue
            }
            const done = await execute(mutant.id, test, reserveMs)
            record(mutant.id, test, done)
            const reach = reachability(done.coverageDir, url, offset)
            rmSync(done.coverageDir, { recursive: true, force: true })
            let cell = done.databaseError
              ? { status: 'inconclusive', assertions: [], reason: done.databaseError }
              : judge(greens.control.get(test), done.run, reach)
            if (cell.status === 'covered-survived' && mutant.equivalentArgument !== null)
              cell = { ...cell, status: 'equivalent-reviewed', reason: mutant.equivalentArgument }
            result.matrix.push({
              mutant: mutant.id,
              test,
              ...cell,
              // Static: the file is in the test's import graph. Measured: the mutated text ran.
              imported: closures.get(test).includes(mutant.file),
              reachability: reach,
              log: `${done.log}.tap`
            })
          }
        } finally {
          writeFileSync(target, original)
        }
        const drift = scratchDrift(inputs.sources, sources)
        if (drift.length > 0)
          throw new Error(`scratch sources differ after ${mutant.id}: ${drift.join(', ')}`)
      }
      result.invalidReason = await greenPass('restored')
      // What the runs loaded besides the sources must still be the recorded bytes.
      const drift = [
        ...scratchDrift(inputs.assets, assets),
        ...scratchDrift(inputs.manifests, manifests),
        ...scratchDrift(inputs.packages.files, packages.files)
      ]
      if (drift.length > 0 && result.invalidReason === '')
        result.invalidReason = `scratch copies changed during the run: ${drift.slice(0, 5).join(', ')}`
    }
    result.valid = result.invalidReason === ''
  } finally {
    rmSync(scratch, { recursive: true, force: true })
    rmSync(coverage, { recursive: true, force: true })
  }

  // The table always holds one cell for every test file and mutant, with the reason of a missing run.
  for (const mutant of cohort.mutants) {
    let row = result.mutants.find((m) => m.id === mutant.id)
    if (row === undefined) {
      row = {
        id: mutant.id,
        description: mutant.description,
        behaviour: mutant.behaviour,
        file: mutant.file,
        mutationSha256: mutationHash(mutant),
        mutatedFileSha256: null,
        applied: false,
        reason: `not run: ${result.invalidReason}`,
        guardedBy: cohort.tests.filter((t) => inputs.oracle.mapping[t].includes(mutant.file)),
        expectKilledBy: mutant.killedBy
      }
      result.mutants.push(row)
    }
    for (const test of cohort.tests)
      if (!result.matrix.some((c) => c.mutant === mutant.id && c.test === test))
        result.matrix.push({
          mutant: mutant.id,
          test,
          status: 'not-measured',
          assertions: [],
          reason: row.reason || `not run: ${result.invalidReason}`,
          imported: closures.get(test).includes(mutant.file),
          reachability: 'unknown',
          log: null
        })
  }
  const order = new Map(cohort.mutants.map((m, i) => [m.id, i]))
  result.matrix.sort(
    (a, b) =>
      order.get(a.mutant) - order.get(b.mutant) || cohort.tests.indexOf(a.test) - cohort.tests.indexOf(b.test)
  )
  result.duplicateCandidates = sameKillSets(result)

  // A file, the oracle, its mapping, a package, the environment or the tool that changed while the
  // run went on: the result would be signed with inputs it was not measured with.
  const drifted = inputDrift(inputs, await inputsNow())
  if (drifted.length > 0) {
    result.valid = false
    result.invalidReason = `inputs changed during the run: ${drifted.join(', ')}`
  }
  result.totals.wallMs = Date.now() - wallStart

  if (verify) {
    if (!result.valid) failures.push(result.invalidReason)
    for (const test of result.valid ? cohort.tests : []) {
      const a = greens.control.get(test)
      const b = greens.restored.get(test)
      const same =
        sameList(titlesOf(a.points), titlesOf(b.points)) &&
        a.points.every((p, i) => p.state === b.points[i].state) &&
        JSON.stringify(a.counts) === JSON.stringify(b.counts)
      if (!same) failures.push(`${test}: control and restored runs differ in tests or pass/skip/todo counts`)
      const after = (variant) =>
        result.runs.find((r) => r.variant === variant && r.test === test)?.databaseAfter
      if (!sameState(after('control'), after('restored')))
        failures.push(`${test}: control and restored runs left their databases in different states`)
    }
    for (const row of result.valid ? result.mutants : []) {
      if (!row.applied) failures.push(`mutant ${row.id} did not apply: ${row.reason}`)
      for (const test of row.expectKilledBy) {
        const cell = result.matrix.find((c) => c.mutant === row.id && c.test === test)
        if (cell?.status !== 'killed')
          failures.push(`mutant ${row.id} was expected to be killed by ${test}: ${cell?.status ?? 'no run'}`)
        if (!row.guardedBy.includes(test))
          failures.push(`the unit-layer oracle does not map ${test} to ${row.file} (mutant ${row.id})`)
      }
    }
    for (const cell of result.valid ? result.matrix : []) {
      if (cell.status === 'inconclusive')
        failures.push(`mutant ${cell.mutant} is inconclusive on ${cell.test}: ${cell.reason}`)
      const row = result.mutants.find((m) => m.id === cell.mutant)
      if (cell.status === 'not-measured' && row.applied)
        failures.push(`mutant ${cell.mutant} was not measured on ${cell.test}: ${cell.reason}`)
    }
    if (result.totals.wallMs > budgetMs)
      failures.push(`runner time ${result.totals.wallMs} ms is over the ${cohort.budgetSeconds} s budget`)
    result.verify = { ok: failures.length === 0, failures }
  }
  writeFileSync(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(join(dir, 'matrix.md'), matrixMarkdown(result))
  return { dir, result }
}

/**
 * Whether a recorded result still describes today's tree and runtime: its inputs must be exactly
 * the `measuredInputs` of now. The receipt is read from disk and is not trusted: a malformed one is
 * refused, never thrown on.
 * @param {object} o - inputs.
 * @param {string} o.root - repository.
 * @param {unknown} o.receipt - parsed `result.json`.
 * @param {object} o.cohort - today's validated cohort.
 * @param {string} o.cohortSha256 - hash of today's cohort file.
 * @param {object} [o.oracle] - today's oracle.
 * @param {Record<string, string | undefined>} [o.env] - today's environment.
 * @param {object} [o.databaseDriver] - today's database driver.
 * @returns {Promise<string[]>} reasons the receipt is refused; empty when it is current.
 */
export async function checkReceipt({
  root,
  receipt,
  cohort,
  cohortSha256,
  oracle = inventoryOracle,
  env = process.env,
  databaseDriver = postgresDriver
}) {
  const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  if (!isMap(receipt) || receipt.schema !== RESULT_SCHEMA) return [`not a ${RESULT_SCHEMA} receipt`]
  if (!isMap(receipt.inputs)) return ['the receipt does not record its inputs']
  const why = []
  if (receipt.valid !== true) why.push('the receipt records an invalid measurement')
  const now = await measuredInputs({ root, cohort, cohortSha256, oracle, env, databaseDriver })
  for (const entry of inputDrift(receipt.inputs, now)) why.push(`input changed: ${entry}`)
  return why
}

/** @param {string[]} argv - arguments after the script name. */
export function parseCli(argv) {
  const opts = { cohort: null, out: null, verify: false, checkReceipt: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--verify') opts.verify = true
    else if (arg === '--cohort' || arg === '--out' || arg === '--check-receipt') {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) throw new TrustInputError(`${arg} needs a value`)
      opts[arg === '--check-receipt' ? 'checkReceipt' : arg.slice(2)] = value
    } else throw new TrustInputError(`unknown argument: ${arg}`)
  }
  const measuring = opts.out !== null || opts.verify
  if (opts.cohort === null || (opts.checkReceipt === null ? opts.out === null : measuring))
    throw new TrustInputError(
      'usage: node scripts/test-trust.mjs --cohort <name> ([--verify] --out <dir> | --check-receipt <run dir>)'
    )
  return opts
}

/** `result.json` of a run directory named on the command line: a bounded regular file holding JSON. */
function readReceipt(dir) {
  const file = join(dir, 'result.json')
  let stat
  try {
    stat = lstatSync(file)
  } catch {
    throw new TrustInputError('--check-receipt needs a run directory holding result.json')
  }
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES)
    throw new TrustInputError('result.json is not a regular file of a sane size')
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new TrustInputError('result.json is not JSON')
  }
}

async function main(argv) {
  let dir
  let result
  try {
    const opts = parseCli(argv)
    const root = realpathSync(REPO)
    const { cohort, sha256: cohortSha256 } = loadCohort(root, opts.cohort)
    if (opts.checkReceipt !== null) {
      const why = await checkReceipt({ root, receipt: readReceipt(opts.checkReceipt), cohort, cohortSha256 })
      for (const reason of why) console.error(`test-trust: receipt refused: ${reason}`)
      if (why.length === 0) console.log(`test-trust: the receipt of cohort ${cohort.cohort} is current`)
      return why.length === 0 ? 0 : 1
    }
    ;({ dir, result } = await runCohort({ root, cohort, cohortSha256, out: opts.out, verify: opts.verify }))
  } catch (error) {
    if (!(error instanceof TrustInputError)) throw error
    console.error(`test-trust: ${error.message}`)
    return 2
  }
  console.log(readFileSync(join(dir, 'matrix.md'), 'utf8'))
  console.log(`test-trust: result in ${relative(process.cwd(), dir) || '.'}`)
  if (!result.valid) {
    console.error(`test-trust: the measurement is invalid: ${result.invalidReason}`)
    return 1
  }
  return result.verify && !result.verify.ok ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
