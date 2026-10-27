#!/usr/bin/env node
/**
 * Test quality: the test files a change adds or edits must not add an assertion that cannot fail for
 * a product bug, in the shapes a machine can tell for certain. (12/10/2026)
 *
 * WHY. Reading every test file outside `vendor/` line by line (12/10/2026) found 253 cases in 126
 * files that no product bug can turn red. Most were one of a few shapes, and three of them are plain
 * in the syntax of the assertion alone. This gate refuses those three on the lines a pull request
 * adds; it judges nothing else, and nothing a file already held before the change.
 *
 * THE THREE RULES, each on an assertion of `node:assert` (the default export, `strict`, a named
 * `equal`/`strictEqual`/`deepEqual`/`deepStrictEqual`/`ok`, or the module from `require`):
 *
 *   self-compare     both sides of an equality (or the one value of `ok`) are fixed in the test
 *                    itself: literals, arithmetic and arrays/objects of literals, and `const` names
 *                    of the same file bound to such a value and never mutated. True or false
 *                    whatever the product does.
 *   pinned-constant  one side is a value imported from a module (an `import` binding, or a `const`
 *                    bound to `require(…)`, read through property names and no call), the other is
 *                    fixed in the test as above: the product's constant compared with a copy of
 *                    itself. A change to the constant is a change to the copy, never a caught bug.
 *                    The behaviour that uses the constant is what can fail; so is a comparison with
 *                    the OTHER value it must agree with (a second module's constant, a file it
 *                    must match).
 *   machine-path     a string literal holding a temporary directory of one session on one machine
 *                    (the `claude-<uid>` directory an agent session gets in the system's tmp, or macOS's
 *                    per-user temporary directory under `var/folders`):
 *                    a test that reads it can run there only. A made-up home directory used as input
 *                    (`/Users/a/.local/bin/claude`) is not one, and is not reported.
 *
 * Not judged either way: an assertion inside a callback handed to anything but node:test or an array
 * walk (a test runner's own fixture, `step('x', () => assert.ok(true))`), and a `const` array or
 * object the file passes to a call (the call may change it: `assert.deepEqual(input, {…})` after it
 * checks that it did not).
 *
 * A DELIBERATE CONTRACT is allowed by saying so where it is written: a line comment
 * `// test-quality: contract <why>` on the assertion's first line or on the lines right above it.
 * `<why>` is required: a marker with no reason is itself reported.
 *
 * WHAT IT DOES NOT JUDGE, and stays with review: a regex or `includes` over product source (some are
 * deliberate contracts, and the syntax cannot tell which), a test of a helper defined in the test
 * file, a test of product code nothing imports, two cases asserting the same thing, and whether a
 * test runs at all. `scripts/ci/new-test-proof.mjs` asks the other question — does a new test go red
 * without the change it came with — by running it; this gate runs nothing.
 *
 * ONLY WHAT THE CHANGE ADDS. For every test file the change adds or edits (named `*.test.*` or
 * `*.spec.*`, as every CI suite names its files; never under `vendor/`), the findings of the
 * head version are counted against the findings of the base version (a renamed file's base is its
 * old path), keyed by rule and assertion text. Only the surplus is reported, so editing a line next
 * to an old pin passes, and re-pinning a constant to a new copy does not.
 *
 * THE BASE. `--base <ref>` when given. Otherwise, on a pull request in CI (`GITHUB_EVENT_NAME` is
 * `pull_request`), `HEAD^1`: the checkout is the merge commit and its first parent the base tip
 * (`tracy-ci.yml` checks out two commits). On any other CI event there is no change to judge, and
 * the gate says so and passes. Locally, `git merge-base HEAD origin/develop` (`origin/HEAD` when the
 * clone has no `develop`), against the working
 * tree, uncommitted and untracked test files included. A base that cannot be read, a git failure or
 * a test file that does not parse is red with the reason; never a silent pass.
 *
 * Exit 0 clean, 1 findings or a failure, 2 a bad command line. Content of the change is parsed,
 * never run.
 *
 *   node scripts/check-test-quality.mjs [--base <ref>]
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** A failure of the gate itself: git, the base, a file that does not parse. */
export class GateError extends Error {}

// ── which assertions ──────────────────────────────────────────────────────────────────────────

const ASSERT_MODULES = new Set(['node:assert', 'node:assert/strict', 'assert', 'assert/strict'])
const EQUALITY = new Set(['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual'])
const MUTATORS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'set',
  'delete',
  'add',
  'clear'
])
/** A temporary directory of one session on one machine: an agent session's, or macOS's per-user one. */
const MACHINE_PATH = /(?:\/private)?\/tmp\/claude-\d+\/|(?:\/private)?\/var\/folders\/[^/]+\/[^/]+\/T\//
/** Calls whose callback IS the test: node:test's registrations and the array walks inside a test. */
const TEST_CALLS = new Set([
  'test',
  'it',
  'describe',
  'suite',
  'before',
  'after',
  'beforeEach',
  'afterEach',
  'skip',
  'only',
  'todo'
])
const WALKS = new Set(['forEach', 'map', 'flatMap', 'filter', 'every', 'some', 'find', 'findIndex', 'reduce'])
const MARKER = /\/\/\s*test-quality:\s*contract\b(.*)$/

/** Every binding a scope declares, by name: `{ kind, from?, imported?, init? }`. */
function bindingsOf(node) {
  const out = new Map()
  const addName = (name, binding) => {
    if (ts.isIdentifier(name)) out.set(name.text, binding)
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
      for (const element of name.elements)
        if (!ts.isOmittedExpression(element)) addName(element.name, binding)
  }
  const statements =
    ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node) ? node.statements : []
  for (const statement of statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const from = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : ''
      const clause = statement.importClause
      if (clause.name) out.set(clause.name.text, { kind: 'import', from, imported: 'default' })
      const bindings = clause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings))
        out.set(bindings.name.text, { kind: 'import', from, imported: '*' })
      if (bindings && ts.isNamedImports(bindings))
        for (const el of bindings.elements)
          out.set(el.name.text, { kind: 'import', from, imported: (el.propertyName ?? el.name).text })
    } else if (ts.isVariableStatement(statement)) {
      const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
      for (const decl of statement.declarationList.declarations)
        addName(decl.name, {
          kind: isConst && ts.isIdentifier(decl.name) ? 'const' : 'local',
          init: decl.initializer
        })
    } else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) out.set(statement.name.text, { kind: 'local' })
    }
  }
  if (ts.isFunctionLike(node)) for (const param of node.parameters) addName(param.name, { kind: 'local' })
  if ((ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isForStatement(node)) && node.initializer)
    if (ts.isVariableDeclarationList(node.initializer))
      for (const decl of node.initializer.declarations) addName(decl.name, { kind: 'local' })
  if (ts.isCatchClause(node) && node.variableDeclaration)
    addName(node.variableDeclaration.name, { kind: 'local' })
  return out
}

/** The module a `require(…)` call (through `createRequire` or not) names, else null. */
function requiredModule(init) {
  let call = init
  while (call && (ts.isParenthesizedExpression(call) || ts.isAsExpression(call))) call = call.expression
  if (!call || !ts.isCallExpression(call) || call.arguments.length !== 1) return null
  const callee = call.expression
  const named = ts.isIdentifier(callee) ? callee.text : ''
  if (!/^require$|Require$|^req$/i.test(named) && !ts.isCallExpression(callee)) return null
  const [arg] = call.arguments
  return ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg) ? arg.text : null
}

/**
 * The findings of one test file's text.
 * @param {string} text - the file.
 * @param {string} file - its repo-relative path (for the parser's dialect and the messages).
 * @returns {{ rule: string, line: number, key: string, text: string, why?: string }[]}
 */
export function findingsOf(text, file) {
  const javascript = /\.[cm]?jsx?$/.test(file)
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : javascript ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const broken = source.parseDiagnostics ?? []
  // The TypeScript parser refuses some valid JavaScript (a JSDoc `@type` before an arrow's parameter,
  // measured on `site-call.test.mjs`, 12/10/2026). Node's own syntax check decides for JavaScript: it
  // parses and runs nothing. Valid there, the parser's recovered tree is read as it is.
  if (broken.length > 0 && !(javascript && nodeAccepts(text, file))) {
    const first = broken[0]
    const { line } = source.getLineAndCharacterOfPosition(first.start ?? 0)
    throw new GateError(
      `${file}:${line + 1}: does not parse: ${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`
    )
  }
  const lines = text.split('\n')
  const out = []
  const scopes = []
  const { mutated, passed } = mutatedNames(source)

  const resolve = (name) => {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      const found = scopes[i].get(name)
      if (found) return { ...found, top: i === 0 }
    }
    return undefined
  }

  /** How `node:assert` is reached from a callee, or null. */
  const assertionOf = (callee) => {
    if (ts.isIdentifier(callee)) {
      const b = resolve(callee.text)
      if (b?.kind === 'import' && ASSERT_MODULES.has(b.from))
        return b.imported === 'default' || b.imported === '*' || b.imported === 'strict' ? 'ok' : b.imported
      if (b?.kind === 'const' && ASSERT_MODULES.has(requiredModule(b.init) ?? '')) return 'ok'
      return null
    }
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
      const b = resolve(callee.expression.text)
      const isAssert =
        (b?.kind === 'import' &&
          ASSERT_MODULES.has(b.from) &&
          ['default', '*', 'strict'].includes(b.imported)) ||
        (b?.kind === 'const' && ASSERT_MODULES.has(requiredModule(b.init) ?? ''))
      return isAssert ? callee.name.text : null
    }
    return null
  }

  /** True when `node` is a value fixed in the test file (see `self-compare`). */
  const fixed = (node, seen = new Set()) => {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node))
      node = node.expression
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isNumericLiteral(node) ||
      ts.isBigIntLiteral(node) ||
      ts.isRegularExpressionLiteral(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword
    )
      return true
    if (ts.isPrefixUnaryExpression(node)) return fixed(node.operand, seen)
    if (ts.isBinaryExpression(node))
      return (
        [
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.MinusToken,
          ts.SyntaxKind.AsteriskToken,
          ts.SyntaxKind.SlashToken,
          ts.SyntaxKind.PercentToken,
          ts.SyntaxKind.AsteriskAsteriskToken
        ].includes(node.operatorToken.kind) &&
        fixed(node.left, seen) &&
        fixed(node.right, seen)
      )
    if (ts.isTemplateExpression(node)) return node.templateSpans.every((span) => fixed(span.expression, seen))
    if (ts.isArrayLiteralExpression(node))
      return node.elements.every((e) => !ts.isSpreadElement(e) && fixed(e, seen))
    if (ts.isObjectLiteralExpression(node))
      return node.properties.every(
        (p) =>
          ts.isPropertyAssignment(p) &&
          (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) &&
          fixed(p.initializer, seen)
      )
    if (ts.isIdentifier(node)) {
      if (node.text === 'undefined') return resolve('undefined') === undefined
      const b = resolve(node.text)
      if (b?.kind !== 'const' || !b.init || seen.has(node.text) || mutated.has(node.text)) return false
      const value = unwrap(b.init)
      if (
        (ts.isArrayLiteralExpression(value) || ts.isObjectLiteralExpression(value)) &&
        passed.has(node.text)
      )
        return false
      seen.add(node.text)
      return fixed(b.init, seen)
    }
    return false
  }

  /** The import a value is read from, through property names and no call; else null. */
  const importedRoot = (node) => {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))
      node = node.expression
    while (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      if (ts.isElementAccessExpression(node) && !fixed(node.argumentExpression)) return null
      node = node.expression
    }
    if (!ts.isIdentifier(node)) return null
    const b = resolve(node.text)
    if (b?.kind === 'import' && !ASSERT_MODULES.has(b.from) && !b.from.startsWith('node:')) return b.from
    if (b?.kind === 'const') {
      const from = requiredModule(b.init)
      if (from && !from.startsWith('node:') && !ASSERT_MODULES.has(from)) return from
    }
    return null
  }

  /** The `test-quality: contract` marker on the statement's first line or right above it. */
  const markerFor = (node) => {
    let statement = node
    while (statement.parent && !ts.isExpressionStatement(statement) && !ts.isSourceFile(statement.parent))
      statement = statement.parent
    const first = source.getLineAndCharacterOfPosition(statement.getStart(source)).line
    const own = MARKER.exec(lines[first] ?? '')
    if (own) return own
    for (let i = first - 1; i >= 0; i -= 1) {
      const line = lines[i].trim()
      if (!line.startsWith('//')) break
      const found = MARKER.exec(line)
      if (found) return found
    }
    return null
  }

  /** True inside a callback given to something other than node:test or an array walk. */
  const handedOver = (node) => {
    for (let at = node.parent; at && !ts.isSourceFile(at); at = at.parent) {
      if (!ts.isFunctionLike(at)) continue
      // The call the function is an argument of, directly or as a value inside an object or array.
      let arg = at
      while (
        arg.parent &&
        (ts.isPropertyAssignment(arg.parent) ||
          ts.isObjectLiteralExpression(arg.parent) ||
          ts.isArrayLiteralExpression(arg.parent) ||
          ts.isParenthesizedExpression(arg.parent))
      )
        arg = arg.parent
      if (!arg.parent || !ts.isCallExpression(arg.parent) || !arg.parent.arguments.includes(arg)) continue
      const callee = arg.parent.expression
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ''
      if (!TEST_CALLS.has(name) && !WALKS.has(name)) return true
    }
    return false
  }

  const report = (rule, node, why) => {
    const marker = markerFor(node)
    if (marker && marker[1].trim().length >= 3) return
    const at = node.getStart(source)
    const { line } = source.getLineAndCharacterOfPosition(at)
    const snippet = node.getText(source).replace(/\s+/g, ' ')
    out.push({
      rule: marker ? 'contract-without-reason' : rule,
      line: line + 1,
      key: `${marker ? 'contract-without-reason' : rule}\0${snippet}`,
      text: snippet.length > 160 ? `${snippet.slice(0, 157)}...` : snippet,
      ...(why ? { why } : {})
    })
  }

  const visit = (node) => {
    const opens =
      ts.isSourceFile(node) ||
      ts.isBlock(node) ||
      ts.isFunctionLike(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForStatement(node) ||
      ts.isCatchClause(node)
    if (opens) scopes.push(bindingsOf(node))
    if (ts.isCallExpression(node)) {
      const method = assertionOf(node.expression)
      if (method && handedOver(node)) {
        // A runner's fixture, not this file's own check.
      } else if (method && EQUALITY.has(method) && node.arguments.length >= 2) {
        const [a, b] = node.arguments
        if (fixed(a) && fixed(b)) report('self-compare', node)
        else {
          const from = (fixed(b) && importedRoot(a)) || (fixed(a) && importedRoot(b))
          if (from) report('pinned-constant', node, from)
        }
      } else if (method === 'ok' && node.arguments.length >= 1 && fixed(node.arguments[0])) {
        report('self-compare', node)
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) {
      if (MACHINE_PATH.test(node.text)) report('machine-path', node)
    }
    ts.forEachChild(node, visit)
    if (opens) scopes.pop()
  }
  visit(source)
  return out
}

/** Whether `node --check` accepts the text as the module or script its extension says it is. */
function nodeAccepts(text, file) {
  const type = file.endsWith('.cjs') ? 'commonjs' : 'module'
  const checked = spawnSync(process.execPath, ['--check', `--input-type=${type}`, '-'], {
    input: text,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  })
  return checked.status === 0
}

/**
 * Names whose array/object value the file changes (`x.push(…)`, `x[k] = …`, `x.y = …`, `delete x.y`),
 * and names it hands to a call other than an assertion (which may change it).
 */
function mutatedNames(source) {
  const out = new Set()
  const passed = new Set()
  const rootName = (node) => {
    while (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) node = node.expression
    return ts.isIdentifier(node) ? node.text : null
  }
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
    ) {
      const name = rootName(node.left)
      if (name) out.add(name)
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      MUTATORS.has(node.expression.name.text)
    ) {
      const name = rootName(node.expression.expression)
      if (name) out.add(name)
    }
    if (ts.isDeleteExpression(node)) {
      const name = rootName(node.expression)
      if (name) out.add(name)
    }
    if (
      ts.isCallExpression(node) &&
      !/^assert\b|\b(equal|strictEqual|deepEqual|deepStrictEqual|ok)$/.test(node.expression.getText(source))
    )
      for (const arg of node.arguments) {
        // The name itself, or inside what is passed (`setup({ env })`, `run([input])`).
        const collect = (n) => {
          if (ts.isIdentifier(n)) passed.add(n.text)
          else if (ts.isShorthandPropertyAssignment(n)) passed.add(n.name.text)
          if (!ts.isFunctionLike(n)) ts.forEachChild(n, collect)
        }
        collect(arg)
      }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { mutated: out, passed }
}

/** An expression without its parentheses and type assertions. */
function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node))
  )
    node = node.expression
  return node
}

// ── which files ───────────────────────────────────────────────────────────────────────────────

function git(repo, args) {
  try {
    return execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch (error) {
    const stderr = String(error?.stderr ?? '').trim()
    throw new GateError(
      `git ${args.slice(0, 2).join(' ')} failed: ${stderr || String(error?.message ?? error)}`
    )
  }
}

/**
 * A test file this gate reads: named like a test, outside `vendor/`. Every suite CI runs names its
 * files `*.test.*` (`SUITES` of `scripts/ci/new-test-proof.mjs`), so this is that tool's `test` and
 * `unsupported-test` roles, without importing it.
 */
export function isTestFile(file) {
  return !file.startsWith('vendor/') && /\.(test|spec)\.[cm]?[jt]sx?$/.test(file.split('/').at(-1) ?? '')
}

/**
 * The branch a local run compares with: `origin/develop`, or the remote's default branch in a
 * clone that has no `develop` (a fresh clone of the public repository).
 */
function localUpstream(repo) {
  for (const ref of ['refs/remotes/origin/develop', 'refs/remotes/origin/HEAD']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repo, stdio: 'ignore' })
      return ref === 'refs/remotes/origin/develop' ? 'origin/develop' : 'origin/HEAD'
    } catch {
      // try the next one
    }
  }
  return 'origin/develop'
}

/**
 * The base this run compares with, as a commit id.
 * @returns {{ base: string, why: string } | { skip: string }}
 */
export function resolveBase({ repo, arg, env }) {
  let ref = arg
  let why = '--base'
  if (ref === undefined) {
    if (env.GITHUB_EVENT_NAME === 'pull_request') {
      ref = 'HEAD^1'
      why = 'the merge commit’s first parent (pull request)'
    } else if (env.GITHUB_EVENT_NAME) {
      return { skip: `not a pull request (${env.GITHUB_EVENT_NAME}): no change to judge` }
    } else {
      const upstream = localUpstream(repo)
      ref = git(repo, ['merge-base', 'HEAD', upstream]).trim()
      why = `merge-base of HEAD and ${upstream}`
    }
  }
  if (typeof ref !== 'string' || ref === '' || ref.startsWith('-') || /[\0\n]/.test(ref))
    throw new GateError(`not a usable base: ${JSON.stringify(ref)}`)
  const sha = git(repo, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]).trim()
  if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new GateError(`${ref} does not name a commit`)
  return { base: sha, why }
}

/**
 * The test files the working tree adds or edits against `base`: `{ path, from }`, where `from` is
 * the path whose base version it is compared with (its old path when renamed; null when new).
 */
export function changedTests(repo, base) {
  const fields = git(repo, ['diff', '--name-status', '-z', '-M', '--no-ext-diff', base, '--']).split('\0')
  const out = []
  for (let i = 0; i < fields.length; ) {
    const status = fields[i]
    if (status === '') break
    if (/^[RC]\d*$/.test(status)) {
      const [from, to] = [fields[i + 1], fields[i + 2]]
      i += 3
      if (isTestFile(to)) out.push({ path: to, from: status.startsWith('R') ? from : null })
    } else {
      const file = fields[i + 1]
      i += 2
      if (/^[AMT]$/.test(status) && isTestFile(file))
        out.push({ path: file, from: status === 'A' ? null : file })
      else if (!/^[ADMTU]$/.test(status))
        throw new GateError(`git diff status ${status} on ${file} is not handled`)
    }
  }
  for (const file of git(repo, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'))
    if (file !== '' && isTestFile(file)) out.push({ path: file, from: null })
  return out.sort((a, b) => (a.path < b.path ? -1 : 1))
}

/** The findings `head` has more of than `base`, keyed by rule and assertion text. */
export function surplus(head, base) {
  const left = new Map()
  for (const f of base) left.set(f.key, (left.get(f.key) ?? 0) + 1)
  return head.filter((f) => {
    const n = left.get(f.key) ?? 0
    if (n > 0) {
      left.set(f.key, n - 1)
      return false
    }
    return true
  })
}

/** Run the gate on `repo`; returns the new findings per file and what was read. */
export function run({ repo = ROOT, arg, env = process.env } = {}) {
  const resolved = resolveBase({ repo, arg, env })
  if ('skip' in resolved) return { skip: resolved.skip, files: [], findings: [] }
  const files = changedTests(repo, resolved.base)
  const findings = []
  for (const { path: file, from } of files) {
    const full = path.join(repo, file)
    if (!existsSync(full)) continue
    const head = findingsOf(readFileSync(full, 'utf8'), file)
    const before = from === null ? [] : findingsOf(git(repo, ['show', `${resolved.base}:${from}`]), from)
    for (const f of surplus(head, before)) findings.push({ file, ...f })
  }
  return { base: resolved.base, why: resolved.why, files, findings }
}

const HINTS = {
  'self-compare': 'both sides are fixed in the test: it cannot fail for a product bug',
  'pinned-constant':
    'a constant of the product compared with a copy of itself: run the behaviour that uses it, or compare it with the value it must agree with',
  'machine-path':
    'a temporary directory of one session on one machine: build the fixture from the repository or a directory the test makes',
  'contract-without-reason': '`test-quality: contract` needs the reason after it'
}

function main(argv) {
  let arg
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base' && i + 1 < argv.length) {
      arg = argv[i + 1]
      i += 1
    } else {
      process.stderr.write(
        `check-test-quality: unknown argument ${argv[i]}\n  node scripts/check-test-quality.mjs [--base <ref>]\n`
      )
      return 2
    }
  }
  const started = Date.now()
  let result
  try {
    result = run({ arg })
  } catch (error) {
    if (!(error instanceof GateError)) throw error
    process.stderr.write(`check-test-quality: FAILED — ${error.message}\n`)
    return 1
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (result.skip) {
    process.stdout.write(`check-test-quality: ${result.skip}\n`)
    return 0
  }
  const head = `check-test-quality: ${result.files.length} test file(s) added or edited since ${result.base.slice(0, 12)} (${result.why}), ${seconds}s`
  if (result.findings.length === 0) {
    process.stdout.write(`${head}: no new assertion that cannot fail\n`)
    return 0
  }
  process.stdout.write(`${head}: ${result.findings.length} new finding(s)\n`)
  for (const f of result.findings)
    process.stdout.write(
      `  ${f.file}:${f.line} ${f.rule}${f.why ? ` (${f.why})` : ''} — ${HINTS[f.rule]}\n      ${f.text}\n`
    )
  process.stdout.write(
    'A deliberate contract stays when it says so: `// test-quality: contract <why>` on or right above the assertion.\n'
  )
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2))
