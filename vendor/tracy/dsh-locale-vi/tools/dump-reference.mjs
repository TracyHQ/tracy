/**
 * Dump the upstream reference strings for translation work.
 *
 * Writes one file per namespace under `tools/en/`, and — when `--bilingual` is
 * passed — the English beside the Simplified Chinese under `tools/ref/`. Both
 * directories are gitignored: they hold upstream's copy, which this repository
 * does not redistribute.
 *
 * The bilingual form exists because the English is sometimes ambiguous where the
 * Chinese is not. Settings → Models `apply` is 保存 — "Lưu", not "áp dụng".
 *
 * Usage:
 *   node tools/dump-reference.mjs                    # tools/en/<ns>.json
 *   node tools/dump-reference.mjs --bilingual        # also tools/ref/<ns>.json
 *   node tools/dump-reference.mjs --bilingual chat   # just one namespace
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractEnglish } from './lib/extract-en.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const argv = process.argv.slice(2)
const bilingual = argv.includes('--bilingual')
const only = argv.filter((arg) => !arg.startsWith('--'))

const bundlesPath = join(root, 'tools', 'bundles.json')
if (!existsSync(bundlesPath)) {
  console.error('missing tools/bundles.json — run: npm run scan')
  process.exit(2)
}
const bundles = JSON.parse(readFileSync(bundlesPath, 'utf8'))

const { dicts: english, warnings } = extractEnglish(bundles, 'en')
const { dicts: chinese } = bilingual ? extractEnglish(bundles, 'zh') : { dicts: {} }

const wanted = only.length > 0 ? only : Object.keys(english)
const missing = wanted.filter((ns) => !(ns in english))
if (missing.length > 0) {
  console.error(`unknown namespace(s): ${missing.join(', ')}`)
  console.error(`available: ${Object.keys(english).sort().join(', ')}`)
  process.exit(2)
}

const enDir = join(root, 'tools', 'en')
mkdirSync(enDir, { recursive: true })
for (const ns of wanted) {
  writeFileSync(join(enDir, `${ns}.json`), `${JSON.stringify(english[ns], null, 2)}\n`, 'utf8')
}
console.log(`wrote ${wanted.length} namespace file(s) to tools/en`)

if (bilingual) {
  const refDir = join(root, 'tools', 'ref')
  mkdirSync(refDir, { recursive: true })
  for (const ns of wanted) {
    const paired = Object.fromEntries(Object.keys(english[ns]).sort().map((key) => [
      key,
      { en: english[ns][key], zh: chinese[ns]?.[key] ?? null },
    ]))
    writeFileSync(join(refDir, `${ns}.json`), `${JSON.stringify(paired, null, 2)}\n`, 'utf8')
  }
  console.log(`wrote ${wanted.length} bilingual file(s) to tools/ref`)
}

if (warnings.length > 0) {
  console.log(`\nextraction warnings (${warnings.length}):`)
  for (const line of warnings) console.log(`  ${line}`)
}
