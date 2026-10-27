// canvas-export.mjs — a Claude Design canvas export, read without running it.
//
// The export is one HTML template per page (`<x-dc>` with `{{ path }}` bindings, `<sc-if>`,
// `<sc-for>`) plus one `<script type="text/x-dc">` shared by every page: top-level
// `const NAME = <literal>` dictionaries (one per locale) and a class whose `renderVals()` maps
// them to the template. Opened raw the page is an empty skeleton; the text exists only after
// `support.js` renders it with React, or by reading the literals.
//
// This module does the second thing, deterministically and offline:
//   - `isCanvasExport(html)` / `splitCanvasPage(html)` — detect and take the page apart
//     (title, template, helmet, data script, `state.page`, `get lang()`, data-props defaults).
//   - `parseDataScript(src)` — acorn AST, literal declarations only (the EmDash precedent:
//     object / array / string / number / boolean / null / template-without-expressions). Anything
//     else is listed under `unsupported`, never executed.
//   - `evaluateComponent(parsed, …)` — a pure-subset interpreter over the class: `renderVals()` is
//     walked statement by statement (const/let, if, return, `.map` with arrow functions, spreads,
//     `===`/`||`/`??`/`?:`, `this.state`, `this.props`, class methods and getters). It has no
//     globals: `window`, `document`, `setState`, `fetch` are unresolved and skipped. The single
//     side effect it recognises is `window.location.href = <expr>`, returned as `{ $href }` so a
//     handler such as `go('about')` becomes a real link. Anything it cannot evaluate is recorded in
//     `unresolved` — the binder keeps the `{{ … }}` marker visible instead of inventing a value.
//   - `bindTemplate(template, vals)` — the static render: the same mini-language the runtime uses
//     ({{ path }}, `===`, `!`, literals; `sc-if` with `hint-placeholder-val` as the fallback when
//     the value is unresolved; `sc-for` with `as`), `onX="{{ handler }}"` → `href` when the handler
//     navigates, `<image-slot src>` kept as-is (html-content.mjs turns it into `<img>`).
//
// Nothing here touches the network or the file system. The caller owns I/O.

import * as acorn from 'acorn'
import { JSDOM } from 'jsdom'

const DC_SCRIPT_RE = /<script\b[^>]*\btype=["']text\/x-dc["'][^>]*>([\s\S]*?)<\/script>/i

/** True when the page is a Claude Design canvas export (an `<x-dc>` template + a `text/x-dc` script). */
export function isCanvasExport(html) {
  return DC_SCRIPT_RE.test(String(html)) && /<x-dc[\s>]/i.test(String(html))
}

const decodeEntities = (s) =>
  String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/**
 * Take a canvas page apart. `template` is the `<x-dc>` inner HTML without the `<helmet>`;
 * `helmet` is the helmet inner HTML (styles, font links) that belongs in `<head>`.
 * `props` are the `data-props` defaults (`{ lang: 'ru', showTopbar: true }`).
 */
export function splitCanvasPage(html) {
  const src = String(html)
  const script = src.match(DC_SCRIPT_RE)
  if (!script) throw new Error('not a canvas export: no text/x-dc script')
  const scriptTag = src.slice(script.index, script.index + script[0].indexOf('>') + 1)
  const propsAttr = scriptTag.match(/\bdata-props=["']([^"']*)["']/)
  let props = {}
  if (propsAttr) {
    try {
      const meta = JSON.parse(decodeEntities(propsAttr[1]))
      for (const [k, v] of Object.entries(meta)) if (v && typeof v === 'object' && 'default' in v) props[k] = v.default
    } catch {
      props = {}
    }
  }
  const body = script[1]
  const page = body.match(/state\s*=\s*\{\s*page:\s*['"]([^'"]+)['"]/)?.[1] ?? null
  const locale = body.match(/get lang\(\)\s*\{\s*return\s*['"]([a-zA-Z-]+)['"]/)?.[1]?.toLowerCase() ?? null
  const title = src.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
  const dc = src.match(/<x-dc[^>]*>([\s\S]*?)<\/x-dc>/i)
  let template = dc ? dc[1] : ''
  let helmet = ''
  const hm = template.match(/<helmet[^>]*>([\s\S]*?)<\/helmet>/i)
  if (hm) {
    helmet = hm[1]
    template = template.slice(0, hm.index) + template.slice(hm.index + hm[0].length)
  }
  const cut = body.search(/^\s*class\s+\w+/m)
  return {
    title,
    template,
    helmet,
    script: body,
    dataScript: cut >= 0 ? body.slice(0, cut) : body,
    page,
    locale,
    props
  }
}

// ── literals ──────────────────────────────────────────────────────────────────

class Unsupported extends Error {}

/** Evaluate a literal AST node; throws `Unsupported` for anything that would need execution. */
function literalOf(node) {
  switch (node.type) {
    case 'Literal':
      return node.value
    case 'TemplateLiteral':
      if (node.expressions.length) throw new Unsupported('template with expressions')
      return node.quasis.map((q) => q.value.cooked).join('')
    case 'ArrayExpression':
      return node.elements.map((el) => {
        if (!el) return null
        if (el.type === 'SpreadElement') throw new Unsupported('spread')
        return literalOf(el)
      })
    case 'ObjectExpression': {
      const out = {}
      for (const p of node.properties) {
        if (p.type !== 'Property' || p.computed || p.kind !== 'init') throw new Unsupported(`property ${p.type}`)
        const key = p.key.type === 'Identifier' ? p.key.name : String(p.key.value)
        out[key] = literalOf(p.value)
      }
      return out
    }
    case 'UnaryExpression':
      if (node.operator === '-' && node.argument.type === 'Literal') return -node.argument.value
      throw new Unsupported(`unary ${node.operator}`)
    default:
      throw new Unsupported(node.type)
  }
}

/**
 * Parse the data script. Returns the literal dictionaries (`data`), the class node (if any), the
 * declarations that were not literals (`unsupported`), and the parsed AST for the evaluator.
 */
export function parseDataScript(src) {
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true })
  const data = {}
  const order = []
  const unsupported = []
  let classNode = null
  for (const stmt of ast.body) {
    if (stmt.type === 'ClassDeclaration') {
      if (!classNode) classNode = stmt
      continue
    }
    if (stmt.type !== 'VariableDeclaration') {
      unsupported.push({ node: stmt.type, line: stmt.loc?.start?.line ?? null })
      continue
    }
    for (const d of stmt.declarations) {
      const name = d.id.type === 'Identifier' ? d.id.name : null
      if (!name || !d.init) continue
      try {
        data[name] = literalOf(d.init)
        order.push(name)
      } catch (e) {
        if (!(e instanceof Unsupported)) throw e
        unsupported.push({ name, reason: e.message, line: d.loc?.start?.line ?? null })
      }
    }
  }
  return { ast, data, order, unsupported, classNode }
}

/**
 * Locale dictionaries by naming convention: a top-level literal named `<LOCALE>` (`EN`, `RU`) or
 * `<PREFIX>_<LOCALE>` (`RES_EN`) belongs to that locale. Returns `{ en: { t: EN, res: RES_EN, … } }`
 * — the bare dictionary is `t`, the way the runtime names it. Locales are detected from the names.
 */
export function localeDictionaries(data, locales = null) {
  const found = new Map()
  for (const [name, value] of Object.entries(data)) {
    const m = name.match(/^(?:([A-Z][A-Z0-9]*)_)?([A-Z]{2}(?:_[A-Z]{2})?)$/)
    if (!m || !value || typeof value !== 'object') continue
    const loc = m[2].toLowerCase().replace('_', '-')
    if (locales && !locales.includes(loc)) continue
    const key = m[1] ? m[1].toLowerCase() : 't'
    if (!found.has(loc)) found.set(loc, {})
    found.get(loc)[key] = value
  }
  // A bare `EN` without any `X_EN` companion still counts; a lone `X_EN` needs at least `t`-less use.
  return Object.fromEntries([...found.entries()].filter(([, dict]) => Object.keys(dict).length))
}

// ── the pure-subset evaluator ─────────────────────────────────────────────────

const UNRESOLVED = Symbol('unresolved')
const MAX_STEPS = 200000
const PURE_ARRAY = new Set(['map', 'filter', 'slice', 'join', 'includes', 'indexOf', 'find', 'some', 'every', 'concat', 'flat', 'flatMap', 'reduce', 'at'])
const PURE_STRING = new Set(['toUpperCase', 'toLowerCase', 'trim', 'slice', 'includes', 'startsWith', 'endsWith', 'replace', 'split', 'padStart', 'padEnd', 'at', 'charAt', 'indexOf'])
// Native namespaces the subset may call, by name: pure functions only.
const NATIVE = new Map([
  [Math, new Set(['max', 'min', 'round', 'floor', 'ceil', 'abs'])],
  [Array, new Set(['isArray', 'from'])],
  [Object, new Set(['keys', 'values', 'entries', 'assign', 'fromEntries'])],
  [JSON, new Set(['stringify', 'parse'])]
])
const GLOBALS = { Math, Array, Object, JSON }

class Env {
  constructor(parent = null, vars = {}) {
    this.parent = parent
    this.vars = new Map(Object.entries(vars))
  }
  has(name) {
    return this.vars.has(name) || (this.parent ? this.parent.has(name) : false)
  }
  get(name) {
    if (this.vars.has(name)) return this.vars.get(name)
    return this.parent ? this.parent.get(name) : UNRESOLVED
  }
  set(name, value) {
    this.vars.set(name, value)
  }
  assign(name, value) {
    if (this.vars.has(name)) {
      this.vars.set(name, value)
      return true
    }
    return this.parent ? this.parent.assign(name, value) : false
  }
}

/** A function value: the AST node plus the environment it closed over. Calling it evaluates the body. */
class Closure {
  constructor(node, env, thisVal, interp) {
    this.node = node
    this.env = env
    this.thisVal = thisVal
    this.interp = interp
  }
  call(args, thisVal = this.thisVal) {
    return this.interp.callClosure(this, args, thisVal)
  }
  toFunction() {
    return (...args) => {
      const v = this.call(args)
      return v === UNRESOLVED ? undefined : v
    }
  }
}
export const isClosure = (v) => v instanceof Closure
const RETURN = Symbol('return')

class Interp {
  constructor({ unresolved }) {
    this.unresolved = unresolved
    this.steps = 0
  }
  note(what) {
    if (this.unresolved.length < 500) this.unresolved.push(what)
  }
  tick() {
    if (++this.steps > MAX_STEPS) throw new Error('canvas evaluator: step budget exhausted (a loop the subset cannot bound)')
  }

  // ── expressions ───────────────────────────────────────────────────────────
  expr(node, env, thisVal) {
    this.tick()
    switch (node.type) {
      case 'Literal':
        return node.value
      case 'TemplateLiteral': {
        let out = ''
        for (let i = 0; i < node.quasis.length; i++) {
          out += node.quasis[i].value.cooked
          if (i < node.expressions.length) {
            const v = this.expr(node.expressions[i], env, thisVal)
            if (v === UNRESOLVED) return UNRESOLVED
            out += String(v)
          }
        }
        return out
      }
      case 'Identifier': {
        if (node.name === 'undefined') return undefined
        const v = env.get(node.name)
        if (v === UNRESOLVED) this.note(`identifier ${node.name}`)
        return v
      }
      case 'ThisExpression':
        return thisVal ?? UNRESOLVED
      case 'ArrayExpression': {
        const out = []
        for (const el of node.elements) {
          if (!el) {
            out.push(undefined)
            continue
          }
          if (el.type === 'SpreadElement') {
            const v = this.expr(el.argument, env, thisVal)
            if (!Array.isArray(v)) return UNRESOLVED
            out.push(...v)
            continue
          }
          const v = this.expr(el, env, thisVal)
          out.push(v === UNRESOLVED ? undefined : v)
        }
        return out
      }
      case 'ObjectExpression': {
        const out = {}
        for (const p of node.properties) {
          if (p.type === 'SpreadElement') {
            const v = this.expr(p.argument, env, thisVal)
            if (v && typeof v === 'object') Object.assign(out, v)
            else if (v === UNRESOLVED) this.note('object spread')
            continue
          }
          if (p.type !== 'Property') continue
          let key
          if (p.computed) {
            key = this.expr(p.key, env, thisVal)
            if (key === UNRESOLVED) continue
          } else key = p.key.type === 'Identifier' ? p.key.name : String(p.key.value)
          if (p.kind !== 'init') continue
          const v = p.method ? new Closure(p.value, env, thisVal, this) : this.expr(p.value, env, thisVal)
          if (v === UNRESOLVED) {
            this.note(`property ${key}`)
            continue // the spread base keeps its value; nothing is invented
          }
          out[key] = v
        }
        return out
      }
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        return new Closure(node, env, thisVal, this)
      case 'UnaryExpression': {
        const v = this.expr(node.argument, env, thisVal)
        if (v === UNRESOLVED) return UNRESOLVED
        switch (node.operator) {
          case '!':
            return !v
          case '-':
            return -v
          case '+':
            return +v
          case 'typeof':
            return typeof v
          case 'void':
            return undefined
          default:
            return UNRESOLVED
        }
      }
      case 'BinaryExpression': {
        const l = this.expr(node.left, env, thisVal)
        if (l === UNRESOLVED) return UNRESOLVED
        const r = this.expr(node.right, env, thisVal)
        if (r === UNRESOLVED) return UNRESOLVED
        switch (node.operator) {
          case '===':
            return l === r
          case '!==':
            return l !== r
          case '==':
            // eslint-disable-next-line eqeqeq
            return l == r
          case '!=':
            // eslint-disable-next-line eqeqeq
            return l != r
          case '+':
            return l + r
          case '-':
            return l - r
          case '*':
            return l * r
          case '/':
            return l / r
          case '%':
            return l % r
          case '<':
            return l < r
          case '>':
            return l > r
          case '<=':
            return l <= r
          case '>=':
            return l >= r
          case 'in':
            return r && typeof r === 'object' ? l in r : UNRESOLVED
          default:
            return UNRESOLVED
        }
      }
      case 'LogicalExpression': {
        const l = this.expr(node.left, env, thisVal)
        if (l === UNRESOLVED) return UNRESOLVED
        if (node.operator === '||') return l ? l : this.expr(node.right, env, thisVal)
        if (node.operator === '&&') return l ? this.expr(node.right, env, thisVal) : l
        if (node.operator === '??') return l != null ? l : this.expr(node.right, env, thisVal)
        return UNRESOLVED
      }
      case 'ConditionalExpression': {
        const t = this.expr(node.test, env, thisVal)
        if (t === UNRESOLVED) return UNRESOLVED
        return this.expr(t ? node.consequent : node.alternate, env, thisVal)
      }
      case 'ChainExpression':
        return this.expr(node.expression, env, thisVal)
      case 'MemberExpression': {
        const obj = this.expr(node.object, env, thisVal)
        if (obj === UNRESOLVED) return UNRESOLVED
        if (obj == null) return node.optional ? undefined : UNRESOLVED
        const key = node.computed ? this.expr(node.property, env, thisVal) : node.property.name
        if (key === UNRESOLVED) return UNRESOLVED
        if (obj instanceof ThisValue) return obj.get(key)
        if (typeof obj === 'string' || Array.isArray(obj)) {
          if (key === 'length') return obj.length
          if (typeof key === 'number' || /^\d+$/.test(String(key))) return obj[key]
          return UNRESOLVED // methods are only callable, see CallExpression
        }
        if (typeof obj !== 'object' || NATIVE.has(obj)) return UNRESOLVED
        return Object.hasOwn(obj, key) ? obj[key] : undefined
      }
      case 'CallExpression':
        return this.call(node, env, thisVal)
      case 'SequenceExpression': {
        let v
        for (const e of node.expressions) v = this.expr(e, env, thisVal)
        return v
      }
      case 'AssignmentExpression': {
        if (node.left.type === 'Identifier' && node.operator === '=') {
          const v = this.expr(node.right, env, thisVal)
          env.assign(node.left.name, v)
          return v
        }
        return UNRESOLVED
      }
      default:
        this.note(node.type)
        return UNRESOLVED
    }
  }

  call(node, env, thisVal) {
    const callee = node.callee
    const args = []
    for (const a of node.arguments) {
      if (a.type === 'SpreadElement') {
        const v = this.expr(a.argument, env, thisVal)
        if (!Array.isArray(v)) return UNRESOLVED
        args.push(...v)
      } else {
        const v = this.expr(a, env, thisVal)
        args.push(v === UNRESOLVED ? undefined : v)
      }
    }
    if (callee.type === 'MemberExpression') {
      const obj = this.expr(callee.object, env, thisVal)
      if (obj === UNRESOLVED) return UNRESOLVED
      if (obj == null) return callee.optional || node.optional ? undefined : UNRESOLVED
      const name = callee.computed ? this.expr(callee.property, env, thisVal) : callee.property.name
      if (name === UNRESOLVED) return UNRESOLVED
      if (obj instanceof ThisValue) {
        const m = obj.get(name)
        return m instanceof Closure ? m.call(args, obj) : UNRESOLVED
      }
      if (obj instanceof Closure) return UNRESOLVED
      const native = (v) => (v instanceof Closure ? v.toFunction() : v)
      if (Array.isArray(obj) && PURE_ARRAY.has(name)) return obj[name](...args.map(native))
      if (typeof obj === 'string' && PURE_STRING.has(name)) return obj[name](...args.map(native))
      if (NATIVE.has(obj) && NATIVE.get(obj).has(name)) return obj[name](...args.map(native))
      if (obj && typeof obj === 'object' && obj[name] instanceof Closure) return obj[name].call(args, obj)
      this.note(`call .${name}()`)
      return UNRESOLVED
    }
    if (callee.type === 'Identifier') {
      if (['String', 'Number', 'Boolean'].includes(callee.name) && !env.has(callee.name)) return globalThis[callee.name](args[0])
      const fn = env.get(callee.name)
      if (fn instanceof Closure) return fn.call(args)
      this.note(`call ${callee.name}()`)
      return UNRESOLVED
    }
    const fn = this.expr(callee, env, thisVal)
    if (fn instanceof Closure) return fn.call(args)
    return UNRESOLVED
  }

  callClosure(closure, args, thisVal) {
    const fn = closure.node
    const env = new Env(closure.env)
    fn.params.forEach((p, i) => {
      if (p.type === 'Identifier') env.set(p.name, args[i])
      else if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier')
        env.set(p.left.name, args[i] === undefined ? this.expr(p.right, env, thisVal) : args[i])
      else if (p.type === 'ObjectPattern' && args[i] && typeof args[i] === 'object')
        for (const prop of p.properties) if (prop.type === 'Property' && prop.value.type === 'Identifier') env.set(prop.value.name, args[i][prop.key.name])
      else if (p.type === 'RestElement' && p.argument.type === 'Identifier') env.set(p.argument.name, args.slice(i))
    })
    if (fn.body.type !== 'BlockStatement') return this.expr(fn.body, env, thisVal)
    const r = this.block(fn.body.body, env, thisVal)
    return r ? r.value : undefined
  }

  // ── statements ────────────────────────────────────────────────────────────
  /** Runs statements; returns `{ [RETURN]: true, value }` on return, `undefined` when it falls off the end. */
  block(stmts, env, thisVal) {
    for (const s of stmts) {
      this.tick()
      const r = this.stmt(s, env, thisVal)
      if (r) return r
    }
    return undefined
  }
  stmt(s, env, thisVal) {
    switch (s.type) {
      case 'VariableDeclaration':
        for (const d of s.declarations) {
          const v = d.init ? this.expr(d.init, env, thisVal) : undefined
          if (d.id.type === 'Identifier') env.set(d.id.name, v)
          else if (d.id.type === 'ObjectPattern' && v && typeof v === 'object')
            for (const p of d.id.properties) if (p.type === 'Property' && p.value.type === 'Identifier') env.set(p.value.name, v[p.key.name])
          else if (d.id.type === 'ArrayPattern' && Array.isArray(v))
            d.id.elements.forEach((el, i) => el && el.type === 'Identifier' && env.set(el.name, v[i]))
        }
        return undefined
      case 'ReturnStatement':
        return { [RETURN]: true, value: s.argument ? this.expr(s.argument, env, thisVal) : undefined }
      case 'IfStatement': {
        const t = this.expr(s.test, env, thisVal)
        if (t === UNRESOLVED) return undefined
        if (t) return this.stmt(s.consequent, env, thisVal)
        return s.alternate ? this.stmt(s.alternate, env, thisVal) : undefined
      }
      case 'BlockStatement':
        return this.block(s.body, new Env(env), thisVal)
      case 'TryStatement':
        return this.stmt(s.block, env, thisVal)
      case 'ExpressionStatement': {
        const e = s.expression
        if (e.type === 'AssignmentExpression' && memberPath(e.left) === 'window.location.href') {
          const v = this.expr(e.right, env, thisVal)
          if (v === UNRESOLVED) return undefined
          return { [RETURN]: true, value: { $href: String(v) } }
        }
        this.expr(e, env, thisVal)
        return undefined
      }
      default:
        return undefined
    }
  }
}

function memberPath(node) {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression' && !node.computed) {
    const base = memberPath(node.object)
    return base ? `${base}.${node.property.name}` : null
  }
  return null
}

/** `this` inside the class: state, props, and the methods/getters as closures. */
class ThisValue {
  constructor() {
    this.fields = new Map()
    this.methods = new Map()
    this.getters = new Map()
  }
  get(key) {
    if (this.fields.has(key)) return this.fields.get(key)
    if (this.getters.has(key)) return this.getters.get(key).call([], this)
    if (this.methods.has(key)) return this.methods.get(key)
    return UNRESOLVED
  }
}

/**
 * Evaluate the component for one page: returns `vals` — what `renderVals()` would hand the
 * template — plus what could not be evaluated. `props` are the data-props defaults; `page`
 * overrides `state.page` when given (the same script serves every page).
 */
export function evaluateComponent(parsed, { props = {}, page = null } = {}) {
  const unresolved = []
  const interp = new Interp({ unresolved })
  const root = new Env(null, { ...GLOBALS, ...parsed.data })
  const vals = {}
  const meta = { page: null, locale: null, methods: [] }
  if (!parsed.classNode) return { vals: { ...parsed.data }, unresolved, meta }
  const self = new ThisValue()
  self.fields.set('props', { ...props })
  for (const m of parsed.classNode.body.body) {
    const name = m.key?.type === 'Identifier' ? m.key.name : m.key?.value
    if (!name) continue
    if (m.type === 'PropertyDefinition') {
      const v = m.value ? interp.expr(m.value, root, self) : undefined
      self.fields.set(name, v === UNRESOLVED ? undefined : v)
    } else if (m.type === 'MethodDefinition') {
      const closure = new Closure(m.value, root, self, interp)
      if (m.kind === 'get') self.getters.set(name, closure)
      else if (m.kind === 'method') {
        self.methods.set(name, closure)
        meta.methods.push(name)
      }
    }
  }
  const state = self.fields.get('state')
  if (state && typeof state === 'object') {
    if (page != null) state.page = page
    meta.page = state.page ?? null
  }
  if (self.getters.has('lang')) {
    const l = self.getters.get('lang').call([], self)
    if (typeof l === 'string') meta.locale = l.toLowerCase()
  }
  const render = self.methods.get('renderVals')
  if (render) {
    const r = render.call([], self)
    if (r && typeof r === 'object' && r !== UNRESOLVED) Object.assign(vals, r)
  } else Object.assign(vals, parsed.data)
  return { vals, unresolved, meta }
}

// ── the runtime's binding mini-language ───────────────────────────────────────

const NUMBER_RE = /^-?\d+(\.\d+)?$/
function findTopLevelEquality(expr) {
  let depth = 0
  let q = null
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (q) {
      if (c === q) q = null
      continue
    }
    if (c === '"' || c === "'") q = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0) {
      for (const op of ['===', '!==', '==', '!='])
        if (expr.startsWith(op, i)) return { index: i, op }
    }
  }
  return null
}
function resolvePath(vals, path) {
  let cur = vals
  for (const seg of path.trim().split('.')) {
    if (cur == null || cur === UNRESOLVED) return undefined
    if (cur instanceof Closure) return undefined
    cur = typeof cur === 'object' || typeof cur === 'string' ? cur[seg] : undefined
  }
  return cur === UNRESOLVED ? undefined : cur
}
/** `resolve(vals, "t.hero.h1a")` — the runtime's expression language, verbatim in behaviour. */
export function resolveBinding(vals, src) {
  const expr = String(src).trim()
  if (!expr) return undefined
  if (expr[0] === '(' && expr[expr.length - 1] === ')') {
    let depth = 0
    let whole = true
    for (let i = 0; i < expr.length - 1; i++) {
      if (expr[i] === '(') depth++
      else if (expr[i] === ')' && --depth === 0) whole = false
    }
    if (whole) return resolveBinding(vals, expr.slice(1, -1))
  }
  const eq = findTopLevelEquality(expr)
  if (eq) {
    const l = resolveBinding(vals, expr.slice(0, eq.index))
    const r = resolveBinding(vals, expr.slice(eq.index + eq.op.length))
    // eslint-disable-next-line eqeqeq
    return eq.op === '===' ? l === r : eq.op === '!==' ? l !== r : eq.op === '==' ? l == r : l != r
  }
  if (expr[0] === '!') return !resolveBinding(vals, expr.slice(1))
  if (expr === 'true') return true
  if (expr === 'false') return false
  if (expr === 'null') return null
  if (expr === 'undefined') return undefined
  if (NUMBER_RE.test(expr)) return Number(expr)
  if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr[expr.length - 1] === expr[0]) return expr.slice(1, -1)
  return resolvePath(vals, expr)
}

const HOLE_RE = /\{\{([\s\S]+?)\}\}/g
const WHOLE_RE = /^\s*\{\{([\s\S]+?)\}\}\s*$/

/**
 * Statically render a canvas template with `vals`. Returns a full HTML document string plus the
 * bindings that stayed unresolved (kept visible as `{{ expr }}` so the gap is on the page).
 * `head` is HTML to put in `<head>` (the helmet), `title` the page title.
 */
export function bindTemplate(template, vals, { title = '', head = '', lang = null } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html${lang ? ` lang="${lang}"` : ''}><head><meta charset="utf-8"><title></title>${head}</head><body></body></html>`)
  const { document } = dom.window
  document.title = title
  const src = new JSDOM(`<body>${template}</body>`).window.document.body
  const unresolved = new Map()
  const miss = (expr, where) => {
    const key = expr.trim()
    if (!unresolved.has(key)) unresolved.set(key, { expr: key, where, count: 0 })
    unresolved.get(key).count++
  }
  const value = (scope, expr, where) => {
    const v = resolveBinding(scope, expr)
    if (v === undefined) miss(expr, where)
    return v
  }
  const interpolate = (raw, scope, where) => {
    const whole = raw.match(WHOLE_RE)
    if (whole) return value(scope, whole[1], where)
    return raw.replace(HOLE_RE, (m, e) => {
      const v = value(scope, e, where)
      return v === undefined ? m : v == null || typeof v === 'boolean' ? '' : String(v)
    })
  }
  const bind = (node, scope, out) => {
    if (node.nodeType === 3) {
      const txt = node.nodeValue
      if (!txt.includes('{{')) {
        if (txt.trim()) out.appendChild(document.createTextNode(txt))
        else if (txt.includes(' ') || txt.includes('\n')) out.appendChild(document.createTextNode(' '))
        return
      }
      const parts = txt.split(HOLE_RE)
      for (let i = 0; i < parts.length; i++) {
        if (!(i & 1)) {
          if (parts[i]) out.appendChild(document.createTextNode(parts[i]))
          continue
        }
        const v = value(scope, parts[i], 'text')
        if (v === undefined) out.appendChild(document.createTextNode(`{{ ${parts[i].trim()} }}`))
        else if (v === null || typeof v === 'boolean') continue
        else out.appendChild(document.createTextNode(String(v)))
      }
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.tagName.toLowerCase()
    if (tag === 'sc-for') {
      const listExpr = (node.getAttribute('list') || '').replace(/^\s*\{\{|\}\}\s*$/g, '')
      const as = node.getAttribute('as') || 'item'
      const list = value(scope, listExpr, 'sc-for')
      if (!Array.isArray(list)) return
      list.forEach((item, i) => {
        const sub = { ...scope, [as]: item, $index: i }
        for (const c of node.childNodes) bind(c, sub, out)
      })
      return
    }
    if (tag === 'sc-if') {
      const expr = (node.getAttribute('value') || '').replace(/^\s*\{\{|\}\}\s*$/g, '')
      let v = resolveBinding(scope, expr)
      if (v === undefined) {
        miss(expr, 'sc-if')
        const hint = node.getAttribute('hint-placeholder-val')
        v = hint != null ? resolveBinding(scope, hint.replace(/^\s*\{\{|\}\}\s*$/g, '')) : false
      }
      if (!v) return
      for (const c of node.childNodes) bind(c, scope, out)
      return
    }
    if (tag === 'sc-else' || tag === 'script' || tag === 'template') return
    const el = document.createElement(tag)
    for (const { name, value: raw } of node.attributes) {
      if (name.startsWith('hint-') || name.startsWith('style-') || name === 'sc-name' || name === 'data-dc-tpl') continue
      if (/^on[a-z]/i.test(name)) {
        const handler = raw.includes('{{') ? interpolate(raw, scope, name) : undefined
        if (handler instanceof Closure) {
          const r = handler.call([undefined])
          if (r && typeof r === 'object' && typeof r.$href === 'string') {
            if (tag === 'a') el.setAttribute('href', r.$href)
            else el.setAttribute('data-href', r.$href)
          }
        }
        continue
      }
      const v = raw.includes('{{') ? interpolate(raw, scope, name) : raw
      if (v === undefined) {
        el.setAttribute(name, raw)
        continue
      }
      if (v === null || v === false) continue
      if (v === true) el.setAttribute(name, '')
      else el.setAttribute(name, typeof v === 'object' ? '' : String(v))
    }
    for (const c of node.childNodes) bind(c, scope, el)
    out.appendChild(el)
  }
  for (const c of src.childNodes) bind(c, vals, document.body)
  return { html: dom.serialize(), unresolved: [...unresolved.values()] }
}
