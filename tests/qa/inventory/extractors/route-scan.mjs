// Static route scanner for Hono-style registrations (`app.get('/x', h)`, `app.on(['GET','POST'], '/x', h)`,
// `app.route('/prefix', factory(...))`). It parses source with the TypeScript AST and follows relative
// imports from a composition root. It never imports or runs product code. Anything it cannot resolve
// (a computed path, a dynamic mount prefix, a factory it cannot find, `app` passed to a helper) is
// returned in `unresolved` with a location: it is never guessed.

import { dirname, join, normalize } from 'node:path'
import ts from 'typescript'
import { SourceError, loc, parse, readSource, strip } from './common.mjs'

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'])

/** A string known without running anything: a literal, a template or `+` of known parts, or a same-file `const` of those. */
const literalText = (n, consts = new Map(), seen = new Set()) => {
  const x = strip(n)
  if (!x) return null
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return x.text
  if (ts.isTemplateExpression(x)) {
    let out = x.head.text
    for (const span of x.templateSpans) {
      const v = literalText(span.expression, consts, seen)
      if (v === null) return null
      out += v + span.literal.text
    }
    return out
  }
  if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = literalText(x.left, consts, seen)
    const b = literalText(x.right, consts, seen)
    return a !== null && b !== null ? a + b : null
  }
  if (ts.isIdentifier(x) && consts.has(x.text) && !seen.has(x.text))
    return literalText(consts.get(x.text), consts, new Set([...seen, x.text]))
  return null
}

const fileConsts = (sf) => {
  const map = new Map()
  for (const st of sf.statements)
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.initializer) map.set(d.name.text, d.initializer)
  return map
}

/** `/x/:id` and `/x/{id}` both become `/x/{id}`. */
export const normalizePath = (p) =>
  p
    .replace(/:([A-Za-z0-9_]+)(\{[^}]*\})?\??/g, '{$1}')
    .replace(/\/{2,}/g, '/')
    .replace(/(.)\/$/, '$1')
export const joinPath = (prefix, path) =>
  normalizePath(`${prefix === '/' ? '' : prefix}${path.startsWith('/') ? path : `/${path}`}` || '/')

const mounted = (r, conditional = false) => ({
  ...r,
  via: 'mounted',
  conditional: r.conditional || conditional
})

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (c) => walk(c, visit))
}

const isFunctionLike = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isArrowFunction(n) ||
  ts.isFunctionExpression(n) ||
  ts.isMethodDeclaration(n)

const bindingNames = (name, out = []) => {
  if (ts.isIdentifier(name)) out.push(name.text)
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    for (const el of name.elements) if (ts.isBindingElement(el)) bindingNames(el.name, out)
  return out
}

const isHonoInit = (init) => !!init && ts.isNewExpression(init) && init.expression.getText() === 'Hono'

/** What a statement list declares as `name`: a function, a Hono instance, an import, or anything else. */
function declaredIn(statements, name) {
  for (const st of statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) return { kind: 'function', node: st }
    if (ts.isClassDeclaration(st) && st.name?.text === name) return { kind: 'other', node: st }
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations) {
        if (!bindingNames(d.name).includes(name)) continue
        const init = d.initializer && ts.isIdentifier(d.name) ? strip(d.initializer) : null
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)))
          return { kind: 'function', node: init }
        if (isHonoInit(init)) return { kind: 'hono', node: d }
        return { kind: 'other', node: d }
      }
  }
  return null
}

/**
 * Lexical binding of `name` as seen from `from`, looking outward (up to and including `stop` when given).
 * Returns `{ kind, node }` for the nearest declaration of any kind (parameter, catch variable, loop variable,
 * function, class, variable, import), or null when the name is free. A nearer non-function binding shadows an
 * outer function of the same name, so callers never fall back to a function or receiver of the same name.
 */
function lookup(from, name, stop = null) {
  for (let n = from.parent; n; n = n.parent) {
    if (isFunctionLike(n)) {
      const p = n.parameters.find((q) => bindingNames(q.name).includes(name))
      if (p) return { kind: 'param', node: p }
      if (ts.isFunctionExpression(n) && n.name?.text === name) return { kind: 'function', node: n }
    }
    if (
      ts.isCatchClause(n) &&
      n.variableDeclaration &&
      bindingNames(n.variableDeclaration.name).includes(name)
    )
      return { kind: 'other', node: n }
    if (
      (ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n)) &&
      n.initializer &&
      ts.isVariableDeclarationList(n.initializer)
    ) {
      const d = n.initializer.declarations.find((x) => bindingNames(x.name).includes(name))
      if (d) return { kind: 'other', node: d }
    }
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n)) {
      const d = declaredIn(n.statements, name)
      if (d) return d
      if (ts.isSourceFile(n) && importMap(n).has(name)) return { kind: 'import', node: n }
    }
    if (stop && n === stop) return null
  }
  return null
}

/** The function node `name` is bound to at `from`, searching no further out than `scope`. */
function resolveFunction(from, name, scope) {
  const d = lookup(from, name, scope)
  return d?.kind === 'function' ? d.node : null
}

const isImmediatelyInvoked = (fn) => {
  let n = fn
  while (n.parent && ts.isParenthesizedExpression(n.parent)) n = n.parent
  return !!n.parent && ts.isCallExpression(n.parent) && n.parent.expression === n
}

/** An identifier read as a value: not a declaration or property name, and not the callee of a call. */
function isValueReference(id) {
  const p = id.parent
  if (!p) return false
  if (ts.isShorthandPropertyAssignment(p)) return true
  if (p.name === id) return false
  if (ts.isPropertyAssignment(p) && p.name === id) return false
  if (ts.isCallExpression(p) && p.expression === id) return false
  if (ts.isExportSpecifier(p) || ts.isImportSpecifier(p)) return false
  return true
}

const LOOPS = (n) =>
  ts.isForStatement(n) ||
  ts.isForInStatement(n) ||
  ts.isForOfStatement(n) ||
  ts.isWhileStatement(n) ||
  ts.isDoStatement(n)

/** Does `node` contain a return/throw/break/continue that is not inside a nested function? */
function exits(node) {
  let found = false
  const go = (n) => {
    if (found) return
    if (isFunctionLike(n)) return
    if (
      ts.isReturnStatement(n) ||
      ts.isThrowStatement(n) ||
      ts.isBreakStatement(n) ||
      ts.isContinueStatement(n)
    ) {
      found = true
      return
    }
    ts.forEachChild(n, go)
  }
  go(node)
  return found
}

/** Is `child` (of `parent`) run only sometimes? The grammar confirms unconditional statements only. */
function conditionalChild(parent, child) {
  if (ts.isIfStatement(parent)) return child === parent.thenStatement || child === parent.elseStatement
  if (ts.isConditionalExpression(parent)) return child === parent.whenTrue || child === parent.whenFalse
  if (ts.isBinaryExpression(parent)) {
    const k = parent.operatorToken.kind
    return (
      child === parent.right &&
      (k === ts.SyntaxKind.AmpersandAmpersandToken ||
        k === ts.SyntaxKind.BarBarToken ||
        k === ts.SyntaxKind.QuestionQuestionToken)
    )
  }
  if (LOOPS(parent)) return child === parent.statement
  if (ts.isCaseBlock(parent) || ts.isCatchClause(parent)) return true
  if (ts.isOptionalChain(parent)) return true
  return false
}

/**
 * Visit what a scope actually runs, as `visit(node, conditional)`. A function the scope merely declares is
 * entered only when the scope calls it, resolved by lexical binding (not by a bare name), so
 * `function dormant() { app.get('/x', h) }` registers nothing and two inner functions with one name stay
 * apart. A function used as a value (a route handler, a `forEach` callback) is not run at registration time:
 * it is handed to `onSkipped`, which decides whether it hides registrations. `conditional` is true under an
 * `if`/`?:`/`&&`/loop/`switch`/`catch` or after a statement that may leave the block early; such code is
 * visited so the caller can report it, but must not be confirmed. Anything not provably run stays out of the
 * routes (and so out of `inCode`).
 */
function walkReachable(scope, visit, onSkipped = () => {}) {
  const entered = new Set()
  const skippedValue = new Set()
  const go = (node, isScope, cond) => {
    if (!isScope && isFunctionLike(node) && !isImmediatelyInvoked(node)) {
      const bound = ts.isFunctionDeclaration(node) || (node.parent && ts.isVariableDeclaration(node.parent))
      if (!bound) onSkipped(node)
      return
    }
    visit(node, cond)
    if (ts.isIdentifier(node) && isValueReference(node)) {
      // A named function handed around as a value (`routes.forEach(register)`): when it runs is unknown.
      const fn = resolveFunction(node, node.text, scope)
      if (fn && !skippedValue.has(fn)) {
        skippedValue.add(fn)
        onSkipped(fn)
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fn = resolveFunction(node, node.expression.text, scope)
      const key = fn && `${cond}:${nodeId(fn)}`
      if (fn && !entered.has(key)) {
        entered.add(key)
        go(fn, true, cond)
      }
    }
    let exited = false
    ts.forEachChild(node, (c) => {
      const isList = ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node)
      go(c, false, cond || conditionalChild(node, c) || (isList && exited))
      if (isList && exits(c)) exited = true
    })
  }
  go(scope, true, false)
}

let nextId = 0
const ids = new WeakMap()
const nodeId = (n) => {
  if (!ids.has(n)) ids.set(n, ++nextId)
  return ids.get(n)
}

function importMap(sf) {
  const map = new Map()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !st.importClause) continue
    const spec = st.moduleSpecifier.text
    const nb = st.importClause.namedBindings
    if (nb && ts.isNamedImports(nb))
      for (const el of nb.elements)
        map.set(el.name.text, { spec, imported: (el.propertyName ?? el.name).text })
    if (st.importClause.name) map.set(st.importClause.name.text, { spec, imported: 'default' })
  }
  return map
}

function findFunction(sf, name) {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) {
          const init = strip(d.initializer)
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init
        }
      }
    }
  }
  return null
}

const REGISTERING = (m) => METHODS.has(m) || m === 'on' || m === 'route'

const chainRoot = (e) => {
  let x = strip(e)
  for (;;) {
    if (ts.isCallExpression(x) || ts.isPropertyAccessExpression(x)) x = strip(x.expression)
    else return x
  }
}

const ownerFunction = (n) => {
  for (let x = n.parent; x; x = x.parent) if (isFunctionLike(x)) return x
  return null
}

/** The receivers a function returns by name (`return app`, or an expression-bodied arrow `() => app`). */
function returnedNodes(fn) {
  const out = []
  // `return Object.assign(app, { ... })` returns `app` itself; it is the one wrapper form the grammar accepts.
  const value = (e) => {
    const x = strip(e)
    return ts.isCallExpression(x) && x.expression.getText() === 'Object.assign' && x.arguments[0]
      ? strip(x.arguments[0])
      : x
  }
  if (fn.body && !ts.isBlock(fn.body)) out.push(value(fn.body))
  else
    walk(fn.body ?? fn, (n) => {
      if (n !== fn && isFunctionLike(n)) return
      if (ts.isReturnStatement(n) && n.expression) out.push(value(n.expression))
    })
  return out
}

/**
 * Resolve the callee identifier at a call site by its lexical binding: a function in scope, or a relative
 * import. A shadowing parameter/variable, a package import, a missing module or a function that is not there
 * all come back as `{ fail, detail }`; there is never a fallback to another function of the same name.
 */
function resolveCallee(ctx, sf, id) {
  const d = lookup(id, id.text)
  if (d?.kind === 'function') return { fn: d.node, sf }
  if (d?.kind === 'import') {
    const imp = importMap(sf).get(id.text)
    if (!imp.spec.startsWith('.'))
      return { fail: 'mount-factory-is-a-package', detail: `${id.text} from ${imp.spec}` }
    const mod = resolveModule(ctx.root, sf.fileName, imp.spec)
    if (!mod) return { fail: 'mount-module-not-found', detail: `${imp.imported} from ${imp.spec}` }
    ctx.read.set(mod.rel, mod)
    const msf = parse(mod.text, mod.rel)
    const fn = findFunction(msf, imp.imported)
    return fn ? { fn, sf: msf } : { fail: 'mount-factory-not-found', detail: `${imp.imported} in ${mod.rel}` }
  }
  return {
    fail: 'mount-factory-not-found',
    detail: d ? `${id.text} is bound to something that is not a function` : id.text
  }
}

/**
 * Scan one scope (a whole file or one factory function). Returns routes with the prefix applied.
 * `ctx` carries the root, caches and the shared unresolved list. A registration is confirmed only when it
 * is unconditional and its receiver reaches a root: the receiver the scope returns, the parameter a helper
 * was handed, or (for a file) an exported one. Everything else is reported, never confirmed.
 */
function scanScope({ ctx, sf, scope, prefix, depth, extraReceivers = [] }) {
  // A receiver is a binding proven to be a Hono instance (`const x = new Hono()`) or the parameter the caller
  // handed an app to. It is identified by its declaration node, never by name.
  const params = new Set(extraReceivers)
  const recvKey = (id) => {
    if (!ts.isIdentifier(id)) return null
    const d = lookup(id, id.text)
    if (d?.kind === 'hono') return d.node
    if (d?.kind === 'param' && params.has(d.node)) return d.node
    return null
  }
  const consts = fileConsts(sf)
  const text = (n) => literalText(n, consts)
  const found = []
  const mounts = []
  const helpers = []
  const hidden = (kind, n) =>
    ctx.unresolved.push({
      kind,
      detail: n.getText().slice(0, 80),
      loc: loc(sf, n),
      blocksComplete: true
    })
  const skippedRegistration = (fn) =>
    walk(fn, (n) => {
      if (!ts.isCallExpression(n)) return
      const viaMethod =
        ts.isPropertyAccessExpression(n.expression) &&
        recvKey(n.expression.expression) &&
        (REGISTERING(n.expression.name.text) || ['basePath', 'mount'].includes(n.expression.name.text))
      const viaHelper = ts.isIdentifier(n.expression) && n.arguments.some((a) => recvKey(a))
      if (viaMethod || viaHelper) hidden('registration-in-callback', n)
    })
  const ownScope = isFunctionLike(scope) ? scope : null
  const foreign = new Map()
  // A receiver declared in a function the scope merely calls belongs to that function: it counts when that
  // function is mounted as a factory (its own scan), and is reported when nothing ever mounts it.
  const isForeign = (key, at) => {
    const owner = ts.isParameter(key) ? null : ownerFunction(key)
    if (params.has(key) || owner === ownScope) return false
    if (!foreign.has(owner)) foreign.set(owner, at)
    return true
  }
  walkReachable(
    scope,
    (n, cond) => {
      if (ts.isIdentifier(n)) {
        const p = n.parent
        const ok =
          !isValueReference(n) ||
          !recvKey(n) ||
          (ts.isCallExpression(p) && p.expression !== n) ||
          ts.isReturnStatement(p) ||
          (ts.isArrowFunction(p) && p.body === n) ||
          ts.isExportAssignment(p) ||
          (ts.isPropertyAccessExpression(p) && p.expression === n)
        if (!ok) hidden('receiver-aliased', p)
        return
      }
      if (!ts.isCallExpression(n)) return
      if (ts.isIdentifier(n.expression)) {
        // `register(app, ...)`: a helper that adds routes to the app it is given; follow it when it is findable.
        const at = n.arguments.findIndex((a) => recvKey(a))
        if (at < 0) return
        if (cond) hidden('conditional-registration', n)
        helpers.push({
          node: n,
          id: n.expression,
          at,
          receiver: recvKey(n.arguments[at]),
          conditional: cond
        })
        return
      }
      if (!ts.isPropertyAccessExpression(n.expression)) return
      const target = n.expression.expression
      const method = n.expression.name.text
      if (!ts.isIdentifier(strip(target))) {
        const root = chainRoot(target)
        const rooted =
          (ts.isIdentifier(root) && recvKey(root)) ||
          (ts.isNewExpression(root) && root.expression.getText() === 'Hono')
        if (rooted && (REGISTERING(method) || ['basePath', 'mount'].includes(method)))
          hidden('chained-registration', n)
        return
      }
      const key = recvKey(strip(target))
      if (!key) return
      if (['basePath', 'mount'].includes(method)) {
        hidden('receiver-method-not-modelled', n)
        return
      }
      if (!REGISTERING(method)) return
      if (cond) hidden('conditional-registration', n)
      if (isForeign(key, n)) return
      if (METHODS.has(method)) {
        const path = text(n.arguments[0])
        if (path === null) {
          // `app.get(<non-literal>)`: could be the Hono option getter `c.get('key')` on a non-receiver; here the receiver IS an app.
          hidden('route-path-not-static', n)
          return
        }
        found.push({
          recv: key,
          methods: [method.toUpperCase()],
          path,
          loc: loc(sf, n),
          conditional: cond
        })
      } else if (method === 'on') {
        const m = strip(n.arguments[0])
        const methods = m && ts.isArrayLiteralExpression(m) ? m.elements.map(text) : [text(m)]
        const pa = strip(n.arguments[1])
        const paths = pa && ts.isArrayLiteralExpression(pa) ? pa.elements.map(text) : [text(pa)]
        if (methods.some((x) => x === null) || paths.some((x) => x === null)) {
          hidden('route-on-not-static', n)
          return
        }
        for (const path of paths)
          found.push({
            recv: key,
            methods: methods.map((x) => x.toUpperCase()),
            path,
            loc: loc(sf, n),
            conditional: cond
          })
      } else if (method === 'route') {
        mounts.push({ parent: key, node: n, conditional: cond })
      }
    },
    skippedRegistration
  )

  // Receiver -> effective prefix: roots take `prefix`; a receiver mounted with `.route(p, child)` takes parent + p.
  const childMounts = []
  for (const m of mounts) {
    const p = text(m.node.arguments[0])
    const arg = strip(m.node.arguments[1])
    if (p === null || !arg) {
      hidden('mount-prefix-not-static', m.node)
      continue
    }
    let expr = arg
    const childKey = recvKey(expr)
    if (childKey) {
      childMounts.push({ parent: m.parent, child: childKey, prefix: p, conditional: m.conditional })
      continue
    }
    if (ts.isIdentifier(expr)) {
      const d = lookup(expr, expr.text)
      if (d?.node && ts.isVariableDeclaration(d.node) && d.node.initializer) expr = d.node.initializer
    }
    expr = strip(expr)
    if (ts.isNewExpression(expr)) continue
    if (!ts.isCallExpression(expr) || !ts.isIdentifier(expr.expression)) {
      hidden('mount-target-not-a-factory-call', m.node)
      continue
    }
    childMounts.push({
      parent: m.parent,
      callee: expr.expression,
      prefix: p,
      node: m.node,
      conditional: m.conditional
    })
  }

  const roots = new Set(extraReceivers)
  if (!extraReceivers.length) {
    const names = []
    if (ownScope) names.push(...returnedNodes(ownScope))
    else
      for (const st of sf.statements) {
        if (ts.isExportAssignment(st)) names.push(strip(st.expression))
        else if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause?.elements)
          names.push(...st.exportClause.elements.map((e) => e.propertyName ?? e.name))
        else if (
          ts.isVariableStatement(st) &&
          st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        )
          for (const d of st.declarationList.declarations)
            if (ts.isIdentifier(d.name) && isHonoInit(d.initializer)) roots.add(d)
      }
    for (const id of names) {
      const k = recvKey(id)
      if (k) roots.add(k)
    }
  }
  const connected = (key, seen = new Set()) => {
    if (roots.has(key)) return true
    if (seen.has(key)) return false
    seen.add(key)
    return childMounts.some((c) => c.child === key && connected(c.parent, seen))
  }
  const orphans = new Map()
  const note = (key, loc_) => {
    if (!orphans.has(key)) orphans.set(key, loc_)
  }
  for (const r of found) if (!connected(r.recv)) note(r.recv, r.loc)
  for (const m of mounts) if (!connected(m.parent)) note(m.parent, loc(sf, m.node))
  for (const h of helpers) if (!connected(h.receiver)) note(h.receiver, loc(sf, h.node))
  for (const [key, at] of orphans)
    ctx.unresolved.push({
      kind: 'receiver-not-reaching-root',
      detail: `${key.name?.getText?.() ?? 'receiver'} is registered on but never returned or mounted into the returned app`,
      loc: at,
      blocksComplete: true
    })

  // Every way a receiver is reachable: one { prefix, conditional } per mount path (a child mounted at `/a` and
  // `/b` is served at both), conditional when any mount on that path runs only sometimes.
  const resolvePaths = (key, seen = new Set()) => {
    const vias = childMounts.filter((c) => c.child === key)
    if (roots.has(key) || !vias.length) return [{ prefix, conditional: false }]
    if (seen.has(key)) return []
    const next = new Set(seen).add(key)
    return vias.flatMap((via) =>
      resolvePaths(via.parent, next).map((p) => ({
        prefix: joinPath(p.prefix, via.prefix),
        conditional: p.conditional || !!via.conditional
      }))
    )
  }
  const routes = found
    .filter((r) => connected(r.recv))
    .flatMap((r) =>
      resolvePaths(r.recv).map((p) => ({
        methods: r.methods,
        path: joinPath(p.prefix, r.path),
        loc: r.loc,
        via: 'direct',
        conditional: r.conditional || p.conditional
      }))
    )

  const followed = new Set()
  for (const h of helpers) {
    if (!connected(h.receiver)) continue
    const r = resolveCallee(ctx, sf, h.id)
    const param = r.fn?.parameters[h.at]
    if (r.fail || !param || !ts.isIdentifier(param.name) || depth > 12) {
      ctx.unresolved.push({
        kind: 'helper-registration',
        detail: `${h.id.text}(<app>) registers routes through a helper that cannot be followed`,
        loc: loc(sf, h.node),
        blocksComplete: true
      })
      continue
    }
    followed.add(r.fn)
    for (const p of resolvePaths(h.receiver))
      routes.push(
        ...scanScope({
          ctx,
          sf: r.sf,
          scope: r.fn,
          prefix: p.prefix,
          depth: depth + 1,
          extraReceivers: [param]
        }).map((r) => mounted(r, h.conditional || p.conditional))
      )
  }

  for (const c of childMounts) {
    if (!c.callee || !connected(c.parent)) continue
    const parents = resolvePaths(c.parent)
    if (depth > 12) {
      ctx.unresolved.push({
        kind: 'mount-depth-exceeded',
        detail: c.callee.text,
        loc: loc(sf, c.node),
        blocksComplete: true
      })
      continue
    }
    const r = resolveCallee(ctx, sf, c.callee)
    if (r.fail) {
      ctx.unresolved.push({
        kind: r.fail,
        detail: r.detail,
        loc: loc(sf, c.node),
        blocksComplete: true
      })
      continue
    }
    followed.add(r.fn)
    for (const p of parents)
      routes.push(
        ...scanScope({
          ctx,
          sf: r.sf,
          scope: r.fn,
          prefix: joinPath(p.prefix, c.prefix),
          depth: depth + 1
        }).map((r) => mounted(r, c.conditional || p.conditional))
      )
  }
  for (const [owner, at] of foreign)
    if (!followed.has(owner))
      ctx.unresolved.push({
        kind: 'receiver-not-mounted',
        detail: 'a function that is called but whose app is never mounted registers routes',
        loc: loc(sf, at),
        blocksComplete: true
      })
  return routes
}

function resolveModule(root, fromFile, spec) {
  const base = normalize(join(dirname(fromFile), spec))
  for (const cand of [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.ts`,
    join(base, 'index.js'),
    join(base, 'index.mjs'),
    join(base, 'index.ts')
  ]) {
    try {
      return readSource(root, cand)
    } catch (error) {
      if (!(error instanceof SourceError) && error.code !== 'ENOENT') throw error
      if (error instanceof SourceError && !/ENOENT|not a regular file/.test(error.message)) throw error
    }
  }
  return null
}

/**
 * Scan from a composition-root file. `scope: 'file'` scans the whole file (routes registered directly
 * on `app`); route factories it mounts are followed through relative imports.
 */
export function scanFromRoot(root, rootRel, { entries = ['buildApp'] } = {}) {
  const ctx = { root, unresolved: [], read: new Map() }
  const src = readSource(root, rootRel)
  ctx.read.set(src.rel, src)
  const sf = parse(src.text, src.rel)
  // Reachable code of the root file: its top-level statements plus the exported entry functions named by the
  // caller (`buildApp`). Any other function counts only where something reachable calls it.
  const all = scanScope({ ctx, sf, scope: sf, prefix: '/', depth: 0 })
  for (const name of entries) {
    const fn = findFunction(sf, name)
    if (fn) all.push(...scanScope({ ctx, sf, scope: fn, prefix: '/', depth: 0 }))
    else
      ctx.unresolved.push({
        kind: 'entry-function-not-found',
        detail: `${name} in ${rootRel}`,
        blocksComplete: true
      })
  }
  // A factory's body is also part of the root file's syntax tree, so the plain scan sees its routes
  // without their mount prefix. A registration site reached through a mount is the right reading.
  const mountedAt = new Set(all.filter((r) => r.via === 'mounted').map((r) => r.loc))
  const byKey = new Map()
  for (const r of all.filter((x) => x.via === 'mounted' || !mountedAt.has(x.loc))) {
    const key = `${r.methods.join()} ${r.path} ${r.loc}`
    const prev = byKey.get(key)
    if (!prev || (prev.conditional && !r.conditional)) byKey.set(key, r)
  }
  const routes = [...byKey.values()].map(({ via: _via, ...r }) => ({ ...r, conditional: !!r.conditional }))
  return { routes, unresolved: ctx.unresolved, read: [...ctx.read.values()] }
}
