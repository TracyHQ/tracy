// Finds the raw filesystem reads in a JavaScript source, so a policy selftest can insist that every read of a
// contract or evidence file goes through the bounded reader. The scan is syntactic: it looks at imports of the
// filesystem modules and at direct calls through those bindings, and it does not follow data flow, so an aliased
// method (`const rd = fs.readFileSync; rd(file)`) or a namespace assigned after its declaration is not seen.
// The forms below that it recognises as unclassifiable are reported as `unsupported`, never skipped.
//
// Supported: static imports of node:fs / fs / node:fs/promises / fs/promises (named, default, namespace,
// aliased), `import('node:fs...')` with a string literal (awaited and destructured, awaited and bound, or
// `.then`), and member reads through any of those bindings, including `.promises`. Unsupported (reported):
// require(), a dynamic import with a non-literal specifier, `createRequire`, a filesystem binding that is passed
// on, returned, reassigned or accessed with a computed key.
import * as acorn from 'acorn'

const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises'])
// Methods that deliver the bytes of a file (or open a handle to read them).
const READ_METHODS = new Set([
  'readFile',
  'readFileSync',
  'createReadStream',
  'open',
  'openSync',
  'readSync',
  'read',
  'readv',
  'readvSync'
])

// open()/openSync() with a write-only mode (a lock or a log being created) does not read anything.
const WRITE_ONLY_FLAGS = /^(?:w|wx|xw|a|ax|xa|as|sa)$/
function opensForWriteOnly(node) {
  const flag = node.arguments[1]
  if (flag?.type === 'Literal' && typeof flag.value === 'string') return WRITE_ONLY_FLAGS.test(flag.value)
  // constants.O_WRONLY | constants.O_CREAT | ...: write-only when O_WRONLY is named and O_RDWR is not.
  if (flag?.type === 'BinaryExpression' || flag?.type === 'MemberExpression') {
    const names = []
    walk(flag, (n) => {
      if (n.type === 'Identifier') names.push(n.name)
    })
    return names.includes('O_WRONLY') && !names.includes('O_RDWR')
  }
  return false
}

const isFsSpecifier = (node) => node?.type === 'Literal' && FS_MODULES.has(node.value)

function walk(node, visit, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return
  visit(node, parent, key)
  for (const [k, value] of Object.entries(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue
    if (Array.isArray(value)) for (const item of value) walk(item, visit, node, k)
    else if (value && typeof value === 'object') walk(value, visit, node, k)
  }
}

function parse(text) {
  const options = { ecmaVersion: 'latest', locations: true, allowHashBang: true }
  try {
    return acorn.parse(text, { ...options, sourceType: 'module' })
  } catch {
    return acorn.parse(text, { ...options, sourceType: 'script' })
  }
}

/** @returns {{ reads: {line:number, via:string, node:object}[], unsupported: {line:number, why:string}[] }} */
export function scanSource(text) {
  const ast = parse(text)
  const readNames = new Map() // local identifier → read method it is bound to
  const spaces = new Set() // local identifiers bound to a whole fs module (or its .promises)
  const reads = []
  const unsupported = []
  const requires = new Set(['require'])
  const bad = (node, why) => unsupported.push({ line: node.loc.start.line, why })

  const bindPattern = (pattern, node) => {
    if (pattern.type === 'Identifier') spaces.add(pattern.name)
    else if (pattern.type === 'ObjectPattern') {
      for (const prop of pattern.properties) {
        if (prop.type !== 'Property' || prop.computed || prop.key.type !== 'Identifier') {
          bad(node, 'destructuring of a filesystem module that is not a plain { name } pattern')
          continue
        }
        const target = prop.value.type === 'AssignmentPattern' ? prop.value.left : prop.value
        if (target.type !== 'Identifier') bad(node, 'nested destructuring of a filesystem module')
        else if (READ_METHODS.has(prop.key.name)) readNames.set(target.name, prop.key.name)
        else if (prop.key.name === 'promises') spaces.add(target.name)
      }
    } else bad(node, 'unsupported binding of a filesystem module')
  }

  for (const stmt of ast.body) {
    // A JSON module import reads a data file without any fs call.
    if (stmt.type === 'ImportDeclaration' && String(stmt.source.value).endsWith('.json'))
      reads.push({ line: stmt.loc.start.line, via: 'import json', node: stmt })
    if (stmt.type !== 'ImportDeclaration' || !isFsSpecifier(stmt.source)) continue
    for (const spec of stmt.specifiers) {
      if (spec.type === 'ImportNamespaceSpecifier' || spec.type === 'ImportDefaultSpecifier')
        spaces.add(spec.local.name)
      else if (READ_METHODS.has(spec.imported.name ?? spec.imported.value))
        readNames.set(spec.local.name, spec.imported.name ?? spec.imported.value)
      else if ((spec.imported.name ?? spec.imported.value) === 'promises') spaces.add(spec.local.name)
    }
  }

  // Dynamic imports and require() first, so their bindings exist before the reads are matched.
  walk(ast, (node, parent) => {
    // require('fs') is supported only as `const x = require('fs')` / `const { a } = require('fs')`; a require()
    // of any other literal loads code and cannot read a file by itself; a computed one is not analysed.
    if (
      node.type === 'VariableDeclarator' &&
      node.init?.type === 'CallExpression' &&
      node.init.callee.name === 'createRequire'
    )
      requires.add(node.id.name)
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      requires.has(node.callee.name)
    ) {
      const arg = node.arguments[0]
      if (arg?.type !== 'Literal') bad(node, 'require() of a computed module is not analysed')
      else if (String(arg.value).endsWith('.json'))
        reads.push({ line: node.loc.start.line, via: 'require json', node })
      else if (FS_MODULES.has(arg.value)) {
        if (parent?.type === 'VariableDeclarator' && parent.init === node) bindPattern(parent.id, parent)
        else bad(node, 'require() of a filesystem module outside a declaration')
      }
    }
    if (node.type === 'ImportExpression') {
      // A computed specifier loads code (a path or URL built at run time); only a literal can name a filesystem module.
      if (!node.source || node.source.type !== 'Literal') return
      if (!FS_MODULES.has(node.source.value)) return
      let holder = parent
      if (holder?.type === 'AwaitExpression') holder = null
      // await import(...) → find the declarator or assignment that owns the await.
      node._fs = true
    }
  })
  // Resolve each fs ImportExpression to what it is bound to.
  walk(ast, (node, parent) => {
    if (node.type === 'VariableDeclarator' && node.init) {
      const init = node.init.type === 'AwaitExpression' ? node.init.argument : node.init
      if (init.type === 'ImportExpression' && init._fs) bindPattern(node.id, node)
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const object = node.callee.object
      const prop = node.callee.property
      if (object.type === 'ImportExpression' && object._fs && prop.name === 'then') {
        const fn = node.arguments[0]
        if (fn?.params?.[0]) bindPattern(fn.params[0], node)
        else bad(node, 'import(...).then without a callback parameter')
      }
    }
    if (node.type === 'ImportExpression' && node._fs && parent) {
      const direct =
        parent.type === 'AwaitExpression'
          ? true
          : parent.type === 'MemberExpression' && parent.property.name === 'then'
      const awaitedDecl = parent.type === 'AwaitExpression'
      if (!direct && !awaitedDecl) bad(node, 'import() of a filesystem module in an unsupported position')
    }
  })

  const spaceRoot = (expr) => {
    if (expr.type === 'Identifier') return spaces.has(expr.name)
    if (expr.type === 'MemberExpression' && !expr.computed && expr.property.name === 'promises')
      return spaceRoot(expr.object)
    return false
  }

  walk(ast, (node, parent, key) => {
    if (node.type === 'CallExpression') {
      const callee = node.callee
      const opens = (name) => (name === 'open' || name === 'openSync') && opensForWriteOnly(node)
      if (callee.type === 'Identifier' && readNames.has(callee.name) && !opens(readNames.get(callee.name)))
        reads.push({ line: node.loc.start.line, via: callee.name, node })
      else if (callee.type === 'MemberExpression') {
        if (spaceRoot(callee.object)) {
          if (callee.computed) bad(node, 'computed member on a filesystem module')
          else if (READ_METHODS.has(callee.property.name) && !opens(callee.property.name))
            reads.push({ line: node.loc.start.line, via: callee.property.name, node })
        }
      }
    }
    // A filesystem namespace used as a value (passed, returned, assigned) escapes the analysis.
    if (node.type === 'Identifier' && spaces.has(node.name)) {
      const asObject = parent?.type === 'MemberExpression' && key === 'object'
      const propertyName =
        (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
        (parent?.type === 'Property' && key === 'key' && !parent.computed)
      const declaration =
        parent?.type === 'ImportNamespaceSpecifier' || parent?.type === 'ImportDefaultSpecifier'
      const declarator = parent?.type === 'VariableDeclarator' && key === 'id'
      if (!asObject && !propertyName && !declaration && !declarator)
        bad(node, `filesystem binding "${node.name}" used as a value`)
    }
    if (
      node.type === 'MemberExpression' &&
      node.computed &&
      node.object.type === 'Identifier' &&
      spaces.has(node.object.name)
    )
      bad(node, 'computed member on a filesystem module')
  })
  return { reads, unsupported }
}
