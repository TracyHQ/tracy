// The committed AI quickstart mapping files are what the generator writes (#584): every folder with reviewed mapping
// decisions is mapped again into a temporary folder, and mapping.json must equal the committed file byte for byte.
// A stale file (decisions, declarations or generator changed, file not regenerated) or a hand edit fails here. The
// template under test is the real one; no business data is involved.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const MAPPING = path.join(ROOT, 'packages/cms/tracy-quickstart-tools/ai-quickstart/mapping.mjs')
const QUICKSTARTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/ai-quickstarts')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const INPUTS = [
  'block-store.json',
  'page-recipes.json',
  'draft-report.json',
  'draft-decisions.json',
  'mapping-decisions.json'
]

/** Every AI quickstart folder `<slug>/<platform>/<version>` that holds reviewed mapping decisions. */
function mappedFolders() {
  const found = []
  const walk = (dir, depth) => {
    if (!existsSync(dir)) return
    if (depth === 3) {
      if (existsSync(path.join(dir, 'mapping-decisions.json'))) found.push(dir)
      return
    }
    for (const e of readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1)
  }
  walk(QUICKSTARTS, 0)
  return found
}

test('at least one mapped AI quickstart folder is checked', () => {
  assert.ok(mappedFolders().length >= 1)
})

for (const folder of mappedFolders()) {
  const rel = path.relative(QUICKSTARTS, folder)
  test(`a fresh mapping of ${rel} reproduces the committed mapping.json byte for byte`, (t) => {
    const out = mkdtempSync(path.join(tmpdir(), 'ai-quickstart-mapping-'))
    t.after(() => rmSync(out, { recursive: true, force: true }))
    for (const file of INPUTS) copyFileSync(path.join(folder, file), path.join(out, file))
    execFileSync(process.execPath, [MAPPING, '--contract', path.join(CONTRACTS, rel), '--out', out], {
      stdio: ['ignore', 'ignore', 'pipe']
    })
    const fresh = readFileSync(path.join(out, 'mapping.json'), 'utf8')
    const committed = readFileSync(path.join(folder, 'mapping.json'), 'utf8')
    assert.ok(
      fresh === committed,
      `${rel}/mapping.json differs from a fresh mapping: run mapping.mjs --contract ${path.relative(ROOT, path.join(CONTRACTS, rel))} --out ${path.relative(ROOT, folder)}`
    )
  })
}
