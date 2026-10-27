// The package stands alone (ADR 0036 decision 2): Tracy imports it by name, never the reverse. A relative import
// that leaves the package root, or a bare import of a package it does not declare, loads in the TCH checkout and
// fails in the tracy-web image and in a clean clone of the public repository.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
// Optional ones (`impit`) are declared too; their importers must survive the package being absent.
const DEPS = new Set([...Object.keys(PKG.dependencies ?? {}), ...Object.keys(PKG.optionalDependencies ?? {})])

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.m?js$/.test(n) ? [p] : []
  })
}

/** Every literal module specifier: static imports, re-exports and `import('…')`. Comments are not code. */
function specifiers(source) {
  const found = []
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return
    if (/^(Import|Export(All|Named)?)Declaration$|^ImportExpression$/.test(node.type)) {
      if (node.source?.type === 'Literal' && typeof node.source.value === 'string')
        found.push(node.source.value)
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
  return found
}

/** The package name of a bare specifier: `hono/body-limit` → `hono`, `@a/b/c` → `@a/b`. */
const packageOf = (spec) =>
  spec
    .split('/')
    .slice(0, spec.startsWith('@') ? 2 : 1)
    .join('/')

test('no module under src/ or domain/ imports outside the package or an undeclared npm package', () => {
  const bad = []
  for (const dir of ['src', 'domain']) {
    for (const file of files(join(ROOT, dir))) {
      const where = relative(ROOT, file)
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('.')) {
          const target = resolve(dirname(file), spec)
          if (relative(ROOT, target).startsWith('..')) bad.push(`${where} → ${spec}`)
          else if (!existsSync(target)) bad.push(`${where} → ${spec} (no such file)`)
        } else if (!spec.startsWith('node:') && packageOf(spec) !== PKG.name && !DEPS.has(packageOf(spec))) {
          bad.push(`${where} → ${spec} (not in dependencies)`)
        }
      }
    }
  }
  assert.deepEqual(bad, [])
})

test('the scan sees static, re-exported and dynamic imports, and not the ones in comments', () => {
  const source = `import a from './a.js'\nexport { b } from '../b.js'\nexport * from 'c'\nconst d = await import('d/e')\n/** @type {import('pg').Pool} */\n// import x from 'y'\n`
  assert.deepEqual(specifiers(source), ['./a.js', '../b.js', 'c', 'd/e'])
})
