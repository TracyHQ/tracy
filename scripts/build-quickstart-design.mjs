#!/usr/bin/env node
/**
 * Write the resolved tokens of every contract profile that wears its quickstart's OWN look.
 *
 *   node scripts/build-quickstart-design.mjs          # rewrite each `<version>.design.json` whose design is `source: "quickstart"`
 *   node scripts/build-quickstart-design.mjs --check  # exit 1 when one is stale; writes nothing
 *
 * WHY THE VALUES ARE COPIED INTO THE PROFILE. A quickstart like Tracy Business declares its 56 tokens
 * in a file of its own (`tokensFrom`), often over primitives (`--bg: var(--tb-paper)`). The build
 * (dsh image) and tracy-web both read the profile trees — the seeder copies them into
 * `data/quickstart-contracts/`, the tracy-web image into `src/contracts/` — but neither carries that
 * token file. So the profile carries the resolved values, and the contracts gate
 * (`scripts/lib/contract-design.mjs`) holds them equal to their source.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { TOKEN_NAMES } from '../packages/cms/tracy-wordpress-theme/lib/variation.mjs'
import { quickstartTokens } from './lib/contract-design.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TREES = [
  'packages/cms/tracy-joomla-quickstart/contracts',
  'packages/cms/tracy-wordpress-quickstart/contracts'
]
const check = process.argv.includes('--check')

/** @param {string} dir @returns {string[]} */
function designFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...designFiles(full))
    else if (entry.endsWith('.design.json')) out.push(full)
  }
  return out
}

const stale = []
let written = 0
for (const tree of TREES)
  for (const file of designFiles(path.join(ROOT, tree))) {
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    if (doc?.design?.source !== 'quickstart') continue
    const next = { ...doc, tokens: quickstartTokens(path.join(ROOT, doc.design.tokensFrom), TOKEN_NAMES) }
    const text = `${JSON.stringify(next, null, 2)}\n`
    if (text === readFileSync(file, 'utf8')) continue
    if (check) stale.push(path.relative(ROOT, file))
    else {
      writeFileSync(file, text)
      written += 1
    }
  }
if (stale.length > 0) {
  console.error(
    `quickstart design: ${stale.length} file(s) differ from their token source\n  ${stale.join('\n  ')}\n  Run node scripts/build-quickstart-design.mjs.`
  )
  process.exit(1)
}
console.log(
  check
    ? 'quickstart design: every file matches its token source.'
    : `quickstart design: wrote ${written} file(s).`
)
