#!/usr/bin/env node
// Extract the data objects of a Claude Design canvas export without executing its script.
//
//   node tools/extract.mjs <source-dir> <out-file.json>
//
// The `text/x-dc` script declares top-level `const NAME = <literal>` objects followed by a class
// with the page logic. Only literal declarations are read: the AST is walked and evaluated for
// object/array/string/number/boolean/null/template-without-expressions nodes. Anything else
// (calls, identifiers, spreads, functions) is recorded under `unsupported` and skipped -- the
// script never runs, so nothing in the source can reach the host. One data script is expected to
// be shared by every page; the tool checks that and refuses to silently pick one.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import * as acorn from 'acorn'

const [, , srcArg, outArg] = process.argv
if (!srcArg || !outArg) {
  console.error('usage: extract.mjs <source-dir> <out-file.json>')
  process.exit(2)
}
const SRC = path.resolve(srcArg)

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (name.endsWith('.html')) acc.push(full)
  }
  return acc
}

class Unsupported extends Error {}
function literal(node) {
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
        return literal(el)
      })
    case 'ObjectExpression': {
      const out = {}
      for (const p of node.properties) {
        if (p.type !== 'Property' || p.computed || p.kind !== 'init')
          throw new Unsupported(`property ${p.type}`)
        const key = p.key.type === 'Identifier' ? p.key.name : String(p.key.value)
        out[key] = literal(p.value)
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

const result = {
  source: SRC,
  generatedAt: new Date().toISOString(),
  scripts: {},
  data: null,
  pages: {},
  unsupported: []
}
const scriptsByHash = new Map()
for (const file of walk(SRC).sort()) {
  const rel = path.relative(SRC, file)
  const html = readFileSync(file, 'utf8')
  const m = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) continue
  const body = m[1]
  const st = body.match(/state\s*=\s*\{\s*page:\s*'([a-z0-9-]+)'/)
  const lang = body.match(/get lang\(\)\s*\{\s*return\s*'([a-z-]+)'/)
  result.pages[rel] = { page: st?.[1] ?? null, locale: lang?.[1] ?? null }
  // Data part only: everything before the class. Hash it to prove all pages share one.
  const cut = body.search(/^\s*class\s+\w+/m)
  const dataSrc = cut >= 0 ? body.slice(0, cut) : body
  const hash = createHash('sha256').update(dataSrc).digest('hex')
  if (!scriptsByHash.has(hash)) scriptsByHash.set(hash, { hash, firstFile: rel, files: [], src: dataSrc })
  scriptsByHash.get(hash).files.push(rel)
}

for (const s of scriptsByHash.values()) {
  const ast = acorn.parse(s.src, { ecmaVersion: 2022, sourceType: 'script' })
  const data = {}
  for (const stmt of ast.body) {
    if (stmt.type !== 'VariableDeclaration') {
      result.unsupported.push({
        script: s.hash.slice(0, 12),
        node: stmt.type,
        line: stmt.loc?.start?.line ?? null
      })
      continue
    }
    for (const d of stmt.declarations) {
      const name = d.id.name
      try {
        data[name] = literal(d.init)
      } catch (e) {
        if (!(e instanceof Unsupported)) throw e
        result.unsupported.push({ script: s.hash.slice(0, 12), name, reason: e.message })
      }
    }
  }
  // Relative asset paths are written from the page's own directory (`./img/x.png` at the root,
  // `../img/x.png` under RU/). Normalise them to source-root-relative so the same data extracted
  // from two directories compares equal and downstream tools get one path per file.
  const baseDir = path.dirname(s.firstFile)
  const normalise = (v) => {
    if (typeof v === 'string') {
      return /^\.{1,2}\//.test(v) ? path.normalize(path.join(baseDir, v)).split(path.sep).join('/') : v
    }
    if (Array.isArray(v)) return v.map(normalise)
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalise(x)]))
    return v
  }
  const normal = normalise(data)
  result.scripts[s.hash] = { files: s.files, keys: Object.keys(normal), bytes: s.src.length }
  if (result.data === null) result.data = normal
  else if (JSON.stringify(result.data) !== JSON.stringify(normal)) {
    result.dataByScript = { ...result.dataByScript, [s.hash]: normal }
  }
}

const logicalDatasets = 1 + Object.keys(result.dataByScript ?? {}).length
if (logicalDatasets !== 1) {
  console.error(
    `expected ONE shared dataset, found ${logicalDatasets} that differ after path normalisation; see dataByScript{}`
  )
}
writeFileSync(path.resolve(outArg), JSON.stringify(result, null, '\t') + '\n')
console.log(
  JSON.stringify({
    scripts: scriptsByHash.size,
    datasets: logicalDatasets,
    keys: result.data ? Object.keys(result.data) : [],
    pages: Object.keys(result.pages).length,
    unsupported: result.unsupported.length
  })
)
process.exit(logicalDatasets === 1 ? 0 : 1)
