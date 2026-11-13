// The new build path has no repair pass and no site check inside a build (ADR 0047, decisions 1 and 3; #591): nothing
// the chain's files import, directly or through any module they reach, is a repair pass, a repair agent or a site check
// module, so no build can start a repair agent or let a check decide its outcome.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const ROOTS = ['step-chain-steps.js', 'sites/brief-engines/step-chain.js']
const BANNED = [/write-step-nine/, /repair-pass\//, /repair-agent/, /(^|\/)site-check\//]

/** Every relative module a file imports or re-exports, statically or dynamically. */
const specifiersOf = (source) =>
  [
    ...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+'([^']+)'/g),
    ...source.matchAll(/(?:^|\n)\s*import\s+'([^']+)'/g),
    ...source.matchAll(/\bimport\(\s*'([^']+)'\s*\)/g)
  ].map((m) => m[1])

/** The whole graph of local modules reachable from `roots`: path relative to src, and who imported it first. */
async function reachable(roots) {
  const seen = new Map(roots.map((r) => [path.join(SRC, r), null]))
  const queue = [...seen.keys()]
  while (queue.length) {
    const file = queue.shift()
    const source = await readFile(file, 'utf8')
    for (const spec of specifiersOf(source)) {
      if (!spec.startsWith('.')) continue
      const next = path.resolve(path.dirname(file), spec)
      if (seen.has(next)) continue
      seen.set(next, file)
      queue.push(next)
    }
  }
  return new Map(
    [...seen].map(([file, from]) => [path.relative(SRC, file), from && path.relative(SRC, from)])
  )
}

test('no module reachable from the chain is a repair pass, a repair agent or a site check', async () => {
  const graph = await reachable(ROOTS)
  assert.ok(graph.size > 20, `the walk follows the imports (${graph.size} modules)`)
  for (const [file, from] of graph)
    for (const banned of BANNED)
      assert.ok(!banned.test(file), `${file} is reachable from the chain (via ${from})`)
})

test('the walk sees through re-exports and dynamic imports', () => {
  assert.deepEqual(
    specifiersOf(
      "import a from './a.js'\nimport {\n  b,\n  c\n} from './b.js'\nexport { d } from './d.js'\nconst e = await import('./e.js')\nimport './f.js'"
    ).sort(),
    ['./a.js', './b.js', './d.js', './e.js', './f.js']
  )
})

test('the Write step of the chain is the write step alone', async () => {
  const graph = await reachable(ROOTS)
  assert.ok(graph.has(path.join('write-step', 'write-step.js')))
})
