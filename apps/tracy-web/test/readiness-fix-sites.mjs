/**
 * Test helper: every place a Template Customization Question Readiness rule writes a `fix`, read
 * statically from the rule sources, as the prompt on /ops would carry it for each platform: the fix
 * text and the owner (`owner` property, a spread `...(cond ? { owner } : {})`, `f.owner(...)` of the
 * findings helper, or the rule's default). Conditions that are not about the platform are tried both
 * ways, together for the fix and the owner of one object, so a `fix: cond ? A : B` and an
 * `...(cond ? { owner } : {})` stay paired.
 *
 * A text the source cannot know (a value read at run time) reads as `…`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'acorn'

import { RULES } from '../src/lib/template-customization-question-readiness/index.js'

const LIBRARY = fileURLToPath(
  new URL('../src/lib/template-customization-question-readiness/', import.meta.url)
)
const RULES_DIR = path.join(LIBRARY, 'rules')
const UNKNOWN = '…'

/** One parsed module, by absolute path. */
const modules = new Map()
function moduleOf(file) {
  if (!modules.has(file)) {
    const source = readFileSync(file, 'utf8')
    modules.set(file, { file, source, ast: parse(source, { ecmaVersion: 'latest', sourceType: 'module' }) })
  }
  return modules.get(file)
}

/** Every node of a tree, depth first; each gets `parent` on the way. */
function* walk(node, parent = null) {
  if (!node || typeof node.type !== 'string') return
  if (parent && !node.parent) Object.defineProperty(node, 'parent', { value: parent, enumerable: false })
  yield node
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue
    if (Array.isArray(value)) for (const v of value) yield* walk(v, node)
    else if (value && typeof value.type === 'string') yield* walk(value, node)
  }
}

const PLATFORMS = ['joomla', 'wordpress', 'emdash']

/** What a test says about the platform: true, false, or null when it does not decide. */
function platformTruth(node, platform) {
  if (!node) return null
  if (node.type === 'LogicalExpression') {
    const l = platformTruth(node.left, platform)
    const r = platformTruth(node.right, platform)
    if (node.operator === '&&') return l === false || r === false ? false : l && r ? true : null
    if (node.operator === '||')
      return l === true || r === true ? true : l === false && r === false ? false : null
    return null
  }
  if (node.type === 'UnaryExpression' && node.operator === '!') {
    const v = platformTruth(node.argument, platform)
    return v === null ? null : !v
  }
  if (node.type === 'BinaryExpression' && ['===', '!=='].includes(node.operator)) {
    const named = (n) =>
      (n.type === 'Identifier' && n.name === 'platform') ||
      (n.type === 'MemberExpression' && !n.computed && n.property.name === 'platform')
    const [p, lit] = named(node.left) ? [node.left, node.right] : [node.right, node.left]
    if (named(p) && lit.type === 'Literal') return (platform === lit.value) === (node.operator === '===')
  }
  if (node.type === 'Identifier' && node.name === 'emdash') return platform === 'emdash'
  return null
}

/** Whether a statement always leaves its function (a return or a throw, last). */
const leaves = (st) =>
  st?.type === 'ReturnStatement' ||
  st?.type === 'ThrowStatement' ||
  (st?.type === 'BlockStatement' && leaves(st.body.at(-1)))

/**
 * Whether code at `node` can run on `platform`: no enclosing branch, platform-named function
 * (`joomla(…)`, `wordpressOrphans`) or earlier platform return rules it out.
 */
export function reachable(node, platform) {
  for (let child = node, at = node.parent; at; child = at, at = at.parent) {
    if (at.type === 'IfStatement' || at.type === 'ConditionalExpression') {
      const v = platformTruth(at.test, platform)
      if (v === false && child === at.consequent) return false
      if (v === true && child === at.alternate) return false
    }
    if (at.type === 'LogicalExpression' && at.operator === '&&' && child === at.right)
      if (platformTruth(at.left, platform) === false) return false
    if (/Function/.test(at.type)) {
      const name = at.id?.name ?? (at.parent?.type === 'VariableDeclarator' ? at.parent.id.name : '')
      const named = PLATFORMS.find((p) => name.toLowerCase().startsWith(p))
      if (named && named !== platform) return false
    }
    if (at.type === 'BlockStatement' || at.type === 'Program')
      for (const st of at.body) {
        if (st === child) break
        if (st.type === 'IfStatement' && platformTruth(st.test, platform) === true && leaves(st.consequent))
          return false
      }
  }
  return true
}

/** The expression a name stands for in a module: a const, or an import followed to its module. */
function resolve(mod, name) {
  for (const node of walk(mod.ast)) {
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.id.name === name &&
      node.init
    )
      return { mod, node: node.init }
    if (node.type === 'ImportDeclaration' && node.source.value.startsWith('.'))
      for (const s of node.specifiers)
        if (s.type === 'ImportSpecifier' && s.local.name === name) {
          const target = path.resolve(path.dirname(mod.file), node.source.value)
          return resolve(moduleOf(target), s.imported.name)
        }
  }
  return null
}

/** Whether an expression names the platform (`platform`, `context.release.platform`, `langs.platform`). */
const isPlatform = (node, env) =>
  (node.type === 'Identifier' && (node.name === 'platform' || env.aliases.has(node.name))) ||
  (node.type === 'MemberExpression' && !node.computed && node.property.name === 'platform')

const src = (mod, node) => mod.source.slice(node.start, node.end)

/** A condition, true or false: about the platform when it can be, else the assignment being tried. */
function truth(mod, node, env) {
  const decided = platformTruth(node, env.platform)
  if (decided !== null) return decided
  // A const standing for a platform test (`const emdash = platform === 'emdash'`).
  if (node.type === 'Identifier') {
    const found = resolve(mod, node.name)
    const init = found?.node
    if (init && init.type !== 'Identifier') {
      const v = platformTruth(init, env.platform)
      if (v !== null) return v
    }
  }
  if (node.type === 'BinaryExpression' && ['===', '!=='].includes(node.operator)) {
    const [p, lit] = isPlatform(node.left, env) ? [node.left, node.right] : [node.right, node.left]
    if (isPlatform(p, env) && lit.type === 'Literal')
      return (env.platform === lit.value) === (node.operator === '===')
  }
  if (node.type === 'UnaryExpression' && node.operator === '!') return !truth(mod, node.argument, env)
  const key = src(mod, node)
  env.seen.add(key)
  return env.conds.get(key) ?? false
}

/** Every string an expression may be, for this platform and assignment. */
function strings(mod, node, env, depth = 0) {
  if (!node || depth > 12) return [UNKNOWN]
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? [node.value] : [UNKNOWN]
    case 'TemplateLiteral': {
      let out = ['']
      node.quasis.forEach((q, i) => {
        out = out.map((s) => s + q.value.cooked)
        if (i < node.expressions.length) {
          const parts = strings(mod, node.expressions[i], env, depth + 1)
          out = out.flatMap((s) => parts.map((p) => s + p))
        }
      })
      return out
    }
    case 'ConditionalExpression':
      return strings(mod, truth(mod, node.test, env) ? node.consequent : node.alternate, env, depth + 1)
    case 'LogicalExpression':
      return [...strings(mod, node.left, env, depth + 1), ...strings(mod, node.right, env, depth + 1)]
    case 'BinaryExpression':
      if (node.operator === '+') {
        const l = strings(mod, node.left, env, depth + 1)
        const r = strings(mod, node.right, env, depth + 1)
        return l.flatMap((a) => r.map((b) => a + b))
      }
      return [UNKNOWN]
    case 'Identifier': {
      if (isPlatform(node, env)) return [env.platform]
      const found = resolve(mod, node.name)
      return found ? strings(found.mod, found.node, env, depth + 1) : [UNKNOWN]
    }
    case 'CallExpression': {
      if (node.callee.type !== 'Identifier') return [UNKNOWN]
      const found = resolve(mod, node.callee.name)
      const fn = found?.node
      if (!fn || fn.type !== 'ArrowFunctionExpression' || fn.body.type === 'BlockStatement') return [UNKNOWN]
      // A parameter given the platform stands for it inside the body; any other is unknown.
      const aliases = new Set(env.aliases)
      fn.params.forEach((p, i) => {
        if (p.type === 'Identifier' && node.arguments[i] && isPlatform(node.arguments[i], env))
          aliases.add(p.name)
      })
      return strings(found.mod, fn.body, { ...env, aliases }, depth + 1)
    }
    default:
      return [UNKNOWN]
  }
}

/** The owner an object literal gives, or null when it gives none. */
function ownerOf(mod, obj, env) {
  let owner = null
  for (const p of obj.properties) {
    if (p.type === 'Property' && !p.computed && p.key.name === 'owner')
      owner = strings(mod, p.value, env).find((o) => o !== UNKNOWN) ?? owner
    if (p.type === 'SpreadElement' && p.argument.type === 'ConditionalExpression') {
      const branch = truth(mod, p.argument.test, env) ? p.argument.consequent : p.argument.alternate
      if (branch.type === 'ObjectExpression') owner = ownerOf(mod, branch, env) ?? owner
    }
  }
  return owner
}

const ruleIdOfFile = (name) => {
  const m = /^([a-z]+)-(\d+)-/.exec(name)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null
}

/**
 * Every fix site of every rule, for each platform the rule runs on and each assignment of the
 * conditions it depends on.
 * @returns {{ rule: string, file: string, line: number, platform: string, fix: string, owner: string }[]}
 */
export function fixSites() {
  const byId = new Map(RULES.map((r) => [r.id, r]))
  const sites = []
  for (const name of readdirSync(RULES_DIR)
    .filter((n) => n.endsWith('.js'))
    .sort()) {
    const rule = byId.get(ruleIdOfFile(name) ?? '')
    if (!rule) continue
    const mod = moduleOf(path.join(RULES_DIR, name))
    // `f.owner('contract')` of the findings helper: a possible owner of the one `f.outcome` fix.
    const findingsOwners = [...walk(mod.ast)]
      .filter(
        (n) =>
          n.type === 'CallExpression' &&
          n.callee.type === 'MemberExpression' &&
          n.callee.property.name === 'owner' &&
          n.arguments[0]?.type === 'Literal'
      )
      .map((n) => n.arguments[0].value)
    for (const obj of walk(mod.ast)) {
      if (obj.type !== 'ObjectExpression') continue
      const fixProp = obj.properties.find((p) => p.type === 'Property' && !p.computed && p.key.name === 'fix')
      if (!fixProp) continue
      const isOutcome = (() => {
        for (const n of walk(mod.ast))
          if (
            n.type === 'CallExpression' &&
            n.callee.type === 'MemberExpression' &&
            n.callee.property.name === 'outcome' &&
            n.arguments[0] === obj
          )
            return true
        return false
      })()
      for (const platform of rule.platforms) {
        if (!reachable(obj, platform)) continue
        // Find the conditions this object depends on, then try every assignment of them.
        const probe = { platform, aliases: new Set(), conds: new Map(), seen: new Set() }
        strings(mod, fixProp.value, probe)
        ownerOf(mod, obj, probe)
        const keys = [...probe.seen].slice(0, 4)
        for (let mask = 0; mask < 2 ** keys.length; mask++) {
          const conds = new Map(keys.map((k, i) => [k, Boolean(mask & (1 << i))]))
          const env = { platform, aliases: new Set(), conds, seen: new Set() }
          const owners = isOutcome ? [rule.owner, ...findingsOwners] : [ownerOf(mod, obj, env) ?? rule.owner]
          const line = mod.source.slice(0, obj.start).split('\n').length
          for (const fix of strings(mod, fixProp.value, env))
            for (const owner of new Set(owners))
              sites.push({ rule: rule.id, file: name, line, platform, fix, owner })
        }
      }
    }
  }
  return sites
}
