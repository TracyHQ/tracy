/**
 * Which product files a test command exercises, read from the test files' syntax tree.
 *
 * Only these forms are understood; anything else is reported as unresolved, never guessed:
 *  - `import … from './x'`, `export … from './x'`, `import('./x')` and `require('./x')` with a literal path;
 *  - a path expression built from string literals, template literals, `+`, `new URL(lit, import.meta.url)`,
 *    `fileURLToPath`, `dirname`, `join` / `resolve` / `normalize`, `__dirname`, `import.meta.dirname`, a
 *    `process.env.X ?? fallback` (the fallback is read), array literals and spreads, and `const` names bound
 *    to such an expression (also when imported from a relative module);
 *  - that expression passed to a read (`readFileSync`, `readFile`, `createReadStream`, `open[Sync]` without a
 *    write flag) bound to `node:fs`, or to a process call (`spawn*`, `execFile*`, `fork`) bound to
 *    `node:child_process` or `execa` — by its import binding, never by its name alone; a name the file also binds
 *    locally (a block's own `readFileSync`) is ambiguous and stated, never taken as the import;
 *  - of a process call's argv, only what runs: the command when it is a path, an interpreter's script (every
 *    operand under `--test`) and its `--import`/`--require` modules, through `npx`/`pnpm exec`/`env`; a file only
 *    passed along (to `echo`, `git`, a script's own arguments, a computed command) is a gap, and so is a path
 *    interpolated into an inline script unless the text before it loads, runs or reads it (`INLINE_LOADS`);
 *  - a call to a helper function (declared in the file, exported by a relative module, or reached through a
 *    relative namespace import) whose body passes its parameters on to such a read or process call: the helper is
 *    followed with the caller's argument values, and is never a source itself.
 * A test file or helper module the command imports or runs is followed too; its own product imports count.
 * A command-line test argument is resolved against the command's `cwd`; an import against the file holding it;
 * a `.js` import reaches the `.ts` file next to it only when the command runs under tsx.
 * Each source is `file:line` at the imported name's declaration (from the syntax tree) or the first statement;
 * a target that cannot be read, does not parse or has no code is a gap, never a line-1 guess.
 * Documentation, JSON, test trees, helpers and strings that are never read or run are not product sources.
 */
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join, posix } from 'node:path'
import ts from 'typescript'
import { readRegular, REPO } from '../../static/lib/common.mjs'

const JS_EXT = /\.(?:tsx?|jsx?|mjs|mts|cjs)$/
/** Executable or importable source; a README, a JSON file or a stylesheet's neighbour is never in this list. */
const CODE_EXT = /\.(?:tsx?|jsx?|mjs|mts|cjs|css|sh|py|php)$/
const NON_PRODUCT = /(?:^|\/)(?:tests?|test-support|fixtures|__tests__|node_modules)\/|\.(?:test|spec)\./
const MAX_DEPTH = 24
const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises'])
const PROCESS_MODULES = new Set(['child_process', 'node:child_process'])
const READ_SINKS = new Set(['readFileSync', 'readFile', 'createReadStream', 'openSync', 'open'])
const OPEN_SINKS = new Set(['openSync', 'open'])
const RUN_SINKS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork'])
const EXECA_SINKS = new Set(['execa', 'execaSync'])
/** An `open` flag that writes: such a call is not a read. */
const WRITE_FLAG = /WRONLY|RDWR|CREAT|APPEND|TRUNC|['"`][^'"`]*[wa+]/

const EXT_TRIES = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.js',
  '.jsx',
  '.cjs',
  '/index.ts',
  '/index.mjs',
  '/index.js'
]

const IGNORED = new Map()

/**
 * Git-ignored paths under `root` other than `node_modules/` (build output such as `dist/`): they exist only after a build, so a
 * case generated on a freshly built tree must not differ from one generated on a clean clone.
 * @returns {string[]} repo-relative ignored files and directories (directories end in `/`).
 */
function ignoredUnder(root) {
  if (!IGNORED.has(root)) {
    let out = ''
    try {
      out = execFileSync('git', ['ls-files', '-oiz', '--exclude-standard', '--directory'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
      })
    } catch {}
    // Installed dependencies are fixed by the lockfile, not by whether a build ran: they stay readable.
    IGNORED.set(
      root,
      out.split('\0').filter((i) => i && !/(^|\/)node_modules\/$/.test(i))
    )
  }
  return IGNORED.get(root)
}

/** @returns {string|null} repo-relative path of the regular, not git-ignored file `p` names, or null. */
function regularFile(root, p) {
  const n = posix.normalize(p)
  if (n.startsWith('..') || n.startsWith('/') || n === '.') return null
  if (ignoredUnder(root).some((i) => (i.endsWith('/') ? n.startsWith(i) : n === i))) return null
  try {
    return statSync(join(root, n)).isFile() ? n : null
  } catch {
    return null
  }
}

/** @returns {string|null} the JS/TS file an import specifier names, with `.js` → `.ts` only under tsx. */
function resolveImport(root, base, tsx) {
  const tries = []
  for (const ext of EXT_TRIES) tries.push(`${base}${ext}`)
  if (tsx) {
    const swap = base.match(/^(.*)\.(m?js|jsx)$/)
    if (swap) tries.unshift(`${swap[1]}.${swap[2] === 'mjs' ? 'mts' : swap[2] === 'jsx' ? 'tsx' : 'ts'}`)
  }
  for (const t of tries) {
    const f = JS_EXT.test(t) ? regularFile(root, t) : null
    if (f !== null) return f
  }
  return null
}

/**
 * @returns {number|null} 1-based line of the first line that is code, not a shebang, blank line or leading
 *   comment; null when the file cannot be read or holds no code.
 */
export function firstCodeLine(root, file) {
  let lines
  try {
    lines = readRegular(join(root, file)).toString('utf8').split('\n')
  } catch {
    return null
  }
  let block = null
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (block !== null) {
      if (l.includes(block)) block = null
      continue
    }
    if (l === '' || l.startsWith('#') || l.startsWith('//') || l === '<?php' || l.startsWith('<?php //'))
      continue
    if (l.startsWith('/*')) {
      if (!l.includes('*/', 2)) block = '*/'
      continue
    }
    const doc = l.match(/^[rbuRBU]{0,2}("""|''')/)
    if (doc) {
      if (!l.slice(doc[0].length).includes(doc[1])) block = doc[1]
      continue
    }
    return i + 1
  }
  return null
}

const kindOf = (file) =>
  file.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : /\.(?:m?ts)$/.test(file)
      ? ts.ScriptKind.TS
      : file.endsWith('.jsx')
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

/** A function value a name can be bound to: a declaration, or an arrow/function expression. */
const functionOf = (decl) => {
  if (ts.isFunctionDeclaration(decl)) return decl
  if (!ts.isVariableDeclaration(decl) || !decl.initializer) return null
  const init = strip(decl.initializer)
  return ts.isArrowFunction(init) || ts.isFunctionExpression(init) ? init : null
}

/**
 * Parsed view of one source file: its unique `const` bindings and named functions (anywhere in the file; a
 * name declared twice is ambiguous and dropped), imported names, exports and top-level declarations.
 */
/**
 * Substitutions of template literals among call arguments (array elements included), unwrapping
 * `JSON.stringify(x)`/`String(x)`, each with the literal text just before it.
 * @returns {Array<{expr: ts.Node, before: string}>}
 */
function interpolated(args) {
  const out = []
  const visit = (n) => {
    const e = strip(n)
    if (ts.isArrayLiteralExpression(e)) return e.elements.forEach(visit)
    if (!ts.isTemplateExpression(e)) return
    let before = e.head.text
    for (const span of e.templateSpans) {
      let x = strip(span.expression)
      if (
        ts.isCallExpression(x) &&
        x.arguments.length >= 1 &&
        /^(JSON\.stringify|String)$/.test(x.expression.getText())
      )
        x = strip(x.arguments[0])
      out.push({ expr: x, before })
      before = span.literal.text
    }
  }
  args.forEach(visit)
  return out
}

/**
 * Inline-script text that, right before an interpolated path, loads, runs or reads that path: Python's
 * `spec_from_file_location(name, …)`, `SourceFileLoader(name, …)`, `run_path(…)`, `open(…)`; JS `require(…)`,
 * `import(…)`, `readFileSync(…)`; PHP `require`/`include`; a shell `source`/`.` or an interpreter word. A path in
 * any other position (printed, compared, passed as data) is not proven to reach the child.
 */
const INLINE_LOADS =
  /(?:spec_from_file_location\([^,()]*,|SourceFileLoader\([^,()]*,|run_path\(|\bopen\(|\brequire(?:_once)?\s*\(?|\binclude(?:_once)?\s*\(?|\bimport\(|readFileSync\(|readFile\(|(?:^|[\s;&|(])(?:source|\.)\s+|(?:^|[\s;&|(])(?:node|tsx|python3?|bash|sh|php)\s+)\s*['"`]?$/

/** Commands that read the files they are given, and the git subcommands that do. */
const READERS = new Set([
  'cat',
  'grep',
  'egrep',
  'rg',
  'head',
  'tail',
  'wc',
  'diff',
  'cmp',
  'sha256sum',
  'shasum',
  'md5sum'
])
const GIT_READERS = new Set(['grep', 'diff', 'blame', 'hash-object'])

/** Shells, and a positional parameter an inline shell script sources or runs (`. "$1"`, `exec "$0"`). */
const SHELL = /^(?:bash|sh|zsh)$/
const SHELL_POSITIONAL =
  /(?:^|[\s;&|(])(?:source|\.|exec|bash|sh|zsh|node|python3?|php)\s+["']?\$\{?([0-9])\}?["']?(?=[\s;&|)]|$)/g

/** Interpreters whose first operand (after their own flags) is the script they run. */
const INTERPRETER = /^(?:node(?:js)?|tsx|ts-node|bun|deno|python[\d.]*|bash|sh|zsh|php|ruby|perl)$/
/** Flags whose value is a module the interpreter loads before the script (node, tsx, bun). */
const LOAD_FLAGS = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader'])
/** Flags that make the interpreter run inline code or a module name instead of a script file. */
const INLINE_FLAGS = new Set(['-e', '--eval', '-p', '--print', '-c', '-m', '-r'])
/** Launchers that run the command named after them. */
const LAUNCHERS = new Set(['npx', 'pnpx', 'env'])
const PACKAGE_MANAGERS = new Set(['pnpm', 'npm', 'yarn'])

/**
 * Split a process call's argv into what it runs and what it only passes along.
 * @param {string} sink - the sink's name (`fork` takes the script itself first).
 * @param {object|null} cmd - the evaluated command (null when computed; `{k: 'x', v: 'node'}` for `process.execPath`).
 * @param {Array<object|null>} args - the evaluated arguments.
 * @returns {{scripts: Array<object|null>, loads: Array<object|null>, reads: Array<object|null>,
 *   data: Array<object|null>, unknown: boolean, inline: boolean, command: string}} values run as scripts,
 *   modules loaded by flag, operands of a command that reads files, values only passed, whether the command
 *   itself is unknown, whether an interpreter runs inline code (`-e`, `-c`) and at which index of `args` that
 *   code is (`inlineAt`), and the command's name for messages.
 */
function argvRoles(sink, cmd, args) {
  const out = {
    scripts: [],
    loads: [],
    reads: [],
    data: [],
    unknown: false,
    inline: false,
    inlineAt: -1,
    command: ''
  }
  if (sink === 'fork') {
    out.command = 'node'
    out.scripts.push(cmd)
    out.data.push(...args)
    return out
  }
  if (cmd === null || !NAMES.has(cmd.k)) {
    out.unknown = true
    out.data.push(...args)
    return out
  }
  let word = cmd.k === 'x' ? cmd.v : cmd.k === 's' && !cmd.v.includes('/') ? cmd.v : null
  let rest = [...args]
  if (word === null) {
    // A command given as a path: the file itself is what runs.
    out.command = cmd.v
    out.scripts.push(cmd)
    out.data.push(...rest)
    return out
  }
  const text = (v) => (v?.k === 's' || v?.k === 'f' ? v.v : null)
  for (let guard = 0; guard < 4; guard++) {
    if (LAUNCHERS.has(word)) {
      while (rest.length && /^[A-Z_][A-Z0-9_]*=/.test(text(rest[0]) ?? '')) rest.shift()
      while (rest.length && (text(rest[0]) ?? '').startsWith('-')) rest.shift()
    } else if (PACKAGE_MANAGERS.has(word) && ['exec', 'dlx'].includes(text(rest[0]))) rest.shift()
    else if (!(PACKAGE_MANAGERS.has(word) && INTERPRETER.test(text(rest[0]) ?? ''))) break
    const next = text(rest[0])
    if (next === null) {
      out.unknown = true
      out.data.push(...rest)
      return out
    }
    word = next
    rest = rest.slice(1)
  }
  out.command = word
  // A command that reads its file operands (`git grep … -- FILE`, `grep`, `cat`): the files it names are read.
  if (word === 'git') {
    // git's own options come before the subcommand; `-C dir` and `-c key=value` take an operand.
    while (rest.length && (text(rest[0]) ?? '').startsWith('-')) {
      const opt = text(rest.shift())
      if (opt === '-C' || opt === '-c') rest.shift()
    }
  }
  if (READERS.has(word) || (word === 'git' && GIT_READERS.has(text(rest[0])))) {
    out.reads.push(...rest)
    return out
  }
  if (!INTERPRETER.test(word)) {
    out.data.push(...rest)
    return out
  }
  if ((word === 'deno' || word === 'bun') && ['run', 'test'].includes(text(rest[0]))) rest = rest.slice(1)
  let all = false
  while (rest.length) {
    // An unknown element where flags may still come: it may be a flag that takes the next argument, so what
    // follows is not proven to run.
    if (rest[0] === null) {
      out.scripts.push(null)
      out.data.push(...rest.slice(1))
      return out
    }
    const flag = text(rest[0])
    if (flag === null || !flag.startsWith('-')) break
    // A flag known only up to its inline value (`--import=${x}`) loads something not known.
    const whole = rest[0].k === 's'
    rest = rest.slice(1)
    if (flag === '--test') all = true
    const isNode = !/^(?:python|bash|sh|zsh|php|ruby|perl)/.test(word)
    // A shell's short options cluster (`-euo pipefail`, `-ec`): `o` takes the next operand, a final `c` is -c.
    const cluster = SHELL.test(word) && /^[-+][a-zA-Z]+$/.test(flag) ? flag : null
    if (cluster?.includes('o')) rest.shift()
    const eq = flag.indexOf('=')
    if (isNode && eq > 0 && LOAD_FLAGS.has(flag.slice(0, eq)))
      out.loads.push(whole ? { k: 's', v: flag.slice(eq + 1) } : null)
    else if (isNode && LOAD_FLAGS.has(flag)) out.loads.push(rest.shift() ?? null)
    else if (INLINE_FLAGS.has(flag) || cluster?.endsWith('c') || (word.startsWith('php') && flag === '-f')) {
      if (word.startsWith('php') && flag === '-f') out.scripts.push(rest.shift() ?? null)
      else {
        out.inline = true
        out.inlineAt = args.length - rest.length
        // `bash -c '. "$1"; …' _ FILE`: the script's own positional parameters ($0 is the next operand), so an
        // operand the inline script sources or runs by number is loaded, and the others are only passed along.
        const script = text(rest.shift() ?? null)
        const used = new Set()
        for (const m of cluster?.endsWith('c') && script !== null ? script.matchAll(SHELL_POSITIONAL) : [])
          used.add(Number(m[1]))
        // An unknown element (a spread) before a used position may stand for several operands: no numbering then.
        if (used.size && !rest.slice(0, Math.max(...used)).includes(null)) {
          rest.forEach((v, i) => (used.has(i) ? out.loads : out.data).push(v))
          return out
        }
      }
      out.data.push(...rest)
      return out
    }
  }
  if (all) out.scripts.push(...rest)
  else if (rest.length) {
    out.scripts.push(rest[0])
    out.data.push(...rest.slice(1))
  }
  return out
}

/** The literal specifier of `await import('x')` or `require('x')`, or null. */
function loadedSpecifier(init) {
  let e = strip(init)
  if (ts.isAwaitExpression(e)) e = strip(e.expression)
  if (!ts.isCallExpression(e) || e.arguments.length !== 1) return null
  const isLoad =
    e.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(e.expression) && e.expression.text === 'require')
  const arg = strip(e.arguments[0])
  return isLoad && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) ? arg.text : null
}

function load(root, file, cache) {
  if (cache.has(file)) return cache.get(file)
  const mod = {
    file,
    sf: null,
    readError: false,
    parseError: null,
    consts: new Map(),
    functions: new Map(),
    imports: new Map(),
    exports: new Map(),
    reexports: new Map(),
    decls: new Map(),
    ambiguous: new Set()
  }
  cache.set(file, mod)
  let text
  try {
    text = readRegular(join(root, file)).toString('utf8')
  } catch {
    mod.readError = true
    return mod
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, kindOf(file))
  mod.sf = sf
  const diag = sf.parseDiagnostics?.[0]
  if (diag) mod.parseError = { line: sf.getLineAndCharacterOfPosition(diag.start ?? 0).line + 1 }
  const seen = new Map()
  const count = (name, by = 1) => seen.set(name, (seen.get(name) ?? 0) + by)
  // Every binding of a name anywhere in the file, as `import <spec> <name>` or `local`. Imports are kept per file,
  // not per scope, so a name also bound locally (a block's own `readFileSync`, a parameter) cannot be told apart
  // at a call site: such a name is ambiguous and stated as a gap, never taken as the import.
  const binds = new Map()
  const bind = (name, key) => {
    if (!binds.has(name)) binds.set(name, new Set())
    binds.get(name).add(key)
  }
  const loadedBy = (el) => {
    const decl = el.parent?.parent
    return ts.isObjectBindingPattern(el.parent) && ts.isVariableDeclaration(decl) && decl.initializer
      ? loadedSpecifier(decl.initializer)
      : null
  }
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const spec = n.initializer ? loadedSpecifier(n.initializer) : null
      bind(n.name.text, spec === null ? 'local' : `import ${spec} *`)
    }
    if (ts.isBindingElement(n) && ts.isIdentifier(n.name)) {
      const spec = loadedBy(n)
      const imported = n.propertyName
        ? ts.isIdentifier(n.propertyName)
          ? n.propertyName.text
          : null
        : n.name.text
      bind(n.name.text, spec === null || imported === null ? 'local' : `import ${spec} ${imported}`)
    }
    if (ts.isParameter(n) && ts.isIdentifier(n.name)) bind(n.name.text, 'local')
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isFunctionExpression(n)) && n.name)
      bind(n.name.text, 'local')
    // A package's default export and its namespace are the same object to a member call (`fs.readFileSync`).
    if (ts.isImportClause(n) && n.name) {
      const spec = n.parent.moduleSpecifier.text
      bind(n.name.text, `import ${spec} ${spec.startsWith('.') ? 'default' : '*'}`)
    }
    if (ts.isNamespaceImport(n)) bind(n.name.text, `import ${n.parent.parent.moduleSpecifier.text} *`)
    if (ts.isImportSpecifier(n))
      bind(
        n.name.text,
        `import ${n.parent.parent.parent.moduleSpecifier.text} ${(n.propertyName ?? n.name).text}`
      )
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      count(n.name.text)
      if ((n.parent.flags & ts.NodeFlags.Const) !== 0 && n.initializer) {
        mod.consts.set(n.name.text, n)
        const fn = functionOf(n)
        if (fn) mod.functions.set(n.name.text, fn)
      }
    }
    if (ts.isFunctionDeclaration(n) && n.name) {
      count(n.name.text)
      if (n.body) mod.functions.set(n.name.text, n)
    }
    if (ts.isParameter(n) && ts.isIdentifier(n.name)) count(n.name.text, 2)
    // `const { readFileSync } = await import('node:fs')`, `const fs = require('node:fs')`: bindings like an import.
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const spec = loadedSpecifier(n.initializer)
      if (spec !== null && ts.isIdentifier(n.name)) mod.imports.set(n.name.text, { spec, imported: '*' })
      if (spec !== null && ts.isObjectBindingPattern(n.name))
        for (const e of n.name.elements) {
          if (e.dotDotDotToken || !ts.isIdentifier(e.name)) continue
          const imported = e.propertyName
            ? ts.isIdentifier(e.propertyName)
              ? e.propertyName.text
              : null
            : e.name.text
          if (imported !== null) mod.imports.set(e.name.text, { spec, imported })
        }
    }
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.importClause) {
      const c = n.importClause
      const spec = n.moduleSpecifier.text
      if (c.name) mod.imports.set(c.name.text, { spec, imported: 'default' })
      if (c.namedBindings && ts.isNamespaceImport(c.namedBindings))
        mod.imports.set(c.namedBindings.name.text, { spec, imported: '*' })
      if (c.namedBindings && ts.isNamedImports(c.namedBindings))
        for (const e of c.namedBindings.elements)
          mod.imports.set(e.name.text, { spec, imported: (e.propertyName ?? e.name).text })
    }
    if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause))
      for (const e of n.exportClause.elements) {
        const local = (e.propertyName ?? e.name).text
        if (n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier))
          mod.reexports.set(e.name.text, { spec: n.moduleSpecifier.text, imported: local })
        else mod.exports.set(e.name.text, local)
      }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  for (const name of mod.imports.keys()) if ((binds.get(name)?.size ?? 0) > 1) mod.ambiguous.add(name)
  for (const [name, c] of seen)
    if (c > 1) {
      mod.consts.delete(name)
      mod.functions.delete(name)
    }
  for (const st of sf.statements) {
    const named = (id) => id && mod.decls.set(id.text, id)
    if (
      ts.isFunctionDeclaration(st) ||
      ts.isClassDeclaration(st) ||
      ts.isInterfaceDeclaration(st) ||
      ts.isTypeAliasDeclaration(st) ||
      ts.isEnumDeclaration(st)
    )
      named(st.name)
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) named(d.name)
  }
  for (const [exported, local] of mod.exports)
    if (!mod.decls.has(exported) && mod.decls.has(local)) mod.decls.set(exported, mod.decls.get(local))
  return mod
}

/**
 * Where an imported product name is declared.
 * @returns {{line: number}|{line: null, why: string}} the declaration line, the first statement's line, or why
 *   there is no line to point at.
 */
function declLine(root, file, names, cache) {
  const mod = load(root, file, cache)
  if (mod.readError) return { line: null, why: 'cannot be read' }
  if (mod.parseError) return { line: null, why: `does not parse (line ${mod.parseError.line})` }
  for (const n of names) {
    const d = mod.decls.get(n)
    if (d) return { line: lineOf(mod.sf, d) }
  }
  const first = mod.sf.statements[0]
  return first ? { line: lineOf(mod.sf, first) } : { line: null, why: 'has no code' }
}

const calleeName = (e) =>
  ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null

const strip = (n) => {
  let x = n
  while (
    ts.isParenthesizedExpression(x) ||
    ts.isAsExpression(x) ||
    ts.isNonNullExpression(x) ||
    ts.isAwaitExpression(x) ||
    ts.isSatisfiesExpression?.(x)
  )
    x = x.expression
  return x
}

/**
 * The nearest binding of an identifier, walking out through its enclosing scopes: a function's parameter, a
 * `const` with an initializer declared directly in a block (with that block), or another local binding (`let`,
 * `var`, a loop or catch variable, a destructured name). Null when nothing in the file binds it.
 */
function lexical(id) {
  const name = id.text
  const binds = (b) =>
    ts.isIdentifier(b)
      ? b.text === name
      : b.elements?.some((el) => !ts.isOmittedExpression(el) && binds(el.name))
  for (let n = id.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n) && n.parameters?.some((p) => binds(p.name))) return { kind: 'param' }
    if (ts.isCatchClause(n) && n.variableDeclaration && binds(n.variableDeclaration.name))
      return { kind: 'local' }
    if (
      (ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isForStatement(n)) &&
      n.initializer &&
      ts.isVariableDeclarationList(n.initializer)
    )
      if (n.initializer.declarations.some((d) => binds(d.name))) return { kind: 'local' }
    const statements =
      ts.isBlock(n) ||
      ts.isSourceFile(n) ||
      ts.isModuleBlock(n) ||
      ts.isCaseClause(n) ||
      ts.isDefaultClause(n)
        ? n.statements
        : null
    if (!statements) continue
    for (const st of statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === name) return { kind: 'local' }
      if (!ts.isVariableStatement(st)) continue
      for (const d of st.declarationList.declarations) {
        if (!binds(d.name)) continue
        const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0
        return isConst && ts.isIdentifier(d.name) && d.initializer
          ? { kind: 'const', decl: d, scope: n }
          : { kind: 'local' }
      }
    }
  }
  return null
}

/** Array methods that change the array in place. */
const MUTATORS = new Set([
  'push',
  'unshift',
  'splice',
  'pop',
  'shift',
  'reverse',
  'sort',
  'fill',
  'copyWithin'
])

/**
 * Value of a block-scoped `const`. An array changed in place later in its block keeps what is known only
 * when every change is a `push`: whole flags (`--name=value`, which never shift the meaning of what follows)
 * are appended, any other push appends an unknown element. Any other change (`unshift`, `splice`, `sort`,
 * an element assignment) moves what is already there, so the array is not known at all.
 */
function constValue({ decl, scope }, ctx, depth) {
  const v = functionOf(decl) ? null : evaluate(decl.initializer, ctx, depth + 1)
  if (v?.k !== 'a' && v?.k !== 'any') return v
  const out = []
  let moved = false
  const name = decl.name.text
  const visit = (n) => {
    if (ts.isIdentifier(n) && n.text === name && n !== decl.name && lexical(n)?.decl === decl) {
      const p = n.parent
      const member = ts.isPropertyAccessExpression(p) && p.expression === n ? p.name.text : null
      const call = member && ts.isCallExpression(p.parent) && p.parent.expression === p ? p.parent : null
      if (member === 'push' && call) {
        const pushed = call.arguments.map((a) => (ts.isSpreadElement(a) ? null : evaluate(a, ctx, depth + 1)))
        if (pushed.every((x) => (x?.k === 's' || x?.k === 'f') && /^--?[A-Za-z][\w-]*=/.test(x.v)))
          out.push(...pushed)
        else out.push(null)
      } else if (
        MUTATORS.has(member) ||
        (ts.isElementAccessExpression(p) &&
          p.expression === n &&
          ts.isBinaryExpression(p.parent) &&
          p.parent.left === p &&
          p.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          p.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
      )
        moved = true
    }
    ts.forEachChild(n, visit)
  }
  visit(scope)
  if (moved) return null
  if (v.k === 'a') return { k: 'a', v: [...v.v, ...out] }
  return { k: 'any', v: v.v.map((x) => ({ k: 'a', v: [...x.v, ...out] })) }
}

/**
 * Value of a path expression: `{ k: 's', v }` a plain string, `{ k: 'p', v }` a repo-relative path,
 * `{ k: 'u', v, dir }` a file URL, `{ k: 'a', v: values }` an array, `{ k: 'x', v }` a command (the node
 * binary), `{ k: 'o', v: Map, open }` an object literal (`open` when a spread or computed key may add more),
 * `{ k: 'n' }` a property such an object does not have, `{ k: 'any', v: arrays }` one of several arrays (a
 * conditional spread); null when the form is not one of the supported ones. `ctx.env` binds a followed helper's parameters to the caller's values.
 */
function evaluate(node, ctx, depth = 0) {
  if (depth > MAX_DEPTH) return null
  const { root, cwd, cache } = ctx
  const mod = ctx.mod
  const e = strip(node)
  const ev = (x) => evaluate(x, ctx, depth + 1)
  const repoRel = (abs) => {
    const p = posix.normalize(abs)
    return p.startsWith('..') || p.startsWith('/') ? null : p
  }
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { k: 's', v: e.text }
  if (ts.isArrayLiteralExpression(e)) {
    // Each spread of `c ? [...] : [...]` forks the array; past MAX_ALTS forks the rest is unknown.
    let combos = [[]]
    for (const el of e.elements) {
      const v = ts.isSpreadElement(el) ? ev(el.expression) : null
      const parts = !ts.isSpreadElement(el)
        ? [[ev(el)]]
        : v?.k === 'a'
          ? [v.v]
          : v?.k === 'any'
            ? v.v.map((x) => x.v)
            : [[null]]
      const next = combos.flatMap((c) => parts.map((p) => [...c, ...p]))
      combos = next.length > MAX_ALTS ? combos.map((c) => [...c, null]) : next
    }
    return combos.length === 1
      ? { k: 'a', v: combos[0] }
      : { k: 'any', v: combos.map((c) => ({ k: 'a', v: c })) }
  }
  if (ts.isConditionalExpression(e)) {
    const a = ev(e.whenTrue)
    const b = ev(e.whenFalse)
    const arrays = (x) => (x?.k === 'a' ? [x] : x?.k === 'any' ? x.v : null)
    const both = arrays(a) && arrays(b) ? [...arrays(a), ...arrays(b)] : null
    return both && both.length <= MAX_ALTS ? { k: 'any', v: both } : null
  }
  if (ts.isObjectLiteralExpression(e)) {
    const props = new Map()
    let open = false
    for (const p of e.properties) {
      if (ts.isShorthandPropertyAssignment(p)) props.set(p.name.text, ev(p.name))
      else if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
        props.set(p.name.text, ev(p.initializer))
      else if (ts.isSpreadAssignment(p) || ts.isPropertyAssignment(p)) {
        // A spread or computed key may set any name, overriding what came before it; names after it still hold.
        props.clear()
        open = true
      }
    }
    return { k: 'o', v: props, open }
  }
  if (
    ts.isTemplateExpression(e) ||
    (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken)
  ) {
    const parts = ts.isTemplateExpression(e)
      ? [
          { lit: e.head.text },
          ...e.templateSpans.flatMap((s) => [{ node: s.expression }, { lit: s.literal.text }])
        ]
      : [{ node: e.left }, { node: e.right }]
    let out = ''
    let anchored = false
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const v = 'lit' in part ? { k: 's', v: part.lit } : ev(part.node)
      // `--name=${x}`: one argument whatever x is, so its role in an argv is still known.
      const plain = v !== null && (v.k === 's' || v.k === 'p')
      if (!plain && !anchored && /^--?[A-Za-z][\w-]*=/.test(out)) return { k: 'f', v: out }
      if (!plain) return null
      if (v.k === 'p' && i > 0 && out !== '') return null
      if (v.k === 'p') anchored = true
      out += v.v
    }
    return anchored ? { k: 'p', v: posix.normalize(out) } : { k: 's', v: out }
  }
  if (
    ts.isBinaryExpression(e) &&
    (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      e.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
    strip(e.left).getText().startsWith('process.env.')
  )
    return ev(e.right)
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    const left = ev(e.left)
    return left?.k === 'n' ? ev(e.right) : left
  }
  if (ts.isIdentifier(e)) {
    const scoped = lexical(e)
    if (scoped?.kind === 'param') return ctx.env?.has(e.text) ? ctx.env.get(e.text) : null
    if (scoped?.kind === 'local') return null
    if (scoped?.kind === 'const' && scoped.scope !== mod.sf) return constValue(scoped, ctx, depth)
    if (ctx.env?.has(e.text)) return ctx.env.get(e.text)
    if (e.text === '__dirname') return { k: 'p', v: posix.dirname(mod.file) }
    if (e.text === '__filename') return { k: 'p', v: mod.file }
    const c = mod.consts.get(e.text)
    if (c) return functionOf(c) ? null : evaluate(c.initializer, ctx, depth + 1)
    const imp = mod.ambiguous.has(e.text) ? null : mod.imports.get(e.text)
    if (imp && imp.spec.startsWith('.') && imp.imported !== 'default' && imp.imported !== '*') {
      const target = resolveImport(root, posix.join(posix.dirname(mod.file), imp.spec), ctx.tsx)
      if (target === null) return null
      const other = load(root, target, cache)
      const decl = other.consts.get(other.exports.get(imp.imported) ?? imp.imported)
      return decl ? evaluate(decl.initializer, { ...ctx, mod: other, env: null }, depth + 1) : null
    }
    return null
  }
  if (ts.isPropertyAccessExpression(e)) {
    const text = e.getText()
    if (text === 'import.meta.url') return { k: 'u', v: mod.file, dir: false }
    if (text === 'import.meta.dirname') return { k: 'p', v: posix.dirname(mod.file) }
    if (e.name.text === 'pathname') {
      const u = ev(e.expression)
      if (u?.k === 'u') return { k: 'p', v: u.v }
    }
    if (text === 'import.meta.filename') return { k: 'p', v: mod.file }
    // The running node binary: a command for a process call, never a path to a source.
    if (text === 'process.execPath') return { k: 'x', v: 'node' }
    const obj = ev(e.expression)
    if (obj?.k === 'o') return obj.v.has(e.name.text) ? obj.v.get(e.name.text) : obj.open ? null : { k: 'n' }
    return null
  }
  if (ts.isNewExpression(e) && e.expression.getText() === 'URL' && e.arguments?.length === 2) {
    const rel = ev(e.arguments[0])
    const base = ev(e.arguments[1])
    if (rel?.k !== 's' || base?.k !== 'u') return null
    const baseDir = base.dir ? base.v : posix.dirname(base.v)
    const v = repoRel(posix.join(baseDir, rel.v))
    return v === null ? null : { k: 'u', v, dir: /(?:^|\/)\.{1,2}$|\/$/.test(rel.v) }
  }
  if (ts.isCallExpression(e)) {
    const name = calleeName(e.expression)
    const args = e.arguments
    if (name === 'fileURLToPath' && args.length === 1) {
      const u = ev(args[0])
      return u?.k === 'u' ? { k: 'p', v: u.v } : null
    }
    if (name === 'dirname' && args.length === 1) {
      const p = ev(args[0])
      return p?.k === 'p' ? { k: 'p', v: posix.dirname(p.v) } : null
    }
    if ((name === 'join' || name === 'resolve' || name === 'normalize') && args.length > 0) {
      let cur = null
      for (const a of args) {
        const v = ev(a)
        if (v === null || (v.k !== 's' && v.k !== 'p')) return null
        if (v.k === 'p') {
          if (name !== 'resolve' && cur !== null) return null
          cur = v.v
        } else if (cur === null && cwd === null) return null
        else cur = cur === null ? posix.join(cwd, v.v) : posix.join(cur, v.v)
      }
      const p = repoRel(cur)
      return p === null ? null : { k: 'p', v: p }
    }
  }
  return null
}

/** Most alternatives an array value keeps before the rest of it is unknown. */
const MAX_ALTS = 8

/** Value kinds that can name a file, and those that can also name a command. */
const PATHS = new Set(['s', 'p', 'u'])
const NAMES = new Set([...PATHS, 'x'])

/**
 * @returns {string|null} repo-relative path a value names (a plain string is read against the command's cwd;
 *   a null cwd is one not known, so a plain string names nothing known then).
 */
function asPath(v, cwd) {
  if (v === null || !PATHS.has(v.k)) return null
  if (v.k === 's')
    return v.v.startsWith('/') || v.v === '' || cwd === null ? null : posix.normalize(posix.join(cwd, v.v))
  return v.v
}

/** Values a call passes, spreads expanded; an unknown spread ends the known list. */
function argValues(args, ctx) {
  const out = []
  for (const a of args) {
    if (ts.isSpreadElement(a)) {
      const v = evaluate(a.expression, ctx)
      if (v?.k !== 'a') return { values: out, open: true }
      out.push(...v.v)
    } else out.push(evaluate(a, ctx))
  }
  return { values: out, open: false }
}

/** @returns {{fn: ts.Node, mod: object}|null} the function an exported name of `mod` is bound to. */
function exportedFunction(root, mod, name, tsx, cache, depth = 0) {
  if (depth > MAX_DEPTH || mod.sf === null) return null
  const local = mod.exports.get(name) ?? name
  const fn = mod.functions.get(local)
  if (fn) return { fn, mod }
  const re = mod.reexports.get(name)
  if (re && re.spec.startsWith('.')) {
    const target = resolveImport(root, posix.join(posix.dirname(mod.file), re.spec), tsx)
    return target === null
      ? null
      : exportedFunction(root, load(root, target, cache), re.imported, tsx, cache, depth + 1)
  }
  return null
}

/**
 * What a call's callee is bound to: a read or process sink by its import, a helper function, a binding that cannot
 * be followed (stated as a gap by the caller), or nothing.
 * @returns {{kind: 'read'|'run', name: string}|{kind: 'helper', name: string, fn: ts.Node, mod: object}|
 *   {kind: 'unfollowed', name: string, why: string}|null}
 */
function calleeOf(expr, ctx) {
  const { mod, root, cache, tsx } = ctx
  const e = strip(expr)
  const sink = (spec, name) =>
    FS_MODULES.has(spec) && READ_SINKS.has(name)
      ? { kind: 'read', name }
      : (PROCESS_MODULES.has(spec) && RUN_SINKS.has(name)) || (spec === 'execa' && EXECA_SINKS.has(name))
        ? { kind: 'run', name }
        : null
  const relative = (imp) => resolveImport(root, posix.join(posix.dirname(mod.file), imp.spec), tsx)
  // A name bound both to an import and locally: when the import would be a sink or a helper, the call is stated.
  const ambiguous = (imp, member, shown) =>
    sink(imp.spec, member) !== null || imp.spec.startsWith('.')
      ? {
          kind: 'unfollowed',
          name: shown,
          why: `is also bound locally in ${mod.file}, so the import is not taken as it`
        }
      : null
  if (ts.isIdentifier(e)) {
    if (ctx.env?.has(e.text)) return null
    if (mod.ambiguous.has(e.text))
      return ambiguous(mod.imports.get(e.text), mod.imports.get(e.text).imported, e.text)
    const imp = mod.imports.get(e.text)
    if (imp) {
      if (!imp.spec.startsWith('.')) return imp.imported === '*' ? null : sink(imp.spec, imp.imported)
      if (imp.imported === 'default' || imp.imported === '*') return null
      const target = relative(imp)
      const found =
        target === null ? null : exportedFunction(root, load(root, target, cache), imp.imported, tsx, cache)
      return found ? { kind: 'helper', name: e.text, ...found } : null
    }
    const fn = mod.functions.get(e.text)
    return fn ? { kind: 'helper', name: e.text, fn, mod } : null
  }
  if (ts.isPropertyAccessExpression(e)) {
    let obj = strip(e.expression)
    if (ts.isPropertyAccessExpression(obj) && obj.name.text === 'promises') obj = strip(obj.expression)
    if (!ts.isIdentifier(obj) || ctx.env?.has(obj.text)) return null
    const shown = `${obj.text}.${e.name.text}`
    const imp = mod.imports.get(obj.text)
    if (!imp || (imp.imported !== 'default' && imp.imported !== '*')) return null
    if (mod.ambiguous.has(obj.text)) return ambiguous(imp, e.name.text, shown)
    if (!imp.spec.startsWith('.')) return sink(imp.spec, e.name.text)
    // `import * as h from './helpers.mjs'; h.read(…)`: the namespace's export is followed like a named import.
    const target = relative(imp)
    if (target === null) return null
    if (imp.imported === '*') {
      const found = exportedFunction(root, load(root, target, cache), e.name.text, tsx, cache)
      return found ? { kind: 'helper', name: shown, ...found } : null
    }
    return {
      kind: 'unfollowed',
      name: shown,
      why: `is a member of ${imp.spec}'s default export, which is not followed`
    }
  }
  return null
}

/** Is `node` inside the body of one of the named helper functions of `mod` (followed at its call sites)? */
const helperNodes = new WeakMap()
const isHelperBody = (node, mod) => {
  let nodes = helperNodes.get(mod)
  if (!nodes) helperNodes.set(mod, (nodes = new Set(mod.functions.values())))
  return nodes.has(node)
}

/**
 * Product files the given test files exercise.
 * @param {string[]} testFiles - test files as the command names them, relative to `cwd`.
 * @param {{cwd?: string, tsx?: boolean, root?: string}} [o] - `cwd` of the command, `tsx` when it runs under tsx.
 * @returns {{sources: string[], unresolved: string[]}} `file:line` entries (sorted, all of them) and the places a
 *   path could not be followed, each as `file:line reason` (`file (argument) reason` for a command argument).
 */
// Parsed modules per root, shared by every call: a module never changes after `load`, and re-parsing each
// case's whole import graph made a full unit generation take longer than ten minutes.
const PARSED = new Map()

export function productSourcesOf(testFiles, { cwd = '.', tsx = false, root = REPO } = {}) {
  const found = new Map()
  const unresolved = new Set()
  if (!PARSED.has(root)) PARSED.set(root, new Map())
  const cache = PARSED.get(root)
  const scanned = new Set()
  // Modules on the current scan path: one that runs itself under a new cwd would otherwise recurse without end.
  const active = new Set()
  const followed = new Map()
  // Helper walks being recorded (see `call`): every gap and reach below them is appended to each, so a later
  // call of the same helper with the same values replays them at its own call site instead of walking again.
  const recording = []
  const gap = (where, why) => {
    for (const r of recording) r.events.push(where === r.at ? { why } : { where, why })
    unresolved.add(`${where} ${why}`)
  }
  const atSite = (r, where) => (where === r.at ? {} : { where })

  /**
   * Record a file the code reaches: a product source, or a test/helper module to follow. `dir` is the cwd that
   * module runs with (a child process's own `cwd`; null when not known), which its relative paths are read against.
   */
  const reach = (target, names, where, dir) => {
    if (!CODE_EXT.test(target)) return
    for (const r of recording) r.events.push({ target, names, dir, ...atSite(r, where) })
    if (NON_PRODUCT.test(target)) {
      if (JS_EXT.test(target) && !target.includes('node_modules/')) scanModule(target, dir)
      return
    }
    if (found.has(target)) return
    const at = JS_EXT.test(target)
      ? declLine(root, target, names, cache)
      : { line: firstCodeLine(root, target) }
    if (at.line === null) gap(where, `${target} ${at.why ?? 'has no code line to point at'}`)
    else found.set(target, at.line)
  }

  /** Follow one call: an import, a read, a process call or a helper, with `ctx.env` for a helper's parameters. */
  const call = (n, ctx, where, stack) => {
    const { mod } = ctx
    const here = `${mod.file}:${lineOf(mod.sf, n)}`
    const at = where ?? here
    const first = n.arguments[0]
    const isImport = n.expression.kind === ts.SyntaxKind.ImportKeyword
    if ((isImport || calleeName(n.expression) === 'require') && first) {
      const lit = strip(first)
      if (ts.isStringLiteral(lit) || ts.isNoSubstitutionTemplateLiteral(lit))
        importRef(mod, lit.text, [], at, ctx.cwd)
      else if (isImport) gap(here, 'import() with a computed specifier')
      else if (!mod.ambiguous.has('require') && !mod.functions.has('require'))
        gap(here, 'require() with a computed specifier')
      return
    }
    const callee = calleeOf(n.expression, ctx)
    if (callee === null) return
    if (callee.kind === 'unfollowed') {
      // Only worth stating when the call is handed a path or a file: anything else names nothing to miss.
      const named = argValues(n.arguments, ctx).values.some((v) => {
        if (v === null || !PATHS.has(v.k)) return false
        const p = asPath(v, ctx.cwd)
        return v.k !== 's' || (p !== null && regularFile(root, p) !== null)
      })
      if (named) gap(here, `${callee.name}() ${callee.why}`)
      return
    }
    if (callee.kind === 'read') {
      if (!first) return
      if (OPEN_SINKS.has(callee.name) && n.arguments[1] && WRITE_FLAG.test(n.arguments[1].getText())) return
      const p = asPath(evaluate(first, ctx), ctx.cwd)
      // Charged to the read itself: one place to fix, however many call sites reach it.
      if (p === null) return gap(here, `${callee.name}() with a computed path`)
      const target = regularFile(root, p)
      if (target === null) return gap(at, `${callee.name}() names ${p}, which is not a file`)
      return reach(target, [], at, ctx.cwd)
    }
    if (callee.kind === 'run') {
      const cmd = first ? evaluate(first, ctx) : null
      const rest = argValues(n.arguments.slice(1, 2), ctx).values[0]
      // `spawn(cmd, options)` passes no argv; anything else in that place that is not an array is not known.
      const second = n.arguments[1] && strip(n.arguments[1])
      if (
        second &&
        !ts.isArrowFunction(second) &&
        !ts.isFunctionExpression(second) &&
        !['a', 'any', 'o'].includes(rest?.k)
      )
        gap(at, `${callee.name}() runs computed arguments`)
      // The child's own `cwd` is what its relative paths are read against; one not known leaves them unknown.
      // A function in that place is the callback (`execFile(cmd, args, cb)`), not options.
      const optNode = n.arguments[rest?.k === 'o' ? 1 : 2]
      const callback =
        optNode && (ts.isArrowFunction(strip(optNode)) || ts.isFunctionExpression(strip(optNode)))
      let runCwd = ctx.cwd
      if (optNode && !callback) {
        const options = rest?.k === 'o' ? rest : argValues([optNode], ctx).values[0]
        if (options?.k === 'o' && options.v.has('cwd')) {
          const dir = options.v.get('cwd')
          runCwd = dir === null || !PATHS.has(dir.k) ? null : asPath(dir, ctx.cwd)
        } else if (options?.k !== 'o' || options.open) runCwd = null
      }
      const pathOf = (v) => asPath(v, runCwd)
      // One argv per alternative: a file run in any of them is run by some call, and only passed along otherwise.
      const roles = {
        scripts: [],
        loads: [],
        reads: [],
        data: [],
        unknown: false,
        inline: false,
        command: ''
      }
      for (const argv of rest?.k === 'any'
        ? rest.v.map((x) => x.v)
        : [rest?.k === 'a' ? rest.v : rest ? [rest] : []]) {
        const one = argvRoles(callee.name, cmd, argv)
        for (const key of ['scripts', 'loads', 'reads', 'data']) roles[key].push(...one[key])
        roles.unknown ||= one.unknown
        roles.inline ||= one.inline
        roles.command ||= one.command
      }
      const used = new Set(
        [...roles.scripts, ...roles.loads].map((v) => (v === null || !PATHS.has(v.k) ? null : pathOf(v)))
      )
      roles.data = roles.data.filter((v) => v === null || !PATHS.has(v.k) || !used.has(pathOf(v)))
      const runs = (v, what) => {
        const p = pathOf(v)
        if (p === null) return gap(at, `${callee.name}() ${what} a computed path`)
        const target = regularFile(root, p)
        if (target !== null) return reach(target, [], at, runCwd)
        // A shell command line is not a path, even when it ends in a code extension.
        if (CODE_EXT.test(p) && !/\s/.test(p) && !p.split('/').pop().startsWith('-'))
          gap(at, `${callee.name}() runs ${p}, which is not a file`)
      }
      if (roles.unknown) gap(at, `${callee.name}() runs a computed command`)
      for (const v of roles.scripts) runs(v, 'runs')
      for (const v of roles.loads) runs(v, 'loads')
      // A reader's operands are patterns and flags as well as files: only an operand naming a file counts.
      for (const v of roles.reads) {
        const p = v === null || !PATHS.has(v.k) ? null : pathOf(v)
        const target = p === null ? null : regularFile(root, p)
        if (target !== null) reach(target, [], at, runCwd)
        else if (runCwd === null && v?.k === 's' && CODE_EXT.test(v.v))
          gap(at, `${callee.name}() reads ${v.v} from a cwd that is not known`)
      }
      // A file only passed along (to `git`, `echo`, a script's own arguments, an unknown command) is not run.
      for (const v of roles.data) {
        const p = v === null || v.k === 'a' ? null : pathOf(v)
        const target = p === null ? null : regularFile(root, p)
        if (target !== null && CODE_EXT.test(target))
          gap(
            at,
            `${callee.name}() passes ${target} to ${roles.unknown ? 'a computed command' : roles.command}; not proven to run it`
          )
      }
      // A path interpolated into an inline script reaches the child only where the script loads, runs or reads it.
      // Only the inline code element itself runs: found by its index when the argv is one literal array with no
      // spread before it (otherwise no interpolation is taken as loaded).
      const inline = new Set()
      const lit = second && ts.isArrayLiteralExpression(second) ? second.elements : null
      if (rest?.k === 'a' && lit) {
        const at = argvRoles(callee.name, cmd, rest.v).inlineAt
        if (at >= 0 && at < lit.length && !lit.slice(0, at + 1).some((x) => ts.isSpreadElement(x)))
          for (const x of interpolated([lit[at]])) inline.add(x.expr)
      }
      for (const { expr, before } of interpolated(n.arguments)) {
        const p = pathOf(evaluate(expr, ctx))
        const target = p === null ? null : regularFile(root, p)
        if (target === null) continue
        // Only inline code an interpreter runs (`node -e`, `bash -c`); the same text handed to `echo` runs nothing.
        if (inline.has(expr) && INLINE_LOADS.test(before)) reach(target, [], at, runCwd)
        else
          gap(
            at,
            roles.inline
              ? `${callee.name}() interpolates ${target} into an inline script that is not shown to load it`
              : `${callee.name}() interpolates ${target} into an argument of ${roles.unknown ? 'a computed command' : roles.command}; not proven to run it`
          )
      }
      return
    }
    // A helper: follow its body with the caller's values bound to its parameters.
    for (const r of recording) {
      r.deepest = Math.max(r.deepest, stack.length - r.base)
      r.fns.add(callee.fn)
    }
    if (stack.includes(callee.fn)) {
      // A cut cycle makes the walks around it depend on the path taken, so none of them is replayed.
      for (const r of recording) r.cut = true
      return
    }
    if (stack.length >= MAX_DEPTH) {
      for (const r of recording) r.cut = true
      return gap(at, `${callee.name}() is nested too deep to follow`)
    }
    if (callee.mod.parseError)
      return gap(at, `${callee.name}() is in ${callee.mod.file}, which does not parse`)
    const { values, open } = argValues(n.arguments, ctx)
    const env = new Map()
    callee.fn.parameters.forEach((param, i) => {
      if (!ts.isIdentifier(param.name)) return
      if (param.dotDotDotToken) env.set(param.name.text, open ? null : { k: 'a', v: values.slice(i) })
      else if (i < values.length) env.set(param.name.text, values[i])
      else if (open) env.set(param.name.text, null)
      else
        env.set(
          param.name.text,
          param.initializer ? evaluate(param.initializer, { ...ctx, mod: callee.mod, env: null }) : null
        )
    })
    // The same helper with the same bound values reaches the same files and gaps; every gap inside it is
    // charged to the outer call site `at`. So it is walked once and its events are replayed at the next call
    // site, which keeps a helper graph called from many places linear instead of exponential.
    const key = `${ctx.cwd}\u0000${JSON.stringify([...env], (_, x) => (x instanceof Map ? { map: [...x] } : x))}`
    let memo = followed.get(callee.fn)
    if (!memo) followed.set(callee.fn, (memo = new Map()))
    const done = memo.get(key)
    // A replay equals a fresh walk only when that walk would meet no depth cut (the deepest helper call recorded,
    // moved to this call's depth, stays under MAX_DEPTH) and no cycle (none of its helpers is already on the stack).
    if (done && stack.length + done.deepest < MAX_DEPTH && ![...done.fns].some((f) => stack.includes(f))) {
      for (const r of recording) {
        r.deepest = Math.max(r.deepest, stack.length + done.deepest - r.base)
        for (const f of done.fns) r.fns.add(f)
      }
      for (const e of done.events)
        if (e.target) reach(e.target, e.names, e.where ?? at, e.dir)
        else gap(e.where ?? at, e.why)
      return
    }
    const rec = { at, events: [], base: stack.length, deepest: -Infinity, fns: new Set() }
    recording.push(rec)
    try {
      walk(callee.fn.body, { ...ctx, mod: callee.mod, env }, at, [...stack, callee.fn])
    } finally {
      recording.pop()
    }
    if (!rec.cut) memo.set(key, rec)
  }

  /** Visit every call under `node`, skipping named helper bodies (they are followed where they are called). */
  const walk = (node, ctx, where, stack) => {
    const visit = (n) => {
      if (n !== node && isHelperBody(n, ctx.mod)) return
      if (ts.isCallExpression(n)) call(n, ctx, where, stack)
      ts.forEachChild(n, visit)
    }
    visit(node)
  }

  const importRef = (mod, spec, names, where, dir) => {
    if (!spec.startsWith('.')) return
    const t = resolveImport(root, posix.join(posix.dirname(mod.file), spec), tsx)
    if (t === null) gap(where, `import '${spec}' does not resolve to a source file`)
    else reach(t, names, where, dir)
  }

  /** Follow a test file or helper module: its imports, its calls, and helpers passed on as values. */
  function scanModule(file, dir = cwd) {
    // The same module run with another cwd reads its relative paths elsewhere, so it is scanned again.
    const key = `${dir}\u0000${file}`
    if (scanned.has(key)) return
    if (active.has(file)) return gap(`${file}:1`, 'runs itself again under another cwd; not followed')
    scanned.add(key)
    active.add(file)
    try {
      scanBody(file, dir)
    } finally {
      active.delete(file)
    }
  }

  function scanBody(file, dir) {
    const mod = load(root, file, cache)
    if (mod.readError) return gap(`${file}:1`, 'the file cannot be read')
    if (mod.parseError) return gap(`${file}:${mod.parseError.line}`, 'the file does not parse')
    const ctx = { root, cwd: dir, cache, mod, tsx, env: null }
    const escaping = new Set()
    const visit = (n) => {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier &&
        ts.isStringLiteral(n.moduleSpecifier)
      ) {
        const names = []
        const c = ts.isImportDeclaration(n) ? n.importClause : undefined
        if (c?.namedBindings && ts.isNamedImports(c.namedBindings))
          for (const el of c.namedBindings.elements) names.push((el.propertyName ?? el.name).text)
        if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause))
          for (const el of n.exportClause.elements) names.push((el.propertyName ?? el.name).text)
        importRef(mod, n.moduleSpecifier.text, names, `${file}:${lineOf(mod.sf, n)}`, dir)
        return
      }
      // A helper used as a value (a callback, an export) runs with arguments this file does not show.
      if (
        ts.isIdentifier(n) &&
        mod.functions.has(n.text) &&
        !(ts.isCallExpression(n.parent) && n.parent.expression === n) &&
        !(ts.isFunctionDeclaration(n.parent) && n.parent.name === n) &&
        !(ts.isVariableDeclaration(n.parent) && n.parent.name === n)
      )
        escaping.add(n.text)
      if (n !== mod.sf && isHelperBody(n, mod)) return
      if (ts.isCallExpression(n)) call(n, ctx, null, [])
      ts.forEachChild(n, visit)
    }
    visit(mod.sf)
    for (const name of escaping) {
      const fn = mod.functions.get(name)
      walk(fn.body ?? fn, ctx, null, [fn])
    }
  }

  for (const arg of testFiles) {
    if (!JS_EXT.test(arg)) continue
    const path = posix.join(cwd, arg)
    if (arg.includes('*')) {
      gap(`${path} (argument)`, 'is a pattern, not a file')
      continue
    }
    const t = regularFile(root, path)
    if (t === null) gap(`${path} (argument)`, 'is not a file')
    else {
      if (!NON_PRODUCT.test(t)) reach(t, [], `${t} (argument)`, cwd)
      scanModule(t)
    }
  }
  return {
    sources: [...found].map(([f, l]) => `${f}:${l}`).sort(),
    unresolved: [...unresolved].sort()
  }
}
