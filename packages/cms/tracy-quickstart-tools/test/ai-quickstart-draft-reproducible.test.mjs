// The committed AI quickstart declarations are what the generator writes (#583): every folder with reviewed
// decisions is drafted again into a temporary folder, and the block store, the page recipes and the draft report
// must equal the committed files byte for byte. A stale file (decisions or generator changed, files not
// regenerated) or a hand edit fails here. The template under test is the real one; no business data is involved.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const DRAFT = path.join(ROOT, 'packages/cms/tracy-quickstart-tools/ai-quickstart/draft.mjs')
const QUICKSTARTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/ai-quickstarts')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const GENERATED = ['block-store.json', 'page-recipes.json', 'draft-report.json']
const INPUTS = ['draft-decisions.json', 'measured-limits.json']

/** Every AI quickstart folder `<slug>/<platform>/<version>` that holds reviewed decisions. */
function draftedFolders() {
  const found = []
  const walk = (dir, depth) => {
    if (!existsSync(dir)) return
    if (depth === 3) {
      if (existsSync(path.join(dir, 'draft-decisions.json'))) found.push(dir)
      return
    }
    for (const e of readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1)
  }
  walk(QUICKSTARTS, 0)
  return found
}

test('at least one drafted AI quickstart folder is checked', () => {
  assert.ok(draftedFolders().length >= 1)
})

for (const folder of draftedFolders()) {
  const rel = path.relative(QUICKSTARTS, folder)
  test(`a fresh draft of ${rel} reproduces the committed files byte for byte`, (t) => {
    const out = mkdtempSync(path.join(tmpdir(), 'ai-quickstart-draft-'))
    t.after(() => rmSync(out, { recursive: true, force: true }))
    for (const file of INPUTS)
      if (existsSync(path.join(folder, file))) copyFileSync(path.join(folder, file), path.join(out, file))
    execFileSync(process.execPath, [DRAFT, '--contract', path.join(CONTRACTS, rel), '--out', out], {
      stdio: ['ignore', 'ignore', 'pipe']
    })
    for (const file of GENERATED) {
      const fresh = readFileSync(path.join(out, file), 'utf8')
      const committed = readFileSync(path.join(folder, file), 'utf8')
      assert.ok(
        fresh === committed,
        `${rel}/${file} differs from a fresh draft: run draft.mjs --contract ${path.relative(ROOT, path.join(CONTRACTS, rel))} --out ${path.relative(ROOT, folder)}`
      )
    }
  })
}
