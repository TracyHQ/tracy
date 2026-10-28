/**
 * Select tests for a routine PR into develop. Release PRs and the nightly still run the full suite.
 * A source change selects its owning package's tests and tests of workspace dependents. A changed
 * test without a source change selects that file. Inputs without a reliable owner run the full
 * suite; an unknown path must never look like a docs-only change.
 *
 * Two reviewed exceptions narrow that (REVIEWED_SKILLS and DATA_FILE_TESTS below). Neither is
 * derived: each entry was audited by hand, and `scripts/test/related-tests.test.mjs` fails when the
 * audit stops holding (a test that is not a declared reader starts reading a listed skill tree, or
 * a mapped test or declared reader disappears).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

const WORKER = /^(?:apps\/[^/]+|scripts|packages\/[^/]+\/[^/]+)\/test\/[^/]+\.test\.mjs$/
const INTEROP = /^scripts\/test\/[^/]+\.test\.ts$/

/**
 * OPT-IN INTEGRATION TESTS (16/10/2026, anh David / SRE). A routine pull request into `develop` leaves
 * the workers test files that need a database out of its run unless it carries the label below; the
 * release pull requests, the nightly and manual runs keep running them. The pieces here are shared by
 * the planner (`plan-ci.mjs`, bare node, before `pnpm install`), the gate (`check-tests.ts`) and the
 * Turbo setup, which is why they live in this module and not in any of the three: ONE definition of
 * "this file needs a database" is the point, and this file is already the planner's and the gate's
 * common import (and an input of every Turbo test task).
 */
/** The label that puts the database-backed workers tests back into a pull request into `develop`. */
export const INTEGRATION_LABEL = 'ci:integration'
/** The label that adds the `tests e2e` row to a pull request into `develop`. */
export const E2E_LABEL = 'ci:e2e'
/**
 * The word a test file is classified by: it reads the variable that carries its database. This is
 * the classification `check-tests.ts` has always used to decide whether the run needs a PostgreSQL
 * (`ensureDatabase`); it is a substring on purpose, so a test that names the variable only in a
 * string is "gated" too (a few tooling tests under `scripts/test/` do) and is left out with the rest
 * rather than risking a database test that runs without one.
 */
export const DATABASE_MARK = 'TEST_DATABASE_URL'
/** The environment variable that turns the skip on for a run, Turbo tasks included (`1` or unset). */
export const SKIP_DB_ENV = 'TRACY_TESTS_SKIP_DB'
/** The command-line spelling of the same switch, for a human at a desk. */
export const SKIP_DB_FLAG = '--skip-db-gated'

/** @param {string} text - the source of a test file. */
export const isDatabaseGated = (text) => text.includes(DATABASE_MARK)

/** Is this repo-relative path a `test:workers` file (the group the skip applies to)? */
export const isWorkersFile = (file) => WORKER.test(file)

/**
 * Is the skip asked for? The flag always is; the variable only when it is exactly `1`. Unset, empty
 * and `0` are off, and any other value (`true`, `yes`, ` 1`) is an ERROR, not a guess: reading it as
 * "on" would run fewer tests than the caller meant, reading it as "off" would run a database suite
 * the caller did not want (the same rule `TRACY_PRE_PUSH_POSTGRES` follows).
 *
 * @param {readonly string[]} argv - arguments after the script name.
 * @param {Record<string, string | undefined>} env
 * @returns {{ on: boolean, rest: string[] } | { error: string }} `rest` is the argv without the
 *   flag, for the strict parsers that walk the arguments in pairs.
 */
export function skipDatabaseRequested(argv, env) {
  const raw = env[SKIP_DB_ENV]
  if (raw !== undefined && raw !== '' && raw !== '0' && raw !== '1')
    return { error: `${SKIP_DB_ENV} must be 1, 0 or unset, not ${JSON.stringify(raw)}` }
  const given = argv.filter((a) => a === SKIP_DB_FLAG).length
  if (given > 1) return { error: `${SKIP_DB_FLAG} given more than once` }
  return { on: given === 1 || raw === '1', rest: argv.filter((a) => a !== SKIP_DB_FLAG) }
}

/**
 * Split workers test files into those that run and those the skip leaves out.
 *
 * @param {readonly string[]} files - repo-relative paths.
 * @param {boolean} skip - whether the skip is on; off returns every file untouched.
 * @param {(file: string) => string} read - the text of a file; one that cannot be read is NOT
 *   dropped (a file we could not classify runs).
 * @returns {{ run: string[], dropped: string[] }}
 */
export function splitDatabaseGated(files, skip, read) {
  if (!skip) return { run: [...files], dropped: [] }
  const run = []
  const dropped = []
  for (const file of files) {
    let gated = false
    try {
      gated = isDatabaseGated(read(file))
    } catch {
      gated = false
    }
    ;(gated ? dropped : run).push(file)
  }
  return { run, dropped }
}
const E2E = /^(?:apps\/[^/]+|packages\/[^/]+\/[^/]+)\/test\/e2e\/[^/]+\.test\.mjs$/
const STANDALONE = /^packages\/cms\/tracy-emdash-theme-(?:base|business|saas)\//
const GLOBAL =
  /^(?:\.github\/workflows\/tracy-ci\.yml|\.node-version|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|scripts\/check-(?:all|tests)\.ts|scripts\/ci\/|scripts\/test-timings\.json|vendor\/tracy\/deepseek-harness(?:\/|$))/
const DOCS =
  /^(?:(?:docs|tasks)\/.*\.md$|changes\/[^/]+\.md$|tasks\/(?:bang-chung|evidence)\/|tests\/regression\/|\.github\/pull_request_template\.md$|(?:AGENTS|CLAUDE|CONTEXT|DESIGN|SYSTEM|README)\.md$)/

/**
 * Vendored skill trees whose change runs the `checks` row plus only the tests that read the tree.
 * NOT derived from `NOT_RUN_HERE` in `scripts/check-tests.ts`: that list says the tree's own tests
 * do not run here, not that TCH tests do not depend on the tree. An entry needs an audit of every
 * test folder (apps, scripts, packages, interop, e2e and the three EmDash suites) and names the
 * gate in `checks` that guards the tie to TCH. `readers` are the exact worker test files that read
 * the tree (audited 09/10/2026); a guard test fails when any other test starts to read it, and a
 * reader that no longer exists runs the full suite. Quickstart scripts that import the T4 skill
 * (`packages/cms/tracy-joomla-quickstart/studio-content.mjs` and its dependents) are exercised by
 * no test. `vendor/emdash/` is skipped further down by its own older exception.
 */
export const REVIEWED_SKILLS = [
  {
    prefix: 'vendor/wordpress/tracy-wordpress-theme/',
    reason:
      'its own tests run in the skill home repo; stand-restore.test.mjs reads the quickstart method (scripts/quickstart/restore.mjs and lib.mjs, directly and through tracy-wordpress-quickstart/scripts/stand.mjs, which restores published packs with it); nothing else in the test folders reads the tree (check-tests-environment only lists it as a tree that holds tests)',
    gate: 'check-site-model (plus doc links and self-contained) in the checks row',
    readers: ['packages/cms/tracy-wordpress-quickstart/test/stand-restore.test.mjs']
  },
  {
    prefix: 'vendor/joomla/joomlart-t4-skill/',
    reason:
      'skill-catalog.test.mjs reads skills/joomlart-t4-template/SKILL.md for the catalog; nothing else in the test folders reads the tree',
    gate: 'check-site-model in the checks row',
    readers: ['scripts/test/skill-catalog.test.mjs']
  },
  {
    prefix: 'vendor/emdash/tracy-emdash-skill/',
    reason:
      'no test and none of the three EmDash suites read the tree; it is only mirrored into .claude/skills by the skills mirror script',
    gate: 'check-site-model and check-emdash-kit-sync in the checks row',
    readers: []
  }
]

/**
 * Data files whose consumers are fully known: exact path -> the tests covering every consumer.
 * Used only when every changed file is mapped, a reviewed skill or docs; any other changed file
 * keeps the owner-based selection. Consumers of template-profiles.json (audited 09/10/2026):
 * template-profiles.js is the only importer; fit-questions.js and sites/brief-engines/brand.js
 * import that module; the gate scripts/check-design-templates.ts (checks row) reads it too; no
 * dynamic read of the file exists.
 */
export const DATA_FILE_TESTS = new Map([
  [
    'apps/tracy-web/src/lib/template-profiles.json',
    [
      'apps/tracy-web/test/template-profiles.test.mjs',
      'apps/tracy-web/test/fit-questions.test.mjs',
      'apps/tracy-web/test/brief-brand-joomla.test.mjs',
      'apps/tracy-web/test/brief-brand.test.mjs',
      'apps/tracy-web/test/brief-emdash-brand.test.mjs'
    ]
  ]
])

const isReviewedSkill = (file) => REVIEWED_SKILLS.some((skill) => file.startsWith(skill.prefix))

/**
 * THE TEMPLATE-DATA LANE (12/10/2026). A pull request whose EVERY changed file is template data
 * (the five kinds below, nothing else, no deletion, and never a code file — `.js`/`.mjs`/`.ts`… —
 * even inside a data folder) runs the gates that read that data and the tests
 * that read it, instead of the whole `checks` row and the owner-based test selection. Any other file
 * in the diff — code, a test, a workflow, a gate script, a doc outside the journal — and the normal
 * path runs unchanged. Release pull requests and the nightly still run every row (`plan-ci.mjs`).
 *
 * `reads` finds the modules that read one kind (comments stripped): a test that matches it, or that
 * imports (one relative hop) a module that matches it, is a reader. `gates` are the `check-all.ts`
 * gates that read the kind, audited 12/10/2026 twice: statically (each gate's script and its relative
 * imports name the kind) and by tracing every file a gate process opened during a full
 * `check-all.ts --skip tests --skip lint` run. `scripts/test/ci-template-data-lane.test.mjs` fails
 * when a gate outside a kind's list starts to name that kind, or a listed gate disappears.
 */
const CONTRACT_GATES = [
  'contracts',
  'slot-roles',
  'content-api',
  'design-templates',
  'quickstart-overrides',
  'questions',
  'templates',
  'infra-contracts',
  'joomla-multilingual',
  'joomla-demo-trim',
  'joomla-showcase-nav',
  'wordpress-editions',
  'wordpress-demo-trim',
  'wordpress-showcase-nav',
  'wordpress-superseded',
  'vocabulary'
]
export const TEMPLATE_DATA = [
  {
    kind: 'contracts',
    match: (file) => /^packages\/cms\/[^/]+\/contracts\/./.test(file),
    reads:
      /tracy-(?:joomla|wordpress)-quickstart\/contracts|['"`]\.\.\/contracts['"`/]|['"`]\.\.['"`]\s*,\s*['"`]contracts['"`]/,
    gates: [...CONTRACT_GATES, 'api-spec']
  },
  {
    kind: 'template profiles',
    match: (file) => file === 'apps/tracy-web/src/lib/template-profiles.json',
    reads: /template-profiles\.json/,
    gates: ['design-templates', 'contracts', 'api-spec']
  },
  {
    kind: 'quickstart pins',
    match: (file) => file === 'apps/tracy-web/src/quickstarts.json',
    reads: /quickstarts\.json/,
    gates: [...CONTRACT_GATES, 'api-spec']
  },
  {
    kind: 'journal',
    match: (file) => /^(?:tasks\/nhat-ky|changes)\/[^/]+\.md$/.test(file),
    reads: /nhat-ky|changes\/README\.md/,
    gates: ['vocabulary']
  },
  {
    kind: 'regression cases',
    match: (file) => /^tests\/regression\/./.test(file),
    // Cases and results; a module naming a case script only (an e2e stand) does not read them.
    reads:
      /tests\/regression\/(?:cases|results)|tests\/regression['"`]|regression\/(?:cases|results)|['"`](?:cases|results)['"`]/,
    gates: []
  }
]
/** Gates every template-data run keeps: biome format and the typecheck of JSON imports, and doc pointers. */
// `turbo-config` imports check-tests.ts, so its closure names every data tree, and it simply always
// runs: on a pull request it is `--structure-only` (since 28/10/2026), checking the generated config
// and ignored inputs of every task without tracing a suite; the nightly measures what suites read.
export const TEMPLATE_DATA_ALWAYS = ['lint', 'doc-links', 'turbo-config']

const CODE = /\.[cm]?[jt]sx?$/
/** A code file is never data, even inside a data folder (a regression case script is code). */
const kindOf = (file) => (CODE.test(file) ? null : (TEMPLATE_DATA.find((k) => k.match(file)) ?? null))
const SCANNED = /^(?:apps|packages|scripts|tests\/regression)\//
const EXTENSIONS = ['', '.mjs', '.js', '.ts', '.tsx', '.cjs', '/index.mjs', '/index.js', '/index.ts']
const withoutComments = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line))
    .join('\n')

/** Relative specifiers of a module resolved against the inventory (static, dynamic, require). */
function relativeImports(file, text, present) {
  const out = []
  for (const m of text.matchAll(/(?:from|import|require)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = posix.normalize(posix.join(posix.dirname(file), m[1]))
    const hit = EXTENSIONS.map((ext) => base + ext).find((c) => present.has(c))
    if (hit) out.push(hit)
  }
  return out
}

/**
 * The lane, or null when the diff is not template data only. Throws on a read error; the caller
 * turns that into the full suite.
 */
function templateDataLane(changed, allFiles, readText) {
  const kinds = new Set()
  const present = new Set(allFiles)
  for (const file of changed) {
    const kind = kindOf(file)
    if (!kind) return null
    // A deleted or renamed data file changes what its readers find: the normal path decides.
    if (!present.has(file)) return null
    kinds.add(kind)
  }
  const texts = new Map()
  const textOf = (file) => {
    if (!texts.has(file)) {
      const text = readText(file)
      if (typeof text !== 'string') throw new Error(`cannot read ${file}`)
      texts.set(file, withoutComments(text))
    }
    return texts.get(file)
  }
  const tests = allFiles.filter((f) => WORKER.test(f) || INTEROP.test(f) || E2E.test(f))
  const testSet = new Set(tests)
  const modules = allFiles.filter((f) => SCANNED.test(f) && CODE.test(f) && !testSet.has(f))
  const readers = new Set()
  for (const kind of kinds) {
    const readingModules = new Set(modules.filter((f) => kind.reads.test(textOf(f))))
    for (const test of tests) {
      const text = textOf(test)
      if (kind.reads.test(text) || relativeImports(test, text, present).some((m) => readingModules.has(m)))
        readers.add(test)
    }
    // The audited consumers of a mapped data file stay selected even two hops away.
    for (const file of changed)
      if (kind.match(file))
        for (const t of DATA_FILE_TESTS.get(file) ?? []) if (present.has(t)) readers.add(t)
  }
  const gates = new Set(TEMPLATE_DATA_ALWAYS)
  for (const kind of kinds) for (const gate of kind.gates) gates.add(gate)
  const workers = allFiles.filter((f) => readers.has(f) && WORKER.test(f))
  return {
    full: false,
    lane: 'template-data',
    workers,
    interop: [...readers].some((f) => INTEROP.test(f)),
    e2e: [...readers].some((f) => E2E.test(f)),
    owners: [],
    covered: [...changed],
    gates: [...gates],
    why: `template data only (${[...kinds].map((k) => k.kind).join(', ')}): ${String(gates.size)} gate(s), ${String(readers.size)} reader test(s)`
  }
}

/**
 * The declared readers of every reviewed skill tree the diff touches, deduplicated. `missing` names
 * a reader that is not a worker test in the inventory: the caller then runs the full suite.
 */
function skillReaders(changed, present) {
  const readers = new Set()
  for (const skill of REVIEWED_SKILLS) {
    if (!changed.some((file) => file.startsWith(skill.prefix))) continue
    for (const test of skill.readers) readers.add(test)
  }
  const missing = [...readers].find((test) => !present.has(test) || !WORKER.test(test))
  return { readers, missing }
}

/**
 * The data-file exception: null unless EVERY changed file is a mapped data file still in the
 * inventory (a rename or delete is not), a reviewed skill or docs. A shared input anywhere in the
 * diff keeps the normal path; a mapped test that no longer exists runs the full suite.
 */
function dataShortcut(changed, allFiles, allWorkers) {
  const present = new Set(allFiles)
  const mapped = [...new Set(changed.filter((file) => DATA_FILE_TESTS.has(file) && present.has(file)))]
  if (mapped.length === 0) return null
  if (changed.some((file) => GLOBAL.test(file))) return null
  if (!changed.every((file) => mapped.includes(file) || isReviewedSkill(file) || DOCS.test(file))) return null
  const { readers, missing } = skillReaders(changed, present)
  if (missing)
    return { full: true, workers: allWorkers, interop: true, why: `skill reader ${missing} is missing` }
  const tests = new Set(readers)
  for (const file of mapped) {
    for (const test of DATA_FILE_TESTS.get(file)) {
      if (!present.has(test) || !WORKER.test(test))
        return { full: true, workers: allWorkers, interop: true, why: `mapped test ${test} is missing` }
      tests.add(test)
    }
  }
  return {
    full: false,
    workers: allWorkers.filter((file) => tests.has(file)),
    interop: false,
    owners: [],
    // The planner must not also select e2e or EmDash rows by the path of a file `workers` covers.
    covered: mapped,
    why: `data file(s) ${mapped.join(', ')} map to ${String(tests.size)} test file(s)`
  }
}

export function ownerOf(file) {
  return /^(apps\/[^/]+|packages\/[^/]+\/[^/]+)\//.exec(file)?.[1] ?? null
}

/** A package-name graph from the manifests in the current tree; unreadable manifests are an error. */
export function workspaceDependencies(root, files) {
  const owners = new Set(files.map(ownerOf).filter(Boolean))
  const names = new Map()
  const manifests = new Map()
  for (const owner of owners) {
    const path = join(root, owner, 'package.json')
    if (!existsSync(path)) {
      // Some source and contract trees have tests but are not workspace packages.
      continue
    }
    const pkg = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof pkg.name !== 'string' || names.has(pkg.name)) throw new Error(`bad workspace name: ${owner}`)
    names.set(pkg.name, owner)
    manifests.set(owner, pkg)
  }
  const out = {}
  for (const [owner, pkg] of manifests) {
    const declared = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies
    }
    out[owner] = Object.keys(declared)
      .filter((name) => names.has(name))
      .map((name) => names.get(name))
  }
  return out
}

/** Reads a tracked file of the repository at `root` (the planner and the gate run at its root). */
export function repoReader(root = process.cwd()) {
  return (file) => readFileSync(join(root, file), 'utf8')
}

/**
 * `full` is a deliberate fallback, never a green empty selection. `workers` are exact paths from
 * the gate's own test inventory; the caller may shard them but must not invent another glob.
 */
export function relatedTests({ changed, allFiles, dependencies = {}, readText }) {
  if (!Array.isArray(changed) || changed.length === 0)
    return { full: true, workers: [], interop: true, why: 'unreadable or empty diff' }
  if (changed.some((file) => typeof file !== 'string'))
    return { full: true, workers: [], interop: true, why: 'invalid changed-file entry' }
  const allWorkers = allFiles.filter((file) => WORKER.test(file))
  // The template-data lane needs to read the tree; a caller that gives no reader keeps today's path.
  if (typeof readText === 'function') {
    try {
      const lane = templateDataLane(changed, allFiles, readText)
      if (lane) return lane
    } catch (error) {
      return {
        full: true,
        workers: allWorkers,
        interop: true,
        why: `template-data lane could not read the tree (${String(error?.message ?? error)})`
      }
    }
  }
  const shortcut = dataShortcut(changed, allFiles, allWorkers)
  if (shortcut) return shortcut
  const { readers, missing } = skillReaders(changed, new Set(allFiles))
  if (missing)
    return { full: true, workers: allWorkers, interop: true, why: `skill reader ${missing} is missing` }
  const direct = new Set()
  const sourceOwners = new Set()
  let codeChanged = false
  for (const file of changed) {
    if (GLOBAL.test(file))
      return { full: true, workers: allWorkers, interop: true, why: `shared input ${file}` }
    if (
      isReviewedSkill(file) ||
      DOCS.test(file) ||
      STANDALONE.test(file) ||
      file.startsWith('vendor/emdash/')
    )
      continue
    if (WORKER.test(file) || INTEROP.test(file) || E2E.test(file)) {
      if (allFiles.includes(file)) direct.add(file)
      else {
        // Deleting a test changes the owner's coverage; run its remaining tests.
        const owner = ownerOf(file)
        if (owner) sourceOwners.add(owner)
        else return { full: true, workers: allWorkers, interop: true, why: `deleted shared test ${file}` }
      }
      continue
    }
    const owner = ownerOf(file)
    if (owner) {
      sourceOwners.add(owner)
      codeChanged = true
      continue
    }
    if (file.startsWith('vendor/tracy/dsh-passwords/')) {
      return { full: true, workers: allWorkers, interop: true, why: 'shared dsh fork' }
    }
    return { full: true, workers: allWorkers, interop: true, why: `unmapped input ${file}` }
  }
  // A workspace dependency's consumers are affected too. Walk transitively, including cycles.
  const affected = new Set(sourceOwners)
  for (let changedCount = -1; changedCount !== affected.size; ) {
    changedCount = affected.size
    for (const [owner, deps] of Object.entries(dependencies)) {
      if (deps.some((dep) => affected.has(dep))) affected.add(owner)
    }
  }
  // Script tests often assert source contracts by path rather than importing a workspace package.
  const workers = allWorkers.filter(
    (file) =>
      direct.has(file) ||
      readers.has(file) ||
      affected.has(ownerOf(file)) ||
      (codeChanged && file.startsWith('scripts/test/'))
  )
  // Interop tests read across package boundaries; all 26 run after a source change.
  const interop = codeChanged || changed.some((file) => INTEROP.test(file))
  return {
    full: false,
    workers,
    interop,
    owners: [...affected].sort(),
    why: `${affected.size} affected workspace owner(s)`
  }
}
